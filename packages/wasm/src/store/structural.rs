//! Row and column inserts and removals, and the reference rewrites they
//! cause in formulas, defined names and tables.

use super::*;

#[wasm_bindgen]
impl CellStore {
    /// Insert `count` rows at `at`. Returns `false` and changes nothing when
    /// the sheet is missing or cannot hold the rows.
    #[wasm_bindgen(js_name = addRows)]
    pub fn add_rows(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let rows = data.cells.row_count();
        let cols = data.cells.n_cols();
        let Some(new_rows) = rows.checked_add(count) else {
            return false;
        };
        if count == 0 {
            return true;
        }
        let clamped_at = at.min(rows);
        if !self.begin_structural_edit(sheet, new_rows, cols)
            || !self.finish_cell_edit(sheet, |data, slots, names| {
                data.insert_rows(names, clamped_at, count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_rows(sheet as u32, clamped_at as u32, count as i64);
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Rows,
            clamped_at as u32,
            count as i64,
        );
        true
    }

    /// Remove `count` rows from `at`, as many as the sheet has. Returns
    /// `false` and changes nothing when the sheet is missing or the edit is
    /// refused.
    #[wasm_bindgen(js_name = removeRows)]
    pub fn remove_rows(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let (rows, cols) = (data.cells.row_count(), data.cells.n_cols());
        if count == 0 || at >= rows {
            return true;
        }
        let clamped_count = count.min(rows - at);
        if !self.begin_structural_edit(sheet, rows - clamped_count, cols)
            || !self.finish_cell_edit(sheet, |data, slots, names| {
                data.delete_rows(names, at, clamped_count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_rows(sheet as u32, at as u32, -(clamped_count as i64));
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Rows,
            at as u32,
            -(clamped_count as i64),
        );
        true
    }

    /// Insert `count` columns at `at`. Returns `false` and changes nothing
    /// when the sheet is missing or cannot hold the columns.
    #[wasm_bindgen(js_name = insertCols)]
    pub fn insert_cols(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let (rows, cols) = (data.cells.row_count(), data.cells.n_cols());
        let Some(new_cols) = cols.checked_add(count) else {
            return false;
        };
        if count == 0 {
            return true;
        }
        let clamped_at = at.min(cols);
        if !self.begin_structural_edit(sheet, rows, new_cols)
            || !self.finish_cell_edit(sheet, |data, slots, names| {
                data.insert_cols(names, clamped_at, count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_cols(sheet as u32, clamped_at as u32, count as i64);
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Cols,
            clamped_at as u32,
            count as i64,
        );
        true
    }

    /// Remove `count` columns from `at`, as many as the sheet has. Returns
    /// `false` and changes nothing when the sheet is missing or the edit is
    /// refused.
    #[wasm_bindgen(js_name = removeCols)]
    pub fn remove_cols(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let (rows, cols) = (data.cells.row_count(), data.cells.n_cols());
        if count == 0 || at >= cols {
            return true;
        }
        let clamped_count = count.min(cols - at);
        if !self.begin_structural_edit(sheet, rows, cols - clamped_count)
            || !self.finish_cell_edit(sheet, |data, slots, names| {
                data.delete_cols(names, at, clamped_count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_cols(sheet as u32, at as u32, -(clamped_count as i64));
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Cols,
            at as u32,
            -(clamped_count as i64),
        );
        true
    }

    /// Checks that the sheet can take its new size, and moves a dense sheet
    /// to local pages when the new size passes the dense-cell limit. Then
    /// detaches spills and drops calculated values, which the edit moves.
    /// Returns `false`, changing nothing, when the new size passes the
    /// local-cell limit or the move to local pages fails.
    fn begin_structural_edit(&mut self, sheet: usize, rows: usize, cols: usize) -> bool {
        let cells = rows.saturating_mul(cols);
        let data = &self.sheets[sheet];
        // Dense sheets share the dense-cell limit across the workbook; a
        // dense sheet that would pass it continues in local pages.
        let to_local = !data.cells.is_paged() && !self.dense_cells_fit(Some(sheet), cells);
        if (to_local || data.cells.is_local_paged())
            && !self.local_paged_cells_fit(Some(sheet), cells)
        {
            return false;
        }
        let data = &mut self.sheets[sheet];
        if to_local && data.cells.convert_to_local_paged().is_err() {
            return false;
        }
        data.spill.clear_all(&mut data.cells);
        data.cells.invalidate_derived();
        true
    }
}

impl CellStore {
    fn rewrite_formula_rows(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            if formula_sheet as u32 != edited_sheet {
                let names = NameScope::new(&self.bindings, formula_sheet as u32);
                sheet
                    .formulas
                    .rewrite_entries(&mut self.formula_slots, |entry| {
                        entry.shift_rows(at, delta, names, edited_sheet);
                    });
            }
            sheet.formulas.mark_all_dirty();
        }
        self.drop_invalid_references();
        self.rebase_table_rows(edited_sheet, at, delta);
        let mut changed = Vec::new();
        self.rebase_named_ranges(edited_sheet, (at, delta), false, &mut changed);
        self.shift_named_formulas(edited_sheet, (at, delta), false, &mut changed);
        self.rebind_name_users(changed);
    }

    fn rewrite_formula_cols(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            if formula_sheet as u32 != edited_sheet {
                let names = NameScope::new(&self.bindings, formula_sheet as u32);
                sheet
                    .formulas
                    .rewrite_entries(&mut self.formula_slots, |entry| {
                        entry.shift_cols(at, delta, names, edited_sheet);
                    });
            }
            sheet.formulas.mark_all_dirty();
        }
        self.drop_invalid_references();
        self.rebase_table_cols(edited_sheet, at, delta);
        let mut changed = Vec::new();
        self.rebase_named_ranges(edited_sheet, (at, delta), true, &mut changed);
        self.shift_named_formulas(edited_sheet, (at, delta), true, &mut changed);
        self.rebind_name_users(changed);
    }

    /// Follow `block` (`from`, `count`, `to`) rows or, with `columns`,
    /// columns of `edited_sheet` that move, in every formula, defined name
    /// and table of the workbook. The cells themselves move afterwards.
    pub(crate) fn move_references(
        &mut self,
        edited_sheet: u32,
        columns: bool,
        block: (u32, u32, u32),
    ) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            let names = NameScope::new(&self.bindings, formula_sheet as u32);
            sheet
                .formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    entry.move_axis(edited_sheet, names, columns, block);
                });
            sheet.formulas.mark_all_dirty();
        }

        let (from, count, to) = block;
        for (_, table) in self
            .bindings
            .tables
            .iter_mut()
            .filter(|(_, table)| table.sheet == edited_sheet)
        {
            let span = if columns {
                (&mut table.col_start, &mut table.col_end)
            } else {
                (&mut table.row_start, &mut table.row_end)
            };
            if let Some(moved) = moved_span(*span.0, *span.1, from, count, to) {
                (*span.0, *span.1) = moved;
            }
            // Core refuses a move that splits a table, so the moved columns
            // fill the table's span again; each takes its new place.
            if columns {
                let mut placed: Vec<Option<TableColumn>> =
                    table.columns.iter().map(|_| None).collect();
                for mut column in std::mem::take(&mut table.columns) {
                    column.col = moved_index(column.col, from, count, to);
                    let slot = column.col.saturating_sub(table.col_start) as usize;
                    if let Some(empty) = placed.get_mut(slot) {
                        *empty = Some(column);
                    }
                }
                table.columns = placed.into_iter().flatten().collect();
            }
        }

        // Saved pivot output and pivot sources move as a delete where the
        // block was and an insert where it lands; core sends the moved
        // definitions again.
        let axis = if columns {
            pivot_output::ShiftAxis::Cols
        } else {
            pivot_output::ShiftAxis::Rows
        };
        self.shift_pivots(edited_sheet as usize, axis, from, -i64::from(count));
        self.shift_pivots(edited_sheet as usize, axis, to, i64::from(count));

        let mut changed = Vec::new();
        self.move_named_references(edited_sheet, columns, block, &mut changed);
        self.rebind_name_users(changed);
        self.graph.invalidate();
    }

    /// Follow a block of cells that moves, in every formula and defined
    /// name of the workbook. The cells themselves move afterwards.
    pub(crate) fn move_cell_references(&mut self, edit: &CellMove) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            let names = NameScope::new(&self.bindings, formula_sheet as u32);
            sheet
                .formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    entry.move_cells(names, edit);
                });
            sheet.formulas.mark_all_dirty();
        }

        let mut changed = Vec::new();
        self.move_named_cells(edit, &mut changed);
        self.rebind_name_users(changed);
    }

    /// Remove reference cells whose target an edit deleted.
    pub(crate) fn drop_invalid_references(&mut self) {
        for (sheet_index, sheet) in self.sheets.iter_mut().enumerate() {
            let invalid: Vec<_> = sheet
                .formulas
                .iter(&self.formula_slots)
                .filter_map(|(key, entry)| {
                    (entry.is_reference() && entry.reference_target(sheet_index as u32).is_none())
                        .then_some(key)
                })
                .collect();
            for key in invalid {
                sheet.formulas.remove(key, &mut self.formula_slots);
                let (row, col) = (key.0 as usize, key.1 as usize);
                if sheet.cells.contains_cell(row, col) {
                    let style = sheet.cells.style_at(sheet.cells.idx(row, col));
                    let _ = sheet.write_cell(row, col, KIND_EMPTY, 0, style, None);
                }
            }
        }
    }

    // A table's references follow the edit in each formula tree, so moving
    // or removing the table here leaves no formula naming a removed slot.
    fn rebase_table_rows(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        self.bindings.tables.retain_mut(|table| {
            if table.sheet != edited_sheet {
                return true;
            }
            let Some((start, end)) = shift_range(table.row_start, table.row_end, at, delta) else {
                return false;
            };
            table.row_start = start;
            table.row_end = end;
            true
        });
    }

    fn rebase_table_cols(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        self.bindings.tables.retain_mut(|table| {
            if table.sheet != edited_sheet {
                return true;
            }
            let Some((start, end)) = shift_range(table.col_start, table.col_end, at, delta) else {
                return false;
            };
            table.col_start = start;
            table.col_end = end;
            table.columns.retain_mut(|column| {
                let Some((col, _)) = shift_range(column.col, column.col, at, delta) else {
                    return false;
                };
                column.col = col;
                true
            });
            !table.columns.is_empty()
        });
    }
}
