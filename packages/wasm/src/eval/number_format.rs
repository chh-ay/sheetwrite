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

    const fn is_zero(&self) -> bool {
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
        let point = usize::try_from(self.point).unwrap_or_default();
        let kept = point.min(self.digits.len());
        let mut text = String::with_capacity(point);
        text.push_str(&self.digits[..kept]);
        push_zeros(&mut text, point - kept);
        text
    }

    /// The digits after the decimal point, without trailing zeros.
    fn fraction_digits(&self) -> String {
        let point = usize::try_from(self.point).unwrap_or_default();
        let mut text = String::new();
        push_zeros(&mut text, self.point.min(0).unsigned_abs() as usize);
        text.push_str(self.digits.get(point..).unwrap_or_default());
        text
    }
}

fn push_zeros(text: &mut String, count: usize) {
    text.extend(std::iter::repeat_n('0', count));
}

/// Powers of ten that a double holds exactly.
const EXACT_POWERS_OF_TEN: [f64; 23] = [
    1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16,
    1e17, 1e18, 1e19, 1e20, 1e21, 1e22,
];
/// Integers below this are exact doubles.
const EXACT_INTEGER_LIMIT: u64 = 1 << f64::MANTISSA_DIGITS;

/// `number` rounded at a decimal place the way ROUND, ROUNDUP and ROUNDDOWN
/// do. `places` may be negative.
pub(super) fn round_decimal(number: f64, places: i32, rounding: Rounding) -> f64 {
    if !number.is_finite() {
        return number;
    }
    // Excel has no negative zero; the decimal path gives +0 as well.
    if number == 0.0 {
        return 0.0;
    }
    let (digits, last_place) = digit_integer(number.abs());
    let (mantissa, exponent) = round_digit_integer(digits, last_place, places, rounding);
    exact_value(mantissa, exponent).map_or_else(
        || Decimal::of(number).round(places, rounding).to_f64(),
        |magnitude| with_sign(magnitude, number),
    )
}

/// `number` with at most 15 significant digits, the value Excel shows.
pub(super) fn significant(number: f64) -> f64 {
    if !number.is_finite() {
        return number;
    }
    if number == 0.0 {
        return 0.0;
    }
    let (digits, last_place) = digit_integer(number.abs());
    exact_value(digits, last_place).map_or_else(
        || Decimal::of(number).to_f64(),
        |magnitude| with_sign(magnitude, number),
    )
}

/// The 15 significant digits of `magnitude` (positive, finite) as
/// `digits × 10^last_place`, the integer form of [`Decimal::of`].
fn digit_integer(magnitude: f64) -> (u64, i32) {
    let rounded = rounded_digits(magnitude, SIGNIFICANT_DIGITS);
    let count = rounded.digits.ilog10() as i32 + 1;
    (rounded.digits, rounded.exponent + 1 - count)
}

/// `digits × 10^last_place` rounded at `places` decimals as [`Decimal::round`]
/// does, as `mantissa × 10^exponent`.
fn round_digit_integer(
    digits: u64,
    last_place: i32,
    places: i32,
    rounding: Rounding,
) -> (u64, i32) {
    let kept_place = places.saturating_neg();
    let dropped = kept_place.saturating_sub(last_place);
    if dropped <= 0 {
        return (digits, last_place);
    }
    // `digits` has at most 15 digits: a unit above ten times them (or past
    // 64 bits) leaves every digit below the kept place, and only a round-up
    // keeps a unit there.
    let dropped_unit = u32::try_from(dropped)
        .ok()
        .and_then(|count| 10u64.checked_pow(count));
    let Some(unit) = dropped_unit.filter(|&unit| unit <= digits.saturating_mul(10)) else {
        return (u64::from(rounding == Rounding::Away), kept_place);
    };
    let kept = digits / unit;
    let rest = digits % unit;
    let round_up = match rounding {
        Rounding::Nearest => rest >= unit / 2,
        Rounding::Away => rest != 0,
        Rounding::Toward => false,
    };
    (kept + u64::from(round_up), kept_place)
}

