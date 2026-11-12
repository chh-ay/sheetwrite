//! The arguments of the statistics that read numbers: MEDIAN, MODE.SNGL,
//! LARGE, SMALL, RANK.EQ, PERCENTILE.INC, QUARTILE.INC, STDEV, VAR,
//! GEOMEAN, CORREL and COVARIANCE.
//!
//! A range argument is read in place through its [`RangeView`]: only its
//! numbers are kept, not a value per cell. Every other argument reads as the
//! function accumulator reads it, so the results and the error that wins are
//! the same: an error cell or argument stops the evaluation at once, and an
//! error that only reading a number reveals (text that isn't a number, a
//! number that isn't finite) is reported when the statistic reads that
//! argument.

use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{
    CellRange, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT, RANGE_CELL_LIMIT,
};

use super::array::ast_produces_array;
use super::functions::{treats_cell_as_reference, FuncAccumulator, MAX_FUNCTION_ARGS};
use super::matrix::argument_range;
use super::range_view::{NumberSink, RangeView};
use super::statistics::{self, NumberStatistic, PairedCell, PairedKind, PairedMoments};
use super::value::aggregate_number;
use super::EvalPass;

/// The cells of the arguments, in argument order.
enum Cells {
    /// The numbers each argument contributes.
    Numbers(Vec<f64>),
    /// Every cell, for a statistic that pairs cells by position.
    Paired(Vec<PairedCell>),
}

/// The numbers of a range, and whether one of them isn't finite.
struct NumberList<'a> {
    numbers: &'a mut Vec<f64>,
    non_finite: bool,
}

impl NumberSink for NumberList<'_> {
    #[inline]
    fn number(&mut self, number: f64) {
        if number.is_finite() {
            self.numbers.push(number);
        } else {
            self.non_finite = true;
        }
    }

    #[inline]
    fn skipped(&mut self) {}
}

/// Every cell of a range, for a paired statistic.
struct PairedList<'a>(&'a mut Vec<PairedCell>);

impl NumberSink for PairedList<'_> {
    #[inline]
    fn number(&mut self, number: f64) {
        self.0.push(PairedCell::Number(number));
    }

    #[inline]
    fn skipped(&mut self) {
        self.0.push(PairedCell::Skipped);
    }
}

/// One argument: where its cells end, how many cells it has, its first
/// value and the first error that reading its numbers gives.
struct Arg {
    end: usize,
    cells: usize,
    first: Value,
    deferred: Option<FormulaError>,
    missing: bool,
}

/// The arguments of a statistic, read once.
pub(super) struct StatisticArgs {
    cells: Cells,
    args: Vec<Arg>,
    /// Cells across all arguments, against the accumulator's cell limit.
    total_cells: usize,
    /// The current argument while it is read.
    current: Option<Arg>,
}

impl StatisticArgs {
    const fn new(paired: bool) -> Self {
        Self {
            cells: if paired {
                Cells::Paired(Vec::new())
            } else {
                Cells::Numbers(Vec::new())
            },
            args: Vec::new(),
            total_cells: 0,
            current: None,
        }
    }

    /// The arguments as the function accumulator holds them, for the callers
    /// that evaluate their arguments themselves.
    pub(super) fn from_accumulator(values: &FuncAccumulator, paired: bool) -> Self {
        let mut args = Self::new(paired);
        for index in 0..values.arg_count() {
            let entries = values.arg(index).unwrap_or_default();
            args.start_arg();
            for entry in entries {
                args.push_value(&entry.value, entry.from_range);
            }
            args.finish_arg(
                entries
                    .first()
                    .map_or(Value::Blank, |entry| entry.value.clone()),
                values.arg_missing(index),
            );
        }
        args
    }

    fn start_arg(&mut self) {
        self.current = Some(Arg {
            end: 0,
            cells: 0,
            first: Value::Blank,
            deferred: None,
            missing: false,
        });
    }

    /// One more cell, against the accumulator's limit of cells per call.
    const fn count_cells(&mut self, cells: usize) -> Result<(), FormulaError> {
        let total = self.total_cells.saturating_add(cells);
        if total > RANGE_CELL_LIMIT as usize {
            return Err(FormulaError::Num);
        }
        self.total_cells = total;
        if let Some(arg) = &mut self.current {
            arg.cells += cells;
        }
        Ok(())
    }

    /// Room for `cells` more cells.
    fn reserve(&mut self, cells: usize) -> Result<(), FormulaError> {
        let reserved = match &mut self.cells {
            Cells::Numbers(numbers) => numbers.try_reserve(cells),
            Cells::Paired(paired) => paired.try_reserve(cells),
        };
        reserved.map_err(|_| FormulaError::Num)
    }

    fn defer(&mut self, error: FormulaError) {
        if let Some(arg) = &mut self.current {
            arg.deferred.get_or_insert(error);
        }
    }

