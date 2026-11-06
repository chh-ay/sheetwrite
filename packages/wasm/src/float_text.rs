//! Decimal digits of a double without the float formatting of `core::fmt`.
//!
//! The engine needs these decimal views of a number: its leading digits
//! rounded to a fixed count (Excel's 15 significant digits), the shortest
//! digits that read back as the same double (formula text and search), and,
//! in the full engine, a fixed number of decimals (BAHTTEXT). Each gives
//! exactly what `format!("{:.14e}")`, `f64::to_string` and
//! `format!("{:.2}")` give, without linking the Grisu and Dragon code that
//! `core` uses for them.
//!
//! Every result comes from exact integer arithmetic: the number is
//! `mantissa × 2^binary_exponent`, and scaling it by `10^places` gives an
//! integer part (the truncated digits) and a remainder that decides the
//! rounding. Magnitudes from about `1e-11` to `1e19` fit in 128-bit integers;
//! the rest use a small fixed-width big integer.

use std::cmp::Ordering;

/// Significant digits the shortest form can need: 17 identify every double.
const MAX_DIGITS: u32 = 17;
/// Excel keeps 15 significant digits; a number that reads back from 15 or
/// fewer digits needs no longer form.
const EXCEL_DIGITS: u32 = 15;
const MANTISSA_BITS: u32 = 52;
const EXPONENT_MASK: u64 = 0x7ff;
/// `binary_exponent` of a subnormal number, and the offset from the stored
/// exponent of a normal one.
const SUBNORMAL_EXPONENT: i32 = -1074;
const EXPONENT_BIAS: i32 = 1075;
/// `floor(n × log10(2))` is `(n × LOG10_2_NUMERATOR) >> LOG10_2_SHIFT` for
/// every binary exponent of a double, give or take one.
const LOG10_2_NUMERATOR: i32 = 78_913;
const LOG10_2_SHIFT: u32 = 18;
/// Remainders and gaps are doubled or quadrupled, so 128-bit values keep
/// this many spare high bits.
const SMALL_HEADROOM_BITS: u32 = 3;
/// The largest power of five below 2^64.
const MAX_FIVE_POWER: u32 = 27;
/// Doubles below `2^53` that have no fraction are exactly their integer.
const EXACT_INTEGER_LIMIT: f64 = (1u64 << f64::MANTISSA_DIGITS) as f64;
/// Big integer width: the largest value, the denominator `2^1074` of a
/// subnormal number at a few fixed decimals times the division shift, stays
/// below 1,150 bits.
const BIG_LIMBS: usize = 40;
/// The truncated digits fit in 64 bits, one quotient bit per division step.
const QUOTIENT_BITS: u32 = 64;
/// Number texts up to this length stay on the stack: every number from
/// about `1e-12` to `1e30` with its sign. Longer texts move to the heap.
const SHORT_TEXT_CAPACITY: usize = 32;
/// The most decimals `fixed_text` writes: a number with a fraction is below
/// 2^52, so its scaled digits stay below 2^64.
#[cfg(feature = "analysis")]
const MAX_FIXED_PLACES: u32 = 3;
/// Whole numbers below this convert to `u64` exactly.
#[cfg(feature = "analysis")]
const U64_LIMIT: f64 = u64::MAX as f64;
/// Decimal digits of the largest `u64`.
#[cfg(feature = "analysis")]
const U64_DIGITS: usize = u64::MAX.ilog10() as usize + 1;

/// The leading decimal digits of a positive number.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Digits {
    /// The digits as an integer, without trailing zeros.
    pub(crate) digits: u64,
    /// The power of ten of the first digit: the number is `d.ddd × 10^exponent`.
    pub(crate) exponent: i32,
}

impl Digits {
    /// Removes trailing zeros, and moves a carry past the last place (`999`
    /// rounded up to `1000`) into the exponent.
    fn new(mut digits: u64, count: u32, mut exponent: i32) -> Self {
        if digits == 10u64.pow(count) {
            exponent += 1;
        }
        // Large steps first: each division is a slow 64-bit divide.
        for factor in [100_000_000, 10_000, 100, 10] {
            while digits.is_multiple_of(factor) {
                digits /= factor;
            }
        }
        Self { digits, exponent }
    }
}

