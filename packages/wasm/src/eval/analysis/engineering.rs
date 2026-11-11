//! Engineering functions for number bases, bits, steps and the error
//! function: `BIN2DEC`, `BITAND`, `DELTA`, `ERF` and their relatives.

use super::super::functions::{number_arg, require_arity, FuncAccumulator};
use super::super::value::text_from_value;
use super::distributions::gamma_probability;
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "BIN2DEC",
    "BIN2HEX",
    "BIN2OCT",
    "BITAND",
    "BITLSHIFT",
    "BITOR",
    "BITRSHIFT",
    "BITXOR",
    "DEC2BIN",
    "DEC2HEX",
    "DEC2OCT",
    "DELTA",
    "ERF",
    "ERF.PRECISE",
    "ERFC",
    "ERFC.PRECISE",
    "GESTEP",
    "HEX2BIN",
    "HEX2DEC",
    "HEX2OCT",
    "OCT2BIN",
    "OCT2DEC",
    "OCT2HEX",
];

/// Binary, octal and hexadecimal numbers have at most 10 digits. A number
/// with all 10 digits and its highest bit set is negative, in two's
/// complement.
const MAX_DIGITS: usize = 10;

/// Bit functions accept integers from 0 to 2^48 - 1.
const BIT_LIMIT: f64 = 281_474_976_710_656.0;

/// The largest shift that `BITLSHIFT` and `BITRSHIFT` accept.
const MAX_SHIFT: f64 = 53.0;

const HALF: f64 = 0.5;

type NumberResult = Result<f64, FormulaError>;

/// A number base with the bit width of its 10-digit two's complement form.
#[derive(Clone, Copy)]
struct Radix {
    base: u32,
    bits: u32,
}

const BINARY: Radix = Radix { base: 2, bits: 10 };
const OCTAL: Radix = Radix { base: 8, bits: 30 };
const DECIMAL: Radix = Radix { base: 10, bits: 0 };
const HEXADECIMAL: Radix = Radix { base: 16, bits: 40 };

impl Radix {
    fn from_letter(letter: u8) -> Self {
        match letter {
            b'B' => BINARY,
            b'O' => OCTAL,
            b'H' => HEXADECIMAL,
            _ => DECIMAL,
        }
    }

    /// 2^bits: the offset between a negative value and its two's complement.
    fn modulus(self) -> i64 {
        1_i64 << self.bits
    }

    fn minimum(self) -> i64 {
        -(self.modulus() / 2)
    }

    fn maximum(self) -> i64 {
        self.modulus() / 2 - 1
    }
}

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    let result = match name {
        "BITAND" | "BITOR" | "BITXOR" => bitwise(name, values),
        "BITLSHIFT" | "BITRSHIFT" => bit_shift(name == "BITLSHIFT", values),
        "DELTA" => compare_step(values, |number, step| number == step),
        "GESTEP" => compare_step(values, |number, step| number >= step),
        "ERF" => error_function_between(values),
        "ERF.PRECISE" => single_number(values).map(error_function),
        "ERFC" | "ERFC.PRECISE" => single_number(values).map(complementary_error_function),
        _ => return convert_base(name, values),
    };

    result.map_or_else(Value::Error, Value::number)
}

/// `BIN2DEC`, `DEC2HEX` and the other base conversions. The name gives the
/// source and target bases: its first letter and the letter after the `2`.
fn convert_base(name: &str, values: &FuncAccumulator) -> EvalResult {
    let bytes = name.as_bytes();
    let (Some(&source), Some(&target)) = (bytes.first(), bytes.get(4)) else {
        return Value::Error(FormulaError::Name);
    };

    convert_between(
        Radix::from_letter(source),
        Radix::from_letter(target),
        values,
    )
    .unwrap_or_else(Value::Error)
}

fn convert_between(
    source: Radix,
    target: Radix,
    values: &FuncAccumulator,
) -> Result<Value, FormulaError> {
    let is_decimal_target = target.base == DECIMAL.base;
    require_arity(values, 1, if is_decimal_target { 1 } else { 2 })?;

    let number = if source.base == DECIMAL.base {
        decimal_argument(values)?
    } else {
        parse_digits(&digits_argument(values)?, source)?
    };

    if is_decimal_target {
        return Ok(Value::number(number as f64));
    }

    format_digits(number, target, places_argument(values)?).map(Value::text)
}

/// The digits of a binary, octal or hexadecimal argument. A number argument
/// is read as its decimal digits, so `BIN2DEC(101)` reads `101`.
fn digits_argument(values: &FuncAccumulator) -> Result<String, FormulaError> {
    match values.arg_value(0).unwrap_or(&Value::Blank) {
        Value::Bool(_) => Err(FormulaError::Value),
        Value::Number(number) if *number < 0.0 || number.fract() != 0.0 => Err(FormulaError::Num),
        value => text_from_value(value),
    }
}

