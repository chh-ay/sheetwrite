//! Extra calendar functions for the full engine.

use std::collections::HashSet;
use crate::types::{EvalResult, FormulaError, Value};
use super::super::date::{date_parts, date_serial, parse_date_value};
use super::super::functions::{integer_arg, require_arity, text_arg, FuncAccumulator};
use super::super::value::number_from_value;

pub(crate) const NAMES: &[&str] = &["DATEDIF", "ISOWEEKNUM", "NETWORKDAYS.INTL", "WORKDAY.INTL"];
const MAX_SERIAL: i64 = 2_958_465;
const DAYS_PER_WEEK: i64 = 7;
const MONTHS_PER_YEAR: i64 = 12;

const DAYS_COMMON_YEAR: i64 = 365;
type DateResult = Result<i64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    calculate(name, values).map_or_else(Value::Error, |result| Value::number(result as f64))
}

fn serial_value(value: &Value) -> DateResult {
    let number = match value {
        Value::Text(text) => parse_date_value(text)
            .or_else(|| year_first_date(text))
            .or_else(|| text.trim().parse::<f64>().ok()).ok_or(FormulaError::Value)?,
        _ => number_from_value(value)?,
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
    if parts.next().is_some() || !(1900..=9999).contains(&year) { return None; }
    let serial = date_serial(year, month, day).ok()?;
    (date_parts(serial) == Some((year, month, day))).then_some(serial)
}

fn serial_arg(values: &FuncAccumulator, index: usize) -> DateResult {
    serial_value(values.arg_value(index).ok_or(FormulaError::Value)?)
}

fn calculate(name: &str, values: &FuncAccumulator) -> DateResult {
    match name {
        "DATEDIF" => {
            require_arity(values, 3, 3)?;
            datedif(serial_arg(values, 0)?, serial_arg(values, 1)?, &text_arg(values, 2, None)?)
        }
        "ISOWEEKNUM" => {
            require_arity(values, 1, 1)?;
            iso_week(serial_arg(values, 0)?)
        }
        "NETWORKDAYS.INTL" | "WORKDAY.INTL" => {
            require_arity(values, 2, 4)?;
            let start = serial_arg(values, 0)?;
            let weekend = weekend_mask(values)?;
            let holidays = holidays(values)?;
            if name == "NETWORKDAYS.INTL" {
                let end = serial_arg(values, 1)?;
                if start <= end { Ok(workday_count(start, end, &weekend, &holidays)) }
                else { Ok(-workday_count(end, start, &weekend, &holidays)) }
            } else {
                let offset = integer_arg(values, 1, None)?;
                workday_offset(start, offset, &weekend, &holidays)
            }
        }
        _ => Err(FormulaError::Name),
    }
}

// Masks start on Monday. The serial calendar retains Excel's false leap day.
fn weekday(serial: i64) -> usize { (serial + 5).rem_euclid(DAYS_PER_WEEK) as usize }

fn weekend_mask(values: &FuncAccumulator) -> Result<[bool; 7], FormulaError> {
    if let Some(Value::Text(mask)) = values.arg_value(2) {
        if mask.len() != DAYS_PER_WEEK as usize || !mask.bytes().all(|byte| byte == b'0' || byte == b'1') {
            return Err(FormulaError::Value);
        }
        let mut weekend = [false; 7];
        for (index, byte) in mask.bytes().enumerate() { weekend[index] = byte == b'1'; }
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
        11..=17 => { weekend[((code - 5) % DAYS_PER_WEEK) as usize] = true; }
        _ => return Err(FormulaError::Num),
    }
    Ok(weekend)
}

fn holidays(values: &FuncAccumulator) -> Result<HashSet<i64>, FormulaError> {
    let entries = values.arg(3).unwrap_or_default();
    let mut result = HashSet::new();
    result.try_reserve(entries.len()).map_err(|_| FormulaError::Num)?;
    for entry in entries {
        if matches!(entry.value, Value::Blank) { continue; }
        result.insert(serial_value(&entry.value)?);
    }
    Ok(result)
}

fn workday_count(start: i64, end: i64, weekend: &[bool; 7], holidays: &HashSet<i64>) -> i64 {
    let length = end - start + 1;
    let per_week = weekend.iter().filter(|&&is_weekend| !is_weekend).count() as i64;
    let mut count = length / DAYS_PER_WEEK * per_week;
    for offset in 0..length % DAYS_PER_WEEK {
        count += i64::from(!weekend[weekday(start + offset)]);
    }
    for &holiday in holidays {
        if (start..=end).contains(&holiday) && !weekend[weekday(holiday)] { count -= 1; }
    }
    count
}

fn workday_offset(start: i64, offset: i64, weekend: &[bool; 7], holidays: &HashSet<i64>) -> DateResult {
    if weekend.iter().all(|&is_weekend| is_weekend) { return Err(FormulaError::Value); }
    if offset == 0 { return Ok(start); }
    let direction = offset.signum();
    let remaining = offset.unsigned_abs();
    let mut low = 1;
    let mut high = if direction > 0 { MAX_SERIAL - start } else { start };
    let count = |distance| {
        if direction > 0 { workday_count(start + 1, start + distance, weekend, holidays) }
        else { workday_count(start - distance, start - 1, weekend, holidays) }
    };
    if high == 0 || remaining > count(high) as u64 { return Err(FormulaError::Num); }
    while low < high {
        let middle = low + (high - low) / 2;
        if (count(middle) as u64) < remaining { low = middle + 1; }
        else { high = middle; }
    }
    Ok(start + direction * low)
}

fn iso_week(serial: i64) -> DateResult {
    // Remove the false leap day before computing the Gregorian week.
    let gregorian_serial = if serial <= 60 { serial + 1 } else { serial };
    let thursday = gregorian_serial + 3 - weekday(gregorian_serial) as i64;
    let calendar_thursday = if thursday <= 60 { thursday - 1 } else { thursday };
    let iso_year = date_parts(calendar_thursday as f64).ok_or(FormulaError::Num)?.0;
    let january_fourth = if iso_year == 1899 {
        // DATE treats years below 1900 as offsets from 1900.
        date_serial(1900, 1, 4)? as i64 + 1 - DAYS_COMMON_YEAR
    } else {
        let serial = date_serial(iso_year, 1, 4)? as i64;
        if serial < 60 { serial + 1 } else { serial }
    };
    let first_monday = january_fourth - weekday(january_fourth) as i64;
    Ok((gregorian_serial - first_monday) / DAYS_PER_WEEK + 1)
}

fn datedif(start: i64, end: i64, unit: &str) -> DateResult {
    if start > end { return Err(FormulaError::Num); }
    let (start_year, start_month, start_day) = date_parts(start as f64).ok_or(FormulaError::Num)?;
    let (end_year, end_month, end_day) = date_parts(end as f64).ok_or(FormulaError::Num)?;
    let months = (end_year - start_year) * MONTHS_PER_YEAR + end_month - start_month - i64::from(end_day < start_day);
    match unit {
        unit if unit.eq_ignore_ascii_case("D") => Ok(end - start),
        unit if unit.eq_ignore_ascii_case("M") => Ok(months),
        unit if unit.eq_ignore_ascii_case("Y") => Ok(months / MONTHS_PER_YEAR),
        unit if unit.eq_ignore_ascii_case("YM") => Ok(months % MONTHS_PER_YEAR),
        unit if unit.eq_ignore_ascii_case("MD") => {
            if end_day >= start_day { return Ok(end_day - start_day); }
            let previous_last = date_serial(end_year, end_month, 1)? as i64 - 1;
            let previous_days = date_parts(previous_last as f64).ok_or(FormulaError::Num)?.2;
            Ok(previous_days + end_day - start_day)
        }
        unit if unit.eq_ignore_ascii_case("YD") => {
            let anniversary_year = start_year + i64::from((end_month, end_day) < (start_month, start_day));
            let anniversary = if anniversary_year == 1899 {
                date_serial(1900, end_month, end_day)? as i64
                    - DAYS_COMMON_YEAR - i64::from(end_month > 2)
            } else { date_serial(anniversary_year, end_month, end_day)? as i64 };
            Ok(anniversary - start)
        }
        _ => Err(FormulaError::Num),
    }
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    fn results(formulas: &[&str], holidays: &[f64]) -> Vec<crate::store::CellOut> {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, formulas.len().max(holidays.len()));
        for (row, &holiday) in holidays.iter().enumerate() { store.set_number(sheet, row, 0, holiday, 0); }
        for (row, formula) in formulas.iter().enumerate() { store.set_formula(sheet, row, 1, formula, 0); }
        store.recompute(sheet);
        (0..formulas.len()).map(|row| store.get_cell(sheet, row, 1)).collect()
    }

    #[test]
    fn microsoft_calendar_examples() {
        // https://support.microsoft.com/en-us/excel/functions/networkdays-intl-function
        // https://support.microsoft.com/en-us/office/workday-intl-function-a378391c-9ba7-4678-8a39-39611a9bf81d
        // https://support.microsoft.com/en-us/office/isoweeknum-function-1c2d0afe-d25b-4ab1-8894-8d0520e90e0e
        // https://support.microsoft.com/en-us/office/datedif-function-25dba1a4-2812-480b-84dd-8b32a451b35c
        let actual = results(&[
            "=NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,1,31))",
            "=NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,1,31),7)",
            "=WORKDAY.INTL(DATE(2012,1,1),90,11)",
            "=ISOWEEKNUM(DATE(2012,3,9))",
            "=DATEDIF(DATE(2001,1,1),DATE(2003,1,1),\"Y\")",
            "=DATEDIF(DATE(2001,6,1),DATE(2002,8,15),\"D\")",
        ], &[]);
        for (value, expected) in actual.iter().zip([22.0, 23.0, 41013.0, 10.0, 2.0, 440.0]) { assert_eq!(value.num(), expected); }
    }

    #[test]
    fn holidays_masks_reverse_dates_and_serial_leap_day() {
        let actual = results(&[
            "=NETWORKDAYS.INTL(61,67,\"0000011\",A1:A3)",
            "=NETWORKDAYS.INTL(67,61,1,A1:A3)",
            "=WORKDAY.INTL(61,1,1,A1:A3)",
            "=WORKDAY.INTL(65,-1,1,A1:A3)",
            "=NETWORKDAYS.INTL(59,61,\"0000000\")",
            "=DATEDIF(59,61,\"D\")",
            "=DATEDIF(60,61,\"MD\")",
            "=ISOWEEKNUM(DATE(2021,1,1))",
            "=DATEDIF(DATE(2020,2,29),DATE(2021,2,28),\"M\")",
            "=DATEDIF(DATE(2020,2,29),DATE(2021,3,1),\"YM\")",
            "=DATEDIF(DATE(2020,6,1),DATE(2022,8,15),\"YD\")",
            "=DATEDIF(\"2001/6/1\",\"2002/8/15\",\"YD\")",
            "=ISOWEEKNUM(0)",
            "=NETWORKDAYS.INTL(1,7,\"1111111\")",
            "=DATEDIF(0,366,\"YD\")",
        ], &[62.0, 62.0, 64.0]);
        for (value, expected) in actual.iter().zip([4.0, -4.0, 65.0, 61.0, 3.0, 2.0, 1.0, 53.0, 11.0, 0.0, 75.0, 75.0, 52.0, 0.0, 0.0]) { assert_eq!(value.num(), expected); }
    }

    #[test]
    fn documented_date_errors() {
        let actual = results(&[
            "=NETWORKDAYS.INTL(1,5,0)", "=NETWORKDAYS.INTL(1,5,\"000001\")",
            "=WORKDAY.INTL(1,1,\"1111111\")", "=WORKDAY.INTL(1,-2)",
            "=DATEDIF(2,1,\"D\")", "=DATEDIF(1,2,\"Q\")", "=ISOWEEKNUM(-1)",
            "=NETWORKDAYS.INTL(1,5,1,A1)",
        ], &[-1.0]);
        for (value, expected) in actual.iter().zip(["#NUM!", "#VALUE!", "#VALUE!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!"]) { assert_eq!(value.string().as_deref(), Some(expected)); }
    }
}