/// `number` (positive, finite, not zero) rounded to `count` significant
/// digits, half to even on the exact binary value: the digits that
/// `format!("{:.*e}", count - 1, number)` writes.
pub(crate) fn rounded_digits(number: f64, count: u32) -> Digits {
    let binary = Binary::of(number);
    let scaled = Scaled::of(&binary, count, binary.exponent_guess());
    let digits = scaled.digits + u64::from(rounds_up(scaled.half, scaled.digits));
    Digits::new(digits, count, scaled.exponent)
}

/// Half to even: a remainder above half a unit rounds up, and exactly half
/// rounds up only an odd last digit.
fn rounds_up(half: Ordering, digits: u64) -> bool {
    half == Ordering::Greater || (half == Ordering::Equal && digits % 2 == 1)
}

/// `number` (finite, not negative) with `places` decimals, at most
/// `MAX_FIXED_PLACES`, rounded half to even on the exact binary value: the
/// text `format!("{number:.places$}")` writes.
#[cfg(feature = "analysis")]
pub(crate) fn fixed_text(number: f64, places: u32) -> String {
    debug_assert!(places <= MAX_FIXED_PLACES, "{places} decimal places");
    let places = places as usize;
    let mut text = String::new();
    if number.fract() == 0.0 {
        push_integer(number, &mut text);
        if places > 0 {
            text.push('.');
            text.extend(std::iter::repeat_n('0', places));
        }
        return text;
    }

    // A number with a fraction is below 2^52, so it keeps its decimals in
    // 64 bits.
    let (digits, [half, ..]) = scale(&Binary::of(number), places as i32);
    let digits = digits as u64 + u64::from(rounds_up(half, digits as u64));
    let mut buffer = [0; U64_DIGITS];
    let digits = write_integer(digits, &mut buffer);
    let integer_len = digits.len().saturating_sub(places);
    if integer_len == 0 {
        text.push('0');
    }
    push_ascii(&mut text, &digits[..integer_len]);
    if places > 0 {
        text.push('.');
        text.extend(std::iter::repeat_n(
            '0',
            places - (digits.len() - integer_len),
        ));
        push_ascii(&mut text, &digits[integer_len..]);
    }
    text
}

/// The decimal digits of a whole number (finite, not negative).
#[cfg(feature = "analysis")]
fn push_integer(number: f64, text: &mut String) {
    if number < U64_LIMIT {
        let mut buffer = [0; U64_DIGITS];
        push_ascii(text, write_integer(number as u64, &mut buffer));
        return;
    }

    // A whole number from 2^64 up has a binary exponent above zero.
    let binary = Binary::of(number);
    let mut value = Big::from(binary.mantissa);
    value.mul_pow(2, binary.binary_exponent as u32);
    let mut digits = Vec::new();
    while !value.is_zero() {
        digits.push(b'0' + value.div_small(10) as u8);
    }
    digits.reverse();
    push_ascii(text, &digits);
}

#[cfg(feature = "analysis")]
fn push_ascii(text: &mut String, digits: &[u8]) {
    text.extend(digits.iter().map(|&digit| char::from(digit)));
}

/// The fewest significant digits that read back as `number` (positive,
/// finite, not zero), and of those the closest, halfway rounding up: the
/// digits that `f64::to_string` writes.
pub(crate) fn shortest_digits(number: f64) -> Digits {
    // A whole number below 2^53 differs from every other number of as few
    // digits by at least 1, more than the gap to its neighbours: its digits
    // are its shortest form.
    if number < EXACT_INTEGER_LIMIT && number.fract() == 0.0 {
        let integer = number as u64;
        let exponent = integer.ilog10();
        return Digits::new(integer, exponent + 1, exponent as i32);
    }

    let binary = Binary::of(number);
    if number >= f64::MIN_POSITIVE {
        if let Some(digits) = shortest_from_one_scaling(&binary) {
            return digits;
        }
    }

    // Around a normal number the gap between doubles is under a quarter of a
    // 15-digit step, so a shorter form that reads back is the 15-digit one
    // without its trailing zeros. A subnormal number has fewer significant
    // bits and is searched from one digit.
    let first_count = if number >= f64::MIN_POSITIVE {
        EXCEL_DIGITS
    } else {
        1
    };
    let mut exponent = binary.exponent_guess();
    for count in first_count..=MAX_DIGITS {
        let scaled = Scaled::of(&binary, count, exponent);
        exponent = scaled.exponent;
        if let Some(round_up) = shortest_round_up(scaled.half, scaled.below_fits, scaled.above_fits)
        {
            return Digits::new(scaled.digits + u64::from(round_up), count, scaled.exponent);
        }
    }
    unreachable!("17 significant digits read back as every double")
}

