//! The export that sets the rows a sheet's view hides, and the recalculation
//! of the formulas that read them.

use wasm_bindgen::prelude::*;

use super::CellStore;
use crate::types::{CellKey, FormulaEntry};

#[wasm_bindgen]
impl CellStore {
    /// Replaces the hidden rows of `sheet`. `manual` holds the rows that the
    /// user or a collapsed row group hides, packed `[first, last]` inclusive
    /// row pairs in ascending order without overlap. `kept` holds the rows
    /// that the filters keep, ascending, or is `None` when no filter is on;
    /// every other row is hidden by a filter. Passing the kept rows, which the
    /// view already has, spares the caller listing the hidden ones. Returns
    /// `false`, and changes nothing, for a missing sheet, invalid pairs, or
    /// kept rows out of order or past the sheet.
    ///
    /// It replaced `setHiddenRows`, which took the filtered rows as runs; the
    /// new name lets a caller tell the two engines apart.
    ///
    /// A change marks dirty every SUBTOTAL or AGGREGATE formula that can read
    /// the sheet; no other formula recalculates. Inside a mutation or a page
    /// load, `commitSources` recalculates them with the other edits of the
    /// batch; otherwise this call does.
    #[wasm_bindgen(js_name = setRowVisibility)]
    pub fn set_row_visibility(
        &mut self,
        sheet: usize,
        manual: &[u32],
        kept: Option<Vec<u32>>,
    ) -> bool {
        if !self.sheet_alive.get(sheet).copied().unwrap_or_default() {
            return false;
        }
        let data = &mut self.sheets[sheet];
        let Ok(row_count) = u32::try_from(data.cells.row_count()) else {
            return false;
        };

        match data
            .visibility
            .replace_kept(manual, kept.as_deref(), row_count)
        {
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

    /// Whether a formula may read the rows that views hide: a cell formula
    /// that calls SUBTOTAL or AGGREGATE, or a conditional-format formula rule.
    /// While none does, the host may hold back `setRowVisibility` and send
    /// the rows once one does; a formula previewed with `previewFormula`
    /// needs them sent first.
    #[wasm_bindgen(js_name = readsRowVisibility)]
    pub fn reads_row_visibility(&self) -> bool {
        self.formula_slots.has_subtotals() || self.conditional_rules.has_formula_rules()
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
            let Some(keys) = data.formulas.subtotal_keys(&self.formula_slots) else {
                continue;
            };
            let readers: Vec<CellKey> = keys
                .filter(|&key| {
                    data.formulas
                        .get(key, &self.formula_slots)
                        .is_some_and(reads_sheet)
                })
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
