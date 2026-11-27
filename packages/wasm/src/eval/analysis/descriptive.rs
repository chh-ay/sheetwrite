//! Descriptive statistics, ranking and simple linear regression.

use super::super::functions::{
    integer_arg, number_arg, numeric_entries, require_arity, FuncAccumulator, FuncValue,
};
use super::super::lift::ValueArgs;
use crate::types::{EvalResult, FormulaError, Value, RANGE_CELL_LIMIT};

family_functions! {
    AVEDEV,
    DEVSQ,
    FORECAST,
    FORECAST_LINEAR = "FORECAST.LINEAR",
    HARMEAN,
    INTERCEPT,
    KURT,
    PEARSON,
    PERCENTILE_EXC = "PERCENTILE.EXC",
    PERCENTRANK_EXC = "PERCENTRANK.EXC",
    PERCENTRANK_INC = "PERCENTRANK.INC",
    QUARTILE_EXC = "QUARTILE.EXC",
    RANK_AVG = "RANK.AVG",
    RSQ,
    SKEW,
    SKEW_P = "SKEW.P",
    SLOPE,
    STEYX,
    TRIMMEAN,
}

/// The arguments of `function` that take one value: `x` of FORECAST, `k` of
/// PERCENTILE.EXC, `quart` of QUARTILE.EXC, the percent of TRIMMEAN, `x` and
/// the significance of PERCENTRANK, and the number and order of RANK.AVG.
/// The data are ranges or arrays.
pub(super) const fn value_args(function: Function) -> ValueArgs {
    match function {
        Function::FORECAST | Function::FORECAST_LINEAR => ValueArgs::at(&[0]),
        Function::PERCENTILE_EXC | Function::QUARTILE_EXC | Function::TRIMMEAN => {
            ValueArgs::at(&[1])
        }
        Function::PERCENTRANK_EXC | Function::PERCENTRANK_INC => ValueArgs::at(&[1, 2]),
        Function::RANK_AVG => ValueArgs::at(&[0, 2]),
        Function::AVEDEV
        | Function::DEVSQ
        | Function::HARMEAN
        | Function::INTERCEPT
        | Function::KURT
        | Function::PEARSON
        | Function::RSQ
        | Function::SKEW
        | Function::SKEW_P
        | Function::SLOPE
        | Function::STEYX => ValueArgs::NONE,
    }
}

/// Functions whose arguments are number lists: a single-cell argument is a
/// reference, so text and logical values in that cell are ignored.
pub(crate) const fn reads_cells_as_references(function: Function) -> bool {
    matches!(
        function,
        Function::AVEDEV
            | Function::DEVSQ
            | Function::HARMEAN
            | Function::KURT
            | Function::SKEW
            | Function::SKEW_P
    )
}

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(function: Function, values: &FuncAccumulator) -> EvalResult {
    calculate(function, values).map_or_else(Value::Error, |number| {
        if number.is_finite() {
            Value::number(number)
        } else {
            Value::Error(FormulaError::Num)
        }
    })
}

