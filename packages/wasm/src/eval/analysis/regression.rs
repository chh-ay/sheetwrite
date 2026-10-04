//! Least-squares arrays, FREQUENCY, MODE.MULT, PROB and legacy statistical names.

use super::super::array::ast_produces_array;
use super::super::functions::{number_arg, numeric_entries, require_arity, FuncAccumulator};
use super::super::matrix::{optional_ast, EvalMatrix, SPILL_MAX_RECOMPUTE_CELLS};
use super::super::statistics;
use super::super::value::{aggregate_number, bool_from_value};
use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{AbsCellKey, EvalResult, FormulaError, Value};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

pub(crate) const NAMES: &[&str] = &[
    "FREQUENCY",
    "GROWTH",
    "LINEST",
    "LOGEST",
    "MODE.MULT",
    "PERCENTILE",
    "PERCENTRANK",
    "PROB",
    "QUARTILE",
    "RANK",
    "TREND",
];
const STATS_ROWS: usize = 5;
const PROBABILITY_TOLERANCE: f64 = 1e-12;
const QR_DEPENDENCE_FACTOR: f64 = 64.0;
const QR_WORK_PER_CELL: usize = 4;
const LINEST_MAX_ARGS: usize = 4;
const FREQUENCY_ARGS: usize = 2;
const MODE_MAX_ARGS: usize = 255;

/// The legacy names use the same rules as their current names.
pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    let current = match name {
        "PERCENTILE" => Func::PercentileInc,
        "QUARTILE" => Func::QuartileInc,
        "RANK" => Func::RankEq,
        "PERCENTRANK" => return super::descriptive::evaluate("PERCENTRANK.INC", values),
        "PROB" => return probability(values).map_or_else(Value::Error, Value::number),
        _ => return Value::Error(FormulaError::Name),
    };
    statistics::apply(current, values).unwrap_or(Value::Error(FormulaError::Name))
}

fn probability(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 4)?;
    let outcomes = numeric_entries(values.arg(0).unwrap_or_default())?;
    let probabilities = numeric_entries(values.arg(1).unwrap_or_default())?;
    if outcomes.len() != probabilities.len() {
        return Err(FormulaError::Na);
    }
    if probabilities.is_empty()
        || probabilities
            .iter()
            .any(|&probability| probability <= 0.0 || probability > 1.0)
        || (probabilities.iter().sum::<f64>() - 1.0).abs() > PROBABILITY_TOLERANCE
    {
        return Err(FormulaError::Num);
    }
    let lower = number_arg(values, 2, Some(0.0))?;
    let upper = number_arg(values, 3, Some(lower))?;
    Ok(outcomes
        .iter()
        .zip(&probabilities)
        .filter(|(outcome, _)| **outcome >= lower && **outcome <= upper)
        .map(|(_, probability)| probability)
        .sum())
}

pub(crate) fn produces_array(name: &str, _: &[Ast]) -> bool {
    matches!(
        name,
        "FREQUENCY" | "GROWTH" | "LINEST" | "LOGEST" | "MODE.MULT" | "TREND"
    )
}

fn argument_shape(
    store: &CellStore,
    ast: &Ast,
    sheet: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    match ast {
        Ast::Num(_) | Ast::Bool(_) | Ast::Str(_) => Ok((1, 1, 1)),
        // A scalar expression such as 1/0 or A1*2 gives one value; its
        // error, if any, appears when it is evaluated.
        _ if !is_reference(ast) && !ast_produces_array(ast) => Ok((1, 1, 1)),
        _ => store.matrix_shape(ast, sheet),
    }
}

