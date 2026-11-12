//! Roman numerals (`ROMAN`, `ARABIC`) and numbers in a radix from 2 to 36
//! (`BASE`, `DECIMAL`).

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::super::functions::{number_arg, require_arity, text_arg, FuncAccumulator};

const ROMAN_MAX: f64 = 3_999.0;
/// ROMAN form 4 is the simplified style, which `FALSE` also selects.
const SIMPLIFIED_FORM: f64 = 4.0;
/// The roman digits from the largest down, with their values. Even indexes
/// are powers of ten.
const ROMAN_DIGITS: [(u8, u16); 7] = [
    (b'M', 1000),
    (b'D', 500),
    (b'C', 100),
    (b'L', 50),
    (b'X', 10),
    (b'V', 5),
    (b'I', 1),
];
/// ARABIC and DECIMAL read at most 255 characters.
const MAX_TEXT_LENGTH: usize = 255;
const MIN_RADIX: f64 = 2.0;
const MAX_RADIX: f64 = 36.0;
/// BASE converts integers below 2^53, the exact integers of a double.
const BASE_LIMIT: f64 = 9_007_199_254_740_992.0;
const MAX_MIN_LENGTH: f64 = 255.0;

#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "the last function of the group takes the fallback arm; listing the 200 other Func variants adds nothing"
)]
pub(in crate::eval) fn apply(func: Func, values: &FuncAccumulator) -> EvalResult {
    let result = match func {
        Func::Roman => roman(values).map(Value::text),
        Func::Base => base(values).map(Value::text),
        Func::Arabic => arabic(values).map(Value::number),
        _ => decimal(values).map(Value::number),
    };

    result.unwrap_or_else(Value::Error)
}

/// ROMAN(number, [form]). Form 0 (or `TRUE`) is the classic style and form
/// 4 (or `FALSE`) the simplified one; forms 1 to 3 allow longer subtractive
/// pairs. A number below 0 or above 3999, or another form, is `#VALUE!`.
fn roman(values: &FuncAccumulator) -> Result<String, FormulaError> {
    require_arity(values, 1, 2)?;

    let number = number_arg(values, 0, None)?.trunc();
    let form = match values.arg_value(1) {
        Some(Value::Bool(true)) if !values.arg_missing(1) => 0.0,
        Some(Value::Bool(false)) if !values.arg_missing(1) => SIMPLIFIED_FORM,
        _ => number_arg(values, 1, Some(0.0))?.trunc(),
    };

    if !(0.0..=ROMAN_MAX).contains(&number) || !(0.0..=SIMPLIFIED_FORM).contains(&form) {
        return Err(FormulaError::Value);
    }

    Ok(roman_text(number as u16, form as usize))
}

/// Writes each power of ten from the thousands down. A digit of 4 or 9 is a
/// subtractive pair; a larger form moves the smaller symbol of the pair to
/// smaller values while the pair still fits the number, so 499 is `CDXCIX`
/// in form 0 and `ID` in form 4.
fn roman_text(mut number: u16, form: usize) -> String {
    let mut text = String::new();

    for power in (0..ROMAN_DIGITS.len()).step_by(2) {
        let digit = number / ROMAN_DIGITS[power].1;

        if digit % 5 == 4 {
            let larger = if digit == 4 { power - 1 } else { power - 2 };
            let mut smaller = power;
            let mut steps = 0;

            while steps < form && smaller < ROMAN_DIGITS.len() - 1 {
                steps += 1;

                if ROMAN_DIGITS[larger].1 - ROMAN_DIGITS[smaller + 1].1 <= number {
                    smaller += 1;
                } else {
                    steps = form;
                }
            }

            text.push(char::from(ROMAN_DIGITS[smaller].0));
            text.push(char::from(ROMAN_DIGITS[larger].0));
            number = number + ROMAN_DIGITS[smaller].1 - ROMAN_DIGITS[larger].1;
        } else {
            if digit > 4 {
                text.push(char::from(ROMAN_DIGITS[power - 1].0));
            }

            for _ in 0..digit % 5 {
                text.push(char::from(ROMAN_DIGITS[power].0));
            }

            number %= ROMAN_DIGITS[power].1;
        }
    }

    text
}