fn calculate(function: Function, values: &FuncAccumulator) -> NumberResult {
    match function {
        Function::AVEDEV => average_deviation(&number_list(values)?),
        Function::DEVSQ => Ok(moments(&number_list(values)?)?.m2),
        Function::HARMEAN => harmonic_mean(&number_list(values)?),
        Function::KURT => kurtosis(&number_list(values)?),
        Function::SKEW => skewness(&number_list(values)?, true),
        Function::SKEW_P => skewness(&number_list(values)?, false),
        Function::TRIMMEAN => {
            require_arity(values, 2, 2)?;
            trimmed_mean(
                numbers(values.arg(0).unwrap_or_default())?,
                number_arg(values, 1, None)?,
            )
        }
        Function::PERCENTILE_EXC => {
            require_arity(values, 2, 2)?;
            percentile_exclusive(
                numbers(values.arg(0).unwrap_or_default())?,
                number_arg(values, 1, None)?,
            )
        }
        Function::QUARTILE_EXC => {
            require_arity(values, 2, 2)?;
            let quartile = integer_arg(values, 1, None)?;
            if !(1..=3).contains(&quartile) {
                return Err(FormulaError::Num);
            }
            percentile_exclusive(
                numbers(values.arg(0).unwrap_or_default())?,
                quartile as f64 * 0.25,
            )
        }
        Function::PERCENTRANK_INC | Function::PERCENTRANK_EXC => {
            require_arity(values, 2, 3)?;
            let numbers = numbers(values.arg(0).unwrap_or_default())?;
            let target = number_arg(values, 1, None)?;
            let significance = integer_arg(values, 2, Some(3))?;
            if significance < 1 {
                return Err(FormulaError::Num);
            }
            percent_rank(
                numbers,
                target,
                function == Function::PERCENTRANK_EXC,
                significance,
            )
        }
        Function::RANK_AVG => {
            require_arity(values, 2, 3)?;
            let target = number_arg(values, 0, None)?;
            let numbers = numbers(values.arg(1).unwrap_or_default())?;
            let ascending = number_arg(values, 2, Some(0.0))? != 0.0;
            rank_average(&numbers, target, ascending)
        }
        Function::PEARSON => paired_fit(values)?.correlation(),
        Function::RSQ => paired_fit(values)?.correlation().map(|r| r * r),
        Function::SLOPE => paired_fit(values)?.slope(),
        Function::INTERCEPT => paired_fit(values)?.intercept(),
        Function::STEYX => paired_fit(values)?.standard_error(),
        Function::FORECAST | Function::FORECAST_LINEAR => {
            require_arity(values, 3, 3)?;
            let x = number_arg(values, 0, None)?;
            let fit = Fit::from_pairs(
                values.arg(2).unwrap_or_default(),
                values.arg(1).unwrap_or_default(),
            )?;
            Ok(fit.intercept()? + fit.slope()? * x)
        }
    }
}

/// The numbers of a function that takes one list of numbers.
fn number_list(values: &FuncAccumulator) -> Result<Vec<f64>, FormulaError> {
    require_arity(values, 1, 255)?;
    numbers(values.entries())
}

/// The fit of a function of two paired arrays. PEARSON takes (`array1`,
/// `array2`); the others take (`known_y`, `known_x`).
fn paired_fit(values: &FuncAccumulator) -> Result<Fit, FormulaError> {
    require_arity(values, 2, 2)?;
    Fit::from_pairs(
        values.arg(1).unwrap_or_default(),
        values.arg(0).unwrap_or_default(),
    )
}

fn numbers(entries: &[FuncValue]) -> Result<Vec<f64>, FormulaError> {
    if entries.len() > RANGE_CELL_LIMIT as usize {
        return Err(FormulaError::Num);
    }
    numeric_entries(entries)
}

/// Count, mean and the sum of squared deviations, by Welford's method.
struct Moments {
    count: f64,
    mean: f64,
    m2: f64,
}

fn moments(numbers: &[f64]) -> Result<Moments, FormulaError> {
    if numbers.is_empty() {
        return Err(FormulaError::Num);
    }
    let mut result = Moments {
        count: 0.0,
        mean: 0.0,
        m2: 0.0,
    };
    for &value in numbers {
        result.count += 1.0;
        let delta = value - result.mean;
        result.mean += delta / result.count;
        result.m2 += delta * (value - result.mean);
    }
    if result.mean.is_finite() && result.m2.is_finite() {
        Ok(result)
    } else {
        Err(FormulaError::Num)
    }
}

fn average_deviation(numbers: &[f64]) -> NumberResult {
    let mean = moments(numbers)?.mean;
    Ok(numbers
        .iter()
        .map(|value| (value - mean).abs())
        .sum::<f64>()
        / numbers.len() as f64)
}

