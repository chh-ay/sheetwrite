//! Rounding, factorial, combinatorics, and sum-of-squares functions.

use super::super::functions::{number_arg, require_arity, FuncAccumulator};
use super::super::value::aggregate_number;
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "CEILING.MATH",
    "COMBIN",
    "COMBINA",
    "FACT",
    "FACTDOUBLE",
    "FLOOR.MATH",
    "MULTINOMIAL",
    "PERMUT",
    "PERMUTATIONA",
    "SERIESSUM",
    "SQRTPI",
    "SUMSQ",
    "SUMX2MY2",
    "SUMX2PY2",
    "SUMXMY2",
];

/// Functions whose arguments are number lists: a single-cell argument is a
/// reference, so text and logical values in that cell are ignored.
pub(crate) const REFERENCE_CELLS: &[&str] = &["MULTINOMIAL", "SUMSQ"];

/// The largest arguments whose results are finite IEEE doubles.
const MAX_FACTORIAL_ARGUMENT: f64 = 170.0;
const MAX_DOUBLE_FACTORIAL_ARGUMENT: f64 = 300.0;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    calculate(name, values).map_or_else(Value::Error, Value::number)
}

fn calculate(name: &str, values: &FuncAccumulator) -> NumberResult {
    match name {
        "FACT" | "FACTDOUBLE" => {
            require_arity(values, 1, 1)?;
            factorial(number_arg(values, 0, None)?, name == "FACTDOUBLE")
        }
        "SQRTPI" => {
            require_arity(values, 1, 1)?;
            let number = number_arg(values, 0, None)?;
            if number < 0.0 {
                return Err(FormulaError::Num);
            }
            Ok((number * std::f64::consts::PI).sqrt())
        }
        "CEILING.MATH" | "FLOOR.MATH" => {
            require_arity(values, 1, 3)?;
            let number = number_arg(values, 0, None)?;
            let significance = number_arg(values, 1, Some(1.0))?.abs();
            let reverses_negative = number_arg(values, 2, Some(0.0))? != 0.0;
            if significance == 0.0 {
                return Ok(0.0);
            }
            let rounds_up = (name == "CEILING.MATH") != (number < 0.0 && reverses_negative);
            let multiples = number / significance;
            Ok(if rounds_up {
                multiples.ceil()
            } else {
                multiples.floor()
            } * significance)
        }
        "COMBIN" | "COMBINA" | "PERMUT" | "PERMUTATIONA" => {
            require_arity(values, 2, 2)?;
            let total = number_arg(values, 0, None)?.trunc();
            let chosen = number_arg(values, 1, None)?.trunc();
            if total < 0.0 || chosen < 0.0 {
                return Err(FormulaError::Num);
            }
            match name {
                "COMBIN" => combinations(total, chosen),
                "COMBINA" if total == 0.0 => {
                    if chosen == 0.0 {
                        Ok(1.0)
                    } else {
                        Err(FormulaError::Num)
                    }
                }
                "COMBINA" => combinations(total + chosen - 1.0, chosen),
                "PERMUT" => permutations(total, chosen),
                _ => Ok(total.powf(chosen)),
            }
        }
        "SUMSQ" | "MULTINOMIAL" => {
            if values.arg_count() == 0 {
                return Err(FormulaError::Value);
            }
            let mut total = 0.0;
            let mut result = if name == "SUMSQ" { 0.0 } else { 1.0 };
            for entry in values.entries() {
                if let Some(number) = aggregate_number(&entry.value, entry.from_range)? {
                    if name == "SUMSQ" {
                        result += number * number;
                    } else {
                        if number < 0.0 {
                            return Err(FormulaError::Num);
                        }
                        let number = number.trunc();
                        total += number;
                        result *= combinations(total, number)?;
                    }
                }
            }
            Ok(result)
        }
        "SUMX2MY2" | "SUMX2PY2" | "SUMXMY2" => {
            require_arity(values, 2, 2)?;
            let left = values.arg(0).ok_or(FormulaError::Value)?;
            let right = values.arg(1).ok_or(FormulaError::Value)?;
            if left.len() != right.len() {
                return Err(FormulaError::Na);
            }
            let mut sum = 0.0;
            for (left, right) in left.iter().zip(right) {
                // Pairs with text, logical values, or empty cells are skipped.
                let (Some(x), Some(y)) = (
                    aggregate_number(&left.value, true)?,
                    aggregate_number(&right.value, true)?,
                ) else {
                    continue;
                };
                sum += match name {
                    "SUMX2MY2" => x * x - y * y,
                    "SUMX2PY2" => x * x + y * y,
                    _ => (x - y) * (x - y),
                };
            }
            Ok(sum)
        }
        "SERIESSUM" => {
            require_arity(values, 4, 4)?;
            let x = number_arg(values, 0, None)?;
            let first_power = number_arg(values, 1, None)?;
            let power_step = number_arg(values, 2, None)?;
            let coefficients = values.arg(3).ok_or(FormulaError::Value)?;
            let mut sum = 0.0;
            for (index, coefficient) in coefficients.iter().enumerate() {
                let coefficient = match coefficient.value {
                    Value::Number(number) => number,
                    Value::Error(error) => return Err(error),
                    _ => return Err(FormulaError::Value),
                };
                sum += coefficient * x.powf(first_power + index as f64 * power_step);
            }
            Ok(sum)
        }
        _ => Err(FormulaError::Name),
    }
}

