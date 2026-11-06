//! The digit writer against `core`'s float formatting, which it replaces in
//! the engine: every case must give the same digits and text.

use super::*;

/// Random doubles drawn from every bit pattern, so every binary exponent and
/// both arithmetic paths are covered.
const RANDOM_BIT_PATTERNS: usize = 5_000;
/// Random doubles with a decimal exponent from -20 to 20, where spreadsheet
/// numbers live.
const RANDOM_SPREADSHEET_NUMBERS: usize = 30_000;
const SPREADSHEET_EXPONENTS: f64 = 20.0;
const SEED: u64 = 0x9e37_79b9_7f4a_7c15;
/// Decimal places checked for the fixed form: every count it supports.
#[cfg(feature = "analysis")]
const FIXED_PLACES_CHECKED: u32 = MAX_FIXED_PLACES;

/// A deterministic xorshift generator, so a failure reproduces.
struct Numbers(u64);

impl Numbers {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    /// A finite positive double from a random bit pattern.
    fn bit_pattern(&mut self) -> f64 {
        loop {
            let number = f64::from_bits(self.next() >> 1);
            if number.is_finite() && number != 0.0 {
                return number;
            }
        }
    }

    /// A positive double with a random decimal exponent in the spreadsheet
    /// range and random digits.
    fn spreadsheet_number(&mut self) -> f64 {
        let unit = (self.next() >> 11) as f64 / (1u64 << 53) as f64;
        10f64.powf(unit * 2.0 * SPREADSHEET_EXPONENTS - SPREADSHEET_EXPONENTS)
    }
}

/// Numbers where rounding and the shortest form are easy to get wrong:
/// halfway values, decimal fractions, powers of two and ten and their
/// neighbours, the largest and the subnormal numbers.
fn edge_numbers() -> Vec<f64> {
    let mut numbers = vec![
        0.5,
        1.5,
        2.5,
        1.005,
        2.675,
        0.1 + 0.2,
        1.0 / 3.0,
        2.0 / 3.0,
        123_456_789_012_345.0,
        1_234_567_890_123_455.0,
        999_999_999_999_999.4,
        999_999_999_999_999.5,
        0.999_999_999_999_999_9,
        f64::MAX,
        f64::MIN_POSITIVE,
        f64::MIN_POSITIVE / 2.0,
        f64::from_bits(1),
        f64::from_bits(2),
        f64::from_bits((1 << 52) - 1),
        f64::EPSILON,
    ];
    for power in -1074..=1023 {
        let number = 2f64.powi(power);
        numbers.extend([number, number.next_down(), number.next_up()]);
    }
    for power in -323..=308 {
        let number: f64 = format!("1e{power}").parse().expect("a power of ten");
        numbers.extend([number, number.next_down(), number.next_up()]);
        numbers.push(format!("5e{power}").parse().expect("a half power of ten"));
    }
    for digits in 1..=2_000u32 {
        numbers.push(f64::from(digits) / 1000.0);
        numbers.push(f64::from(digits) * 0.01 + 0.005);
    }
    numbers.retain(|number| number.is_finite() && *number > 0.0);
    numbers
}

fn all_numbers() -> Vec<f64> {
    let mut random = Numbers(SEED);
    let mut numbers = edge_numbers();
    numbers.extend((0..RANDOM_BIT_PATTERNS).map(|_| random.bit_pattern()));
    numbers.extend((0..RANDOM_SPREADSHEET_NUMBERS).map(|_| random.spreadsheet_number()));
    numbers
}

/// The digits `format!("{:.*e}")` writes, without trailing zeros.
fn core_rounded(number: f64, count: u32) -> Digits {
    let text = format!("{:.*e}", count as usize - 1, number);
    let (mantissa, exponent) = text.split_once('e').expect("an exponent");
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    let digits: u64 = digits.trim_end_matches('0').parse().expect("digits");
    Digits {
        digits,
        exponent: exponent.parse().expect("an integer exponent"),
    }
}

#[test]
fn rounded_digits_match_core_scientific_formatting() {
    let numbers = all_numbers();
    for &number in &numbers {
        assert_eq!(
            rounded_digits(number, EXCEL_DIGITS),
            core_rounded(number, EXCEL_DIGITS),
            "{number:e}"
        );
    }

    // Every digit count on a sample, including the short counts where the
    // rounding carries most often.
    for (index, &number) in numbers.iter().enumerate().step_by(7) {
        let count = 1 + (index as u32 % MAX_DIGITS);
        assert_eq!(
            rounded_digits(number, count),
            core_rounded(number, count),
            "{number:e} at {count} digits"
        );
    }
}

#[test]
fn rounded_digits_round_half_to_even_on_the_binary_value() {
    for (number, count, digits, exponent) in [
        (0.5, 1, 5, -1),
        (2.5, 1, 2, 0),
        (3.5, 1, 4, 0),
        (1_234_567_890_123_455.0, 15, 123_456_789_012_346, 15),
        (1_234_567_890_123_445.0, 15, 123_456_789_012_344, 15),
        // The double nearest 1.005 is below it.
        (1.005, 3, 1, 0),
        (999_999_999_999_999.5, 15, 1, 15),
    ] {
        assert_eq!(
            rounded_digits(number, count),
            Digits { digits, exponent },
            "{number} at {count} digits"
        );
    }
}

#[test]
fn number_text_matches_to_string() {
    for number in all_numbers() {
        for number in [number, -number] {
            assert_eq!(
                NumberText::of(number).as_str(),
                number.to_string(),
                "{number:e}"
            );
        }
    }

    for number in [
        0.0,
        -0.0,
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::NAN,
        -f64::NAN,
    ] {
        assert_eq!(NumberText::of(number).as_str(), number.to_string());
    }
}

#[test]
fn shortest_digits_read_back_as_the_number() {
    for (number, digits, exponent) in [
        (0.1, 1, -1),
        (0.1 + 0.2, 30_000_000_000_000_004, -1),
        (1e23, 1, 23),
        (f64::from_bits(1), 5, -324),
        (f64::MAX, 17_976_931_348_623_157, 308),
        (100.0, 1, 2),
    ] {
        assert_eq!(
            shortest_digits(number),
            Digits { digits, exponent },
            "{number:e}"
        );
    }
}

#[cfg(feature = "analysis")]
#[test]
fn fixed_text_matches_core_fixed_formatting() {
    for number in all_numbers() {
        for places in 0..=FIXED_PLACES_CHECKED {
            assert_eq!(
                fixed_text(number, places),
                format!("{number:.*}", places as usize),
                "{number:e} with {places} places"
            );
        }
    }
    assert_eq!(fixed_text(0.0, 2), "0.00");
    assert_eq!(fixed_text(0.125, 2), "0.12");
    assert_eq!(fixed_text(0.375, 2), "0.38");
    assert_eq!(fixed_text(2f64.powi(70), 2), "1180591620717411303424.00");
}