/// `mantissa × 10^exponent` when both factors are exact doubles: one
/// multiplication or division then rounds once, to the same double that
/// parsing the decimal text gives.
fn exact_value(mantissa: u64, exponent: i32) -> Option<f64> {
    if mantissa >= EXACT_INTEGER_LIMIT {
        return None;
    }
    let power = *EXACT_POWERS_OF_TEN.get(exponent.unsigned_abs() as usize)?;
    let integer = mantissa as f64;
    Some(if exponent < 0 {
        integer / power
    } else {
        integer * power
    })
}

/// `magnitude` with the sign of `number`; a zero result stays positive.
const fn with_sign(magnitude: f64, number: f64) -> f64 {
    if number < 0.0 && magnitude != 0.0 {
        -magnitude
    } else {
        magnitude
    }
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
const fn is_date_letter(ch: char) -> bool {
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
    let last_digit_at = section.tokens[..integer_end]
        .iter()
        .rposition(|token| matches!(token, Token::Digit(_)));
    let first_digit_at = section.tokens[..integer_end]
        .iter()
        .position(|token| matches!(token, Token::Digit(_)));
    let (Some(first_digit), Some(last_digit)) = (first_digit_at, last_digit_at) else {
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
    let mut parts = sections(code);
    // A last section that holds `@` is the text section, which numbers skip.
    // The Text format, `@` alone, shows a number as General would.
    // `contains` is a fast byte search; most codes have no `@`.
    if parts.len() < 4
        && code.contains('@')
        && parts.last().is_some_and(|last| has_text_placeholder(last))
    {
        if parts.len() == 1 {
            return Ok(Some(general_text(number)));
        }
        parts.pop();
    }
    // `contains` is a fast byte search; most codes have no brackets.
    let conditional = if code.contains('[') {
        conditional_section(&parts, number)
    } else {
        None
    };
    let (part, value) = conditional.unwrap_or_else(|| match (parts.len(), number) {
        (1, _) => (parts[0], number),
        (_, value) if value < 0.0 => (parts[1], number.abs()),
        (2.., value) if value == 0.0 && parts.len() >= 3 => (parts[2], number),
        _ => (parts[0], number),
    });
    if let Some(fraction) = Fraction::parse(part) {
        return Ok(Some(fraction.render(value)));
    }
    let Some(section) = parse_section(part) else {
        return Ok(None);
    };
    render(&section, value).map(Some)
}

/// The section that a code with a condition, such as `[>=100]`, chooses
/// for `number`, and the value it shows; `None` when no section has a
/// condition. The first section whose condition `number` meets wins, else
/// the third when the first two have conditions, else the second. A section
/// that only negative numbers meet shows the magnitude, as the negative
/// section does; the others keep the sign. The grid's formatter chooses the
/// same way.
fn conditional_section<'a>(parts: &[&'a str], number: f64) -> Option<(&'a str, f64)> {
    if !parts.iter().any(|part| section_condition(part).is_some()) {
        return None;
    }
    let first_part = *parts.first()?;
    let first = section_condition(first_part);
    let second_part = parts.get(1).copied();
    let second = second_part.and_then(section_condition);
    if let Some(condition) = first.filter(|condition| condition.meets(number)) {
        let negative = parts.len() > 1 && condition.only_negative();
        return Some((first_part, if negative { -number } else { number }));
    }
    if let (Some(part), Some(condition)) = (second_part, second) {
        if condition.meets(number) {
            return Some((
                part,
                if condition.only_negative() {
                    -number
                } else {
                    number
                },
            ));
        }
    }
    let part = match (first, second) {
        (Some(_), Some(_)) => parts.get(2).copied().unwrap_or(first_part),
        (Some(_), None) => second_part.unwrap_or(first_part),
        (None, _) => first_part,
    };
    Some((part, number))
}

