//! JSON records stream into columns; unknown fields never allocate a row object.

use crate::budget::OutputBudget;
use crate::buffers::{at, at_mut};
use crate::column::{Batch, Column, Value};
use crate::execute::push_converted;
use crate::json::{Kind, Reader};
use crate::plan::{ColumnSpec, Diagnostic, ErrorPolicy, Limits};

struct Target<'a> {
    columns: Vec<Column>,
    rows: usize,
    limits: &'a Limits,
    budget: OutputBudget,
}

/// Schema and record path are fixed before parsing the first source row.
pub(crate) fn parse(
    bytes: &[u8],
    specs: &[ColumnSpec],
    path: &[String],
    limits: &Limits,
) -> Result<Batch, Diagnostic> {
    let mut target = Target {
        columns: specs.iter().cloned().map(Column::new).collect(),
        rows: 0,
        limits,
        budget: OutputBudget::new(limits),
    };

    crate::column::validate_names(&target.columns)?;

    let mut reader = Reader::new(bytes);
    follow_path(&mut reader, &mut target, path)?;
    reader.end()?;

    Batch::new(target.columns, target.rows, limits)
}

/// Each path field names exactly one member; a repeated member is ambiguous.
fn follow_path(
    reader: &mut Reader<'_>,
    target: &mut Target<'_>,
    path: &[String],
) -> Result<(), Diagnostic> {
    let Some((field, remaining)) = path.split_first() else {
        return rows(reader, target);
    };

    if reader.kind()? != Kind::Object {
        return Err(Diagnostic::new("json"));
    }

    reader.enter_object()?;
    let mut first = true;
    let mut found = false;

    while let Some(key) = reader.next_key(&mut first)? {
        if key != field.as_str() {
            reader.skip()?;
            continue;
        }

        if found {
            return Err(Diagnostic::new("json-path"));
        }

        follow_path(reader, target, remaining)?;
        found = true;
    }

    if !found {
        return Err(Diagnostic::new("json-path"));
    }

    Ok(())
}

fn rows(reader: &mut Reader<'_>, target: &mut Target<'_>) -> Result<(), Diagnostic> {
    if reader.kind()? != Kind::Array {
        return Err(Diagnostic::new("json"));
    }

    reader.enter_array()?;
    let mut first = true;

    while reader.next_element(&mut first)? {
        record(reader, target)?;
    }

    Ok(())
}

fn record(reader: &mut Reader<'_>, target: &mut Target<'_>) -> Result<(), Diagnostic> {
    target.limits.shape(target.rows + 1, target.columns.len())?;

    if reader.kind()? != Kind::Object {
        return Err(Diagnostic::new("json"));
    }

    reader.enter_object()?;
    let mut first = true;

    while let Some(key) = reader.next_key(&mut first)? {
        let Some(index) = target
            .columns
            .iter()
            .position(|column| column.name() == key)
        else {
            reader.skip()?;
            continue;
        };

        // A column that already has this row's value means the member repeats.
        if at(&target.columns, index)?.len() > target.rows {
            return Err(Diagnostic::new("duplicate-column"));
        }

        scalar(reader, target, index)?;
    }

    // Missing members are null, so every column grows by exactly one row.
    for column in &mut target.columns {
        if column.len() == target.rows {
            target.budget.push(column, Value::Null)?;
        }
    }

    target.rows += 1;
    Ok(())
}

/// Nested arrays and objects are consumed and become conversion errors in typed columns.
fn scalar(
    reader: &mut Reader<'_>,
    target: &mut Target<'_>,
    index: usize,
) -> Result<(), Diagnostic> {
    let column = at_mut(&mut target.columns, index)?;
    let budget = &mut target.budget;

    match reader.kind()? {
        Kind::Null => {
            reader.null()?;
            push_converted(column, Value::Null, ErrorPolicy::Error, budget)
        }
        Kind::Logical => {
            let value = reader.logical()?;
            push_converted(column, Value::Logical(value), ErrorPolicy::Error, budget)
        }
        Kind::Number => {
            let value = reader.number()?;
            push_converted(column, Value::Number(value), ErrorPolicy::Error, budget)
        }
        Kind::Text => {
            let value = reader.string()?;
            push_converted(column, Value::Text(&value), ErrorPolicy::Error, budget)
        }
        Kind::Array | Kind::Object => {
            reader.skip()?;
            push_converted(
                column,
                Value::Error("conversion"),
                ErrorPolicy::Error,
                budget,
            )
        }
    }
}
