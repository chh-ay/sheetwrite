//! Criteria parsing and conditional aggregation.

use std::cmp::Ordering;

use crate::calc::{CmpOp, SHEET_COLS, SHEET_ROWS};
use crate::types::{CellRange, FormulaError, Value};

use super::matrix::EvalMatrix;
use super::value::{compare_text_case_insensitive, plain_number};
use super::wildcard::Wildcard;

#[derive(Debug)]
pub(super) struct Criterion {
    op: CmpOp,
    operand: Value,
    wildcard: Option<Wildcard>,
}

impl Criterion {
    /// Parses a criterion, or fails with `#NUM!` when its wildcard pattern
    /// cannot be allocated.
    pub(super) fn parse(value: Value) -> Result<Self, FormulaError> {
        let Value::Text(text) = value else {
            return Ok(Self {
                op: CmpOp::Eq,
                operand: value,
                wildcard: None,
            });
        };
        let raw = text.trim();
        let (op, operand) = if let Some(rest) = raw.strip_prefix("<>") {
            (CmpOp::Ne, rest)
        } else if let Some(rest) = raw.strip_prefix("<=") {
            (CmpOp::Le, rest)
        } else if let Some(rest) = raw.strip_prefix(">=") {
            (CmpOp::Ge, rest)
        } else if let Some(rest) = raw.strip_prefix('<') {
            (CmpOp::Lt, rest)
        } else if let Some(rest) = raw.strip_prefix('>') {
            (CmpOp::Gt, rest)
        } else if let Some(rest) = raw.strip_prefix('=') {
            (CmpOp::Eq, rest)
        } else {
            (CmpOp::Eq, raw)
        };
        let operand = operand.trim();
        let parsed_operand = if operand.eq_ignore_ascii_case("TRUE") {
            Value::Bool(true)
        } else if operand.eq_ignore_ascii_case("FALSE") {
            Value::Bool(false)
        } else if let Some(number) = plain_number(operand) {
            Value::number(number)
        } else {
            Value::text(operand)
        };
        let wildcard = if matches!(op, CmpOp::Eq | CmpOp::Ne) {
            Some(Wildcard::parse(operand)?).filter(Wildcard::has_wildcards)
        } else {
            None
        };
        Ok(Self {
            op,
            operand: parsed_operand,
            wildcard,
        })
    }

    pub(super) fn matches(&self, candidate: &Value) -> bool {
        let ordering = if let Some(pattern) = &self.wildcard {
            let matched = criterion_text(candidate).is_some_and(|text| pattern.matches(text));
            return if self.op == CmpOp::Ne {
                !matched
            } else {
                matched
            };
        } else {
            criterion_compare(candidate, &self.operand)
        };
        // Values of different types are never equal, so `<>` matches them
        // and every ordering operator rejects them.
        match ordering {
            Some(ordering) => ordering_matches(ordering, self.op),
            None => self.op == CmpOp::Ne,
        }
    }
}

/// The sum range of SUMIF and AVERAGEIF. Excel reads as many rows and columns
/// as the criteria range has, from the sum range's top-left cell, whatever
/// size the sum range is written with; the sheet edge cuts it short.
pub(crate) fn sum_range_extent(sum: CellRange, rows: u32, cols: u32) -> CellRange {
    let row_end = sum
        .row_start
        .saturating_add(rows.saturating_sub(1))
        .min(SHEET_ROWS - 1);
    let col_end = sum
        .col_start
        .saturating_add(cols.saturating_sub(1))
        .min(SHEET_COLS - 1);
    CellRange::new(sum.sheet, sum.row_start, sum.col_start, row_end, col_end)
}

/// A wildcard lookup key (`XLOOKUP`/`XMATCH` match mode 2), parsed once and
/// matched against many candidates. A key without wildcards matches its
/// literal text, with the same case rule.
pub(super) struct WildcardPattern {
    wildcard: Wildcard,
}

impl WildcardPattern {
    pub(super) fn new(pattern: &str) -> Result<Self, FormulaError> {
        Ok(Self {
            wildcard: Wildcard::parse(pattern)?,
        })
    }

    pub(super) fn matches(&self, candidate: &Value) -> bool {
        criterion_text(candidate).is_some_and(|text| self.wildcard.matches(text))
    }
}

/// The text a wildcard sees in a candidate cell: numbers and booleans never
/// match a pattern, and an error matches its sentinel such as `#N/A`.
fn criterion_text(value: &Value) -> Option<&str> {
    match value {
        Value::Text(text) => Some(text),
        Value::Blank => Some(""),
        Value::Error(error) => Some(error.sentinel()),
        Value::Number(_) | Value::Bool(_) => None,
    }
}

