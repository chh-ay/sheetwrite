//! Take-once typed buffers keep ownership and transfer cost visible at the WASM seam.

use std::mem;

use wasm_bindgen::prelude::*;

use crate::buffers::{at, flat_index, row_index};
use crate::column::{Batch, Column, ColumnBuffers};
use crate::plan::{ColumnSpec, Diagnostic, Limits, SourceSpec};
use crate::wire::{decode_strings, decode_type, encode_type};

const JSON_FORMAT: u8 = 0;
const CSV_FORMAT: u8 = 1;
const CSV_OPTION_COUNT: usize = 3;

/// A thrown failure carries stable codes and coordinates, never source data.
#[wasm_bindgen(js_name = QueryFailure)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct QueryFailure {
    code: String,
    column: String,
    step: Option<u32>,
    row: Option<u32>,
}

#[wasm_bindgen]
impl QueryFailure {
    /// Single-use error code transfer; a repeated call returns empty text.
    #[wasm_bindgen(js_name = takeCode)]
    pub fn take_code(&mut self) -> String {
        mem::take(&mut self.code)
    }

    /// Single-use column identity transfer; absent context is empty text.
    #[wasm_bindgen(js_name = takeColumn)]
    pub fn take_column(&mut self) -> String {
        mem::take(&mut self.column)
    }

    /// Zero-based failed step, if execution had reached a step.
    #[wasm_bindgen(getter, js_name = step)]
    #[allow(
        clippy::missing_const_for_fn,
        reason = "wasm-bindgen cannot export a const fn"
    )]
    pub fn step(&self) -> Option<u32> {
        self.step
    }

    /// Zero-based input row, if the failure belongs to a specific row.
    #[wasm_bindgen(getter, js_name = row)]
    #[allow(
        clippy::missing_const_for_fn,
        reason = "wasm-bindgen cannot export a const fn"
    )]
    pub fn row(&self) -> Option<u32> {
        self.row
    }
}

/// Invalid coordinates become a limit failure before crossing the host seam.
pub(crate) fn error(issue: Diagnostic) -> JsValue {
    let coordinates = issue
        .step
        .map(flat_index)
        .transpose()
        .and_then(|step| issue.row.map(flat_index).transpose().map(|row| (step, row)));

    let failure = match coordinates {
        Ok((step, row)) => QueryFailure {
            code: issue.code,
            column: issue.column.unwrap_or_default(),
            step,
            row,
        },
        Err(_) => QueryFailure {
            code: String::from("limit"),
            column: String::new(),
            step: None,
            row: None,
        },
    };

    failure.into()
}

/// An output column owns each lane until its matching take method moves it out.
#[wasm_bindgen(js_name = QueryColumn)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct QueryColumn {
    buffers: ColumnBuffers,
}

#[wasm_bindgen]
impl QueryColumn {
    /// A scalar type code does not transfer a payload buffer.
    #[wasm_bindgen(getter, js_name = columnType)]
    pub fn column_type(&self) -> Result<u8, JsValue> {
        self.buffers
            .column_type
            .map(encode_type)
            .ok_or_else(|| error(Diagnostic::new("type")))
    }

    /// Single-use UTF-8 transfer: id, name, then interned error codes.
    #[wasm_bindgen(js_name = takeMetadata)]
    pub fn take_metadata(&mut self) -> Vec<u8> {
        mem::take(&mut self.buffers.metadata)
    }

    /// Single-use offsets for the UTF-8 metadata strings.
    #[wasm_bindgen(js_name = takeMetadataOffsets)]
    pub fn take_metadata_offsets(&mut self) -> Vec<u32> {
        mem::take(&mut self.buffers.metadata_offsets)
    }

    /// Single-use packed mask; bit i is valid only for a non-null, non-error row.
    #[wasm_bindgen(js_name = takeValidity)]
    pub fn take_validity(&mut self) -> Vec<u8> {
        mem::take(&mut self.buffers.validity)
    }

    /// Single-use sorted sparse physical row indexes for errors.
    #[wasm_bindgen(js_name = takeErrorRows)]
    pub fn take_error_rows(&mut self) -> Vec<u32> {
        mem::take(&mut self.buffers.error_rows)
    }

    /// Single-use code indexes; code i is metadata string i + 2.
    #[wasm_bindgen(js_name = takeErrorCodes)]
    pub fn take_error_codes(&mut self) -> Vec<u32> {
        mem::take(&mut self.buffers.error_codes)
    }

    /// Single-use numeric payload transfer; a repeated call returns an empty lane.
    #[wasm_bindgen(js_name = takeNumbers)]
    pub fn take_numbers(&mut self) -> Vec<f64> {
        mem::take(&mut self.buffers.numbers)
    }

    /// Single-use packed logical payload transfer.
    #[wasm_bindgen(js_name = takeLogical)]
    pub fn take_logical(&mut self) -> Vec<u8> {
        mem::take(&mut self.buffers.logical)
    }

