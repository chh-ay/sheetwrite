//! Typed range folds: reductions read a range's kind and payload arrays in
//! place instead of building a value per cell.

use super::functions::{treats_cell_as_reference, ReductionFold, MAX_FUNCTION_ARGS};
use super::range_reader::RangeReader;
use super::value::aggregate_number;
use super::{ast_produces_array, literal_cell_value, EvalPass};

use crate::calc::{Ast, Func};
use crate::cells::payload_num;
use crate::store::CellStore;
use crate::types::{
    CellRange, EvalResult, FormulaError, Value, FORMULA_RECURSION_LIMIT, KIND_BOOL, KIND_EMPTY,
    KIND_NUMBER, KIND_STRING,
};

impl CellStore {
    /// `SUM` arguments that the streamed reduction does not take: one range,
    /// whose sum a pass shares between formulas, and ranges mixed with scalar
    /// arguments. `None` keeps the other paths.
    ///
    /// The mixed path folds the arguments in order into one running sum, so
    /// the additions happen in the same order as the accumulator's. Errors
    /// follow the accumulator too: an error in a range, in a scalar or from
    /// the cell limit returns at once; text that is not a number fails only
    /// after every argument is read.
    #[inline(never)]
    pub(super) fn eval_sum_family(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if let [arg] = args {
            let range = super::matrix::range_from_ast(arg, sheet)?;

            // A direct range argument stops at the recursion limit before it
            // reads a cell; other one-range forms check depth per cell.
            let direct = matches!(
                arg,
                Ast::Range(..) | Ast::AbsRange(..) | Ast::NamedRange(_) | Ast::Structured(_)
            );
            if direct && depth > FORMULA_RECURSION_LIMIT {
                return Some(Value::Error(FormulaError::Num));
            }
            return Some(self.eval_shared_range_sum(range, pass, depth));
        }

        self.eval_mixed_sum(args, sheet, pass, depth)
    }

