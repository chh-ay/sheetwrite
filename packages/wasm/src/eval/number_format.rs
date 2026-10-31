//! Excel's decimal view of a number: rounding at a decimal place, the General
//! text form, and the number format codes that TEXT applies.
//!
//! Excel keeps 15 significant digits when it shows, converts or rounds a
//! number. The double nearest to `1.005` is slightly below it, but Excel sees
//! the decimal `1.005` and rounds it to `1.01`. Every rule here therefore
//! starts from those 15 decimal digits and works on the digits, never on a
//! scaled binary value, so ROUND, TEXT and `&` agree with what a cell shows.

/// Significant decimal digits that Excel keeps for a number.
const SIGNIFICANT_DIGITS: usize = 15;
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
/// 15 digits, no leading or trailing zero digits, and no digits for zero.
#[derive(Clone, Debug, PartialEq)]
struct Decimal {
    negative: bool,
    digits: Vec<u8>,
    point: i32,
}

impl Decimal {
    /// The 15 significant digits of a finite number.
    fn of(number: f64) -> Self {
        let negative = number.is_sign_negative() && number != 0.0;
        if number == 0.0 {
            return Self {
                negative,
                digits: Vec::new(),
                point: 0,
            };
        }

        let scientific = format!("{:.*e}", SIGNIFICANT_DIGITS - 1, number.abs());
        let (mantissa, exponent) = scientific
            .split_once('e')
            .expect("scientific formatting writes an exponent");
        let exponent: i32 = exponent.parse().expect("scientific exponent is an integer");
        let mut digits: Vec<u8> = mantissa
            .bytes()
            .filter(u8::is_ascii_digit)
            .map(|digit| digit - b'0')
            .collect();
        while digits.last() == Some(&0) {
            digits.pop();
        }

        Self {
            negative,
            digits,
            point: exponent + 1,
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
            self.digits = if round_up { vec![1] } else { Vec::new() };
            self.point = 1 - places;
            return self.normalized();
        };
        if kept_len >= self.digits.len() {
            return self;
        }

        let dropped = self.digits.split_off(kept_len);
        let round_up = match rounding {
            Rounding::Nearest => dropped[0] >= 5,
            Rounding::Away => dropped.iter().any(|&digit| digit != 0),
            Rounding::Toward => false,
        };
        if round_up {
            self.increment_last(places);
        }
        self.normalized()
    }

    /// Adds one unit at the last kept place, carrying into new leading digits.
    fn increment_last(&mut self, places: i32) {
        for digit in self.digits.iter_mut().rev() {
            if *digit < 9 {
                *digit += 1;
                return;
            }
            *digit = 0;
        }
        self.digits.insert(0, 1);
        self.point = if self.digits.len() == 1 {
            1 - places
        } else {
            self.point + 1
        };
    }