fn harmonic_mean(numbers: &[f64]) -> NumberResult {
    if numbers.is_empty() {
        return Err(FormulaError::Num);
    }
    let mut reciprocals = 0.0;
    for &number in numbers {
        if number <= 0.0 {
            return Err(FormulaError::Num);
        }
        reciprocals += 1.0 / number;
    }
    Ok(numbers.len() as f64 / reciprocals)
}

/// Sum of standardized powers `((x - mean) / deviation)^power`.
fn standardized_sum(numbers: &[f64], mean: f64, deviation: f64, power: i32) -> f64 {
    numbers
        .iter()
        .map(|value| ((value - mean) / deviation).powi(power))
        .sum()
}

fn skewness(numbers: &[f64], sample: bool) -> NumberResult {
    let Moments { count, mean, m2 } = moments(numbers).map_err(|_| FormulaError::DivZero)?;
    if (sample && count < 3.0) || m2 <= 0.0 {
        return Err(FormulaError::DivZero);
    }
    if sample {
        let deviation = (m2 / (count - 1.0)).sqrt();
        Ok(count / ((count - 1.0) * (count - 2.0)) * standardized_sum(numbers, mean, deviation, 3))
    } else {
        let deviation = (m2 / count).sqrt();
        Ok(standardized_sum(numbers, mean, deviation, 3) / count)
    }
}

fn kurtosis(numbers: &[f64]) -> NumberResult {
    let Moments { count, mean, m2 } = moments(numbers).map_err(|_| FormulaError::DivZero)?;
    if count < 4.0 || m2 <= 0.0 {
        return Err(FormulaError::DivZero);
    }
    let deviation = (m2 / (count - 1.0)).sqrt();
    let lead = count * (count + 1.0) / ((count - 1.0) * (count - 2.0) * (count - 3.0));
    let tail = 3.0 * (count - 1.0) * (count - 1.0) / ((count - 2.0) * (count - 3.0));
    Ok(lead * standardized_sum(numbers, mean, deviation, 4) - tail)
}

fn trimmed_mean(mut numbers: Vec<f64>, percent: f64) -> NumberResult {
    if numbers.is_empty() || !(0.0..1.0).contains(&percent) {
        return Err(FormulaError::Num);
    }
    // Excel drops floor(n * percent / 2) points from each end.
    let drop = (numbers.len() as f64 * percent / 2.0).floor() as usize;
    crate::sorting::sort_f64(&mut numbers);
    let kept = &numbers[drop..numbers.len() - drop];
    Ok(kept.iter().sum::<f64>() / kept.len() as f64)
}

fn percentile_exclusive(mut numbers: Vec<f64>, fraction: f64) -> NumberResult {
    let count = numbers.len() as f64;
    let rank = fraction * (count + 1.0);
    if numbers.is_empty() || !(rank >= 1.0 && rank <= count) {
        return Err(FormulaError::Num);
    }
    // Only the two adjacent order statistics are needed, not a full sort.
    let lower = rank.floor() as usize;
    let (_, base_slot, above) = numbers.select_nth_unstable_by(lower - 1, f64::total_cmp);
    let base = *base_slot;
    let next = above
        .iter()
        .min_by(|left, right| left.total_cmp(right))
        .copied()
        .unwrap_or(base);
    Ok(base + (rank - lower as f64) * (next - base))
}

