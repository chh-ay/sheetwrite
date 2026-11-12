//! The cells that SUBTOTAL and AGGREGATE leave out of a reference: rows that
//! the sheet's view hides, and cells whose formula calls SUBTOTAL or
//! AGGREGATE, which Excel skips so that a subtotal is not counted twice.

use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{
    CellRange, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT, RANGE_CELL_LIMIT,
};

use super::array::ast_produces_array;
use super::functions::MAX_FUNCTION_ARGS;
use super::math::SubtotalFold;
use super::matrix::{argument_range, range_from_ast};
use super::range_view::{CellSink, RangeView};
use super::value::number_from_value;
use super::EvalPass;
use crate::formula_slots::FormulaStore;
use crate::row_visibility::{HiddenRowCursor, SkippedRows};
use crate::sheet::SheetData;

#[cfg(test)]
thread_local! {
    /// Sends SUBTOTAL through the function accumulator, for tests that
    /// compare the two readers.
    pub(super) static SUBTOTAL_VIEWS_OFF: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// Whether tests have sent SUBTOTAL through the function accumulator.
#[cfg(test)]
pub(super) fn views_off() -> bool {
    SUBTOTAL_VIEWS_OFF.with(std::cell::Cell::get)
}

/// Whether tests have sent SUBTOTAL through the function accumulator.
#[cfg(not(test))]
pub(super) const fn views_off() -> bool {
    false
}

/// Whether `ast` calls SUBTOTAL or AGGREGATE anywhere.
pub(crate) fn ast_calls_subtotal(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Subtotal, _) => true,
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(super::analysis::AGGREGATE_ID), _) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_calls_subtotal),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_calls_subtotal(left) || ast_calls_subtotal(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_calls_subtotal(inner),
        Ast::LetSlot { expression, .. } => ast_calls_subtotal(expression),
        Ast::NamedFormula(named) => ast_calls_subtotal(&named.expression),
        _ => false,
    }
}

/// What a SUBTOTAL or AGGREGATE reference argument leaves out. A skipped
/// cell is read as blank and is not evaluated, so an error there does not
/// reach the result.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SkippedCells {
    pub(crate) rows: Option<SkippedRows>,
    pub(crate) nested_subtotals: bool,
}

impl SkippedCells {
    /// The rows of `sheet` this skips, as a cursor for a walk down the rows.
    pub(crate) fn hidden_rows(self, sheet: &SheetData) -> HiddenRowCursor {
        self.rows.map_or_else(HiddenRowCursor::default, |rows| {
            sheet.visibility.hidden_rows(rows)
        })
    }

    #[inline(never)]
    pub(crate) fn skips_cell(
        self,
        sheet: &SheetData,
        row: u32,
        col: u32,
        slots: &FormulaStore,
    ) -> bool {
        self.nested_subtotals
            && sheet
                .formulas
                .id((row, col))
                .is_some_and(|id| slots.is_subtotal(id))
    }
}

impl CellSink for SubtotalFold {
    #[inline]
    fn number(&mut self, number: f64) {
        self.push_number(number);
    }

    #[inline]
    fn other(&mut self) {
        self.push_other();
    }
}

/// The function and hidden rows of a SUBTOTAL code, or the error a code that
/// isn't one gives once every argument is read.
fn subtotal_code(value: &Value, missing: bool) -> Result<(i64, SkippedRows), FormulaError> {
    if missing {
        return Err(FormulaError::Value);
    }
    let number = number_from_value(value)?;
    if !number.is_finite() || number < i64::MIN as f64 || number > i64::MAX as f64 {
        return Err(FormulaError::Num);
    }
    match number.trunc() as i64 {
        code @ 1..=11 => Ok((code, SkippedRows::Filtered)),
        code @ 101..=111 => Ok((code - 100, SkippedRows::Hidden)),
        _ => Err(FormulaError::Value),
    }
}