    fn normalized(mut self) -> Self {
        while self.digits.last() == Some(&0) {
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

        let mut text = String::with_capacity(self.digits.len() + 8);
        if self.negative {
            text.push('-');
        }
        text.push_str("0.");
        text.extend(self.digits.iter().map(|&digit| char::from(b'0' + digit)));
        text.push('e');
        text.push_str(&self.point.to_string());
        text.parse().expect("decimal digits form a valid number")
    }

    /// The digits before the decimal point, without leading zeros.
    fn integer_digits(&self) -> String {
        let point = usize::try_from(self.point).unwrap_or(0);
        (0..point)
            .map(|index| char::from(b'0' + self.digits.get(index).copied().unwrap_or(0)))
            .collect()
    }

    /// The digits after the decimal point, without trailing zeros.
    fn fraction_digits(&self) -> String {
        let leading_zeros = usize::try_from(-self.point).unwrap_or(0);
        let skipped = usize::try_from(self.point).unwrap_or(0);
        std::iter::repeat_n('0', leading_zeros)
            .chain(
                self.digits
                    .iter()
                    .skip(skipped)
                    .map(|&digit| char::from(b'0' + digit)),
            )
            .collect()
    }
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
    let mut digits = decimal.digits.iter().map(|&digit| char::from(b'0' + digit));
    text.extend(digits.next());
    let rest: String = digits.collect();
    if !rest.is_empty() {
        text.push('.');
        text.push_str(&rest);
    }
    text.push('E');
    text.push(if exponent < 0 { '-' } else { '+' });
    text.push_str(&format!(
        "{:0width$}",
        exponent.unsigned_abs(),
        width = MIN_EXPONENT_DIGITS
    ));
}

/// One element of a number format section.
#[derive(Clone, Debug, PartialEq)]
enum Token {
    Literal(String),
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
struct Section {
    tokens: Vec<Token>,
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

fn parse_section(code: &str) -> Option<Section> {
    let mut section = Section::default();
    let mut chars = code.chars().peekable();
    while let Some(ch) = chars.next() {
        let token = match ch {
            '0' | '#' | '?' => Token::Digit(ch),
            '.' => Token::Point,
            '%' => Token::Percent,
            ',' => {
                section.tokens.push(Token::Literal(",".into()));
                continue;
            }
            '"' => Token::Literal(chars.by_ref().take_while(|&next| next != '"').collect()),
            '\\' => Token::Literal(chars.next()?.to_string()),
            '_' => {
                chars.next();
                Token::Literal(" ".into())
            }
            '*' => {
                chars.next();
                continue;
            }
            // Colors and conditions change no characters.
            '[' => {
                chars.by_ref().find(|&next| next == ']');
                continue;
            }
            'E' | 'e' if matches!(chars.peek(), Some('+' | '-')) => Token::Exponent {
                always_signed: chars.next() == Some('+'),
            },
            'G' | 'g' => {
                let rest: String = chars.by_ref().take(6).collect();
                if !rest.eq_ignore_ascii_case("eneral") {
                    return None;
                }
                Token::General
            }
            _ if is_date_letter(ch) => return None,
            _ => Token::Literal(ch.to_string()),
        };
        section.tokens.push(token);
    }
    resolve_commas(&mut section);
    Some(section)
}

/// A comma between integer digit placeholders groups thousands; commas
/// after the last integer placeholder divide the value by 1,000 each.
/// Other commas are literal text.
fn resolve_commas(section: &mut Section) {
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

    let is_comma = |token: &Token| matches!(token, Token::Literal(text) if text == ",");
    let mut kept = Vec::with_capacity(section.tokens.len());
    for (index, token) in section.tokens.drain(..).enumerate() {
        if is_comma(&token) && index > first_digit && index < last_digit {
            section.grouped = true;
        } else if is_comma(&token) && index > last_digit && index < integer_end {
            section.thousands_scale += 1;
        } else {
            kept.push(token);
        }
    }
    section.tokens = kept;
}

/// Formats a number with an Excel number format code, or `None` when the code
/// is a date or time format or cannot be read.
pub(super) fn format_number(number: f64, code: &str) -> Option<String> {
    let parts = sections(code);
    let (part, magnitude_only) = match (parts.len(), number) {
        (1, _) => (parts[0], false),
        (_, value) if value < 0.0 => (parts[1], true),
        (2.., value) if value == 0.0 && parts.len() >= 3 => (parts[2], false),
        _ => (parts[0], false),
    };
    let section = parse_section(part)?;
    let value = if magnitude_only { number.abs() } else { number };
    Some(render(&section, value))
}

fn render(section: &Section, value: f64) -> String {
    if section.tokens.contains(&Token::General) {
        return section
            .tokens
            .iter()
            .map(|token| match token {
                Token::General => general_text(value),
                other => literal_text(other),
            })
            .collect();
    }

    let percents = section
        .tokens
        .iter()
        .filter(|token| **token == Token::Percent)
        .count();
    let scaled =
        value * PERCENT_SCALE.powi(percents as i32) / THOUSANDS_SCALE.powi(section.thousands_scale);
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
    text
}

fn literal_text(token: &Token) -> String {
    match token {
        Token::Literal(text) => text.clone(),
        Token::Percent => "%".into(),
        Token::Point => ".".into(),
        _ => String::new(),
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
    fn of(tokens: &[Token]) -> Self {
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
    for (index, digit) in integer.chars().enumerate() {
        if index != 0 && (integer.len() - index).is_multiple_of(GROUP_SIZE) {
            text.push(',');
        }
        text.push(digit);
    }
    text
}

/// The digit strings a section's placeholders consume.
struct Digits<'a> {
    integer: &'a str,
    fraction: &'a str,
    exponent: i32,
}

/// Writes the section with its placeholders filled. Integer digits fill the
/// integer placeholders from the right, and digits beyond them go before the
/// first placeholder; fraction digits fill from the left.
fn write_tokens(section: &Section, layout: &Layout, digits: &Digits<'_>, text: &mut String) {
    let integer: Vec<char> = digits.integer.chars().collect();
    let fraction: Vec<char> = digits.fraction.chars().collect();
    let overflow = integer.len().saturating_sub(layout.integer_placeholders);
    let mut integer_slot = 0usize;
    let mut fraction_slot = 0usize;
    let mut exponent_written = false;
    let mut after_point = false;
    let mut in_exponent = false;

    for token in &section.tokens {
        match token {
            Token::Digit(placeholder) if in_exponent => {
                if !exponent_written {
                    let width = layout.exponent_digits.unwrap_or(1);
                    text.push_str(&format!("{:0width$}", digits.exponent.unsigned_abs()));
                    exponent_written = true;
                }
                let _ = placeholder;
            }
            Token::Digit(placeholder) if after_point => {
                match fraction.get(fraction_slot) {
                    Some(&digit) => text.push(digit),
                    None if *placeholder == '0' => text.push('0'),
                    None if *placeholder == '?' => text.push(' '),
                    None => {}
                }
                fraction_slot += 1;
            }
            Token::Digit(placeholder) => {
                if integer_slot == 0 {
                    text.extend(&integer[..overflow]);
                }
                let missing =
                    layout.integer_placeholders - integer.len().min(layout.integer_placeholders);
                if integer_slot >= missing {
                    text.push(integer[overflow + integer_slot - missing]);
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
            other => text.push_str(&literal_text(other)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimal_rounding_reads_the_fifteen_digit_value() {
        assert_eq!(round_decimal(1.005, 2, Rounding::Nearest), 1.01);
        assert_eq!(round_decimal(2.675, 2, Rounding::Nearest), 2.68);
        assert_eq!(round_decimal(-1.005, 2, Rounding::Nearest), -1.01);
        assert_eq!(round_decimal(1234.5, -2, Rounding::Nearest), 1200.0);
        assert_eq!(round_decimal(49.0, -2, Rounding::Nearest), 0.0);
        assert_eq!(round_decimal(50.0, -2, Rounding::Nearest), 100.0);
        assert_eq!(round_decimal(1.0, -2, Rounding::Away), 100.0);
        assert_eq!(round_decimal(9.99, 1, Rounding::Nearest), 10.0);
        assert_eq!(round_decimal(0.0004, 3, Rounding::Away), 0.001);
        assert_eq!(round_decimal(1.009, 2, Rounding::Toward), 1.0);
        assert_eq!(round_decimal(0.0, 2, Rounding::Away), 0.0);
    }

    #[test]
    fn general_text_uses_fifteen_significant_digits() {
        for (number, expected) in [
            (0.1 + 0.2, "0.3"),
            (1.0 / 3.0, "0.333333333333333"),
            (1e15, "1E+15"),
            (123_456_789_012_345.0, "123456789012345"),
            (1e-10, "1E-10"),
            (0.000_000_001, "0.000000001"),
            (-2.5e20, "-2.5E+20"),
            (100.0, "100"),
            (0.0, "0"),
        ] {
            assert_eq!(general_text(number), expected, "{number}");
        }
    }

    #[test]
    fn number_formats_place_digits_and_literals() {
        for (number, code, expected) in [
            (0.5, "0%", "50%"),
            (2.5, "0", "3"),
            (1234.5, "#,##0.00", "1,234.50"),
            (12345.0, "0.00E+00", "1.23E+04"),
            (0.00012, "0.0E+0", "1.2E-4"),
            (99999.0, "0.0E+0", "1.0E+5"),
            (0.0, "#", ""),
            (0.0, "0.##", "0."),
            (1.5, "?.??", "1.5 "),
            (12.0, "000-00", "000-12"),
            (123456.0, "0", "123456"),
            (5.0, "[Red]0.0", "5.0"),
        ] {
            assert_eq!(
                format_number(number, code).as_deref(),
                Some(expected),
                "{code}"
            );
        }
        assert_eq!(format_number(1.0, "yyyy"), None);
    }
}