/// Whether the shortest form at one digit count rounds the truncated digits
/// up: when both candidates read back, the closer one, halfway rounding up;
/// `None` when neither reads back.
fn shortest_round_up(half: Ordering, below_fits: bool, above_fits: bool) -> Option<bool> {
    match (below_fits, above_fits) {
        (true, true) => Some(half != Ordering::Less),
        (below, above) if below || above => Some(above),
        _ => None,
    }
}

/// The shortest digits of a normal number from a single scaling to 17
/// digits, when that scaling has a power-of-two denominator and fits 128
/// bits (numbers from about `1e-11` to `1e16`). The 15- and 16-digit
/// candidates are the 17 digits without their last two or one digits, and
/// every distance is measured on the same scale, so the number is scaled
/// once instead of once per digit count. `None` leaves the number to the
/// per-count search.
fn shortest_from_one_scaling(binary: &Binary) -> Option<Digits> {
    let mut exponent = binary.exponent_guess();
    let (numerator, gap, twos_down) = loop {
        let powers = Powers::of(binary, MAX_DIGITS as i32 - 1 - exponent);
        if powers.fives_down != 0 {
            return None;
        }
        let fives = u128::from(five_power(powers.fives_up)?);
        let numerator = shifted(fives * u128::from(binary.mantissa), powers.twos_up)?;
        // The denominator `2^twos_down` keeps the same headroom.
        shifted(1, powers.twos_down)?;
        match digit_count_order(numerator >> powers.twos_down, MAX_DIGITS) {
            Ordering::Greater => exponent += 1,
            Ordering::Less => exponent -= 1,
            Ordering::Equal => {
                break (numerator, shifted(fives, powers.twos_up)?, powers.twos_down)
            }
        }
    };

    // On a scale of twice the denominator, the number is `twice`, half the
    // gap to either neighbour is `gap`, and one unit of the last kept digit
    // is `10^dropped` such steps.
    let twice = numerator << 1;
    let seventeen = (numerator >> twos_down) as u64;
    for dropped in (0..=MAX_DIGITS - EXCEL_DIGITS).rev() {
        let step = 10u64.pow(dropped);
        let below = seventeen / step;
        let unit = u128::from(step) << (twos_down + 1);
        let below_distance = twice - (u128::from(below * step) << (twos_down + 1));
        let above_distance = unit - below_distance;
        let half = below_distance.cmp(&(unit >> 1));
        let lower_reach = if binary.narrow_below {
            below_distance << 1
        } else {
            below_distance
        };
        let below_fits = fits(lower_reach.cmp(&gap), binary.inclusive);
        let above_fits = fits(above_distance.cmp(&gap), binary.inclusive);
        if let Some(round_up) = shortest_round_up(half, below_fits, above_fits) {
            return Some(Digits::new(
                below + u64::from(round_up),
                MAX_DIGITS - dropped,
                exponent,
            ));
        }
    }
    None
}

/// Whether `digits` has too many (`Greater`) or too few (`Less`) digits for
/// `count`.
fn digit_count_order(digits: u128, count: u32) -> Ordering {
    if digits >= u128::from(10u64.pow(count)) {
        Ordering::Greater
    } else if digits < u128::from(10u64.pow(count - 1)) {
        Ordering::Less
    } else {
        Ordering::Equal
    }
}

/// Text of a number as `f64::to_string` writes it: plain decimal notation
/// with the shortest digits, `-` for a negative number or zero, `inf` and
/// `NaN`. A short text stays on the stack.
pub(crate) enum NumberText {
    Short {
        bytes: [u8; SHORT_TEXT_CAPACITY],
        len: usize,
    },
    Long(String),
}

impl NumberText {
    pub(crate) fn of(number: f64) -> Self {
        let mut text = Self::Short {
            bytes: [0; SHORT_TEXT_CAPACITY],
            len: 0,
        };

        if number.is_nan() {
            text.push(b"NaN");
            return text;
        }
        if number.is_sign_negative() {
            text.push(b"-");
        }
        if number.is_infinite() {
            text.push(b"inf");
        } else if number == 0.0 {
            text.push(b"0");
        } else {
            text.push_plain(shortest_digits(number.abs()));
        }
        text
    }

