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
        Ast::Func(_, args) => args.iter().any(ast_calls_subtotal),
        #[cfg(feature = "analysis")]
        Ast::Lambda(definition) => ast_calls_subtotal(&definition.body),
        Ast::UnknownFunc(call) => {
            let args = &call.args;
            args.iter().any(ast_calls_subtotal)
        }
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

impl CellStore {
    /// SUBTOTAL, with its references read in place: hidden rows are stepped
    /// over run by run, and only formula cells are checked for a nested
    /// SUBTOTAL. Every argument is read in order, as the function accumulator
    /// reads it, so the same error wins. See `eval_func` for why families
    /// live in out-of-line `*_family` handlers.
    #[inline(never)]
    pub(super) fn eval_subtotal_family(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        let mut reader = SubtotalReader {
            store: self,
            sheet,
            skipped: SkippedCells {
                rows: Some(SkippedRows::Filtered),
                nested_subtotals: true,
            },
            fold: SubtotalFold::new(9),
            folding: false,
            cells: 0,
        };

        let mut code = Err(FormulaError::Value);
        for (index, arg) in args.iter().enumerate() {
            let first = match reader.argument(index, arg, pass, depth) {
                Ok(first) => first,
                Err(error) => return Value::Error(error),
            };
            if index >= MAX_FUNCTION_ARGS {
                return Value::Error(FormulaError::Value);
            }
            if index == 0 {
                code = subtotal_code(&first, matches!(arg, Ast::Missing));
                let (function, rows) = code.unwrap_or((9, SkippedRows::Filtered));
                reader.fold = SubtotalFold::new(function);
                reader.skipped.rows = Some(rows);
                reader.folding = true;
            }
        }

        if args.len() < 2 {
            return Value::Error(FormulaError::Value);
        }
        match code {
            Ok(_) => reader.fold.finish(),
            Err(error) => Value::Error(error),
        }
    }
}

/// The arguments of one SUBTOTAL call, read in order.
struct SubtotalReader<'a> {
    store: &'a CellStore,
    sheet: usize,
    /// What the references after the code leave out.
    skipped: SkippedCells,
    fold: SubtotalFold,
    /// Whether values go into `fold`: every argument after the code.
    folding: bool,
    /// Cells of the call so far, against the accumulator's limit.
    cells: u64,
}

/// A sink that keeps nothing, for the code argument's cells.
struct Discard;

impl CellSink for Discard {
    fn number(&mut self, _number: f64) {}

    fn other(&mut self) {}
}

impl SubtotalReader<'_> {
    /// Argument `index`, read as the function accumulator reads it. Returns
    /// its first value.
    fn argument(
        &mut self,
        index: usize,
        arg: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        // A cell after the code is a one-cell reference, so its row can be
        // hidden.
        let reference = if index > 0 && matches!(arg, Ast::Cell(..) | Ast::AbsCell(..)) {
            range_from_ast(arg, self.sheet)
        } else {
            argument_range(arg, self.sheet)
        };
        if let Some(range) = reference {
            return self.range(range, index > 0, pass, depth + 1);
        }
        if matches!(arg, Ast::Func(Func::Union, _) | Ast::SheetSpan(_)) {
            return self.areas(arg, pass, depth + 1);
        }
        self.value(arg, pass, depth)
    }

    /// One range, with the checks of the accumulator's range read. With
    /// `skips`, the rows and nested subtotals that SUBTOTAL leaves out are
    /// left unread. Returns the first value of the range.
    fn range(
        &mut self,
        range: CellRange,
        skips: bool,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
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
        let mut hidden = if skips {
            skipped.hidden_rows(data)
        } else {
            HiddenRowCursor::default()
        };
        let skips_formula = |row: usize, col: usize| {
            skips && skipped.skips_cell(data, row as u32, col as u32, slots)
        };
        if self.folding {
            view.scan_visible(&mut hidden, skips_formula, pass, &mut self.fold)?;
            return Ok(Value::Blank);
        }
        view.scan_visible(&mut hidden, skips_formula, pass, &mut Discard)?;
        Ok(view.cell(0, 0, pass))
    }

    /// A union or 3-D reference, area by area, none of it skipped. Returns
    /// the first value of the first area.
    fn areas(
        &mut self,
        reference: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let mut first = None;
        for area in self
            .store
            .area_ranges(Func::Subtotal, reference, self.sheet, depth)
        {
            let (range, range_depth) = area?;
            let value = self.range(range, false, pass, range_depth)?;
            first.get_or_insert(value);
        }
        if let Some(value) = first {
            return Ok(value);
        }

        // Every sheet of the span is smaller than the range: one blank keeps
        // the argument.
        self.count(1)?;
        Ok(Value::Blank)
    }

    /// An array or one value.
    fn value(
        &mut self,
        arg: &Ast,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        if ast_produces_array(arg, pass.shapes()) {
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
                    self.count(1)?;
                    if self.folding {
                        self.fold.push(value, true);
                    }
                }
                return Ok(matrix.values.first().map_or(Value::Blank, Clone::clone));
            }
        }

        let value = self.store.eval_ast(arg, self.sheet, pass, depth + 1);
        if let Value::Error(error) = value {
            return Err(error);
        }
        self.count(1)?;
        if self.folding {
            self.fold.push(&value, false);
        }
        Ok(value)
    }

    /// `cells` more cells, against the accumulator's limit.
    const fn count(&mut self, cells: u64) -> Result<(), FormulaError> {
        if self.cells.saturating_add(cells) > RANGE_CELL_LIMIT {
            return Err(FormulaError::Num);
        }
        self.cells += cells;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{subtotal_code, SubtotalFold};
    use crate::types::{FormulaError, Value};

    /// SUBTOTAL with `code` over one reference holding `range`.
    fn subtotal(code: f64, range: &[Value]) -> Value {
        match subtotal_code(&Value::number(code), false) {
            Ok((function, _)) => {
                let mut fold = SubtotalFold::new(function);
                for value in range {
                    fold.push(value, true);
                }
                fold.finish()
            }
            Err(error) => Value::Error(error),
        }
    }

    fn assert_number(value: Value, expected: f64) {
        let Value::Number(actual) = value else {
            panic!("expected {expected}, got {value:?}");
        };
        assert!((actual - expected).abs() <= 1e-12 * expected.abs().max(1.0));
    }

    #[test]
    fn subtotal_uses_function_specific_error_and_coercion_rules() {
        let range = vec![
            Value::number(2.0),
            Value::number(4.0),
            Value::Error(FormulaError::DivZero),
            Value::text("6"),
            Value::Bool(true),
            Value::Blank,
        ];
        assert_number(subtotal(2.0, &range), 2.0);
        assert_number(subtotal(3.0, &range), 5.0);
        assert_eq!(subtotal(9.0, &range), Value::Error(FormulaError::DivZero));

        let variance = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0].map(Value::number);
        assert_number(subtotal(11.0, &variance), 4.0);
        assert_number(
            subtotal(1.0, &[Value::number(1e308), Value::number(1e308)]),
            1e308,
        );

        assert_eq!(
            subtotal(12.0, &[Value::number(1.0)]),
            Value::Error(FormulaError::Value)
        );
        assert_number(
            subtotal(109.0, &[Value::number(1.0), Value::number(2.0)]),
            3.0,
        );
        assert_eq!(
            subtotal(112.0, &[Value::number(1.0)]),
            Value::Error(FormulaError::Value)
        );
    }
}
