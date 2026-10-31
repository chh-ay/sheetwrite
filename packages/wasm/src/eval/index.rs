//! INDEX: one cell of an area, or with a zero position a whole row or column.
//!
//! A zero row or column selects every row or column of the area, as in
//! Excel, so `SUM(INDEX(A1:B5,0,1))` sums column A. A literal zero makes the
//! call an array expression, which spills in a cell and feeds a range-reading
//! function. A zero that arrives at run time, from a cell, can only give one
//! value, so it works when the selection has one cell and is `#VALUE!`
//! otherwise.

use std::ops::Range;

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{EvalResult, FormulaError, Value};

use super::array::static_integer;
use super::lookup::integer_arg;
use super::matrix::{optional_ast, EvalMatrix};
use super::EvalPass;

/// The row argument is the second argument of INDEX.
const ROW_ARG: usize = 1;
/// The column argument is the third argument of INDEX.
const COL_ARG: usize = 2;
/// The area number is the fourth argument of INDEX.
const AREA_ARG: usize = 3;
const MIN_ARGS: usize = 2;
const MAX_ARGS: usize = 4;

/// The column argument. With an area number, an empty column argument counts
/// as omitted, as when only the row is given.
fn col_arg(args: &[Ast]) -> Option<&Ast> {
    if args.len() == MAX_ARGS {
        optional_ast(args, COL_ARG)
    } else {
        args.get(COL_ARG)
    }
}

/// Whether a literal zero selects a whole row or column, which makes the call
/// an array expression.
pub(super) fn index_selects_whole_axis(args: &[Ast]) -> bool {
    static_integer(args.get(ROW_ARG)) == Some(0) || static_integer(col_arg(args)) == Some(0)
}

/// The rows and columns of `matrix` that a 1-based `row` and `col` select;
/// zero selects every row or column. `None` when a position is outside it.
fn selection(matrix: &EvalMatrix, row: usize, col: usize) -> Option<(Range<usize>, Range<usize>)> {
    let axis = |position: usize, len: usize| match position {
        0 => Some(0..len),
        position if position <= len => Some(position - 1..position),
        _ => None,
    };
    Some((axis(row, matrix.rows)?, axis(col, matrix.cols)?))
}

/// A non-negative position argument; zero means the whole axis.
fn position(value: &Value) -> Result<usize, FormulaError> {
    usize::try_from(integer_arg(value)?).map_err(|_| FormulaError::Value)
}

impl CellStore {
    /// The area INDEX reads and the 1-based row and column it selects, where
    /// zero is a whole axis. A one-row or one-column area needs only one
    /// position, and the other axis is its only row or column.
    fn index_target(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<(EvalMatrix, usize, usize), FormulaError> {
        if !(MIN_ARGS..=MAX_ARGS).contains(&args.len()) {
            return Err(FormulaError::Value);
        }
        let area = self.index_area(&args[0], args.get(AREA_ARG), sheet, pass, depth + 1)?;
        let matrix = self.eval_matrix_arg(area, sheet, pass, depth + 1)?;
        let first = position(&self.eval_ast(&args[ROW_ARG], sheet, pass, depth + 1))?;

        let (row, col) = match col_arg(args) {
            None if matrix.rows == 1 => (1, first),
            None if matrix.cols == 1 => (first, 1),
            None => return Err(FormulaError::Value),
            Some(col) => (
                first,
                position(&self.eval_ast(col, sheet, pass, depth + 1))?,
            ),
        };
        Ok((matrix, row, col))
    }

    /// INDEX in a value position: the one selected cell.
    pub(super) fn eval_index(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        let (matrix, row, col) = match self.index_target(args, sheet, pass, depth) {
            Ok(target) => target,
            Err(error) => return Value::Error(error),
        };
        let Some((rows, cols)) = selection(&matrix, row, col) else {
            return Value::Error(FormulaError::Ref);
        };
        if rows.len() != 1 || cols.len() != 1 {
            return Value::Error(FormulaError::Value);
        }

        matrix
            .get(rows.start, cols.start)
            .cloned()
            .unwrap_or(Value::Error(FormulaError::Ref))
    }

    /// INDEX as an array expression: every selected cell.
    pub(super) fn eval_index_array(
        &self,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<EvalMatrix, FormulaError> {
        let (matrix, row, col) = self.index_target(args, sheet, pass, depth)?;
        let (rows, cols) = selection(&matrix, row, col).ok_or(FormulaError::Ref)?;
        let (row_count, col_count) = (rows.len(), cols.len());
        let cells = EvalMatrix::validate_shape(row_count, col_count, 1, 0)?;

        let mut values = Vec::new();
        values
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        for row in rows {
            values.extend_from_slice(&matrix.values[row * matrix.cols..][cols.clone()]);
        }
        Ok(EvalMatrix::new(row_count, col_count, values))
    }
}