/// Returns an upper bound of the result shape without evaluating arguments.
/// FREQUENCY ignores bins that are not numbers, and the LINEST `stats` argument
/// can be a formula, so the evaluated result can be smaller.
pub(crate) fn shape(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<(usize, usize, usize), FormulaError> {
    let (rows, cols) = if name == "FREQUENCY" {
        if args.len() != FREQUENCY_ARGS {
            return Err(FormulaError::Value);
        }
        let (_, _, data_cells) = argument_shape(store, &args[0], sheet)?;
        let (_, _, bin_cells) = argument_shape(store, &args[1], sheet)?;
        validate_frequency_resources(data_cells, bin_cells)?;
        (bin_cells + 1, 1)
    } else if name == "MODE.MULT" {
        if args.is_empty() || args.len() > MODE_MAX_ARGS {
            return Err(FormulaError::Value);
        }
        let mut cells = 0usize;
        for arg in args {
            let (_, _, arg_cells) = argument_shape(store, arg, sheet)?;
            cells = cells.checked_add(arg_cells).ok_or(FormulaError::Num)?;
        }
        validate_mode_resources(cells)?;
        // A mode occurs at least twice, so at most half of the values are modes.
        ((cells / 2).max(1), 1)
    } else {
        if args.is_empty() || args.len() > LINEST_MAX_ARGS {
            return Err(FormulaError::Value);
        }
        let (y_rows, y_cols, y_cells) = argument_shape(store, &args[0], sheet)?;
        let (x_rows, x_cols, x_cells) = optional_ast(args, 1)
            .map_or(Ok((y_rows, y_cols, y_cells)), |ast| {
                argument_shape(store, ast, sheet)
            })?;
        let predictors = predictor_count(y_rows, y_cols, x_rows, x_cols)?;
        validate_fit_resources(y_cells, predictors)?;
        if name == "LINEST" || name == "LOGEST" {
            (statistics_rows_bound(args), predictors + 1)
        } else if let Some(ast) = optional_ast(args, 2) {
            let (new_rows, new_cols, new_cells) = argument_shape(store, ast, sheet)?;
            let output = prediction_shape(predictors, y_cols == 1, new_rows, new_cols)?;
            validate_prediction_resources(y_cells + x_cells, new_rows, new_cols, new_cells)?;
            output
        } else {
            (y_rows, y_cols)
        }
    };
    Ok((rows, cols, EvalMatrix::validate_shape(rows, cols, 1, 0)?))
}

pub(crate) fn bound(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
) -> Result<usize, FormulaError> {
    shape(store, name, args, sheet).map(|(_, _, cells)| cells)
}

fn statistics_rows_bound(args: &[Ast]) -> usize {
    match optional_ast(args, 3) {
        None | Some(Ast::Bool(false)) => 1,
        Some(Ast::Num(number)) if *number == 0.0 => 1,
        Some(_) => STATS_ROWS,
    }
}

/// One predictor maps each cell of `new_x` to one result. More predictors use
/// one `new_x` row (vertical data) or column (horizontal data) per result.
fn prediction_shape(
    predictors: usize,
    is_vertical: bool,
    new_rows: usize,
    new_cols: usize,
) -> Result<(usize, usize), FormulaError> {
    if predictors == 1 {
        Ok((new_rows, new_cols))
    } else if is_vertical {
        if new_cols == predictors {
            Ok((new_rows, 1))
        } else {
            Err(FormulaError::Ref)
        }
    } else if new_rows == predictors {
        Ok((1, new_cols))
    } else {
        Err(FormulaError::Ref)
    }
}

fn validate_prediction_resources(
    input_cells: usize,
    new_rows: usize,
    new_cols: usize,
    new_cells: usize,
) -> Result<(), FormulaError> {
    if new_cells > SPILL_MAX_RECOMPUTE_CELLS {
        return Err(FormulaError::Num);
    }
    let input_bytes = input_cells
        .checked_add(new_cells)
        .and_then(|cells| cells.checked_mul(std::mem::size_of::<Value>()))
        .ok_or(FormulaError::Num)?;
    EvalMatrix::validate_shape(new_rows, new_cols, 1, input_bytes)?;
    Ok(())
}

/// MODE.MULT keeps one count per distinct value, so its work and memory are
/// linear in the number of input cells.
fn validate_mode_resources(cells: usize) -> Result<(), FormulaError> {
    if cells > SPILL_MAX_RECOMPUTE_CELLS {
        return Err(FormulaError::Num);
    }
    let workspace = cells
        .checked_mul(std::mem::size_of::<(u64, usize)>())
        .ok_or(FormulaError::Num)?;
    EvalMatrix::validate_shape((cells / 2).max(1), 1, 1, workspace)?;
    Ok(())
}

fn validate_frequency_resources(data_cells: usize, bin_cells: usize) -> Result<(), FormulaError> {
    let comparisons = (bin_cells.max(1).ilog2() as usize + 1)
        .checked_mul(data_cells + bin_cells)
        .ok_or(FormulaError::Num)?;
    if comparisons > SPILL_MAX_RECOMPUTE_CELLS {
        return Err(FormulaError::Num);
    }
    let output_rows = bin_cells.checked_add(1).ok_or(FormulaError::Num)?;
    let workspace = (data_cells + bin_cells * 2)
        .checked_mul(std::mem::size_of::<f64>())
        .ok_or(FormulaError::Num)?;
    EvalMatrix::validate_shape(output_rows, 1, 1, workspace)?;
    Ok(())
}

struct Evaluation<'a> {
    store: &'a CellStore,
    sheet: usize,
    affected: &'a HashSet<AbsCellKey>,
    memo: &'a mut HashMap<AbsCellKey, EvalResult>,
    visiting: &'a mut HashSet<AbsCellKey>,
    depth: usize,
}
impl Evaluation<'_> {
    fn matrix(&mut self, ast: &Ast) -> Result<EvalMatrix, FormulaError> {
        if let Some(matrix) = self.store.eval_dynamic_array(
            ast,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth + 1,
        ) {
            return matrix;
        }
        let value = self.store.eval_ast(
            ast,
            self.sheet,
            self.affected,
            self.memo,
            self.visiting,
            self.depth + 1,
        );
        if let Value::Error(error) = value {
            return Err(error);
        }
        Ok(EvalMatrix::new(1, 1, vec![value]))
    }
    fn boolean(&mut self, args: &[Ast], index: usize, default: bool) -> Result<bool, FormulaError> {
        optional_ast(args, index).map_or(Ok(default), |ast| {
            bool_from_value(&self.store.eval_ast(
                ast,
                self.sheet,
                self.affected,
                self.memo,
                self.visiting,
                self.depth + 1,
            ))
        })
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn evaluate_array(
    store: &CellStore,
    name: &str,
    args: &[Ast],
    sheet: usize,
    affected: &HashSet<AbsCellKey>,
    memo: &mut HashMap<AbsCellKey, EvalResult>,
    visiting: &mut HashSet<AbsCellKey>,
    depth: usize,
) -> Result<EvalMatrix, FormulaError> {
    shape(store, name, args, sheet)?;
    let mut evaluation = Evaluation {
        store,
        sheet,
        affected,
        memo,
        visiting,
        depth,
    };
    match name {
        "FREQUENCY" => return frequency(&mut evaluation, args),
        "MODE.MULT" => return modes(&mut evaluation, args),
        _ => {}
    }
    let y_matrix = evaluation.matrix(&args[0])?;
    let x_matrix = if let Some(ast) = optional_ast(args, 1) {
        evaluation.matrix(ast)?
    } else {
        EvalMatrix::new(
            y_matrix.rows,
            y_matrix.cols,
            (1..=y_matrix.values.len())
                .map(|index| Value::number(index as f64))
                .collect(),
        )
    };
    let is_vertical = y_matrix.cols == 1;
    let is_exponential = name == "LOGEST" || name == "GROWTH";
    let is_prediction = name == "TREND" || name == "GROWTH";
    let has_intercept = evaluation.boolean(args, if is_prediction { 3 } else { 2 }, true)?;
    if !is_prediction {
        let has_statistics = evaluation.boolean(args, 3, false)?;
        let fit = fit(
            &y_matrix,
            &x_matrix,
            is_vertical,
            has_intercept,
            is_exponential,
        )?;
        let rows = if has_statistics { STATS_ROWS } else { 1 };
        return fit.statistics(rows, is_exponential);
    }
    let fit = fit(
        &y_matrix,
        &x_matrix,
        is_vertical,
        has_intercept,
        is_exponential,
    )?;
    let predictions = if let Some(ast) = optional_ast(args, 2) {
        evaluation.matrix(ast)?
    } else {
        x_matrix
    };
    let predictor_count = fit.coefficients.len();
    let (rows, cols) = prediction_shape(
        predictor_count,
        is_vertical,
        predictions.rows,
        predictions.cols,
    )?;
    let output_count = rows * cols;
    let layout = PredictorLayout {
        predictors: predictor_count,
        observations: output_count,
        is_vertical,
    };
    let mut values = Vec::with_capacity(output_count);
    for observation in 0..output_count {
        let mut prediction = fit.intercept;
        for (predictor, coefficient) in fit.coefficients.iter().enumerate() {
            let index = layout.index(observation, predictor);
            prediction += coefficient * strict_number(&predictions.values[index])?;
        }
        let result = if is_exponential {
            prediction.exp()
        } else {
            prediction
        };
        if !result.is_finite() {
            return Err(FormulaError::Num);
        }
        values.push(Value::number(result));
    }
    Ok(EvalMatrix::new(rows, cols, values))
}

/// Regression inputs must be numbers: blank cells, text and logical values
/// give #VALUE!, as in Excel.
fn strict_number(value: &Value) -> Result<f64, FormulaError> {
    match value {
        Value::Number(number) => Ok(*number),
        Value::Error(error) => Err(*error),
        _ => Err(FormulaError::Value),
    }
}

fn numeric_values(matrix: &EvalMatrix) -> Result<Vec<f64>, FormulaError> {
    matrix
        .values
        .iter()
        .filter_map(|value| match value {
            Value::Number(number) => Some(Ok(*number)),
            Value::Error(error) => Some(Err(*error)),
            _ => None,
        })
        .collect()
}

/// Each bin counts the values above the next smaller bin and at most the bin.
/// Results keep the order of `bins_array`; for equal bins, the first bin gets
/// the count. The last row counts the values above the largest bin.
fn frequency(evaluation: &mut Evaluation<'_>, args: &[Ast]) -> Result<EvalMatrix, FormulaError> {
    let numbers = numeric_values(&evaluation.matrix(&args[0])?)?;
    let bins = numeric_values(&evaluation.matrix(&args[1])?)?;
    let order = super::sorted_positions(bins.len(), &mut |left, right| {
        bins[left]
            .partial_cmp(&bins[right])
            .unwrap_or(Ordering::Equal)
    });
    // Each data value searches the bins. Keep those repeated reads contiguous.
    let sorted_bins: Vec<f64> = order.iter().map(|&index| bins[index]).collect();
    let mut counts = vec![0.0; bins.len() + 1];
    for number in numbers {
        let position = sorted_bins.partition_point(|&bin| bin < number);
        let slot = order.get(position).copied().unwrap_or(bins.len());
        counts[slot] += 1.0;
    }
    Ok(EvalMatrix::new(
        counts.len(),
        1,
        counts.into_iter().map(Value::number).collect(),
    ))
}

/// Returns every value that occurs most often, as one column, in the order of
/// first occurrence. No repeated value gives #N/A. Values typed directly as
/// arguments follow the scalar rules (TRUE and numeric text count); values
/// from references and arrays count only when they are numbers.
fn modes(evaluation: &mut Evaluation<'_>, args: &[Ast]) -> Result<EvalMatrix, FormulaError> {
    let mut numbers = Vec::new();
    for arg in args {
        let from_range = is_reference(arg) || ast_produces_array(arg);
        for value in &evaluation.matrix(arg)?.values {
            if let Some(number) = aggregate_number(value, from_range)? {
                // -0 and 0 are the same value.
                numbers.push(number + 0.0);
            }
        }
    }
    // Sort positions by value. The sort is stable, so each run of equal values
    // starts at its first occurrence.
    let positions = super::sorted_positions(numbers.len(), &mut |left, right| {
        numbers[left].total_cmp(&numbers[right])
    });
    let mut runs = Vec::new(); // (first position, count)
    let mut highest = 0;
    for (index, &position) in positions.iter().enumerate() {
        if index > 0 && numbers[positions[index - 1]] == numbers[position] {
            let run: &mut (usize, usize) = runs.last_mut().expect("a run is open");
            run.1 += 1;
            highest = highest.max(run.1);
        } else {
            runs.push((position, 1));
        }
    }
    if highest < 2 {
        return Err(FormulaError::Na);
    }
    // Mark the first occurrence of each mode, then read them in input order.
    let mut is_first_of_mode = vec![false; numbers.len()];
    for (first, count) in runs {
        is_first_of_mode[first] = count == highest;
    }
    let modes: Vec<Value> = numbers
        .iter()
        .zip(is_first_of_mode)
        .filter(|(_, is_mode)| *is_mode)
        .map(|(&number, _)| Value::number(number))
        .collect();
    Ok(EvalMatrix::new(modes.len(), 1, modes))
}

fn is_reference(ast: &Ast) -> bool {
    match ast {
        Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::NamedRange(..)
        | Ast::Structured(..) => true,
        Ast::LetSlot { expression, .. } => is_reference(expression),
        _ => false,
    }
}

struct Fit {
    coefficients: Vec<f64>,
    intercept: f64,
    errors: Vec<f64>,
    intercept_error: Value,
    residual_ss: f64,
    total_ss: f64,
    degrees: usize,
    rank: usize,
}

fn predictor_count(
    y_rows: usize,
    y_cols: usize,
    x_rows: usize,
    x_cols: usize,
) -> Result<usize, FormulaError> {
    if y_rows == x_rows && y_cols == x_cols {
        return Ok(1);
    }
    if y_cols == 1 && y_rows == x_rows {
        return Ok(x_cols);
    }
    if y_rows == 1 && y_cols == x_cols {
        return Ok(x_rows);
    }
    Err(FormulaError::Ref)
}

/// Positions of predictor values in an x matrix. One predictor uses the cells
/// in order. Vertical data has one predictor per column, and horizontal data
/// has one predictor per row.
#[derive(Clone, Copy)]
struct PredictorLayout {
    predictors: usize,
    observations: usize,
    is_vertical: bool,
}

impl PredictorLayout {
    fn index(self, observation: usize, predictor: usize) -> usize {
        if self.predictors == 1 {
            observation
        } else if self.is_vertical {
            observation * self.predictors + predictor
        } else {
            predictor * self.observations + observation
        }
    }
}

fn validate_fit_resources(observations: usize, predictors: usize) -> Result<(), FormulaError> {
    let work = observations
        .checked_mul(predictors)
        .and_then(|work| work.checked_mul(predictors + 1))
        .and_then(|work| work.checked_mul(QR_WORK_PER_CELL))
        .ok_or(FormulaError::Num)?;
    if work > SPILL_MAX_RECOMPUTE_CELLS {
        return Err(FormulaError::Num);
    }
    let workspace = observations
        .checked_mul(2 * predictors + 3)
        .and_then(|cells| cells.checked_add(2 * predictors * predictors))
        .and_then(|cells| cells.checked_mul(std::mem::size_of::<f64>()))
        .ok_or(FormulaError::Num)?;
    EvalMatrix::validate_shape(observations, predictors, 2, workspace)?;
    Ok(())
}

fn fit(
    y_matrix: &EvalMatrix,
    x_matrix: &EvalMatrix,
    is_vertical: bool,
    has_intercept: bool,
    is_exponential: bool,
) -> Result<Fit, FormulaError> {
    let observation_count = y_matrix.values.len();
    let predictor_count =
        predictor_count(y_matrix.rows, y_matrix.cols, x_matrix.rows, x_matrix.cols)?;
    validate_fit_resources(observation_count, predictor_count)?;
    let layout = PredictorLayout {
        predictors: predictor_count,
        observations: observation_count,
        is_vertical,
    };
    let mut responses = Vec::with_capacity(observation_count);
    let mut columns = vec![Vec::with_capacity(observation_count); predictor_count];
    for observation in 0..observation_count {
        let response = strict_number(&y_matrix.values[observation])?;
        if is_exponential && response <= 0.0 {
            return Err(FormulaError::Num);
        }
        responses.push(if is_exponential {
            response.ln()
        } else {
            response
        });
        for (predictor, column) in columns.iter_mut().enumerate() {
            let index = layout.index(observation, predictor);
            column.push(strict_number(&x_matrix.values[index])?);
        }
    }
    let count = responses.len();
    let response_mean = if has_intercept {
        responses.iter().sum::<f64>() / count as f64
    } else {
        0.0
    };
    let means: Vec<f64> = columns
        .iter()
        .map(|column| {
            if has_intercept {
                column.iter().sum::<f64>() / count as f64
            } else {
                0.0
            }
        })
        .collect();
    for (column, mean) in columns.iter_mut().zip(&means) {
        for number in column {
            *number -= mean;
        }
    }
    // Raw responses are no longer needed. Reuse their buffer for centering.
    for response in &mut responses {
        *response -= response_mean;
    }
    let centered = responses;
    let total_ss = centered.iter().map(|response| response * response).sum();
    // Reorthogonalized QR drops dependent columns. Their coefficients and errors are zero.
    let mut orthogonal: Vec<Vec<f64>> = Vec::new();
    let mut active = Vec::new();
    let mut triangular = vec![vec![0.0; predictor_count]; predictor_count];
    for (predictor, column) in columns.iter().enumerate() {
        let mut residual = column.clone();
        let original_norm = dot(column, column).sqrt();
        for _ in 0..2 {
            for (basis_index, basis) in orthogonal.iter().enumerate() {
                let projection = dot(&residual, basis);
                triangular[basis_index][predictor] += projection;
                for (number, basis_value) in residual.iter_mut().zip(basis) {
                    *number -= projection * basis_value;
                }
            }
        }
        let norm = dot(&residual, &residual).sqrt();
        if norm <= original_norm * f64::EPSILON * count as f64 * QR_DEPENDENCE_FACTOR || norm == 0.0
        {
            continue;
        }
        triangular[active.len()][predictor] = norm;
        for number in &mut residual {
            *number /= norm;
        }
        active.push(predictor);
        orthogonal.push(residual);
    }
    let rank = active.len();
    if count < rank + usize::from(has_intercept) {
        return Err(FormulaError::Num);
    }
    let mut coefficients = vec![0.0; predictor_count];
    for basis_index in (0..rank).rev() {
        let predictor = active[basis_index];
        let remainder: f64 = ((basis_index + 1)..rank)
            .map(|next| triangular[basis_index][active[next]] * coefficients[active[next]])
            .sum();
        coefficients[predictor] = (dot(&orthogonal[basis_index], &centered) - remainder)
            / triangular[basis_index][predictor];
    }
    let intercept = response_mean - dot(&coefficients, &means);
    let residual_ss = (0..count)
        .map(|observation| {
            let residual = centered[observation]
                - columns
                    .iter()
                    .zip(&coefficients)
                    .map(|(column, coefficient)| column[observation] * coefficient)
                    .sum::<f64>();
            residual * residual
        })
        .sum();
    let degrees = count - rank - usize::from(has_intercept);
    let variance = if degrees == 0 {
        0.0
    } else {
        residual_ss / degrees as f64
    };
    // Columns of the inverse of the triangular factor R.
    let mut inverse_columns = vec![vec![0.0; rank]; rank];
    for (column, inverse) in inverse_columns.iter_mut().enumerate() {
        for row in (0..=column).rev() {
            let remainder: f64 = ((row + 1)..=column)
                .map(|next| triangular[row][active[next]] * inverse[next])
                .sum();
            let identity = if row == column { 1.0 } else { 0.0 };
            inverse[row] = (identity - remainder) / triangular[row][active[row]];
        }
    }
    let mut errors = vec![0.0; predictor_count];
    for (row, &predictor) in active.iter().enumerate() {
        let row_norm: f64 = inverse_columns
            .iter()
            .map(|inverse| inverse[row] * inverse[row])
            .sum();
        errors[predictor] = (variance * row_norm).sqrt();
    }
    let intercept_error = if has_intercept {
        let active_means: Vec<f64> = active.iter().map(|&predictor| means[predictor]).collect();
        let mean_variance: f64 = inverse_columns
            .iter()
            .map(|inverse| {
                let projection = dot(&active_means, inverse);
                projection * projection
            })
            .sum();
        Value::number((variance * (1.0 / count as f64 + mean_variance)).sqrt())
    } else {
        Value::Error(FormulaError::Na)
    };
    if !coefficients.iter().all(|number| number.is_finite()) || !intercept.is_finite() {
        return Err(FormulaError::Num);
    }
    Ok(Fit {
        coefficients,
        intercept,
        errors,
        intercept_error,
        residual_ss,
        total_ss,
        degrees,
        rank,
    })
}

fn dot(left: &[f64], right: &[f64]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum()
}

impl Fit {
    fn statistics(self, rows: usize, is_exponential: bool) -> Result<EvalMatrix, FormulaError> {
        let cols = self.coefficients.len() + 1;
        let mut values = vec![Value::Error(FormulaError::Na); rows * cols];
        for (index, coefficient) in self
            .coefficients
            .iter()
            .rev()
            .chain(std::iter::once(&self.intercept))
            .enumerate()
        {
            let coefficient = if is_exponential {
                coefficient.exp()
            } else {
                *coefficient
            };
            if !coefficient.is_finite() {
                return Err(FormulaError::Num);
            }
            values[index] = Value::number(coefficient);
        }
        if rows == STATS_ROWS {
            for (index, error) in self.errors.iter().rev().enumerate() {
                values[cols + index] = Value::number(*error);
            }
            values[2 * cols - 1] = self.intercept_error;
            let explained = (self.total_ss - self.residual_ss).max(0.0);
            values[2 * cols] = if self.total_ss == 0.0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number(explained / self.total_ss)
            };
            values[2 * cols + 1] = if self.degrees == 0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number((self.residual_ss / self.degrees as f64).sqrt())
            };
            values[3 * cols] = if self.rank == 0 || self.residual_ss == 0.0 || self.degrees == 0 {
                Value::Error(FormulaError::DivZero)
            } else {
                Value::number(
                    explained / self.rank as f64 / (self.residual_ss / self.degrees as f64),
                )
            };
            values[3 * cols + 1] = Value::number(self.degrees as f64);
            values[4 * cols] = Value::number(explained);
            values[4 * cols + 1] = Value::number(self.residual_ss);
        }
        Ok(EvalMatrix::new(rows, cols, values))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sheet_with_columns(columns: &[&[f64]]) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(20, 40);
        for (col, column) in columns.iter().enumerate() {
            for (row, &number) in column.iter().enumerate() {
                store.set_number(sheet, row, col, number, 0);
            }
        }
        (store, sheet)
    }

    fn close(
        store: &CellStore,
        sheet: usize,
        row: usize,
        col: usize,
        expected: f64,
        tolerance: f64,
    ) {
        let actual = store.get_cell(sheet, row, col);
        assert!(
            actual.string().is_none(),
            "unexpected error: {:?}",
            actual.string()
        );
        assert!(
            (actual.num() - expected).abs() <= tolerance,
            "({row},{col}): {} != {expected}",
            actual.num()
        );
    }

    #[test]
    fn microsoft_linest_spills_and_predicts() {
        // https://support.microsoft.com/en-us/excel/functions/linest-function
        let (mut store, sheet) =
            sheet_with_columns(&[&[1.0, 9.0, 5.0, 7.0], &[0.0, 4.0, 2.0, 3.0]]);
        store.set_formula(sheet, 0, 4, "=LINEST(A1:A4,B1:B4,,FALSE)", 0);
        store.set_formula(sheet, 3, 4, "=TREND(A1:A4,B1:B4,B1:B4)", 0);
        store.recompute(sheet);
        close(&store, sheet, 0, 4, 2.0, 1e-12);
        close(&store, sheet, 0, 5, 1.0, 1e-12);
        for (row, expected) in [1.0, 9.0, 5.0, 7.0].iter().enumerate() {
            close(&store, sheet, row + 3, 4, *expected, 1e-12);
        }
    }

    #[test]
    fn microsoft_multiple_regression_statistics() {
        // Microsoft LINEST example 3 publishes the first column of all five rows.
        // https://support.microsoft.com/en-us/excel/functions/linest-function
        let (mut store, sheet) = sheet_with_columns(&[
            &[
                2310.0, 2333.0, 2356.0, 2379.0, 2402.0, 2425.0, 2448.0, 2471.0, 2494.0, 2517.0,
                2540.0,
            ],
            &[2.0, 2.0, 3.0, 3.0, 2.0, 4.0, 2.0, 2.0, 3.0, 4.0, 2.0],
            &[2.0, 2.0, 1.5, 2.0, 3.0, 2.0, 1.5, 2.0, 3.0, 4.0, 3.0],
            &[
                20.0, 12.0, 33.0, 43.0, 53.0, 23.0, 99.0, 34.0, 23.0, 55.0, 22.0,
            ],
            &[
                142000.0, 144000.0, 151000.0, 150000.0, 139000.0, 169000.0, 126000.0, 142900.0,
                163000.0, 169000.0, 149000.0,
            ],
        ]);
        store.set_formula(sheet, 15, 0, "=LINEST(E1:E11,A1:D11,TRUE,TRUE)", 0);
        store.recompute(sheet);
        for (row, expected, tolerance) in [
            (15, -234.2371645, 1e-6),
            (16, 13.26801148, 1e-7),
            (17, 0.996747993, 1e-9),
            (18, 459.7536742, 1e-6),
            (19, 1732393319.0, 1.0),
        ] {
            close(&store, sheet, row, 0, expected, tolerance);
        }
        close(&store, sheet, 18, 1, 6.0, 0.0);
        assert_eq!(
            store.get_cell(sheet, 17, 2).string().as_deref(),
            Some("#N/A")
        );
    }

    #[test]
    fn exponential_and_forced_intercept_arrays() {
        // LOGEST fits y=b*m^x; GROWTH evaluates this same curve.
        // https://support.microsoft.com/en-us/excel/functions/logest-function
        let (mut store, sheet) =
            sheet_with_columns(&[&[6.0, 12.0, 24.0, 48.0], &[1.0, 2.0, 3.0, 4.0]]);
        store.set_formula(sheet, 0, 4, "=LOGEST(A1:A4,B1:B4,TRUE,TRUE)", 0);
        store.set_formula(sheet, 8, 4, "=GROWTH(A1:A4,B1:B4,B1:B4)", 0);
        store.set_formula(sheet, 15, 4, "=LINEST(B1:B4,,FALSE,TRUE)", 0);
        store.set_formula(sheet, 23, 4, "=LOGEST(A1:A4,B1:B4,FALSE,TRUE)", 0);
        store.recompute(sheet);
        close(&store, sheet, 0, 4, 2.0, 1e-12);
        close(&store, sheet, 0, 5, 3.0, 1e-12);
        for (row, expected) in [6.0, 12.0, 24.0, 48.0].iter().enumerate() {
            close(&store, sheet, row + 8, 4, *expected, 1e-10);
        }
        close(&store, sheet, 15, 4, 1.0, 1e-12);
        close(&store, sheet, 15, 5, 0.0, 0.0);
        assert_eq!(
            store.get_cell(sheet, 16, 5).string().as_deref(),
            Some("#N/A")
        );
        close(&store, sheet, 18, 5, 3.0, 0.0);
        close(&store, sheet, 23, 4, 2.0 * 3.0_f64.powf(1.0 / 3.0), 1e-12);
        close(&store, sheet, 23, 5, 1.0, 0.0);
    }

    #[test]
    fn collinear_columns_are_removed_and_horizontal_arrays_work() {
        // LINEST documents zero coefficients and errors for redundant columns.
        // https://support.microsoft.com/en-us/excel/functions/linest-function
        let (mut store, sheet) = sheet_with_columns(&[
            &[3.0, 5.0, 7.0, 9.0],
            &[1.0, 2.0, 3.0, 4.0],
            &[2.0, 4.0, 6.0, 8.0],
        ]);
        store.set_formula(sheet, 8, 0, "=LINEST(A1:A4,B1:C4,TRUE,TRUE)", 0);
        store.set_formula(
            sheet,
            15,
            0,
            "=TREND(TRANSPOSE(A1:A4),TRANSPOSE(B1:C4),TRANSPOSE(B1:C4))",
            0,
        );
        store.recompute(sheet);
        close(&store, sheet, 8, 0, 0.0, 0.0);
        close(&store, sheet, 9, 0, 0.0, 0.0);
        close(&store, sheet, 8, 1, 2.0, 1e-12);
        close(&store, sheet, 11, 1, 2.0, 0.0);
        for (col, expected) in [3.0, 5.0, 7.0, 9.0].iter().enumerate() {
            close(&store, sheet, 15, col, *expected, 1e-12);
        }
    }

    #[test]
    fn frequency_and_probability_reference_values() {
        // https://support.microsoft.com/en-us/office/frequency-function-44e3be2b-eca0-42cd-a3f7-fd9ea898fdb9
        // https://support.microsoft.com/en-us/office/prob-function-9ac30561-c81c-4259-8253-34f0a238fc49
        let (mut store, sheet) = sheet_with_columns(&[
            &[79.0, 85.0, 78.0, 85.0, 50.0, 81.0, 95.0, 88.0, 97.0],
            &[70.0, 79.0, 89.0],
            &[0.0, 1.0, 2.0, 3.0],
            &[0.2, 0.3, 0.1, 0.4],
        ]);
        store.set_formula(sheet, 12, 0, "=FREQUENCY(A1:A9,B1:B3)", 0);
        store.set_formula(sheet, 12, 4, "=PROB(C1:C4,D1:D4,2)", 0);
        store.set_formula(sheet, 13, 4, "=PROB(C1:C4,D1:D4,1,3)", 0);
        store.set_formula(sheet, 14, 4, "=RANK(85,A1:A9)", 0);
        store.set_formula(sheet, 15, 4, "=PERCENTILE(C1:C4,0.5)", 0);
        store.set_formula(sheet, 16, 4, "=QUARTILE(C1:C4,2)", 0);
        store.set_formula(sheet, 17, 4, "=PERCENTRANK(C1:C4,1)", 0);
        store.recompute(sheet);
        for (row, expected) in [1.0, 2.0, 4.0, 2.0].iter().enumerate() {
            close(&store, sheet, 12 + row, 0, *expected, 0.0);
        }
        for (row, expected) in [
            (12, 0.1),
            (13, 0.8),
            (14, 4.0),
            (15, 1.5),
            (16, 1.5),
            (17, 0.333),
        ] {
            close(&store, sheet, row, 4, expected, 1e-12);
        }
    }

    #[test]
    fn documented_domains_and_shape_limits() {
        let (mut store, sheet) =
            sheet_with_columns(&[&[1.0, 0.0, 3.0], &[1.0, 2.0, 3.0], &[0.2, 0.3, 0.4]]);
        for (row, formula, expected) in [
            (5, "=LOGEST(A1:A3,B1:B3)", "#NUM!"),
            (6, "=GROWTH(A1:A3,B1:B3)", "#NUM!"),
            (7, "=LINEST(A1:A3,B1:B2)", "#REF!"),
            (8, "=PROB(A1:A3,C1:C2,1)", "#N/A"),
            (9, "=PROB(A1:A3,C1:C3,1)", "#NUM!"),
            (10, "=RANK(8,A1:A3)", "#N/A"),
            (11, "=PERCENTILE(A1:A3,2)", "#NUM!"),
            (12, "=FREQUENCY(A1:A3,SEQUENCE(1000000))", "#NUM!"),
            (13, "=LINEST(SEQUENCE(300000))", "#NUM!"),
            (14, "=TREND(B1:B3,B1:B3,SEQUENCE(1000001))", "#NUM!"),
        ] {
            store.set_formula(sheet, row, 4, formula, 0);
            store.recompute(sheet);
            assert_eq!(
                store.get_cell(sheet, row, 4).string().as_deref(),
                Some(expected),
                "{formula}"
            );
        }
    }

    #[test]
    fn multiple_exponential_predictors_and_matrix_observations() {
        // The documented LOGEST model is b*m1^x1*m2^x2.
        // https://support.microsoft.com/en-us/excel/functions/logest-function
        let (mut store, sheet) = sheet_with_columns(&[
            &[6.0, 48.0, 24.0, 192.0],
            &[1.0, 2.0, 3.0, 4.0],
            &[0.0, 1.0, 0.0, 1.0],
        ]);
        store.set_formula(sheet, 8, 0, "=LOGEST(A1:A4,B1:C4)", 0);
        store.set_formula(sheet, 10, 0, "=GROWTH(A1:A4,B1:C4,B1:C4)", 0);
        // A two-dimensional range is one predictor when both shapes agree.
        store.set_formula(sheet, 16, 0, "=TREND(B1:C4,B1:C4)", 0);
        store.recompute(sheet);
        for (col, expected) in [4.0, 2.0, 3.0].iter().enumerate() {
            close(&store, sheet, 8, col, *expected, 1e-12);
        }
        for (row, expected) in [6.0, 48.0, 24.0, 192.0].iter().enumerate() {
            close(&store, sheet, 10 + row, 0, *expected, 1e-10);
            close(&store, sheet, 16 + row, 0, row as f64 + 1.0, 1e-12);
            close(&store, sheet, 16 + row, 1, (row % 2) as f64, 1e-12);
        }
    }

    #[test]
    fn frequency_ignores_non_numbers_and_retries_spill_collisions() {
        let (mut store, sheet) = sheet_with_columns(&[&[1.0, 2.0, 3.0, 4.0], &[2.0]]);
        store.set_string(sheet, 1, 1, "ignored", 0);
        store.set_number(sheet, 9, 4, 99.0, 0);
        store.set_formula(sheet, 8, 4, "=FREQUENCY(A1:A4,B1:B3)", 0);
        store.recompute(sheet);
        assert_eq!(
            store.get_cell(sheet, 8, 4).string().as_deref(),
            Some("#SPILL!")
        );
        store.clear_cell(sheet, 9, 4, 0);
        store.recompute(sheet);
        close(&store, sheet, 8, 4, 2.0, 0.0);
        close(&store, sheet, 9, 4, 2.0, 0.0);
        assert_eq!(store.get_cell(sheet, 10, 4).num(), 0.0);
    }

    #[test]
    fn frequency_keeps_the_order_of_unsorted_and_equal_bins() {
        // Each result belongs to the bin at the same position in bins_array.
        // https://support.microsoft.com/en-us/office/frequency-function-44e3be2b-eca0-42cd-a3f7-fd9ea898fdb9
        let (mut store, sheet) =
            sheet_with_columns(&[&[1.0, 2.0, 3.0, 4.0, 5.0], &[3.0, 1.0, 3.0]]);
        store.set_formula(sheet, 0, 4, "=FREQUENCY(A1:A5,B1:B3)", 0);
        store.recompute(sheet);
        for (row, expected) in [2.0, 1.0, 0.0, 2.0].iter().enumerate() {
            close(&store, sheet, row, 4, *expected, 0.0);
        }
    }

    #[test]
    fn regression_inputs_must_be_numbers() {
        let (mut store, sheet) =
            sheet_with_columns(&[&[1.0, 9.0, 5.0, 7.0], &[0.0, 4.0, 2.0, 3.0]]);
        store.set_string(sheet, 2, 2, "text", 0);
        for (row, formula) in [
            (10, "=LINEST(A1:A5,B1:B5)"),
            (11, "=TREND(A1:A4,B1:B4,C1:C4)"),
            (12, "=LOGEST(A1:A4,C1:C4)"),
        ] {
            store.set_formula(sheet, row, 4, formula, 0);
            store.recompute(sheet);
            assert_eq!(
                store.get_cell(sheet, row, 4).string().as_deref(),
                Some("#VALUE!"),
                "{formula}"
            );
        }
    }

    #[test]
    fn statistics_flag_from_a_cell_selects_the_row_count() {
        // https://support.microsoft.com/en-us/excel/functions/linest-function
        let (mut store, sheet) =
            sheet_with_columns(&[&[1.0, 9.0, 5.0, 7.0], &[0.0, 4.0, 2.0, 3.0], &[0.0]]);
        store.set_formula(sheet, 0, 4, "=LINEST(A1:A4,B1:B4,TRUE,C1)", 0);
        store.recompute(sheet);
        close(&store, sheet, 0, 4, 2.0, 1e-12);
        assert_eq!(store.get_cell(sheet, 3, 5).num(), 0.0);
        store.set_number(sheet, 0, 2, 1.0, 0);
        store.recompute(sheet);
        close(&store, sheet, 3, 5, 2.0, 0.0);
    }

    #[test]
    fn mode_mult_returns_every_mode_in_first_occurrence_order() {
        // https://support.microsoft.com/en-us/office/mode-mult-function-50fd9464-b2ba-4191-b57a-39446689ae8c
        let (mut store, sheet) = sheet_with_columns(&[
            &[1.0, 2.0, 3.0, 4.0, 3.0, 2.0, 1.0, 2.0, 3.0, 5.0, 6.0, 1.0],
            &[7.0, 8.0, 9.0],
            &[1.0, 0.0, 2.0, 2.0],
        ]);
        // A text "1" in a referenced cell is ignored, so only 2 repeats in C1:C4.
        store.set_string(sheet, 1, 2, "1", 0);
        store.set_formula(sheet, 0, 4, "=MODE.MULT(A1:A12)", 0);
        store.set_formula(sheet, 0, 6, "=MODE.MULT(B1:B3)", 0);
        store.set_formula(sheet, 0, 8, "=MODE.MULT(1,\"1\",TRUE,2)", 0);
        store.set_formula(sheet, 0, 10, "=MODE.MULT(C1:C4)", 0);
        store.set_formula(sheet, 0, 12, "=MODE.MULT(A1:A3,1/0)", 0);
        store.set_formula(sheet, 0, 14, "=MODE.MULT(0,-0,5)", 0);
        store.recompute(sheet);
        for (row, expected) in [1.0, 2.0, 3.0].iter().enumerate() {
            close(&store, sheet, row, 4, *expected, 0.0);
        }
        assert!(store.get_cell(sheet, 3, 4).string().is_none());
        let text = |col| store.get_cell(sheet, 0, col).string();
        assert_eq!(text(6).as_deref(), Some("#N/A"));
        // Typed TRUE and "1" count as 1.
        close(&store, sheet, 0, 8, 1.0, 0.0);
        close(&store, sheet, 0, 10, 2.0, 0.0);
        assert_eq!(text(12).as_deref(), Some("#DIV/0!"));
        close(&store, sheet, 0, 14, 0.0, 0.0);
    }

    #[test]
    fn legacy_names_match_current_names() {
        let (mut store, sheet) =
            sheet_with_columns(&[&[13.0, 12.0, 11.0, 8.0, 4.0, 3.0, 2.0, 1.0, 1.0, 1.0]]);
        let pairs = [
            ("=PERCENTILE(A1:A10,0.3)", "=PERCENTILE.INC(A1:A10,0.3)"),
            ("=QUARTILE(A1:A10,3)", "=QUARTILE.INC(A1:A10,3)"),
            ("=QUARTILE(A1:A10,5)", "=QUARTILE.INC(A1:A10,5)"),
            ("=RANK(8,A1:A10,1)", "=RANK.EQ(8,A1:A10,1)"),
            ("=RANK(1,A1:A10)", "=RANK.EQ(1,A1:A10)"),
            ("=PERCENTRANK(A1:A10,5)", "=PERCENTRANK.INC(A1:A10,5)"),
        ];
        for (row, (legacy, current)) in pairs.iter().enumerate() {
            store.set_formula(sheet, row, 2, legacy, 0);
            store.set_formula(sheet, row, 3, current, 0);
        }
        store.recompute(sheet);
        for (row, (legacy, _)) in pairs.iter().enumerate() {
            let legacy_cell = store.get_cell(sheet, row, 2);
            let current_cell = store.get_cell(sheet, row, 3);
            assert_eq!(legacy_cell.string(), current_cell.string(), "{legacy}");
            assert_eq!(legacy_cell.num(), current_cell.num(), "{legacy}");
        }
    }
}
