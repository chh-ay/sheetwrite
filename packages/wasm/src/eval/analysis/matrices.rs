//! Matrix product, inverse, determinant, and identity matrices. Results use
//! the shape, byte, and spill limits of the built-in arrays.

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{EvalResult, FormulaError, Value};

use super::super::matrix::{
    EvalMatrix, SPILL_MAX_CELLS, SPILL_MAX_RECOMPUTE_CELLS, UNKNOWN_SIZE_PRECHARGE,
};
use super::super::value::number_from_value;
use super::super::EvalPass;
use super::super::Shapes;

family_functions! {
    MDETERM,
    MINVERSE,
    MMULT,
    MUNIT,
}

/// MDETERM returns one number. The other functions return arrays.
pub(crate) fn produces_array(function: Function, _: &[Ast], _: Shapes<'_>) -> bool {
    function != Function::MDETERM
}

struct Context<'a, 'p> {
    store: &'a CellStore,
    sheet: usize,
    pass: &'a mut EvalPass<'p>,
    /// Depth of the function call; its arguments evaluate one level deeper.
    depth: usize,
}

impl Context<'_, '_> {
    fn number(&mut self, ast: &Ast) -> Result<f64, FormulaError> {
        number_from_value(
            &self
                .store
                .eval_ast(ast, self.sheet, self.pass, self.depth + 1),
        )
    }

    /// Reads a matrix whose cells must all be numbers.
    fn numbers(&mut self, ast: &Ast) -> Result<(usize, usize, Vec<f64>), FormulaError> {
        let matrix = self
            .store
            .eval_matrix_arg(ast, self.sheet, self.pass, self.depth + 1)?;
        let mut numbers = Vec::new();
        numbers
            .try_reserve_exact(matrix.values.len())
            .map_err(|_| FormulaError::Num)?;
        for value in &matrix.values {
            numbers.push(match value {
                Value::Number(number) => *number,
                Value::Error(error) => return Err(*error),
                Value::Text(_) | Value::Bool(_) | Value::Blank => return Err(FormulaError::Value),
            });
        }
        Ok((matrix.rows, matrix.cols, numbers))
    }
}

