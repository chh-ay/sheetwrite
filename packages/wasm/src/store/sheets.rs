//! Sheets: adding, naming, ordering and removing them, and binding the
//! formulas that wait for a sheet name.

use super::*;

#[wasm_bindgen]
impl CellStore {
    /// Allocate a sheet grid and return its numeric handle.
    #[wasm_bindgen(js_name = addSheet)]
    pub fn add_sheet(&mut self, n_cols: usize, row_count: usize) -> usize {
        match self.try_add_sheet(n_cols, row_count) {
            Ok(index) => {
                // SHEET and SHEETS count the tabs, so volatile formulas
                // recompute when one is added.
                self.recompute_with_volatile_sheets(Vec::new());
                index
            }
            Err(error) => wasm_bindgen::throw_str(&error),
        }
    }

    /// Allocate a logical sheet whose cell chunks materialize on page load or edit.
    #[wasm_bindgen(js_name = addPagedSheet)]
    pub fn add_paged_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> usize {
        match self.try_add_paged_sheet(n_cols, row_count, chunk_rows, byte_budget, max_dirty_cells)
        {
            Ok(index) => {
                self.recompute_with_volatile_sheets(Vec::new());
                index
            }
            Err(error) => wasm_bindgen::throw_str(&error),
        }
    }

    /// Like [`Self::add_paged_sheet`], but returns an error, such as an
    /// unsupported chunk size, instead of throwing a JavaScript exception, and
    /// does not recalculate volatile formulas.
    pub(crate) fn try_add_paged_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> Result<usize, String> {
        let index = self.sheets.len();
        self.sheets.push(SheetData::new_paged(
            n_cols,
            row_count,
            if chunk_rows == 0 {
                DEFAULT_PAGE_CHUNK_ROWS
            } else {
                chunk_rows
            },
            byte_budget,
            if max_dirty_cells == 0 {
                DEFAULT_MAX_PAGED_DIRTY_CELLS
            } else {
                max_dirty_cells
            },
        )?);
        self.sheet_names.push(String::new());
        self.sheet_alive.push(true);
        if let Some(order) = &mut self.sheet_order {
            order.push(index as u32);
        }

        Ok(index)
    }

    /// Gives the live `sheet` its stable `id` and display `name`, replacing
    /// earlier ones. Returns false, changing nothing, when another sheet holds
    /// `id` or the name is refused (see `admitted_sheet_name_key`).
    #[wasm_bindgen(js_name = setSheetName)]
    pub fn set_sheet_name(&mut self, sheet: usize, id: &str, name: &str) -> bool {
        if self
            .sheet_ids
            .get(id)
            .is_some_and(|holder| *holder != sheet)
        {
            return false;
        }
        let Some(name_key) = self.admitted_sheet_name_key(sheet, name) else {
            return false;
        };

        self.sheet_ids.retain(|_, handle| *handle != sheet);
        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet] = name.to_owned();
        self.sheet_ids.insert(id.to_owned(), sheet);
        self.sheet_lookup.insert(name_key, sheet);
        let affected = self.bind_pending_sheet_formulas(id, name);
        if !affected.is_empty() {
            self.recompute_seed_sheets(&affected);
        }

