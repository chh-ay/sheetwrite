//! Matrix product, inverse, determinant, and identity matrices. Results use
//! the shape, byte, and spill limits of the built-in arrays.

use std::collections::{HashMap, HashSet};

use crate::calc::Ast;
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};

use super::super::matrix::{EvalMatrix, SPILL_MAX_CELLS, SPILL_MAX_RECOMPUTE_CELLS};
use super::super::value::number_from_value;

pub(crate) const NAMES: &[&str] = &["MDETERM", "MINVERSE", "MMULT", "MUNIT"];

/// MDETERM returns one number. The other functions return arrays.
pub(crate) fn produces_array(name: &str, _: &[Ast]) -> bool {
    name != "MDETERM"
}

struct Context<'a> {
    store: &'a CellStore,
    sheet: usize,
    affected: &'a HashSet<AbsCellKey>,
    memo: &'a mut HashMap<AbsCellKey, EvalResult>,
    visiting: &'a mut HashSet<AbsCellKey>,
    depth: usize,
}

impl Context<'_> {
    fn number(&mut self, ast: &Ast) -> Result<f64, FormulaError> {
        number_from_value(&self.store.eval_ast(
            ast,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth,
        ))
    }

    /// Reads a matrix whose cells must all be numbers.
    fn numbers(&mut self, ast: &Ast) -> Result<(usize, usize, Vec<f64>), FormulaError> {
        let matrix = self.store.eval_matrix_arg(
            ast,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth,
        )?;
        let mut numbers = Vec::new();
        numbers
            .try_reserve_exact(matrix.values.len())
            .map_err(|_| FormulaError::Num)?;
        for value in &matrix.values {
            numbers.push(match value {
                Value::Number(number) => *number,
                Value::Error(error) => return Err(*error),
                _ => return Err(FormulaError::Value),
            });
        }
        Ok((matrix.rows, matrix.cols, numbers))
    }
}