    /// A value that is not an error, read from a range when `from_range`.
    fn push_value(&mut self, value: &Value, from_range: bool) {
        match &mut self.cells {
            Cells::Numbers(numbers) => match aggregate_number(value, from_range) {
                Ok(Some(number)) => numbers.push(number),
                Ok(None) => {}
                Err(error) => self.defer(error),
            },
            Cells::Paired(cells) => cells.push(PairedCell::of(value)),
        }
    }

    fn finish_arg(&mut self, first: Value, missing: bool) {
        let Some(mut arg) = self.current.take() else {
            return;
        };
        arg.end = match &self.cells {
            Cells::Numbers(numbers) => numbers.len(),
            Cells::Paired(cells) => cells.len(),
        };
        arg.first = first;
        arg.missing = missing;
        self.args.push(arg);
    }

    /// The number of arguments.
    pub(super) const fn arg_count(&self) -> usize {
        self.args.len()
    }

    /// Whether argument `index` was left empty, as in `RANK.EQ(1,A1:A3,)`.
    pub(super) fn arg_missing(&self, index: usize) -> bool {
        self.args.get(index).is_some_and(|arg| arg.missing)
    }

    /// The first value of argument `index`.
    pub(super) fn arg_value(&self, index: usize) -> Option<&Value> {
        self.args.get(index).map(|arg| &arg.first)
    }

    fn start(&self, index: usize) -> usize {
        index
            .checked_sub(1)
            .and_then(|previous| self.args.get(previous))
            .map_or(0, |previous| previous.end)
    }

    /// The numbers of the arguments in `args`, after their cell count is
    /// checked against `max_cells` and the first error that reading their
    /// numbers gives. A statistic may reorder them: it reads them once.
    fn numbers_of(
        &mut self,
        args: std::ops::Range<usize>,
        max_cells: usize,
    ) -> Result<&mut [f64], FormulaError> {
        let selected = self.args.get(args.clone()).unwrap_or_default();
        if selected.iter().map(|arg| arg.cells).sum::<usize>() > max_cells {
            return Err(FormulaError::Num);
        }
        if let Some(error) = selected.iter().find_map(|arg| arg.deferred) {
            return Err(error);
        }
        let start = self.start(args.start);
        let end = selected.last().map_or(start, |arg| arg.end);
        let Cells::Numbers(numbers) = &mut self.cells else {
            return Err(FormulaError::Value);
        };
        Ok(numbers.get_mut(start..end).unwrap_or_default())
    }

    /// The numbers of argument `index`, or none when it is absent.
    pub(super) fn numbers(
        &mut self,
        index: usize,
        max_cells: usize,
    ) -> Result<&mut [f64], FormulaError> {
        self.numbers_of(index..index + 1, max_cells)
    }

    /// The numbers of every argument.
    pub(super) fn all_numbers(&mut self, max_cells: usize) -> Result<&mut [f64], FormulaError> {
        let count = self.args.len();
        self.numbers_of(0..count, max_cells)
    }

    /// The cells of argument `index` of a paired statistic.
    pub(super) fn paired(&self, index: usize) -> &[PairedCell] {
        let Cells::Paired(cells) = &self.cells else {
            return &[];
        };
        let start = self.start(index);
        let end = self.args.get(index).map_or(start, |arg| arg.end);
        cells.get(start..end).unwrap_or_default()
    }
}

/// Reads the arguments of one statistic call.
struct Reader<'a> {
    store: &'a CellStore,
    func: Func,
    sheet: usize,
    values: StatisticArgs,
}