    pub(crate) fn as_str(&self) -> &str {
        match self {
            Self::Short { bytes, len } => ascii(&bytes[..*len]),
            Self::Long(text) => text,
        }
    }

    /// `0.000ddd`, `dd.ddd` or `ddd000`, by where the decimal point falls.
    fn push_plain(&mut self, digits: Digits) {
        let mut buffer = [0; MAX_DIGITS as usize];
        let text = write_integer(digits.digits, &mut buffer);
        let point = digits.exponent + 1;
        match usize::try_from(point) {
            Ok(0) | Err(_) => {
                self.push(b"0.");
                self.push_zeros(point.unsigned_abs() as usize);
                self.push(text);
            }
            Ok(point) if point < text.len() => {
                self.push(&text[..point]);
                self.push(b".");
                self.push(&text[point..]);
            }
            Ok(point) => {
                self.push(text);
                self.push_zeros(point - text.len());
            }
        }
    }

    /// Appends ASCII bytes, moving the text to the heap when it outgrows the
    /// stack buffer.
    fn push(&mut self, more: &[u8]) {
        match self {
            Self::Short { bytes, len } if *len + more.len() <= SHORT_TEXT_CAPACITY => {
                bytes[*len..*len + more.len()].copy_from_slice(more);
                *len += more.len();
            }
            Self::Short { bytes, len } => {
                let mut text = String::from(ascii(&bytes[..*len]));
                text.push_str(ascii(more));
                *self = Self::Long(text);
            }
            Self::Long(text) => text.push_str(ascii(more)),
        }
    }

    fn push_zeros(&mut self, count: usize) {
        const ZEROS: [u8; SHORT_TEXT_CAPACITY] = [b'0'; SHORT_TEXT_CAPACITY];
        let mut left = count;
        while left > 0 {
            let chunk = left.min(ZEROS.len());
            self.push(&ZEROS[..chunk]);
            left -= chunk;
        }
    }
}

fn ascii(bytes: &[u8]) -> &str {
    std::str::from_utf8(bytes).expect("number text is ASCII")
}

/// Writes the decimal digits of `value` at the end of `text` and returns them.
fn write_integer(mut value: u64, text: &mut [u8]) -> &[u8] {
    let mut start = text.len();
    loop {
        start -= 1;
        text[start] = b'0' + (value % 10) as u8;
        value /= 10;
        if value == 0 {
            return &text[start..];
        }
    }
}

/// A number scaled by a power of ten so that its integer part has `count`
/// digits, and where the remainder after that integer part sits.
struct Scaled {
    /// The integer part: the leading `count` digits, truncated.
    digits: u64,
    /// The power of ten of the first digit.
    exponent: i32,
    /// The remainder against half a unit of the last digit.
    half: Ordering,
    /// The truncated digits read back as the number.
    below_fits: bool,
    /// The truncated digits plus one unit read back as the number.
    above_fits: bool,
}

/// The double as `mantissa × 2^binary_exponent` and the range of numbers
/// that read back as it.
struct Binary {
    mantissa: u64,
    binary_exponent: i32,
    /// The gap to the next lower double is half the gap to the next higher
    /// one, as it is for a power of two.
    narrow_below: bool,
    /// A number exactly halfway to a neighbour reads back as an even mantissa.
    inclusive: bool,
}

impl Binary {
    fn of(number: f64) -> Self {
        let bits = number.to_bits();
        let stored_exponent = ((bits >> MANTISSA_BITS) & EXPONENT_MASK) as i32;
        let fraction = bits & ((1 << MANTISSA_BITS) - 1);
        let (mantissa, binary_exponent) = if stored_exponent == 0 {
            (fraction, SUBNORMAL_EXPONENT)
        } else {
            (
                fraction | 1 << MANTISSA_BITS,
                stored_exponent - EXPONENT_BIAS,
            )
        };
        Self {
            mantissa,
            binary_exponent,
            // As `core` decodes it, the smallest normal number counts too.
            narrow_below: stored_exponent != 0 && fraction == 0,
            inclusive: mantissa % 2 == 0,
        }
    }