        true
    }

    /// Rename a live stable sheet handle and rewrite every resolved formula AST
    /// reference. Returns false, changing nothing, when `id` is not the sheet's
    /// or the name is refused (see `admitted_sheet_name_key`).
    #[wasm_bindgen(js_name = renameSheet)]
    pub fn rename_sheet(&mut self, sheet: usize, id: &str, name: &str) -> bool {
        if self.sheet_ids.get(id) != Some(&sheet) {
            return false;
        }
        let Some(name_key) = self.admitted_sheet_name_key(sheet, name) else {
            return false;
        };

        let mut affected = Vec::new();

        for (formula_sheet, data) in self.sheets.iter_mut().enumerate() {
            if !self.sheet_alive[formula_sheet] {
                continue;
            }

            let mut changed = false;
            let names = NameScope::new(&self.bindings, formula_sheet as u32);
            data.formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    changed |= entry.rename_sheet(sheet as u32, name, names);
                });

            if changed {
                data.formulas.mark_all_dirty();
                affected.push(formula_sheet);
            }
        }

        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet] = name.to_owned();
        self.sheet_lookup.insert(name_key, sheet);
        self.rename_sheet_in_named_formulas(sheet as u32, name);
        for pending_sheet in self.bind_pending_sheet_formulas(id, name) {
            if !affected.contains(&pending_sheet) {
                affected.push(pending_sheet);
            }
        }
        self.graph.invalidate();

        self.recompute_with_volatile_sheets(affected);

        true
    }

    /// Tombstone a stable sheet handle and invalidate every formula reference to it.
    #[wasm_bindgen(js_name = removeSheet)]
    pub fn remove_sheet(&mut self, sheet: usize) -> bool {
        if self.sheet_alive.get(sheet) != Some(&true) {
            return false;
        }

        let mut affected = Vec::new();

        for (formula_sheet, data) in self.sheets.iter_mut().enumerate() {
            if formula_sheet == sheet || !self.sheet_alive[formula_sheet] {
                continue;
            }

            let mut changed = false;
            let names = NameScope::new(&self.bindings, formula_sheet as u32);
            data.formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    changed |= entry.invalidate_sheet(sheet as u32, names);
                });

            if changed {
                data.formulas.mark_all_dirty();
                affected.push(formula_sheet);
            }
        }

        let mut changed_names = Vec::new();
        self.bindings.names.settled().retain(&mut |scope, spelling, definition| {
            let removed = scope == Some(sheet as u32)
                || matches!(definition, names::DefinedName::Range(range) if range.sheet == sheet as u32);
            if removed {
                changed_names.push(workbook_name_key(spelling));
            }
            !removed
        });
        self.remove_sheet_from_named_formulas(sheet as u32, &mut changed_names);

        // The references to these tables are on the removed sheet, so the
        // walk above already made them `#REF!`.
        let tables_before = self.bindings.tables.len();
        self.bindings
            .tables
            .retain_mut(|table| table.sheet != sheet as u32);
        if self.bindings.tables.len() != tables_before {
            self.add_names_over_tables(&mut changed_names);
        }

        self.sheet_ids.retain(|_, handle| *handle != sheet);
        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet].clear();
        for id in self.sheets[sheet].formulas.ids() {
            let _ = self.formula_slots.retire(id);
        }
        self.sheets[sheet] = SheetData::new(0, 0);
        self.conditional_rules.remove_sheet(sheet);
        self.sheet_alive[sheet] = false;
        self.forget_pivot_sheet(sheet);
        if let Some(order) = &mut self.sheet_order {
            order.retain(|&tab| tab != sheet as u32);
        }
        for span_sheet in self.refresh_sheet_spans() {
            if !affected.contains(&span_sheet) {
                affected.push(span_sheet);
            }
        }
        self.graph.invalidate();

        if changed_names.is_empty() {
            self.recompute_with_volatile_sheets(affected);
        } else {
            self.rebind_name_users(changed_names);
            self.recompute_all_sheets();
        }

        self.strings.request_collection();

        true
    }

    /// Set the workbook tab order: every live sheet handle exactly once.
    /// 3-D references such as `Sheet1:Sheet3!A1` span the tabs between their
    /// endpoints, so formulas whose span changed are re-placed, their
    /// dependencies patched, and their results recomputed. Rejects an order
    /// that omits, repeats or adds a handle.
    #[wasm_bindgen(js_name = setSheetOrder)]
    pub fn set_sheet_order(&mut self, order: &[u32]) -> bool {
        let mut seen = vec![false; self.sheet_alive.len()];
        let current = self.tab_order();
        let valid = order.len() == current.len()
            && order.iter().all(|&handle| {
                let index = handle as usize;
                let fresh =
                    self.sheet_alive.get(index).copied().unwrap_or_default() && !seen[index];
                if fresh {
                    seen[index] = true;
                }
                fresh
            });
        if !valid {
            return false;
        }
        if order == current.as_ref() {
            return true;
        }

        self.sheet_order = Some(Box::new(order.to_vec()));
        let affected = self.refresh_sheet_spans();
        // SHEET and SHEETS read the tab order, so volatile formulas
        // recompute too.
        self.recompute_with_volatile_sheets(affected);
        true
    }

    /// Row and column pairs of the formulas on `sheet` that hold a 3-D
    /// reference. A tab move can rewrite their text, so the host records
    /// their sources before the move to undo it exactly.
    #[wasm_bindgen(js_name = sheetSpanFormulaCells)]
    pub fn sheet_span_formula_cells(&self, sheet: usize) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        data.formulas
            .iter(&self.formula_slots)
            .filter(|(_, entry)| entry.ast.as_ref().is_some_and(ast_contains_sheet_span))
            .flat_map(|((row, col), _)| [row, col])
            .collect()
    }

    /// Rows in `sheet`; 0 when there is no such sheet.
    ///
    /// @enginePublic Engine hosts can read sheet dimensions without core metadata.
    #[wasm_bindgen(js_name = rowCount)]
    pub fn row_count(&self, sheet: usize) -> usize {
        self.sheets.get(sheet).map_or(0, |s| s.cells.row_count())
    }

    /// Columns in `sheet`; 0 when there is no such sheet.
    ///
    /// @enginePublic Engine hosts can read sheet dimensions without core metadata.
    #[wasm_bindgen(js_name = colCount)]
    pub fn col_count(&self, sheet: usize) -> usize {
        self.sheets.get(sheet).map_or(0, |s| s.cells.n_cols())
    }
}

