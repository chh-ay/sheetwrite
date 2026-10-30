//! Formula sources, the cells awaiting recompute, and the cached dependency graph.
//!
//! [`SheetFormulas`] owns one sheet's formula entries and its dirty state.
//! [`FormulaGraph`] owns the workbook dependency index and keeps it in step
//! with entry replacements, dropping it for rewrites it cannot patch.

use std::collections::hash_set;

use rustc_hash::{FxHashMap, FxHashSet};

use crate::eval::{build_dep_index, DepIndex};
use crate::memory::{
    StoreMemoryStats, DEPENDENCY_EDGES, DEPENDENCY_NODES, FORMULAS, SHEET_INDEXES_METADATA,
};
use crate::sheet::SheetData;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};
use crate::types::{AbsCellKey, CellKey, FormulaEntry};

/// `FxHashSet::clear` walks every retained bucket, so a dirty set inflated by
/// one giant paste is dropped instead of cleared; otherwise it would tax every
/// later single-cell transaction.
const RETAINED_DIRTY_CAPACITY: usize = 4096;

/// Bulk writes stay range-scoped without letting many disjoint edits grow
/// per-sheet dirty metadata; overflow merges into conservative rectangles.
const MAX_DIRTY_RECTS: usize = 64;

/// Inclusive source coordinates; rectangles never enumerate logical sheet area.
#[derive(Clone, Copy)]
pub(crate) struct DirtyRect {
    pub(crate) row_start: u32,
    pub(crate) col_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
}

impl DirtyRect {
    pub(crate) fn new(
        row_start: usize,
        col_start: usize,
        row_end: usize,
        col_end: usize,
    ) -> Option<Self> {
        if row_start > row_end || col_start > col_end {
            return None;
        }

        Some(Self {
            row_start: row_start.try_into().ok()?,
            col_start: col_start.try_into().ok()?,
            row_end: row_end.min(u32::MAX as usize) as u32,
            col_end: col_end.min(u32::MAX as usize) as u32,
        })
    }

    fn cell(cell: CellKey) -> Self {
        Self {
            row_start: cell.0,
            col_start: cell.1,
            row_end: cell.0,
            col_end: cell.1,
        }
    }

    pub(crate) fn contains(self, cell: CellKey) -> bool {
        self.row_start <= cell.0
            && cell.0 <= self.row_end
            && self.col_start <= cell.1
            && cell.1 <= self.col_end
    }

    pub(crate) fn intersects(self, other: Self) -> bool {
        self.row_start <= other.row_end
            && other.row_start <= self.row_end
            && self.col_start <= other.col_end
            && other.col_start <= self.col_end
    }

    fn union(self, other: Self) -> Self {
        Self {
            row_start: self.row_start.min(other.row_start),
            col_start: self.col_start.min(other.col_start),
            row_end: self.row_end.max(other.row_end),
            col_end: self.col_end.max(other.col_end),
        }
    }

    fn area(self) -> u128 {
        (u128::from(self.row_end - self.row_start) + 1)
            * (u128::from(self.col_end - self.col_start) + 1)
    }
}

