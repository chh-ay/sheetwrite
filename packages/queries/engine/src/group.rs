//! Grouping sorts flat row ids and folds adjacent equal-key runs without hashing.

use crate::budget::OutputBudget;
use crate::buffers::{at, at_mut, flat_index, row_index};
use crate::column::{compare, validate_names, Batch, Column, Value};
use crate::keys::{compare_keys, indexes, sorted_rows};
use crate::plan::{Aggregate, AggregateOp, ColumnSpec, ColumnType, Diagnostic, Limits};
use std::cmp::Ordering;

/// Null keys form one group; numeric folds ignore null values but propagate errors.
pub(crate) fn group(
    batch: &Batch,
    ids: &[String],
    aggregates: &[Aggregate],
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    let keys = indexes(batch, ids)?;
    let sources = source_columns(batch, aggregates)?;
    let mut columns = output_columns(batch, &keys, aggregates, &sources)?;

    // Table.Group partitions by key equality, so all null keys share a run.
    // List.Sum ignores null and returns null when no non-null values exist.
    // https://learn.microsoft.com/powerquery-m/table-group
    // https://learn.microsoft.com/powerquery-m/list-sum
    let sorted = sorted_rows(batch, &keys)?;
    let mut start = 0;
    let mut groups = 0;
    let mut budget = OutputBudget::new(limits);

    while start < sorted.len() {
        let mut end = start + 1;
        while end < sorted.len()
            && compare_keys(
                batch,
                batch,
                &keys,
                &keys,
                *at(&sorted, start)?,
                *at(&sorted, end)?,
            )? == Ordering::Equal
        {
            end += 1;
        }

        groups += 1;
        limits.shape(groups, columns.len())?;
        for (output, source) in keys.iter().enumerate() {
            budget.push(
                at_mut(&mut columns, output)?,
                batch.value(row_index(*source)?, row_index(*at(&sorted, start)?)?)?,
            )?;
        }

        for (index, aggregate) in aggregates.iter().enumerate() {
            let rows = sorted
                .get(start..end)
                .ok_or_else(|| Diagnostic::new("shape"))?;
            let value = fold(batch, rows, aggregate.op, *at(&sources, index)?)?;
            budget.push(at_mut(&mut columns, keys.len() + index)?, value)?;
        }

        start = end;
    }

    Batch::new(columns, groups, limits)
}

fn source_columns(batch: &Batch, aggregates: &[Aggregate]) -> Result<Vec<Option<u32>>, Diagnostic> {
    aggregates
        .iter()
        .map(|aggregate| match aggregate.op {
            AggregateOp::CountRows => {
                if aggregate.column.is_some() {
                    return Err(Diagnostic::new("aggregate"));
                }

                Ok(None)
            }
            _ => aggregate
                .column
                .as_ref()
                .ok_or_else(|| Diagnostic::new("aggregate"))
                .and_then(|id| batch.column_index(id).and_then(flat_index))
                .map(Some),
        })
        .collect()
}

fn output_columns(
    batch: &Batch,
    keys: &[u32],
    aggregates: &[Aggregate],
    sources: &[Option<u32>],
) -> Result<Vec<Column>, Diagnostic> {
    let mut columns: Vec<Column> = keys
        .iter()
        .map(|index| {
            Ok(Column::new(
                at(&batch.columns, row_index(*index)?)?.spec.clone(),
            ))
        })
        .collect::<Result<_, Diagnostic>>()?;

    for (aggregate, source) in aggregates.iter().zip(sources) {
        let column_type = match aggregate.op {
            AggregateOp::Min | AggregateOp::Max => {
                let source = source.ok_or_else(|| Diagnostic::new("aggregate"))?;
                at(&batch.columns, row_index(source)?)?.column_type()
            }
            AggregateOp::Sum | AggregateOp::Average => {
                let source = source.ok_or_else(|| Diagnostic::new("aggregate"))?;
                if at(&batch.columns, row_index(source)?)?.column_type() != ColumnType::Number {
                    return Err(Diagnostic::new("type"));
                }

                ColumnType::Number
            }
            AggregateOp::Count | AggregateOp::CountRows => ColumnType::Number,
        };

        columns.push(Column::new(ColumnSpec {
            id: aggregate.id.clone(),
            name: aggregate.name.clone(),
            column_type,
        }));
    }

    validate_names(&columns)?;

    Ok(columns)
}

fn fold<'a>(
    batch: &'a Batch,
    rows: &[u32],
    op: AggregateOp,
    source: Option<u32>,
) -> Result<Value<'a>, Diagnostic> {
    if matches!(op, AggregateOp::CountRows) {
        return Ok(Value::Number(f64::from(flat_index(rows.len())?)));
    }

    let source = row_index(source.ok_or_else(|| Diagnostic::new("aggregate"))?)?;
    let mut count = 0u32;
    let mut sum = 0.0;
    let mut selected = Value::Null;

    for row in rows {
        let value = batch.value(source, row_index(*row)?)?;
        match value {
            Value::Null => continue,
            Value::Error(_) => return Ok(value),
            _ => count += 1,
        }

        match op {
            AggregateOp::Sum | AggregateOp::Average => {
                if let Value::Number(number) = value {
                    sum += number;
                }
            }
            AggregateOp::Min => {
                if selected == Value::Null || compare(value, selected) == Ordering::Less {
                    selected = value;
                }
            }
            AggregateOp::Max => {
                if selected == Value::Null || compare(value, selected) == Ordering::Greater {
                    selected = value;
                }
            }
            AggregateOp::Count | AggregateOp::CountRows => {}
        }
    }

    Ok(match op {
        AggregateOp::Count | AggregateOp::CountRows => Value::Number(f64::from(count)),
        AggregateOp::Sum if count > 0 => Value::Number(sum),
        AggregateOp::Average if count > 0 => Value::Number(sum / f64::from(count)),
        _ => selected,
    })
}
