//! A refresh-local byte budget bounds text-heavy expansion across all output columns.

use crate::column::{Column, Value};
use crate::plan::{ColumnType, Diagnostic, Limits};

const MASK_BYTES_PER_CELL: usize = 2;
const ERROR_INDEX_BYTES: usize = size_of::<u32>() * 2;
const MIXED_TAG_BYTES: usize = size_of::<u8>();
const FLAT_INDEX_BYTES: usize = size_of::<u32>();

/// The bytes that one output may still build. Each cell costs a conservative weight: its
/// payload, its mask bytes and, for an error, its sparse error record. Allocator overhead is
/// not counted.
pub(crate) struct OutputBudget {
    remaining: usize,
}

impl OutputBudget {
    /// A budget of `limits.max_output_bytes` for one output. It is not kept after that output
    /// is built.
    pub(crate) const fn new(limits: &Limits) -> Self {
        Self {
            remaining: limits.max_output_bytes,
        }
    }

    /// Charge `value` to the budget, then push it to `column`. The charge comes first, so a
    /// cell over the budget never grows a payload buffer. A number that is not finite becomes
    /// a `conversion` error.
    pub(crate) fn push(&mut self, column: &mut Column, value: Value<'_>) -> Result<(), Diagnostic> {
        let admitted = if matches!(value, Value::Number(number) if !number.is_finite()) {
            Value::Error("conversion")
        } else {
            value
        };

        self.admit(column.column_type(), admitted)?;
        column.push(admitted)
    }

    /// Charge one cell of type `kind`, or fail with a `limit` diagnostic. `push` uses this for
    /// new cells, and `Batch::validate_budget` uses it for the cells of an existing batch, so
    /// both use the same weights.
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