impl Reader<'_> {
    /// Reads `area` as the function accumulator does, keeping only what the
    /// statistic reads. Returns the area's first value.
    fn range(
        &mut self,
        area: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        let view = RangeView::clipped(self.store, area, depth)?;
        let (rows, cols) = view.shape();
        let cells = (rows as u64).saturating_mul(cols as u64);
        if cells > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        self.values.count_cells(cells as usize)?;

        self.values.reserve(cells as usize)?;
        match &mut self.values.cells {
            Cells::Numbers(numbers) => {
                let mut sink = NumberList {
                    numbers,
                    non_finite: false,
                };
                view.scan_numbers(pass, &mut sink)?;
                let non_finite = sink.non_finite;
                if non_finite {
                    self.values.defer(FormulaError::Num);
                }
            }
            Cells::Paired(paired) => view.scan_numbers(pass, &mut PairedList(paired))?,
        }
        Ok(view.cell(0, 0, pass))
    }

    /// The areas of a union or a 3-D reference, area by area. Returns the
    /// first value of the first area.
    fn areas(
        &mut self,
        reference: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let mut first = None;
        for area in self
            .store
            .area_ranges(self.func, reference, self.sheet, depth)
        {
            let (range, range_depth) = area?;
            let value = self.range(range, pass, range_depth)?;
            first.get_or_insert(value);
        }

        if let Some(value) = first {
            return Ok(value);
        }
        // Every sheet of the span is smaller than the range: one blank keeps
        // the argument.
        self.values.count_cells(1)?;
        self.values.push_value(&Value::Blank, true);
        Ok(Value::Blank)
    }

    /// An argument that is not a written range: an array, or one value.
    /// Returns its first value.
    fn value(
        &mut self,
        arg: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        if ast_produces_array(arg) {
            if let Some(result) = self
                .store
                .eval_dynamic_array(arg, self.sheet, pass, depth + 1)
            {
                let matrix = result?;
                matrix.validate_copies(2)?;
                for value in &matrix.values {
                    if let Value::Error(error) = value {
                        return Err(*error);
                    }
                    self.values.count_cells(1)?;
                    self.values.push_value(value, true);
                }
                return Ok(matrix.values.first().map_or(Value::Blank, Clone::clone));
            }
        }

        let value = self.store.eval_ast(arg, self.sheet, pass, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        let from_range =
            treats_cell_as_reference(self.func) && matches!(arg, Ast::Cell(..) | Ast::AbsCell(..));
        self.values.count_cells(1)?;
        self.values.push_value(&value, from_range);
        Ok(value)
    }

    /// Reads every argument in order, as the function accumulator does.
    fn read(
        mut self,
        args: &[Ast],
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<StatisticArgs, FormulaError> {
        for arg in args {
            self.values.start_arg();
            let first = if let Some(area) = argument_range(arg, self.sheet) {
                self.range(area, pass, depth + 1)?
            } else if matches!(arg, Ast::Func(Func::Union, _) | Ast::SheetSpan(_)) {
                self.areas(arg, pass, depth + 1)?
            } else {
                self.value(arg, pass, depth)?
            };

            if self.values.args.len() >= MAX_FUNCTION_ARGS {
                return Err(FormulaError::Value);
            }
            self.values.finish_arg(first, matches!(arg, Ast::Missing));
        }
        Ok(self.values)
    }
}

/// One call of a statistic that reads numbers.
pub(super) struct StatisticCall<'a> {
    pub(super) statistic: NumberStatistic,
    pub(super) func: Func,
    pub(super) args: &'a [Ast],
    pub(super) sheet: usize,
    pub(super) depth: usize,
}

impl CellStore {
    /// CORREL or COVARIANCE of two written ranges of dense literal cells of
    /// the same size, read pair by pair without keeping the cells. `None`
    /// leaves the call to the general reader, before any cell is evaluated.
    fn literal_paired(
        &self,
        kind: PairedKind,
        call: &StatisticCall<'_>,
    ) -> Option<Result<f64, FormulaError>> {
        let [left_arg, right_arg] = call.args else {
            return None;
        };
        let depth = call.depth + 1;
        if depth > FORMULA_RECURSION_LIMIT {
            return None;
        }
        let left = RangeView::clipped(self, argument_range(left_arg, call.sheet)?, depth).ok()?;
        let right = RangeView::clipped(self, argument_range(right_arg, call.sheet)?, depth).ok()?;
        let (left_rows, left_cols) = left.shape();
        let cells = left_rows.checked_mul(left_cols)?;
        if cells.checked_mul(2)? > RANGE_CELL_LIMIT as usize {
            return None;
        }

        let mut moments = PairedMoments::default();
        let mut moment_error = None;
        let read = left.literal_pairs(&right, |x, y| {
            if let (Some(x), Some(y), None) = (x, y, moment_error) {
                if let Err(error) = moments.push(x, y) {
                    moment_error = Some(error);
                }
            }
        })?;
        Some(read.and_then(|()| moment_error.map_or_else(|| moments.finish(kind), Err)))
    }

    /// A statistic that reads numbers, with its range arguments read in
    /// place. See `eval_func` for why families live in out-of-line
    /// `*_family` handlers.
    #[inline(never)]
    pub(super) fn eval_statistics_family(
        &self,
        call: &StatisticCall<'_>,
        pass: &mut EvalPass<'_>,
    ) -> EvalResult {
        if let NumberStatistic::Paired(kind) = call.statistic {
            if let Some(result) = self.literal_paired(kind, call) {
                return result.map_or_else(Value::Error, Value::number);
            }
        }

        let reader = Reader {
            store: self,
            func: call.func,
            sheet: call.sheet,
            values: StatisticArgs::new(call.statistic.is_paired()),
        };
        match reader.read(call.args, pass, call.depth) {
            Ok(mut values) => statistics::apply_numbers(call.statistic, &mut values),
            Err(error) => Value::Error(error),
        }
    }
}