/// The reference a SUBTOTAL argument after the code names: a range, or a
/// single cell, whose row can be hidden too.
fn subtotal_reference(arg: &Ast, sheet: usize) -> Option<CellRange> {
    if matches!(arg, Ast::Cell(..) | Ast::AbsCell(..)) {
        return range_from_ast(arg, sheet);
    }
    argument_range(arg, sheet)
}

impl CellStore {
    /// SUBTOTAL whose arguments after the code are all references, read in
    /// place: hidden rows are stepped over run by run, and only formula cells
    /// are checked for a nested SUBTOTAL. `None` leaves the call to the
    /// function accumulator, before anything is evaluated. See `eval_func`
    /// for why families live in out-of-line `*_family` handlers.
    #[inline(never)]
    pub(super) fn eval_subtotal_family(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        let (code_arg, references) = args.split_first()?;
        if references.is_empty()
            || args.len() > MAX_FUNCTION_ARGS
            || argument_range(code_arg, sheet).is_some()
            || matches!(code_arg, Ast::Func(Func::Union, _) | Ast::SheetSpan(_))
            || ast_produces_array(code_arg)
            || !references
                .iter()
                .all(|arg| subtotal_reference(arg, sheet).is_some())
        {
            return None;
        }

        let code_value = self.eval_ast(code_arg, sheet, pass, depth + 1);
        if let Value::Error(error) = code_value {
            return Some(Value::Error(error));
        }
        let code = subtotal_code(&code_value, matches!(code_arg, Ast::Missing));
        let (function, rows) = code.unwrap_or((9, SkippedRows::Filtered));
        let skipped = SkippedCells {
            rows: Some(rows),
            nested_subtotals: true,
        };

        let mut fold = SubtotalFold::new(function);
        let mut cells = 1u64;
        for arg in references {
            let range = subtotal_reference(arg, sheet)?;
            if let Err(error) =
                self.fold_subtotal_range(range, (skipped, &mut cells), pass, depth + 1, &mut fold)
            {
                return Some(Value::Error(error));
            }
        }

        Some(match code {
            Ok(_) => fold.finish(),
            Err(error) => Value::Error(error),
        })
    }

    /// One reference of [`Self::eval_subtotal_family`], with the checks of
    /// the accumulator's range read. `cells` counts the cells of the call
    /// so far, against the accumulator's limit.
    fn fold_subtotal_range(
        &self,
        range: CellRange,
        read: (SkippedCells, &mut u64),
        pass: &mut EvalPass<'_>,
        depth: usize,
        fold: &mut SubtotalFold,
    ) -> Result<(), FormulaError> {
        let (skipped, cells) = read;
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        let view = RangeView::clipped(self, range, depth)?;
        let (rows, cols) = view.shape();
        let range_cells = (rows as u64).saturating_mul(cols as u64);
        if range_cells > RANGE_CELL_LIMIT || cells.saturating_add(range_cells) > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        *cells += range_cells;

        let data = &self.sheets[range.sheet as usize];
        let mut hidden = skipped.hidden_rows(data);
        let skips_formula = |row: usize, col: usize| {
            skipped.skips_cell(data, row as u32, col as u32, &self.formula_slots)
        };
        view.scan_visible(&mut hidden, skips_formula, pass, fold)
    }
}

#[cfg(test)]
mod differential {
    use super::SUBTOTAL_VIEWS_OFF;

    use crate::cells::DEFAULT_MAX_PAGED_DIRTY_CELLS;
    use crate::store::CellStore;

    const ROWS: usize = 40;

