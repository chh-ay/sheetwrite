//! The export that sets the rows a sheet's view hides, and the recalculation
//! of the formulas that read them.

use wasm_bindgen::prelude::*;

use super::CellStore;
use crate::types::{CellKey, FormulaEntry};

#[wasm_bindgen]
impl CellStore {
    /// Replaces the hidden rows of `sheet`. `manual` holds the rows that the
    /// user or a collapsed row group hides, and `filtered` the rows that a
    /// filter hides. Each is packed `[first, last]` inclusive row pairs in
    /// ascending order without overlap. Returns `false`, and changes nothing,
    /// for a missing sheet or invalid pairs.
    ///
    /// A change marks dirty every SUBTOTAL or AGGREGATE formula that can read
    /// the sheet; no other formula recalculates. Inside a mutation or a page
    /// load, `commitSources` recalculates them with the other edits of the
    /// batch; otherwise this call does.
    #[wasm_bindgen(js_name = setHiddenRows)]
    pub fn set_hidden_rows(&mut self, sheet: usize, manual: &[u32], filtered: &[u32]) -> bool {
        if !self.sheet_alive.get(sheet).copied().unwrap_or(false) {
            return false;
        }

        match self.sheets[sheet].visibility.replace(manual, filtered) {
            None => return false,
            Some(false) => return true,
            Some(true) => {}
        }

        let seeds = self.mark_hidden_row_readers_dirty(sheet as u32);
        let is_batch_open = self.active_mutation_revision.is_some() || self.loading_page > 0;
        if !seeds.is_empty() && !is_batch_open {
            self.recompute_seed_sheets(&seeds);
        }
        true
    }
}

impl CellStore {
    /// Marks the SUBTOTAL and AGGREGATE formulas that read `sheet` dirty and
    /// returns the sheets that hold them. A volatile formula can reach any
    /// sheet through OFFSET or INDIRECT, so it counts as a reader.
    fn mark_hidden_row_readers_dirty(&mut self, sheet: u32) -> Vec<usize> {
        let reads_sheet = |entry: &FormulaEntry| {
            entry.volatile()
                || entry.reads.ranges.iter().any(|range| range.sheet == sheet)
                || entry.reads.cells.iter().any(|cell| cell.sheet == sheet)
        };

        let mut seeds = Vec::new();
        for (index, data) in self.sheets.iter_mut().enumerate() {
            let Some(keys) = data.formulas.subtotal_keys() else {
                continue;
            };
            let readers: Vec<CellKey> = keys
                .iter()
                .copied()
                .filter(|&key| data.formulas.get(key).is_some_and(reads_sheet))
                .collect();
            if readers.is_empty() {
                continue;
            }

            data.formulas.mark_cells_dirty(readers);
            seeds.push(index);
        }
        seeds
    }
}
