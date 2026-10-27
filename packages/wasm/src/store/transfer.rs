//! Same-build instance migration; never exposed as the document persistence format.

use super::*;
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

#[cfg(any(target_arch = "wasm32", test))]
fn read_names(input: &mut Reader<'_>) -> TransferResult<HashMap<String, usize>> {
    (0..input.count()?)
        .map(|_| Ok((input.text()?, input.usize()?)))
        .collect()
}

pub(super) fn write_formula(out: &mut Writer, entry: &FormulaEntry, sheet: u32) {
    out.text(&entry.source);
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

        let mut entry = if input.bool()? {
            let target = AbsCellKey {
                sheet: input.u32()?,
                row: input.u32()?,
                col: input.u32()?,
            };

            FormulaEntry::reference(
                target,
                self.sheet_names
                    .get(target.sheet as usize)
                    .map_or("", String::as_str),
                sheet,
            )
        } else {
            self.parse_formula_entry(&source, sheet, row, col)
        };

        entry.source = source;

        if !input.bool()? {
            entry.ast = None;
        }

        entry.set_source_error(input.error()?);
        entry.set_volatile(input.bool()?);
        entry.set_has_spill_refs(input.bool()?);
        entry.set_produces_array(input.bool()?);

        let cells = (0..input.count()?)
            .map(|_| {
                Ok(AbsCellKey {
                    sheet: input.u32()?,
                    row: input.u32()?,
                    col: input.u32()?,
                })
            })
            .collect::<TransferResult<Vec<_>>>()?;

        let ranges = (0..input.count()?)
            .map(|_| {
                Ok(CellRange {
                    sheet: input.u32()?,
                    row_start: input.u32()?,
                    col_start: input.u32()?,
                    row_end: input.u32()?,
                    col_end: input.u32()?,
                })
            })
            .collect::<TransferResult<Vec<_>>>()?;

        entry.reads = ReadSet { cells, ranges };

        Ok(entry)
    }

    fn read_memory_state(bytes: TransferInput<'_>) -> TransferResult<Self> {
        let mut input = Reader::new(bytes, STORE_TAG)?;

        let mut store = Self::new();
        store.strings = input.strings()?;
        store.strings.epoch = store.strings.epoch.wrapping_add(1);

        for _ in 0..input.count()? {
            store.sheet_names.push(input.text()?);
            store.sheet_alive.push(input.bool()?);
        }

        // Formulas below are parsed again, and their 3-D references are
        // placed in this order. Handle order stays implicit, as it was.
        let order = (0..input.count()?)
            .map(|_| input.u32())
            .collect::<TransferResult<Vec<_>>>()?;
        if order != store.tab_order().as_ref() {
            store.sheet_order = Some(Box::new(order));
        }

        store.sheet_lookup = read_names(&mut input)?;
        store.sheet_ids = read_names(&mut input)?;

        for _ in 0..input.count()? {
            let scope = if input.bool()? {
                Some(input.u32()?)
            } else {
                None
            };

            let key = input.text()?;
            let range = NamedRangeRef {
                name: input.text()?,
                scope,
                sheet: input.u32()?,
                row_start: input.u32()?,
                col_start: input.u32()?,
                row_end: input.u32()?,
                col_end: input.u32()?,
            };

            store.named_ranges.insert((scope, key), range);
        }

        for _ in 0..input.count()? {
            let key = input.text()?;
            let mut table = TableDefinition {
                id: input.text()?,
                name: input.text()?,
                sheet: input.u32()?,
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
                data.formulas.insert((row, col), entry);
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
        out.usize(self.named_ranges.len());

        for ((scope, key), range) in &self.named_ranges {
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
            for ((row, col), entry) in data.formulas.iter() {
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

    #[cfg(feature = "analysis")]
    #[test]
    fn pivot_memory_transfer_rebuilds_from_resent_definition_without_formula_sources() {
        let mut original = CellStore::new();
        original.add_sheet(2, 10);
        original.add_sheet(4, 10);
        original.set_string(0, 0, 0, "Key", 0);
        original.set_string(0, 0, 1, "Value", 0);
        original.set_string(0, 1, 0, "A", 0);
        original.set_number(0, 1, 1, 7.0, 0);
        let definition = [
            0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, -1.0, 0.0,
            0.0, 3.0,
        ];
        assert!(original.set_pivots(1, &definition, vec!["pivot".into()]));
        original.recompute_changed();
        assert_eq!(original.get_cell(1, 1, 1).num(), 7.0);
        let bytes = original.export_memory_state();
        let mut replacement = CellStore::read_memory_state(&bytes).expect("same-build transfer");
        assert!(replacement.sheets[1].formulas.is_empty());
        assert_eq!(replacement.formula_source(1, 0, 0), None);
        assert!(replacement.set_pivots(1, &definition, vec!["pivot".into()]));
        replacement.recompute_changed();
        assert_eq!(replacement.get_cell(1, 1, 1).num(), 7.0);
        replacement.set_number(0, 1, 1, 11.0, 0);
        replacement.recompute_changed();
        assert_eq!(replacement.get_cell(1, 1, 1).num(), 11.0);
    }

    #[test]
    fn memory_transfer_preserves_cached_results_and_rebuilds_dependencies() {
        let mut original = CellStore::new();
        original.add_sheet(2, 5);
        original.set_number(0, 0, 0, 41.0, 7);
        original.set_formula(0, 0, 1, "=A1+1", 3);
        original.set_formula(0, 1, 1, "=NOW()", 0);
        original.recompute_changed();

        let cached_time = original.get_cell(0, 1, 1).num();
        let bytes = original.export_memory_state();
        let mut replacement = CellStore::read_memory_state(&bytes).unwrap();

        assert_eq!(replacement.get_cell(0, 0, 0).style(), 7);
        assert_eq!(replacement.get_cell(0, 0, 1).num(), 42.0);
        assert_eq!(
            replacement.get_cell(0, 1, 1).num().to_bits(),
            cached_time.to_bits()
        );

        replacement.set_number(0, 0, 0, 99.0, 7);
        replacement.recompute_changed();
        assert_eq!(replacement.get_cell(0, 0, 1).num(), 100.0);
        assert_eq!(original.get_cell(0, 0, 1).num(), 42.0);
    }

    #[test]
    fn memory_transfer_keeps_the_tab_order_of_three_d_references() {
        let mut original = CellStore::new();
        for (name, value) in [("First", 1.0), ("Middle", 10.0), ("Last", 100.0)] {
            let sheet = original.add_sheet(1, 1);
            original.set_sheet_name(sheet, name, name);
            original.set_number(sheet, 0, 0, value, 0);
        }
        let summary = original.add_sheet(1, 1);
        original.set_sheet_name(summary, "Summary", "Summary");
        assert!(original.set_sheet_order(&[0, 2, 1, 3]));
        original.set_formula(summary, 0, 0, "=SUM(First:Last!A1)", 0);
        original.recompute_changed();
        assert_eq!(original.get_cell(summary, 0, 0).num(), 101.0);

        let mut replacement =
            CellStore::read_memory_state(&original.export_memory_state()).unwrap();
        replacement.set_number(1, 0, 0, 20.0, 0);
        replacement.recompute_changed();
        assert_eq!(replacement.get_cell(summary, 0, 0).num(), 101.0);
        assert!(replacement.set_sheet_order(&[0, 1, 2, 3]));
        assert_eq!(replacement.get_cell(summary, 0, 0).num(), 121.0);
    }

    #[test]
    fn memory_transfer_continues_the_random_sequence_and_volatile_set() {
        let mut original = CellStore::new();
        original.add_sheet(2, 1);
        original.set_formula(0, 0, 1, "=RAND()", 0);
        original.recompute_changed();
        let cached_draw = original.get_cell(0, 0, 1).num();

        let bytes = original.export_memory_state();
        let mut replacement = CellStore::read_memory_state(&bytes).unwrap();
        for store in [&mut original, &mut replacement] {
            store.set_number(0, 0, 0, 1.0, 0);
            store.recompute_changed();
        }

        let next_draw = original.get_cell(0, 0, 1).num();
        assert_ne!(next_draw, cached_draw);
        assert_eq!(
            replacement.get_cell(0, 0, 1).num().to_bits(),
            next_draw.to_bits()
        );
    }

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
}