/// ARABIC(text). Case and surrounding spaces are ignored, a leading `-`
/// makes the result negative, and an empty text is 0. A symbol before a
/// larger one is subtracted, so every ROMAN form reads back. A number, a
/// logical value or a character that is not a roman digit is `#VALUE!`.
fn arabic(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 1, 1)?;

    if matches!(values.arg_value(0), Some(Value::Number(_) | Value::Bool(_))) {
        return Err(FormulaError::Value);
    }

    let raw = text_arg(values, 0, None)?;
    let text = raw.trim_matches(' ');

    if text.len() > MAX_TEXT_LENGTH {
        return Err(FormulaError::Value);
    }

    let (sign, digits) = match text.strip_prefix('-') {
        Some(rest) => (-1.0, rest),
        None => (1.0, text),
    };
    let mut total = 0.0;
    let mut previous = 0.0;

    for byte in digits.bytes().rev() {
        let value = roman_value(byte).ok_or(FormulaError::Value)?;

        if value < previous {
            total -= value;
        } else {
            total += value;
            previous = value;
        }
    }

    Ok(sign * total + 0.0)
}

fn roman_value(byte: u8) -> Option<f64> {
    let upper = byte.to_ascii_uppercase();

    ROMAN_DIGITS
        .iter()
        .find(|(symbol, _)| *symbol == upper)
        .map(|(_, value)| f64::from(*value))
}

fn radix_arg(values: &FuncAccumulator, index: usize) -> Result<u32, FormulaError> {
    let radix = number_arg(values, index, None)?.trunc();

    if !(MIN_RADIX..=MAX_RADIX).contains(&radix) {
        return Err(FormulaError::Num);
    }

    Ok(radix as u32)
}

/// BASE(number, radix, [`min_length`]): the digits of an integer from 0 to
/// 2^53 - 1, in upper case, padded with zeros to `min_length` (0 to 255).
fn base(values: &FuncAccumulator) -> Result<String, FormulaError> {
    require_arity(values, 2, 3)?;

    let number = number_arg(values, 0, None)?.trunc();
    let radix = radix_arg(values, 1)?;
    let min_length = number_arg(values, 2, Some(0.0))?.trunc();

    if !(0.0..BASE_LIMIT).contains(&number) || !(0.0..=MAX_MIN_LENGTH).contains(&min_length) {
        return Err(FormulaError::Num);
    }

    let mut rest = number as u64;
    let mut digits = Vec::new();

    loop {
        let digit = (rest % u64::from(radix)) as u32;

        digits.push(
            char::from_digit(digit, radix)
                .unwrap_or('0')
                .to_ascii_uppercase(),
        );
        rest /= u64::from(radix);

        if rest == 0 {
            break;
        }
    }

    let padding = (min_length as usize).saturating_sub(digits.len());
    let mut text = "0".repeat(padding);

    text.extend(digits.iter().rev());

    Ok(text)
}

