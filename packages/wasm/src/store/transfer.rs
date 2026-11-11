//! Same-build instance migration; never exposed as the document persistence format.

use super::*;
#[cfg(any(target_arch = "wasm32", test))]
use crate::calc::{is_external_sheet, RefFlags, SheetRef};
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferInput, TransferResult};
#[cfg(any(target_arch = "wasm32", test))]
use crate::types::{CellRange, ReadSet};

const STORE_TAG: u32 = 0x32524d53;

fn write_names(out: &mut Writer, names: &HashMap<String, usize>) {
    out.usize(names.len());
    for (name, &handle) in names {
        out.text(name);
        out.usize(handle);
    }
}

/// Read a sheet handle and check that it names one of the `sheets`
/// transferred sheets, so a malformed transfer fails while it is read
/// instead of panicking after the store is published.
#[cfg(any(target_arch = "wasm32", test))]
// One shared check instead of a copy at every handle the decoder reads.
#[inline(never)]
fn sheet_handle(input: &mut Reader<'_>, sheets: usize) -> TransferResult<u32> {
    let handle = input.u32()?;
    if handle as usize >= sheets {
        return Err("invalid transferred sheet handle".into());
    }

    Ok(handle)
}

#[cfg(any(target_arch = "wasm32", test))]
fn read_names(input: &mut Reader<'_>, sheets: usize) -> TransferResult<HashMap<String, usize>> {
    (0..input.count()?)
        .map(|_| Ok((input.text()?, sheet_handle(input, sheets)? as usize)))
        .collect()
}

pub(super) fn write_formula(out: &mut Writer, entry: &FormulaEntry, sheet: u32) {
    out.text(&entry.source());
    out.bool(entry.is_reference());

    if entry.is_reference() {
        let target = entry.reference_target(sheet).expect("reference target");
        out.u32(target.sheet);
        out.u32(target.row);
        out.u32(target.col);
    }

    out.bool(entry.ast.is_some());
    out.error(entry.source_error());
    out.bool(entry.volatile());
    out.bool(entry.has_spill_refs());
    out.bool(entry.produces_array());
    out.usize(entry.reads.cells.len());

    for key in &entry.reads.cells {
        out.u32(key.sheet);
        out.u32(key.row);
        out.u32(key.col);
    }

    out.usize(entry.reads.ranges.len());

    for range in &entry.reads.ranges {
        out.u32(range.sheet);
        out.u32(range.row_start);
        out.u32(range.col_start);
        out.u32(range.row_end);
        out.u32(range.col_end);
    }
}

#[cfg(any(target_arch = "wasm32", test))]
impl CellStore {
    pub(super) fn read_transfer_formula(
        &self,
        input: &mut Reader<'_>,
        sheet: u32,
        row: u32,
        col: u32,
    ) -> TransferResult<FormulaEntry> {
        let source = input.text()?;
        let sheets = self.sheet_names.len();

        let is_reference = input.bool()?;
        let reference_ast = if is_reference {
            let target = AbsCellKey {
                sheet: sheet_handle(input, sheets)?,
                row: input.u32()?,
                col: input.u32()?,
            };

            Some(Ast::AbsCell(
                SheetRef {
                    handle: target.sheet,
                    name: self.sheet_names[target.sheet as usize].clone(),
                    quoted: false,
                },
                target.row,
                target.col,
                RefFlags::default(),
            ))
        } else {
            None
        };

        let ast = if input.bool()? {
            if is_reference {
                reference_ast
            } else {
                Some(
                    self.resolve_formula_ast(&source, sheet, row, col)
                        .map_err(|_| "invalid transferred formula".to_string())?,
                )
            }
        } else {
            None
        };
        let source_error = input.error()?;
        let volatile = input.bool()?;
        let has_spill_refs = input.bool()?;
        let produces_array = input.bool()?;

        let cells = (0..input.count()?)
            .map(|_| {
                Ok(AbsCellKey {
                    sheet: sheet_handle(input, sheets)?,
                    row: input.u32()?,
                    col: input.u32()?,
                })
            })
            .collect::<TransferResult<Vec<_>>>()?;

        let ranges = (0..input.count()?)
            .map(|_| {
                Ok(CellRange {
                    sheet: sheet_handle(input, sheets)?,
                    row_start: input.u32()?,
                    col_start: input.u32()?,
                    row_end: input.u32()?,
                    col_end: input.u32()?,
                })
            })
            .collect::<TransferResult<Vec<_>>>()?;

        let mut entry =
            FormulaEntry::transferred_source(ast, source, ReadSet { cells, ranges }, is_reference);
        entry.set_source_error(source_error);
        entry.set_volatile(volatile);
        entry.set_has_spill_refs(has_spill_refs);
        entry.set_produces_array(produces_array);

        Ok(entry)
    }