fn factorial(number: f64, double: bool) -> NumberResult {
    let limit = if double {
        MAX_DOUBLE_FACTORIAL_ARGUMENT
    } else {
        MAX_FACTORIAL_ARGUMENT
    };
    if !(0.0..=limit).contains(&number.trunc()) {
        return Err(FormulaError::Num);
    }
    let step = if double { 2 } else { 1 };
    let mut factor = number.trunc() as usize;
    let mut result = 1.0;
    while factor > 1 {
        result *= factor as f64;
        factor -= step;
    }
    Ok(result)
}

/// Each factor is at least 1, so the product overflows to #NUM! after a few
/// hundred steps at most.
fn combinations(total: f64, chosen: f64) -> NumberResult {
    if chosen > total {
        return Err(FormulaError::Num);
    }
    let chosen = chosen.min(total - chosen);
    let mut result = 1.0;
    for step in 1..=chosen as usize {
        result *= (total - chosen + step as f64) / step as f64;
        if !result.is_finite() {
            return Err(FormulaError::Num);
        }
    }
    Ok(result.round())
}

fn permutations(total: f64, chosen: f64) -> NumberResult {
    if total == 0.0 || chosen > total {
        return Err(FormulaError::Num);
    }
    let mut result = 1.0;
    for step in 0..chosen as usize {
        result *= total - step as f64;
        if !result.is_finite() {
            return Err(FormulaError::Num);
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scalar(name: &str, arguments: &[f64]) -> Value {
        let mut values = FuncAccumulator::default();
        for &argument in arguments {
            values.push_scalar(Value::number(argument)).unwrap();
            values.finish_arg(1, 1).unwrap();
        }
        evaluate(name, &values)
    }

    fn paired(name: &str, left: &[Value], right: &[Value]) -> Value {
        let mut values = FuncAccumulator::default();
        for column in [left, right] {
            for value in column {
                values.push_range(value.clone()).unwrap();
            }
            values.finish_arg(column.len(), 1).unwrap();
        }
        evaluate(name, &values)
    }

    fn assert_close(actual: Value, expected: f64, tolerance: f64) {
        match actual {
            Value::Number(number) => assert!(
                (number - expected).abs() <= tolerance,
                "{number} != {expected}"
            ),
            other => panic!("expected {expected}, got {other:?}"),
        }
    }

    #[test]
    fn microsoft_rounding_examples() {
        // https://support.microsoft.com/en-us/excel/functions/ceiling-math-function
        assert_close(scalar("CEILING.MATH", &[24.3, 5.0]), 25.0, 0.0);
        assert_close(scalar("CEILING.MATH", &[6.7]), 7.0, 0.0);
        assert_close(scalar("CEILING.MATH", &[-8.1, 2.0]), -8.0, 0.0);
        assert_close(scalar("CEILING.MATH", &[-5.5, 2.0, -1.0]), -6.0, 0.0);
        // https://support.microsoft.com/en-us/excel/functions/floor-math-function
        assert_close(scalar("FLOOR.MATH", &[24.3, 5.0]), 20.0, 0.0);
        assert_close(scalar("FLOOR.MATH", &[6.7]), 6.0, 0.0);
        assert_close(scalar("FLOOR.MATH", &[-8.1, 2.0]), -10.0, 0.0);
        assert_close(scalar("FLOOR.MATH", &[-5.5, 2.0, -1.0]), -4.0, 0.0);
        assert_close(scalar("FLOOR.MATH", &[7.0, 0.0]), 0.0, 0.0);
        // https://support.microsoft.com/en-us/excel/functions/sqrtpi-function
        assert_close(scalar("SQRTPI", &[1.0]), 1.772454, 1e-6);
        assert_close(scalar("SQRTPI", &[2.0]), 2.506628, 1e-6);
        assert_eq!(scalar("SQRTPI", &[-1.0]), Value::Error(FormulaError::Num));
    }

    #[test]
    fn microsoft_factorial_and_combinatorics_examples() {
        // https://support.microsoft.com/en-us/excel/functions/fact-function
        for (argument, expected) in [(5.0, 120.0), (1.9, 1.0), (0.0, 1.0), (1.0, 1.0)] {
            assert_close(scalar("FACT", &[argument]), expected, 0.0);
        }
        assert_eq!(scalar("FACT", &[-1.0]), Value::Error(FormulaError::Num));
        // https://support.microsoft.com/en-us/excel/functions/factdouble-function
        assert_close(scalar("FACTDOUBLE", &[6.0]), 48.0, 0.0);
        assert_close(scalar("FACTDOUBLE", &[7.0]), 105.0, 0.0);
        // https://support.microsoft.com/en-us/excel/functions/combin-function
        assert_close(scalar("COMBIN", &[8.0, 2.0]), 28.0, 0.0);
        assert_eq!(
            scalar("COMBIN", &[2.0, 3.0]),
            Value::Error(FormulaError::Num)
        );
        // https://support.microsoft.com/en-us/excel/functions/combina-function
        assert_close(scalar("COMBINA", &[4.0, 3.0]), 20.0, 0.0);
        assert_close(scalar("COMBINA", &[10.0, 3.0]), 220.0, 0.0);
        // https://support.microsoft.com/en-us/excel/functions/permut-function
        assert_close(scalar("PERMUT", &[100.0, 3.0]), 970_200.0, 0.0);
        assert_close(scalar("PERMUT", &[3.0, 2.0]), 6.0, 0.0);
        assert_eq!(
            scalar("PERMUT", &[2.0, 3.0]),
            Value::Error(FormulaError::Num)
        );
        // https://support.microsoft.com/en-us/excel/functions/permutationa-function
        assert_close(scalar("PERMUTATIONA", &[3.0, 2.0]), 9.0, 0.0);
        assert_close(scalar("PERMUTATIONA", &[2.0, 2.0]), 4.0, 0.0);
        // https://support.microsoft.com/en-us/excel/functions/multinomial-function
        assert_close(scalar("MULTINOMIAL", &[2.0, 3.0, 4.0]), 1260.0, 0.0);
        assert_eq!(
            scalar("MULTINOMIAL", &[-1.0]),
            Value::Error(FormulaError::Num)
        );
    }

    #[test]
    fn results_beyond_double_range_are_num_errors() {
        assert_close(scalar("FACT", &[170.0]), 7.257_415_615_307_999e306, 1e293);
        assert_eq!(scalar("FACT", &[171.0]), Value::Error(FormulaError::Num));
        assert_eq!(
            scalar("FACTDOUBLE", &[301.0]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            scalar("COMBIN", &[1e9, 5e8]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            scalar("PERMUT", &[1e9, 1e6]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            scalar("PERMUTATIONA", &[10.0, 400.0]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(scalar("FACT", &[]), Value::Error(FormulaError::Value));
    }

    #[test]
    fn microsoft_sum_of_squares_examples() {
        // https://support.microsoft.com/en-us/excel/functions/sumsq-function
        assert_close(scalar("SUMSQ", &[3.0, 4.0]), 25.0, 0.0);
        // https://support.microsoft.com/en-us/excel/functions/sumx2my2-function
        // https://support.microsoft.com/en-us/excel/functions/sumx2py2-function
        // https://support.microsoft.com/en-us/excel/functions/sumxmy2-function
        let left = [2.0, 3.0, 9.0, 1.0, 8.0, 7.0, 5.0].map(Value::number);
        let right = [6.0, 5.0, 11.0, 7.0, 5.0, 4.0, 4.0].map(Value::number);
        assert_close(paired("SUMX2MY2", &left, &right), -55.0, 0.0);
        assert_close(paired("SUMX2PY2", &left, &right), 521.0, 0.0);
        assert_close(paired("SUMXMY2", &left, &right), 79.0, 0.0);
        let with_text = [Value::number(2.0), Value::text("skip")];
        let numbers = [Value::number(6.0), Value::number(5.0)];
        assert_close(paired("SUMXMY2", &with_text, &numbers), 16.0, 0.0);
        assert_eq!(
            paired("SUMXMY2", &left, &right[..6]),
            Value::Error(FormulaError::Na)
        );
    }

    #[test]
    fn microsoft_series_example_approximates_cosine() {
        // https://support.microsoft.com/en-us/excel/functions/seriessum-function
        let mut values = FuncAccumulator::default();
        for number in [std::f64::consts::FRAC_PI_4, 0.0, 2.0] {
            values.push_scalar(Value::number(number)).unwrap();
            values.finish_arg(1, 1).unwrap();
        }
        for coefficient in [1.0, -1.0 / 2.0, 1.0 / 24.0, -1.0 / 720.0] {
            values.push_range(Value::number(coefficient)).unwrap();
        }
        values.finish_arg(4, 1).unwrap();
        assert_close(evaluate("SERIESSUM", &values), 0.707103, 1e-6);
    }
}
