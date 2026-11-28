//! Criteria parsing and conditional aggregation.

use std::cmp::Ordering;

use crate::calc::{Ast, CmpOp, Func, SHEET_COLS, SHEET_ROWS};
use crate::store::CellStore;
use crate::types::{
    CellRange, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT, KIND_NUMBER,
};

use super::matrix::{range_from_ast, EvalMatrix};
use super::range_criteria::{CriteriaFold, CriteriaRead};
use super::range_reader::RangeReader;
use super::value::{compare_text_case_insensitive, plain_number};
use super::wildcard::Wildcard;
use super::EvalPass;

#[derive(Debug)]
pub(crate) struct Criterion {
    op: CmpOp,
    operand: Value,
    wildcard: Option<Wildcard>,
}

impl Criterion {
    /// Parses a criterion, or fails with `#NUM!` when its wildcard pattern
    /// cannot be allocated.
    pub(crate) fn parse(value: Value) -> Result<Self, FormulaError> {
        let Value::Text(text) = value else {
            return Ok(Self {
                op: CmpOp::Eq,
                operand: value,
                wildcard: None,
            });
        };
        let raw = text.trim();
        let (op, untrimmed) = if let Some(rest) = raw.strip_prefix("<>") {
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
        let operand = untrimmed.trim();
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

    pub(crate) fn matches(&self, candidate: &Value) -> bool {
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
            Some(order) => ordering_matches(order, self.op),
            None => self.op == CmpOp::Ne,
        }
    }

    /// The operator and number a finite number cell is compared with, or
    /// `None` when the criterion is text, a boolean or a pattern: then every
    /// finite number gets the same answer, [`Self::matches_number`]'s.
    pub(super) const fn number_comparison(&self) -> Option<(CmpOp, f64)> {
        match self.operand {
            Value::Number(operand) if self.wildcard.is_none() => Some((self.op, operand)),
            Value::Number(_) | Value::Text(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => {
                None
            }
        }
    }

    /// [`Self::matches`] for a finite number cell, without building a `Value`.
    pub(crate) fn matches_number(&self, number: f64) -> bool {
        // A pattern never matches a number.
        if self.wildcard.is_some() {
            return self.op == CmpOp::Ne;
        }

        match self.operand {
            Value::Number(operand) => number
                .partial_cmp(&operand)
                .map_or(self.op == CmpOp::Ne, |ordering| {
                    ordering_matches(ordering, self.op)
                }),
            Value::Text(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => {
                self.op == CmpOp::Ne
            }
        }
    }

    /// [`Self::matches`] for a text cell, read in place from the string pool.
    pub(crate) fn matches_text(&self, text: &str) -> bool {
        if let Some(pattern) = &self.wildcard {
            return pattern.matches(text) != (self.op == CmpOp::Ne);
        }

        let ordering = match &self.operand {
            Value::Text(operand) => Some(compare_text_case_insensitive(text, operand)),
            Value::Blank if text.is_empty() => Some(Ordering::Equal),
            Value::Number(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => None,
        };

        match ordering {
            Some(order) => ordering_matches(order, self.op),
            None => self.op == CmpOp::Ne,
        }
    }

    /// Counts the matches among dense cells given as their raw kinds and
    /// payloads, with the result of [`Self::matches`] on each number. `None`
    /// when a cell is not a number literal or holds a stored infinity or NaN,
    /// which the cell reader reads as `#NUM!`, or when the criterion is not a
    /// plain number: text and wildcard criteria need each cell's value.
    pub(super) fn count_numbers(&self, kinds: &[u8], numbers: &[u64]) -> Option<usize> {
        let Value::Number(threshold) = self.operand else {
            return None;
        };
        if self.wildcard.is_some() {
            return None;
        }

        // One loop per operator keeps the operator match out of the loop.
        match self.op {
            CmpOp::Eq => count_numbers_where(kinds, numbers, |number| number == threshold),
            CmpOp::Ne => count_numbers_where(kinds, numbers, |number| number != threshold),
            CmpOp::Lt => count_numbers_where(kinds, numbers, |number| number < threshold),
            CmpOp::Le => count_numbers_where(kinds, numbers, |number| number <= threshold),
            CmpOp::Gt => count_numbers_where(kinds, numbers, |number| number > threshold),
            CmpOp::Ge => count_numbers_where(kinds, numbers, |number| number >= threshold),
        }
    }
}

/// The exponent bits of an `f64`, all set for an infinity or NaN.
const EXPONENT_BITS: u64 = 0x7FF0_0000_0000_0000;
/// The lowest exponent bit.
const EXPONENT_UNIT: u64 = 1 << 52;
const SIGN_BIT: u64 = 1 << 63;

/// One pass over the kinds and payloads. A cell of another kind, or a
/// non-finite number, is noted without leaving the loop and sends the column
/// to the cell reader, which reads the number as `#NUM!`. JavaScriptCore runs
/// this shape faster than a separate pass over the kinds or a finite check in
/// the comparison (see `ReductionFold::push_number_column`).
fn count_numbers_where(
    kinds: &[u8],
    numbers: &[u64],
    matches: impl Fn(f64) -> bool,
) -> Option<usize> {
    let mut other_kinds = 0u8;
    // One more than an all-ones exponent carries into the sign bit, and no
    // other exponent does, so the sign bit of the OR marks a non-finite number.
    let mut exponent_carries = 0u64;
    let mut count = 0usize;
    for (&kind, &bits) in kinds.iter().zip(numbers) {
        other_kinds |= kind ^ KIND_NUMBER;
        exponent_carries |= (bits & EXPONENT_BITS) + EXPONENT_UNIT;
        count += usize::from(matches(f64::from_bits(bits)));
    }
    (other_kinds == 0 && exponent_carries & SIGN_BIT == 0).then_some(count)
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

    pub(super) fn matches_text(&self, text: &str) -> bool {
        self.wildcard.matches(text)
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

fn criterion_compare(left_value: &Value, right_value: &Value) -> Option<Ordering> {
    match (left_value, right_value) {
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
    pub(super) const fn new() -> Self {
        Self { sum: 0.0, count: 0 }
    }

    /// Folds one matched row: a matched error stops the walk, and only
    /// numeric values sum.
    pub(super) fn add(&mut self, value: &Value) -> Result<(), FormulaError> {
        match value {
            Value::Number(number) => {
                self.sum += number;
                self.count += 1;
            }
            Value::Error(error) => return Err(*error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
        Ok(())
    }

    /// [`Self::add`] for a matched finite number, without building a value.
    #[inline]
    pub(super) fn add_number(&mut self, value: f64) {
        self.sum += value;
        self.count += 1;
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
    pub(super) const fn new(maximum: bool) -> Self {
        Self {
            found: None,
            maximum,
        }
    }

    /// Folds one matched row: an error or a non-finite number stops the walk,
    /// and only finite numbers count.
    pub(super) fn add(&mut self, value: &Value) -> Result<(), FormulaError> {
        match value {
            Value::Number(number) if number.is_finite() => {
                self.found = Some(self.found.map_or(*number, |current| {
                    if self.maximum {
                        current.max(*number)
                    } else {
                        current.min(*number)
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
        Value::number(self.found.unwrap_or_default())
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

impl CellStore {
    fn eval_criterion(
        &self,
        ast: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Criterion, FormulaError> {
        let value = self.eval_ast(ast, sheet, pass, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        Criterion::parse(value)
    }

    /// Walks the criteria functions over their ranges instead of
    /// materializing them. `None` keeps the materialized path, which also
    /// handles computed arguments, missing arguments and dynamic arrays.
    #[allow(
        clippy::wildcard_enum_match_arm,
        reason = "functions outside this family are left to the caller; listing the 200 other Func variants adds nothing"
    )]
    fn streamed_criteria(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        match func {
            Func::CountIf => self.streamed_count_if(args, sheet, pass, depth),
            Func::CountIfs => self.streamed_count_ifs(args, sheet, pass, depth),
            Func::SumIf | Func::AverageIf => self.streamed_sum_if(func, args, sheet, pass, depth),
            Func::SumIfs | Func::AverageIfs | Func::MaxIfs | Func::MinIfs => {
                self.streamed_sum_ifs_or_extreme(func, args, sheet, pass, depth)
            }
            _ => None,
        }
    }

    fn streamed_count_if(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.len() != 2 {
            return None;
        }
        let range = range_from_ast(&args[0], self.name_scope(sheet))?;
        let reader_depth = depth + 1;
        let reader = match RangeReader::new(self, range, reader_depth) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
            Ok(criterion) => criterion,
            Err(error) => return Some(Value::Error(error)),
        };
        if let Some(count) = self.dense_number_count_if_family(range, &criterion, reader_depth) {
            return Some(Value::number(count as f64));
        }
        Some(
            CriteriaRead {
                fold: CriteriaFold::Count,
                values: None,
                criteria: &mut [(reader, &criterion)],
                value_first: false,
            }
            .finish(self, pass),
        )
    }

    /// COUNTIF with a numeric criterion over dense columns that hold only
    /// number literals: it compares the stored payloads directly instead of
    /// reading each cell as a `Value`. `None` sends the caller to the cell
    /// reader, for paged storage, any other cell kind, a stored infinity or
    /// NaN, or any other criterion.
    /// Call it only after `RangeReader::new` accepted `range`: it clamps the
    /// range to the used extent the same way.
    ///
    /// Out of line, and named `*_family`, so neither LLVM nor wasm-opt puts
    /// its loops into `eval_ast`. The scan is scalar: enabling `simd128` for
    /// one function enables it for the whole module, which makes other range
    /// formulas up to 1.8x slower on x86-64.
    #[inline(never)]
    fn dense_number_count_if_family(
        &self,
        range: CellRange,
        criterion: &Criterion,
        reader_depth: usize,
    ) -> Option<usize> {
        // At the depth limit the reader reads literals through `eval_at`,
        // which fails; see `LiteralSources::new`.
        if reader_depth >= FORMULA_RECURSION_LIMIT {
            return None;
        }

        let cells = &self.sheets.get(range.sheet as usize)?.cells;
        let row_start = range.row_start as usize;
        let row_end = (range.row_end as usize).min(cells.row_count().checked_sub(1)?);
        let col_end = (range.col_end as usize).min(cells.n_cols().checked_sub(1)?);

        let mut count = 0;
        for col in range.col_start as usize..=col_end {
            let column = cells.dense_column(col)?;
            let (column_kinds, numbers) = column.raw_slices();
            let kinds = column_kinds.get(row_start..=row_end)?;
            // A literal's raw kind is its kind, and a number's payload is its
            // `f64` bits. Formulas and blanks have other raw kinds.
            count += criterion.count_numbers(kinds, numbers.get(row_start..=row_end)?)?;
        }
        Some(count)
    }

    fn streamed_count_ifs(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.is_empty() || !args.len().is_multiple_of(2) {
            return None;
        }
        let mut readers = Vec::with_capacity(args.len() / 2);
        let mut criteria = Vec::with_capacity(args.len() / 2);
        for pair in args.as_chunks::<2>().0 {
            let range = range_from_ast(&pair[0], self.name_scope(sheet))?;
            let reader = match RangeReader::new(self, range, depth + 1) {
                Ok(reader) => reader,
                Err(error) => return Some(Value::Error(error)),
            };
            if readers
                .first()
                .is_some_and(|first: &RangeReader<'_>| first.shape() != reader.shape())
            {
                return Some(Value::Error(FormulaError::Value));
            }
            let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                Ok(criterion) => criterion,
                Err(error) => return Some(Value::Error(error)),
            };
            readers.push(reader);
            criteria.push(criterion);
        }
        let mut pairs: Vec<_> = readers.into_iter().zip(&criteria).collect();
        Some(
            CriteriaRead {
                fold: CriteriaFold::Count,
                values: None,
                criteria: &mut pairs,
                value_first: false,
            }
            .finish(self, pass),
        )
    }

    fn streamed_sum_if(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if !(2..=3).contains(&args.len()) {
            return None;
        }
        let criteria_range = range_from_ast(&args[0], self.name_scope(sheet))?;
        let criteria_reader = match RangeReader::new(self, criteria_range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
            Ok(criterion) => criterion,
            Err(error) => return Some(Value::Error(error)),
        };
        let value_range = match args.get(2) {
            Some(ast) => sum_range_extent(
                range_from_ast(ast, self.name_scope(sheet))?,
                criteria_range.row_end - criteria_range.row_start + 1,
                criteria_range.col_end - criteria_range.col_start + 1,
            ),
            None => criteria_range,
        };
        let mut value_reader = match RangeReader::new(self, value_range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        if criteria_reader.shape() != value_reader.shape() {
            return Some(Value::Error(FormulaError::Value));
        }
        Some(
            CriteriaRead {
                fold: CriteriaFold::Sum {
                    average: func == Func::AverageIf,
                },
                values: Some(&mut value_reader),
                criteria: &mut [(criteria_reader, &criterion)],
                value_first: false,
            }
            .finish(self, pass),
        )
    }

    fn streamed_sum_ifs_or_extreme(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.len() < 3 || args.len().is_multiple_of(2) {
            return None;
        }
        let value_range = range_from_ast(&args[0], self.name_scope(sheet))?;
        let mut value_reader = match RangeReader::new(self, value_range, depth + 1) {
            Ok(reader) => reader,
            Err(error) => return Some(Value::Error(error)),
        };
        let mut readers = Vec::with_capacity((args.len() - 1) / 2);
        let mut criteria = Vec::with_capacity((args.len() - 1) / 2);
        for pair in args[1..].as_chunks::<2>().0 {
            let range = range_from_ast(&pair[0], self.name_scope(sheet))?;
            let reader = match RangeReader::new(self, range, depth + 1) {
                Ok(reader) => reader,
                Err(error) => return Some(Value::Error(error)),
            };
            if value_reader.shape() != reader.shape() {
                return Some(Value::Error(FormulaError::Value));
            }
            let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                Ok(criterion) => criterion,
                Err(error) => return Some(Value::Error(error)),
            };
            readers.push(reader);
            criteria.push(criterion);
        }
        let fold = if matches!(func, Func::MaxIfs | Func::MinIfs) {
            CriteriaFold::Extreme {
                maximum: func == Func::MaxIfs,
            }
        } else {
            CriteriaFold::Sum {
                average: func == Func::AverageIfs,
            }
        };
        let mut pairs: Vec<_> = readers.into_iter().zip(&criteria).collect();
        Some(
            CriteriaRead {
                fold,
                values: Some(&mut value_reader),
                criteria: &mut pairs,
                value_first: true,
            }
            .finish(self, pass),
        )
    }

    #[inline(never)]
    #[allow(
        clippy::wildcard_enum_match_arm,
        reason = "callers pass only the functions matched here; listing the 200 other Func variants adds nothing"
    )]
    pub(super) fn eval_criteria_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if let Some(result) = self.streamed_criteria(func, args, sheet, pass, depth) {
            return result;
        }
        match func {
            Func::CountIf => {
                if args.len() != 2 {
                    return Value::Error(FormulaError::Value);
                }
                let range = match self.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
                    Ok(criterion) => criterion,
                    Err(error) => return Value::Error(error),
                };
                Value::number(
                    range
                        .values
                        .iter()
                        .filter(|value| criterion.matches(value))
                        .count() as f64,
                )
            }
            Func::CountIfs => {
                if args.is_empty() || !args.len().is_multiple_of(2) {
                    return Value::Error(FormulaError::Value);
                }
                let mut ranges = Vec::with_capacity(args.len() / 2);
                let mut criteria = Vec::with_capacity(args.len() / 2);
                for pair in args.as_chunks::<2>().0 {
                    let range = match self.eval_matrix_arg(&pair[0], sheet, pass, depth + 1) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if ranges
                        .first()
                        .is_some_and(|first: &EvalMatrix| !first.same_shape(&range))
                    {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                    ranges.push(range);
                    criteria.push(criterion);
                }
                let count = (0..ranges[0].values.len())
                    .filter(|&index| {
                        ranges
                            .iter()
                            .zip(&criteria)
                            .all(|(range, criterion)| criterion.matches(&range.values[index]))
                    })
                    .count();
                Value::number(count as f64)
            }
            Func::SumIf | Func::AverageIf => {
                if !(2..=3).contains(&args.len()) {
                    return Value::Error(FormulaError::Value);
                }
                let criteria_range = match self.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let criterion = match self.eval_criterion(&args[1], sheet, pass, depth + 1) {
                    Ok(criterion) => criterion,
                    Err(error) => return Value::Error(error),
                };
                let value_range = if let Some(ast) = args.get(2) {
                    let matrix = match range_from_ast(ast, self.name_scope(sheet)) {
                        Some(range) => {
                            let (rows, cols) =
                                match range_from_ast(&args[0], self.name_scope(sheet)) {
                                    Some(criteria) => (
                                        criteria.row_end - criteria.row_start + 1,
                                        criteria.col_end - criteria.col_start + 1,
                                    ),
                                    None => {
                                        (criteria_range.rows as u32, criteria_range.cols as u32)
                                    }
                                };
                            let sum_range = sum_range_extent(range, rows, cols);
                            self.eval_range_matrix(sum_range, pass, depth + 1)
                        }
                        None => self.eval_matrix_arg(ast, sheet, pass, depth + 1),
                    };
                    match matrix {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    }
                } else {
                    EvalMatrix::new(
                        criteria_range.rows,
                        criteria_range.cols,
                        criteria_range.values.clone(),
                    )
                };
                if !criteria_range.same_shape(&value_range) {
                    return Value::Error(FormulaError::Value);
                }
                aggregate_if(
                    &value_range,
                    &[(&criteria_range, &criterion)],
                    func == Func::AverageIf,
                )
            }
            Func::SumIfs | Func::AverageIfs | Func::MaxIfs | Func::MinIfs => {
                if args.len() < 3 || args.len().is_multiple_of(2) {
                    return Value::Error(FormulaError::Value);
                }
                let value_range = match self.eval_matrix_arg(&args[0], sheet, pass, depth + 1) {
                    Ok(range) => range,
                    Err(error) => return Value::Error(error),
                };
                let mut ranges = Vec::with_capacity((args.len() - 1) / 2);
                let mut criteria = Vec::with_capacity((args.len() - 1) / 2);
                for pair in args[1..].as_chunks::<2>().0 {
                    let range = match self.eval_matrix_arg(&pair[0], sheet, pass, depth + 1) {
                        Ok(range) => range,
                        Err(error) => return Value::Error(error),
                    };
                    if !value_range.same_shape(&range) {
                        return Value::Error(FormulaError::Value);
                    }
                    let criterion = match self.eval_criterion(&pair[1], sheet, pass, depth + 1) {
                        Ok(criterion) => criterion,
                        Err(error) => return Value::Error(error),
                    };
                    ranges.push(range);
                    criteria.push(criterion);
                }
                let pairs: Vec<_> = ranges.iter().zip(&criteria).collect();
                if matches!(func, Func::MaxIfs | Func::MinIfs) {
                    extreme_if(&value_range, &pairs, func == Func::MaxIfs)
                } else {
                    aggregate_if(&value_range, &pairs, func == Func::AverageIfs)
                }
            }
            _ => Value::Error(FormulaError::Value),
        }
    }
}