/// A comparison in a section's brackets, such as `[<=100]`.
#[derive(Clone, Copy)]
struct Condition {
    operator: Comparison,
    operand: f64,
}

#[derive(Clone, Copy)]
enum Comparison {
    Less,
    LessOrEqual,
    Greater,
    GreaterOrEqual,
    Equal,
    NotEqual,
}

impl Condition {
    /// Reads the text inside the brackets: an operator, optional spaces and
    /// a decimal number, such as `>=100` or `<-2.5`.
    fn parse(content: &str) -> Option<Self> {
        const OPERATORS: [(&str, Comparison); 6] = [
            ("<=", Comparison::LessOrEqual),
            (">=", Comparison::GreaterOrEqual),
            ("<>", Comparison::NotEqual),
            ("<", Comparison::Less),
            (">", Comparison::Greater),
            ("=", Comparison::Equal),
        ];
        let (operator, rest) = OPERATORS.iter().find_map(|&(text, operator)| {
            content.strip_prefix(text).map(|rest| (operator, rest))
        })?;
        let number = rest.trim_start();
        let is_decimal = !number.starts_with('+')
            && number.bytes().all(|byte| {
                byte.is_ascii_digit() || matches!(byte, b'.' | b'-' | b'+' | b'e' | b'E')
            });
        let operand = number.parse().ok().filter(|_| is_decimal)?;
        Some(Self { operator, operand })
    }

    fn meets(self, value: f64) -> bool {
        match self.operator {
            Comparison::Less => value < self.operand,
            Comparison::LessOrEqual => value <= self.operand,
            Comparison::Greater => value > self.operand,
            Comparison::GreaterOrEqual => value >= self.operand,
            Comparison::Equal => value == self.operand,
            Comparison::NotEqual => value != self.operand,
        }
    }

    /// Whether only negative numbers meet the condition.
    fn only_negative(self) -> bool {
        match self.operator {
            Comparison::Less => self.operand <= 0.0,
            Comparison::LessOrEqual | Comparison::Equal => self.operand < 0.0,
            Comparison::Greater | Comparison::GreaterOrEqual | Comparison::NotEqual => false,
        }
    }
}

/// The first condition among the brackets of `section`; colors and other
/// brackets are skipped.
fn section_condition(section: &str) -> Option<Condition> {
    let mut rest = section;
    loop {
        let inside = &rest[bracket_start(rest)? + 1..];
        let close = inside.find(']')?;
        if let Some(condition) = Condition::parse(&inside[..close]) {
            return Some(condition);
        }
        rest = &inside[close + 1..];
    }
}

/// Where the first `[` outside quotes and escapes is.
fn bracket_start(section: &str) -> Option<usize> {
    let mut quoted = false;
    let mut escaped = false;
    section.char_indices().find_map(|(index, ch)| {
        let open = !quoted && !escaped && ch == '[';
        match ch {
            _ if escaped => escaped = false,
            '\\' if !quoted => escaped = true,
            '"' => quoted = !quoted,
            _ => {}
        }
        open.then_some(index)
    })
}

/// Whether a section holds `@`, the text placeholder, outside quotes and escapes.
fn has_text_placeholder(section: &str) -> bool {
    let mut quoted = false;
    let mut escaped = false;
    section.chars().any(|ch| {
        let text = !quoted && !escaped && ch == '@';
        match ch {
            _ if escaped => escaped = false,
            '\\' if !quoted => escaped = true,
            '"' => quoted = !quoted,
            _ => {}
        }
        text
    })
}