/// What one sheet contributes to the next recompute.
pub(crate) enum DirtySeeds<'a> {
    All,
    Cells(hash_set::Iter<'a, CellKey>),
    Ranges(&'a [DirtyRect]),
}

/// Exactly one representation is live: scalar edits stay exact, bulk source
/// writes store bounds, and structural/load paths stay whole-sheet. Switching
/// from cells to ranges carries every earlier cell into the bounded list.
enum DirtyState {
    Cells(FxHashSet<CellKey>),
    Ranges(Vec<DirtyRect>),
    All,
}

impl Default for DirtyState {
    fn default() -> Self {
        Self::Cells(FxHashSet::default())
    }
}

/// One sheet's formula entries plus the source cells changed since the last
/// transaction-barrier recompute.
#[derive(Default)]
pub(crate) struct SheetFormulas {
    entries: FxHashMap<CellKey, FormulaEntry>,
    dirty: DirtyState,
}

impl SheetFormulas {
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub(crate) fn len(&self) -> usize {
        self.entries.len()
    }

    /// Skips hashing when the sheet has no formulas, which keeps literal-only
    /// sheets free of per-cell map probes.
    #[inline]
    pub(crate) fn get(&self, key: CellKey) -> Option<&FormulaEntry> {
        if self.entries.is_empty() {
            return None;
        }
        self.entries.get(&key)
    }

    #[inline]
    pub(crate) fn contains(&self, key: CellKey) -> bool {
        self.get(key).is_some()
    }

    /// Entries in unspecified order.
    pub(crate) fn iter(&self) -> impl Iterator<Item = (CellKey, &FormulaEntry)> {
        self.entries.iter().map(|(&key, entry)| (key, entry))
    }

    pub(crate) fn keys(&self) -> impl Iterator<Item = CellKey> + '_ {
        self.entries.keys().copied()
    }

    /// Stores `entry` for a bulk load or a workbook-wide refresh whose caller
    /// invalidates the [`FormulaGraph`] itself.
    pub(crate) fn insert(&mut self, key: CellKey, entry: FormulaEntry) {
        self.entries.insert(key, entry);
    }

    /// [`Self::insert`]'s counterpart for structural rewrites.
    pub(crate) fn remove(&mut self, key: CellKey) {
        if !self.entries.is_empty() {
            self.entries.remove(&key);
        }
    }

    /// Stores `entry` at `key`, or removes the formula there for `None`, and
    /// returns the replaced entry so the dependency index can retire its reads.
    /// Use [`FormulaGraph::replace_entry`], which keeps the index in step.
    fn replace(&mut self, key: CellKey, entry: Option<FormulaEntry>) -> Option<FormulaEntry> {
        match entry {
            Some(entry) => self.entries.insert(key, entry),
            None if self.entries.is_empty() => None,
            None => self.entries.remove(&key),
        }
    }
    /// Applies a workbook-level rewrite (rename, sheet removal, structural shift
    /// of another sheet, table change) to every entry. The caller decides which
    /// cells the rewrite dirtied.
    pub(crate) fn rewrite_entries(&mut self, mut rewrite: impl FnMut(&mut FormulaEntry)) {
        for entry in self.entries.values_mut() {
            rewrite(entry);
        }
    }

    /// Moves entries at or below `at` down by `count` rows on this sheet,
    /// rewriting their same-sheet references, and dirties the whole sheet.
    pub(crate) fn insert_rows(&mut self, sheet: u32, at: u32, count: u32) {
        self.move_entries(|(row, col), entry| {
            entry.shift_rows(at, i64::from(count), sheet, sheet);
            let row = if row >= at {
                row.saturating_add(count)
            } else {
                row
            };
            Some((row, col))
        });
    }

    /// Drops entries in rows `at..at + count`, moves later entries up, rewrites
    /// same-sheet references, and dirties the whole sheet.
    pub(crate) fn delete_rows(&mut self, sheet: u32, at: u32, count: u32) {
        let end = at.saturating_add(count);
        self.move_entries(|(row, col), entry| {
            if row >= at && row < end {
                return None;
            }
            entry.shift_rows(at, -i64::from(count), sheet, sheet);
            Some((if row >= end { row - count } else { row }, col))
        });
    }

    /// Column counterpart of [`Self::insert_rows`].
    pub(crate) fn insert_cols(&mut self, sheet: u32, at: u32, count: u32) {
        self.move_entries(|(row, col), entry| {
            entry.shift_cols(at, i64::from(count), sheet, sheet);
            let col = if col >= at {
                col.saturating_add(count)
            } else {
                col
            };
            Some((row, col))
        });
    }

    /// Column counterpart of [`Self::delete_rows`].
    pub(crate) fn delete_cols(&mut self, sheet: u32, at: u32, count: u32) {
        let end = at.saturating_add(count);
        self.move_entries(|(row, col), entry| {
            if col >= at && col < end {
                return None;
            }
            entry.shift_cols(at, -i64::from(count), sheet, sheet);
            Some((row, if col >= end { col - count } else { col }))
        });
    }

    fn move_entries(
        &mut self,
        mut relocate: impl FnMut(CellKey, &mut FormulaEntry) -> Option<CellKey>,
    ) {
        if !self.entries.is_empty() {
            for (key, mut entry) in std::mem::take(&mut self.entries) {
                if let Some(key) = relocate(key, &mut entry) {
                    self.entries.insert(key, entry);
                }
            }
        }

        self.mark_all_dirty();
    }

    #[inline]
    pub(crate) fn has_dirty(&self) -> bool {
        match &self.dirty {
            DirtyState::Cells(cells) => !cells.is_empty(),
            DirtyState::Ranges(ranges) => !ranges.is_empty(),
            DirtyState::All => true,
        }
    }

    #[inline]
    pub(crate) fn mark_cell_dirty(&mut self, key: CellKey) {
        match &mut self.dirty {
            DirtyState::Cells(cells) => {
                cells.insert(key);
            }
            DirtyState::Ranges(ranges) => Self::add_dirty_rect(ranges, DirtyRect::cell(key)),
            DirtyState::All => {}
        }
    }

    pub(crate) fn mark_cells_dirty(&mut self, keys: impl IntoIterator<Item = CellKey>) {
        if matches!(self.dirty, DirtyState::All) {
            return;
        }

        for key in keys {
            self.mark_cell_dirty(key);
        }
    }

    pub(crate) fn mark_dirty_rect(&mut self, rect: DirtyRect) {
        if matches!(self.dirty, DirtyState::All) {
            return;
        }
        if let DirtyState::Ranges(ranges) = &mut self.dirty {
            Self::add_dirty_rect(ranges, rect);
            return;
        }

        if let DirtyState::Cells(cells) = std::mem::take(&mut self.dirty) {
            let mut ranges = vec![rect];
            for cell in cells {
                Self::add_dirty_rect(&mut ranges, DirtyRect::cell(cell));
            }
            self.dirty = DirtyState::Ranges(ranges);
        } else {
            unreachable!("only cell state remains after handling ranges and All");
        }
    }

    fn add_dirty_rect(ranges: &mut Vec<DirtyRect>, rect: DirtyRect) {
        if ranges.iter().any(|range| {
            range.contains((rect.row_start, rect.col_start))
                && range.contains((rect.row_end, rect.col_end))
        }) {
            return;
        }

        // Sequential writes (a formula fill down a column or across a row)
        // extend the latest rectangle exactly. Checking only the last entry
        // keeps each mark O(1) on that path instead of paying the bounded
        // coalescing scan below once the buffer is full.
        if let Some(last) = ranges.last_mut() {
            let merged = last.union(rect);
            if merged.area() == last.area() + rect.area() {
                *last = merged;
                return;
            }
        }

        if ranges.len() < MAX_DIRTY_RECTS {
            ranges.push(rect);
            return;
        }

        // Bounded conservative coalescing avoids replacing local edits with All.
        let nearest = ranges
            .iter()
            .enumerate()
            .min_by_key(|(_, range)| range.union(rect).area() - range.area())
            .map(|(index, _)| index)
            .expect("a full rectangle buffer is nonempty");
        ranges[nearest] = ranges[nearest].union(rect);
    }

    pub(crate) fn mark_all_dirty(&mut self) {
        self.dirty = DirtyState::All;
    }

    pub(crate) fn clear_dirty(&mut self) {
        if let DirtyState::Cells(cells) = &mut self.dirty {
            if cells.capacity() <= RETAINED_DIRTY_CAPACITY {
                cells.clear();
                return;
            }
        }

        self.dirty = DirtyState::default();
    }

    pub(crate) fn dirty_seeds(&self) -> DirtySeeds<'_> {
        match &self.dirty {
            DirtyState::All => DirtySeeds::All,
            DirtyState::Cells(cells) => DirtySeeds::Cells(cells.iter()),
            DirtyState::Ranges(ranges) => DirtySeeds::Ranges(ranges),
        }
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        formulas
            .add_hash_table::<CellKey, FormulaEntry>(self.entries.len(), self.entries.capacity());
        for entry in self.entries.values() {
            entry.heap_memory_stats(formulas);
        }

        let metadata = stats.owner_mut(SHEET_INDEXES_METADATA);
        match &self.dirty {
            DirtyState::Cells(cells) => {
                metadata.add_hash_table::<CellKey, ()>(cells.len(), cells.capacity())
            }
            DirtyState::Ranges(ranges) => {
                metadata.add_vec::<DirtyRect>(ranges.len(), ranges.capacity())
            }
            DirtyState::All => {}
        }
    }

    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        match &self.dirty {
            DirtyState::All => out.u32(0),
            DirtyState::Cells(cells) => {
                out.u32(1);
                out.usize(cells.len());
                for &(row, col) in cells {
                    out.u32(row);
                    out.u32(col);
                }
            }
            DirtyState::Ranges(ranges) => {
                out.u32(2);
                out.usize(ranges.len());
                for rect in ranges {
                    out.u32(rect.row_start);
                    out.u32(rect.col_start);
                    out.u32(rect.row_end);
                    out.u32(rect.col_end);
                }
            }
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let dirty = match input.u32()? {
            0 => DirtyState::All,
            1 => {
                let mut cells = FxHashSet::default();
                for _ in 0..input.count()? {
                    cells.insert((input.u32()?, input.u32()?));
                }
                DirtyState::Cells(cells)
            }
            2 => {
                let count = input.count()?;
                if count > MAX_DIRTY_RECTS {
                    return Err("too many dirty rectangles".into());
                }
                let mut ranges = Vec::with_capacity(count);
                for _ in 0..count {
                    let rect = DirtyRect::new(
                        input.u32()? as usize,
                        input.u32()? as usize,
                        input.u32()? as usize,
                        input.u32()? as usize,
                    )
                    .ok_or("invalid dirty rectangle")?;
                    ranges.push(rect);
                }
                DirtyState::Ranges(ranges)
            }
            _ => return Err("invalid dirty state".into()),
        };

        Ok(Self {
            entries: FxHashMap::default(),
            dirty,
        })
    }
}

