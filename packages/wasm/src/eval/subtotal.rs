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
use super::math::{SubtotalCode, SubtotalFold};
use super::matrix::{argument_range, range_from_ast};
use super::range_view::{CellSink, RangeView};
use super::value::number_from_value;
use super::EvalPass;
use crate::formula_slots::FormulaStore;
use crate::row_visibility::{HiddenRowCursor, SkippedRows};
use crate::sheet::SheetData;

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
fn subtotal_code(value: &Value, missing: bool) -> SubtotalCode {
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

        let mut reader = SubtotalReader {
            store: self,
            skipped,
            fold: SubtotalFold::new(function),
            cells: 1,
        };
        for arg in references {
            let range = subtotal_reference(arg, sheet)?;
            if let Err(error) = reader.range(range, pass, depth + 1) {
                return Some(Value::Error(error));
            }
        }

        Some(match code {
            Ok(_) => reader.fold.finish(),
            Err(error) => Value::Error(error),
        })
    }
}

/// The references of one SUBTOTAL call, folded in order.
struct SubtotalReader<'a> {
    store: &'a CellStore,
    skipped: SkippedCells,
    fold: SubtotalFold,
    /// Cells of the call so far, against the accumulator's limit.
    cells: u64,
}

impl SubtotalReader<'_> {
    /// One reference, with the checks of the accumulator's range read.
    fn range(
        &mut self,
        range: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<(), FormulaError> {
        if depth > FORMULA_RECURSION_LIMIT {
            return Err(FormulaError::Num);
        }

        let view = RangeView::clipped(self.store, range, depth)?;
        let (rows, cols) = view.shape();
        let cells = (rows as u64).saturating_mul(cols as u64);
        if cells > RANGE_CELL_LIMIT || self.cells.saturating_add(cells) > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        self.cells += cells;

        let data = &self.store.sheets[range.sheet as usize];
        let skipped = self.skipped;
        let slots = &self.store.formula_slots;
        let mut hidden = skipped.hidden_rows(data);
        let skips_formula =
            |row: usize, col: usize| skipped.skips_cell(data, row as u32, col as u32, slots);
        view.scan_visible(&mut hidden, skips_formula, pass, &mut self.fold)
    }
}