fn render(section: &Section<'_>, value: f64) -> Result<String, FormulaError> {
    if section.tokens.contains(&Token::General) {
        let mut text = String::new();
        for token in &section.tokens {
            match token {
                Token::General => text.push_str(&general_text(value)),
                other @ (Token::Literal(_)
                | Token::Digit(_)
                | Token::Point
                | Token::Percent
                | Token::Exponent { .. }) => text.push_str(literal_text(other)),
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

const fn literal_text<'a>(token: &Token<'a>) -> &'a str {
    match token {
        Token::Literal(text) => text,
        Token::Percent => "%",
        Token::Point => ".",
        Token::Digit(_) | Token::Exponent { .. } | Token::General => "",
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
                Token::Literal(_) | Token::Percent | Token::General => {}
            }
        }
        layout
    }
}

/// The mantissa and exponent of a scientific format: the mantissa has as many
/// integer digits as the format has `0` placeholders before the point, and at
/// least one.
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
            other @ (Token::Literal(_) | Token::Percent | Token::General) => {
                text.push_str(literal_text(other))
            }
        }
    }
}

/// The denominator of a fraction format: digit placeholders (`?/??` allows
/// up to 99) or a fixed number (`?/16`).
#[derive(Debug, PartialEq)]
enum Denominator {
    Digits(Vec<char>),
    Fixed(u32),
}

/// A fraction section, such as `# ?/?`, `?/?`, `# ??/100` or `#,##0 ??/??`:
/// literal text, an optional whole-number part, the numerator's and the
/// denominator's placeholders, and literal text after them.
#[derive(Debug)]
struct Fraction {
    prefix: String,
    /// The whole-number part's placeholders, without its grouping commas.
    integer: Option<Vec<char>>,
    grouped: bool,
    separator: String,
    numerator: Vec<char>,
    denominator: Denominator,
    suffix: String,
}

/// The literal text of a stretch of a format code: quoted text, escapes,
/// padding and colours resolved. `None` when it holds a placeholder or a date
/// letter.
fn literal_part(code: &str) -> Option<String> {
    let section = parse_section(code)?;
    let mut text = String::new();
    for token in &section.tokens {
        match token {
            Token::Literal(literal) => text.push_str(literal),
            Token::Point => text.push('.'),
            Token::Percent | Token::Digit(_) | Token::Exponent { .. } | Token::General => {
                return None;
            }
        }
    }
    Some(text)
}

/// The byte index of the fraction's `/` in `code`, outside quotes, escapes
/// and brackets.
fn fraction_slash(code: &str) -> Option<usize> {
    let mut quoted = false;
    let mut escaped = false;
    let mut bracketed = false;
    for (index, ch) in code.char_indices() {
        match ch {
            _ if escaped => escaped = false,
            '\\' if !quoted => escaped = true,
            '"' if !bracketed => quoted = !quoted,
            '[' if !quoted => bracketed = true,
            ']' if bracketed => bracketed = false,
            '/' if !quoted && !bracketed => return Some(index),
            _ => {}
        }
    }
    None
}

const fn is_placeholder(ch: char) -> bool {
    matches!(ch, '0' | '#' | '?')
}

