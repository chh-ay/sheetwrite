//! A refresh-local byte budget bounds text-heavy expansion across all output columns.

use crate::column::{Column, Value};
use crate::plan::{ColumnType, Diagnostic, Limits};

const MASK_BYTES_PER_CELL: usize = 2;
const ERROR_INDEX_BYTES: usize = size_of::<u32>() * 2;
const MIXED_TAG_BYTES: usize = size_of::<u8>();
const FLAT_INDEX_BYTES: usize = size_of::<u32>();

/// Conservative payload weights include masks and sparse errors, not allocator metadata.
pub(crate) struct OutputBudget {
    remaining: usize,
}

impl OutputBudget {
    /// The budget belongs to one output construction, never a retained query cache.
    pub(crate) const fn new(limits: &Limits) -> Self {
        Self {
            remaining: limits.max_output_bytes,
        }
    }

    /// Admission happens before a cell can grow any payload buffer.
    pub(crate) fn push(&mut self, column: &mut Column, value: Value<'_>) -> Result<(), Diagnostic> {
        let admitted = if matches!(value, Value::Number(number) if !number.is_finite()) {
            Value::Error("conversion")
        } else {
            value
        };

        self.admit(column.column_type(), admitted)?;
        column.push(admitted)
    }

    /// Existing batches use the same weights as newly constructed outputs.
    pub(crate) fn admit(&mut self, kind: ColumnType, value: Value<'_>) -> Result<(), Diagnostic> {
        let mut weight = payload_bytes(kind, value)?
            .checked_add(MASK_BYTES_PER_CELL)
            .ok_or_else(Diagnostic::limit)?;
        if let Value::Error(code) = value {
            weight = weight
                .checked_add(ERROR_INDEX_BYTES)
                .and_then(|bytes| bytes.checked_add(code.len()))
                .ok_or_else(Diagnostic::limit)?;
        }

        self.remaining = self
            .remaining
            .checked_sub(weight)
            .ok_or_else(Diagnostic::limit)?;
        Ok(())
    }
}

fn payload_bytes(kind: ColumnType, value: Value<'_>) -> Result<usize, Diagnostic> {
    Ok(match kind {
        ColumnType::Number => size_of::<f64>(),
        ColumnType::Logical => size_of::<u8>(),
        ColumnType::Date => size_of::<i32>(),
        ColumnType::DateTime => size_of::<i64>(),
        ColumnType::Text => {
            let bytes = if let Value::Text(text) = value {
                text.len()
            } else {
                0
            };
            FLAT_INDEX_BYTES
                .checked_add(bytes)
                .ok_or_else(Diagnostic::limit)?
        }
        ColumnType::Mixed => {
            let bytes = if let Some(kind) = value.column_type() {
                payload_bytes(kind, value)?
            } else {
                0
            };
            MIXED_TAG_BYTES
                .checked_add(FLAT_INDEX_BYTES)
                .and_then(|prefix| prefix.checked_add(bytes))
                .ok_or_else(Diagnostic::limit)?
        }
    })
}
