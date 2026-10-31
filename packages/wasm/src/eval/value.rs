//! Cached formula values, coercion, comparison, aggregation, and text formatting.

use std::cmp::Ordering;

use crate::cells::{payload_num, payload_str_id};
use crate::sheet::SheetData;
use crate::types::{
    string_from_pool_ref, FormulaError, StringStorage, Value, KIND_BOOL, KIND_EMPTY, KIND_FORMULA,
    KIND_NUMBER, KIND_STRING,
};

use super::date::format_date_serial;
use super::number_format::{format_number, general_text};

pub(super) fn cached_formula_value(
    sheet: &SheetData,
    strings: &StringStorage,
    index: usize,
    error: Option<FormulaError>,
) -> Value {
    if let Some(error) = error {
        return Value::Error(error);
    }

    let Some((kind, payload)) = sheet.cells.calculated_cell_at(index) else {
        return Value::number(sheet.cells.num_at(index));
    };
    match kind {
        KIND_STRING => string_from_pool_ref(strings, payload_str_id(payload))
            .map(Value::text)
            .unwrap_or(Value::Error(FormulaError::Ref)),
        KIND_BOOL => Value::Bool(payload_num(payload) != 0.0),
        KIND_EMPTY => Value::Blank,
        KIND_NUMBER => Value::number(payload_num(payload)),
        KIND_FORMULA => unreachable!("calculated error was not accompanied by error metadata"),
        _ => unreachable!("unsupported calculated scalar kind: {kind}"),
    }
}

fn bool_text(value: bool) -> &'static str {
    if value {
        "TRUE"
    } else {
        "FALSE"
    }
}

pub(super) fn number_from_value(value: &Value) -> Result<f64, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(*value),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Bool(value) => Ok(if *value { 1.0 } else { 0.0 }),
        Value::Text(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                Ok(0.0)
            } else {
                trimmed
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .ok_or(FormulaError::Value)
            }
        }
        Value::Blank => Ok(0.0),
        Value::Error(error) => Err(*error),
    }
}

pub(super) fn bool_from_value(value: &Value) -> Result<bool, FormulaError> {
    match value {
        Value::Bool(value) => Ok(*value),
        Value::Number(value) if value.is_finite() => Ok(*value != 0.0),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Text(text) => match text.trim().to_ascii_uppercase().as_str() {
            "TRUE" => Ok(true),
            "FALSE" => Ok(false),
            _ => Err(FormulaError::Value),
        },
        Value::Blank => Ok(false),
        Value::Error(error) => Err(*error),
    }
}

pub(super) fn text_from_value(value: &Value) -> Result<String, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(general_text(*value)),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Text(text) => Ok(text.to_string()),
        Value::Bool(value) => Ok(bool_text(*value).to_string()),
        Value::Error(error) => Err(*error),
        Value::Blank => Ok(String::new()),
    }
}

/// Case-insensitive text order. ASCII text folds byte by byte without
/// allocating, which is the common case for sheet text; anything else uses
/// the lowercase mapping, whose length can change.
pub(super) fn compare_text_case_insensitive(left: &str, right: &str) -> Ordering {
    if left.is_ascii() && right.is_ascii() {
        return left
            .bytes()
            .map(|byte| byte.to_ascii_lowercase())
            .cmp(right.bytes().map(|byte| byte.to_ascii_lowercase()));
    }

    left.to_lowercase().cmp(&right.to_lowercase())
}