pub(crate) fn evaluate_ast(
    store: &CellStore,
    _: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> EvalResult {
    let mut context = Context {
        store,
        sheet,
        pass,
        depth,
    };
    let [argument] = args else {
        return Value::Error(FormulaError::Value);
    };
    context
        .numbers(argument)
        .and_then(|(rows, cols, numbers)| {
            let dimension = square_dimension(rows, cols)?;
            determinant(dimension, numbers)
        })
        .map_or_else(Value::Error, Value::number)
}

pub(crate) fn shape(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
) -> Result<(usize, usize, usize), FormulaError> {
    let (rows, cols) = match (function, args) {
        (Function::MUNIT, [dimension_ast]) => {
            let dimension = literal_dimension(dimension_ast).ok_or(FormulaError::Value)??;
            (dimension, dimension)
        }
        (Function::MINVERSE, [argument]) => {
            let (rows, cols, _) = store.matrix_shape(argument, sheet, pass)?;
            let dimension = square_dimension(rows, cols)?;
            (dimension, dimension)
        }
        (Function::MMULT, [left, right]) => {
            let (rows, inner, _) = store.matrix_shape(left, sheet, pass)?;
            let (right_rows, cols, _) = store.matrix_shape(right, sheet, pass)?;
            if inner != right_rows {
                return Err(FormulaError::Value);
            }
            check_work(rows, inner, cols)?;
            (rows, cols)
        }
        _ => return Err(FormulaError::Value),
    };
    let cells = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
    Ok((rows, cols, cells))
}

/// An MUNIT size that is known only after evaluation is charged once it is
/// known, like SEQUENCE.
pub(crate) fn bound(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
) -> Result<usize, FormulaError> {
    if let (Function::MUNIT, [dimension]) = (function, args) {
        if literal_dimension(dimension).is_none() {
            return Ok(UNKNOWN_SIZE_PRECHARGE);
        }
    }
    shape(store, function, args, sheet, pass).map(|(_, _, cells)| cells)
}

pub(crate) fn evaluate_matrix(
    store: &CellStore,
    function: Function,
    args: &[Ast],
    sheet: usize,
    pass: &mut EvalPass<'_>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    let mut context = Context {
        store,
        sheet,
        pass,
        depth,
    };
    let (rows, cols, numbers) = match (function, args) {
        (Function::MUNIT, [dimension_ast]) => {
            let dimension = dimension_from_number(context.number(dimension_ast)?)?;
            EvalMatrix::validate_shape(dimension, dimension, 1, 0)?;
            let mut identity = zeros(dimension * dimension)?;
            for index in 0..dimension {
                identity[index * dimension + index] = 1.0;
            }
            (dimension, dimension, identity)
        }
        (Function::MINVERSE, [argument]) => {
            let (rows, cols, numbers) = context.numbers(argument)?;
            let dimension = square_dimension(rows, cols)?;
            (dimension, dimension, inverse(dimension, numbers)?)
        }
        (Function::MMULT, [left_ast, right_ast]) => {
            let (rows, inner, left) = context.numbers(left_ast)?;
            let (right_rows, cols, right) = context.numbers(right_ast)?;
            if inner != right_rows {
                return Err(FormulaError::Value);
            }
            check_work(rows, inner, cols)?;
            EvalMatrix::validate_shape(rows, cols, 1, 0)?;
            let mut product = zeros(rows * cols)?;
            // Start at -0.0, as an iterator sum does, so a product whose terms are all zero
            // keeps the sign a dot product would give.
            product.fill(-0.0);
            // Read each right-hand row once. Each cell still adds its terms in order of the
            // inner index.
            for (left_row, product_row) in
                left.chunks_exact(inner).zip(product.chunks_exact_mut(cols))
            {
                for (&factor, right_row) in left_row.iter().zip(right.chunks_exact(cols)) {
                    for (result, &number) in product_row.iter_mut().zip(right_row) {
                        *result += factor * number;
                    }
                }
            }
            (rows, cols, product)
        }
        _ => return Err(FormulaError::Value),
    };
    let mut values = Vec::new();
    values
        .try_reserve_exact(numbers.len())
        .map_err(|_| FormulaError::Num)?;
    for number in numbers {
        values.push(Value::number(number));
    }
    Ok(EvalMatrix::new(rows, cols, values))
}

fn literal_dimension(ast: &Ast) -> Option<Result<usize, FormulaError>> {
    let number = match ast {
        Ast::Num(number) => *number,
        Ast::Pos(inner, _) => number_literal(inner)?,
        Ast::Neg(inner, _) => -number_literal(inner)?,
        Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Parameter { .. }
        | Ast::Lambda(_)
        | Ast::RegexPattern(_)
        | Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Percent(..)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => return None,
    };
    Some(dimension_from_number(number))
}

/// The value of a number literal, `None` for any other node.
const fn number_literal(ast: &Ast) -> Option<f64> {
    match ast {
        Ast::Num(number) => Some(*number),
        Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Parameter { .. }
        | Ast::Lambda(_)
        | Ast::RegexPattern(_)
        | Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(..)
        | Ast::Pos(..)
        | Ast::Percent(..)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => None,
    }
}

fn dimension_from_number(number: f64) -> Result<usize, FormulaError> {
    let dimension = number.trunc();
    if dimension < 1.0 {
        return Err(FormulaError::Value);
    }
    if dimension > SPILL_MAX_CELLS as f64 {
        return Err(FormulaError::Num);
    }
    Ok(dimension as usize)
}

fn square_dimension(rows: usize, cols: usize) -> Result<usize, FormulaError> {
    if rows != cols {
        return Err(FormulaError::Value);
    }
    check_work(rows, rows, rows)?;
    Ok(rows)
}

/// Products and eliminations take rows * inner * columns steps. They use
/// the recalculation work limit of the built-in arrays.
fn check_work(rows: usize, inner: usize, cols: usize) -> Result<(), FormulaError> {
    rows.checked_mul(inner)
        .and_then(|work| work.checked_mul(cols))
        .filter(|work| *work <= SPILL_MAX_RECOMPUTE_CELLS)
        .map(|_| ())
        .ok_or(FormulaError::Num)
}

