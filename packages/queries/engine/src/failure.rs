//! Fatal failures cross the WASM seam as one take-once object with stable codes.

use std::mem;

use wasm_bindgen::prelude::*;

use crate::buffers::flat_index;
use crate::plan::Diagnostic;

/// A thrown failure carries stable codes and coordinates, never source data.
#[wasm_bindgen(js_name = QueryFailure)]
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
    pub fn step(&self) -> Option<u32> {
        self.step
    }

    /// Zero-based input row, if the failure belongs to a specific row.
    #[wasm_bindgen(getter, js_name = row)]
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
