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