fn percent_rank(
    numbers: Vec<f64>,
    target: f64,
    exclusive: bool,
    significance: i64,
) -> NumberResult {
    if numbers.is_empty() {
        return Err(FormulaError::Num);
    }
    // Rank needs only the count below the target and its two neighbours.
    // A scan avoids sorting and does not allocate a position buffer.
    let mut below = 0usize;
    let mut has_target = false;
    let mut lower: Option<f64> = None;
    let mut upper: Option<f64> = None;
    for &number in &numbers {
        if number < target {
            below += 1;
            if lower.is_none_or(|previous| number.total_cmp(&previous).is_gt()) {
                lower = Some(number);
            }
        } else if number == target {
            has_target = true;
        } else if upper.is_none_or(|previous| number.total_cmp(&previous).is_lt()) {
            upper = Some(number);
        }
    }
    let position = if has_target {
        below as f64
    } else {
        let low = lower.ok_or(FormulaError::Na)?;
        let high = upper.ok_or(FormulaError::Na)?;
        (below - 1) as f64 + (target - low) / (high - low)
    };
    let count = numbers.len() as f64;
    let rank = if exclusive {
        (position + 1.0) / (count + 1.0)
    } else if numbers.len() == 1 {
        1.0
    } else {
        position / (count - 1.0)
    };
    // Excel truncates, not rounds, to the requested significant digits.
    let scale = 10f64.powi(i32::try_from(significance.min(15)).map_err(|_| FormulaError::Num)?);
    Ok((rank * scale + 1e-9).floor() / scale)
}

fn rank_average(numbers: &[f64], target: f64, ascending: bool) -> NumberResult {
    let mut ties = 0usize;
    let mut before = 0usize;
    for &number in numbers {
        ties += usize::from(number == target);
        before += usize::from(if ascending {
            number < target
        } else {
            number > target
        });
    }
    if ties == 0 {
        return Err(FormulaError::Na);
    }
    // Tied values share the average of the ranks they occupy.
    Ok(before as f64 + (ties as f64 + 1.0) / 2.0)
}

/// Least-squares fit of y on x over the pairs where both values are numbers.
struct Fit {
    count: f64,
    mean_x: f64,
    mean_y: f64,
    sxx: f64,
    syy: f64,
    sxy: f64,
}

impl Fit {
    fn from_pairs(xs: &[FuncValue], ys: &[FuncValue]) -> Result<Self, FormulaError> {
        if xs.len() != ys.len() {
            return Err(FormulaError::Na);
        }
        let mut fit = Self {
            count: 0.0,
            mean_x: 0.0,
            mean_y: 0.0,
            sxx: 0.0,
            syy: 0.0,
            sxy: 0.0,
        };
        for (x_cell, y_cell) in xs.iter().zip(ys) {
            match (&x_cell.value, &y_cell.value) {
                (Value::Error(error), _) | (_, Value::Error(error)) => return Err(*error),
                (Value::Number(x), Value::Number(y)) if x.is_finite() && y.is_finite() => {
                    fit.count += 1.0;
                    let dx = x - fit.mean_x;
                    let dy = y - fit.mean_y;
                    fit.mean_x += dx / fit.count;
                    fit.mean_y += dy / fit.count;
                    fit.sxx += dx * (x - fit.mean_x);
                    fit.syy += dy * (y - fit.mean_y);
                    fit.sxy += dx * (y - fit.mean_y);
                }
                (Value::Number(_), Value::Number(_)) => return Err(FormulaError::Num),
                _ => {}
            }
        }
        Ok(fit)
    }

    fn slope(&self) -> NumberResult {
        if self.count < 1.0 || self.sxx <= 0.0 {
            return Err(FormulaError::DivZero);
        }
        Ok(self.sxy / self.sxx)
    }

    fn intercept(&self) -> NumberResult {
        Ok(self.mean_y - self.slope()? * self.mean_x)
    }

    fn correlation(&self) -> NumberResult {
        if self.count < 2.0 || self.sxx <= 0.0 || self.syy <= 0.0 {
            return Err(FormulaError::DivZero);
        }
        Ok((self.sxy / (self.sxx * self.syy).sqrt()).clamp(-1.0, 1.0))
    }

    fn standard_error(&self) -> NumberResult {
        if self.count < 3.0 || self.sxx <= 0.0 {
            return Err(FormulaError::DivZero);
        }
        let residual = (self.syy - self.sxy * self.sxy / self.sxx).max(0.0);
        Ok((residual / (self.count - 2.0)).sqrt())
    }
}