    /// The power of ten of the first digit, `floor(log2 × log10(2))`, which
    /// is the right one or one too small.
    fn exponent_guess(&self) -> i32 {
        let binary_log =
            (u64::BITS - 1 - self.mantissa.leading_zeros()) as i32 + self.binary_exponent;
        (binary_log * LOG10_2_NUMERATOR) >> LOG10_2_SHIFT
    }
}

impl Scaled {
    /// `exponent` is a guess for the power of ten of the number's first
    /// digit; the scaling corrects it.
    fn of(binary: &Binary, count: u32, mut exponent: i32) -> Self {
        loop {
            let places = count as i32 - 1 - exponent;
            let (digits, comparisons) = scale(binary, places);
            match digit_count_order(digits, count) {
                Ordering::Greater => exponent += 1,
                Ordering::Less => exponent -= 1,
                Ordering::Equal => {
                    let [half, below, above] = comparisons;
                    return Self {
                        digits: digits as u64,
                        exponent,
                        half,
                        below_fits: fits(below, binary.inclusive),
                        above_fits: fits(above, binary.inclusive),
                    };
                }
            }
        }
    }
}

fn fits(distance_to_gap: Ordering, inclusive: bool) -> bool {
    distance_to_gap == Ordering::Less || (inclusive && distance_to_gap == Ordering::Equal)
}

/// The scaled number's integer part, and its remainder compared with half a
/// unit, with half the gap below and with half the gap above.
type Scale = (u128, [Ordering; 3]);

/// `number × 10^places` as the exact ratio
/// `mantissa × 5^fives_up × 2^twos_up / (5^fives_down × 2^twos_down)`:
/// `10^places` is `5^places × 2^places`, and its powers of two cancel
/// against the binary exponent first. The gap to the next double on the same
/// scale is the numerator without the mantissa.
struct Powers {
    fives_up: u32,
    fives_down: u32,
    twos_up: u32,
    twos_down: u32,
}

impl Powers {
    fn of(binary: &Binary, places: i32) -> Self {
        let twos = binary.binary_exponent + places;
        Self {
            fives_up: places.max(0) as u32,
            fives_down: (-places).max(0) as u32,
            twos_up: twos.max(0) as u32,
            twos_down: (-twos).max(0) as u32,
        }
    }
}

/// `number × 10^places`: its integer part and where the remainder sits.
fn scale(binary: &Binary, places: i32) -> Scale {
    scale_small(binary, places).unwrap_or_else(|| scale_big(binary, places))
}

/// `5^exponent` when it fits 64 bits, by plain multiplications (a checked
/// 64-bit multiplication is a 128-bit library call in WebAssembly).
fn five_power(exponent: u32) -> Option<u64> {
    (exponent <= MAX_FIVE_POWER).then(|| (0..exponent).fold(1, |power, _| power * 5))
}

/// The 128-bit path: a power-of-two denominator, or a numerator and
/// denominator below 2^64. Powers of five up to `5^27` fit 64 bits, so the
/// only wide multiplication is the mantissa times one of them.
fn scale_small(binary: &Binary, places: i32) -> Option<Scale> {
    let powers = Powers::of(binary, places);
    let fives_up = u128::from(five_power(powers.fives_up)?);
    let fives_down = u128::from(five_power(powers.fives_down)?);
    let gap = shifted(fives_up, powers.twos_up)?;
    let denominator = shifted(fives_down, powers.twos_down)?;
    let numerator = shifted(fives_up * u128::from(binary.mantissa), powers.twos_up)?;

    let (digits, remainder) = if powers.fives_down == 0 {
        (numerator >> powers.twos_down, numerator & (denominator - 1))
    } else {
        let numerator = u64::try_from(numerator).ok()?;
        let denominator = u64::try_from(denominator).ok()?;
        (
            u128::from(numerator / denominator),
            u128::from(numerator % denominator),
        )
    };

    let twice = remainder << 1;
    let below = if binary.narrow_below {
        twice << 1
    } else {
        twice
    };
    let above = (denominator - remainder) << 1;
    Some((
        digits,
        [twice.cmp(&denominator), below.cmp(&gap), above.cmp(&gap)],
    ))
}

/// `value << shift`, when the result keeps `SMALL_HEADROOM_BITS` spare high
/// bits.
fn shifted(value: u128, shift: u32) -> Option<u128> {
    (value.leading_zeros() >= shift.saturating_add(SMALL_HEADROOM_BITS)).then(|| value << shift)
}

