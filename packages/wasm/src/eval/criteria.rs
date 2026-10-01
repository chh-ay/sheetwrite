//! Criteria parsing, wildcard matching, and conditional aggregation.

use std::cmp::Ordering;

use crate::calc::CmpOp;
use crate::types::{FormulaError, Value};

use super::matrix::EvalMatrix;
use super::value::compare_text_case_insensitive;

#[derive(Debug)]
enum WildcardToken {
    Literal(char),
    AnyOne,
    AnyMany,
}

#[derive(Debug)]
pub(super) struct Criterion {
    op: CmpOp,
    operand: Value,
    wildcard: Option<Vec<WildcardToken>>,
}

impl Criterion {
    pub(super) fn parse(value: Value) -> Self {
        let Value::Text(text) = value else {
            return Self {
                op: CmpOp::Eq,
                operand: value,
                wildcard: None,
            };
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
        } else if let Ok(number) = operand.parse::<f64>() {
            Value::number(number)
        } else {
            Value::text(operand)
        };
        let wildcard = if matches!(op, CmpOp::Eq | CmpOp::Ne) {
            wildcard_tokens(operand)
        } else {
            None
        };
        Self {
            op,
            operand: parsed_operand,
            wildcard,
        }
    }

    pub(super) fn matches(&self, candidate: &Value) -> bool {
        let ordering = if let Some(pattern) = &self.wildcard {
            let text = criterion_text(candidate);
            let matched = text.is_some_and(|text| wildcard_matches(pattern, &text));
            return if self.op == CmpOp::Ne {
                !matched
            } else {
                matched
            };
        } else {
            criterion_compare(candidate, &self.operand)
        };
        ordering.is_some_and(|ordering| ordering_matches(ordering, self.op))
    }
}

fn wildcard_tokens(pattern: &str) -> Option<Vec<WildcardToken>> {
    let mut tokens = Vec::new();
    let normalized = pattern.to_lowercase();
    let mut chars = normalized.chars().peekable();
    let mut has_pattern_syntax = false;
    while let Some(ch) = chars.next() {
        match ch {
            '~' => match chars.peek().copied() {
                Some(literal @ ('*' | '?' | '~')) => {
                    has_pattern_syntax = true;
                    chars.next();
                    tokens.push(WildcardToken::Literal(literal));
                }
                _ => tokens.push(WildcardToken::Literal('~')),
            },
            '*' => {
                has_pattern_syntax = true;
                if !matches!(tokens.last(), Some(WildcardToken::AnyMany)) {
                    tokens.push(WildcardToken::AnyMany);
                }
            }
            '?' => {
                has_pattern_syntax = true;
                tokens.push(WildcardToken::AnyOne);
            }
            literal => tokens.push(WildcardToken::Literal(literal)),
        }
    }
    has_pattern_syntax.then_some(tokens)
}

/// A wildcard pattern prepared once and matched against many candidates, so
/// a search over a column parses the pattern once instead of once per cell.
pub(super) struct WildcardPattern {
    pattern: String,
    tokens: Option<Vec<WildcardToken>>,
}

impl WildcardPattern {
    /// Reads the pattern's wildcard syntax once.
    pub(super) fn new(pattern: &str) -> Self {
        Self {
            pattern: pattern.to_string(),
            tokens: wildcard_tokens(pattern),
        }
    }

    /// True when `candidate` matches, with the rules the per-candidate
    /// pattern check used.
    pub(super) fn matches(&self, candidate: &Value) -> bool {
        let Some(text) = criterion_text(candidate) else {
            return false;
        };
        match &self.tokens {
            Some(tokens) => wildcard_matches(tokens, &text),
            None => text.eq_ignore_ascii_case(&self.pattern),
        }
    }
}

fn wildcard_matches(pattern: &[WildcardToken], value: &str) -> bool {
    let text: Vec<char> = value.to_lowercase().chars().collect();
    let (mut pattern_index, mut text_index) = (0usize, 0usize);
    let (mut star_index, mut star_text) = (None, 0usize);
    while text_index < text.len() {
        match pattern.get(pattern_index) {
            Some(WildcardToken::Literal(expected)) if *expected == text[text_index] => {
                pattern_index += 1;
                text_index += 1;
            }
            Some(WildcardToken::AnyOne) => {
                pattern_index += 1;
                text_index += 1;
            }
            Some(WildcardToken::AnyMany) => {
                star_index = Some(pattern_index);
                pattern_index += 1;
                star_text = text_index;
            }
            _ => {
                let Some(star) = star_index else {
                    return false;
                };
                star_text += 1;
                text_index = star_text;
                pattern_index = star + 1;
            }
        }
    }
    while matches!(pattern.get(pattern_index), Some(WildcardToken::AnyMany)) {
        pattern_index += 1;
    }
    pattern_index == pattern.len()
}

fn criterion_text(value: &Value) -> Option<String> {
    match value {
        Value::Text(text) => Some(text.to_string()),
        Value::Blank => Some(String::new()),
        Value::Error(error) => Some(error.sentinel().to_string()),
        _ => None,
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

/// Running sum and matching count of the `*IF` family, folded one row at a
/// time. It applies `aggregate_if`'s rules so a streamed range and a
/// materialized one answer the same.
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

/// Running extreme of `MAXIFS`/`MINIFS`, folded one row at a time with
/// `extreme_if`'s rules.
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

/// Aggregates the rows whose criteria all match, on a materialized range.
pub(super) fn aggregate_if(
    sum_range: &EvalMatrix,
    criteria: &[(&EvalMatrix, &Criterion)],
) -> Result<(f64, u64), FormulaError> {
    let mut sum = 0.0;
    let mut count = 0;
    if let [(range, criterion)] = criteria {
        for (value, candidate) in sum_range.values.iter().zip(&range.values) {
            if !criterion.matches(candidate) {
                continue;
            }
            match value {
                Value::Number(value) => {
                    sum += value;
                    count += 1;
                }
                Value::Error(error) => return Err(*error),
                Value::Text(_) | Value::Bool(_) | Value::Blank => {}
            }
        }
        return Ok((sum, count));
    }
    for (index, value) in sum_range.values.iter().enumerate() {
        if !criteria
            .iter()
            .all(|(range, criterion)| criterion.matches(&range.values[index]))
        {
            continue;
        }
        match value {
            Value::Number(value) => {
                sum += value;
                count += 1;
            }
            Value::Error(error) => return Err(*error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
    }
    Ok((sum, count))
}

pub(super) fn extreme_if(
    value_range: &EvalMatrix,
    criteria: &[(&EvalMatrix, &Criterion)],
    maximum: bool,
) -> Result<f64, FormulaError> {
    let mut found = None;
    for (index, value) in value_range.values.iter().enumerate() {
        if !criteria
            .iter()
            .all(|(range, criterion)| criterion.matches(&range.values[index]))
        {
            continue;
        }
        match value {
            Value::Number(value) if value.is_finite() => {
                found = Some(found.map_or(*value, |current: f64| {
                    if maximum {
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
    }
    Ok(found.unwrap_or(0.0))
}
