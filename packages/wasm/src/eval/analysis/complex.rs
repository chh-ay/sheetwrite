//! Complex numbers in Excel's text form, such as `3+4i` or `-2.5j`:
//! `COMPLEX` and the `IM*` functions.
//!
//! Each part of a result is written with 15 significant digits, as Excel
//! writes numbers as text. A result uses the suffix of its arguments, or `i`
//! when no argument has one.

use super::super::functions::{number_arg, require_arity, text_arg, FuncAccumulator};
use super::super::number_format::general_text;
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "COMPLEX",
    "IMABS",
    "IMAGINARY",
    "IMARGUMENT",
    "IMCONJUGATE",
    "IMCOS",
    "IMCOSH",
    "IMCOT",
    "IMCSC",
    "IMCSCH",
    "IMDIV",
    "IMEXP",
    "IMLN",
    "IMLOG10",
    "IMLOG2",
    "IMPOWER",
    "IMPRODUCT",
    "IMREAL",
    "IMSEC",
    "IMSECH",
    "IMSIN",
    "IMSINH",
    "IMSQRT",
    "IMSUB",
    "IMSUM",
    "IMTAN",
];

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

    fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    fn is_zero(self) -> bool {
        self.re == 0.0 && self.im == 0.0
    }

    /// sqrt(re^2 + im^2). The engine already carries `sqrt`, while `hypot`
    /// would add its own routine for parts above 1E154.
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

    fn is_finite(self) -> bool {
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
    fn merge(&mut self, suffix: Option<char>) -> Result<(), FormulaError> {
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

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    calculate(name, values).unwrap_or_else(Value::Error)
}

fn calculate(name: &str, values: &FuncAccumulator) -> Result<Value, FormulaError> {
    match name {
        "COMPLEX" => complex(values),
        "IMSUM" | "IMPRODUCT" => fold(name == "IMSUM", values),
        "IMSUB" | "IMDIV" => binary(name == "IMSUB", values),
        "IMPOWER" => {
            require_arity(values, 2, 2)?;
            let (base, suffix) = argument(values, 0)?;
            let exponent = number_arg(values, 1, None)?;

            complex_result(base.power(exponent)?, &suffix)
        }
        "IMABS" | "IMAGINARY" | "IMARGUMENT" | "IMREAL" => {
            require_arity(values, 1, 1)?;
            let (number, _) = argument(values, 0)?;

            real_part(name, number)
        }
        _ => {
            require_arity(values, 1, 1)?;
            let (number, suffix) = argument(values, 0)?;

            complex_result(unary(name, number)?, &suffix)
        }
    }
}

/// `COMPLEX(real_num, i_num, [suffix])`.
fn complex(values: &FuncAccumulator) -> Result<Value, FormulaError> {
    require_arity(values, 2, 3)?;
    let re = number_arg(values, 0, None)?;
    let im = number_arg(values, 1, None)?;
    let suffix = match text_arg(values, 2, Some(""))?.as_str() {
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
fn real_part(name: &str, number: Complex) -> Result<Value, FormulaError> {
    let result = match name {
        "IMABS" => number.modulus(),
        "IMAGINARY" => number.im,
        "IMREAL" => number.re,
        _ if number.is_zero() => return Err(FormulaError::DivZero),
        _ => number.argument(),
    };

    Ok(Value::number(result))
}

/// The functions of one complex number that return a complex number.
fn unary(name: &str, number: Complex) -> Result<Complex, FormulaError> {
    Ok(match name {
        "IMCONJUGATE" => Complex::new(number.re, -number.im),
        "IMCOS" => number.cos(),
        "IMCOSH" => number.cosh(),
        "IMCOT" => number.cos().divide(number.sin())?,
        "IMCSC" => number.sin().reciprocal()?,
        "IMCSCH" => number.sinh().reciprocal()?,
        "IMEXP" => number.exp(),
        "IMLN" => number.ln()?,
        "IMLOG10" => scale(number.ln()?, std::f64::consts::LOG10_E),
        "IMLOG2" => scale(number.ln()?, std::f64::consts::LOG2_E),
        "IMSEC" => number.cos().reciprocal()?,
        "IMSECH" => number.cosh().reciprocal()?,
        "IMSIN" => number.sin(),
        "IMSINH" => number.sinh(),
        "IMSQRT" => number.power(0.5)?,
        "IMTAN" => number.sin().divide(number.cos())?,
        _ => return Err(FormulaError::Name),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn call(name: &str, arguments: &[Value]) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in arguments {
            values.push_scalar(argument.clone()).unwrap();
            values.finish_arg(1, 1).unwrap();
        }

        evaluate(name, &values)
    }

    fn text(value: &str) -> Value {
        Value::text(value)
    }

    fn number(value: f64) -> Value {
        Value::Number(value)
    }

    /// Results from the "Example" table of each Microsoft Support page,
    /// `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    #[test]
    fn microsoft_published_exact_examples() {
        for (name, arguments, expected) in [
            ("COMPLEX", vec![number(3.0), number(4.0)], text("3+4i")),
            (
                "COMPLEX",
                vec![number(3.0), number(4.0), text("j")],
                text("3+4j"),
            ),
            ("COMPLEX", vec![number(0.0), number(1.0)], text("i")),
            ("COMPLEX", vec![number(1.0), number(0.0)], text("1")),
            ("IMABS", vec![text("5+12i")], number(13.0)),
            ("IMAGINARY", vec![text("3+4i")], number(4.0)),
            ("IMAGINARY", vec![text("0-j")], number(-1.0)),
            ("IMAGINARY", vec![number(4.0)], number(0.0)),
            ("IMCONJUGATE", vec![text("3+4i")], text("3-4i")),
            (
                "IMDIV",
                vec![text("-238+240i"), text("10+24i")],
                text("5+12i"),
            ),
            (
                "IMPRODUCT",
                vec![text("3+4i"), text("5-3i")],
                text("27+11i"),
            ),
            (
                "IMPRODUCT",
                vec![text("1+2i"), number(30.0)],
                text("30+60i"),
            ),
            ("IMREAL", vec![text("6-9i")], number(6.0)),
            ("IMSUB", vec![text("13+4i"), text("5+3i")], text("8+i")),
            ("IMSUM", vec![text("3+4i"), text("5-3i")], text("8+i")),
        ] {
            assert_eq!(call(name, &arguments), expected, "{name}{arguments:?}");
        }
    }

    /// Parses `a+bi` text for a numeric comparison.
    fn parts(value: &Value) -> Complex {
        let Value::Text(text) = value else {
            panic!("expected complex text, got {value:?}");
        };

        parse(text).unwrap().0
    }

    /// Published examples with 15 significant digits. The last digit can
    /// differ with the order of floating-point operations, so the parts are
    /// compared to 14 significant digits.
    #[test]
    fn microsoft_published_rounded_examples() {
        for (name, arguments, published) in [
            (
                "IMCOS",
                vec![text("1+i")],
                "0.833730025131149-0.988897705762865i",
            ),
            (
                "IMCOSH",
                vec![text("4+3i")],
                "-27.0349456030742+3.85115333481178i",
            ),
            (
                "IMCOT",
                vec![text("4+3i")],
                "0.0049011823943045-0.999266927805902i",
            ),
            (
                "IMCSC",
                vec![text("4+3i")],
                "-0.0754898329158637+0.0648774713706355i",
            ),
            (
                "IMEXP",
                vec![text("1+i")],
                "1.46869393991589+2.28735528717884i",
            ),
            (
                "IMLN",
                vec![text("3+4i")],
                "1.6094379124341+0.927295218001612i",
            ),
            (
                "IMLOG10",
                vec![text("3+4i")],
                "0.698970004336019+0.402719196273373i",
            ),
            (
                "IMLOG2",
                vec![text("3+4i")],
                "2.32192809488736+1.33780421245098i",
            ),
            (
                "IMPOWER",
                vec![text("2+3i"), number(3.0)],
                "-46+9.00000000000001i",
            ),
            (
                "IMSEC",
                vec![text("4+3i")],
                "-0.0652940278579471-0.0752249603027732i",
            ),
            (
                "IMSIN",
                vec![text("4+3i")],
                "-7.61923172032141-6.548120040911i",
            ),
            (
                "IMSINH",
                vec![text("4+3i")],
                "-27.0168132580039+3.85373803791938i",
            ),
            (
                "IMSQRT",
                vec![text("1+i")],
                "1.09868411346781+0.455089860562227i",
            ),
            (
                "IMTAN",
                vec![text("4+3i")],
                "0.00490825806749606+1.00070953606723i",
            ),
        ] {
            let actual = parts(&call(name, &arguments));
            let expected = parse(published).unwrap().0;

            for (actual, expected) in [(actual.re, expected.re), (actual.im, expected.im)] {
                assert!(
                    (actual - expected).abs() <= 1e-13 * expected.abs(),
                    "{name}{arguments:?}: {actual} != {expected}"
                );
            }
        }

        // The published IMCSCH and IMSECH examples share one real part and one
        // imaginary part: IMCSCH has the right imaginary part and IMSECH the
        // right real part. The reciprocals of the published IMSINH and IMCOSH
        // examples give the other parts.
        for (name, published_part, reciprocal_of, is_real_published) in [
            (
                "IMCSCH",
                -0.0051744731840194,
                "-27.0168132580039+3.85373803791938i",
                false,
            ),
            (
                "IMSECH",
                -0.0362534969158689,
                "-27.0349456030742+3.85115333481178i",
                true,
            ),
        ] {
            let actual = parts(&call(name, &[text("4+3i")]));
            let reciprocal = parse(reciprocal_of).unwrap().0.reciprocal().unwrap();
            let (published, other, expected_other) = if is_real_published {
                (actual.re, actual.im, reciprocal.im)
            } else {
                (actual.im, actual.re, reciprocal.re)
            };

            assert!((published - published_part).abs() <= 1e-15, "{name}");
            assert!(
                (other - expected_other).abs() <= 1e-13 * expected_other.abs(),
                "{name}"
            );
        }

        let Value::Number(angle) = call("IMARGUMENT", &[text("3+4i")]) else {
            panic!("IMARGUMENT returned an error");
        };
        assert!((angle - 0.92729522).abs() < 1e-8);
    }

    #[test]
    fn text_forms_and_errors() {
        for (input, re, im) in [
            ("i", 0.0, 1.0),
            ("-j", 0.0, -1.0),
            ("3", 3.0, 0.0),
            ("2.5e3-1.5E-2i", 2500.0, -0.015),
            ("-4+i", -4.0, 1.0),
            ("1e+2+3i", 100.0, 3.0),
        ] {
            assert_eq!(parse(input).unwrap().0, Complex::new(re, im), "{input}");
        }

        for input in ["3+4k", "3 + 4i", "i3", "--1", "1+2i+3i", "inf", "4I"] {
            assert_eq!(parse(input), Err(FormulaError::Num), "{input}");
        }

        assert_eq!(
            call("IMSUM", &[text("1+i"), text("1+j")]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(call("IMSUM", &[text("1+j"), number(2.0)]), text("3+j"));
        assert_eq!(
            call("COMPLEX", &[number(1.0), number(1.0), text("k")]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            call("IMABS", &[Value::Bool(true)]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            call("IMDIV", &[text("1"), text("0")]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(call("IMLN", &[text("0")]), Value::Error(FormulaError::Num));
        assert_eq!(
            call("IMARGUMENT", &[text("0")]),
            Value::Error(FormulaError::DivZero)
        );
        assert_eq!(call("IMSUB", &[text("1+2i"), text("1+2i")]), text("0"));
    }
}