impl Fraction {
    /// The fraction layout of a section, or `None` when it is not one: a `/`
    /// with digit placeholders right before it and placeholders or digits
    /// right after it.
    fn parse(code: &str) -> Option<Self> {
        // A fast byte search first: most codes have no `/`.
        if !code.contains('/') {
            return None;
        }
        let slash = fraction_slash(code)?;
        let (head, tail) = (&code[..slash], &code[slash + 1..]);

        let denominator_len = tail
            .find(|ch: char| !(ch.is_ascii_digit() || ch == '#' || ch == '?'))
            .unwrap_or(tail.len());
        let denominator_text = &tail[..denominator_len];
        let denominator = if denominator_text.is_empty() {
            return None;
        } else if denominator_text.bytes().all(|byte| byte.is_ascii_digit())
            && !denominator_text.starts_with('0')
        {
            Denominator::Fixed(denominator_text.parse().ok()?)
        } else {
            Denominator::Digits(denominator_text.chars().collect())
        };

        let numerator_start = head
            .char_indices()
            .rev()
            .take_while(|&(_, ch)| is_placeholder(ch))
            .last()
            .map(|(index, _)| index)?;
        let numerator = head[numerator_start..].chars().collect();
        let before = &head[..numerator_start];

        // The whole-number part: the last run of placeholders and grouping
        // commas before the numerator, apart from it by literal text.
        let integer_end = before
            .char_indices()
            .rev()
            .find(|&(_, ch)| is_placeholder(ch))
            .map(|(index, ch)| index + ch.len_utf8());
        let (prefix, integer, grouped, separator) = match integer_end {
            Some(end) => {
                let start = before[..end]
                    .char_indices()
                    .rev()
                    .take_while(|&(_, ch)| is_placeholder(ch) || ch == ',')
                    .last()
                    .map_or(end, |(index, _)| index);
                let run = &before[start..end];
                (
                    &before[..start],
                    Some(run.chars().filter(|&ch| ch != ',').collect()),
                    run.contains(','),
                    literal_part(&before[end..])?,
                )
            }
            None => (before, None, false, String::new()),
        };

        Some(Self {
            prefix: literal_part(prefix)?,
            integer,
            grouped,
            separator,
            numerator,
            denominator,
            suffix: literal_part(&tail[denominator_len..])?,
        })
    }

    /// The value written as Excel shows it: an optional whole number, then the
    /// closest fraction the denominator allows. A fraction that rounds to
    /// zero leaves spaces in its place, and one that rounds to a whole
    /// carries into the whole number.
    fn render(&self, value: f64) -> String {
        let magnitude = significant(value.abs());
        let (mut whole, part) = if self.integer.is_some() {
            let whole = magnitude.trunc();
            (whole, significant(magnitude - whole))
        } else {
            (0.0, magnitude)
        };
        let (mut numerator, denominator) = match &self.denominator {
            Denominator::Fixed(denominator) => (
                round_decimal(part * f64::from(*denominator), 0, Rounding::Nearest),
                f64::from(*denominator),
            ),
            Denominator::Digits(digits) => {
                closest_fraction(part, 10_u32.pow(digits.len() as u32) - 1)
            }
        };
        if self.integer.is_some() && numerator >= denominator {
            whole += 1.0;
            numerator = 0.0;
        }

        let mut text = String::new();
        if value < 0.0 && (whole > 0.0 || numerator > 0.0) {
            text.push('-');
        }
        text.push_str(&self.prefix);
        if let Some(placeholders) = &self.integer {
            // Zero has no integer digits.
            let digits = Decimal::of(whole).integer_digits();
            let mut integer = filled_left(&digits, placeholders);
            if integer.trim().is_empty() && numerator == 0.0 {
                integer = "0".into();
            }
            text.push_str(&if self.grouped {
                grouped(&integer)
            } else {
                integer
            });
            text.push_str(&self.separator);
            if numerator == 0.0 {
                let denominator_width = match &self.denominator {
                    Denominator::Digits(digits) => digits.len(),
                    Denominator::Fixed(_) => 0,
                };
                push_spaces(&mut text, self.numerator.len() + 1 + denominator_width);
                text.push_str(&self.suffix);
                return text;
            }
        }
        // Zero has no integer digits; an improper fraction of zero is `0/1`.
        let numerator_digits = Decimal::of(numerator).integer_digits();
        text.push_str(&filled_left(
            if numerator_digits.is_empty() {
                "0"
            } else {
                &numerator_digits
            },
            &self.numerator,
        ));
        text.push('/');
        match &self.denominator {
            Denominator::Fixed(denominator) => text.push_str(&denominator.to_string()),
            Denominator::Digits(placeholders) => {
                text.push_str(&filled_right(
                    &Decimal::of(denominator).integer_digits(),
                    placeholders,
                ));
            }
        }
        text.push_str(&self.suffix);
        text
    }
}