/// The decimal argument of `DEC2BIN`, `DEC2OCT` and `DEC2HEX`, truncated.
fn decimal_argument(values: &FuncAccumulator) -> Result<i64, FormulaError> {
    let number = number_arg(values, 0, None)?.trunc();

    if number.abs() > HEXADECIMAL.modulus() as f64 {
        return Err(FormulaError::Num);
    }

    Ok(number as i64)
}

/// The optional `places` argument, truncated. Missing means no padding.
fn places_argument(values: &FuncAccumulator) -> Result<Option<usize>, FormulaError> {
    if values.arg_count() < 2 || values.arg_missing(1) {
        return Ok(None);
    }

    let places = number_arg(values, 1, None)?.trunc();

    if !(1.0..=MAX_DIGITS as f64).contains(&places) {
        return Err(FormulaError::Num);
    }

    Ok(Some(places as usize))
}

/// Reads up to 10 digits of `radix`. Ten digits with the highest bit set are
/// a negative number in two's complement. Empty text is zero.
fn parse_digits(text: &str, radix: Radix) -> Result<i64, FormulaError> {
    if text.len() > MAX_DIGITS {
        return Err(FormulaError::Num);
    }

    let mut number: i64 = 0;

    for character in text.chars() {
        let digit = character.to_digit(radix.base).ok_or(FormulaError::Num)?;
        number = number * i64::from(radix.base) + i64::from(digit);
    }

    if number > radix.maximum() {
        number -= radix.modulus();
    }

    Ok(number)
}

/// Writes `number` in `radix`. A negative number is written as its 10-digit
/// two's complement and ignores `places`.
fn format_digits(number: i64, radix: Radix, places: Option<usize>) -> Result<String, FormulaError> {
    if number < radix.minimum() || number > radix.maximum() {
        return Err(FormulaError::Num);
    }

    if number < 0 {
        return Ok(digits(number + radix.modulus(), radix.base));
    }

    let text = digits(number, radix.base);

    match places {
        Some(places) if text.len() > places => Err(FormulaError::Num),
        Some(places) => Ok(format!("{text:0>places$}")),
        None => Ok(text),
    }
}

/// The uppercase digits of a non-negative number.
fn digits(mut number: i64, base: u32) -> String {
    let mut reversed = Vec::with_capacity(MAX_DIGITS);

    loop {
        let digit = (number % i64::from(base)) as u32;
        let character = char::from_digit(digit, base).unwrap_or('0');
        reversed.push(character.to_ascii_uppercase());
        number /= i64::from(base);

        if number == 0 {
            break;
        }
    }

    reversed.iter().rev().collect()
}

/// An argument of a bit function: an integer from 0 to 2^48 - 1.
fn bit_argument(values: &FuncAccumulator, index: usize) -> Result<u64, FormulaError> {
    let number = number_arg(values, index, None)?;

    if number < 0.0 || number >= BIT_LIMIT || number.fract() != 0.0 {
        return Err(FormulaError::Num);
    }

    Ok(number as u64)
}

/// `BITAND`, `BITOR` and `BITXOR`.
fn bitwise(name: &str, values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 2, 2)?;
    let left = bit_argument(values, 0)?;
    let right = bit_argument(values, 1)?;

    let result = match name {
        "BITAND" => left & right,
        "BITOR" => left | right,
        _ => left ^ right,
    };

    Ok(result as f64)
}

/// `BITLSHIFT` and `BITRSHIFT`. A negative shift moves the other way.
fn bit_shift(is_left: bool, values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 2, 2)?;
    let number = bit_argument(values, 0)? as f64;
    let shift = number_arg(values, 1, None)?.trunc();

    if shift.abs() > MAX_SHIFT {
        return Err(FormulaError::Num);
    }

    let left_shift = if is_left { shift } else { -shift };
    let result = if left_shift >= 0.0 {
        number * 2f64.powf(left_shift)
    } else {
        (number / 2f64.powf(-left_shift)).floor()
    };

    if result >= BIT_LIMIT {
        return Err(FormulaError::Num);
    }

    Ok(result)
}

/// `DELTA(number1, [number2])` and `GESTEP(number, [step])`: 1 when the test
/// holds, else 0. The second number is 0 when it is omitted.
fn compare_step(values: &FuncAccumulator, test: impl Fn(f64, f64) -> bool) -> NumberResult {
    require_arity(values, 1, 2)?;
    let number = number_arg(values, 0, None)?;
    let step = number_arg(values, 1, Some(0.0))?;

    Ok(if test(number, step) { 1.0 } else { 0.0 })
}

