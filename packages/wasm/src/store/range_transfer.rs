use super::*;
use crate::transfer::{Reader, TransferResult, Writer};

const RANGE_TAG: u32 = 0x31484d53;

#[wasm_bindgen]
impl RangeSnapshot {
    /// Transfer packed scalars and the local dictionary, never JS cell patches.
    #[wasm_bindgen(js_name = exportMemoryState)]
    pub fn export_memory_state(&self, sheet: u32) -> Vec<u8> {
        let mut out = Writer::new(RANGE_TAG);
        out.usize(self.rows); out.usize(self.cols);
        out.bytes(&self.kind); out.words(&self.payload); out.ints(&self.style);
        out.strings(&self.strings);
        out.usize(self.formulas.len());
        for (row, col, entry) in &self.formulas {
            out.u32(*row); out.u32(*col);
            super::transfer::write_formula(&mut out, entry, sheet);
        }
        out.0
    }
}

impl CellStore {
    fn read_range_memory(&self, bytes: &[u8], sheet: u32, row_start: u32, col_start: u32) -> TransferResult<RangeSnapshot> {
        let mut input = Reader::new(bytes, RANGE_TAG)?;
        let rows = input.usize()?; let cols = input.usize()?;
        let kind = input.bytes()?; let payload = input.words()?; let style = input.ints()?;
        if rows.checked_mul(cols) != Some(kind.len()) || kind.len() != payload.len() || kind.len() != style.len() {
            return Err("invalid transferred history dimensions".into());
        }
        let strings = input.strings()?;
        let mut formulas = Vec::new();
        for _ in 0..input.count()? {
            let row = input.u32()?; let col = input.u32()?;
            let entry = self.read_transfer_formula(&mut input, sheet, row_start.checked_add(row).ok_or("history row overflow")?, col_start.checked_add(col).ok_or("history column overflow")?)?;
            formulas.push((row, col, entry));
        }
        input.finish()?;
        Ok(RangeSnapshot { rows, cols, kind, payload, style, strings, formulas })
    }
}

#[wasm_bindgen]
impl CellStore {
    #[wasm_bindgen(js_name = importRangeMemoryState)]
    pub fn import_range_memory_state(&self, bytes: &[u8], sheet: u32, row_start: u32, col_start: u32) -> Result<RangeSnapshot, JsError> {
        self.read_range_memory(bytes, sheet, row_start, col_start).map_err(|error| JsError::new(&error))
    }
}
