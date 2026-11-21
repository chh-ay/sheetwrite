//! Tables: the registry, and rebinding the formulas that use a table when
//! it changes.

use super::*;

const MAX_TABLES: usize = 1_024;
const MAX_TABLE_COLUMNS: usize = 16_384;
const MAX_TABLE_NAME_BYTES: usize = 255;
const MAX_TABLE_ID_BYTES: usize = 128;

/// Makes the new entry of the formula in the cell it is given after a table
/// edit, reading the tables (and the defined names) of the formula's sheet as
/// they are now; `None` leaves it unchanged.
type TableRebind<'a> =
    dyn Fn(&mut FormulaEntry, AbsCellKey, NameScope<'_>) -> Option<FormulaEntry> + 'a;

/// Whether an edit of a table from `previous` to `table` only added rows
/// around its data, keeping its sheet, columns, names, header and totals:
/// the rows a `[@Column]` reads are still in the table, so only the
/// formulas that read whole sections need new cells.
fn rows_only_grew(previous: &Table, table: &Table) -> bool {
    let same_columns = previous.columns.len() == table.columns.len()
        && previous
            .columns
            .iter()
            .zip(&table.columns)
            .all(|(before, after)| {
                before.id == after.id && before.name == after.name && before.col == after.col
            });
    same_columns
        && previous.name == table.name
        && previous.sheet == table.sheet
        && previous.header_row == table.header_row
        && previous.totals_row == table.totals_row
        && table.row_start <= previous.row_start
        && table.row_end >= previous.row_end
}

#[wasm_bindgen]
impl CellStore {
    /// Add the table `id`, or replace it, over the cells
    /// `row_start..=row_end`, `col_start..=col_end` of `sheet`: one column
    /// per entry of `column_ids`, named by `column_names`, with an optional
    /// header row and totals row. The formulas that use the table, or that
    /// waited for a table of this name, are bound again. Rejects an empty
    /// or over-long id or name, a name that is not formula-safe or that a
    /// defined name or another table has, a removed sheet, a range outside
    /// the sheet or whose width differs from the column count, repeated
    /// column ids or names, and a range that overlaps another table.
    #[wasm_bindgen(js_name = setTable)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn set_table(
        &mut self,
        id: &str,
        name: &str,
        sheet: usize,
        row_start: usize,
        col_start: usize,
        row_end: usize,
        col_end: usize,
        header_row: bool,
        totals_row: bool,
        column_ids: Vec<String>,
        column_names: Vec<String>,
    ) -> bool {
        let existing = self.bindings.tables.with_id(id).map(|(slot, _)| slot);
        if (existing.is_none() && self.bindings.tables.len() >= MAX_TABLES)
            || id.is_empty()
            || id.encode_utf16().count() > MAX_TABLE_ID_BYTES
            || name.is_empty()
            || name.encode_utf16().count() > MAX_TABLE_NAME_BYTES
            || column_ids.is_empty()
            || column_ids.len() > MAX_TABLE_COLUMNS
            || column_ids.len() != column_names.len()
            || self.sheet_alive.get(sheet) != Some(&true)
            || row_start > row_end
            || col_start > col_end
            || row_end >= self.sheets[sheet].cells.row_count()
            || col_end >= self.sheets[sheet].cells.n_cols()
            || col_end - col_start + 1 != column_ids.len()
            || (header_row && totals_row && row_start == row_end)
            || !matches!(parse(name), Ok(crate::calc::Ast::Name(_)))
        {
            return false;
        }
        let name_key = workbook_name_key(name);
        if self.bindings.names.defines(&name_key) {
            return false;
        }
        if self
            .bindings
            .tables
            .named(name)
            .is_some_and(|(_, table)| table.id != id)
        {
            return false;
        }
        let mut ids = FxHashSet::with_capacity_and_hasher(column_ids.len(), FxBuildHasher);
        let mut names = FxHashSet::with_capacity_and_hasher(column_names.len(), FxBuildHasher);
        let mut columns = Vec::with_capacity(column_ids.len());
        for (column_index, (column_id, column_name)) in
            column_ids.into_iter().zip(column_names).enumerate()
        {
            let column_key = workbook_name_key(&column_name);
            if column_id.is_empty()
                || column_id.encode_utf16().count() > MAX_TABLE_ID_BYTES
                || column_name.is_empty()
                || column_name.encode_utf16().count() > MAX_TABLE_NAME_BYTES
                || column_name.contains(['[', ']', ','])
                || column_name.starts_with(['@', '#'])
                || !ids.insert(workbook_name_key(&column_id))
                || !names.insert(column_key)
            {
                return false;
            }
            columns.push(TableColumn {
                id: column_id,
                name: column_name,
                col: col_start as u32 + column_index as u32,
            });
        }
        let definition = Table {
            id: id.to_owned(),
            name: name.to_owned(),
            sheet: sheet as u32,
            row_start: row_start as u32,
            col_start: col_start as u32,
            row_end: row_end as u32,
            col_end: col_end as u32,
            header_row,
            totals_row,
            columns,
        };
        if self.bindings.tables.iter().any(|(_, other)| {
            other.id != id
                && other.sheet == definition.sheet
                && definition.row_start <= other.row_end
                && definition.row_end >= other.row_start
                && definition.col_start <= other.col_end
                && definition.col_end >= other.col_start
        }) {
            return false;
        }
        let (slot, previous) = match existing {
            Some(slot) => (slot, self.bindings.tables.replace(slot, definition)),
            None => (self.bindings.tables.insert(definition), None),
        };
        self.after_table_edit(slot, previous.as_ref());
        #[cfg(feature = "analysis")]
        self.invalidate_table_pivots();
        self.recompute_all_sheets();
        true
    }

    /// Remove the table `id`. Its references in formulas become `#REF!`.
    /// Returns whether the table existed.
    #[wasm_bindgen(js_name = removeTable)]
    pub fn remove_table(&mut self, id: &str) -> bool {
        let Some(slot) = self.bindings.tables.with_id(id).map(|(slot, _)| slot) else {
            return false;
        };
        let removed = self.bindings.tables.remove(slot);
        self.after_table_edit(slot, removed.as_ref());
        #[cfg(feature = "analysis")]
        self.invalidate_table_pivots();
        self.recompute_all_sheets();
        true
    }
}