    /// Single-use UTF-8 payload transfer; offsets must be taken separately.
    #[wasm_bindgen(js_name = takeText)]
    pub fn take_text(&mut self) -> Vec<u8> {
        mem::take(&mut self.buffers.text)
    }

    /// Single-use payload offsets, including the final byte-length sentinel.
    #[wasm_bindgen(js_name = takeOffsets)]
    pub fn take_offsets(&mut self) -> Vec<u32> {
        mem::take(&mut self.buffers.offsets)
    }

    /// Single-use day counts relative to the Unix epoch.
    #[wasm_bindgen(js_name = takeDates)]
    pub fn take_dates(&mut self) -> Vec<i32> {
        mem::take(&mut self.buffers.dates)
    }

    /// Single-use microsecond timestamps without a zone.
    #[wasm_bindgen(js_name = takeDateTimes)]
    pub fn take_date_times(&mut self) -> Vec<i64> {
        mem::take(&mut self.buffers.date_times)
    }

    /// Single-use mixed tags; null and error have different codes.
    #[wasm_bindgen(js_name = takeTags)]
    pub fn take_tags(&mut self) -> Vec<u8> {
        mem::take(&mut self.buffers.tags)
    }

    /// Single-use mixed lane positions or interned error-code positions.
    #[wasm_bindgen(js_name = takeIndexes)]
    pub fn take_indexes(&mut self) -> Vec<u32> {
        mem::take(&mut self.buffers.indexes)
    }
}

/// Packed column types pair with interleaved id/name strings; no row objects are needed.
#[wasm_bindgen(js_name = QuerySchema)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct QuerySchema {
    columns: Vec<ColumnSpec>,
}

#[wasm_bindgen]
impl QuerySchema {
    /// Metadata strings alternate stable column id and source display name.
    #[wasm_bindgen(constructor)]
    pub fn new(types: &[u8], text: &[u8], offsets: &[u32]) -> Result<Self, JsValue> {
        let strings = decode_strings(text, offsets).map_err(error)?;
        if strings.len()
            != types
                .len()
                .checked_mul(2)
                .ok_or_else(|| error(Diagnostic::limit()))?
        {
            return Err(error(Diagnostic::new("shape")));
        }

        let mut names = strings.into_iter();
        let mut columns = Vec::with_capacity(types.len());
        for kind in types {
            let id = names
                .next()
                .ok_or_else(|| error(Diagnostic::new("shape")))?;
            let name = names
                .next()
                .ok_or_else(|| error(Diagnostic::new("shape")))?;
            columns.push(ColumnSpec {
                id,
                name,
                column_type: decode_type(*kind).map_err(error)?,
            });
        }

        Ok(Self { columns })
    }
}

/// A batch owns columns until execution consumes it or takeColumn transfers one out.
#[wasm_bindgen(js_name = QueryBatch)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct QueryBatch {
    columns: Vec<Option<Column>>,
    rows: u32,
}

#[wasm_bindgen]
impl QueryBatch {
    /// Row count is explicitly u32, matching the flat index format.
    #[wasm_bindgen(constructor)]
    #[allow(
        clippy::missing_const_for_fn,
        reason = "wasm-bindgen cannot export a const fn"
    )]
    pub fn new(rows: u32) -> Self {
        Self {
            columns: Vec::new(),
            rows,
        }
    }

    /// Consumes a column; all columns must have the batch's physical row count.
    #[wasm_bindgen(js_name = addColumn)]
    pub fn add_column(
        &mut self,
        column: crate::column_input::ColumnBuilder,
    ) -> Result<(), JsValue> {
        let built = column.build().map_err(error)?;
        if built.len() != row_index(self.rows).map_err(error)? {
            return Err(error(Diagnostic::new("shape")));
        }

        flat_index(
            self.columns
                .len()
                .checked_add(1)
                .ok_or_else(|| error(Diagnostic::limit()))?,
        )
        .map_err(error)?;
        self.columns.push(Some(built));
        Ok(())
    }

    /// Scalar row count does not transfer the column buffers.
    #[wasm_bindgen(getter, js_name = rowCount)]
    #[allow(
        clippy::missing_const_for_fn,
        reason = "wasm-bindgen cannot export a const fn"
    )]
    pub fn row_count(&self) -> u32 {
        self.rows
    }

    /// Scalar column count is checked against the transfer format's u32 limit.
    #[wasm_bindgen(getter, js_name = columnCount)]
    pub fn column_count(&self) -> Result<u32, JsValue> {
        flat_index(self.columns.len()).map_err(error)
    }

    /// Transfers one column once; taking an absent or consumed column is an error.
    #[wasm_bindgen(js_name = takeColumn)]
    pub fn take_column(&mut self, index: u32) -> Result<QueryColumn, JsValue> {
        let position = row_index(index).map_err(error)?;
        let column = self
            .columns
            .get_mut(position)
            .and_then(Option::take)
            .ok_or_else(|| error(Diagnostic::new("column")))?;

        Ok(QueryColumn {
            buffers: column.into_buffers().map_err(error)?,
        })
    }
}

