//! Complex numbers in Excel's text form, such as `3+4i` or `-2.5j`:
//! `COMPLEX` and the `IM*` functions.
//!
//! Each part of a result is written with 15 significant digits, as Excel
//! writes numbers as text. A result uses the suffix of its arguments, or `i`
//! when no argument has one.

use super::super::functions::{number_arg, require_arity, text_arg, FuncAccumulator};
use super::super::lift::ValueArgs;
use super::super::number_format::general_text;
use crate::types::{EvalResult, FormulaError, Value};

family_functions! {
    COMPLEX,
    IMABS,
    IMAGINARY,
    IMARGUMENT,
    IMCONJUGATE,
    IMCOS,
    IMCOSH,
    IMCOT,
    IMCSC,
    IMCSCH,
    IMDIV,
    IMEXP,
    IMLN,
    IMLOG10,
    IMLOG2,
    IMPOWER,
    IMPRODUCT,
    IMREAL,
    IMSEC,
    IMSECH,
    IMSIN,
    IMSINH,
    IMSQRT,
    IMSUB,
    IMSUM,
    IMTAN,
}

/// The arguments of `function` that take one value: every argument, except
/// those of IMPRODUCT and IMSUM, which take ranges and arrays.
pub(super) const fn value_args(function: Function) -> ValueArgs {
    match function {
        Function::IMPRODUCT | Function::IMSUM => ValueArgs::NONE,
        Function::COMPLEX
        | Function::IMABS
        | Function::IMAGINARY
        | Function::IMARGUMENT
        | Function::IMCONJUGATE
        | Function::IMCOS
        | Function::IMCOSH
        | Function::IMCOT
        | Function::IMCSC
        | Function::IMCSCH
        | Function::IMDIV
        | Function::IMEXP
        | Function::IMLN
        | Function::IMLOG10
        | Function::IMLOG2
        | Function::IMPOWER
        | Function::IMREAL
        | Function::IMSEC
        | Function::IMSECH
        | Function::IMSIN
        | Function::IMSINH
        | Function::IMSQRT
        | Function::IMSUB
        | Function::IMTAN => ValueArgs::ALL,
    }
}

/// Excel accepts at most 255 arguments.
const MAX_ARGUMENTS: usize = 255;

const DEFAULT_SUFFIX: char = 'i';

#[derive(Clone, Copy, Debug, PartialEq)]
struct Complex {
    re: f64,
    im: f64,
}

impl Complex {
    const ZERO: Self = Self { re: 0.0, im: 0.0 };
    const ONE: Self = Self { re: 1.0, im: 0.0 };

    const fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    fn is_zero(self) -> bool {
        self.re == 0.0 && self.im == 0.0
    }

    /// sqrt(re^2 + im^2), computed directly to avoid `hypot`, which would add
    /// its own routine to the binary. The squares overflow when a part is
    /// above about 1E154, so the result is then infinite.
    fn modulus(self) -> f64 {
        (self.re * self.re + self.im * self.im).sqrt()
    }

    fn argument(self) -> f64 {
        self.im.atan2(self.re)
    }

    fn add(self, other: Self) -> Self {
        Self::new(self.re + other.re, self.im + other.im)
    }

    fn subtract(self, other: Self) -> Self {
        Self::new(self.re - other.re, self.im - other.im)
    }

    fn multiply(self, other: Self) -> Self {
        Self::new(
            self.re * other.re - self.im * other.im,
            self.re * other.im + self.im * other.re,
        )
    }

    fn divide(self, divisor: Self) -> Result<Self, FormulaError> {
        let scale = divisor.re * divisor.re + divisor.im * divisor.im;

        if scale == 0.0 {
            return Err(FormulaError::Num);
        }

        Ok(Self::new(
            (self.re * divisor.re + self.im * divisor.im) / scale,
            (self.im * divisor.re - self.re * divisor.im) / scale,
        ))
    }

