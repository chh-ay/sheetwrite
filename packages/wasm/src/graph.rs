//! Formula sources, the cells awaiting recompute, and the cached dependency graph.
//!
//! [`SheetFormulas`] owns a sheet's address index and dirty source seeds.
//! [`FormulaGraph`] owns the workbook dependency index and keeps it in step
//! with entry replacements, dropping it for rewrites it cannot patch.

use crate::eval::{build_dep_index, DepIndex};
use crate::formula_slots::{FormulaId, FormulaStore};
use crate::memory::{
    StoreMemoryStats, DEPENDENCY_EDGES, DEPENDENCY_NODES, FORMULAS, SHEET_INDEXES_METADATA,
};
use crate::sheet::SheetData;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};
use crate::types::{AbsCellKey, CellKey, FormulaEntry};

/// A dirty list inflated by one giant paste is dropped instead of cleared, so
/// later single-cell transactions do not keep its memory.
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

/// Exact dirty source cells in one flat list: a sorted, unique prefix and a
/// tail. Writes in address order (a load or a fill) extend the prefix. A
/// write that restarts lower (the next column of a spill) starts the tail,
/// which stays a sorted run while writes keep ascending. A write already in
/// either sorted run is found by binary search and adds nothing. Once the
/// tail is out of order it may hold repeats, so the whole list is sorted and
/// deduplicated in place before it grows: repeated edits of a few cells stay
/// bounded without hashing.
#[derive(Default)]
struct DirtyCells {
    cells: Vec<CellKey>,
    sorted_len: usize,
    tail_sorted: bool,
}

impl DirtyCells {
    fn insert(&mut self, key: CellKey) {
        let len = self.cells.len();
        let Some(&last) = self.cells.last() else {
            self.cells.push(key);
            self.sorted_len = 1;
            return;
        };
        if last == key {
            return;
        }

        let prefix_only = self.sorted_len == len;
        if prefix_only && last < key {
            self.cells.push(key);
            self.sorted_len += 1;
            return;
        }

        let (prefix, tail) = self.cells.split_at(self.sorted_len.min(len));
        if prefix.binary_search(&key).is_ok() {
            return;
        }

        if prefix_only {
            self.tail_sorted = true;
        } else if self.tail_sorted && last > key {
            if tail.binary_search(&key).is_ok() {
                return;
            }
            self.tail_sorted = false;
        }

        // Fold before growing. Sorting two ascending runs is a linear merge,
        // and room for as many cells again as survive keeps folds amortized.
        if len == self.cells.capacity() {
            self.cells.sort();
            self.cells.dedup();
            self.sorted_len = self.cells.len();
            if self.cells.binary_search(&key).is_ok() {
                return;
            }

            self.cells.reserve(self.cells.len());
            if self.cells.last().is_none_or(|&last| last < key) {
                self.sorted_len += 1;
            } else {
                self.tail_sorted = true;
            }
        }

        self.cells.push(key);
    }

    /// Appends a batch, then folds it with one sort unless it continued the
    /// sorted list. A batch is a few ascending runs (a vacated spill, then
    /// its reinstalled cells), which a stable sort merges in linear time,
    /// where a binary search per cell is not.
    fn extend(&mut self, keys: impl IntoIterator<Item = CellKey>) {
        let mut ascending = self.sorted_len == self.cells.len();
        for key in keys {
            let last = self.cells.last().copied();
            if last == Some(key) {
                continue;
            }

            ascending &= last.is_none_or(|last| last < key);
            self.cells.push(key);
        }

        if !ascending {
            self.cells.sort();
            self.cells.dedup();
        }
        self.sorted_len = self.cells.len();
    }

    fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }
}