fn single_number(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 1, 1)?;

    number_arg(values, 0, None)
}

/// `ERF(lower_limit, [upper_limit])`: erf(lower) alone, or the integral
/// between the limits.
fn error_function_between(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 1, 2)?;
    let lower = number_arg(values, 0, None)?;

    if values.arg_count() < 2 || values.arg_missing(1) {
        return Ok(error_function(lower));
    }

    let upper = number_arg(values, 1, None)?;

    Ok(error_function(upper) - error_function(lower))
}

/// erf(x) = sign(x) P(1/2, x^2), with the regularized lower incomplete gamma
/// function P.
fn error_function(x: f64) -> f64 {
    let magnitude = gamma_probability(HALF, x * x, false).unwrap_or(1.0);

    magnitude.copysign(x)
}

/// erfc(x) = Q(1/2, x^2) for x >= 0 and 2 - Q(1/2, x^2) below. Q is
/// calculated directly, so small right tails keep their precision.
fn complementary_error_function(x: f64) -> f64 {
    let tail = gamma_probability(HALF, x * x, true).unwrap_or_default();

    if x < 0.0 {
        2.0 - tail
    } else {
        tail
    }
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
    fn microsoft_published_base_examples() {
        for (name, arguments, expected) in [
            ("BIN2DEC", vec![number(1100100.0)], number(100.0)),
            ("BIN2DEC", vec![number(1111111111.0)], number(-1.0)),
            (
                "BIN2HEX",
                vec![number(11111011.0), number(4.0)],
                text("00FB"),
            ),
            ("BIN2HEX", vec![number(1110.0)], text("E")),
            ("BIN2HEX", vec![number(1111111111.0)], text("FFFFFFFFFF")),
            ("BIN2OCT", vec![number(1001.0), number(3.0)], text("011")),
            ("BIN2OCT", vec![number(1100100.0)], text("144")),
            ("BIN2OCT", vec![number(1111111111.0)], text("7777777777")),
            ("DEC2BIN", vec![number(9.0), number(4.0)], text("1001")),
            ("DEC2BIN", vec![number(-100.0)], text("1110011100")),
            ("DEC2HEX", vec![number(100.0), number(4.0)], text("0064")),
            ("DEC2HEX", vec![number(-54.0)], text("FFFFFFFFCA")),
            ("DEC2HEX", vec![number(28.0)], text("1C")),
            (
                "DEC2HEX",
                vec![number(64.0), number(1.0)],
                Value::Error(FormulaError::Num),
            ),
            ("DEC2OCT", vec![number(58.0), number(3.0)], text("072")),
            ("DEC2OCT", vec![number(-100.0)], text("7777777634")),
            ("HEX2BIN", vec![text("F"), number(8.0)], text("00001111")),
            ("HEX2BIN", vec![text("B7")], text("10110111")),
            ("HEX2BIN", vec![text("FFFFFFFFFF")], text("1111111111")),
            ("HEX2DEC", vec![text("A5")], number(165.0)),
            ("HEX2DEC", vec![text("FFFFFFFF5B")], number(-165.0)),
            ("HEX2DEC", vec![text("3DA408B9")], number(1_034_160_313.0)),
            ("HEX2OCT", vec![text("F"), number(3.0)], text("017")),
            ("HEX2OCT", vec![text("3B4E")], text("35516")),
            ("HEX2OCT", vec![text("FFFFFFFF00")], text("7777777400")),
            ("OCT2BIN", vec![number(3.0), number(3.0)], text("011")),
            ("OCT2BIN", vec![number(7777777000.0)], text("1000000000")),
            ("OCT2DEC", vec![number(54.0)], number(44.0)),
            ("OCT2DEC", vec![number(7777777533.0)], number(-165.0)),
            ("OCT2HEX", vec![number(100.0), number(4.0)], text("0040")),
            ("OCT2HEX", vec![number(7777777533.0)], text("FFFFFFFF5B")),
        ] {
            assert_eq!(call(name, &arguments), expected, "{name}{arguments:?}");
        }
    }

    #[test]
    fn base_conversions_reject_values_outside_the_ten_digit_range() {
        for (name, arguments) in [
            ("BIN2DEC", vec![number(12.0)]),
            ("BIN2DEC", vec![text("10000000000")]),
            ("DEC2BIN", vec![number(512.0)]),
            ("DEC2BIN", vec![number(-513.0)]),
            ("DEC2OCT", vec![number(536_870_912.0)]),
            ("DEC2HEX", vec![number(549_755_813_888.0)]),
            ("DEC2BIN", vec![number(1.0), number(0.0)]),
            ("DEC2BIN", vec![number(1.0), number(11.0)]),
            ("HEX2BIN", vec![text("200")]),
            ("HEX2BIN", vec![text("FFFFFFFDFF")]),
            ("HEX2OCT", vec![text("FFDFFFFFFF")]),
            ("OCT2BIN", vec![number(1000.0)]),
            ("HEX2DEC", vec![text("G1")]),
            ("BIN2DEC", vec![number(1.5)]),
        ] {
            assert_eq!(
                call(name, &arguments),
                Value::Error(FormulaError::Num),
                "{name}{arguments:?}"
            );
        }

        assert_eq!(
            call("BIN2DEC", &[Value::Bool(true)]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            call("DEC2BIN", &[text("x")]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(call("HEX2DEC", &[text("ff")]), number(255.0));
        assert_eq!(call("DEC2BIN", &[number(9.9)]), text("1001"));
        assert_eq!(
            call("DEC2BIN", &[number(-1.0), number(2.0)]),
            text("1111111111")
        );
    }

    #[test]
    fn microsoft_published_bit_examples() {
        for (name, arguments, expected) in [
            ("BITAND", [1.0, 5.0], 1.0),
            ("BITAND", [13.0, 25.0], 9.0),
            ("BITOR", [23.0, 10.0], 31.0),
            ("BITXOR", [5.0, 3.0], 6.0),
            ("BITLSHIFT", [4.0, 2.0], 16.0),
            ("BITRSHIFT", [13.0, 2.0], 3.0),
            ("BITLSHIFT", [16.0, -2.0], 4.0),
            ("BITRSHIFT", [1.0, -3.0], 8.0),
        ] {
            assert_eq!(
                call(name, &[number(arguments[0]), number(arguments[1])]),
                number(expected),
                "{name}{arguments:?}"
            );
        }

        for (name, arguments) in [
            ("BITAND", [-1.0, 5.0]),
            ("BITOR", [1.5, 5.0]),
            ("BITXOR", [BIT_LIMIT, 1.0]),
            ("BITLSHIFT", [1.0, 54.0]),
            ("BITLSHIFT", [BIT_LIMIT / 2.0, 1.0]),
        ] {
            assert_eq!(
                call(name, &[number(arguments[0]), number(arguments[1])]),
                Value::Error(FormulaError::Num),
                "{name}{arguments:?}"
            );
        }
    }

    #[test]
    fn microsoft_published_step_and_error_function_examples() {
        assert_eq!(call("DELTA", &[number(5.0), number(4.0)]), number(0.0));
        assert_eq!(call("DELTA", &[number(5.0), number(5.0)]), number(1.0));
        assert_eq!(call("DELTA", &[number(0.5)]), number(0.0));
        assert_eq!(call("GESTEP", &[number(5.0), number(4.0)]), number(1.0));
        assert_eq!(call("GESTEP", &[number(-4.0), number(-5.0)]), number(1.0));
        assert_eq!(call("GESTEP", &[number(-1.0)]), number(0.0));
        assert_eq!(
            call("DELTA", &[text("a"), number(1.0)]),
            Value::Error(FormulaError::Value)
        );

        for (name, arguments, published) in [
            ("ERF", vec![0.745], 0.70792892),
            ("ERF", vec![1.0, 2.0], 0.15262147),
            ("ERF.PRECISE", vec![0.745], 0.70792892),
            ("ERF.PRECISE", vec![1.0], 0.84270079),
            ("ERFC", vec![1.0], 0.15729921),
            ("ERFC.PRECISE", vec![1.0], 0.15729921),
        ] {
            let arguments: Vec<Value> = arguments.into_iter().map(number).collect();
            let Value::Number(actual) = call(name, &arguments) else {
                panic!("{name} returned an error");
            };

            assert!((actual - published).abs() < 1e-8, "{name}: {actual}");
        }
    }

    #[test]
    fn error_functions_match_fifteen_digit_tables() {
        // Abramowitz and Stegun, Table 7.1: erf(0.5) = 0.520499877813047.
        let Value::Number(erf) = call("ERF", &[number(0.5)]) else {
            panic!("ERF returned an error");
        };
        assert!((erf - 0.520499877813047).abs() < 1e-15);
        assert_eq!(call("ERF", &[number(-0.5)]), number(-erf));

        // erfc(5) = 1.53745979442803e-12 keeps its precision as a right tail.
        let Value::Number(tail) = call("ERFC", &[number(5.0)]) else {
            panic!("ERFC returned an error");
        };
        assert!((tail / 1.53745979442803e-12 - 1.0).abs() < 1e-13);
        assert_eq!(call("ERFC", &[number(0.0)]), number(1.0));
    }
}