    /// The mixed-argument half of [`Self::eval_sum_family`], kept out of line
    /// so the shared one-range read stays small.
    #[inline(never)]
    fn eval_mixed_sum(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Option<EvalResult> {
        if args.is_empty()
            || args.len() > MAX_FUNCTION_ARGS
            || args
                .iter()
                .all(|arg| super::matrix::range_from_ast(arg, sheet).is_some())
            || !args
                .iter()
                .all(|arg| sum_scalar_or_range(arg, sheet).is_some())
        {
            return None;
        }

        let mut fold = ReductionFold::new(Func::Sum)?;
        let mut deferred = None;
        for arg in args {
            let result = match sum_scalar_or_range(arg, sheet)? {
                SumArg::Range(range) => self
                    .fold_range(range, &mut fold, true, pass, depth)
                    .map(|_| ()),
                SumArg::Scalar { reference } => {
                    let value = self.eval_ast(arg, sheet, pass, depth);
                    if let Value::Error(error) = value {
                        return Some(Value::Error(error));
                    }
                    match aggregate_number(&value, reference) {
                        Ok(Some(number)) => fold.push_number(number),
                        Ok(None) => fold.push_blank(),
                        Err(error) => {
                            deferred.get_or_insert(error);
                            fold.push_blank()
                        }
                    }
                }
            };
            if let Err(error) = result {
                return Some(Value::Error(error));
            }
        }

        Some(match deferred {
            Some(error) => Value::Error(error),
            None => fold.finish(),
        })
    }

    /// One range's `SUM`. Formulas over the same literal-only range in a pass
    /// read one scan; a range with one reader keeps no shared sum.
    #[inline]
    fn eval_shared_range_sum(
        &self,
        range: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        if let Some(sum) = pass.results.last_range_sum(range) {
            return sum_value(sum);
        }

        self.scan_range_sum(range, pass, depth)
    }

    /// Scans one range for [`Self::eval_shared_range_sum`] and shares the sum
    /// when the range holds only literals and more than one formula reads it.
    #[inline(never)]
    fn scan_range_sum(
        &self,
        range: CellRange,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        let group = self
            .graph
            .index()
            .and_then(|index| index.shared_range_group(range));
        if let Some(sum) = group.and_then(|(group, _)| pass.results.range_sum(range, group)) {
            return sum_value(sum);
        }

        let Some(mut fold) = ReductionFold::new(Func::Sum) else {
            return Value::Error(FormulaError::Value);
        };
        let sum = self
            .fold_range(range, &mut fold, false, pass, depth)
            .and_then(|literal_only| match fold.finish() {
                Value::Number(sum) => Ok((sum, literal_only)),
                Value::Error(error) => Err(error),
                _ => Err(FormulaError::Value),
            });
        let (sum, literal_only) = match sum {
            Ok((sum, literal_only)) => (Ok(sum), literal_only),
            Err(error) => (Err(error), false),
        };
        if let (Some((group, groups)), true) = (group, literal_only) {
            pass.results.share_range_sum(range, group, groups, sum);
        }
        sum_value(sum)
    }

    /// Folds `range` into `fold` in row-major order, with the checks and
    /// errors of [`RangeReader`]. With `reserve`, the whole range must fit
    /// under the cell limit before any cell is read, as for the accumulator.
    ///
    /// Dense sources are read from their kind and payload arrays: a literal or
    /// empty cell needs no value, and only other cells are evaluated. Returns
    /// whether every cell was a literal or empty source.
    pub(super) fn fold_range(
        &self,
        range: CellRange,
        fold: &mut ReductionFold,
        reserve: bool,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<bool, FormulaError> {
        let mut reader = RangeReader::new(self, range, depth)?;
        let (rows, cols) = reader.shape();
        if reserve {
            fold.reserve((rows as u64).saturating_mul(cols as u64))?;
        }

        let data = &self.sheets[range.sheet as usize];
        let dense = data.cells.dense_sources();
        let (Some(sources), true) = (dense, depth < FORMULA_RECURSION_LIMIT) else {
            while let Some(value) = reader.next(pass)? {
                fold.push(&value)?;
            }
            return Ok(false);
        };

        let (kinds, payloads) = sources.raw();
        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;

        // A single column is one contiguous run of storage: fold it as a
        // slice when it holds only numbers and empty cells.
        if cols == 1 {
            let start = data.cells.idx(row_start, col_start);
            let column = kinds
                .get(start..start + rows)
                .zip(payloads.get(start..start + rows));
            if let Some(result) =
                column.and_then(|(kinds, payloads)| fold.push_number_column(kinds, payloads))
            {
                return result.map(|()| true);
            }
        }

        let mut literal_only = true;
        for row in row_start..row_start + rows {
            for col in col_start..col_start + cols {
                let index = data.cells.idx(row, col);
                match kinds[index] {
                    KIND_EMPTY => fold.push_blank()?,
                    KIND_NUMBER => {
                        let number = payload_num(payloads[index]);
                        if !number.is_finite() {
                            return Err(FormulaError::Num);
                        }
                        fold.push_number(number)?;
                    }
                    kind @ (KIND_STRING | KIND_BOOL) => {
                        let value = literal_cell_value(&self.strings, kind, payloads[index]);
                        if let Value::Error(error) = value {
                            return Err(error);
                        }
                        fold.push(&value)?;
                    }
                    _ => {
                        literal_only = false;
                        let value = reader.dense_value_at(row, col, pass);
                        if let Value::Error(error) = value {
                            return Err(error);
                        }
                        fold.push(&value)?;
                    }
                }
            }
        }
        Ok(literal_only)
    }
}

/// How the accumulator reads one `SUM` argument.
enum SumArg {
    Range(CellRange),
    /// A value; `reference` marks a one-cell reference, whose text and
    /// logical values are skipped as a range's are.
    Scalar {
        reference: bool,
    },
}

/// The accumulator's reading of `arg`, or `None` for arguments the mixed
/// path leaves to it: arrays, unions, sheet spans, intersections and
/// missing arguments.
fn sum_scalar_or_range(arg: &Ast, sheet: usize) -> Option<SumArg> {
    match arg {
        Ast::Range(..) | Ast::AbsRange(..) | Ast::NamedRange(_) | Ast::Structured(_) => {
            super::matrix::range_from_ast(arg, sheet).map(SumArg::Range)
        }
        Ast::Cell(..) | Ast::AbsCell(..) => Some(SumArg::Scalar {
            reference: treats_cell_as_reference(Func::Sum),
        }),
        Ast::Missing | Ast::Func(Func::Union | Func::Intersect, _) | Ast::SheetSpan(_) => None,
        _ if ast_produces_array(arg) => None,
        _ => Some(SumArg::Scalar { reference: false }),
    }
}

fn sum_value(sum: Result<f64, FormulaError>) -> EvalResult {
    match sum {
        Ok(sum) => Value::Number(sum),
        Err(error) => Value::Error(error),
    }
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    /// A: 0.1, "7", TRUE, blank, 0.2, =A1*3, =1/0 in rows 1-7. B1:B3 hold
    /// 1e16, 1, 1. Each case lists the expected display text.
    fn store() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 10);
        store.set_number(sheet, 0, 0, 0.1, 0);
        store.set_string(sheet, 1, 0, "7", 0);
        store.set_bool(sheet, 2, 0, true, 0);
        store.set_number(sheet, 4, 0, 0.2, 0);
        store.set_formula(sheet, 5, 0, "=A1*3", 0);
        store.set_formula(sheet, 6, 0, "=1/0", 0);
        store.set_number(sheet, 0, 1, 1e16, 0);
        store.set_number(sheet, 1, 1, 1.0, 0);
        store.set_number(sheet, 2, 1, 1.0, 0);
        (store, sheet)
    }

