//! Hypothesis tests that return the probability of a test statistic:
//! chi-squared, F, Student's t and z tests.

use super::super::functions::{
    number_arg, numeric_entries, require_arity, FuncAccumulator, FuncValue,
};
use super::distributions::{ensure, f_probability, gamma_probability, normal_cdf, student_tail};
use crate::types::{EvalResult, FormulaError, Value, RANGE_CELL_LIMIT};

family_functions! {
    CHISQ_TEST = "CHISQ.TEST",
    CHITEST,
    F_TEST = "F.TEST",
    FTEST,
    T_TEST = "T.TEST",
    TTEST,
    Z_TEST = "Z.TEST",
    ZTEST,
}

const ONE_TAIL: f64 = 1.0;
const TWO_TAILS: f64 = 2.0;
const PAIRED: f64 = 1.0;
const EQUAL_VARIANCE: f64 = 2.0;
const UNEQUAL_VARIANCE: f64 = 3.0;
const HALF: f64 = 0.5;

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
        Function::CHITEST | Function::CHISQ_TEST => chi_squared_test(values),
        Function::FTEST | Function::F_TEST => f_test(values),
        Function::TTEST | Function::T_TEST => t_test(values),
        Function::ZTEST | Function::Z_TEST => z_test(values),
    }
}

/// The count, mean and sample variance of a list of numbers.
struct Sample {
    count: f64,
    mean: f64,
    variance: f64,
}

impl Sample {
    /// Text, logical values and blank cells in the list are ignored.
    fn from_entries(entries: &[FuncValue]) -> Result<Self, FormulaError> {
        if entries.len() > RANGE_CELL_LIMIT as usize {
            return Err(FormulaError::Num);
        }

        Ok(Self::from_numbers(&numeric_entries(entries)?))
    }

    /// Welford's method keeps the variance accurate for large means.
    fn from_numbers(numbers: &[f64]) -> Self {
        let mut count = 0.0;
        let mut mean = 0.0;
        let mut squares = 0.0;

        for &number in numbers {
            count += 1.0;
            let delta = number - mean;
            mean += delta / count;
            squares += delta * (number - mean);
        }

        let variance = if count > 1.0 {
            squares / (count - 1.0)
        } else {
            f64::NAN
        };

        Self {
            count,
            mean,
            variance,
        }
    }

    /// A variance needs two numbers, and a test statistic divides by it.
    fn require_spread(&self) -> Result<(), FormulaError> {
        if self.count < 2.0 || self.variance <= 0.0 {
            Err(FormulaError::DivZero)
        } else {
            Ok(())
        }
    }
}

/// The numbers at the same position in two lists. A pair where either value
/// is not a number is skipped; an error in either list is returned.
fn paired_numbers(
    left: &[FuncValue],
    right: &[FuncValue],
) -> Result<Vec<(f64, f64)>, FormulaError> {
    let mut pairs = Vec::new();
    pairs
        .try_reserve(left.len())
        .map_err(|_| FormulaError::Num)?;

    for (left, right) in left.iter().zip(right) {
        match (&left.value, &right.value) {
            (Value::Error(error), _) | (_, Value::Error(error)) => return Err(*error),
            (Value::Number(first), Value::Number(second)) => pairs.push((*first, *second)),
            _ => {}
        }
    }

    Ok(pairs)
}

/// `CHITEST(actual_range, expected_range)`: the right tail of the chi-squared
/// statistic. The ranges must have the same shape.
fn chi_squared_test(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 2, 2)?;
    let (rows, cols) = values.arg_shape(0).ok_or(FormulaError::Value)?;

    if values.arg_shape(1) != Some((rows, cols)) || rows * cols == 1 {
        return Err(FormulaError::Na);
    }

    let degrees = if rows == 1 {
        cols - 1
    } else if cols == 1 {
        rows - 1
    } else {
        (rows - 1) * (cols - 1)
    } as f64;
    let pairs = paired_numbers(
        values.arg(0).unwrap_or_default(),
        values.arg(1).unwrap_or_default(),
    )?;
    let mut statistic = 0.0;

    for (actual, expected) in pairs {
        if expected == 0.0 {
            return Err(FormulaError::DivZero);
        }

        ensure(expected > 0.0)?;
        statistic += (actual - expected) * (actual - expected) / expected;
    }

    gamma_probability(degrees * HALF, statistic * HALF, true)
}

