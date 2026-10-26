//! Formula sources, the cells awaiting recompute, and the cached dependency graph.
//!
//! [`SheetFormulas`] owns one sheet's formula entries and its dirty state.
//! [`FormulaGraph`] owns the workbook dependency index and the epoch that says
//! whether the cached index still describes the current entries.

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
use crate::types::{CellKey, FormulaEntry};

/// `FxHashSet::clear` walks every retained bucket, so a dirty set inflated by
/// one giant paste is dropped instead of cleared; otherwise it would tax every
/// later single-cell transaction.
const RETAINED_DIRTY_CAPACITY: usize = 4096;

/// What one sheet contributes to the next recompute.
pub(crate) enum DirtySeeds<'a> {
    /// A bulk load or structural rewrite touched (potentially) every cell, so
    /// every formula on the sheet and every reader of its cells is affected.
    All,
    /// Only these cells changed since the last recompute.
    Cells(hash_set::Iter<'a, CellKey>),
}

/// One sheet's formula and reference entries plus the cells changed since the
/// last transaction-barrier recompute.
///
/// The dirty set stays empty while the whole sheet is dirty: a whole-sheet
/// recompute already seeds every cell's readers, so recording individual cells
/// would add nothing and keep the set O(interactive edits).
#[derive(Default)]
pub(crate) struct SheetFormulas {
    entries: FxHashMap<CellKey, FormulaEntry>,
    dirty_cells: FxHashSet<CellKey>,
    all_dirty: bool,
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

    /// Stores `entry` at `key` and reports whether the dependency graph read by
    /// [`build_dep_index`] changed. A new formula cell always changes it; a
    /// rewrite changes it only when its reads or array shape changed.
    pub(crate) fn insert(&mut self, key: CellKey, entry: FormulaEntry) -> bool {
        let changed = self
            .entries
            .get(&key)
            .is_none_or(|previous| !DepIndex::dependency_graph_unchanged(previous, &entry));
        self.entries.insert(key, entry);
        changed
    }

    /// Removes the entry at `key`; removing an existing entry always changes the
    /// dependency graph.
    #[inline]
    pub(crate) fn remove(&mut self, key: CellKey) -> bool {
        !self.entries.is_empty() && self.entries.remove(&key).is_some()
    }

    /// Replaces or removes the entry at `key`, reporting whether the dependency
    /// graph changed.
    pub(crate) fn replace(&mut self, key: CellKey, entry: Option<FormulaEntry>) -> bool {
        match entry {
            Some(entry) => self.insert(key, entry),
            None => self.remove(key),
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
        self.all_dirty || !self.dirty_cells.is_empty()
    }

    #[inline]
    pub(crate) fn mark_cell_dirty(&mut self, key: CellKey) {
        if !self.all_dirty {
            self.dirty_cells.insert(key);
        }
    }

    pub(crate) fn mark_cells_dirty(&mut self, keys: impl IntoIterator<Item = CellKey>) {
        if !self.all_dirty {
            self.dirty_cells.extend(keys);
        }
    }

    /// Idempotent, so per-cell loaders can call it without re-clearing the set.
    pub(crate) fn mark_all_dirty(&mut self) {
        if !self.all_dirty {
            self.clear_dirty();
            self.all_dirty = true;
        }
    }

    /// Resets dirty tracking after a recompute pass.
    pub(crate) fn clear_dirty(&mut self) {
        self.all_dirty = false;
        if self.dirty_cells.capacity() > RETAINED_DIRTY_CAPACITY {
            self.dirty_cells = FxHashSet::default();
        } else {
            self.dirty_cells.clear();
        }
    }

    pub(crate) fn dirty_seeds(&self) -> DirtySeeds<'_> {
        if self.all_dirty {
            DirtySeeds::All
        } else {
            DirtySeeds::Cells(self.dirty_cells.iter())
        }
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        formulas
            .add_hash_table::<CellKey, FormulaEntry>(self.entries.len(), self.entries.capacity());
        for entry in self.entries.values() {
            entry.heap_memory_stats(formulas);
        }

        stats
            .owner_mut(SHEET_INDEXES_METADATA)
            .add_hash_table::<CellKey, ()>(self.dirty_cells.len(), self.dirty_cells.capacity());
    }

    /// Writes the dirty state only; entries cross through the store's formula
    /// codec, which re-resolves names and tables in the receiving instance.
    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        out.usize(self.dirty_cells.len());
        for &(row, col) in &self.dirty_cells {
            out.u32(row);
            out.u32(col);
        }
        out.bool(self.all_dirty);
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let mut formulas = Self::default();
        for _ in 0..input.count()? {
            formulas.dirty_cells.insert((input.u32()?, input.u32()?));
        }
        formulas.all_dirty = input.bool()?;
        Ok(formulas)
    }
}

/// The workbook dependency index, rebuilt lazily when formula entries changed
/// what it reads.
///
/// Editors call [`Self::invalidate`] instead of rebuilding: many edits in one
/// transaction then cost one rebuild at the recompute barrier. A stale index is
/// retained until that rebuild, so its memory remains accounted.
#[derive(Default)]
pub(crate) struct FormulaGraph {
    epoch: u64,
    index: Option<DepIndex>,
}

impl FormulaGraph {
    /// Marks the cached index stale after an entry changed the graph.
    pub(crate) fn invalidate(&mut self) {
        self.epoch += 1;
    }

    /// The index for the current entries, rebuilding a stale one first. The
    /// stale index is dropped before the rebuild so both never coexist.
    pub(crate) fn ensure_index(&mut self, sheets: &[SheetData]) -> &DepIndex {
        let epoch = self.epoch;
        if self
            .index
            .as_ref()
            .is_some_and(|index| index.epoch != epoch)
        {
            self.index = None;
        }
        self.index
            .get_or_insert_with(|| build_dep_index(sheets, epoch))
    }

    /// The last built index, which is current only after [`Self::ensure_index`]
    /// with no intervening invalidation.
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