    fn sum(source: &str) -> (f64, Option<String>) {
        let (mut store, sheet) = store();
        store.set_formula(sheet, 0, 3, source, 0);
        store.recompute(sheet);
        let cell = store.get_cell(sheet, 0, 3);
        (cell.num(), cell.string())
    }

    #[test]
    fn mixed_sum_arguments_follow_the_accumulator_rules() {
        // Range text and logical values are skipped; direct ones count.
        assert_eq!(sum("=SUM(A1:A5,\"7\",TRUE)").0, 0.1 + 0.2 + 7.0 + 1.0);
        // A one-cell reference reads like a range.
        assert_eq!(sum("=SUM(A1:A1,A2,A3)").0, 0.1);
        // The running sum keeps argument order: 1e16 + 1 + 1 drops both ones
        // only when they are added one at a time.
        let expected = ((1e16_f64 + 1.0) + 1.0) + 0.1;
        assert_eq!(sum("=SUM(B1:B3,A1)").0, expected);
        assert_eq!(sum("=SUM(B1:B3,0.1)").0, expected);
        // Formula cells are evaluated inside the fold.
        assert_eq!(sum("=SUM(A5:A6,1)").0, 0.2 + 0.1 * 3.0 + 1.0);
    }

    #[test]
    fn mixed_sum_errors_keep_their_order() {
        // A range error returns at once, before a later scalar error.
        assert_eq!(sum("=SUM(A1:A7,\"x\")").1.as_deref(), Some("#DIV/0!"));
        // Non-numeric direct text fails only after every argument is read,
        // so a later range error wins.
        assert_eq!(sum("=SUM(\"x\",A7:A7,1)").1.as_deref(), Some("#DIV/0!"));
        assert_eq!(sum("=SUM(\"x\",A1:A2,1)").1.as_deref(), Some("#VALUE!"));
        // A scalar error returns at once.
        assert_eq!(sum("=SUM(1/0,A1:A2)").1.as_deref(), Some("#DIV/0!"));
        assert_eq!(sum("=SUM(A1:A2,1E308,1E308)").1.as_deref(), Some("#NUM!"));
    }

