//! Excel's decimal view of a number: rounding at a decimal place, the General
//! text form, and the number format codes that TEXT applies.
//!
//! Excel keeps 15 significant digits when it shows, converts or rounds a
//! number. The double nearest to `1.005` is slightly below it, but Excel sees
//! the decimal `1.005` and rounds it to `1.01`. Every rule here therefore
//! starts from those 15 decimal digits and works on the digits, never on a
//! scaled binary value, so ROUND, TEXT and `&` agree with what a cell shows.

use crate::float_text::rounded_digits;
use crate::types::FormulaError;

/// Significant decimal digits that Excel keeps for a number.
const SIGNIFICANT_DIGITS: u32 = 15;
/// General writes a number in plain decimal form when its decimal exponent is
/// in this range, and in scientific form otherwise (`1E+15`, `1E-10`).
const PLAIN_EXPONENTS: std::ops::Range<i32> = -9..15;
/// Scientific General output shows at least two exponent digits.
const MIN_EXPONENT_DIGITS: usize = 2;
/// Thousands are grouped in threes.
const GROUP_SIZE: usize = 3;
const PERCENT_SCALE: f64 = 100.0;
const THOUSANDS_SCALE: f64 = 1_000.0;

/// How a rounding treats the digits it drops.
#[derive(Clone, Copy, PartialEq)]
pub(super) enum Rounding {
    /// Half away from zero (ROUND, TEXT, FIXED).
    Nearest,
    /// Away from zero when any dropped digit is not zero (ROUNDUP).
    Away,
    /// Toward zero (ROUNDDOWN).
    Toward,
}

/// The value `0.d1 d2 ... dn × 10^point` of a number's magnitude, with at most
/// 15 ASCII digits, no leading or trailing zero digits, and no digits for zero.
#[derive(Clone, Debug, PartialEq)]
struct Decimal {
    negative: bool,
    digits: String,
    point: i32,
}

impl Decimal {
    /// The 15 significant digits of a finite number.
    fn of(number: f64) -> Self {
        let negative = number.is_sign_negative() && number != 0.0;
        if number == 0.0 {
            return Self {
                negative,
                digits: String::new(),
                point: 0,
            };
        }

        let rounded = rounded_digits(number.abs(), SIGNIFICANT_DIGITS);
        Self {
            negative,
            digits: rounded.digits.to_string(),
            point: rounded.exponent + 1,
        }
    }

    fn is_zero(&self) -> bool {
        self.digits.is_empty()
    }

    /// Keeps `places` digits after the decimal point; a negative `places`
    /// rounds to tens, hundreds and so on.
    fn round(mut self, places: i32, rounding: Rounding) -> Self {
        let kept = self.point.saturating_add(places);
        let Ok(kept_len) = usize::try_from(kept) else {
            // Every digit is below the kept place; only a round-up keeps a unit there.
            let round_up = rounding == Rounding::Away && !self.is_zero();
            self.digits = if round_up { "1".into() } else { String::new() };
            self.point = 1 - places;
            return self.normalized();
        };
        if kept_len >= self.digits.len() {
            return self;
        }

        let dropped = self.digits.split_off(kept_len);
        let round_up = match rounding {
            Rounding::Nearest => dropped.as_bytes()[0] >= b'5',
            Rounding::Away => dropped.bytes().any(|digit| digit != b'0'),
            Rounding::Toward => false,
        };
        if round_up {
            self.increment_last();
        }
        self.normalized()
    }

    /// Adds one unit at the last kept place. The nines it carries through
    /// become trailing zeros and are dropped; a carry past the first digit
    /// (or into an empty kept part) starts a new leading `1`.
    fn increment_last(&mut self) {
        while self.digits.ends_with('9') {
            self.digits.pop();
        }
        if let Some(digit) = self.digits.pop() {
            self.digits.push(char::from(digit as u8 + 1))
        } else {
            self.digits.push('1');
            self.point += 1;
        }
    }

    fn normalized(mut self) -> Self {
        while self.digits.ends_with('0') {
            self.digits.pop();
        }
        if self.is_zero() {
            self.point = 0;
        }
        self
    }

    fn to_f64(&self) -> f64 {
        if self.is_zero() {
            return 0.0;
        }

        let magnitude: f64 = format!("0.{}e{}", self.digits, self.point)
            .parse()
            .expect("decimal digits form a valid number");
        if self.negative {
            -magnitude
        } else {
            magnitude
        }
    }

    /// The digits before the decimal point, without leading zeros.
    fn integer_digits(&self) -> String {
        let point = usize::try_from(self.point).unwrap_or(0);
        let kept = point.min(self.digits.len());
        let mut text = String::with_capacity(point);
        text.push_str(&self.digits[..kept]);
        push_zeros(&mut text, point - kept);
        text
    }

