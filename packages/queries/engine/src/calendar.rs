//! ISO 8601 calendar text for the two schema formats; day counts use the proleptic Gregorian calendar.
//!
//! Only `YYYY-MM-DD` and `YYYY-MM-DDTHH:MM:SS[.fraction]` are accepted, so a refresh never
//! depends on a locale or a guessed layout. The day-count arithmetic is the civil-from-days
//! method by Howard Hinnant: <https://howardhinnant.github.io/date_algorithms.html>

use std::fmt::Write;

const MICROS_PER_SECOND: i64 = 1_000_000;
const MICROS_PER_MILLI: i64 = 1_000;
const SECONDS_PER_DAY: i64 = 86_400;
const SECONDS_PER_HOUR: i64 = 3_600;
const SECONDS_PER_MINUTE: i64 = 60;
const DAYS_PER_ERA: i64 = 146_097;
const YEARS_PER_ERA: i64 = 400;
const EPOCH_SHIFT_DAYS: i64 = 719_468;
const MAX_FRACTION_DIGITS: usize = 9;
const MICRO_DIGITS: usize = 6;
const DATE_LENGTH: usize = 10;
const TIME_LENGTH: usize = 8;
const MAX_FOUR_DIGIT_YEAR: i64 = 9_999;

/// Days in each month of a common year; February gains a day in leap years.
const MONTH_DAYS: [u32; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i64, month: u32) -> u32 {
    let days = usize::try_from(month.saturating_sub(1))
        .ok()
        .and_then(|index| MONTH_DAYS.get(index).copied())
        .unwrap_or_default();

    if month == 2 && is_leap(year) {
        days + 1
    } else {
        days
    }
}

/// Whole days from 1970-01-01 for a valid proleptic Gregorian date.
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    // The count runs from March, so January and February belong to the year before.
    let march_year = if month <= 2 { year - 1 } else { year };
    let era = march_year.div_euclid(YEARS_PER_ERA);
    let year_of_era = march_year - era * YEARS_PER_ERA;
    let shifted_month = i64::from((month + 9) % 12);
    let day_of_year = (153 * shifted_month + 2) / 5 + i64::from(day) - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    era * DAYS_PER_ERA + day_of_era - EPOCH_SHIFT_DAYS
}

/// Inverse of `days_from_civil`; every `i64` day count within range has one civil date.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + EPOCH_SHIFT_DAYS;
    let era = shifted.div_euclid(DAYS_PER_ERA);
    let day_of_era = shifted - era * DAYS_PER_ERA;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    let year = year_of_era + era * YEARS_PER_ERA + i64::from(month <= 2);

    (
        year,
        u32::try_from(month).unwrap_or_default(),
        u32::try_from(day).unwrap_or_default(),
    )
}

/// Exactly `count` ASCII digits; signs, spaces and other widths are rejected.
fn digits(bytes: &[u8], start: usize, count: usize) -> Option<u32> {
    let mut value = 0u32;

    for byte in bytes.get(start..start.checked_add(count)?)? {
        if !byte.is_ascii_digit() {
            return None;
        }

        value = value * 10 + u32::from(byte - b'0');
    }

    Some(value)
}

fn date_days(bytes: &[u8]) -> Option<i64> {
    if bytes.get(4) != Some(&b'-') || bytes.get(7) != Some(&b'-') {
        return None;
    }

    let year = i64::from(digits(bytes, 0, 4)?);
    let month = digits(bytes, 5, 2)?;
    let day = digits(bytes, 8, 2)?;

    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return None;
    }

    Some(days_from_civil(year, month, day))
}

/// Date storage uses whole days from the Unix epoch, independent of worksheet serials.
pub(crate) fn date_from_text(value: &str) -> Option<i32> {
    let bytes = value.as_bytes();
    if bytes.len() != DATE_LENGTH {
        return None;
    }

    i32::try_from(date_days(bytes)?).ok()
}