fn push_spaces(text: &mut String, count: usize) {
    text.extend(std::iter::repeat_n(' ', count));
}

/// `digits` right-aligned in the placeholders: `0` pads with a zero, `?`
/// with a space, `#` with nothing. Digits beyond the placeholders stay.
fn filled_left(digits: &str, placeholders: &[char]) -> String {
    let missing = placeholders.len().saturating_sub(digits.len());
    let mut text: String = placeholders[..missing]
        .iter()
        .filter_map(|&placeholder| pad(placeholder))
        .collect();
    text.push_str(digits);
    text
}

/// `digits` left-aligned in the placeholders, padded on the right.
fn filled_right(digits: &str, placeholders: &[char]) -> String {
    let mut text = digits.to_owned();
    if let Some(rest) = placeholders.get(digits.len()..) {
        text.extend(rest.iter().filter_map(|&placeholder| pad(placeholder)));
    }
    text
}

const fn pad(placeholder: char) -> Option<char> {
    match placeholder {
        '0' => Some('0'),
        '?' => Some(' '),
        _ => None,
    }
}

/// The fraction closest to `value` whose denominator is at most
/// `max_denominator`, as numerator and denominator. On a tie the smaller
/// denominator wins. The closest fraction is the last convergent of
/// `value`'s continued fraction within the bound, or the semiconvergent
/// after it, so a few steps find it instead of trying every denominator.
fn closest_fraction(value: f64, max_denominator: u32) -> (f64, f64) {
    let max = f64::from(max_denominator);
    // The two latest convergents, oldest first, starting from 0/1 and 1/0.
    let (mut p0, mut q0, mut p1, mut q1) = (0.0, 1.0, 1.0, 0.0);
    let mut rest = value;
    loop {
        let term = rest.floor();
        let next_q = term * q1 + q0;
        if next_q > max {
            let steps = ((max - q0) / q1).floor();
            let (p, q) = (steps * p1 + p0, steps * q1 + q0);
            let (error, latest) = ((value - p / q).abs(), (value - p1 / q1).abs());
            return if error < latest || (error == latest && q < q1) {
                (p, q)
            } else {
                (p1, q1)
            };
        }
        (p0, q0, p1, q1) = (p1, q1, term * p1 + p0, next_q);
        let fraction = rest - term;
        if fraction == 0.0 || p1 / q1 == value {
            return (p1, q1);
        }
        rest = 1.0 / fraction;
    }
}

#[cfg(test)]
mod tests {
    use super::{round_decimal, significant, Decimal, Rounding};

    const SEED: u64 = 0x9e37_79b9_7f4a_7c15;
    /// Random numbers of each kind. With the edge numbers, every place and
    /// every rounding, the test checks about 30,000 cases, about a second in
    /// a debug build.
    const RANDOM_NUMBERS_PER_KIND: usize = 40;
    /// From far left to far right of the 15 significant digits.
    const PLACES: std::ops::RangeInclusive<i32> = -25..=25;
    /// The limits ROUND accepts, and places beyond every digit of a double.
    const EXTREME_PLACES: [i32; 4] = [-308, 308, -400, 400];
    const ROUNDINGS: [(&str, Rounding); 3] = [
        ("nearest", Rounding::Nearest),
        ("away", Rounding::Away),
        ("toward", Rounding::Toward),
    ];
    /// Decimal scales of everyday numbers, and of every finite magnitude
    /// from subnormal to near `f64::MAX`.
    const NARROW_SCALES: std::ops::RangeInclusive<i32> = -20..=8;
    const WIDE_SCALES: std::ops::RangeInclusive<i32> = -340..=290;
    const MAX_DIGITS: u32 = 17;

