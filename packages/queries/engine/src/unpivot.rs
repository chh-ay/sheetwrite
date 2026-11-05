//! Unpivot expands selected cells into typed attribute/value lanes, omitting only nulls.

use crate::budget::OutputBudget;
use crate::buffers::{at, at_mut, flat_index, row_index};
use crate::column::{validate_names, Batch, Column, Value};
use crate::keys::indexes;
use crate::plan::{ColumnSpec, ColumnType, Diagnostic, Limits, OutputColumn};

const UNPIVOT_OUTPUT_COLUMNS: usize = 2;

/// Count expansion before allocation; errors remain mixed values rather than nulls.
pub(crate) fn unpivot(
    batch: &Batch,
    ids: &[String],
    attribute: &OutputColumn,
    value: &OutputColumn,
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    let picked = indexes(batch, ids)?;
    let kept: Vec<u32> = (0..flat_index(batch.columns.len())?)
        .filter(|column| !picked.contains(column))
        .collect();

    let mut rows = 0usize;
    for row in 0..batch.row_count() {
        for column in &picked {
            if batch.value(row_index(*column)?, row)? != Value::Null {
                rows = rows.checked_add(1).ok_or_else(Diagnostic::limit)?;
            }
        }
    }
    limits.shape(rows, kept.len() + UNPIVOT_OUTPUT_COLUMNS)?;

    let mut columns: Vec<Column> = kept
        .iter()
        .map(|index| {
            Ok(Column::new(
                at(&batch.columns, row_index(*index)?)?.spec.clone(),
            ))
        })
        .collect::<Result<_, Diagnostic>>()?;
    columns.push(Column::new(ColumnSpec {
        id: attribute.id.clone(),
        name: attribute.name.clone(),
        column_type: ColumnType::Text,
    }));
    columns.push(Column::new(ColumnSpec {
        id: value.id.clone(),
        name: value.name.clone(),
        column_type: ColumnType::Mixed,
    }));
    validate_names(&columns)?;

    let mut budget = OutputBudget::new(limits);
    for row in 0..batch.row_count() {
        for picked_column in &picked {
            let cell = batch.value(row_index(*picked_column)?, row)?;
            if cell == Value::Null {
                continue;
            }

            for (output, source) in kept.iter().enumerate() {
                budget.push(
                    at_mut(&mut columns, output)?,
                    batch.value(row_index(*source)?, row)?,
                )?;
            }
            budget.push(
                at_mut(&mut columns, kept.len())?,
                Value::Text(at(&batch.columns, row_index(*picked_column)?)?.name()),
            )?;
            budget.push(at_mut(&mut columns, kept.len() + 1)?, cell)?;
        }
    }

    Batch::new(columns, rows, limits)
}