/// Timestamps use microseconds without a zone; digits beyond microseconds are truncated.
pub(crate) fn datetime_from_text(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.get(DATE_LENGTH) != Some(&b'T') {
        return None;
    }

    let days = date_days(bytes.get(..DATE_LENGTH)?)?;
    let time = DATE_LENGTH + 1;
    if bytes.get(time + 2) != Some(&b':') || bytes.get(time + 5) != Some(&b':') {
        return None;
    }

    let hour = i64::from(digits(bytes, time, 2)?);
    let minute = i64::from(digits(bytes, time + 3, 2)?);
    let second = i64::from(digits(bytes, time + 6, 2)?);
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }

    let fraction = bytes.get(time + TIME_LENGTH..)?;
    let micros = fraction_micros(fraction)?;
    let seconds =
        days * SECONDS_PER_DAY + hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE + second;

    seconds.checked_mul(MICROS_PER_SECOND)?.checked_add(micros)
}

/// An empty tail means whole seconds; otherwise a dot and one to nine digits follow.
fn fraction_micros(fraction: &[u8]) -> Option<i64> {
    let Some((&b'.', digits)) = fraction.split_first() else {
        return fraction.is_empty().then_some(0);
    };

    if digits.is_empty() || digits.len() > MAX_FRACTION_DIGITS {
        return None;
    }

    let mut micros = 0i64;
    for (index, byte) in digits.iter().enumerate() {
        if !byte.is_ascii_digit() {
            return None;
        }

        if index < MICRO_DIGITS {
            micros = micros * 10 + i64::from(byte - b'0');
        }
    }

    for _ in digits.len()..MICRO_DIGITS {
        micros *= 10;
    }

    Some(micros)
}

fn write_date(text: &mut String, days: i64) -> Option<()> {
    let (year, month, day) = civil_from_days(days);

    // ISO 8601 expanded years carry a sign outside the four-digit range.
    if (0..=MAX_FOUR_DIGIT_YEAR).contains(&year) {
        write!(text, "{year:04}-{month:02}-{day:02}").ok()
    } else if year > MAX_FOUR_DIGIT_YEAR {
        write!(text, "+{year}-{month:02}-{day:02}").ok()
    } else {
        write!(text, "-{:04}-{month:02}-{day:02}", year.unsigned_abs()).ok()
    }
}

/// Invariant `YYYY-MM-DD` text for stored day counts.
pub(crate) fn format_date(days: i32) -> Option<String> {
    let mut text = String::with_capacity(DATE_LENGTH);
    write_date(&mut text, i64::from(days))?;

    Some(text)
}

/// Invariant text with the shortest of zero, three or six fraction digits.
pub(crate) fn format_datetime(micros: i64) -> Option<String> {
    let seconds = micros.div_euclid(MICROS_PER_SECOND);
    let fraction = micros.rem_euclid(MICROS_PER_SECOND);
    let days = seconds.div_euclid(SECONDS_PER_DAY);
    let second_of_day = seconds.rem_euclid(SECONDS_PER_DAY);
    let mut text = String::with_capacity(DATE_LENGTH + 1 + TIME_LENGTH + 1 + MICRO_DIGITS);

    write_date(&mut text, days)?;
    write!(
        text,
        "T{:02}:{:02}:{:02}",
        second_of_day / SECONDS_PER_HOUR,
        second_of_day % SECONDS_PER_HOUR / SECONDS_PER_MINUTE,
        second_of_day % SECONDS_PER_MINUTE,
    )
    .ok()?;

    if fraction == 0 {
        return Some(text);
    }

    if fraction % MICROS_PER_MILLI == 0 {
        write!(text, ".{:03}", fraction / MICROS_PER_MILLI).ok()?;
    } else {
        write!(text, ".{fraction:06}").ok()?;
    }

    Some(text)
}

#[cfg(test)]
mod tests;