    #[test]
    fn ranges_over_the_same_literals_share_one_sum_per_pass() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 100);
        for row in 0..100 {
            store.set_number(sheet, row, 0, 0.1, 0);
            store.set_formula(sheet, row, 1, "=SUM($A$1:$A$100)", 0);
        }
        store.set_formula(sheet, 0, 2, "=SUM($A$1:$A$99,A100)", 0);
        store.recompute(sheet);
        let expected = (0..100).fold(0.0, |sum, _| sum + 0.1);
        for row in 0..100 {
            assert_eq!(store.get_cell(sheet, row, 1).num(), expected);
        }
        assert_eq!(store.get_cell(sheet, 0, 2).num(), expected);

        // An edit inside the range changes every reader in the next pass.
        store.set_number(sheet, 50, 0, 1.0, 0);
        store.recompute(sheet);
        let expected = (0..100).fold(0.0, |sum, row| sum + if row == 50 { 1.0 } else { 0.1 });
        assert_eq!(store.get_cell(sheet, 99, 1).num(), expected);
    }

    /// A column of numbers and empty cells folds as one slice and gives the
    /// same results, limit and errors as reading it cell by cell.
    #[test]
    fn number_columns_fold_every_reduction() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 200);
        let mut expected_sum = 0.0;
        for row in 0..200 {
            if row % 3 != 0 {
                let value = row as f64 * 0.1 - 7.0;
                store.set_number(sheet, row, 0, value, 0);
                expected_sum += value;
            }
        }
        store.set_number(sheet, 5, 1, f64::INFINITY, 0);
        let sources = [
            "=SUM(A1:A200)",
            "=AVERAGE(A1:A200)",
            "=MIN(A1:A200)",
            "=MAX(A1:A200)",
            "=COUNT(A1:A200)",
            "=COUNTA(A1:A200)",
            "=SUM(B1:B10)",
        ];
        for (row, source) in sources.iter().enumerate() {
            store.set_formula(sheet, row, 3, source, 0);
        }
        store.recompute(sheet);

        let number = |row| store.get_cell(sheet, row, 3).num();
        assert_eq!(number(0), expected_sum);
        assert_eq!(number(1), expected_sum / 133.0);
        assert_eq!(number(2), 0.1 - 7.0);
        assert_eq!(number(3), 199.0 * 0.1 - 7.0);
        assert_eq!(number(4), 133.0);
        assert_eq!(number(5), 133.0);
        assert_eq!(
            store.get_cell(sheet, 6, 3).string().as_deref(),
            Some("#NUM!")
        );
    }

    /// A column with a cell of another kind is read cell by cell, and a
    /// non-finite number fails every reduction, wherever it sits in the
    /// column, as it does cell by cell.
    #[test]
    fn number_columns_with_other_kinds_or_infinity_match_the_cell_path() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(5, 50);
        for row in 0..50 {
            store.set_number(sheet, row, 0, row as f64, 0);
            store.set_number(sheet, row, 1, row as f64, 0);
        }
        store.set_string(sheet, 10, 0, "text", 0);
        store.set_number(sheet, 40, 1, f64::NEG_INFINITY, 0);
        let sources = [
            "=SUM(A1:A50)",
            "=COUNT(A1:A50)",
            "=COUNTA(A1:A50)",
            "=MIN(A1:A50)",
            "=SUM(B1:B50)",
            "=AVERAGE(B1:B50)",
            "=MAX(B1:B50)",
            "=COUNT(B1:B50)",
        ];
        for (row, source) in sources.iter().enumerate() {
            store.set_formula(sheet, row, 3, source, 0);
        }
        store.recompute(sheet);

        let number = |row| store.get_cell(sheet, row, 3).num();
        assert_eq!(number(0), (0..50).sum::<i32>() as f64 - 10.0);
        assert_eq!(number(1), 49.0);
        assert_eq!(number(2), 50.0);
        assert_eq!(number(3), 0.0);
        for row in 4..8 {
            let error = store.get_cell(sheet, row, 3).string();
            assert_eq!(error.as_deref(), Some("#NUM!"), "{}", sources[row]);
        }
    }
}