impl CellStore {
    #[cfg(feature = "analysis")]
    pub(super) fn resolve_structured_reference(
        &self,
        reference: &crate::calc::UnresolvedStructuredRef,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> Option<StructuredRef> {
        self.bindings.tables.bind(
            reference.written(),
            AbsCellKey {
                sheet: formula_sheet,
                row: formula_row,
                col: formula_col,
            },
        )
    }

    /// Follow an edit of the table in `slot`, which held `replaced` (`None`
    /// for a new table): refresh the cells of the formulas that use it, by
    /// stable column id, and bind the formulas whose table reference waited
    /// for a table. Only those formulas change; their reads are patched in
    /// the dependency index and they recalculate. A defined name's formula
    /// uses tables through expansions the index does not list, so the users
    /// of such names are bound again too.
    fn after_table_edit(&mut self, slot: u16, replaced: Option<&Table>) {
        if let Some(previous) = replaced {
            let own_rows = !self
                .bindings
                .tables
                .get(slot)
                .is_some_and(|table| rows_only_grew(previous, table));
            let users = self.formula_slots.table_users(slot, own_rows);
            self.rebind_table_users(users, &|entry, _, names| {
                let refresh = |reference: &StructuredRef| {
                    let table = names.tables().get(slot)?;
                    let column_id = &previous.column_at(reference.col)?.id;
                    let column = table
                        .columns
                        .iter()
                        .find(|column| column.id == *column_id)?;
                    let refreshed =
                        table.reference(slot, column, reference.section, reference.row_start)?;
                    Some(StructuredRef {
                        qualified: reference.qualified,
                        ..refreshed
                    })
                };
                entry.refresh_table(slot, names, &refresh)
            });
        }
        // The formulas holding a table reference that no table bound may
        // bind now. Their text stays as typed.
        let waiting = self.formula_slots.unbound_table_users();
        self.rebind_table_users(waiting, &|entry, location, names| {
            entry.bind_tables(location, names)
        });
        let mut changed = Vec::new();
        self.add_names_over_tables(&mut changed);
        self.rebind_name_users(changed);
    }

    /// Give each of `formulas` the entry `rebind` makes of it, if any: the
    /// dependency index patches its reads and the formula recalculates.
    /// Out of line, so the two table passes share one copy of the loop.
    #[inline(never)]
    fn rebind_table_users(&mut self, formulas: Vec<FormulaId>, rebind: &TableRebind<'_>) {
        for formula in formulas {
            let Some(location) = self.formula_slots.location(formula) else {
                continue;
            };
            let names = NameScope::new(&self.bindings, location.sheet);
            if let Some(entry) = self.formula_slots.get_mut(formula).and_then(|entry| {
                crate::eval::with_formula_origin((location.row, location.col), || {
                    rebind(entry, location, names)
                })
            }) {
                self.replace_bound_formula(location, entry);
            }
        }
    }

    /// Resolves the table references of a formula in the cell at
    /// (`formula_row`, `formula_col`) of `formula_sheet`.
    #[cfg(feature = "analysis")]
    pub(super) fn resolve_table_refs(
        &self,
        ast: &mut Ast,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) {
        crate::calc::resolve_structured_refs(
            ast,
            formula_sheet,
            formula_row,
            formula_col,
            &|reference, sheet, row, col| {
                self.resolve_structured_reference(reference, sheet, row, col)
            },
        );
    }
}