/// The workbook dependency index and the edits it has not absorbed yet.
///
/// Source replacements go through [`Self::replace_entry`], which queues the
/// replaced reads on the index; the recompute barrier applies the whole queue
/// at once, so a transaction's edits share one grouped patch. Structural and
/// workbook-wide rewrites call [`Self::invalidate`], which drops the index at
/// once: it no longer describes the entries, and keeping it would only retain
/// its memory until the rebuild.
#[derive(Default)]
pub(crate) struct FormulaGraph {
    /// Counts invalidations, so each value names one built index.
    epoch: u64,
    index: Option<DepIndex>,
}

impl FormulaGraph {
    /// Drops the index after a rewrite that cannot be patched per entry.
    pub(crate) fn invalidate(&mut self) {
        self.epoch += 1;
        self.index = None;
    }

    /// Stores `entry` at `key` on `sheet`, or removes the formula there for
    /// `None`, and queues the change on the index before the replaced entry is
    /// dropped. A rewrite that keeps every read and the array shape queues
    /// nothing; one that pushes the queue past a substantial share of the
    /// workbook's formulas invalidates instead, since a rebuild is then cheaper.
    pub(crate) fn replace_entry(
        &mut self,
        formulas: &mut SheetFormulas,
        sheet: usize,
        key: CellKey,
        entry: Option<FormulaEntry>,
    ) {
        let stores_formula = entry.is_some();
        let previous = formulas.replace(key, entry);
        // A literal written over a literal is the bulk-load case: skip the
        // lookup of an entry that cannot exist.
        if !stores_formula && previous.is_none() {
            return;
        }

        let next = if stores_formula {
            formulas.get(key)
        } else {
            None
        };
        self.record_replacement(AbsCellKey::from_local(sheet, key), previous, next);
    }