/// What one sheet contributes to the next recompute.
pub(crate) enum DirtySeeds<'a> {
    All,
    Cells(std::slice::Iter<'a, CellKey>),
    Ranges(&'a [DirtyRect]),
}

/// Exactly one representation is live: scalar edits stay exact, bulk source
/// writes store bounds, and structural/load paths stay whole-sheet. Switching
/// from cells to ranges carries every earlier cell into the bounded list.
enum DirtyState {
    Cells(DirtyCells),
    Ranges(Vec<DirtyRect>),
    All,
}

impl Default for DirtyState {
    fn default() -> Self {
        Self::Cells(DirtyCells::default())
    }
}

// Bound a scalar insert or delete's shifts to one small row band, not a column.
// The exact-reader index uses the same bands, so a topology patch is as local.
pub(crate) const FORMULA_INDEX_PAGE_ROWS: u32 = 256;
const FORMULA_INDEX_INITIAL_CAPACITY: usize = 1;
const FULL_PAGE_CELLS: usize = FORMULA_INDEX_PAGE_ROWS as usize;

struct FormulaPage {
    band: u32,
    cells: Vec<(u32, FormulaId)>,
}

struct FormulaColumn {
    col: u32,
    pages: Vec<FormulaPage>,
}

/// Contiguous bands and full pages hold each key at its own offset. Check that
/// slot first, so a dense column needs no binary search on the pass hot path.
#[inline]
pub(crate) fn offset_or_search<T>(
    items: &[T],
    key: u32,
    offset: u32,
    key_of: impl Fn(&T) -> u32,
) -> Option<usize> {
    let offset = offset as usize;
    if items.get(offset).is_some_and(|item| key_of(item) == key) {
        return Some(offset);
    }

    // Loads look up each new address before it is added; past the end is a miss.
    if items.last().is_none_or(|item| key_of(item) < key) {
        return None;
    }
    items.binary_search_by_key(&key, key_of).ok()
}

/// Loads write in address order, so the end of a sorted list is checked before
/// a binary search. `Err` is the insert position, as for a binary search.
#[inline]
fn insert_position<T>(items: &[T], key: u32, key_of: impl Fn(&T) -> u32) -> Result<usize, usize> {
    match items.last().map(&key_of) {
        None => Err(0),
        Some(last) if last < key => Err(items.len()),
        Some(last) if last == key => Ok(items.len() - 1),
        Some(_) => items.binary_search_by_key(&key, key_of),
    }
}

struct FormulaAddresses<'a> {
    columns: std::slice::Iter<'a, FormulaColumn>,
    pages: std::slice::Iter<'a, FormulaPage>,
    cells: std::slice::Iter<'a, (u32, FormulaId)>,
    col: u32,
}

impl<'a> FormulaAddresses<'a> {
    fn new(columns: &'a [FormulaColumn]) -> Self {
        Self {
            columns: columns.iter(),
            pages: [].iter(),
            cells: [].iter(),
            col: 0,
        }
    }

    // Share the address walk instead of copying nested iterators into callers.
    #[inline(never)]
    fn next_address_family(&mut self) -> Option<(CellKey, FormulaId)> {
        loop {
            if let Some(&(row, id)) = self.cells.next() {
                return Some(((row, self.col), id));
            }

            if let Some(page) = self.pages.next() {
                self.cells = page.cells.iter();
                continue;
            }

            let column = self.columns.next()?;
            self.col = column.col;
            self.pages = column.pages.iter();
        }
    }
}

impl Iterator for FormulaAddresses<'_> {
    type Item = (CellKey, FormulaId);

    fn next(&mut self) -> Option<Self::Item> {
        self.next_address_family()
    }
}

struct FormulaEntries<'a> {
    addresses: FormulaAddresses<'a>,
    slots: &'a FormulaStore,
}

impl<'a> Iterator for FormulaEntries<'a> {
    type Item = (CellKey, &'a FormulaEntry);

    fn next(&mut self) -> Option<Self::Item> {
        let (key, id) = self.addresses.next()?;
        Some((key, self.slots.get(id)?))
    }
}

/// A sparse address index and source-edit seeds. The workbook owns all entries.
#[derive(Default)]
pub(crate) struct SheetFormulas {
    columns: Vec<FormulaColumn>,
    count: usize,
    volatile_count: usize,
    subtotal_count: usize,
    dirty: DirtyState,
}

impl SheetFormulas {
    /// Formula-free sheets can skip graph and evaluator work.
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.count == 0
    }

    /// Count sources without scanning sparse address pages.
    pub(crate) fn len(&self) -> usize {
        self.count
    }

    /// Translate a cell address once before indexed evaluation.
    #[inline]
    pub(crate) fn id(&self, (row, col): CellKey) -> Option<FormulaId> {
        let column = self
            .columns
            .binary_search_by_key(&col, |column| column.col)
            .ok()?;
        let pages = &self.columns.get(column)?.pages;
        let band = row / FORMULA_INDEX_PAGE_ROWS;
        let first_band = pages.first()?.band;
        let page = offset_or_search(pages, band, band.wrapping_sub(first_band), |page| page.band)?;
        let cells = &pages.get(page)?.cells;
        let offset = offset_or_search(cells, row, row % FORMULA_INDEX_PAGE_ROWS, |&(row, _)| row)?;
        cells.get(offset).map(|&(_, id)| id)
    }

