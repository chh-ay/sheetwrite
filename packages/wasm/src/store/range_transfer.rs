use super::*;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferInput, TransferResult};

const RANGE_TAG: u32 = 0x32484d53;

#[wasm_bindgen]
impl RangeSnapshot {
    /// Transfer packed scalars and the local dictionary, never JS cell patches.
    #[wasm_bindgen(js_name = exportMemoryState)]
    pub fn export_memory_state(&self, sheet: u32) -> Vec<u8> {
        let mut out = Writer::new(RANGE_TAG);

        out.usize(self.rows);
        out.usize(self.cols);
        out.bytes(&self.kind);
        out.words(&self.payload);
        out.ints(&self.style);
        out.strings(&self.strings);
        out.usize(self.formulas.len());

        for (row, col, entry) in &self.formulas {
            out.u32(*row);
            out.u32(*col);
            super::transfer::write_formula(&mut out, entry, sheet);
        }

        out.0
    }
}

/// Check each cell's source kind, and that each string payload names a
/// string of the range's own pool, before any cell reaches the store.
#[cfg(any(target_arch = "wasm32", test))]
fn check_range_cells(kind: &[u8], payload: &[u64], strings: usize) -> TransferResult<()> {
    let kinds_valid = kind.iter().all(|&cell_kind| cell_kind <= KIND_FORMULA);
    let strings_valid = payload.iter().all(|&cell_payload| {
        let id = payload_str_id(cell_payload);
        id == NO_STRING || (id as usize) < strings
    });
    if !kinds_valid || !strings_valid {
        return Err("invalid transferred history cells".into());
    }

    Ok(())
}

#[cfg(any(target_arch = "wasm32", test))]
impl CellStore {
    fn read_range_memory(
        &self,
        bytes: TransferInput<'_>,
        sheet: u32,
        row_start: u32,
        col_start: u32,
    ) -> TransferResult<RangeSnapshot> {
        let mut input = Reader::new(bytes, RANGE_TAG)?;
        let rows = input.usize()?;
        let cols = input.usize()?;
        let kind = input.bytes()?;
        let payload = input.words()?;
        let style = input.ints()?;

        if rows.checked_mul(cols) != Some(kind.len())
            || kind.len() != payload.len()
            || kind.len() != style.len()
        {
            return Err("invalid transferred history dimensions".into());
        }

        let strings = input.strings()?;
        check_range_cells(&kind, &payload, strings.len())?;
        let mut formulas = Vec::new();

        for _ in 0..input.count()? {
            let row = input.u32()?;
            let col = input.u32()?;
            if row as usize >= rows || col as usize >= cols {
                return Err("invalid transferred history formula cell".into());
            }

            let entry = self.read_transfer_formula(
                &mut input,
                sheet,
                row_start.checked_add(row).ok_or("history row overflow")?,
                col_start
                    .checked_add(col)
                    .ok_or("history column overflow")?,
            )?;

            formulas.push((row, col, entry));
        }

        input.finish()?;

        Ok(RangeSnapshot {
            rows,
            cols,
            kind,
            payload,
            style,
            strings,
            formulas,
        })
    }
}

#[wasm_bindgen]
impl CellStore {
    #[cfg(target_arch = "wasm32")]
    #[wasm_bindgen(js_name = importRangeMemoryState)]
    pub fn import_range_memory_state(
        &self,
        bytes: js_sys::Uint8Array,
        sheet: u32,
        row_start: u32,
        col_start: u32,
    ) -> RangeSnapshot {
        self.read_range_memory(bytes, sheet, row_start, col_start)
            .unwrap_or_else(|error| wasm_bindgen::throw_str(&error))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cells::encode_str_id;

    /// A one-cell range transfer with no formulas.
    fn one_cell_range(kind: u8, payload: u64) -> Vec<u8> {
        let mut out = Writer::new(RANGE_TAG);
        out.usize(1);
        out.usize(1);
        out.bytes(&[kind]);
        out.words(&[payload]);
        out.ints(&[0]);
        out.strings(&StringStorage::new());
        out.usize(0);
        out.0
    }

    #[test]
    fn range_transfer_rejects_string_ids_outside_its_pool_and_unknown_kinds() {
        let mut store = CellStore::new();
        store.add_sheet(1, 1);

        let empty = one_cell_range(KIND_EMPTY, 0);
        assert!(store.read_range_memory(&empty, 0, 0, 0).is_ok());

        let missing_string = one_cell_range(KIND_STRING, encode_str_id(5));
        assert!(store.read_range_memory(&missing_string, 0, 0, 0).is_err());

        let unknown_kind = one_cell_range(KIND_FORMULA + 1, 0);
        assert!(store.read_range_memory(&unknown_kind, 0, 0, 0).is_err());
    }

    #[test]
    fn range_transfer_rejects_formulas_outside_the_range() {
        let mut store = CellStore::new();
        store.add_sheet(2, 2);
        store.set_formula(0, 0, 0, "=1+1", 0);
        let snapshot = store.capture_range(0, 0, 0, 1, 1).expect("captured range");
        let mut bytes = snapshot.export_memory_state(0);
        assert!(store.read_range_memory(&bytes, 0, 0, 0).is_ok());

        // The formula's row follows the cells, the strings and the formula count.
        let mut prefix = Writer::new(RANGE_TAG);
        prefix.usize(snapshot.rows);
        prefix.usize(snapshot.cols);
        prefix.bytes(&snapshot.kind);
        prefix.words(&snapshot.payload);
        prefix.ints(&snapshot.style);
        prefix.strings(&snapshot.strings);
        prefix.usize(snapshot.formulas.len());
        let row = prefix.0.len();
        bytes[row..row + 4].copy_from_slice(&1u32.to_le_bytes());

        assert!(store.read_range_memory(&bytes, 0, 0, 0).is_err());
    }
}