/// `FTEST(array1, array2)`: the two-tailed probability that the variances
/// of the two samples are not different.
fn f_test(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 2, 2)?;
    let first = Sample::from_entries(values.arg(0).unwrap_or_default())?;
    let second = Sample::from_entries(values.arg(1).unwrap_or_default())?;

    first.require_spread()?;
    second.require_spread()?;

    let ratio = first.variance / second.variance;
    let right = f_probability(ratio, first.count - 1.0, second.count - 1.0, true)?;

    Ok(TWO_TAILS * right.min(1.0 - right))
}

/// `TTEST(array1, array2, tails, type)`: the probability of Student's t
/// statistic for a paired test (type 1), a two-sample test with equal
/// variances (type 2) or a two-sample test with unequal variances (type 3).
fn t_test(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 4, 4)?;
    let left = values.arg(0).unwrap_or_default();
    let right = values.arg(1).unwrap_or_default();
    let tails = number_arg(values, 2, None)?.trunc();
    let kind = number_arg(values, 3, None)?.trunc();

    ensure(tails == ONE_TAIL || tails == TWO_TAILS)?;

    let (statistic, degrees) = if kind == PAIRED {
        paired_statistic(left, right)?
    } else if kind == EQUAL_VARIANCE || kind == UNEQUAL_VARIANCE {
        two_sample_statistic(left, right, kind == EQUAL_VARIANCE)?
    } else {
        return Err(FormulaError::Num);
    };

    Ok(tails * student_tail(statistic.abs(), degrees)?)
}

/// The t statistic and degrees of freedom of the paired differences.
fn paired_statistic(left: &[FuncValue], right: &[FuncValue]) -> Result<(f64, f64), FormulaError> {
    if left.len() != right.len() {
        return Err(FormulaError::Na);
    }

    let differences: Vec<f64> = paired_numbers(left, right)?
        .into_iter()
        .map(|(first, second)| first - second)
        .collect();
    let sample = Sample::from_numbers(&differences);

    sample.require_spread()?;

    let statistic = sample.mean / (sample.variance / sample.count).sqrt();

    Ok((statistic, sample.count - 1.0))
}

/// The t statistic and degrees of freedom of two independent samples. With
/// unequal variances the degrees of freedom are Welch's estimate, which is
/// not rounded.
fn two_sample_statistic(
    left: &[FuncValue],
    right: &[FuncValue],
    is_equal_variance: bool,
) -> Result<(f64, f64), FormulaError> {
    let first = Sample::from_entries(left)?;
    let second = Sample::from_entries(right)?;

    if first.count < 2.0 || second.count < 2.0 {
        return Err(FormulaError::DivZero);
    }

    let difference = first.mean - second.mean;
    let first_share = first.variance / first.count;
    let second_share = second.variance / second.count;

    let (squared_error, degrees) = if is_equal_variance {
        let degrees = first.count + second.count - 2.0;
        let pooled = ((first.count - 1.0) * first.variance
            + (second.count - 1.0) * second.variance)
            / degrees;

        (pooled * (1.0 / first.count + 1.0 / second.count), degrees)
    } else {
        let squared_error = first_share + second_share;
        let degrees = squared_error * squared_error
            / (first_share * first_share / (first.count - 1.0)
                + second_share * second_share / (second.count - 1.0));

        (squared_error, degrees)
    };

    if squared_error <= 0.0 {
        return Err(FormulaError::DivZero);
    }

    Ok((difference / squared_error.sqrt(), degrees))
}

/// `ZTEST(array, x, [sigma])`: the one-tailed probability that the sample
/// mean is greater than its observed value when the population mean is `x`.
/// Without `sigma`, the sample standard deviation is used.
fn z_test(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 2, 3)?;
    let sample = Sample::from_entries(values.arg(0).unwrap_or_default())?;
    let hypothesized_mean = number_arg(values, 1, None)?;

    if sample.count == 0.0 {
        return Err(FormulaError::Na);
    }

    let deviation = if values.arg_count() < 3 || values.arg_missing(2) {
        sample.require_spread()?;
        sample.variance.sqrt()
    } else {
        number_arg(values, 2, None)?
    };

    if deviation == 0.0 {
        return Err(FormulaError::DivZero);
    }

    normal_cdf(-(sample.mean - hypothesized_mean) / (deviation / sample.count.sqrt()))
}