    /// Keep entry ownership in the workbook, not in each sheet index.
    #[inline]
    pub(crate) fn get<'a>(
        &self,
        key: CellKey,
        slots: &'a FormulaStore,
    ) -> Option<&'a FormulaEntry> {
        slots.get(self.id(key)?)
    }

    /// Source-kind checks need membership without borrowing an entry.
    #[inline]
    pub(crate) fn contains(&self, key: CellKey) -> bool {
        self.id(key).is_some()
    }

    /// Share one address walk across queries, transfers and source rewrites.
    pub(crate) fn iter<'a>(
        &'a self,
        slots: &'a FormulaStore,
    ) -> impl Iterator<Item = (CellKey, &'a FormulaEntry)> {
        FormulaEntries {
            addresses: FormulaAddresses::new(&self.columns),
            slots,
        }
    }

    /// Seed pass work without rebuilding coordinate keys.
    pub(crate) fn ids(&self) -> impl Iterator<Item = FormulaId> + '_ {
        FormulaAddresses::new(&self.columns).map(|(_, id)| id)
    }

    /// Address-only operations do not need to read formula entries.
    pub(crate) fn keys(&self) -> impl Iterator<Item = CellKey> + '_ {
        FormulaAddresses::new(&self.columns).map(|(key, _)| key)
    }

    /// Avoid a workbook membership scan for non-volatile sheets.
    #[inline]
    pub(crate) fn has_volatile(&self) -> bool {
        self.volatile_count != 0
    }

    /// Add this sheet's volatile sources at an edit barrier.
    pub(crate) fn volatile_keys<'a>(
        &'a self,
        slots: &'a FormulaStore,
    ) -> impl Iterator<Item = CellKey> + 'a {
        let sheet = self
            .ids()
            .next()
            .and_then(|id| slots.location(id))
            .map(|key| key.sheet);
        slots.volatile_keys(sheet)
    }

    /// Visibility changes need only this sheet's SUBTOTAL sources.
    pub(crate) fn subtotal_keys<'a>(
        &'a self,
        slots: &'a FormulaStore,
    ) -> Option<impl Iterator<Item = CellKey> + 'a> {
        let sheet = self
            .ids()
            .next()
            .and_then(|id| slots.location(id))
            .map(|key| key.sheet);
        (self.subtotal_count != 0).then(move || slots.subtotal_keys(sheet))
    }

    #[inline(never)]
    fn index_id(&mut self, key: CellKey, id: FormulaId) {
        let column = match insert_position(&self.columns, key.1, |column| column.col) {
            Ok(column) => column,
            Err(column) => {
                if self.columns.get(column..).is_none() {
                    return;
                }
                if self.columns.capacity() == 0 {
                    self.columns.reserve_exact(FORMULA_INDEX_INITIAL_CAPACITY);
                }
                self.columns.insert(
                    column,
                    FormulaColumn {
                        col: key.1,
                        pages: Vec::with_capacity(FORMULA_INDEX_INITIAL_CAPACITY),
                    },
                );
                column
            }
        };
        let Some(column) = self.columns.get_mut(column) else {
            return;
        };
        let pages = &mut column.pages;
        let band = key.0 / FORMULA_INDEX_PAGE_ROWS;
        let page = match insert_position(pages, band, |page| page.band) {
            Ok(page) => page,
            Err(page) => {
                if pages.get(page..).is_none() {
                    return;
                }

                // A full page before this band means a dense column: reserve
                // the whole band once instead of growing it from one cell.
                let dense = page
                    .checked_sub(1)
                    .and_then(|previous| pages.get(previous))
                    .is_some_and(|previous| {
                        previous.band + 1 == band && previous.cells.len() == FULL_PAGE_CELLS
                    });
                let capacity = if dense {
                    FULL_PAGE_CELLS
                } else {
                    FORMULA_INDEX_INITIAL_CAPACITY
                };
                pages.insert(
                    page,
                    FormulaPage {
                        band,
                        cells: Vec::with_capacity(capacity),
                    },
                );
                page
            }
        };
        let Some(page) = pages.get_mut(page) else {
            return;
        };
        let cells = &mut page.cells;
        let Err(offset) = insert_position(cells, key.0, |&(row, _)| row) else {
            return;
        };
        if cells.get(offset..).is_none() {
            return;
        }
        cells.insert(offset, (key.0, id));
        self.count += 1;
    }

    /// Source import and rewrites keep an existing formula id when possible.
    pub(crate) fn insert(
        &mut self,
        key: CellKey,
        entry: FormulaEntry,
        sheet: usize,
        slots: &mut FormulaStore,
    ) {
        self.replace(key, Some(entry), sheet, slots);
    }

    /// Retire a removed id until its old graph reads are owned.
    pub(crate) fn remove(&mut self, key: CellKey, slots: &mut FormulaStore) {
        self.replace(key, None, 0, slots);
    }

    /// Returns the replaced entry and the id of the changed formula: the id of
    /// the entry now stored, or the retired id of a removed one. The caller
    /// then needs no other address lookup.
    fn replace(
        &mut self,
        key: CellKey,
        entry: Option<FormulaEntry>,
        sheet: usize,
        slots: &mut FormulaStore,
    ) -> (Option<FormulaEntry>, Option<FormulaId>) {
        match (self.id(key), entry) {
            (Some(id), Some(entry)) => {
                self.volatile_count -= usize::from(slots.is_volatile(id));
                self.subtotal_count -= usize::from(slots.is_subtotal(id));
                let previous = slots.replace(id, entry);
                self.volatile_count += usize::from(slots.is_volatile(id));
                self.subtotal_count += usize::from(slots.is_subtotal(id));
                (previous, Some(id))
            }
            (Some(id), None) => (self.remove_id(key, id, slots), Some(id)),
            (None, Some(entry)) => {
                let Some(id) = slots.allocate(AbsCellKey::from_local(sheet, key), entry) else {
                    return (None, None);
                };
                self.volatile_count += usize::from(slots.is_volatile(id));
                self.subtotal_count += usize::from(slots.is_subtotal(id));
                self.index_id(key, id);
                (None, Some(id))
            }
            (None, None) => (None, None),
        }
    }

    /// Drops `id` from the address index at `key` and retires its slot.
    fn remove_id(
        &mut self,
        key: CellKey,
        id: FormulaId,
        slots: &mut FormulaStore,
    ) -> Option<FormulaEntry> {
        let column = self
            .columns
            .binary_search_by_key(&key.1, |column| column.col)
            .ok()?;
        let pages = &mut self.columns.get_mut(column)?.pages;
        let band = key.0 / FORMULA_INDEX_PAGE_ROWS;
        let page = pages.binary_search_by_key(&band, |page| page.band).ok()?;
        let cells = &mut pages.get_mut(page)?.cells;
        let offset = cells.binary_search_by_key(&key.0, |&(row, _)| row).ok()?;
        cells.get(offset)?;
        self.volatile_count -= usize::from(slots.is_volatile(id));
        self.subtotal_count -= usize::from(slots.is_subtotal(id));
        cells.remove(offset);
        if cells.is_empty() {
            pages.remove(page);
        }
        if pages.is_empty() {
            self.columns.remove(column);
        }
        self.count -= 1;
        slots.retire(id)
    }

    /// Refresh source metadata without replacing surviving ids.
    pub(crate) fn rewrite_entries(
        &mut self,
        slots: &mut FormulaStore,
        mut rewrite: impl FnMut(&mut FormulaEntry),
    ) {
        let mut volatile_count = 0;
        let mut subtotal_count = 0;
        for id in self.ids() {
            let Some(entry) = slots.get_mut(id) else {
                continue;
            };
            rewrite(entry);
            slots.refresh_flags(id);
            volatile_count += usize::from(slots.is_volatile(id));
            subtotal_count += usize::from(slots.is_subtotal(id));
        }
        self.volatile_count = volatile_count;
        self.subtotal_count = subtotal_count;
    }

    /// Moves entries at or below `at` down by `count` rows on this sheet,
    /// rewriting their same-sheet references, and dirties the whole sheet.
    pub(crate) fn insert_rows(
        &mut self,
        sheet: u32,
        at: u32,
        count: u32,
        slots: &mut FormulaStore,
    ) {
        self.move_entries(slots, |(row, col), entry| {
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
    pub(crate) fn delete_rows(
        &mut self,
        sheet: u32,
        at: u32,
        count: u32,
        slots: &mut FormulaStore,
    ) {
        let end = at.saturating_add(count);
        self.move_entries(slots, |(row, col), entry| {
            if row >= at && row < end {
                return None;
            }
            entry.shift_rows(at, -i64::from(count), sheet, sheet);
            Some((if row >= end { row - count } else { row }, col))
        });
    }

    /// Column counterpart of [`Self::insert_rows`].
    pub(crate) fn insert_cols(
        &mut self,
        sheet: u32,
        at: u32,
        count: u32,
        slots: &mut FormulaStore,
    ) {
        self.move_entries(slots, |(row, col), entry| {
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
    pub(crate) fn delete_cols(
        &mut self,
        sheet: u32,
        at: u32,
        count: u32,
        slots: &mut FormulaStore,
    ) {
        let end = at.saturating_add(count);
        self.move_entries(slots, |(row, col), entry| {
            if col >= at && col < end {
                return None;
            }
            entry.shift_cols(at, -i64::from(count), sheet, sheet);
            Some((row, if col >= end { col - count } else { col }))
        });
    }

    fn move_entries(
        &mut self,
        slots: &mut FormulaStore,
        mut relocate: impl FnMut(CellKey, &mut FormulaEntry) -> Option<CellKey>,
    ) {
        let columns = std::mem::take(&mut self.columns);
        self.count = 0;
        self.volatile_count = 0;
        self.subtotal_count = 0;
        for column in columns {
            for (row, id) in column.pages.into_iter().flat_map(|page| page.cells) {
                let Some(previous) = slots.location(id) else {
                    continue;
                };
                let Some(entry) = slots.get_mut(id) else {
                    continue;
                };
                if let Some(key) = relocate((row, column.col), entry) {
                    slots.relocate(id, AbsCellKey::from_local(previous.sheet as usize, key));
                    slots.refresh_flags(id);
                    self.index_id(key, id);
                    self.volatile_count += usize::from(slots.is_volatile(id));
                    self.subtotal_count += usize::from(slots.is_subtotal(id));
                } else {
                    let _ = slots.retire(id);
                }
            }
        }

        self.mark_all_dirty();
    }

    /// Clean sheets do not need a dirty-collection pass.
    #[inline]
    pub(crate) fn has_dirty(&self) -> bool {
        match &self.dirty {
            DirtyState::Cells(cells) => !cells.is_empty(),
            DirtyState::Ranges(ranges) => !ranges.is_empty(),
            DirtyState::All => true,
        }
    }

    /// Coalesce repeated source writes before traversing dependents.
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

    /// A bulk writer adds seeds without collecting a second temporary set.
    pub(crate) fn mark_cells_dirty(&mut self, keys: impl IntoIterator<Item = CellKey>) {
        match &mut self.dirty {
            DirtyState::Cells(cells) => cells.extend(keys),
            DirtyState::Ranges(ranges) => {
                for key in keys {
                    Self::add_dirty_rect(ranges, DirtyRect::cell(key));
                }
            }
            DirtyState::All => {}
        }
    }

    /// Large writes keep rectangle seeds rather than expanding every cell.
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
            for cell in cells.cells {
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

    /// Structural rewrites must select every surviving source.
    pub(crate) fn mark_all_dirty(&mut self) {
        self.dirty = DirtyState::All;
    }

    /// Keep only small seed capacity after the pass consumes it.
    pub(crate) fn clear_dirty(&mut self) {
        if let DirtyState::Cells(cells) = &mut self.dirty {
            if cells.cells.capacity() <= RETAINED_DIRTY_CAPACITY {
                cells.cells.clear();
                cells.sorted_len = 0;
                return;
            }
        }

        self.dirty = DirtyState::default();
    }

    /// Borrow seeds so dirty collection does not clone the source edit set.
    pub(crate) fn dirty_seeds(&self) -> DirtySeeds<'_> {
        match &self.dirty {
            DirtyState::All => DirtySeeds::All,
            DirtyState::Cells(cells) => DirtySeeds::Cells(cells.cells.iter()),
            DirtyState::Ranges(ranges) => DirtySeeds::Ranges(ranges),
        }
    }

    /// Count the sparse index here; entries are owned by FormulaStore.
    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let formulas = stats.owner_mut(FORMULAS);
        formulas.add_vec::<FormulaColumn>(self.columns.len(), self.columns.capacity());
        for column in &self.columns {
            formulas.add_vec::<FormulaPage>(column.pages.len(), column.pages.capacity());
            for page in &column.pages {
                formulas.add_vec::<(u32, FormulaId)>(page.cells.len(), page.cells.capacity());
            }
        }
        let metadata = stats.owner_mut(SHEET_INDEXES_METADATA);
        match &self.dirty {
            DirtyState::Cells(cells) => {
                metadata.add_vec::<CellKey>(cells.cells.len(), cells.cells.capacity())
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
                out.usize(cells.cells.len());
                for &(row, col) in &cells.cells {
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
                let mut cells = DirtyCells::default();
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
            columns: Vec::new(),
            count: 0,
            volatile_count: 0,
            subtotal_count: 0,
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
        slots: &mut FormulaStore,
        sheet: usize,
        key: CellKey,
        entry: Option<FormulaEntry>,
    ) {
        let stores_formula = entry.is_some();
        let (previous, changed) = formulas.replace(key, entry, sheet, slots);
        // A literal written over a literal is the bulk-load case: the index
        // has no change to record.
        if !stores_formula && previous.is_none() {
            return;
        }

        let Some(id) = changed else {
            return;
        };

        // A removed formula's retired slot holds no entry, so `next` is `None`.
        let next = slots.get(id);
        self.record_replacement(id, previous, next);
        // A reused id is safe in the pending queue: that queue keeps the first
        // reads recorded for an id and reads the current entry when applied.
        slots.release_retired();
    }

    /// The index half of [`Self::replace_entry`] for callers that changed the
    /// entries themselves; `next` is the entry now stored for `formula`.
    pub(crate) fn record_replacement(
        &mut self,
        formula: FormulaId,
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
    pub(crate) fn ensure_index(&mut self, sheets: &[SheetData], slots: &FormulaStore) -> &DepIndex {
        let index = self
            .index
            .get_or_insert_with(|| build_dep_index(sheets, slots));
        index.apply_pending(sheets, slots);
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

#[cfg(test)]
mod tests {
    use super::DirtyCells;

    /// The distinct cells a list holds, in address order.
    fn distinct(cells: &DirtyCells) -> Vec<(u32, u32)> {
        let mut cells = cells.cells.clone();
        cells.sort_unstable();
        cells.dedup();
        cells
    }

    /// Address-order writes append without a fold and stay sorted.
    #[test]
    fn address_order_writes_stay_sorted() {
        let mut cells = DirtyCells::default();
        for row in 0..1_000 {
            cells.insert((row, 1));
            cells.insert((row, 1));
        }

        assert_eq!(cells.sorted_len, 1_000);
        assert_eq!(cells.cells.len(), 1_000);
    }

    /// Re-marking cells of a sorted list adds nothing.
    #[test]
    fn sorted_list_ignores_repeated_cells() {
        let mut cells = DirtyCells::default();
        for row in 0..100 {
            cells.insert((row, 0));
        }
        for row in (0..100).rev() {
            cells.insert((row, 0));
        }

        assert_eq!(cells.sorted_len, 100);
        assert_eq!(cells.cells.len(), 100);
    }

    /// A spill edit marks one source cell, then the vacated column and the
    /// reinstalled column: the second run repeats the first and adds nothing.
    #[test]
    fn repeated_column_run_after_a_later_cell_adds_nothing() {
        let mut cells = DirtyCells::default();
        cells.insert((999, 1));
        for _ in 0..2 {
            for row in 0..999 {
                cells.insert((row, 2));
            }
        }

        let mut expected: Vec<_> = (0..999).map(|row| (row, 2)).collect();
        expected.push((999, 1));
        assert_eq!(distinct(&cells), expected);
        assert_eq!(cells.cells.len(), expected.len());
    }

    /// Scattered repeated writes keep every cell and fold duplicates, so the
    /// list stays within twice the distinct cells.
    #[test]
    fn scattered_repeats_fold_and_keep_every_cell() {
        let mut cells = DirtyCells::default();
        let keys: Vec<_> = (0..300u32)
            .map(|index| ((index * 37) % 101, index % 3))
            .collect();
        for _ in 0..20 {
            for &key in &keys {
                cells.insert(key);
            }
        }

        let mut expected = keys.clone();
        expected.sort_unstable();
        expected.dedup();
        assert_eq!(distinct(&cells), expected);
        assert!(cells.cells.len() <= 2 * expected.len());
    }
}
