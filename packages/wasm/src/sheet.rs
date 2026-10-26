//! One sheet: physical cells, formula sources and spill ownership, coordinated
//! so that source writes detach spills and dirty the formulas that read them.

use crate::cells::CellStorage;
use crate::graph::SheetFormulas;
use crate::memory::StoreMemoryStats;
use crate::spill::SpillState;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};
use crate::types::{CellKey, FormulaEntry, FormulaError};

pub(crate) struct SheetData {
    pub(crate) cells: CellStorage,
    pub(crate) formulas: SheetFormulas,
    pub(crate) spill: SpillState,
}

impl SheetData {
    pub(crate) fn new(n_cols: usize, row_count: usize) -> Self {
        Self::try_new(n_cols, row_count).expect("trusted dense sheet dimensions")
    }

    pub(crate) fn try_new(n_cols: usize, row_count: usize) -> Result<Self, String> {
        Ok(Self::with_cells(CellStorage::try_new(n_cols, row_count)?))
    }

    pub(crate) fn new_paged(
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> Self {
        Self::with_cells(CellStorage::new_paged(
            n_cols,
            row_count,
            chunk_rows,
            byte_budget,
            max_dirty_cells,
        ))
    }

    fn with_cells(cells: CellStorage) -> Self {
        Self {
            cells,
            formulas: SheetFormulas::default(),
            spill: SpillState::default(),
        }
    }

    pub(crate) fn persisted_coordinates(&self) -> Vec<CellKey> {
        let mut coordinates = self.cells.persisted_coordinates();
        coordinates.extend(self.formulas.keys());
        coordinates.sort_unstable();
        coordinates.dedup();
        coordinates
    }

    #[inline]
    pub(crate) fn write_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        dirty_revision: Option<u64>,
    ) -> bool {
        if let Some(revision) = dirty_revision {
            if !self.cells.prepare_dirty_cells(&[(row, col)], revision) {
                return false;
            }
        }
        self.prepare_cell_write(row, col);
        self.cells
            .write_cell(row, col, kind, payload, style, dirty_revision)
    }

    pub(crate) fn hydrate_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
    ) -> bool {
        if !self.cells.hydrate_cell(row, col, kind, payload, style) {
            return false;
        }
        self.prepare_cell_write(row, col);
        true
    }

    /// Detach a direct write from any spill and dirty every attempted spill
    /// whose destination includes this cell.
    #[inline]
    fn prepare_cell_write(&mut self, row: usize, col: usize) {
        // No spill metadata means nothing to detach, invalidate or enqueue; the
        // hash probes would only pay for empty-map lookups on every write.
        if self.spill.is_empty() {
            return;
        }

        if let (Ok(row), Ok(col)) = (u32::try_from(row), u32::try_from(col)) {
            let dirty = self.spill.detach_source((row, col), &mut self.cells);
            self.formulas.mark_cells_dirty(dirty);
        }
    }

    pub(crate) fn finish_recompute(&mut self) {
        if self.formulas.is_empty() {
            self.cells.invalidate_derived();
        }

        self.formulas.clear_dirty();
    }

    /// Shift rows `[at, row_count)` down by `count`, opening a blank gap.
    pub(crate) fn insert_rows(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.row_count();
        if count == 0 || extent.checked_add(count).is_none() {
            return;
        }

        let at = at.min(extent);
        self.cells.insert_rows(at, count);
        self.formulas.insert_rows(sheet, at as u32, count as u32);
    }

    /// Delete `count` rows starting at `at`, closing the gap.
    pub(crate) fn delete_rows(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.row_count();
        if count == 0 || at >= extent {
            return;
        }

        let count = count.min(extent - at);
        self.cells.delete_rows(at, count);
        self.formulas.delete_rows(sheet, at as u32, count as u32);
    }

    /// Shift columns `[at, n_cols)` right by `count`, opening blank columns.
    pub(crate) fn insert_cols(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.n_cols();
        if count == 0 || extent.checked_add(count).is_none() {
            return;
        }

        let at = at.min(extent);
        self.cells.insert_cols(at, count);
        self.formulas.insert_cols(sheet, at as u32, count as u32);
    }

    /// Delete `count` columns starting at `at`, closing the gap.
    pub(crate) fn delete_cols(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.n_cols();
        if count == 0 || at >= extent {
            return;
        }

        let count = count.min(extent - at);
        self.cells.delete_cols(at, count);
        self.formulas.delete_cols(sheet, at as u32, count as u32);
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        self.cells.add_memory_stats(stats);
        self.formulas.add_memory_stats(stats);
        self.spill.add_memory_stats(stats);
    }

    /// Resident state only: an unloaded clean datasource cell stays unloaded.
    /// Formula entries follow through the store's formula codec.
    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        self.cells.write_transfer(out);
        self.formulas.write_transfer(out);
        self.spill.write_transfer(out);
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        Ok(Self {
            cells: CellStorage::read_transfer(input)?,
            formulas: SheetFormulas::read_transfer(input)?,
            spill: SpillState::read_transfer(input)?,
        })
    }
}

pub(crate) fn formula_error_with_entry(
    sheet: &SheetData,
    key: CellKey,
    entry: Option<&FormulaEntry>,
) -> Option<FormulaError> {
    let (row, col) = (key.0 as usize, key.1 as usize);
    sheet
        .cells
        .contains_cell(row, col)
        .then(|| sheet.cells.calculated_error_at(sheet.cells.idx(row, col)))
        .flatten()
        .or_else(|| entry.and_then(FormulaEntry::source_error))
}

pub(crate) fn formula_error_at(sheet: &SheetData, key: CellKey) -> Option<FormulaError> {
    formula_error_with_entry(sheet, key, sheet.formulas.get(key))
}