    /// A–C mix numbers, text, logical values, blanks, error formulas,
    /// nested subtotals and other formulas; D holds a spill.
    fn dense_sheet(store: &mut CellStore) -> usize {
        let sheet = store.add_sheet(12, 260);
        for row in 0..ROWS {
            for col in 0..3 {
                match (row * 5 + col * 3) % 11 {
                    0 => {
                        store.set_string(sheet, row, col, ["7", "x", "", "Ünï"][(row + col) % 4], 0)
                    }
                    1 => store.set_bool(sheet, row, col, row % 2 == 0, 0),
                    2 => {}
                    3 => {
                        store.set_formula(sheet, row, col, &format!("=A{}*2", row % 3 + 1), 0);
                    }
                    4 => {
                        store.set_formula(sheet, row, col, "=SUBTOTAL(9,A1:A3)", 0);
                    }
                    5 => {
                        store.set_formula(sheet, row, col, "=\"t\"", 0);
                    }
                    _ => store.set_number(
                        sheet,
                        row,
                        col,
                        (row as f64).mul_add(2.25, -(col as f64) * 7.5),
                        0,
                    ),
                }
            }
        }
        store.set_formula(sheet, 33, 2, "=1/0", 0);
        store.set_number(sheet, 37, 1, f64::INFINITY, 0);
        store.set_formula(sheet, 0, 3, "=SEQUENCE(6,1,2,3)", 0);
        store.set_number(sheet, 2, 4, 1e308, 0);
        store.set_number(sheet, 3, 4, 1e308, 0);
        sheet
    }

    fn dense_formulas() -> Vec<String> {
        let mut formulas = Vec::new();
        for code in [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
            111,
        ] {
            for args in [
                "A1:A30",
                "A1:C30",
                "B1:B40",
                "C1:C40",
                "A1:A20,B5:B25",
                "A3,B4,A1:A2",
                "D1:D8",
                "E1:E5",
                "A1:A0",
                "A1:C30,E1:E5",
            ] {
                formulas.push(format!("=SUBTOTAL({code},{args})"));
            }
        }
        for code in ["\"9\"", "0", "12", "TRUE", "9.7", "A1", "", "1/0", "-1"] {
            formulas.push(format!("=SUBTOTAL({code},A1:A30)"));
        }
        formulas.push("=SUBTOTAL(9,A1:A30,{1,2})".to_owned());
        formulas.push("=SUBTOTAL(9)".to_owned());
        formulas
    }

    /// A and B loaded in the first page, a formula over them in C, and rows
    /// past the first page not loaded.
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
            store.set_formula(
                sheet,
                row,
                2,
                &format!("=SUBTOTAL(9,A{}:B{})", row + 1, row + 3),
                0,
            );
        }
        sheet
    }

    fn paged_formulas() -> Vec<String> {
        [
            "=SUBTOTAL(9,A1:A40)",
            "=SUBTOTAL(109,A1:B40)",
            "=SUBTOTAL(1,A1:A5000)",
            "=SUBTOTAL(9,C1:C5)",
            "=SUBTOTAL(3,A1:C40)",
        ]
        .map(str::to_owned)
        .to_vec()
    }

    /// A formula and its result, as kind, number bits and text.
    type Outcome = (String, u8, u64, Option<String>);

    fn results(views: bool) -> Vec<Outcome> {
        SUBTOTAL_VIEWS_OFF.with(|off| off.set(!views));
        let mut store = CellStore::new();
        let dense = dense_sheet(&mut store);
        let paged = paged_sheet(&mut store);
        assert!(store.set_hidden_rows(dense, &[3, 5, 20, 22], &[8, 12, 30, 31]));
        assert!(store.set_hidden_rows(paged, &[2, 3], &[10, 10]));

        let mut cells = Vec::new();
        for (sheet, sources) in [(dense, dense_formulas()), (paged, paged_formulas())] {
            for (row, source) in sources.into_iter().enumerate() {
                store.set_formula(sheet, row, 8, &source, 0);
                cells.push((sheet, row, source));
            }
            store.recompute(sheet);
        }
        SUBTOTAL_VIEWS_OFF.with(|off| off.set(false));

        cells
            .into_iter()
            .map(|(sheet, row, source)| {
                let cell = store.get_cell(sheet, row, 8);
                (source, cell.kind(), cell.num().to_bits(), cell.string())
            })
            .collect()
    }

    #[test]
    fn subtotal_views_match_the_function_accumulator() {
        let accumulated = results(false);
        let viewed = results(true);
        assert_eq!(accumulated.len(), viewed.len(), "formula counts differ");
        for (accumulated, viewed) in accumulated.iter().zip(&viewed) {
            assert_eq!(accumulated, viewed, "{}", accumulated.0);
        }
    }
}