pub(super) fn compare_values(left: &Value, right: &Value) -> Result<Ordering, FormulaError> {
    match (left, right) {
        (Value::Blank, Value::Blank) => Ok(Ordering::Equal),
        (Value::Blank, Value::Number(right)) => 0.0f64.partial_cmp(right).ok_or(FormulaError::Num),
        (Value::Number(left), Value::Blank) => left.partial_cmp(&0.0).ok_or(FormulaError::Num),
        (Value::Blank, Value::Text(right)) => Ok("".cmp(right.as_ref())),
        (Value::Text(left), Value::Blank) => Ok(left.as_ref().cmp("")),
        (Value::Blank, Value::Bool(right)) => Ok(false.cmp(right)),
        (Value::Bool(left), Value::Blank) => Ok(left.cmp(&false)),
        (Value::Error(error), _) | (_, Value::Error(error)) => Err(*error),
        (Value::Number(left), Value::Number(right)) => {
            left.partial_cmp(right).ok_or(FormulaError::Num)
        }
        (Value::Text(left), Value::Text(right)) => Ok(compare_text_case_insensitive(left, right)),
        (Value::Bool(left), Value::Bool(right)) => Ok(left.cmp(right)),
        _ => Ok(value_rank(left).cmp(&value_rank(right))),
    }
}

fn value_rank(value: &Value) -> u8 {
    match value {
        Value::Blank => 0,
        Value::Number(_) => 1,
        Value::Text(_) => 2,
        Value::Bool(_) => 3,
        Value::Error(_) => 4,
    }
}

pub(super) fn aggregate_number(
    value: &Value,
    from_range: bool,
) -> Result<Option<f64>, FormulaError> {
    match value {
        Value::Number(value) if value.is_finite() => Ok(Some(*value)),
        Value::Number(_) => Err(FormulaError::Num),
        Value::Bool(value) => {
            if from_range {
                Ok(None)
            } else {
                Ok(Some(if *value { 1.0 } else { 0.0 }))
            }
        }
        Value::Text(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() || from_range {
                Ok(None)
            } else {
                trimmed
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .map(Some)
                    .ok_or(FormulaError::Value)
            }
        }
        Value::Blank => Ok(None),
        Value::Error(error) => Err(*error),
    }
}

/// TEXT: a date or time format, or an Excel number format code. A code this
/// formatter cannot read gives the General text of the number.
pub(super) fn format_basic_text(value: &Value, format: &str) -> Result<String, FormulaError> {
    let Value::Number(number) = value else {
        return text_from_value(value);
    };

    if !number.is_finite() {
        return Err(FormulaError::Num);
    }

    Ok(format_date_serial(*number, format)
        .or_else(|| format_number(*number, format))
        .unwrap_or_else(|| general_text(*number)))
}

#[cfg(test)]
mod tests {
    use super::cached_formula_value;
    use crate::cells::{encode_num, encode_str_id};
    use crate::sheet::SheetData;
    use crate::types::{FormulaError, StringStorage, Value, KIND_BOOL, KIND_NUMBER, KIND_STRING};

    #[test]
    fn reads_each_cached_formula_value_kind_and_prior_errors() {
        let mut sheet = SheetData::new(1, 1);
        let mut strings = StringStorage::new();

        assert_eq!(
            cached_formula_value(&sheet, &strings, 0, Some(FormulaError::Ref)),
            Value::Error(FormulaError::Ref)
        );

        sheet.cells.set_derived(0, KIND_NUMBER, encode_num(42.5));
        assert_eq!(
            cached_formula_value(&sheet, &strings, 0, None),
            Value::Number(42.5)
        );

        let text_id = strings.intern("cached");
        sheet
            .cells
            .set_derived(0, KIND_STRING, encode_str_id(text_id));
        assert_eq!(
            cached_formula_value(&sheet, &strings, 0, None),
            Value::text("cached")
        );

        sheet
            .cells
            .set_derived(0, KIND_STRING, encode_str_id(text_id + 1));
        assert_eq!(
            cached_formula_value(&sheet, &strings, 0, None),
            Value::Error(FormulaError::Ref)
        );

        sheet.cells.set_derived(0, KIND_BOOL, encode_num(1.0));
        assert_eq!(
            cached_formula_value(&sheet, &strings, 0, None),
            Value::Bool(true)
        );
    }
}
