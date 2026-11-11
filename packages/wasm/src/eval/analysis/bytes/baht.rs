//! `BAHTTEXT`: a number as Thai words, in baht and satang.

use crate::float_text::fixed_text;
use crate::types::{EvalResult, Value};

use super::super::super::functions::{number_arg, require_arity, FuncAccumulator};

const DIGITS: [&str; 10] = [
    "ศูนย์",
    "หนึ่ง",
    "สอง",
    "สาม",
    "สี่",
    "ห้า",
    "หก",
    "เจ็ด",
    "แปด",
    "เก้า",
];
/// Hundreds to hundred thousands, by power of ten from 2 to 5.
const POWERS: [&str; 4] = ["ร้อย", "พัน", "หมื่น", "แสน"];
const TEN: &str = "สิบ";
/// A one in the units after a nonzero tens digit.
const UNIT_ONE: &str = "เอ็ด";
/// A two in the tens.
const TWENTY: &str = "ยี่";
const MILLION: &str = "ล้าน";
const BAHT: &str = "บาท";
const SATANG: &str = "สตางค์";
/// "Exactly": no satang.
const EXACT: &str = "ถ้วน";
const MINUS: &str = "ลบ";
/// Thai numbers group digits by millions.
const GROUP_DIGITS: usize = 6;
/// Satang are hundredths of a baht.
const SATANG_PLACES: u32 = 2;

/// `BAHTTEXT(number)`: the number rounded to satang (two decimal places).
pub(super) fn baht_text(values: &FuncAccumulator) -> EvalResult {
    let result = require_arity(values, 1, 1)
        .and_then(|_| number_arg(values, 0, None))
        .map(|number| Value::text(words(number)));

    result.unwrap_or_else(Value::Error)
}

fn words(number: f64) -> String {
    let digits = fixed_text(number.abs(), SATANG_PLACES);
    let (baht, satang) = digits.split_at(digits.len() - 3);
    let satang = &satang[1..];
    let has_baht = baht != "0";
    let has_satang = satang != "00";

    if !has_baht && !has_satang {
        return [DIGITS[0], BAHT, EXACT].concat();
    }

    let mut text = String::new();

    if number < 0.0 {
        text.push_str(MINUS);
    }

    if has_baht {
        push_grouped(&mut text, baht);
        text.push_str(BAHT);
    }

    if has_satang {
        push_group(&mut text, satang);
        text.push_str(SATANG);
    } else {
        text.push_str(EXACT);
    }

    text
}

/// Writes a whole number in groups of six digits joined by "million".
fn push_grouped(text: &mut String, digits: &str) {
    let mut rest = digits;
    let mut size = match digits.len() % GROUP_DIGITS {
        0 => GROUP_DIGITS,
        size => size,
    };

    while !rest.is_empty() {
        let (group, tail) = rest.split_at(size);

        push_group(text, group);
        rest = tail;
        size = GROUP_DIGITS;

        if !rest.is_empty() {
            text.push_str(MILLION);
        }
    }
}

/// Writes up to six digits. Zero digits are silent.
fn push_group(text: &mut String, group: &str) {
    let digits: Vec<usize> = group.bytes().map(|byte| usize::from(byte - b'0')).collect();
    let count = digits.len();

    for (index, &digit) in digits.iter().enumerate().take(count.saturating_sub(2)) {
        if digit != 0 {
            text.push_str(DIGITS[digit]);
            text.push_str(POWERS[count - 1 - index - 2]);
        }
    }

    let tens = if count > 1 { digits[count - 2] } else { 0 };
    let units = digits[count - 1];

    if tens > 0 {
        match tens {
            1 => {}
            2 => text.push_str(TWENTY),
            _ => text.push_str(DIGITS[tens]),
        }

        text.push_str(TEN);
    }

    if tens > 0 && units == 1 {
        text.push_str(UNIT_ONE);
    } else if units > 0 {
        text.push_str(DIGITS[units]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The example of the Microsoft Support page,
    /// `https://support.microsoft.com/en-us/excel/functions/bahttext-function`.
    #[test]
    fn microsoft_published_example() {
        assert_eq!(words(1234.0), "หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน");
    }
}