    /// The decimal text path that the integer path stands in for, from the
    /// number's digits (`None` when it is not finite).
    fn text_path_round(
        decimal: Option<&Decimal>,
        number: f64,
        places: i32,
        rounding: Rounding,
    ) -> f64 {
        decimal.map_or(number, |digits| {
            digits.clone().round(places, rounding).to_f64()
        })
    }

    /// Halfway decimals, carries, the limits of exact doubles and of exact
    /// powers of ten, huge, tiny and subnormal magnitudes, zeros and
    /// numbers that are not finite.
    fn edge_numbers() -> Vec<f64> {
        let exact_integer_limit = 2f64.powi(53);
        let positive = [
            0.5,
            1.5,
            2.5,
            0.125,
            0.015,
            1.005,
            2.675,
            9.995,
            999.995,
            0.1 + 0.2,
            1.0 / 3.0,
            99_999_999_999_999.5,
            999_999_999_999_999.0,
            exact_integer_limit - 1.0,
            exact_integer_limit,
            exact_integer_limit + 2.0,
            1e22,
            1e22 * 10.0,
            1.234_567_890_123_45 * 1e22,
            1e-22,
            1e-23,
            1e300,
            f64::MAX,
            1e-300,
            f64::MIN_POSITIVE,
            f64::MIN_POSITIVE / 3.0,
            f64::from_bits(1),
        ];
        let mut numbers: Vec<f64> = positive
            .iter()
            .flat_map(|&number| [number, -number])
            .collect();
        numbers.extend([0.0, -0.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY]);
        numbers
    }

    /// A deterministic xorshift generator, so a failure reproduces.
    struct Random(u64);

    impl Random {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }

        /// Any finite double: random sign, exponent and mantissa bits.
        fn finite_bits(&mut self) -> f64 {
            loop {
                let number = f64::from_bits(self.next());
                if number.is_finite() {
                    return number;
                }
            }
        }

        /// Up to 17 random digits at a random scale and sign, sometimes
        /// ending in a 5 to land on a halfway case.
        fn decimal(&mut self, scales: std::ops::RangeInclusive<i32>) -> f64 {
            let digit_count = 1 + (self.next() % u64::from(MAX_DIGITS)) as u32;
            let mut digits = self.next() % 10u64.pow(digit_count);
            if self.next().is_multiple_of(3) {
                digits = digits / 10 * 10 + 5;
            }
            let scale_count = scales.end().abs_diff(*scales.start()) + 1;
            let scale = scales.start() + (self.next() % u64::from(scale_count)) as i32;
            // Two steps, so a tiny scale does not underflow before the digits apply.
            let magnitude = digits as f64 * 10f64.powi(scale / 2) * 10f64.powi(scale - scale / 2);
            if self.next().is_multiple_of(2) {
                -magnitude
            } else {
                magnitude
            }
        }
    }

    fn numbers() -> Vec<f64> {
        let mut random = Random(SEED);
        let mut numbers = edge_numbers();
        for _ in 0..RANDOM_NUMBERS_PER_KIND {
            numbers.push(random.finite_bits());
            numbers.push(random.decimal(NARROW_SCALES));
            numbers.push(random.decimal(WIDE_SCALES));
        }
        numbers
    }

    #[test]
    fn integer_rounding_gives_the_bits_of_the_decimal_text_path() {
        let places: Vec<i32> = PLACES.chain(EXTREME_PLACES).collect();
        for number in numbers() {
            let decimal = number.is_finite().then(|| Decimal::of(number));
            let shown = decimal.as_ref().map_or(number, Decimal::to_f64);
            assert_eq!(
                significant(number).to_bits(),
                shown.to_bits(),
                "significant({number:e})"
            );
            for &place in &places {
                for (name, rounding) in ROUNDINGS {
                    assert_eq!(
                        round_decimal(number, place, rounding).to_bits(),
                        text_path_round(decimal.as_ref(), number, place, rounding).to_bits(),
                        "round {name} ({number:e}, {place})"
                    );
                }
            }
        }
    }
}
