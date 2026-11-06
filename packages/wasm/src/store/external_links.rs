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
    /// Formulas read the sheet when they are entered after it is added;
    /// until then, a reference to it is `#REF!`.
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
        self.sheet_lookup.insert(sheet_name_key(&name), handle);
        self.sheet_names[handle] = name;
        handle
    }
}
