//! Trigonometric, hyperbolic and angle functions. Angles are in radians.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::super::functions::{number_arg, require_arity, FuncAccumulator};

/// COT, CSC, SEC, COTH, CSCH and SECH need an absolute value below 2^27,
/// as their Microsoft Support pages say.
const RECIPROCAL_LIMIT: f64 = 134_217_728.0;

type NumberResult = Result<f64, FormulaError>;

pub(in crate::eval) fn apply(func: Func, values: &FuncAccumulator) -> EvalResult {
    let result = if func == Func::Atan2 {
        point_angle(values)
    } else {
        require_arity(values, 1, 1)
            .and_then(|_| number_arg(values, 0, None))
            .and_then(|number| unary(func, number))
    };

    match result {
        Ok(number) if number.is_finite() => Value::number(number),
        Ok(_) => Value::Error(FormulaError::Num),
        Err(error) => Value::Error(error),
    }
}

fn ensure(is_valid: bool) -> Result<(), FormulaError> {
    if is_valid {
        Ok(())
    } else {
        Err(FormulaError::Num)
    }
}

fn unary(func: Func, number: f64) -> NumberResult {
    match func {
        Func::Sin => Ok(number.sin()),
        Func::Cos => Ok(number.cos()),
        Func::Tan => Ok(number.tan()),
        Func::Asin | Func::Acos => {
            ensure((-1.0..=1.0).contains(&number))?;

            Ok(if func == Func::Asin {
                number.asin()
            } else {
                number.acos()
            })
        }
        Func::Atan => Ok(number.atan()),
        // The arccotangent is between 0 and pi.
        Func::Acot => Ok(std::f64::consts::FRAC_PI_2 - number.atan()),
        Func::Sinh => Ok(number.sinh()),
        Func::Cosh => Ok(number.cosh()),
        Func::Tanh => Ok(number.tanh()),
        Func::Asinh => Ok(number.asinh()),
        Func::Acosh => {
            ensure(number >= 1.0)?;

            Ok(number.acosh())
        }
        Func::Atanh => {
            ensure(number.abs() < 1.0)?;

            Ok(number.atanh())
        }
        Func::Acoth => {
            ensure(number.abs() > 1.0)?;

            // ln((x + 1) / (x - 1)) / 2, written with ln_1p for precision
            // when x is large.
            Ok((2.0 / (number - 1.0)).ln_1p() / 2.0)
        }
        Func::Degrees => Ok(number.to_degrees()),
        Func::Radians => Ok(number.to_radians()),
        _ => reciprocal(func, number),
    }
}

/// COT, CSC, SEC, COTH, CSCH and SECH: one over TAN, SIN, COS, TANH, SINH
/// and COSH. A zero denominator is `#DIV/0!`.
fn reciprocal(func: Func, number: f64) -> NumberResult {
    ensure(number.abs() < RECIPROCAL_LIMIT)?;

    let denominator = match func {
        Func::Cot => number.tan(),
        Func::Csc => number.sin(),
        Func::Sec => number.cos(),
        Func::Coth => number.tanh(),
        Func::Csch => number.sinh(),
        _ => number.cosh(),
    };

    if denominator == 0.0 {
        return Err(FormulaError::DivZero);
    }

    Ok(1.0 / denominator)
}

