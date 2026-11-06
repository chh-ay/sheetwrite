//! The cached values of linked workbooks. Each sheet of a link is a store
//! sheet that is not a tab: formulas read it through `[Book.xlsx]Sheet`
//! references, with the same cell storage, range reads and dependency
//! tracking as local sheets, but SHEETS, 3-D spans and the tab order do not
//! see it.
//!
//! A link also keeps the defined names of the linked workbook, each as a
//! range of a link sheet, so `Budget.xlsx!Total` reads the saved values the
//! name refers to.

use std::rc::Rc;

use wasm_bindgen::prelude::*;

use super::names::DefinedName;
use super::CellStore;
use crate::calc::{
    external_name_key, parse, sheet_name_key, Ast, NameTarget, NamedFormulaRef, NamedRangeRef,
};

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

    /// Add the defined name `name` of the linked workbook `book`, in the
    /// scope of its sheet `sheet` (empty for the workbook), as the link part
    /// saves it: `refers_to` is a reference such as `=Annual!$B$5` to a sheet
    /// of that workbook. Formulas that use the name read the saved values of
    /// that sheet, so add the sheet first. Returns `false`, adding nothing,
    /// when `refers_to` is not a cell or range of a sheet the store holds;
    /// formulas that use the name then show `#REF!`, as in Excel.
    #[wasm_bindgen(js_name = addExternalName)]
    pub fn add_external_name(
        &mut self,
        book: &str,
        sheet: &str,
        name: &str,
        refers_to: &str,
    ) -> bool {
        // A quoted formula doubles the quotes of the book and sheet names.
        let qualifier = format!("[{book}]{sheet}").replace('\'', "''");
        let Some(key) = external_name_key(&format!("{qualifier}!{name}")) else {
            return false;
        };
        let Some(range) = self.link_range(book, refers_to) else {
            return false;
        };

        let range = NamedRangeRef {
            name: name.to_string(),
            scope: None,
            ..range
        };
        self.defined_names
            .insert((None, key), DefinedName::Range(range));
        self.refresh_named_formula_entries();
        self.recompute_all_sheets();
        true
    }

    /// Remove every defined name of the linked workbook `book`. Formulas
    /// that use one show `#REF!` until it is added again.
    #[wasm_bindgen(js_name = removeExternalNames)]
    pub fn remove_external_names(&mut self, book: &str) {
        let prefix = sheet_name_key(&format!("[{book}]").replace('\'', "''"));
        let before = self.defined_names.len();
        self.defined_names
            .retain(|(scope, key), _| scope.is_some() || !key.starts_with(&prefix));
        if self.defined_names.len() != before {
            self.refresh_named_formula_entries();
            self.recompute_all_sheets();
        }
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
                    changed |= entry.relink_sheet(key, handle, formula_sheet as u32);
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

impl CellStore {
    /// What a defined name of another workbook stands for: the range it
    /// refers to on a link sheet, or `#REF!` when the link does not hold it.
    /// Out of line, so the name resolver of every formula stays small.
    #[inline(never)]
    pub(crate) fn external_name_target(&self, text: &str) -> NameTarget {
        let range =
            external_name_key(text).and_then(|key| match self.defined_names.get(&(None, key)) {
                Some(DefinedName::Range(range)) => Some(range),
                _ => None,
            });
        match range {
            Some(range) => NameTarget::Range(NamedRangeRef {
                name: text.to_string(),
                ..range.clone()
            }),
            None => NameTarget::Formula(Rc::new(NamedFormulaRef {
                name: text.to_string(),
                expression: Ast::InvalidRef,
                nodes: 1,
            })),
        }
    }

    /// The cell or range that `refers_to` names on a sheet of the linked
    /// workbook `book`, when the store holds that sheet.
    fn link_range(&self, book: &str, refers_to: &str) -> Option<NamedRangeRef> {
        let (sheet, cells) = match parse(refers_to).ok()? {
            Ast::SheetCell(sheet, row, col, _) => (sheet.name, (row, col, row, col)),
            Ast::SheetRange(sheet, r0, c0, r1, c1, _) => (sheet.name, (r0, c0, r1, c1)),
            _ => return None,
        };
        let handle = *self
            .sheet_lookup
            .get(&sheet_name_key(&format!("[{book}]{sheet}")))?;
        let (row_start, col_start, row_end, col_end) = cells;
        Some(NamedRangeRef {
            name: String::new(),
            scope: None,
            sheet: handle as u32,
            row_start,
            col_start,
            row_end,
            col_end,
        })
    }
}
