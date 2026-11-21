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

const fn ensure(is_valid: bool) -> Result<(), FormulaError> {
    if is_valid {
        Ok(())
    } else {
        Err(FormulaError::Num)
    }
}

#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "the last function of the group takes the fallback arm; listing the 200 other Func variants adds nothing"
)]
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
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "the last function of the group takes the fallback arm; listing the 200 other Func variants adds nothing"
)]
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

/// `ATAN2(x_num`, `y_num)`: the angle of the point (x, y), from -pi to pi. The
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