/// ATAN2(x_num, y_num): the angle of the point (x, y), from -pi to pi. The
/// origin is `#DIV/0!`.
fn point_angle(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 2, 2)?;

    let x = number_arg(values, 0, None)?;
    let y = number_arg(values, 1, None)?;

    if x == 0.0 && y == 0.0 {
        return Err(FormulaError::DivZero);
    }

    Ok(y.atan2(x))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(func: Func, arguments: &[f64]) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in arguments {
            values.push_scalar(Value::Number(*argument)).unwrap();
            values.finish_arg(1, 1).unwrap();
        }

        apply(func, &values)
    }

    /// The example table of each function's Microsoft Support page,
    /// `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    /// The page rounds each result, so the check uses the published number
    /// of decimal places.
    #[test]
    fn microsoft_published_examples() {
        let pi = std::f64::consts::PI;
        let examples: &[(Func, &[f64], &str)] = &[
            (Func::Acos, &[-0.5], "2.094395102"),
            (Func::Acosh, &[1.0], "0"),
            (Func::Acosh, &[10.0], "2.9932228"),
            (Func::Acot, &[2.0], "0.4636"),
            (Func::Acoth, &[6.0], "0.168"),
            (Func::Asin, &[-0.5], "-0.523598776"),
            (Func::Asinh, &[-2.5], "-1.647231146"),
            (Func::Asinh, &[10.0], "2.99822295"),
            (Func::Atan, &[1.0], "0.785398163"),
            (Func::Atan2, &[1.0, 1.0], "0.785398163"),
            (Func::Atan2, &[-1.0, -1.0], "-2.35619449"),
            (Func::Atanh, &[0.76159416], "1.00000001"),
            (Func::Atanh, &[-0.1], "-0.100335348"),
            (Func::Cos, &[1.047], "0.5001711"),
            (Func::Cos, &[60.0 * pi / 180.0], "0.5"),
            (Func::Cosh, &[4.0], "27.308233"),
            (Func::Cosh, &[std::f64::consts::E], "7.6101251"),
            (Func::Cot, &[30.0], "-0.156"),
            (Func::Cot, &[45.0], "0.617"),
            (Func::Coth, &[2.0], "1.037"),
            (Func::Csc, &[15.0], "1.538"),
            (Func::Csch, &[1.5], "0.4696"),
            (Func::Degrees, &[pi], "180"),
            (Func::Radians, &[270.0], "4.712389"),
            (Func::Sec, &[45.0], "1.90359"),
            (Func::Sec, &[30.0], "6.48292"),
            (Func::Sin, &[pi], "0.0"),
            (Func::Sin, &[pi / 2.0], "1.0"),
            (Func::Sin, &[30.0 * pi / 180.0], "0.5"),
            (Func::Tan, &[0.785], "0.99920"),
            (Func::Tan, &[45.0 * pi / 180.0], "1"),
            (Func::Tanh, &[-2.0], "-0.964028"),
            (Func::Tanh, &[0.0], "0"),
            (Func::Tanh, &[0.5], "0.462117"),
        ];

        for (func, arguments, published) in examples {
            let decimals = published.split_once('.').map_or(0, |(_, part)| part.len());
            let tolerance = 0.5 * 10f64.powi(-(decimals as i32));
            let expected: f64 = published.parse().unwrap();
            let Value::Number(actual) = call(*func, arguments) else {
                panic!("{func:?}{arguments:?} is not a number");
            };

            assert!(
                (actual - expected).abs() <= tolerance,
                "{func:?}{arguments:?}: {actual} is not {published}"
            );
        }
    }

    /// The SECH examples are 5.73E-20 and 1.87E-13: three significant digits.
    #[test]
    fn hyperbolic_secant_keeps_tiny_results() {
        for (argument, published) in [(45.0, 5.73e-20), (30.0, 1.87e-13)] {
            let Value::Number(actual) = call(Func::Sech, &[argument]) else {
                panic!("SECH({argument}) is not a number");
            };

            assert!(((actual - published) / published).abs() < 5e-3);
        }
    }

    #[test]
    fn domain_errors_follow_the_microsoft_remarks() {
        let cases: &[(Func, &[f64], FormulaError)] = &[
            (Func::Acos, &[1.5], FormulaError::Num),
            (Func::Asin, &[-1.5], FormulaError::Num),
            (Func::Acosh, &[0.5], FormulaError::Num),
            (Func::Atanh, &[1.0], FormulaError::Num),
            (Func::Acoth, &[0.5], FormulaError::Num),
            (Func::Acoth, &[-1.0], FormulaError::Num),
            (Func::Atan2, &[0.0, 0.0], FormulaError::DivZero),
            (Func::Cot, &[0.0], FormulaError::DivZero),
            (Func::Csc, &[0.0], FormulaError::DivZero),
            (Func::Coth, &[0.0], FormulaError::DivZero),
            (Func::Csch, &[0.0], FormulaError::DivZero),
            (Func::Cot, &[RECIPROCAL_LIMIT], FormulaError::Num),
            (Func::Sec, &[-RECIPROCAL_LIMIT], FormulaError::Num),
            (Func::Sech, &[RECIPROCAL_LIMIT], FormulaError::Num),
            (Func::Sinh, &[1000.0], FormulaError::Num),
            (Func::Cosh, &[-1000.0], FormulaError::Num),
        ];

        for (func, arguments, error) in cases {
            assert_eq!(
                call(*func, arguments),
                Value::Error(*error),
                "{func:?}{arguments:?}"
            );
        }
    }
}