impl CellStore {
    pub(crate) fn try_add_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
    ) -> Result<usize, String> {
        let cells = n_cols.saturating_mul(row_count);
        let sheet = if self.dense_cells_fit(None, cells) {
            SheetData::try_new(n_cols, row_count)?
        } else if self.local_paged_cells_fit(None, cells) {
            SheetData::try_new_local(n_cols, row_count)?
        } else {
            return Err(format!(
                "local sheet resource limit exceeded: {n_cols} columns by {row_count} rows passes {} cells across the workbook",
                self.local_paged_cell_limit
            ));
        };
        let index = self.sheets.len();
        self.sheets.push(sheet);
        self.sheet_names.push(String::new());
        self.sheet_alive.push(true);
        if let Some(order) = &mut self.sheet_order {
            order.push(index as u32);
        }
        Ok(index)
    }

    /// Moves a dense sheet to local pages, as growing past the dense cap does.
    #[cfg(test)]
    pub(crate) fn convert_sheet_to_local_paged(&mut self, sheet: usize) {
        self.sheets[sheet]
            .cells
            .convert_to_local_paged()
            .expect("a small sheet converts");
    }

    /// Whether dense sheets fit the dense-cell limit with one sheet, `sheet`
    /// when it exists already, holding `cells` cells densely.
    pub(super) fn dense_cells_fit(&self, sheet: Option<usize>, cells: usize) -> bool {
        let others = self
            .sheets
            .iter()
            .enumerate()
            .filter(|&(index, data)| {
                Some(index) != sheet && self.sheet_alive[index] && !data.cells.is_paged()
            })
            .map(|(_, data)| data.cells.row_count().saturating_mul(data.cells.n_cols()))
            .fold(0usize, usize::saturating_add);
        others.saturating_add(cells) <= self.dense_cell_limit
    }

    /// Whether local sheets fit the local-cell limit with one sheet,
    /// `sheet` when it exists already, holding `cells` logical cells.
    pub(super) fn local_paged_cells_fit(&self, sheet: Option<usize>, cells: usize) -> bool {
        let others = self
            .sheets
            .iter()
            .enumerate()
            .filter(|&(index, _)| Some(index) != sheet && self.sheet_alive[index])
            .map(|(_, data)| data.cells.local_paged_cells())
            .fold(0usize, usize::saturating_add);
        others.saturating_add(cells) <= self.local_paged_cell_limit
    }

    /// The one rule for naming a sheet: the sheet is live and the name is
    /// nonempty and held by no other sheet, case-insensitively. Returns the
    /// name's lookup key when admitted.
    fn admitted_sheet_name_key(&self, sheet: usize, name: &str) -> Option<String> {
        if name.is_empty() || self.sheet_alive.get(sheet) != Some(&true) {
            return None;
        }

        let name_key = sheet_name_key(name);
        let held_by_other = self
            .sheet_lookup
            .get(&name_key)
            .is_some_and(|holder| *holder != sheet);
        (!held_by_other).then_some(name_key)
    }

    /// Binds the formulas that wait for a sheet with this `id` or `name`, and
    /// returns the sheets that hold them. Only formulas whose retained tree
    /// names the sheet are visited, through the unresolved-sheet index. The
    /// index holds stable formula ids, so it stays correct when formulas move
    /// between cells.
    fn bind_pending_sheet_formulas(&mut self, id: &str, name: &str) -> Vec<usize> {
        let keys = [sheet_name_key(name), sheet_name_key(id)];
        let users = self.formula_slots.unresolved_sheet_users(&keys);
        if users.is_empty() {
            return Vec::new();
        }
        let order = self.tab_order().into_owned();
        let mut affected = Vec::new();
        for formula in users {
            let Some(location) = self.formula_slots.location(formula) else {
                continue;
            };
            let sheet = location.sheet as usize;
            let replacement = {
                let Some(entry) = self.formula_slots.get_mut(formula) else {
                    continue;
                };
                let ids = &self.sheet_ids;
                let lookup = &self.sheet_lookup;
                let names = NameScope::new(&self.bindings, location.sheet);
                crate::eval::with_formula_origin((location.row, location.col), || {
                    entry.bind_sheets(
                        names,
                        &|name| {
                            ids.get(name)
                                .or_else(|| lookup.get(&sheet_name_key(name)))
                                .map(|&handle| handle as u32)
                        },
                        &|span| place_span(span, &order),
                    )
                })
            };
            let Some(entry) = replacement else {
                continue;
            };
            let data = &mut self.sheets[sheet];
            self.graph.replace_entry(
                &mut data.formulas,
                &mut self.formula_slots,
                sheet,
                location.local(),
                Some(entry),
            );
            data.formulas.mark_cell_dirty(location.local());
            if !affected.contains(&sheet) {
                affected.push(sheet);
            }
        }
        affected
    }

    /// Resolve a sheet id or case-insensitive name to its stable handle.
    pub(super) fn sheet_handle(&self, name: &str) -> Option<u32> {
        self.sheet_ids
            .get(name)
            .or_else(|| self.sheet_lookup.get(&sheet_name_key(name)))
            .map(|&index| index as u32)
    }

    /// Binds the sheet references of a tree parsed outside a cell, such as a
    /// defined name or a measure, in place. Returns `#REF!` when the tree
    /// names a local sheet that does not exist.
    pub(super) fn resolve_sheets(&self, mut ast: Ast) -> Result<Ast, FormulaError> {
        bind_sheet_refs(&mut ast, &|name| self.sheet_handle(name), &|span| {
            place_span(span, &self.tab_order())
        });
        if has_unresolved_local_sheets(&ast) {
            return Err(FormulaError::Ref);
        }
        Ok(ast)
    }

    /// Live sheet handles in tab order.
    pub(crate) fn tab_order(&self) -> Cow<'_, [u32]> {
        match &self.sheet_order {
            Some(order) => Cow::Borrowed(order.as_slice()),
            None => Cow::Owned(
                (0..self.sheet_alive.len() as u32)
                    .filter(|&handle| self.sheet_alive[handle as usize])
                    .collect(),
            ),
        }
    }

    /// Re-places every 3-D reference after the tab order changed or a sheet
    /// was removed. Both are rare structural edits that already walk every
    /// formula, so the scan keeps no per-store index of 3-D formulas. A
    /// changed formula is replaced through the dependency index, which
    /// patches only that formula's reads, and is marked dirty. Returns the
    /// sheets whose formulas changed.
    fn refresh_sheet_spans(&mut self) -> Vec<usize> {
        let mut affected = Vec::new();
        let order = self.tab_order().into_owned();

        for (sheet, data) in self.sheets.iter_mut().enumerate() {
            if !self.sheet_alive[sheet] {
                continue;
            }
            let keys: Vec<_> = data
                .formulas
                .iter(&self.formula_slots)
                .filter(|(_, entry)| entry.ast.as_ref().is_some_and(ast_contains_sheet_span))
                .map(|(key, _)| key)
                .collect();

            let mut changed = false;
            for key in keys {
                let Some(mut entry) = data.formulas.get(key, &self.formula_slots).cloned() else {
                    continue;
                };
                let names = NameScope::new(&self.bindings, sheet as u32);
                let refreshed = crate::eval::with_formula_origin(key, || {
                    entry.refresh_sheet_spans(&order, &self.sheet_names, names)
                });
                if !refreshed {
                    continue;
                }
                self.graph.replace_entry(
                    &mut data.formulas,
                    &mut self.formula_slots,
                    sheet,
                    key,
                    Some(entry),
                );
                data.formulas.mark_cell_dirty(key);
                changed = true;
            }
            if changed {
                affected.push(sheet);
            }
        }

        affected
    }
}
