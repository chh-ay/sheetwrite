//! Predicate preparation resolves column identities once; evaluation keeps M null logic.

use std::cmp::Ordering;

use crate::buffers::at;
use crate::column::{compare, Batch, Value};
use crate::plan::{ColumnType, CompareOp, Diagnostic, Literal, Predicate, MAX_PREDICATE_DEPTH};

fn literal_value(value: &Literal) -> Value<'_> {
    match value {
        Literal::Null => Value::Null,
        Literal::Logical(logical) => Value::Logical(*logical),
        Literal::Number(number) => Value::Number(*number),
        Literal::Text(text) => Value::Text(text),
    }
}

/// Prepared column indexes avoid repeated name lookup for every source row.
pub(crate) enum CompiledPredicate<'a> {
    Compare {
        column: usize,
        op: CompareOp,
        value: Value<'a>,
    },
    IsNull(usize),
    Contains {
        column: usize,
        text: &'a str,
    },
    And(Vec<Self>),
    Or(Vec<Self>),
    Not(Box<Self>),
}

/// Bounded preparation rejects missing columns and incompatible literal types.
pub(crate) fn compile_predicate<'a>(
    batch: &Batch,
    predicate: &'a Predicate,
    depth: usize,
) -> Result<CompiledPredicate<'a>, Diagnostic> {
    if depth >= MAX_PREDICATE_DEPTH {
        return Err(Diagnostic::limit());
    }

    Ok(match predicate {
        Predicate::Compare { column, value, op } => {
            // Typed number lanes hold finite values only, so an infinite literal is a bad plan.
            if matches!(value, Literal::Number(number) if !number.is_finite()) {
                return Err(Diagnostic::new("definition"));
            }

            let index = batch.column_index(column)?;
            let kind = at(&batch.columns, index)?.column_type();
            if literal_value(value)
                .column_type()
                .is_some_and(|literal| kind != ColumnType::Mixed && kind != literal)
            {
                return Err(Diagnostic::new("type"));
            }

            CompiledPredicate::Compare {
                column: index,
                op: *op,
                value: literal_value(value),
            }
        }
        Predicate::IsNull { column } => CompiledPredicate::IsNull(batch.column_index(column)?),
        Predicate::Contains { column, text } => {
            let index = batch.column_index(column)?;
            if at(&batch.columns, index)?.column_type() != ColumnType::Text {
                return Err(Diagnostic::new("type"));
            }

            CompiledPredicate::Contains {
                column: index,
                text,
            }
        }
        Predicate::And { predicates } => CompiledPredicate::And(
            predicates
                .iter()
                .map(|child| compile_predicate(batch, child, depth + 1))
                .collect::<Result<_, _>>()?,
        ),
        Predicate::Or { predicates } => CompiledPredicate::Or(
            predicates
                .iter()
                .map(|child| compile_predicate(batch, child, depth + 1))
                .collect::<Result<_, _>>()?,
        ),
        Predicate::Not { predicate: inner } => {
            CompiledPredicate::Not(Box::new(compile_predicate(batch, inner, depth + 1)?))
        }
    })
}

fn checked_value(batch: &Batch, column: usize, row: usize) -> Result<Value<'_>, Diagnostic> {
    let value = batch.value(column, row)?;
    if matches!(value, Value::Error(_)) {
        return Err(Diagnostic {
            row: Some(row),
            column: Some(at(&batch.columns, column)?.id().to_owned()),
            ..Diagnostic::new("predicate-error")
        });
    }

    Ok(value)
}

/// Only `Some(true)` selects a row; null survives nested logical expressions.
pub(crate) fn test_predicate(
    batch: &Batch,
    row: usize,
    predicate: &CompiledPredicate<'_>,
) -> Result<Option<bool>, Diagnostic> {
    Ok(match predicate {
        CompiledPredicate::Compare {
            column,
            op,
            value: right,
        } => {
            let left = checked_value(batch, *column, row)?;

            // Null must survive NOT/AND/OR until the final row-selection decision.
            // https://learn.microsoft.com/powerquery-m/m-spec-operators#relational-operators
            if !matches!(op, CompareOp::Eq | CompareOp::Neq) {
                if left == Value::Null || *right == Value::Null {
                    return Ok(None);
                }

                if left.column_type() != right.column_type() {
                    return Err(Diagnostic::new("predicate-type"));
                }
            }

            let order = compare(left, *right);
            Some(match op {
                CompareOp::Eq => order == Ordering::Equal,
                CompareOp::Neq => order != Ordering::Equal,
                CompareOp::Lt => order == Ordering::Less,
                CompareOp::Lte => order != Ordering::Greater,
                CompareOp::Gt => order == Ordering::Greater,
                CompareOp::Gte => order != Ordering::Less,
            })
        }
        CompiledPredicate::IsNull(column) => {
            Some(checked_value(batch, *column, row)? == Value::Null)
        }
        CompiledPredicate::Contains { column, text } => match checked_value(batch, *column, row)? {
            Value::Text(value) => Some(value.contains(text)),
            Value::Null => None,
            Value::Error(_)
            | Value::Number(_)
            | Value::Logical(_)
            | Value::Date(_)
            | Value::DateTime(_) => return Err(Diagnostic::new("predicate-type")),
        },
        CompiledPredicate::And(predicates) => {
            let mut result = Some(true);

            for child in predicates {
                match test_predicate(batch, row, child)? {
                    Some(false) => return Ok(Some(false)),
                    None => result = None,
                    Some(true) => {}
                }
            }

            result
        }
        CompiledPredicate::Or(predicates) => {
            let mut result = Some(false);

            for child in predicates {
                match test_predicate(batch, row, child)? {
                    Some(true) => return Ok(Some(true)),
                    None => result = None,
                    Some(false) => {}
                }
            }

            result
        }
        CompiledPredicate::Not(inner) => test_predicate(batch, row, inner)?.map(|value| !value),
    })
}