    fn reciprocal(self) -> Result<Self, FormulaError> {
        Self::ONE.divide(self)
    }

    fn from_polar(modulus: f64, angle: f64) -> Self {
        Self::new(modulus * angle.cos(), modulus * angle.sin())
    }

    fn exp(self) -> Self {
        Self::from_polar(self.re.exp(), self.im)
    }

    fn ln(self) -> Result<Self, FormulaError> {
        if self.is_zero() {
            return Err(FormulaError::Num);
        }

        Ok(Self::new(self.modulus().ln(), self.argument()))
    }

    /// sin(a + bi) = sin a cosh b + i cos a sinh b.
    fn sin(self) -> Self {
        let (sinh, cosh) = hyperbolic(self.im);

        Self::new(self.re.sin() * cosh, self.re.cos() * sinh)
    }

    /// cos(a + bi) = cos a cosh b - i sin a sinh b.
    fn cos(self) -> Self {
        let (sinh, cosh) = hyperbolic(self.im);

        Self::new(self.re.cos() * cosh, -self.re.sin() * sinh)
    }

    /// sinh z = -i sin(iz).
    fn sinh(self) -> Self {
        let rotated = Self::new(-self.im, self.re).sin();

        Self::new(rotated.im, -rotated.re)
    }

    /// cosh z = cos(iz).
    fn cosh(self) -> Self {
        Self::new(-self.im, self.re).cos()
    }

    /// Polar form: |z|^n (cos n arg z + i sin n arg z).
    fn power(self, exponent: f64) -> Result<Self, FormulaError> {
        if self.is_zero() {
            return if exponent > 0.0 {
                Ok(Self::ZERO)
            } else {
                Err(FormulaError::Num)
            };
        }

        Ok(Self::from_polar(
            self.modulus().powf(exponent),
            self.argument() * exponent,
        ))
    }

    const fn is_finite(self) -> bool {
        self.re.is_finite() && self.im.is_finite()
    }
}

/// sinh x and cosh x from `exp_m1`, which keeps sinh precise near zero and
/// is already in the engine.
fn hyperbolic(x: f64) -> (f64, f64) {
    let up = x.exp_m1();
    let down = (-x).exp_m1();

    ((up - down) / 2.0, (up + down) / 2.0 + 1.0)
}

/// The imaginary unit suffix that the arguments of one call use.
struct Suffix(Option<char>);