    /// The digits after the decimal point, without trailing zeros.
    fn fraction_digits(&self) -> String {
        let point = usize::try_from(self.point).unwrap_or(0);
        let mut text = String::new();
        push_zeros(&mut text, self.point.min(0).unsigned_abs() as usize);
        text.push_str(self.digits.get(point..).unwrap_or(""));
        text
    }
}

fn push_zeros(text: &mut String, count: usize) {
    text.extend(std::iter::repeat_n('0', count));
}

/// `number` rounded at a decimal place the way ROUND, ROUNDUP and ROUNDDOWN
/// do. `places` may be negative.
pub(super) fn round_decimal(number: f64, places: i32, rounding: Rounding) -> f64 {
    if !number.is_finite() {
        return number;
    }
    Decimal::of(number).round(places, rounding).to_f64()
}

/// `number` with at most 15 significant digits, the value Excel shows.
pub(super) fn significant(number: f64) -> f64 {
    if !number.is_finite() {
        return number;
    }
    Decimal::of(number).to_f64()
}

/// The General text form that `&`, CONCAT and other text functions give a
/// number: 15 significant digits, plain notation for exponents from -9 to 14
/// and scientific notation outside them.
pub(super) fn general_text(number: f64) -> String {
    let decimal = Decimal::of(number);
    if decimal.is_zero() {
        return "0".into();
    }

    let mut text = String::new();
    if decimal.negative {
        text.push('-');
    }
    let exponent = decimal.point - 1;
    if PLAIN_EXPONENTS.contains(&exponent) {
        push_plain(&decimal, &mut text);
    } else {
        push_scientific(&decimal, exponent, &mut text);
    }
    text
}

fn push_plain(decimal: &Decimal, text: &mut String) {
    let integer = decimal.integer_digits();
    let fraction = decimal.fraction_digits();
    text.push_str(if integer.is_empty() { "0" } else { &integer });
    if !fraction.is_empty() {
        text.push('.');
        text.push_str(&fraction);
    }
}

fn push_scientific(decimal: &Decimal, exponent: i32, text: &mut String) {
    let (first, rest) = decimal.digits.split_at(1);
    text.push_str(first);
    if !rest.is_empty() {
        text.push('.');
        text.push_str(rest);
    }
    text.push('E');
    text.push(if exponent < 0 { '-' } else { '+' });
    push_exponent_digits(exponent, MIN_EXPONENT_DIGITS, text);
}

/// The exponent's magnitude with leading zeros up to `width` digits.
fn push_exponent_digits(exponent: i32, width: usize, text: &mut String) {
    let digits = exponent.unsigned_abs().to_string();
    push_zeros(text, width.saturating_sub(digits.len()));
    text.push_str(&digits);
}

/// One element of a number format section; literal text borrows from the
/// format code.
#[derive(Clone, Debug, PartialEq)]
enum Token<'a> {
    Literal(&'a str),
    /// `0` always shows a digit, `#` only a significant one, `?` a space for
    /// an insignificant one.
    Digit(char),
    Point,
    Percent,
    /// `E+` writes the exponent sign always, `E-` only when negative.
    Exponent {
        always_signed: bool,
    },
    General,
}

/// A parsed number format section and the scaling it implies.
#[derive(Debug, Default)]
struct Section<'a> {
    tokens: Vec<Token<'a>>,
    grouped: bool,
    thousands_scale: i32,
}