    /// The index half of [`Self::replace_entry`] for callers that changed the
    /// entries themselves; `next` is the entry now stored at `formula`.
    pub(crate) fn record_replacement(
        &mut self,
        formula: AbsCellKey,
        previous: Option<FormulaEntry>,
        next: Option<&FormulaEntry>,
    ) {
        let unchanged = match (&previous, next) {
            (None, None) => true,
            (Some(previous), Some(next)) => DepIndex::dependency_graph_unchanged(previous, next),
            _ => false,
        };
        if unchanged {
            return;
        }
        let Some(index) = &mut self.index else {
            return;
        };

        index.queue_replacement(formula, previous, next);
        if index.needs_rebuild() {
            self.invalidate();
        }
    }

    /// The index for the current entries: built if missing, otherwise patched
    /// with the queued replacements.
    pub(crate) fn ensure_index(&mut self, sheets: &[SheetData]) -> &DepIndex {
        let index = self.index.get_or_insert_with(|| build_dep_index(sheets));
        index.apply_pending(sheets);
        index
    }

    /// The index as of the last [`Self::ensure_index`]; `None` after an
    /// invalidation.
    pub(crate) fn index(&self) -> Option<&DepIndex> {
        self.index.as_ref()
    }

    #[cfg(test)]
    pub(crate) fn epoch(&self) -> u64 {
        self.epoch
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        if let Some(index) = &self.index {
            let (nodes, edges) = index.memory_stats();
            stats.owner_mut(DEPENDENCY_NODES).add(nodes);
            stats.owner_mut(DEPENDENCY_EDGES).add(edges);
        }
    }

    /// Transfers the epoch only; the receiving instance rebuilds the index on
    /// its first recompute.
    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        out.u64(self.epoch);
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        Ok(Self {
            epoch: input.u64()?,
            index: None,
        })
    }
}