impl Suffix {
    /// Records a suffix. Arguments with different suffixes are `#VALUE!`.
    const fn merge(&mut self, suffix: Option<char>) -> Result<(), FormulaError> {
        match (self.0, suffix) {
            (Some(current), Some(next)) if current != next => Err(FormulaError::Value),
            (None, Some(next)) => {
                self.0 = Some(next);
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn letter(&self) -> char {
        self.0.unwrap_or(DEFAULT_SUFFIX)
    }
}

pub(crate) fn evaluate(function: Function, values: &FuncAccumulator) -> EvalResult {
    calculate(function, values).unwrap_or_else(Value::Error)
}

fn calculate(function: Function, values: &FuncAccumulator) -> Result<Value, FormulaError> {
    match function {
        Function::COMPLEX => complex(values),
        Function::IMSUM | Function::IMPRODUCT => fold(function == Function::IMSUM, values),
        Function::IMSUB | Function::IMDIV => binary(function == Function::IMSUB, values),
        Function::IMPOWER => {
            require_arity(values, 2, 2)?;
            let (base, suffix) = argument(values, 0)?;
            let exponent = number_arg(values, 1, None)?;

            complex_result(base.power(exponent)?, &suffix)
        }
        Function::IMABS | Function::IMAGINARY | Function::IMARGUMENT | Function::IMREAL => {
            require_arity(values, 1, 1)?;
            let (number, _) = argument(values, 0)?;

            real_part(function, number)
        }
        Function::IMCONJUGATE
        | Function::IMCOS
        | Function::IMCOSH
        | Function::IMCOT
        | Function::IMCSC
        | Function::IMCSCH
        | Function::IMEXP
        | Function::IMLN
        | Function::IMLOG10
        | Function::IMLOG2
        | Function::IMSEC
        | Function::IMSECH
        | Function::IMSIN
        | Function::IMSINH
        | Function::IMSQRT
        | Function::IMTAN => {
            require_arity(values, 1, 1)?;
            let (number, suffix) = argument(values, 0)?;

            complex_result(unary(function, number)?, &suffix)
        }
    }
}

/// `COMPLEX(real_num, i_num, [suffix])`.
fn complex(values: &FuncAccumulator) -> Result<Value, FormulaError> {
    require_arity(values, 2, 3)?;
    let re = number_arg(values, 0, None)?;
    let im = number_arg(values, 1, None)?;
    let suffix = match text_arg(values, 2, Some(""))?.as_ref() {
        "" | "i" => 'i',
        "j" => 'j',
        _ => return Err(FormulaError::Value),
    };

    complex_result(Complex::new(re, im), &Suffix(Some(suffix)))
}

/// `IMSUM` and `IMPRODUCT`: every argument, including cells of ranges.
/// Blank cells in a range are skipped.
fn fold(is_sum: bool, values: &FuncAccumulator) -> Result<Value, FormulaError> {
    require_arity(values, 1, MAX_ARGUMENTS)?;
    let mut suffix = Suffix(None);
    let mut result = if is_sum { Complex::ZERO } else { Complex::ONE };

    for entry in values.entries() {
        if entry.from_range && entry.value == Value::Blank {
            continue;
        }

        let (number, entry_suffix) = parse_value(&entry.value)?;
        suffix.merge(entry_suffix)?;
        result = if is_sum {
            result.add(number)
        } else {
            result.multiply(number)
        };
    }

    complex_result(result, &suffix)
}

/// `IMSUB(inumber1, inumber2)` and `IMDIV(inumber1, inumber2)`.
fn binary(is_subtract: bool, values: &FuncAccumulator) -> Result<Value, FormulaError> {
    require_arity(values, 2, 2)?;
    let (left, mut suffix) = argument(values, 0)?;
    let (right, right_suffix) = argument(values, 1)?;
    suffix.merge(right_suffix.0)?;

    let result = if is_subtract {
        left.subtract(right)
    } else {
        left.divide(right)?
    };

    complex_result(result, &suffix)
}

/// The functions that return one real number.
fn real_part(function: Function, number: Complex) -> Result<Value, FormulaError> {
    let result = if function == Function::IMABS {
        number.modulus()
    } else if function == Function::IMAGINARY {
        number.im
    } else if function == Function::IMREAL {
        number.re
    } else if number.is_zero() {
        return Err(FormulaError::DivZero);
    } else {
        number.argument()
    };

    Ok(Value::number(result))
}

/// The functions of one complex number that return a complex number.
fn unary(function: Function, number: Complex) -> Result<Complex, FormulaError> {
    Ok(match function {
        Function::IMCONJUGATE => Complex::new(number.re, -number.im),
        Function::IMCOS => number.cos(),
        Function::IMCOSH => number.cosh(),
        Function::IMCOT => number.cos().divide(number.sin())?,
        Function::IMCSC => number.sin().reciprocal()?,
        Function::IMCSCH => number.sinh().reciprocal()?,
        Function::IMEXP => number.exp(),
        Function::IMLN => number.ln()?,
        Function::IMLOG10 => scale(number.ln()?, std::f64::consts::LOG10_E),
        Function::IMLOG2 => scale(number.ln()?, std::f64::consts::LOG2_E),
        Function::IMSEC => number.cos().reciprocal()?,
        Function::IMSECH => number.cosh().reciprocal()?,
        Function::IMSIN => number.sin(),
        Function::IMSINH => number.sinh(),
        Function::IMSQRT => number.power(0.5)?,
        Function::IMTAN => number.sin().divide(number.cos())?,
        Function::COMPLEX
        | Function::IMABS
        | Function::IMAGINARY
        | Function::IMARGUMENT
        | Function::IMDIV
        | Function::IMPOWER
        | Function::IMPRODUCT
        | Function::IMREAL
        | Function::IMSUB
        | Function::IMSUM => return Err(FormulaError::Name),
    })
}

fn scale(number: Complex, factor: f64) -> Complex {
    Complex::new(number.re * factor, number.im * factor)
}

/// The complex number argument at `index` and its suffix.
fn argument(values: &FuncAccumulator, index: usize) -> Result<(Complex, Suffix), FormulaError> {
    let value = values.arg_value(index).unwrap_or(&Value::Blank);
    let (number, suffix) = parse_value(value)?;

    Ok((number, Suffix(suffix)))
}

fn parse_value(value: &Value) -> Result<(Complex, Option<char>), FormulaError> {
    match value {
        Value::Number(number) => Ok((Complex::new(*number, 0.0), None)),
        Value::Text(text) => parse(text),
        Value::Blank => Ok((Complex::ZERO, None)),
        Value::Bool(_) => Err(FormulaError::Value),
        Value::Error(error) => Err(*error),
    }
}

/// Reads `a`, `bi`, `a+bi` or `a-bi`, with `i` or `j`. A coefficient of 1
/// may be left out: `i`, `-j`, `3+i`. Other text is `#NUM!`.
fn parse(text: &str) -> Result<(Complex, Option<char>), FormulaError> {
    if text.is_empty() {
        return Ok((Complex::ZERO, None));
    }

    let Some(body) = text.strip_suffix(['i', 'j']) else {
        return Ok((Complex::new(parse_real(text)?, 0.0), None));
    };
    let suffix = text.chars().next_back();

    // The imaginary part starts at the last sign that is not the first
    // character and not part of an exponent.
    let split = body
        .char_indices()
        .filter(|&(index, character)| {
            index > 0
                && matches!(character, '+' | '-')
                && !matches!(body.as_bytes()[index - 1], b'e' | b'E')
        })
        .map(|(index, _)| index)
        .next_back();

    let (re, im) = match split {
        Some(index) => (
            parse_real(&body[..index])?,
            parse_coefficient(&body[index..])?,
        ),
        None => (0.0, parse_coefficient(body)?),
    };

    Ok((Complex::new(re, im), suffix))
}

/// An imaginary coefficient; a bare sign or nothing means 1.
fn parse_coefficient(text: &str) -> Result<f64, FormulaError> {
    match text {
        "" | "+" => Ok(1.0),
        "-" => Ok(-1.0),
        _ => parse_real(text),
    }
}

/// A plain decimal number with an optional sign and exponent.
fn parse_real(text: &str) -> Result<f64, FormulaError> {
    let is_plain = !text.is_empty()
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'.' | b'+' | b'-' | b'e' | b'E'));

    if !is_plain {
        return Err(FormulaError::Num);
    }

    text.parse::<f64>()
        .ok()
        .filter(|number| number.is_finite())
        .ok_or(FormulaError::Num)
}

fn complex_result(number: Complex, suffix: &Suffix) -> Result<Value, FormulaError> {
    if !number.is_finite() {
        return Err(FormulaError::Num);
    }

    Ok(Value::text(format_complex(number, suffix.letter())))
}

/// Writes `a+bi`, leaving out a zero part and a coefficient of 1.
fn format_complex(number: Complex, suffix: char) -> String {
    let real = general_text(number.re);
    let imaginary = general_text(number.im);

    if number.im == 0.0 {
        return real;
    }

    let coefficient = match imaginary.as_str() {
        "1" => String::new(),
        "-1" => "-".to_owned(),
        _ => imaginary,
    };

    if number.re == 0.0 {
        return format!("{coefficient}{suffix}");
    }

    let sign = if number.im > 0.0 { "+" } else { "" };

    format!("{real}{sign}{coefficient}{suffix}")
}