fn zeros(length: usize) -> Result<Vec<f64>, FormulaError> {
    let mut numbers = Vec::new();
    numbers
        .try_reserve_exact(length)
        .map_err(|_| FormulaError::Num)?;
    numbers.resize(length, 0.0);
    Ok(numbers)
}

/// The row at or below `col` with the largest absolute value in `col`.
fn pivot_row(matrix: &[f64], dimension: usize, col: usize) -> usize {
    (col..dimension)
        .max_by(|&first, &second| {
            matrix[first * dimension + col]
                .abs()
                .total_cmp(&matrix[second * dimension + col].abs())
        })
        .unwrap_or(col)
}

fn swap_rows(matrix: &mut [f64], dimension: usize, first: usize, second: usize) {
    for col in 0..dimension {
        matrix.swap(first * dimension + col, second * dimension + col);
    }
}

/// Gaussian elimination with partial pivoting.
fn determinant(dimension: usize, mut matrix: Vec<f64>) -> Result<f64, FormulaError> {
    let mut result = 1.0;
    for col in 0..dimension {
        let pivot_index = pivot_row(&matrix, dimension, col);
        let pivot = matrix[pivot_index * dimension + col];
        if pivot == 0.0 {
            return Ok(0.0);
        }
        if pivot_index != col {
            swap_rows(&mut matrix, dimension, pivot_index, col);
            result = -result;
        }
        result *= pivot;
        let (pivot_rows, remaining_rows) = matrix.split_at_mut((col + 1) * dimension);
        let pivot_row = &pivot_rows[col * dimension..];
        for row in remaining_rows.chunks_exact_mut(dimension) {
            let factor = row[col] / pivot;
            for (number, &pivot_number) in row[col..].iter_mut().zip(&pivot_row[col..]) {
                *number -= factor * pivot_number;
            }
        }
    }
    if result.is_finite() {
        Ok(result)
    } else {
        Err(FormulaError::Num)
    }
}

/// Gauss-Jordan elimination with partial pivoting. A singular matrix is #NUM!.
fn inverse(dimension: usize, mut matrix: Vec<f64>) -> Result<Vec<f64>, FormulaError> {
    let mut result = zeros(dimension * dimension)?;
    for index in 0..dimension {
        result[index * dimension + index] = 1.0;
    }
    for col in 0..dimension {
        let pivot_index = pivot_row(&matrix, dimension, col);
        if pivot_index != col {
            swap_rows(&mut matrix, dimension, pivot_index, col);
            swap_rows(&mut result, dimension, pivot_index, col);
        }
        let pivot = matrix[col * dimension + col];
        if pivot == 0.0 {
            return Err(FormulaError::Num);
        }
        let (matrix_before, matrix_pivot_and_after) = matrix.split_at_mut(col * dimension);
        let (matrix_pivot, matrix_after) = matrix_pivot_and_after.split_at_mut(dimension);
        let (result_before, result_pivot_and_after) = result.split_at_mut(col * dimension);
        let (result_pivot, result_after) = result_pivot_and_after.split_at_mut(dimension);
        for (number, inverse_number) in matrix_pivot.iter_mut().zip(result_pivot.iter_mut()) {
            *number /= pivot;
            *inverse_number /= pivot;
        }
        // Disjoint row slices borrow the pivot without copying it for each row.
        for (row, inverse_row) in matrix_before
            .chunks_exact_mut(dimension)
            .chain(matrix_after.chunks_exact_mut(dimension))
            .zip(
                result_before
                    .chunks_exact_mut(dimension)
                    .chain(result_after.chunks_exact_mut(dimension)),
            )
        {
            let factor = row[col];
            for ((number, &pivot_number), (inverse_number, &inverse_pivot_number)) in row
                .iter_mut()
                .zip(matrix_pivot.iter())
                .zip(inverse_row.iter_mut().zip(result_pivot.iter()))
            {
                *number -= factor * pivot_number;
                *inverse_number -= factor * inverse_pivot_number;
            }
        }
    }
    if result.iter().all(|number| number.is_finite()) {
        Ok(result)
    } else {
        Err(FormulaError::Num)
    }
}