impl QueryBatch {
    fn into_batch(self, limits: &Limits) -> Result<Batch, Diagnostic> {
        let columns = self
            .columns
            .into_iter()
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| Diagnostic::new("consumed"))?;

        Batch::new(columns, row_index(self.rows)?, limits)
    }

    fn from_batch(batch: Batch) -> Result<Self, Diagnostic> {
        let rows = flat_index(batch.row_count())?;
        Ok(Self {
            rows,
            columns: batch.columns.into_iter().map(Some).collect(),
        })
    }
}

/// Inputs have one execution lifetime; dropping the runner releases them without a cache.
#[wasm_bindgen(js_name = QueryRunner)]
#[derive(Debug)]
#[allow(
    unnameable_types,
    reason = "a wasm-bindgen export that only JavaScript names"
)]
pub struct QueryRunner {
    inputs: Vec<(String, Batch)>,
    limits: Limits,
}

#[wasm_bindgen]
impl QueryRunner {
    /// Typed scalar limits do not need a JSON metadata decoder.
    #[wasm_bindgen(constructor)]
    pub fn new(
        max_rows: u32,
        max_cells: u32,
        max_source_bytes: u32,
        max_output_bytes: u32,
        max_steps: u32,
    ) -> Result<Self, JsValue> {
        Ok(Self {
            inputs: Vec::new(),
            limits: Limits {
                max_rows: row_index(max_rows).map_err(error)?,
                max_cells: row_index(max_cells).map_err(error)?,
                max_source_bytes: row_index(max_source_bytes).map_err(error)?,
                max_output_bytes: row_index(max_output_bytes).map_err(error)?,
                max_steps: row_index(max_steps).map_err(error)?,
            },
        })
    }

    /// Host-owned bytes enter a schema; format options never include a URL or credential.
    #[wasm_bindgen(js_name = parseSource)]
    #[allow(
        clippy::too_many_arguments,
        reason = "a wasm-bindgen export; JavaScript passes each lane as its own argument"
    )]
    pub fn parse_source(
        &self,
        bytes: &[u8],
        schema: QuerySchema,
        format: u8,
        options: &[u32],
        path_text: &[u8],
        path_offsets: &[u32],
    ) -> Result<QueryBatch, JsValue> {
        let source = match format {
            JSON_FORMAT => SourceSpec::Json {
                columns: schema.columns,
                path: decode_strings(path_text, path_offsets).map_err(error)?,
            },
            CSV_FORMAT => {
                if options.len() != CSV_OPTION_COUNT {
                    return Err(error(Diagnostic::new("csv-options")));
                }
                let delimiter = u8::try_from(*at(options, 0).map_err(error)?)
                    .ok()
                    .ok_or_else(|| error(Diagnostic::new("csv-options")))?;

                SourceSpec::Csv {
                    columns: schema.columns,
                    delimiter,
                    headers: *at(options, 1).map_err(error)? != 0,
                    empty_is_null: *at(options, 2).map_err(error)? != 0,
                }
            }
            _ => return Err(error(Diagnostic::new("format"))),
        };

        crate::parse_source(bytes, &source, &self.limits)
            .and_then(QueryBatch::from_batch)
            .map_err(error)
    }

    /// Consumes a named batch; duplicate names fail instead of replacing an input.
    #[wasm_bindgen(js_name = addInput)]
    pub fn add_input(&mut self, id: String, batch: QueryBatch) -> Result<(), JsValue> {
        if self.inputs.iter().any(|input| input.0 == id) {
            return Err(error(Diagnostic::new("duplicate-input")));
        }

        self.inputs
            .push((id, batch.into_batch(&self.limits).map_err(error)?));
        Ok(())
    }

    /// Plans arrive as typed code, literal and string lanes; nothing passes through JSON.
    #[wasm_bindgen(js_name = execute)]
    #[allow(
        clippy::too_many_arguments,
        reason = "a wasm-bindgen export; JavaScript passes each lane as its own argument"
    )]
    pub fn execute(
        &self,
        source: QueryBatch,
        codes: &[u32],
        numbers: &[f64],
        text: &[u8],
        offsets: &[u32],
    ) -> Result<QueryBatch, JsValue> {
        let wire = crate::PlanWire {
            codes,
            numbers,
            text,
            offsets,
        };
        let plan = crate::decode_plan(wire, &self.limits).map_err(error)?;
        let batch = source.into_batch(&self.limits).map_err(error)?;

        crate::execute(batch, &plan, &self.inputs, &self.limits)
            .and_then(QueryBatch::from_batch)
            .map_err(error)
    }
}

#[cfg(test)]
mod tests;
