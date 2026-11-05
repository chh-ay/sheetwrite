//! Hypothesis tests that return the probability of a test statistic:
//! chi-squared, F, Student's t and z tests.

use super::super::functions::{
    number_arg, numeric_entries, require_arity, FuncAccumulator, FuncValue,
};
use super::distributions::{ensure, f_probability, gamma_probability, normal_cdf, student_tail};
use crate::types::{EvalResult, FormulaError, Value, RANGE_CELL_LIMIT};

pub(crate) const NAMES: &[&str] = &[
    "CHISQ.TEST",
    "CHITEST",
    "F.TEST",
    "FTEST",
    "T.TEST",
    "TTEST",
    "Z.TEST",
    "ZTEST",
];

const ONE_TAIL: f64 = 1.0;
const TWO_TAILS: f64 = 2.0;
const PAIRED: f64 = 1.0;
const EQUAL_VARIANCE: f64 = 2.0;
const UNEQUAL_VARIANCE: f64 = 3.0;
const HALF: f64 = 0.5;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    calculate(name, values).map_or_else(Value::Error, |number| {
        if number.is_finite() {
            Value::number(number)
        } else {
            Value::Error(FormulaError::Num)
        }
    })
}

fn calculate(name: &str, values: &FuncAccumulator) -> NumberResult {
    match name {
        "CHITEST" | "CHISQ.TEST" => chi_squared_test(values),
        "FTEST" | "F.TEST" => f_test(values),
        "TTEST" | "T.TEST" => t_test(values),
        "ZTEST" | "Z.TEST" => z_test(values),
        _ => Err(FormulaError::Name),
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

#[cfg(test)]
mod tests {
    use super::*;

    enum Argument<'a> {
        List(&'a [f64]),
        Table(&'a [f64], usize, usize),
        Number(f64),
    }

    fn call(name: &str, arguments: &[Argument<'_>]) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in arguments {
            match argument {
                Argument::List(list) => {
                    for &number in *list {
                        values.push_range(Value::number(number)).unwrap();
                    }
                    values.finish_arg(list.len(), 1).unwrap();
                }
                Argument::Table(list, rows, cols) => {
                    for &number in *list {
                        values.push_range(Value::number(number)).unwrap();
                    }
                    values.finish_arg(*rows, *cols).unwrap();
                }
                Argument::Number(number) => {
                    values.push_scalar(Value::number(*number)).unwrap();
                    values.finish_arg(1, 1).unwrap();
                }
            }
        }

        evaluate(name, &values)
    }

    fn assert_published(name: &str, actual: Value, published: &str) {
        let Value::Number(actual) = actual else {
            panic!("{name} returned {actual:?}");
        };
        let decimals = published
            .split_once('.')
            .map_or(0, |(_, fraction)| fraction.len());
        let tolerance = 10f64.powi(-(decimals as i32));
        let expected: f64 = published.parse().unwrap();

        assert!(
            (actual - expected).abs() <= tolerance,
            "{name}: {actual} != {published}"
        );
    }

    /// Data from the CHITEST example on Microsoft Support, in row order.
    const ACTUAL: &[f64] = &[58.0, 35.0, 11.0, 25.0, 10.0, 23.0];
    const EXPECTED: &[f64] = &[45.35, 47.65, 17.56, 18.44, 16.09, 16.91];

    /// Data from the FTEST, TTEST and ZTEST examples on Microsoft Support.
    const FTEST_FIRST: &[f64] = &[6.0, 7.0, 9.0, 15.0, 21.0];
    const FTEST_SECOND: &[f64] = &[20.0, 28.0, 31.0, 38.0, 40.0];
    const TTEST_FIRST: &[f64] = &[3.0, 4.0, 5.0, 8.0, 9.0, 1.0, 2.0, 4.0, 5.0];
    const TTEST_SECOND: &[f64] = &[6.0, 19.0, 3.0, 2.0, 14.0, 4.0, 5.0, 17.0, 1.0];
    const ZTEST_DATA: &[f64] = &[3.0, 6.0, 7.0, 8.0, 6.0, 5.0, 4.0, 2.0, 1.0, 9.0];

    #[test]
    fn microsoft_published_examples_give_the_excel_results() {
        assert_published(
            "CHITEST",
            call(
                "CHITEST",
                &[
                    Argument::Table(ACTUAL, 3, 2),
                    Argument::Table(EXPECTED, 3, 2),
                ],
            ),
            "0.0003082",
        );
        assert_published(
            "FTEST",
            call(
                "FTEST",
                &[Argument::List(FTEST_FIRST), Argument::List(FTEST_SECOND)],
            ),
            "0.64831785",
        );
        assert_published(
            "TTEST",
            call(
                "TTEST",
                &[
                    Argument::List(TTEST_FIRST),
                    Argument::List(TTEST_SECOND),
                    Argument::Number(2.0),
                    Argument::Number(1.0),
                ],
            ),
            "0.196016",
        );
        assert_published(
            "ZTEST",
            call(
                "ZTEST",
                &[Argument::List(ZTEST_DATA), Argument::Number(4.0)],
            ),
            "0.090574",
        );
        assert_published(
            "ZTEST",
            call(
                "ZTEST",
                &[Argument::List(ZTEST_DATA), Argument::Number(6.0)],
            ),
            "0.863043",
        );
    }

    /// The CHISQ.TEST, F.TEST, T.TEST and Z.TEST pages publish the same
    /// examples as the Excel 2007 names.
    #[test]
    fn current_names_match_their_microsoft_examples() {
        let tables = [
            Argument::Table(ACTUAL, 3, 2),
            Argument::Table(EXPECTED, 3, 2),
        ];
        let pairs = [Argument::List(FTEST_FIRST), Argument::List(FTEST_SECOND)];
        let paired = [
            Argument::List(TTEST_FIRST),
            Argument::List(TTEST_SECOND),
            Argument::Number(2.0),
            Argument::Number(1.0),
        ];
        let sample = [Argument::List(ZTEST_DATA), Argument::Number(6.0)];

        assert_published("CHISQ.TEST", call("CHISQ.TEST", &tables), "0.0003082");
        assert_published("F.TEST", call("F.TEST", &pairs), "0.64831785");
        assert_published("T.TEST", call("T.TEST", &paired), "0.196016");
        assert_published("Z.TEST", call("Z.TEST", &sample), "0.863043");
    }

    #[test]
    fn two_sample_t_tests_use_pooled_and_welch_statistics() {
        // Two samples with means 2 and 5 and variances 1 and 4: the pooled
        // statistic is -3 / sqrt(2.5 * 2 / 3) with 4 degrees of freedom, and
        // Welch's statistic is the same with 2.9411764... degrees of freedom.
        let first = [1.0, 2.0, 3.0];
        let second = [3.0, 5.0, 7.0];
        let statistic = 3.0 / (5.0f64 / 3.0).sqrt();
        let welch_degrees =
            (5.0f64 / 3.0).powi(2) / ((1.0f64 / 3.0).powi(2) / 2.0 + (4.0f64 / 3.0).powi(2) / 2.0);

        for (kind, degrees) in [(2.0, 4.0), (3.0, welch_degrees)] {
            let Value::Number(actual) = call(
                "TTEST",
                &[
                    Argument::List(&first),
                    Argument::List(&second),
                    Argument::Number(2.0),
                    Argument::Number(kind),
                ],
            ) else {
                panic!("TTEST type {kind} returned an error");
            };
            let expected = 2.0 * student_tail(statistic, degrees).unwrap();

            assert!((actual - expected).abs() < 1e-15, "type {kind}");
        }
    }

    #[test]
    fn errors_follow_the_microsoft_remarks() {
        let different_lengths = call(
            "TTEST",
            &[
                Argument::List(&[1.0, 2.0, 3.0]),
                Argument::List(&[1.0, 2.0]),
                Argument::Number(2.0),
                Argument::Number(1.0),
            ],
        );
        assert_eq!(different_lengths, Value::Error(FormulaError::Na));

        for (tails, kind) in [(3.0, 1.0), (2.0, 4.0), (0.0, 2.0)] {
            assert_eq!(
                call(
                    "TTEST",
                    &[
                        Argument::List(TTEST_FIRST),
                        Argument::List(TTEST_SECOND),
                        Argument::Number(tails),
                        Argument::Number(kind),
                    ],
                ),
                Value::Error(FormulaError::Num),
                "tails {tails}, type {kind}"
            );
        }

        assert_eq!(
            call(
                "CHITEST",
                &[
                    Argument::Table(ACTUAL, 3, 2),
                    Argument::Table(EXPECTED, 2, 3)
                ],
            ),
            Value::Error(FormulaError::Na)
        );
        assert_eq!(
            call(
                "FTEST",
                &[Argument::List(&[1.0]), Argument::List(FTEST_SECOND)]
            ),
            Value::Error(FormulaError::DivZero)
        );
        assert_eq!(
            call(
                "FTEST",
                &[Argument::List(&[2.0, 2.0]), Argument::List(FTEST_SECOND)]
            ),
            Value::Error(FormulaError::DivZero)
        );
    }
}
