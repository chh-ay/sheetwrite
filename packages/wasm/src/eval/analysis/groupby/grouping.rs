//! Group keys and value rules shared by `GROUPBY`/`PIVOTBY` and pivot tables.
//!
//! Both features must put the same values in one group, order groups the
//! same way, and count the same cells as numbers, so the rules live here once.

use std::cmp::Ordering;

use super::super::super::value::{aggregate_number, compare_values};
use crate::types::{FormulaError, Value};

/// The label of a subtotal or grand-total row or column.
pub(crate) const TOTAL_LABEL: &str = "Total";

/// A hash bucket for a group key. Blank compares equal to zero, `FALSE` and
/// empty text, so they share one bucket; [`compare_group_values`] then
/// separates unequal nonblank keys inside a bucket.
#[derive(Clone, Hash, PartialEq, Eq)]
pub(crate) enum KeyPart {
    Zero,
    Number(u64),
    Text(String),
    Bool(bool),
}

/// The bucket of one key value. An error value cannot be a key: the
/// grouping reports it instead.
pub(crate) fn key_part(value: &Value) -> Result<KeyPart, FormulaError> {
    Ok(match value {
        Value::Blank | Value::Bool(false) => KeyPart::Zero,
        Value::Number(number) if *number == 0.0 => KeyPart::Zero,
        Value::Number(number) if number.is_finite() => KeyPart::Number(number.to_bits()),
        Value::Number(_) => return Err(FormulaError::Num),
        Value::Text(text) if text.is_empty() => KeyPart::Zero,
        Value::Text(text) => KeyPart::Text(text.to_lowercase()),
        Value::Bool(boolean) => KeyPart::Bool(*boolean),
        Value::Error(error) => return Err(*error),
    })
}

/// Orders two key values that [`key_part`] accepted: numbers, then text
/// without case, then booleans.
pub(crate) fn compare_group_values(left: &Value, right: &Value) -> Ordering {
    compare_values(left, right).expect("group keys are checked before comparison")
}

/// Orders two key tuples field by field.
pub(crate) fn compare_fields(left: &[Value], right: &[Value]) -> Ordering {
    for (left_value, right_value) in left.iter().zip(right) {
        let order = compare_group_values(left_value, right_value);
        if order != Ordering::Equal {
            return order;
        }
    }
    Ordering::Equal
}

/// How a value from a range takes part in `SUM`, `AVERAGE`, `MIN` and `MAX`:
/// a number counts, text, booleans and blanks are skipped, and an error
/// stops the aggregate.
pub(crate) fn range_number(value: &Value) -> Result<Option<f64>, FormulaError> {
    aggregate_number(value, true)
}
