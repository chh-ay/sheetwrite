//! The cached values of linked workbooks. Each sheet of a link is a store
//! sheet that is not a tab: formulas read it through `[Book.xlsx]Sheet`
//! references, with the same cell storage, range reads and dependency
//! tracking as local sheets, but SHEETS, 3-D spans and the tab order do not
//! see it.

use wasm_bindgen::prelude::*;

use super::CellStore;
use crate::calc::sheet_name_key;

#[wasm_bindgen]
impl CellStore {
    /// Add the sheet `sheet` of the linked workbook `book` (its file name,
    /// such as `Budget.xlsx`) and return its handle. Set its cached values
    /// with the cell setters on that handle. When the store already holds
    /// that sheet, names compared without case, this returns its handle and
    /// changes nothing.
    ///
    /// Formulas that already name the sheet read it from now on; until a
    /// sheet is added, a reference to it is `#REF!`.
    #[wasm_bindgen(js_name = addExternalSheet)]
    pub fn add_external_sheet(
        &mut self,
        book: &str,
        sheet: &str,
        n_cols: usize,
        row_count: usize,
    ) -> usize {
        let name = format!("[{book}]{sheet}");
        if let Some(&existing) = self.sheet_lookup.get(&sheet_name_key(&name)) {
            return existing;
        }

        // The tabs are the sheets in the explicit order, so the link
        // sheet is left out of it.
        let tabs = self.tab_order().into_owned();
        let handle = match self.try_add_sheet(n_cols, row_count) {
            Ok(handle) => handle,
            Err(error) => wasm_bindgen::throw_str(&error),
        };
        self.sheet_order = Some(Box::new(tabs));
        let key = sheet_name_key(&name);
        self.sheet_lookup.insert(key.clone(), handle);
        self.sheet_names[handle] = name;
        self.relink_external_sheet(&key, Some(handle as u32));
        handle
    }

    /// Remove the sheet `sheet` of the linked workbook `book` and its values.
    /// Formulas that read it keep their text and show `#REF!` until the sheet
    /// is added again. Returns `false` when the store does not hold it.
    #[wasm_bindgen(js_name = removeExternalSheet)]
    pub fn remove_external_sheet(&mut self, book: &str, sheet: &str) -> bool {
        let key = sheet_name_key(&format!("[{book}]{sheet}"));
        let Some(&handle) = self.sheet_lookup.get(&key) else {
            return false;
        };

        // Unlink first, so removing the sheet leaves no reference to turn
        // into #REF! text.
        self.relink_external_sheet(&key, None);
        self.remove_sheet(handle)
    }
}

impl CellStore {
    /// Point every formula reference to the linked sheet `key` at `handle`,
    /// or back to an unresolved reference, and recalculate those formulas.
    fn relink_external_sheet(&mut self, key: &str, handle: Option<u32>) {
        let mut affected = Vec::new();
        for (formula_sheet, data) in self.sheets.iter_mut().enumerate() {
            if !self.sheet_alive[formula_sheet] {
                continue;
            }

            let mut changed = false;
            data.formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    changed |=
                        entry.relink_sheet(key, handle, formula_sheet as u32, &self.sheet_names);
                });
            if changed {
                data.formulas.mark_all_dirty();
                affected.push(formula_sheet);
            }
        }

        if !affected.is_empty() {
            self.graph.invalidate();
            self.recompute_with_volatile_sheets(affected);
        }
    }
}