fn criterion_compare(left: &Value, right: &Value) -> Option<Ordering> {
    match (left, right) {
        (Value::Number(left), Value::Number(right)) => left.partial_cmp(right),
        (Value::Bool(left), Value::Bool(right)) => Some(left.cmp(right)),
        (Value::Text(left), Value::Text(right)) => Some(compare_text_case_insensitive(left, right)),
        (Value::Blank, Value::Blank) => Some(Ordering::Equal),
        (Value::Blank, Value::Text(right)) if right.is_empty() => Some(Ordering::Equal),
        (Value::Text(left), Value::Blank) if left.is_empty() => Some(Ordering::Equal),
        (Value::Error(left), Value::Text(right)) => {
            Some(left.sentinel().to_lowercase().cmp(&right.to_lowercase()))
        }
        _ => None,
    }
}

fn ordering_matches(ordering: Ordering, op: CmpOp) -> bool {
    match op {
        CmpOp::Eq => ordering == Ordering::Equal,
        CmpOp::Ne => ordering != Ordering::Equal,
        CmpOp::Lt => ordering == Ordering::Less,
        CmpOp::Gt => ordering == Ordering::Greater,
        CmpOp::Le => matches!(ordering, Ordering::Less | Ordering::Equal),
        CmpOp::Ge => matches!(ordering, Ordering::Greater | Ordering::Equal),
    }
}

/// Owns the numeric and error rules for matched rows in the `*IF` family,
/// shared by streamed and materialized ranges.
pub(super) struct IfSum {
    sum: f64,
    count: u64,
}

impl IfSum {
    pub(super) fn new() -> Self {
        Self { sum: 0.0, count: 0 }
    }

    /// Folds one matched row: a matched error stops the walk, and only
    /// numeric values sum.
    pub(super) fn add(&mut self, value: &Value) -> Result<(), FormulaError> {
        match value {
            Value::Number(value) => {
                self.sum += value;
                self.count += 1;
            }
            Value::Error(error) => return Err(*error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
        Ok(())
    }

    /// The `SUMIF` result, or `AVERAGEIF`'s when `average` is set.
    pub(super) fn finish(self, average: bool) -> Value {
        if average {
            if self.count == 0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number(self.sum / self.count as f64)
            }
        } else {
            Value::number(self.sum)
        }
    }
}

/// Owns the numeric and error rules for matched rows in `MAXIFS`/`MINIFS`,
/// shared by streamed and materialized ranges.
pub(super) struct IfExtreme {
    found: Option<f64>,
    maximum: bool,
}

impl IfExtreme {
    pub(super) fn new(maximum: bool) -> Self {
        Self {
            found: None,
            maximum,
        }
    }

    /// Folds one matched row.
    pub(super) fn add(&mut self, value: &Value) -> Result<(), FormulaError> {
        match value {
            Value::Number(value) if value.is_finite() => {
                self.found = Some(self.found.map_or(*value, |current| {
                    if self.maximum {
                        current.max(*value)
                    } else {
                        current.min(*value)
                    }
                }));
            }
            Value::Number(_) => return Err(FormulaError::Num),
            Value::Error(error) => return Err(*error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
        Ok(())
    }

    pub(super) fn finish(self) -> Value {
        Value::number(self.found.unwrap_or(0.0))
    }
}

/// `SUMIF`/`SUMIFS`, or `AVERAGEIF`/`AVERAGEIFS` when `average` is set, over
/// the rows of a materialized range whose criteria all match.
pub(super) fn aggregate_if(
    sum_range: &EvalMatrix,
    criteria: &[(&EvalMatrix, &Criterion)],
    average: bool,
) -> Value {
    let mut aggregate = IfSum::new();
    let folded = if let [(range, criterion)] = criteria {
        sum_range
            .values
            .iter()
            .zip(&range.values)
            .filter(|(_, candidate)| criterion.matches(candidate))
            .try_for_each(|(value, _)| aggregate.add(value))
    } else {
        matched_rows(sum_range, criteria).try_for_each(|value| aggregate.add(value))
    };
    match folded {
        Ok(()) => aggregate.finish(average),
        Err(error) => Value::Error(error),
    }
}

/// `MAXIFS`, or `MINIFS` when `maximum` is unset, over a materialized range.
pub(super) fn extreme_if(
    value_range: &EvalMatrix,
    criteria: &[(&EvalMatrix, &Criterion)],
    maximum: bool,
) -> Value {
    let mut aggregate = IfExtreme::new(maximum);
    match matched_rows(value_range, criteria).try_for_each(|value| aggregate.add(value)) {
        Ok(()) => aggregate.finish(),
        Err(error) => Value::Error(error),
    }
}

/// The cells of `aggregated` whose row matches every criterion.
fn matched_rows<'a>(
    aggregated: &'a EvalMatrix,
    criteria: &'a [(&EvalMatrix, &Criterion)],
) -> impl Iterator<Item = &'a Value> {
    aggregated
        .values
        .iter()
        .enumerate()
        .filter_map(|(index, cell)| {
            criteria
                .iter()
                .all(|(range, criterion)| criterion.matches(&range.values[index]))
                .then_some(cell)
        })
}