/// DECIMAL(text, radix): reads digits 0-9 and letters A-Z in any case. A
/// character that is not a digit of the radix is `#NUM!`.
fn decimal(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 2)?;

    let text = text_arg(values, 0, None)?;
    let radix = radix_arg(values, 1)?;

    if text.len() > MAX_TEXT_LENGTH {
        return Err(FormulaError::Num);
    }

    text.chars().try_fold(0.0, |total, character| {
        let digit = character.to_digit(radix).ok_or(FormulaError::Num)?;

        Ok(total * f64::from(radix) + f64::from(digit))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(func: Func, arguments: &[Value]) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in arguments {
            values.push_scalar(argument.clone()).unwrap();
            values.finish_arg(1, 1).unwrap();
        }

        apply(func, &values)
    }

    fn number(value: f64) -> Value {
        Value::Number(value)
    }

    fn text(value: &str) -> Value {
        Value::text(value)
    }

    /// The examples of the Microsoft Support pages,
    /// `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    #[test]
    fn microsoft_published_examples() {
        let cases: &[(Func, Vec<Value>, Value)] = &[
            (
                Func::Roman,
                vec![number(499.0), number(0.0)],
                text("CDXCIX"),
            ),
            (
                Func::Roman,
                vec![number(499.0), number(1.0)],
                text("LDVLIV"),
            ),
            (Func::Roman, vec![number(499.0), number(2.0)], text("XDIX")),
            (Func::Roman, vec![number(499.0), number(3.0)], text("VDIV")),
            (Func::Roman, vec![number(499.0), number(4.0)], text("ID")),
            (Func::Arabic, vec![text("LVII")], number(57.0)),
            (Func::Arabic, vec![text("mcmxii")], number(1912.0)),
            (Func::Arabic, vec![text("mxmvii")], number(1997.0)),
            (Func::Arabic, vec![text("")], number(0.0)),
            (Func::Base, vec![number(7.0), number(2.0)], text("111")),
            (Func::Base, vec![number(100.0), number(16.0)], text("64")),
            (
                Func::Base,
                vec![number(15.0), number(2.0), number(10.0)],
                text("0000001111"),
            ),
            (Func::Base, vec![number(16.0), number(2.0)], text("10000")),
            (
                Func::Base,
                vec![number(16.0), number(2.0), number(8.0)],
                text("00010000"),
            ),
            (Func::Decimal, vec![text("FF"), number(16.0)], number(255.0)),
            (Func::Decimal, vec![number(111.0), number(2.0)], number(7.0)),
            (
                Func::Decimal,
                vec![text("zap"), number(36.0)],
                number(45745.0),
            ),
        ];

        for (func, arguments, expected) in cases {
            assert_eq!(&call(*func, arguments), expected, "{func:?}{arguments:?}");
        }
    }

    #[test]
    fn every_roman_form_reads_back() {
        for number_value in 0..=3999 {
            for form in 0..=4 {
                let roman = call(
                    Func::Roman,
                    &[number(number_value.into()), number(form.into())],
                );

                assert_eq!(
                    call(Func::Arabic, std::slice::from_ref(&roman)),
                    number(number_value.into()),
                    "{number_value} in form {form} is {roman:?}"
                );
            }
        }
    }

    #[test]
    fn logical_forms_and_signs() {
        assert_eq!(
            call(Func::Roman, &[number(499.0), Value::Bool(true)]),
            text("CDXCIX")
        );
        assert_eq!(
            call(Func::Roman, &[number(499.0), Value::Bool(false)]),
            text("ID")
        );
        assert_eq!(call(Func::Roman, &[number(0.0)]), text(""));
        assert_eq!(call(Func::Arabic, &[text(" -MMXI ")]), number(-2011.0));
    }

    #[test]
    fn errors_follow_the_microsoft_remarks() {
        let cases: &[(Func, Vec<Value>, FormulaError)] = &[
            (Func::Roman, vec![number(-1.0)], FormulaError::Value),
            (Func::Roman, vec![number(4000.0)], FormulaError::Value),
            (Func::Arabic, vec![number(12.0)], FormulaError::Value),
            (Func::Arabic, vec![text("XIIZ")], FormulaError::Value),
            (
                Func::Arabic,
                vec![text(&"M".repeat(256))],
                FormulaError::Value,
            ),
            (
                Func::Base,
                vec![number(-1.0), number(2.0)],
                FormulaError::Num,
            ),
            (
                Func::Base,
                vec![number(BASE_LIMIT), number(2.0)],
                FormulaError::Num,
            ),
            (
                Func::Base,
                vec![number(7.0), number(1.0)],
                FormulaError::Num,
            ),
            (
                Func::Base,
                vec![number(7.0), number(37.0)],
                FormulaError::Num,
            ),
            (
                Func::Base,
                vec![number(7.0), number(2.0), number(256.0)],
                FormulaError::Num,
            ),
            (
                Func::Decimal,
                vec![text("2"), number(2.0)],
                FormulaError::Num,
            ),
            (
                Func::Decimal,
                vec![text("FF"), number(37.0)],
                FormulaError::Num,
            ),
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