    pub(crate) fn read_memory_state(bytes: TransferInput<'_>) -> TransferResult<Self> {
        let mut input = Reader::new(bytes, STORE_TAG)?;

        let mut store = Self::new();
        store.strings = input.strings()?;
        store.strings.epoch = store.strings.epoch.wrapping_add(1);

        for _ in 0..input.count()? {
            store.sheet_names.push(input.text()?);
            store.sheet_alive.push(input.bool()?);
        }

        // Resolve 3-D reference spans in their transferred tab order, which
        // lists each live sheet once. Sheet handles remain independent of
        // tab positions.
        let sheets = store.sheet_names.len();
        let mut placed = vec![false; sheets];
        let order = (0..input.count()?)
            .map(|_| {
                let handle = sheet_handle(&mut input, sheets)?;
                let index = handle as usize;
                if !store.sheet_alive[index] || std::mem::replace(&mut placed[index], true) {
                    return Err("invalid transferred tab order".to_string());
                }
                Ok(handle)
            })
            .collect::<TransferResult<Vec<_>>>()?;
        // Sheets of linked workbooks hold values but are not tabs.
        let tabs = store
            .sheet_alive
            .iter()
            .zip(&store.sheet_names)
            .filter(|&(&alive, name)| alive && !is_external_sheet(name))
            .count();
        if order.len() != tabs {
            return Err("invalid transferred tab order".into());
        }
        if order != store.tab_order().as_ref() {
            store.sheet_order = Some(Box::new(order));
        }

        store.sheet_lookup = read_names(&mut input, sheets)?;
        store.sheet_ids = read_names(&mut input, sheets)?;

        for _ in 0..input.count()? {
            let scope = if input.bool()? {
                Some(sheet_handle(&mut input, sheets)?)
            } else {
                None
            };

            let key = input.text()?;
            let range = NamedRangeRef {
                name: input.text()?,
                scope,
                sheet: sheet_handle(&mut input, sheets)?,
                row_start: input.u32()?,
                col_start: input.u32()?,
                row_end: input.u32()?,
                col_end: input.u32()?,
            };

            store
                .defined_names
                .insert((scope, key), names::DefinedName::Range(range));
        }

        for _ in 0..input.count()? {
            let scope = if input.bool()? {
                Some(sheet_handle(&mut input, sheets)?)
            } else {
                None
            };
            let name = input.text()?;
            let source = input.text()?;
            store.insert_transferred_named_formula(scope, name, source)?;
        }

        for _ in 0..input.count()? {
            let key = input.text()?;
            let mut table = TableDefinition {
                id: input.text()?,
                name: input.text()?,
                sheet: sheet_handle(&mut input, sheets)?,
                row_start: input.u32()?,
                col_start: input.u32()?,
                row_end: input.u32()?,
                col_end: input.u32()?,
                header_row: input.bool()?,
                totals_row: input.bool()?,
                columns: Vec::new(),
            };

            for _ in 0..input.count()? {
                table.columns.push(TableColumnDefinition {
                    id: input.text()?,
                    name: input.text()?,
                    col: input.u32()?,
                });
            }

            store.tables.insert(key, table);
        }

        // The formulas below bind to the names, so resolve them first.
        store.resolve_name_definitions();

        store.graph = FormulaGraph::read_transfer(&mut input)?;
        store.mutation_revision = input.u64()?;
        store.volatile_serial = f64::from_bits(input.u64()?);
        store.random = RandomSource::from_state(input.u64()?);
        store.spill_owner_cell_limit = input.usize()?;
        if input.bool()? {
            let max_iterations = input.u32()?;
            let max_change = f64::from_bits(input.u64()?);
            let limits = IterationLimits::new(max_iterations, max_change)
                .ok_or("invalid transferred iteration limits")?;
            store.iteration = Some(Box::new(limits));
        }

        let sheets = input.count()?;

        if sheets != store.sheet_names.len() {
            return Err("invalid transferred sheet handles".into());
        }

        for sheet in 0..sheets {
            let mut data = SheetData::read_transfer(&mut input)?;

            for _ in 0..input.count()? {
                let row = input.u32()?;
                let col = input.u32()?;
                let entry = store.read_transfer_formula(&mut input, sheet as u32, row, col)?;
                data.formulas
                    .insert((row, col), entry, sheet, &mut store.formula_slots);
            }

            store.sheets.push(data);
        }

        input.finish()?;

        Ok(store)
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Export only live state, not allocator slack or a dependency-index cache.
    #[wasm_bindgen(js_name = exportMemoryState)]
    pub fn export_memory_state(&self) -> Vec<u8> {
        if self.loading_page != 0 || self.active_mutation_revision.is_some() {
            wasm_bindgen::throw_str("engine memory release requires an idle store");
        }

        let mut out = Writer::new(STORE_TAG);
        out.strings(&self.strings);
        out.usize(self.sheet_names.len());

        for (name, &alive) in self.sheet_names.iter().zip(&self.sheet_alive) {
            out.text(name);
            out.bool(alive);
        }

        let order = self.tab_order();
        out.usize(order.len());
        for &handle in order.iter() {
            out.u32(handle);
        }

        write_names(&mut out, &self.sheet_lookup);
        write_names(&mut out, &self.sheet_ids);
        out.usize(
            self.defined_names
                .values()
                .filter(|name| matches!(name, names::DefinedName::Range(_)))
                .count(),
        );

        for ((scope, key), definition) in &self.defined_names {
            let names::DefinedName::Range(range) = definition else {
                continue;
            };
            out.bool(scope.is_some());
            if let Some(scope) = scope {
                out.u32(*scope);
            }

            out.text(key);
            out.text(&range.name);
            out.u32(range.sheet);
            out.u32(range.row_start);
            out.u32(range.col_start);
            out.u32(range.row_end);
            out.u32(range.col_end);
        }

        out.usize(
            self.defined_names
                .values()
                .filter(|name| matches!(name, names::DefinedName::Formula(_)))
                .count(),
        );
        for (scope, name, source) in self.named_formula_sources() {
            out.bool(scope.is_some());
            if let Some(scope) = scope {
                out.u32(scope);
            }
            out.text(name);
            out.text(source);
        }

        out.usize(self.tables.len());

        for (key, table) in &self.tables {
            out.text(key);
            out.text(&table.id);
            out.text(&table.name);
            out.u32(table.sheet);
            out.u32(table.row_start);
            out.u32(table.col_start);
            out.u32(table.row_end);
            out.u32(table.col_end);
            out.bool(table.header_row);
            out.bool(table.totals_row);
            out.usize(table.columns.len());
            for column in &table.columns {
                out.text(&column.id);
                out.text(&column.name);
                out.u32(column.col);
            }
        }

        self.graph.write_transfer(&mut out);
        out.u64(self.mutation_revision);
        out.u64(self.volatile_serial.to_bits());
        out.u64(self.random.state());
        out.usize(self.spill_owner_cell_limit);
        out.bool(self.iteration.is_some());
        if let Some(limits) = &self.iteration {
            out.u32(limits.max_iterations());
            out.u64(limits.max_change().to_bits());
        }
        out.usize(self.sheets.len());
        for (sheet, data) in self.sheets.iter().enumerate() {
            data.write_transfer(&mut out);
            out.usize(data.formulas.len());
            for ((row, col), entry) in data.formulas.iter(&self.formula_slots) {
                out.u32(row);
                out.u32(col);
                write_formula(&mut out, entry, sheet as u32);
            }
        }

        out.0
    }

    /// Import into a fresh instance; failure never mutates the source store.
    #[cfg(target_arch = "wasm32")]
    #[wasm_bindgen(js_name = importMemoryState)]
    pub fn import_memory_state(bytes: js_sys::Uint8Array) -> CellStore {
        Self::read_memory_state(bytes).unwrap_or_else(|error| wasm_bindgen::throw_str(&error))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_transfer_keeps_iterative_calculation() {
        let mut original = CellStore::new();
        original.add_sheet(2, 1);
        original.set_number(0, 0, 1, 1.0, 0);
        original.set_formula(0, 0, 0, "=A1+B1", 0);
        assert!(original.set_iterative_calculation(true, 3, 0.0));
        assert_eq!(original.get_cell(0, 0, 0).num(), 3.0);

        let mut replacement =
            CellStore::read_memory_state(&original.export_memory_state()).unwrap();
        replacement.set_number(0, 0, 1, 2.0, 0);
        replacement.recompute_changed();
        assert_eq!(replacement.get_cell(0, 0, 0).num(), 9.0);
    }

    #[test]
    fn memory_transfer_preserves_pending_rectangle_dirty_state() {
        const EDIT_ROWS: usize = 5000;
        let mut original = CellStore::new();
        original.add_sheet(3, EDIT_ROWS + 1);
        original.set_formula(0, 0, 1, "=SUM(A1:A5000)", 0);
        original.set_formula(0, 0, 2, "=\"survivor\"", 0);
        original.recompute_changed();
        original.set_column_numbers(0, 0, 0, &vec![1.0; EDIT_ROWS], 0);

        let mut replacement =
            CellStore::read_memory_state(&original.export_memory_state()).unwrap();

        assert_eq!(
            replacement.get_cell(0, 0, 2).string().as_deref(),
            Some("survivor")
        );
        replacement.recompute_changed();
        assert_eq!(replacement.get_cell(0, 0, 1).num(), EDIT_ROWS as f64);
        assert_eq!(
            replacement.get_cell(0, 0, 2).string().as_deref(),
            Some("survivor")
        );
    }

    #[test]
    fn memory_transfer_rejects_partial_payloads() {
        let mut original = CellStore::new();
        original.add_sheet(1, 1);
        original.set_number(0, 0, 0, 5.0, 0);
        let bytes = original.export_memory_state();

        for length in 0..bytes.len() {
            assert!(CellStore::read_memory_state(&bytes[..length]).is_err());
        }
    }

    /// A sheet handle that no transferred sheet has.
    const MISSING_SHEET: u32 = 9;

    /// Replace the `u32` that follows the last copy of `marker` in `bytes`.
    fn patch_u32_after(bytes: &mut [u8], marker: &[u8], value: u32) {
        let start = bytes
            .windows(marker.len())
            .rposition(|window| window == marker)
            .expect("marker in transfer")
            + marker.len();
        bytes[start..start + 4].copy_from_slice(&value.to_le_bytes());
    }

    #[test]
    fn memory_transfer_rejects_a_tab_order_with_a_missing_sheet() {
        let mut original = CellStore::new();
        original.add_sheet(1, 1);
        original.add_sheet(1, 1);
        let mut bytes = original.export_memory_state();

        // The tab order follows the strings and the sheet names.
        let mut prefix = Writer::new(STORE_TAG);
        prefix.strings(&original.strings);
        prefix.usize(original.sheet_names.len());
        for (name, &alive) in original.sheet_names.iter().zip(&original.sheet_alive) {
            prefix.text(name);
            prefix.bool(alive);
        }
        prefix.usize(original.tab_order().len());
        let first_handle = prefix.0.len();
        bytes[first_handle..first_handle + 4].copy_from_slice(&MISSING_SHEET.to_le_bytes());

        assert!(CellStore::read_memory_state(&bytes).is_err());
    }

    #[test]
    fn memory_transfer_rejects_tables_and_named_ranges_on_a_missing_sheet() {
        let mut original = CellStore::new();
        original.add_sheet(2, 2);
        assert!(original.set_named_range("Budget", -1, 0, 0, 0, 1, 1));
        assert!(original.set_table(
            "table-id",
            "Sales",
            0,
            0,
            0,
            1,
            0,
            true,
            false,
            vec!["column-id".into()],
            vec!["Amount".into()],
        ));
        let bytes = original.export_memory_state();
        assert!(CellStore::read_memory_state(&bytes).is_ok());

        // A named range's sheet follows its name; a table's follows its name.
        for marker in [b"Budget".as_slice(), b"Sales".as_slice()] {
            let mut tampered = bytes.clone();
            patch_u32_after(&mut tampered, marker, MISSING_SHEET);
            assert!(CellStore::read_memory_state(&tampered).is_err());
        }
    }

    #[test]
    fn memory_transfer_keeps_link_values_out_of_the_tabs() {
        let mut original = CellStore::new();
        let report = original.add_sheet(1, 2);
        original.set_sheet_name(report, "report", "Report");
        let annual = original.add_external_sheet("Budget.xlsx", "Annual", 1, 1);
        original.set_number(annual, 0, 0, 7.0, 0);
        original.set_formula(report, 0, 0, "=[Budget.xlsx]Annual!A1", 0);
        original.set_formula(report, 1, 0, "=SHEETS()", 0);
        original.recompute_changed();

        let mut replacement =
            CellStore::read_memory_state(&original.export_memory_state()).unwrap();
        replacement.set_number(annual, 0, 0, 9.0, 0);
        replacement.recompute_changed();
        assert_eq!(replacement.get_cell(report, 0, 0).num(), 9.0);
        assert_eq!(replacement.get_cell(report, 1, 0).num(), 1.0);
        assert_eq!(
            replacement.add_external_sheet("Budget.xlsx", "Annual", 1, 1),
            annual
        );
    }
}
