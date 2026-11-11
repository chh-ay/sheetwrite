//! Step dispatch moves column ownership; filters retain a checked row-id selection.

use crate::budget::OutputBudget;
use crate::buffers::{at, at_mut, flat_index, row_index};
use crate::calendar::{date_from_text, datetime_from_text};
use crate::column::{formatted, validate_names, Batch, Column, Value};
use crate::keys::indexes;
use crate::plan::*;
use crate::predicate::{compile_predicate, test_predicate};

/// Executes one ordered plan; every failure carries its step and leaves inputs unchanged.
pub fn execute(
    mut batch: Batch,
    plan: &[Step],
    inputs: &[(String, Batch)],
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    if plan.len() > limits.max_steps {
        return Err(Diagnostic::limit());
    }

    // Host batches skip source parsing, so the input shape is checked here too.
    limits.shape(batch.row_count(), batch.columns.len())?;

    for (step_index, step) in plan.iter().enumerate() {
        batch = apply_step(batch, step, inputs, limits).map_err(|mut issue| {
            issue.step = Some(step_index);
            issue
        })?;
        limits.shape(batch.row_count(), batch.columns.len())?;
    }

    batch.validate_budget(limits)?;

    batch.materialize(limits)
}

fn apply_step(
    batch: Batch,
    step: &Step,
    inputs: &[(String, Batch)],
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    match step {
        Step::Filter { predicate } => filter(batch, predicate),
        Step::Select { columns } => select(batch, columns),
        Step::Rename { columns } => rename(batch, columns),
        Step::ChangeType {
            column,
            column_type,
            on_error,
        } => change_type(batch, column, *column_type, *on_error, limits),
        Step::Join { input, keys, join } => {
            let right = inputs
                .iter()
                .find(|entry| entry.0 == *input)
                .map(|entry| &entry.1)
                .ok_or_else(|| Diagnostic::new("input"))?;

            crate::join::join(&batch, right, keys, *join, limits)
        }
        Step::Group { keys, aggregates } => crate::group::group(&batch, keys, aggregates, limits),
        Step::Unpivot {
            columns,
            attribute,
            value,
        } => crate::unpivot::unpivot(&batch, columns, attribute, value, limits),
    }
}

fn filter(mut batch: Batch, predicate: &Predicate) -> Result<Batch, Diagnostic> {
    let compiled = compile_predicate(&batch, predicate, 0)?;
    let mut selected = Vec::new();

    for row in 0..batch.row_count() {
        if test_predicate(&batch, row, &compiled)? == Some(true) {
            let physical = if let Some(rows) = &batch.selection {
                *at(rows, row)?
            } else {
                flat_index(row)?
            };
            selected.push(physical);
        }
    }

    batch.selection = Some(selected);
    Ok(batch)
}

fn select(mut batch: Batch, ids: &[String]) -> Result<Batch, Diagnostic> {
    let selected = indexes(&batch, ids)?;
    let mut owned: Vec<Option<Column>> = batch.columns.into_iter().map(Some).collect();
    let mut columns = Vec::with_capacity(selected.len());

    for index in selected {
        let column = at_mut(&mut owned, row_index(index)?)?
            .take()
            .ok_or_else(|| Diagnostic::new("duplicate-column"))?;
        columns.push(column);
    }

    batch.columns = columns;
    Ok(batch)
}

fn rename(mut batch: Batch, columns: &[(String, String)]) -> Result<Batch, Diagnostic> {
    for (index, (id, name)) in columns.iter().enumerate() {
        if columns.iter().take(index).any(|prior| prior.0 == *id) {
            return Err(Diagnostic::new("duplicate-column"));
        }

        let column = batch.column_index(id)?;
        at_mut(&mut batch.columns, column)?
            .spec
            .name
            .clone_from(name);
    }

    validate_names(&batch.columns)?;
    Ok(batch)
}

fn change_type(
    batch: Batch,
    id: &str,
    column_type: ColumnType,
    policy: ErrorPolicy,
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    let index = batch.column_index(id)?;
    if at(&batch.columns, index)?.column_type() == column_type {
        return Ok(batch);
    }

    let mut materialized = batch.materialize(limits)?;
    let source = at(&materialized.columns, index)?;
    let mut converted = Column::new(ColumnSpec {
        column_type,
        ..source.spec.clone()
    });

    let mut budget = OutputBudget::new(limits);
    for row in 0..materialized.rows {
        push_converted(&mut converted, source.value(row)?, policy, &mut budget)?;
    }

    *at_mut(&mut materialized.columns, index)? = converted;
    Ok(materialized)
}

/// Conversion keeps existing errors and uses an explicit policy for new failures.
pub(crate) fn push_converted(
    column: &mut Column,
    value: Value<'_>,
    policy: ErrorPolicy,
    budget: &mut OutputBudget,
) -> Result<(), Diagnostic> {
    if matches!(value, Value::Null | Value::Error(_))
        || column.column_type() == ColumnType::Mixed
        || value.column_type() == Some(column.column_type())
    {
        return budget.push(column, value);
    }

    if column.column_type() == ColumnType::Text {
        if let Some(text) = formatted(value) {
            return budget.push(column, Value::Text(&text));
        }
    }

    let converted = match (value, column.column_type()) {
        (Value::Text(text), ColumnType::Number) => text
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite())
            .map(Value::Number),
        (Value::Text("true"), ColumnType::Logical) => Some(Value::Logical(true)),
        (Value::Text("false"), ColumnType::Logical) => Some(Value::Logical(false)),
        (Value::Text(text), ColumnType::Date) => date_from_text(text).map(Value::Date),
        (Value::Text(text), ColumnType::DateTime) => datetime_from_text(text).map(Value::DateTime),
        _ => None,
    };

    let stored = match converted {
        Some(admitted) => admitted,
        None if policy == ErrorPolicy::Null => Value::Null,
        None => Value::Error("conversion"),
    };
    budget.push(column, stored)
}
