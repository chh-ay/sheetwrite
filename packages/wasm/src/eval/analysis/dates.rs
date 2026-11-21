//! Extra calendar functions for the full engine.

use super::super::date::{date_parts, date_serial};
use super::super::functions::{integer_arg, require_arity, text_arg, FuncAccumulator};
use super::super::value::{number_from_text, number_from_value};
use crate::types::{EvalResult, FormulaError, Value};

family_functions! {
    DATEDIF,
    ISOWEEKNUM,
    NETWORKDAYS_INTL = "NETWORKDAYS.INTL",
    WORKDAY_INTL = "WORKDAY.INTL",
}
const MAX_SERIAL: i64 = 2_958_465;
const DAYS_PER_WEEK: i64 = 7;
const MONTHS_PER_YEAR: i64 = 12;

const DAYS_COMMON_YEAR: i64 = 365;
type DateResult = Result<i64, FormulaError>;

pub(crate) fn evaluate(function: Function, values: &FuncAccumulator) -> EvalResult {
    calculate(function, values).map_or_else(Value::Error, |result| Value::number(result as f64))
}

fn serial_value(value: &Value) -> DateResult {
    let number = match value {
        Value::Text(text) => match year_first_date(text) {
            Some(serial) => serial,
            None => number_from_text(text)?,
        },
        Value::Number(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => {
            number_from_value(value)?
        }
    };
    if !number.is_finite() || !(0.0..=MAX_SERIAL as f64).contains(&number.trunc()) {
        return Err(FormulaError::Num);
    }
    Ok(number.trunc() as i64)
}

fn year_first_date(text: &str) -> Option<f64> {
    let mut parts = text.trim().split('/');
    let year: i64 = parts.next()?.parse().ok()?;
    let month: i64 = parts.next()?.parse().ok()?;
    let day: i64 = parts.next()?.parse().ok()?;
    if parts.next().is_some() || !(1900..=9999).contains(&year) {
        return None;
    }
    let serial = date_serial(year, month, day).ok()?;
    (date_parts(serial) == Some((year, month, day))).then_some(serial)
}

fn serial_arg(values: &FuncAccumulator, index: usize) -> DateResult {
    serial_value(values.arg_value(index).ok_or(FormulaError::Value)?)
}

fn calculate(function: Function, values: &FuncAccumulator) -> DateResult {
    match function {
        Function::DATEDIF => {
            require_arity(values, 3, 3)?;
            datedif(
                serial_arg(values, 0)?,
                serial_arg(values, 1)?,
                &text_arg(values, 2, None)?,
            )
        }
        Function::ISOWEEKNUM => {
            require_arity(values, 1, 1)?;
            iso_week(serial_arg(values, 0)?)
        }
        Function::NETWORKDAYS_INTL | Function::WORKDAY_INTL => {
            require_arity(values, 2, 4)?;
            let start = serial_arg(values, 0)?;
            let weekend = weekend_mask(values)?;
            let holidays = holidays(values, &weekend)?;
            if function == Function::NETWORKDAYS_INTL {
                let end = serial_arg(values, 1)?;
                if start <= end {
                    Ok(workday_count(start, end, &weekend, &holidays))
                } else {
                    Ok(-workday_count(end, start, &weekend, &holidays))
                }
            } else {
                let offset = integer_arg(values, 1, None)?;
                workday_offset(start, offset, &weekend, &holidays)
            }
        }
    }
}

// Masks start on Monday. The serial calendar retains Excel's false leap day.
const fn weekday(serial: i64) -> usize {
    (serial + 5).rem_euclid(DAYS_PER_WEEK) as usize
}

fn weekend_mask(values: &FuncAccumulator) -> Result<[bool; 7], FormulaError> {
    if let Some(Value::Text(mask)) = values.arg_value(2) {
        if mask.len() != DAYS_PER_WEEK as usize
            || !mask.bytes().all(|byte| byte == b'0' || byte == b'1')
        {
            return Err(FormulaError::Value);
        }
        let mut weekend = [false; 7];
        for (index, byte) in mask.bytes().enumerate() {
            weekend[index] = byte == b'1';
        }
        return Ok(weekend);
    }
    let code = integer_arg(values, 2, Some(1))?;
    let mut weekend = [false; 7];
    match code {
        1..=7 => {
            let first = ((code + 4) % DAYS_PER_WEEK) as usize;
            weekend[first] = true;
            weekend[(first + 1) % DAYS_PER_WEEK as usize] = true;
        }
        11..=17 => {
            weekend[((code - 5) % DAYS_PER_WEEK) as usize] = true;
        }
        _ => return Err(FormulaError::Num),
    }
    Ok(weekend)
}

fn holidays(values: &FuncAccumulator, weekend: &[bool; 7]) -> Result<Vec<i64>, FormulaError> {
    let entries = values.arg(3).unwrap_or_default();
    let mut working_holidays = Vec::new();
    working_holidays
        .try_reserve(entries.len())
        .map_err(|_| FormulaError::Num)?;
    for entry in entries {
        if matches!(entry.value, Value::Blank) {
            continue;
        }
        let serial = serial_value(&entry.value)?;
        if !weekend[weekday(serial)] {
            working_holidays.push(serial);
        }
    }
    working_holidays.sort_unstable();
    working_holidays.dedup();
    Ok(working_holidays)
}

fn workday_count(start: i64, end: i64, weekend: &[bool; 7], holidays: &[i64]) -> i64 {
    let length = end - start + 1;
    let per_week = weekend.iter().filter(|&&is_weekend| !is_weekend).count() as i64;
    let mut count = length / DAYS_PER_WEEK * per_week;
    for offset in 0..length % DAYS_PER_WEEK {
        count += i64::from(!weekend[weekday(start + offset)]);
    }
    // Sorted working-day holidays let every search count its interval in logarithmic time.
    let first = holidays.partition_point(|&holiday| holiday < start);
    let last = holidays.partition_point(|&holiday| holiday <= end);
    count - (last - first) as i64
}

fn workday_offset(start: i64, offset: i64, weekend: &[bool; 7], holidays: &[i64]) -> DateResult {
    if weekend.iter().all(|&is_weekend| is_weekend) {
        return Err(FormulaError::Value);
    }
    if offset == 0 {
        return Ok(start);
    }
    let direction = offset.signum();
    let remaining = offset.unsigned_abs();
    let mut low = 1;
    let mut high = if direction > 0 {
        MAX_SERIAL - start
    } else {
        start
    };
    let count = |distance| {
        if direction > 0 {
            workday_count(start + 1, start + distance, weekend, holidays)
        } else {
            workday_count(start - distance, start - 1, weekend, holidays)
        }
    };
    if high == 0 || remaining > count(high) as u64 {
        return Err(FormulaError::Num);
    }
    while low < high {
        let middle = low + (high - low) / 2;
        if (count(middle) as u64) < remaining {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    Ok(start + direction * low)
}

fn iso_week(serial: i64) -> DateResult {
    // Remove the false leap day before computing the Gregorian week.
    let gregorian_serial = if serial <= 60 { serial + 1 } else { serial };
    let thursday = gregorian_serial + 3 - weekday(gregorian_serial) as i64;
    let calendar_thursday = if thursday <= 60 {
        thursday - 1
    } else {
        thursday
    };
    let iso_year = date_parts(calendar_thursday as f64)
        .ok_or(FormulaError::Num)?
        .0;
    let january_fourth = if iso_year == 1899 {
        // DATE treats years below 1900 as offsets from 1900.
        date_serial(1900, 1, 4)? as i64 + 1 - DAYS_COMMON_YEAR
    } else {
        let serial = date_serial(iso_year, 1, 4)? as i64;
        if serial < 60 {
            serial + 1
        } else {
            serial
        }
    };
    let first_monday = january_fourth - weekday(january_fourth) as i64;
    Ok((gregorian_serial - first_monday) / DAYS_PER_WEEK + 1)
}

fn datedif(start: i64, end: i64, unit: &str) -> DateResult {
    if start > end {
        return Err(FormulaError::Num);
    }
    let (start_year, start_month, start_day) = date_parts(start as f64).ok_or(FormulaError::Num)?;
    let (end_year, end_month, end_day) = date_parts(end as f64).ok_or(FormulaError::Num)?;
    let months = (end_year - start_year) * MONTHS_PER_YEAR + end_month
        - start_month
        - i64::from(end_day < start_day);
    match unit {
        _ if unit.eq_ignore_ascii_case("D") => Ok(end - start),
        _ if unit.eq_ignore_ascii_case("M") => Ok(months),
        _ if unit.eq_ignore_ascii_case("Y") => Ok(months / MONTHS_PER_YEAR),
        _ if unit.eq_ignore_ascii_case("YM") => Ok(months % MONTHS_PER_YEAR),
        _ if unit.eq_ignore_ascii_case("MD") => {
            if end_day >= start_day {
                return Ok(end_day - start_day);
            }
            let previous_last = date_serial(end_year, end_month, 1)? as i64 - 1;
            let previous_days = date_parts(previous_last as f64).ok_or(FormulaError::Num)?.2;
            Ok(previous_days + end_day - start_day)
        }
        _ if unit.eq_ignore_ascii_case("YD") => {
            let anniversary_year =
                start_year + i64::from((end_month, end_day) < (start_month, start_day));
            let anniversary = if anniversary_year == 1899 {
                date_serial(1900, end_month, end_day)? as i64
                    - DAYS_COMMON_YEAR
                    - i64::from(end_month > 2)
            } else {
                date_serial(anniversary_year, end_month, end_day)? as i64
            };
            Ok(anniversary - start)
        }
        _ => Err(FormulaError::Num),
    }
}