pub(crate) fn evaluate_ast(
    store: &CellStore,
    _name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> EvalResult {
    let mut context = Context {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth: depth + 1,
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
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    let (rows, cols) = match (name, args) {
        ("MUNIT", [dimension]) => {
            let dimension = literal_dimension(dimension).ok_or(FormulaError::Value)??;
            (dimension, dimension)
        }
        ("MINVERSE", [argument]) => {
            let (rows, cols, _) = store.matrix_shape(argument, sheet)?;
            let dimension = square_dimension(rows, cols)?;
            (dimension, dimension)
        }
        ("MMULT", [left, right]) => {
            let (rows, inner, _) = store.matrix_shape(left, sheet)?;
            let (right_rows, cols, _) = store.matrix_shape(right, sheet)?;
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

/// An MUNIT size that is known only after evaluation can use the largest
/// spill, like SEQUENCE.
pub(crate) fn bound(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<usize, FormulaError> {
    if let ("MUNIT", [dimension]) = (name, args) {
        if literal_dimension(dimension).is_none() {
            return Ok(SPILL_MAX_CELLS);
        }
    }
    shape(store, name, args, sheet).map(|(_, _, cells)| cells)
}

pub(crate) fn evaluate_matrix(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    let mut context = Context {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth: depth + 1,
    };
    let (rows, cols, numbers) = match (name, args) {
        ("MUNIT", [dimension]) => {
            let dimension = dimension_from_number(context.number(dimension)?)?;
            EvalMatrix::validate_shape(dimension, dimension, 1, 0)?;
            let mut identity = zeros(dimension * dimension)?;
            for index in 0..dimension {
                identity[index * dimension + index] = 1.0;
            }
            (dimension, dimension, identity)
        }
        ("MINVERSE", [argument]) => {
            let (rows, cols, numbers) = context.numbers(argument)?;
            let dimension = square_dimension(rows, cols)?;
            (dimension, dimension, inverse(dimension, numbers)?)
        }
        ("MMULT", [left, right]) => {
            let (rows, inner, left) = context.numbers(left)?;
            let (right_rows, cols, right) = context.numbers(right)?;
            if inner != right_rows {
                return Err(FormulaError::Value);
            }
            check_work(rows, inner, cols)?;
            EvalMatrix::validate_shape(rows, cols, 1, 0)?;
            let mut product = zeros(rows * cols)?;
            // Iterator sums start at -0.0. Keep that sign for zero products.
            product.fill(-0.0);
            // Read each right-hand row once. Keep the original sum order.
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
        Ast::Pos(inner) => match inner.as_ref() {
            Ast::Num(number) => *number,
            _ => return None,
        },
        Ast::Neg(inner) => match inner.as_ref() {
            Ast::Num(number) => -number,
            _ => return None,
        },
        _ => return None,
    };
    Some(dimension_from_number(number))
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

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    const TOLERANCE: f64 = 1e-9;

    fn store_with(blocks: &[(usize, usize, &[&[f64]])]) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(20, 30);
        for (top, left, rows) in blocks {
            for (row, numbers) in rows.iter().enumerate() {
                for (col, number) in numbers.iter().enumerate() {
                    store.set_number(sheet, top + row, left + col, *number, 0);
                }
            }
        }
        (store, sheet)
    }

    fn assert_block(store: &CellStore, sheet: usize, top: usize, left: usize, expected: &[&[f64]]) {
        for (row, numbers) in expected.iter().enumerate() {
            for (col, number) in numbers.iter().enumerate() {
                let cell = store.get_cell(sheet, top + row, left + col);
                assert_eq!(cell.string(), None, "({row}, {col})");
                assert!(
                    (cell.num() - number).abs() < TOLERANCE,
                    "({row}, {col}): {}",
                    cell.num()
                );
            }
        }
    }

    fn text(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
        store.get_cell(sheet, row, col).string()
    }

    #[test]
    fn microsoft_determinant_examples() {
        // https://support.microsoft.com/en-us/excel/functions/mdeterm-function
        let (mut store, sheet) = store_with(&[
            (
                0,
                0,
                &[
                    &[1.0, 3.0, 8.0, 5.0],
                    &[1.0, 3.0, 6.0, 1.0],
                    &[1.0, 1.0, 1.0, 0.0],
                    &[7.0, 3.0, 10.0, 2.0],
                ],
            ),
            (
                5,
                0,
                &[&[3.0, 6.0, 1.0], &[1.0, 1.0, 0.0], &[3.0, 10.0, 2.0]],
            ),
            (9, 0, &[&[3.0, 6.0], &[1.0, 1.0]]),
            (12, 0, &[&[1.0, 2.0], &[2.0, 4.0]]),
        ]);
        store.set_string(sheet, 15, 1, "text", 0);
        store.set_number(sheet, 15, 0, 1.0, 0);
        store.set_number(sheet, 16, 0, 1.0, 0);
        store.set_number(sheet, 16, 1, 1.0, 0);
        for (row, formula) in [
            "=MDETERM(A1:D4)",
            "=MDETERM(A6:C8)",
            "=MDETERM(A10:B11)",
            "=MDETERM(A1:D2)",
            "=MDETERM(A13:B14)",
            "=MDETERM(A16:B17)",
            "=MDETERM(MUNIT(3))",
        ]
        .iter()
        .enumerate()
        {
            store.set_formula(sheet, row, 10, formula, 0);
        }
        store.recompute(sheet);
        assert_block(&store, sheet, 0, 10, &[&[88.0], &[1.0], &[-3.0]]);
        assert_eq!(text(&store, sheet, 3, 10).as_deref(), Some("#VALUE!"));
        assert_block(&store, sheet, 4, 10, &[&[0.0]]);
        assert_eq!(text(&store, sheet, 5, 10).as_deref(), Some("#VALUE!"));
        assert_block(&store, sheet, 6, 10, &[&[1.0]]);
    }

    #[test]
    fn microsoft_inverse_examples_and_singular_matrices() {
        // https://support.microsoft.com/en-us/excel/functions/minverse-function
        let (mut store, sheet) = store_with(&[
            (0, 0, &[&[4.0, -1.0], &[2.0, 0.0]]),
            (
                3,
                0,
                &[&[1.0, 2.0, 1.0], &[3.0, 4.0, -1.0], &[0.0, 2.0, 0.0]],
            ),
            (7, 0, &[&[1.0, 2.0], &[2.0, 4.0]]),
        ]);
        store.set_formula(sheet, 0, 10, "=MINVERSE(A1:B2)", 0);
        store.set_formula(sheet, 3, 10, "=MINVERSE(A4:C6)", 0);
        store.set_formula(sheet, 7, 10, "=MINVERSE(A8:B9)", 0);
        store.set_formula(sheet, 9, 10, "=MINVERSE(A1:C2)", 0);
        store.recompute(sheet);
        assert_block(&store, sheet, 0, 10, &[&[0.0, 0.5], &[-1.0, 2.0]]);
        assert_block(
            &store,
            sheet,
            3,
            10,
            &[
                &[0.25, 0.25, -0.75],
                &[0.0, 0.0, 0.5],
                &[0.75, -0.25, -0.25],
            ],
        );
        assert_eq!(text(&store, sheet, 7, 10).as_deref(), Some("#NUM!"));
        assert_eq!(text(&store, sheet, 9, 10).as_deref(), Some("#VALUE!"));
    }

    #[test]
    fn microsoft_product_and_identity_examples() {
        // https://support.microsoft.com/en-us/excel/functions/mmult-function
        // https://support.microsoft.com/en-us/excel/functions/munit-function
        let (mut store, sheet) = store_with(&[
            (0, 0, &[&[1.0, 3.0], &[7.0, 2.0]]),
            (0, 2, &[&[2.0, 0.0], &[0.0, 2.0]]),
            (3, 0, &[&[1.0, 2.0, 3.0]]),
        ]);
        store.set_number(sheet, 5, 0, 3.0, 0);
        store.set_formula(sheet, 0, 10, "=MMULT(A1:B2,C1:D2)", 0);
        store.set_formula(sheet, 3, 10, "=MUNIT(3)", 0);
        store.set_formula(sheet, 7, 10, "=MMULT(A4:C4,MUNIT(3))", 0);
        store.set_formula(sheet, 9, 10, "=MUNIT(A6)", 0);
        store.set_formula(sheet, 13, 10, "=MMULT(A1:B2,A4:C4)", 0);
        store.set_formula(sheet, 14, 10, "=MMULT(A1:B2,E1:F2)", 0);
        store.set_formula(sheet, 15, 10, "=MUNIT(0)", 0);
        store.set_formula(sheet, 16, 10, "=MUNIT(2000)", 0);
        store.recompute(sheet);
        assert_block(&store, sheet, 0, 10, &[&[2.0, 6.0], &[14.0, 4.0]]);
        let identity: &[&[f64]] = &[&[1.0, 0.0, 0.0], &[0.0, 1.0, 0.0], &[0.0, 0.0, 1.0]];
        assert_block(&store, sheet, 3, 10, identity);
        assert_block(&store, sheet, 7, 10, &[&[1.0, 2.0, 3.0]]);
        assert_block(&store, sheet, 9, 10, identity);
        assert_eq!(text(&store, sheet, 13, 10).as_deref(), Some("#VALUE!"));
        assert_eq!(text(&store, sheet, 14, 10).as_deref(), Some("#VALUE!"));
        assert_eq!(text(&store, sheet, 15, 10).as_deref(), Some("#VALUE!"));
        assert_eq!(text(&store, sheet, 16, 10).as_deref(), Some("#NUM!"));
    }
}
