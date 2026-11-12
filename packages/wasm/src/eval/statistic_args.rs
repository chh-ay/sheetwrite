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

use super::areas::{accepts_sheet_span, accepts_union};
use super::array::ast_produces_array;
use super::functions::{treats_cell_as_reference, FuncAccumulator, MAX_FUNCTION_ARGS};
use super::matrix::{intersection_range, range_from_ast};
use super::range_view::RangeView;
use super::statistics::{self, PairedCell, PairedKind};
use super::value::aggregate_number;
use super::EvalPass;

/// The cells of the arguments, in argument order.
enum Cells {
    /// The numbers each argument contributes.
    Numbers(Vec<f64>),
    /// Every cell, for a statistic that pairs cells by position.
    Paired(Vec<PairedCell>),
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
    fn new(paired: bool) -> Self {
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
    fn count_cells(&mut self, cells: usize) -> Result<(), FormulaError> {
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

    fn defer(&mut self, error: FormulaError) {
        if let Some(arg) = &mut self.current {
            arg.deferred.get_or_insert(error);
        }
    }

    /// A number of a range cell, or `None` for a cell that holds no number.
    fn push_range_number(&mut self, number: Option<f64>) {
        match &mut self.cells {
            Cells::Numbers(numbers) => match number {
                Some(number) if number.is_finite() => numbers.push(number),
                Some(_) => self.defer(FormulaError::Num),
                None => {}
            },
            Cells::Paired(cells) => {
                cells.push(number.map_or(PairedCell::Skipped, PairedCell::Number))
            }
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
    pub(super) fn arg_count(&self) -> usize {
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
    /// numbers gives.
    fn numbers_of(
        &self,
        args: std::ops::Range<usize>,
        max_cells: usize,
    ) -> Result<&[f64], FormulaError> {
        let Cells::Numbers(numbers) = &self.cells else {
            return Err(FormulaError::Value);
        };
        let selected = self.args.get(args.clone()).unwrap_or_default();
        if selected.iter().map(|arg| arg.cells).sum::<usize>() > max_cells {
            return Err(FormulaError::Num);
        }
        if let Some(error) = selected.iter().find_map(|arg| arg.deferred) {
            return Err(error);
        }
        let start = self.start(args.start);
        let end = selected.last().map_or(start, |arg| arg.end);
        Ok(numbers.get(start..end).unwrap_or_default())
    }

    /// The numbers of argument `index`, or none when it is absent.
    pub(super) fn numbers(&self, index: usize, max_cells: usize) -> Result<&[f64], FormulaError> {
        self.numbers_of(index..index + 1, max_cells)
    }

    /// The numbers of every argument.
    pub(super) fn all_numbers(&self, max_cells: usize) -> Result<&[f64], FormulaError> {
        self.numbers_of(0..self.args.len(), max_cells)
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

#[cfg(test)]
thread_local! {
    /// Sends the statistics through the function accumulator, for tests that
    /// compare the two readers.
    pub(super) static STATISTIC_VIEWS_OFF: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Whether tests have sent the statistics through the function accumulator.
#[cfg(test)]
pub(super) fn views_off() -> bool {
    STATISTIC_VIEWS_OFF.with(std::cell::Cell::get)
}

/// Whether tests have sent the statistics through the function accumulator.
#[cfg(not(test))]
pub(super) const fn views_off() -> bool {
    false
}

/// Whether `func` reads its arguments through [`StatisticArgs`].
pub(super) const fn reads_numbers(func: Func) -> bool {
    matches!(
        func,
        Func::Median
            | Func::ModeSngl
            | Func::Large
            | Func::Small
            | Func::RankEq
            | Func::PercentileInc
            | Func::QuartileInc
            | Func::StdevS
            | Func::StdevP
            | Func::VarS
            | Func::VarP
            | Func::GeoMean
            | Func::Correl
            | Func::CovarianceS
            | Func::CovarianceP
    )
}

/// The range an argument names, as the function accumulator resolves it.
fn written_area(arg: &Ast, sheet: usize) -> Option<CellRange> {
    match arg {
        Ast::Range(row_start, col_start, row_end, col_end, _) => Some(CellRange::new(
            sheet as u32,
            *row_start,
            *col_start,
            *row_end,
            *col_end,
        )),
        Ast::AbsRange(sheet_ref, row_start, col_start, row_end, col_end, _) => Some(
            CellRange::new(sheet_ref.handle, *row_start, *col_start, *row_end, *col_end),
        ),
        Ast::NamedRange(named) => Some(CellRange::new(
            named.sheet,
            named.row_start,
            named.col_start,
            named.row_end,
            named.col_end,
        )),
        Ast::Structured(reference) => Some(CellRange::new(
            reference.sheet,
            reference.row_start,
            reference.col,
            reference.row_end,
            reference.col,
        )),
        Ast::Func(Func::Intersect, operands) => intersection_range(operands, sheet).ok(),
        _ => None,
    }
}

impl CellStore {
    /// A statistic that reads numbers, with its range arguments read in
    /// place. See `eval_func` for why families live in out-of-line
    /// `*_family` handlers.
    #[inline(never)]
    pub(super) fn eval_statistics_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        match self.statistic_args(func, args, sheet, pass, depth) {
            Ok(values) => statistics::apply_numbers(func, &values),
            Err(error) => Value::Error(error),
        }
    }

    fn statistic_args(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<StatisticArgs, FormulaError> {
        let mut values = StatisticArgs::new(PairedKind::of(func).is_some());
        for arg in args {
            values.start_arg();

            let first = if let Some(area) = written_area(arg, sheet) {
                self.push_statistic_range(area, pass, depth + 1, &mut values)?
            } else if matches!(arg, Ast::Func(Func::Union, _) | Ast::SheetSpan(_)) {
                self.push_statistic_areas(func, arg, sheet, pass, depth + 1, &mut values)?;
                if values
                    .current
                    .as_ref()
                    .is_some_and(|current| current.cells == 0)
                {
                    // Every sheet of the span is smaller than the range: one
                    // blank keeps the argument.
                    values.count_cells(1)?;
                    values.push_value(&Value::Blank, true);
                }
                values
                    .current
                    .as_ref()
                    .map_or(Value::Blank, |current| current.first.clone())
            } else {
                self.push_statistic_value(func, arg, sheet, pass, depth, &mut values)?
            };

            if values.args.len() >= MAX_FUNCTION_ARGS {
                return Err(FormulaError::Value);
            }
            values.finish_arg(first, matches!(arg, Ast::Missing));
        }
        Ok(values)
    }

    /// Reads `area` as the function accumulator does, keeping only what the
    /// statistic reads. Returns the area's first value.
    fn push_statistic_range(
        &self,
        area: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
        values: &mut StatisticArgs,
    ) -> Result<Value, FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        let view = RangeView::clipped(self, area, depth)?;
        let (rows, cols) = view.shape();
        let cells = (rows as u64).saturating_mul(cols as u64);
        if cells > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        let first_of_arg = values
            .current
            .as_ref()
            .is_some_and(|current| current.cells == 0);
        values.count_cells(cells as usize)?;

        view.scan_numbers(pass, |number| values.push_range_number(number))?;

        let first = view.cell(0, 0, pass);
        if first_of_arg {
            if let Some(current) = &mut values.current {
                current.first = first.clone();
            }
        }
        Ok(first)
    }

    /// The areas of a union or a 3-D reference, area by area.
    fn push_statistic_areas(
        &self,
        func: Func,
        reference: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
        values: &mut StatisticArgs,
    ) -> Result<(), FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        match reference {
            Ast::Func(Func::Union, areas) if accepts_union(func) => {
                for area in areas {
                    match range_from_ast(area, sheet) {
                        Some(range) => {
                            self.push_statistic_range(range, pass, depth + 1, values)?;
                        }
                        None => {
                            self.push_statistic_areas(func, area, sheet, pass, depth + 1, values)?;
                        }
                    }
                }
                Ok(())
            }
            Ast::SheetSpan(span) if accepts_sheet_span(func) => {
                for &handle in &span.sheets {
                    let Some(data) = self.sheets.get(handle as usize) else {
                        continue;
                    };
                    if span.row_start as usize >= data.cells.row_count()
                        || span.col_start as usize >= data.cells.n_cols()
                    {
                        continue;
                    }
                    let range = CellRange::new(
                        handle,
                        span.row_start,
                        span.col_start,
                        span.row_end,
                        span.col_end,
                    );
                    self.push_statistic_range(range, pass, depth + 1, values)?;
                }
                Ok(())
            }
            Ast::Func(Func::Intersect, operands) => Err(intersection_range(operands, sheet)
                .err()
                .unwrap_or(FormulaError::Value)),
            Ast::InvalidRef => Err(FormulaError::Ref),
            _ => Err(FormulaError::Value),
        }
    }

    /// An argument that is not a written range: an array, or one value.
    /// Returns its first value.
    fn push_statistic_value(
        &self,
        func: Func,
        arg: &Ast,
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
        values: &mut StatisticArgs,
    ) -> Result<Value, FormulaError> {
        if ast_produces_array(arg) {
            if let Some(matrix) = self.eval_dynamic_array(arg, sheet, pass, depth + 1) {
                let matrix = matrix?;
                matrix.validate_copies(2)?;
                for value in &matrix.values {
                    if let Value::Error(error) = value {
                        return Err(*error);
                    }
                    values.count_cells(1)?;
                    values.push_value(value, true);
                }
                return Ok(matrix.values.first().cloned().unwrap_or(Value::Blank));
            }
        }

        let value = self.eval_ast(arg, sheet, pass, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        let from_range =
            treats_cell_as_reference(func) && matches!(arg, Ast::Cell(..) | Ast::AbsCell(..));
        values.count_cells(1)?;
        values.push_value(&value, from_range);
        Ok(value)
    }
}

#[cfg(test)]
mod differential {
    use super::STATISTIC_VIEWS_OFF;

    use crate::cells::DEFAULT_MAX_PAGED_DIRTY_CELLS;
    use crate::store::CellStore;

    const ROWS: usize = 30;

    /// Columns A–E mix numbers, numeric and other text, logical values,
    /// blanks and formulas; C holds a number that isn't finite, E an error
    /// formula, and F a spill.
    fn dense_sheet(store: &mut CellStore) -> usize {
        let sheet = store.add_sheet(12, ROWS + 10);
        for row in 0..ROWS {
            for col in 0..4 {
                match (row * 3 + col * 5) % 9 {
                    0 => store.set_string(
                        sheet,
                        row,
                        col,
                        ["4", "x", "", "élan"][(row + col) % 4],
                        0,
                    ),
                    1 => store.set_bool(sheet, row, col, row % 2 == 0, 0),
                    2 => {}
                    3 => store.set_number(sheet, row, col, (row % 4) as f64, 0),
                    _ => store.set_number(
                        sheet,
                        row,
                        col,
                        (row as f64).mul_add(1.75, -(col as f64) * 3.5),
                        0,
                    ),
                }
            }
            let source = match row % 5 {
                0 => format!("=A{}*2", row + 1),
                1 => "=\"ü\"".to_owned(),
                2 => "=TRUE()".to_owned(),
                _ => format!("={}", row + 1),
            };
            store.set_formula(sheet, row, 4, &source, 0);
        }
        store.set_number(sheet, 20, 2, f64::INFINITY, 0);
        store.set_formula(sheet, 7, 4, "=1/0", 0);
        store.set_formula(sheet, 0, 5, "=SEQUENCE(5,1,3,2)", 0);
        sheet
    }

    fn dense_formulas() -> Vec<String> {
        let mut formulas = Vec::new();
        for func in [
            "MEDIAN",
            "MODE.SNGL",
            "STDEV.S",
            "STDEV.P",
            "VAR.S",
            "VAR.P",
            "GEOMEAN",
        ] {
            for args in [
                "A1:A30",
                "A1:D30",
                "A1:A30,D1:D30",
                "B1:B30",
                "E1:E30",
                "E9:E30",
                "C1:C30",
                "F1:F10",
                "A1,\"4\",TRUE",
                "A1:A30,\"x\"",
                "(A1:A5,B1:B5)",
                "{1,2,2,3}",
                "SEQUENCE(4)",
                "A1:A30,1/0",
                "S1:S2!A1:A30",
                "A1:A30,A1:A0",
                "D2:D5,7",
            ] {
                formulas.push(format!("={func}({args})"));
            }
        }
        for func in ["LARGE", "SMALL"] {
            for args in [
                "A1:A30,3",
                "A1:D30,1",
                "B1:B30,\"2\"",
                "A1:A30,0",
                "A1:A30,B1:B3",
                "A1:A30,",
                "(A1:A5,B1:B5),2",
                "{5,1,3},2",
                "A1:A30,99",
                "E1:E30,1",
                "A1,1",
                "C1:C30,1",
                "F1:F10,2",
                "A1:A30,TRUE",
            ] {
                formulas.push(format!("={func}({args})"));
            }
        }
        for args in [
            "A3,A1:A30",
            "A3,A1:A30,1",
            "A3,A1:A30,",
            "99,A1:A30",
            "\"x\",A1:A30",
            "A3,(A1:A5,B1:B5)",
            "D2,D1:D30",
            "5,{1,5,9}",
            "A3,E1:E30",
            "F2,F1:F10,1",
            "A1:A3,A1:A30",
            "4,A1",
        ] {
            formulas.push(format!("=RANK.EQ({args})"));
        }
        for args in [
            "A1:A30,0.9",
            "A1:B30,0",
            "B1:D30,0.37",
            "A1:A30,1.5",
            "A1:A30,\"x\"",
            "(A1:A5,B1:B5),0.5",
            "A1,0.5",
            "E9:E30,0.5",
        ] {
            formulas.push(format!("=PERCENTILE.INC({args})"));
        }
        for args in ["A1:A30,3", "A1:A30,5", "A1:D30,1", "A1:A30,\"1\""] {
            formulas.push(format!("=QUARTILE.INC({args})"));
        }
        for func in ["CORREL", "COVARIANCE.S", "COVARIANCE.P"] {
            for args in [
                "A1:A30,B1:B30",
                "A1:A30,D1:D30",
                "A1:A10,B1:B12",
                "A1:B15,D1:D30",
                "B1:B30,C1:C30",
                "A1,B1",
                "{1,2,3},{2,4,7}",
                "A1:A30,E1:E30",
                "E9:E30,A9:A30",
                "A1:A5,F1:F5",
                "(A1:A5,B1:B5),A1:A10",
            ] {
                formulas.push(format!("={func}({args})"));
            }
        }
        formulas
    }

    /// Columns A and B loaded in the first page, C formulas over them, and
    /// rows past the first page not loaded.
    fn paged_sheet(store: &mut CellStore) -> usize {
        let sheet = store.add_paged_sheet(10, 6000, 4096, 1_000_000, DEFAULT_MAX_PAGED_DIRTY_CELLS);
        let column_a: Vec<f64> = (0..ROWS).map(|row| ((row * 7) % 11) as f64).collect();
        let column_b: Vec<f64> = (0..ROWS)
            .map(|row| (row as f64).mul_add(0.5, -3.0))
            .collect();
        store.begin_page_load();
        store.set_column_numbers(sheet, 0, 0, &column_a, 0);
        store.set_column_numbers(sheet, 1, 0, &column_b, 0);
        store.commit_sources();
        for row in 0..5 {
            store.set_formula(sheet, row, 2, &format!("=A{}*3", row + 1), 0);
        }
        sheet
    }

    fn paged_formulas() -> Vec<String> {
        [
            "=MEDIAN(A1:A30)",
            "=MEDIAN(A1:A5000)",
            "=LARGE(A1:B20,2)",
            "=RANK.EQ(A2,A1:A30)",
            "=CORREL(A1:A30,B1:B30)",
            "=STDEV.S(A1:A4096)",
            "=PERCENTILE.INC(B1:B30,0.5)",
            "=STDEV.S(C1:C5)",
            "=MODE.SNGL(A1:A30)",
            "=QUARTILE.INC(A1:B30,1)",
            "=COVARIANCE.S(A1:A5000,B1:B5000)",
        ]
        .map(str::to_owned)
        .to_vec()
    }

    /// Each formula's result, as kind, number bits and text.
    fn results(views: bool) -> Vec<(String, u8, u64, Option<String>)> {
        STATISTIC_VIEWS_OFF.with(|off| off.set(!views));
        let mut store = CellStore::new();
        let dense = dense_sheet(&mut store);
        let second = dense_sheet(&mut store);
        store.set_sheet_name(dense, "s1", "S1");
        store.set_sheet_name(second, "s2", "S2");
        let paged = paged_sheet(&mut store);

        let mut cells = Vec::new();
        for (sheet, sources) in [(dense, dense_formulas()), (paged, paged_formulas())] {
            for (row, source) in sources.into_iter().enumerate() {
                store.set_formula(sheet, row, 8, &source, 0);
                cells.push((sheet, row, source));
            }
            store.recompute(sheet);
        }
        STATISTIC_VIEWS_OFF.with(|off| off.set(false));

        cells
            .into_iter()
            .map(|(sheet, row, source)| {
                let cell = store.get_cell(sheet, row, 8);
                (source, cell.kind(), cell.num().to_bits(), cell.string())
            })
            .collect()
    }

    #[test]
    fn statistic_views_match_the_function_accumulator() {
        let accumulated = results(false);
        let viewed = results(true);
        assert_eq!(accumulated.len(), viewed.len(), "formula counts differ");
        for (accumulated, viewed) in accumulated.iter().zip(&viewed) {
            assert_eq!(accumulated, viewed, "{}", accumulated.0);
        }
    }
}