/// The big-integer path for magnitudes outside the 128-bit range. The
/// quotient comes one bit at a time against a denominator shifted left by
/// `QUOTIENT_BITS - 1`, so the remainder, the denominator and the gap all
/// carry that shift when they are compared.
#[inline(never)]
fn scale_big(binary: &Binary, places: i32) -> Scale {
    let powers = Powers::of(binary, places);
    let mut gap = Big::from(1);
    gap.mul_pow(5, powers.fives_up);
    gap.mul_pow(2, powers.twos_up + QUOTIENT_BITS - 1);
    let mut denominator = Big::from(1);
    denominator.mul_pow(5, powers.fives_down);
    denominator.mul_pow(2, powers.twos_down + QUOTIENT_BITS - 1);
    let mut remainder = Big::from(binary.mantissa);
    remainder.mul_pow(5, powers.fives_up);
    remainder.mul_pow(2, powers.twos_up);

    let mut digits = 0u128;
    for bit in (0..QUOTIENT_BITS).rev() {
        digits <<= 1;
        if remainder.cmp(&denominator) != Ordering::Less {
            remainder.sub(&denominator);
            digits |= 1;
        }
        if bit > 0 {
            remainder.mul_pow(2, 1);
        }
    }

    let mut twice = remainder;
    twice.mul_pow(2, 1);
    let mut below = twice;
    below.mul_pow(2, u32::from(binary.narrow_below));
    let mut above = denominator;
    above.sub(&remainder);
    above.mul_pow(2, 1);
    (
        digits,
        [twice.cmp(&denominator), below.cmp(&gap), above.cmp(&gap)],
    )
}

/// An unsigned integer of `BIG_LIMBS` 32-bit limbs, least significant first.
/// Limbs from `len` up are zero, so every loop stops at the used limbs.
#[derive(Clone, Copy)]
struct Big {
    limbs: [u32; BIG_LIMBS],
    len: usize,
}

impl Big {
    fn from(value: u64) -> Self {
        let mut limbs = [0; BIG_LIMBS];
        limbs[0] = value as u32;
        limbs[1] = (value >> 32) as u32;
        Self { limbs, len: 2 }
    }

    /// Multiplies by `base^exponent`, in factors that fit 32 bits.
    #[inline(never)]
    fn mul_pow(&mut self, base: u32, mut exponent: u32) {
        let largest_step = u32::MAX.ilog(base);
        while exponent > 0 {
            let step = exponent.min(largest_step);
            let factor = u64::from(base.pow(step));
            let mut carry = 0;
            for limb in &mut self.limbs[..self.len] {
                let product = u64::from(*limb) * factor + carry;
                *limb = product as u32;
                carry = product >> 32;
            }
            if carry > 0 {
                self.limbs[self.len] = carry as u32;
                self.len += 1;
            }
            exponent -= step;
        }
    }

    /// Subtracts `other`, which is not larger.
    fn sub(&mut self, other: &Self) {
        let len = self.len.max(other.len);
        let mut borrow = false;
        for (limb, &subtrahend) in self.limbs[..len].iter_mut().zip(&other.limbs[..len]) {
            let (difference, first) = limb.overflowing_sub(subtrahend);
            let (difference, second) = difference.overflowing_sub(u32::from(borrow));
            *limb = difference;
            borrow = first || second;
        }
        self.len = len;
    }

    fn cmp(&self, other: &Self) -> Ordering {
        let len = self.len.max(other.len);
        self.limbs[..len]
            .iter()
            .rev()
            .cmp(other.limbs[..len].iter().rev())
    }

    #[cfg(feature = "analysis")]
    fn is_zero(&self) -> bool {
        self.limbs[..self.len].iter().all(|&limb| limb == 0)
    }

    /// Divides by `divisor` and returns the remainder.
    #[cfg(feature = "analysis")]
    fn div_small(&mut self, divisor: u32) -> u32 {
        let divisor = u64::from(divisor);
        let mut remainder = 0;
        for limb in self.limbs[..self.len].iter_mut().rev() {
            let value = (remainder << 32) | u64::from(*limb);
            *limb = (value / divisor) as u32;
            remainder = value % divisor;
        }
        remainder as u32
    }
}

#[cfg(test)]
#[path = "float_text_tests.rs"]
mod tests;