/// Splits a format code into sections at the `;` outside quotes and escapes.
fn sections(code: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start = 0;
    let mut quoted = false;
    let mut escaped = false;
    for (index, ch) in code.char_indices() {
        match ch {
            _ if escaped => escaped = false,
            '\\' if !quoted => escaped = true,
            '"' => quoted = !quoted,
            ';' if !quoted => {
                parts.push(&code[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    parts.push(&code[start..]);
    parts
}

/// Letters that make a code a date or time format, which this formatter does
/// not read.
fn is_date_letter(ch: char) -> bool {
    matches!(ch.to_ascii_lowercase(), 'd' | 'm' | 'y' | 'h' | 's')
}

/// The text of the character at `index` of `code`.
fn char_at(code: &str, index: usize, ch: char) -> &str {
    &code[index..index + ch.len_utf8()]
}

fn parse_section(code: &str) -> Option<Section<'_>> {
    const GENERAL_REST: &str = "eneral";
    let mut section = Section::default();
    let mut chars = code.char_indices().peekable();
    while let Some((index, ch)) = chars.next() {
        let token = match ch {
            '0' | '#' | '?' => Token::Digit(ch),
            '.' => Token::Point,
            '%' => Token::Percent,
            ',' => {
                section.tokens.push(Token::Literal(","));
                continue;
            }
            '"' => {
                let start = index + 1;
                let end = chars
                    .by_ref()
                    .find(|&(_, next)| next == '"')
                    .map_or(code.len(), |(end, _)| end);
                Token::Literal(&code[start..end])
            }
            '\\' => {
                let (next_index, next) = chars.next()?;
                Token::Literal(char_at(code, next_index, next))
            }
            '_' => {
                chars.next();
                Token::Literal(" ")
            }
            '*' => {
                chars.next();
                continue;
            }
            // Colors and conditions change no characters.
            '[' => {
                chars.by_ref().find(|&(_, next)| next == ']');
                continue;
            }
            'E' | 'e' if matches!(chars.peek(), Some((_, '+' | '-'))) => Token::Exponent {
                always_signed: chars.next().map(|(_, sign)| sign) == Some('+'),
            },
            'G' | 'g' => {
                let rest = code.get(index + 1..index + 1 + GENERAL_REST.len())?;
                if !rest.eq_ignore_ascii_case(GENERAL_REST) {
                    return None;
                }
                chars.nth(GENERAL_REST.len() - 1);
                Token::General
            }
            _ if is_date_letter(ch) => return None,
            _ => Token::Literal(char_at(code, index, ch)),
        };
        section.tokens.push(token);
    }
    resolve_commas(&mut section);
    Some(section)
}

/// A comma between integer digit placeholders groups thousands; commas
/// after the last integer placeholder divide the value by 1,000 each.
/// Other commas are literal text.
fn resolve_commas(section: &mut Section<'_>) {
    let integer_end = section
        .tokens
        .iter()
        .position(|token| matches!(token, Token::Point | Token::Exponent { .. }))
        .unwrap_or(section.tokens.len());
    let last_digit = section.tokens[..integer_end]
        .iter()
        .rposition(|token| matches!(token, Token::Digit(_)));
    let first_digit = section.tokens[..integer_end]
        .iter()
        .position(|token| matches!(token, Token::Digit(_)));
    let (Some(first_digit), Some(last_digit)) = (first_digit, last_digit) else {
        return;
    };

    let mut index = 0;
    section.tokens.retain(|token| {
        let position = index;
        index += 1;
        if *token != Token::Literal(",") {
            return true;
        }
        if position > first_digit && position < last_digit {
            section.grouped = true;
            return false;
        }
        if position > last_digit && position < integer_end {
            section.thousands_scale += 1;
            return false;
        }
        true
    });
}

/// Formats a number with an Excel number format code, or `None` when the code
/// is a date or time format or cannot be read. A percent code that takes the
/// number past the largest double is `#NUM!`, the error Excel gives a numeric
/// result too large to hold.
pub(super) fn format_number(number: f64, code: &str) -> Result<Option<String>, FormulaError> {
    let parts = sections(code);
    let (part, magnitude_only) = match (parts.len(), number) {
        (1, _) => (parts[0], false),
        (_, value) if value < 0.0 => (parts[1], true),
        (2.., value) if value == 0.0 && parts.len() >= 3 => (parts[2], false),
        _ => (parts[0], false),
    };
    let Some(section) = parse_section(part) else {
        return Ok(None);
    };
    let value = if magnitude_only { number.abs() } else { number };
    render(&section, value).map(Some)
}

fn render(section: &Section<'_>, value: f64) -> Result<String, FormulaError> {
    if section.tokens.contains(&Token::General) {
        let mut text = String::new();
        for token in &section.tokens {
            match token {
                Token::General => text.push_str(&general_text(value)),
                other => text.push_str(literal_text(other)),
            }
        }
        return Ok(text);
    }

    let percents = section
        .tokens
        .iter()
        .filter(|token| **token == Token::Percent)
        .count();
    let scaled =
        value * PERCENT_SCALE.powi(percents as i32) / THOUSANDS_SCALE.powi(section.thousands_scale);
    if !scaled.is_finite() {
        return Err(FormulaError::Num);
    }

    let layout = Layout::of(&section.tokens);
    let (mantissa, exponent) = match layout.exponent_digits {
        Some(_) => scientific_parts(scaled, &layout),
        None => (scaled, 0),
    };
    let rounded = Decimal::of(mantissa).round(layout.fraction_digits as i32, Rounding::Nearest);
    let mut integer = rounded.integer_digits();
    if integer.len() < layout.integer_zeros {
        integer.insert_str(0, &"0".repeat(layout.integer_zeros - integer.len()));
    }
    if section.grouped {
        integer = grouped(&integer);
    }

    let mut text = String::new();
    if rounded.negative && !rounded.is_zero() {
        text.push('-');
    }
    write_tokens(
        section,
        &layout,
        &Digits {
            integer: &integer,
            fraction: &rounded.fraction_digits(),
            exponent,
        },
        &mut text,
    );
    Ok(text)
}

fn literal_text<'a>(token: &Token<'a>) -> &'a str {
    match token {
        Token::Literal(text) => text,
        Token::Percent => "%",
        Token::Point => ".",
        _ => "",
    }
}

/// Where the digit placeholders of a section sit.
struct Layout {
    integer_placeholders: usize,
    integer_zeros: usize,
    fraction_digits: usize,
    exponent_digits: Option<usize>,
}

impl Layout {
    fn of(tokens: &[Token<'_>]) -> Self {
        let mut layout = Self {
            integer_placeholders: 0,
            integer_zeros: 0,
            fraction_digits: 0,
            exponent_digits: None,
        };
        let mut after_point = false;
        for token in tokens {
            match token {
                Token::Point => after_point = true,
                Token::Exponent { .. } => layout.exponent_digits = Some(0),
                Token::Digit(placeholder) => match layout.exponent_digits.as_mut() {
                    Some(count) => *count += 1,
                    None if after_point => layout.fraction_digits += 1,
                    None => {
                        layout.integer_placeholders += 1;
                        layout.integer_zeros += usize::from(*placeholder == '0');
                    }
                },
                _ => {}
            }
        }
        layout
    }
}

/// The mantissa and exponent of a scientific format: the mantissa has as many
/// integer digits as the format has `0` placeholders before the point.
fn scientific_parts(value: f64, layout: &Layout) -> (f64, i32) {
    if value == 0.0 {
        return (0.0, 0);
    }

    let integer_digits = layout.integer_zeros.max(1) as i32;
    let decimal = Decimal::of(value);
    let exponent = decimal.point - integer_digits;
    let mantissa = Decimal {
        point: integer_digits,
        ..decimal
    };
    let rounded = mantissa.round(layout.fraction_digits as i32, Rounding::Nearest);
    // Rounding can carry into one more integer digit, as 9.99 to 10.0.
    let carry = rounded.point - integer_digits;
    (
        Decimal {
            point: rounded.point - carry,
            ..rounded
        }
        .to_f64(),
        exponent + carry,
    )
}

fn grouped(integer: &str) -> String {
    let mut text = String::with_capacity(integer.len() + integer.len() / GROUP_SIZE);
    for (index, digit) in integer.char_indices() {
        if index != 0 && (integer.len() - index).is_multiple_of(GROUP_SIZE) {
            text.push(',');
        }
        text.push(digit);
    }
    text
}

/// The ASCII digit strings a section's placeholders consume.
struct Digits<'a> {
    integer: &'a str,
    fraction: &'a str,
    exponent: i32,
}

/// Writes the section with its placeholders filled. Integer digits fill the
/// integer placeholders from the right, and digits beyond them go before the
/// first placeholder; fraction digits fill from the left.
fn write_tokens(section: &Section<'_>, layout: &Layout, digits: &Digits<'_>, text: &mut String) {
    let integer = digits.integer.as_bytes();
    let fraction = digits.fraction.as_bytes();
    let overflow = integer.len().saturating_sub(layout.integer_placeholders);
    let missing = layout.integer_placeholders - (integer.len() - overflow);
    let mut integer_slot = 0usize;
    let mut fraction_slot = 0usize;
    let mut exponent_written = false;
    let mut after_point = false;
    let mut in_exponent = false;

    for token in &section.tokens {
        match token {
            Token::Digit(_) if in_exponent => {
                if !exponent_written {
                    let width = layout.exponent_digits.unwrap_or(1);
                    push_exponent_digits(digits.exponent, width, text);
                    exponent_written = true;
                }
            }
            Token::Digit(placeholder) if after_point => {
                match fraction.get(fraction_slot) {
                    Some(&digit) => text.push(char::from(digit)),
                    None if *placeholder == '0' => text.push('0'),
                    None if *placeholder == '?' => text.push(' '),
                    None => {}
                }
                fraction_slot += 1;
            }
            Token::Digit(placeholder) => {
                if integer_slot == 0 {
                    text.push_str(&digits.integer[..overflow]);
                }
                if integer_slot >= missing {
                    text.push(char::from(integer[overflow + integer_slot - missing]));
                } else if *placeholder == '?' {
                    text.push(' ');
                }
                integer_slot += 1;
            }
            Token::Point => {
                after_point = true;
                if !fraction.is_empty() || layout.fraction_digits > 0 {
                    text.push('.');
                }
            }
            Token::Exponent { always_signed } => {
                in_exponent = true;
                text.push('E');
                if digits.exponent < 0 {
                    text.push('-');
                } else if *always_signed {
                    text.push('+');
                }
            }
            other => text.push_str(literal_text(other)),
        }
    }
}
