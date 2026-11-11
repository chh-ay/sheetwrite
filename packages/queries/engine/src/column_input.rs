//! Host lanes move into a builder, then into a checked column without a second copy.

use wasm_bindgen::prelude::*;

use crate::buffers::row_index;
use crate::column::{Column, ColumnBuffers};
use crate::plan::Diagnostic;
use crate::transport::error;
use crate::wire::decode_type;

/// Packed metadata contains id, name, then an interned code pool for sparse error rows.
#[wasm_bindgen(js_name = ColumnBuilder)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct ColumnBuilder {
    rows: u32,
    buffers: ColumnBuffers,
}

#[wasm_bindgen]
impl ColumnBuilder {
    /// The constructor adopts metadata and masks; payload lanes arrive through typed setters.
    #[wasm_bindgen(constructor)]
    #[allow(
        clippy::too_many_arguments,
        reason = "a wasm-bindgen constructor; JavaScript passes each lane as its own argument"
    )]
    pub fn new(
        kind: u8,
        rows: u32,
        metadata: Vec<u8>,
        metadata_offsets: Vec<u32>,
        validity: Vec<u8>,
        error_rows: Vec<u32>,
        error_codes: Vec<u32>,
    ) -> Result<Self, JsValue> {
        Ok(Self {
            rows,
            buffers: ColumnBuffers {
                column_type: Some(decode_type(kind).map_err(error)?),
                metadata,
                metadata_offsets,
                validity,
                error_rows,
                error_codes,
                ..ColumnBuffers::default()
            },
        })
    }

    /// Ownership replaces the numeric lane; no per-cell bridge objects are created.
    #[wasm_bindgen(js_name = setNumbers)]
    pub fn set_numbers(&mut self, values: Vec<f64>) {
        self.buffers.numbers = values;
    }

    /// Bit i is logical lane i, with low bits first in each byte.
    #[wasm_bindgen(js_name = setLogical)]
    pub fn set_logical(&mut self, values: Vec<u8>) {
        self.buffers.logical = values;
    }

    /// Each offsets pair must describe a complete UTF-8 string at final admission.
    #[wasm_bindgen(js_name = setText)]
    pub fn set_text(&mut self, bytes: Vec<u8>, offsets: Vec<u32>) {
        self.buffers.text = bytes;
        self.buffers.offsets = offsets;
    }

    /// Dates use whole days from the Unix epoch, not worksheet serials.
    #[wasm_bindgen(js_name = setDates)]
    pub fn set_dates(&mut self, values: Vec<i32>) {
        self.buffers.dates = values;
    }

    /// Date/time payloads use microseconds and have no implicit host time zone.
    #[wasm_bindgen(js_name = setDateTimes)]
    pub fn set_date_times(&mut self, values: Vec<i64>) {
        self.buffers.date_times = values;
    }

    /// Tags select typed lanes; error-tag indexes select the metadata code pool.
    #[wasm_bindgen(js_name = setMixed)]
    pub fn set_mixed(&mut self, tags: Vec<u8>, indexes: Vec<u32>) {
        self.buffers.tags = tags;
        self.buffers.indexes = indexes;
    }
}

impl ColumnBuilder {
    /// Final admission validates masks, text boundaries, lane types, and every index.
    pub(crate) fn build(self) -> Result<Column, Diagnostic> {
        Column::from_buffers(self.buffers, row_index(self.rows)?)
    }
}
