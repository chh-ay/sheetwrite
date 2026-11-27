//! Financial functions that are not part of the default engine.

use super::super::functions::{integer_arg, number_arg, require_arity, FuncAccumulator, FuncValue};
use super::super::lift::ValueArgs;
use super::super::value::aggregate_number;
use crate::types::{EvalResult, FormulaError, Value};

family_functions! {
    CUMIPMT,
    CUMPRINC,
    DB,
    DDB,
    DOLLARDE,
    DOLLARFR,
    EFFECT,
    FVSCHEDULE,
    ISPMT,
    MIRR,
    NOMINAL,
    NPER,
    PDURATION,
    RRI,
    SLN,
    SYD,
    XIRR,
    XNPV,
}

/// The arguments of `function` that take one value: every argument, except
/// the schedules, cash flows and dates, which are ranges or arrays.
pub(super) const fn value_args(function: Function) -> ValueArgs {
    match function {
        Function::FVSCHEDULE | Function::XNPV => ValueArgs::at(&[0]),
        Function::MIRR => ValueArgs::at(&[1, 2]),
        Function::XIRR => ValueArgs::at(&[2]),
        Function::CUMIPMT
        | Function::CUMPRINC
        | Function::DB
        | Function::DDB
        | Function::DOLLARDE
        | Function::DOLLARFR
        | Function::EFFECT
        | Function::ISPMT
        | Function::NOMINAL
        | Function::NPER
        | Function::PDURATION
        | Function::RRI
        | Function::SLN
        | Function::SYD => ValueArgs::ALL,
    }
}

const DAYS_PER_YEAR: f64 = 365.0;
const MONTHS_PER_YEAR: f64 = 12.0;
const LAST_DATE_SERIAL: f64 = 2_958_465.0;
const XIRR_DEFAULT_GUESS: f64 = 0.1;
const XIRR_MAX_ITERATIONS: usize = 100;
const XIRR_TOLERANCE: f64 = 1e-8;
const DB_RATE_PRECISION: f64 = 1000.0;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(function: Function, arguments: &FuncAccumulator) -> EvalResult {
    match calculate(function, arguments) {
        Ok(number) if number.is_finite() => Value::number(number),
        Ok(_) => Value::Error(FormulaError::Num),
        Err(error) => Value::Error(error),
    }
}

fn calculate(function: Function, arguments: &FuncAccumulator) -> NumberResult {
    match function {
        Function::NPER => periods(arguments),
        Function::CUMIPMT | Function::CUMPRINC => {
            cumulative(arguments, function == Function::CUMIPMT)
        }
        Function::DB | Function::DDB => depreciation(arguments, function == Function::DB),
        Function::XNPV | Function::XIRR => dated_return(arguments, function == Function::XIRR),
        Function::MIRR => modified_return(arguments),
        Function::FVSCHEDULE => scheduled_value(arguments),
        Function::DOLLARDE | Function::DOLLARFR => {
            dollar_fraction(arguments, function == Function::DOLLARDE)
        }
        Function::ISPMT => {
            require_arity(arguments, 4, 4)?;
            let rate = number_arg(arguments, 0, None)?;
            let period = number_arg(arguments, 1, None)?;
            let periods = number_arg(arguments, 2, None)?;
            let present = number_arg(arguments, 3, None)?;
            if periods == 0.0 {
                return Err(FormulaError::DivZero);
            }
            Ok(present * rate * (period / periods - 1.0))
        }
        Function::EFFECT | Function::NOMINAL => {
            require_arity(arguments, 2, 2)?;
            let rate = number_arg(arguments, 0, None)?;
            let whole_periods = integer_arg(arguments, 1, None)?;
            if rate <= 0.0 || whole_periods < 1 {
                return Err(FormulaError::Num);
            }
            let periods = whole_periods as f64;
            Ok(if function == Function::EFFECT {
                (periods * (rate / periods).ln_1p()).exp_m1()
            } else {
                periods * (rate.ln_1p() / periods).exp_m1()
            })
        }
        Function::RRI | Function::PDURATION => {
            require_arity(arguments, 3, 3)?;
            let rate_or_periods = number_arg(arguments, 0, None)?;
            let present = number_arg(arguments, 1, None)?;
            let future = number_arg(arguments, 2, None)?;
            if rate_or_periods <= 0.0 {
                return Err(FormulaError::Num);
            }
            if function == Function::RRI {
                if present == 0.0 {
                    return Err(FormulaError::DivZero);
                }
                if future / present < 0.0 {
                    return Err(FormulaError::Num);
                }
            } else if present <= 0.0 || future <= 0.0 {
                return Err(FormulaError::Num);
            }
            Ok(if function == Function::RRI {
                ((future / present).ln() / rate_or_periods).exp_m1()
            } else {
                (future.ln() - present.ln()) / rate_or_periods.ln_1p()
            })
        }
        Function::SLN | Function::SYD => {
            let arity = if function == Function::SLN { 3 } else { 4 };
            require_arity(arguments, arity, arity)?;
            let cost = number_arg(arguments, 0, None)?;
            let salvage = number_arg(arguments, 1, None)?;
            let life = number_arg(arguments, 2, None)?;
            if function == Function::SLN {
                if life == 0.0 {
                    return Err(FormulaError::DivZero);
                }
                Ok((cost - salvage) / life)
            } else {
                let period = number_arg(arguments, 3, None)?;
                if life <= 0.0 || period <= 0.0 || period > life {
                    return Err(FormulaError::Num);
                }
                Ok((cost - salvage) * (life - period + 1.0) * 2.0 / (life * (life + 1.0)))
            }
        }
    }
}

fn periods(arguments: &FuncAccumulator) -> NumberResult {
    require_arity(arguments, 3, 5)?;
    let rate = number_arg(arguments, 0, None)?;
    let payment = number_arg(arguments, 1, None)?;
    let present = number_arg(arguments, 2, None)?;
    let future = number_arg(arguments, 3, Some(0.0))?;
    let timing = if number_arg(arguments, 4, Some(0.0))? == 0.0 {
        0.0
    } else {
        1.0
    };
    if rate == 0.0 {
        if payment == 0.0 {
            return Err(FormulaError::DivZero);
        }
        return Ok(-(present + future) / payment);
    }
    if rate <= -1.0 {
        return Err(FormulaError::Num);
    }
    let annuity = payment * (1.0 + rate * timing) / rate;
    let denominator = present + annuity;
    if denominator == 0.0 {
        return Err(FormulaError::Num);
    }
    let ratio = (annuity - future) / denominator;
    if ratio <= 0.0 {
        return Err(FormulaError::Num);
    }
    Ok(ratio.ln() / rate.ln_1p())
}

fn cumulative(arguments: &FuncAccumulator, is_interest: bool) -> NumberResult {
    require_arity(arguments, 6, 6)?;
    let rate = number_arg(arguments, 0, None)?;
    let periods = number_arg(arguments, 1, None)?.trunc();
    let present = number_arg(arguments, 2, None)?;
    let start = number_arg(arguments, 3, None)?.trunc();
    let end = number_arg(arguments, 4, None)?.trunc();
    let timing = number_arg(arguments, 5, None)?;
    if rate <= 0.0
        || periods <= 0.0
        || present <= 0.0
        || start < 1.0
        || end < start
        || end > periods
        || (timing != 0.0 && timing != 1.0)
    {
        return Err(FormulaError::Num);
    }
    let log_growth = rate.ln_1p();
    let growth_minus_one = (periods * log_growth).exp_m1();
    let payment = -present * rate * (1.0 + 1.0 / growth_minus_one) / (1.0 + rate * timing);
    let balance = |paid: f64| {
        if paid == 0.0 {
            return present;
        }
        let growth_minus_one = (paid * log_growth).exp_m1();
        present * (growth_minus_one + 1.0) / (1.0 + rate * timing)
            + payment * growth_minus_one / rate
    };
    let principal = balance(end) - balance(start - 1.0);
    Ok(if is_interest {
        payment * (end - start + 1.0) - principal
    } else {
        principal
    })
}

fn depreciation(arguments: &FuncAccumulator, is_fixed: bool) -> NumberResult {
    require_arity(arguments, 4, 5)?;
    let cost = number_arg(arguments, 0, None)?;
    let salvage = number_arg(arguments, 1, None)?;
    let life = number_arg(arguments, 2, None)?;
    let period = number_arg(arguments, 3, None)?;
    if cost < 0.0 || salvage < 0.0 || life <= 0.0 || period <= 0.0 {
        return Err(FormulaError::Num);
    }
    if is_fixed {
        let month = integer_arg(arguments, 4, Some(12))? as f64;
        let whole_period = period.trunc();
        if month < 1.0
            || month > MONTHS_PER_YEAR
            || whole_period < 1.0
            || whole_period > life + if month < MONTHS_PER_YEAR { 1.0 } else { 0.0 }
        {
            return Err(FormulaError::Num);
        }
        if cost == 0.0 {
            return Ok(0.0);
        }
        let rate = ((1.0 - (salvage / cost).powf(1.0 / life)) * DB_RATE_PRECISION).round()
            / DB_RATE_PRECISION;
        let first = cost * rate * month / MONTHS_PER_YEAR;
        if whole_period == 1.0 {
            return Ok(first);
        }
        let depreciation = (cost - first) * (1.0 - rate).powf(whole_period - 2.0) * rate;
        Ok(if whole_period > life {
            depreciation * (MONTHS_PER_YEAR - month) / MONTHS_PER_YEAR
        } else {
            depreciation
        })
    } else {
        let factor = number_arg(arguments, 4, Some(2.0))?;
        if factor <= 0.0 || period > life {
            return Err(FormulaError::Num);
        }
        if cost <= salvage {
            return Ok(0.0);
        }
        let rate = (factor / life).min(1.0);
        let previous = if rate == 1.0 {
            if period <= 1.0 {
                cost
            } else {
                0.0
            }
        } else {
            cost * (1.0 - rate).powf(period - 1.0)
        };
        Ok((previous * rate).min(previous - salvage).max(0.0))
    }
}

/// DOLLARDE and DOLLARFR(dollar, fraction). The fraction is truncated. A
/// truncated fraction below 0 is `#NUM!`, and one of 0 is `#DIV/0!`. The
/// fractional part is read and written as digits over the next power of 10
/// at or above the fraction, so 1.02 with fraction 16 means 1 and 2/16.
fn dollar_fraction(arguments: &FuncAccumulator, is_decimal: bool) -> NumberResult {
    require_arity(arguments, 2, 2)?;
    let dollar = number_arg(arguments, 0, None)?;
    let fraction = number_arg(arguments, 1, None)?.trunc();
    if fraction < 0.0 {
        return Err(FormulaError::Num);
    }
    if fraction == 0.0 {
        return Err(FormulaError::DivZero);
    }
    let whole = dollar.trunc();
    let part = dollar - whole;
    let digits = 10f64.powf(fraction.log10().ceil());
    Ok(if is_decimal {
        whole + part * digits / fraction
    } else {
        whole + part * fraction / digits
    })
}

fn scheduled_value(arguments: &FuncAccumulator) -> NumberResult {
    require_arity(arguments, 2, 2)?;
    let mut future = number_arg(arguments, 0, None)?;
    for entry in arguments.arg(1).unwrap_or_default() {
        match &entry.value {
            Value::Number(rate) => future *= 1.0 + rate,
            Value::Blank => (),
            Value::Error(error) => return Err(*error),
            Value::Text(_) | Value::Bool(_) => return Err(FormulaError::Value),
        }
    }
    Ok(future)
}

fn modified_return(arguments: &FuncAccumulator) -> NumberResult {
    require_arity(arguments, 3, 3)?;
    let cash_flows = arguments.arg(0).unwrap_or_default();
    let finance_rate = number_arg(arguments, 1, None)?;
    let reinvest_rate = number_arg(arguments, 2, None)?;
    if finance_rate <= -1.0 || reinvest_rate <= -1.0 {
        return Err(FormulaError::Num);
    }
    let mut cash_count = 0usize;
    let mut discount = 1.0;
    let mut negative_present = 0.0;
    let mut positive_future = 0.0;
    for entry in cash_flows {
        let Some(cash) = aggregate_number(&entry.value, entry.from_range)? else {
            continue;
        };
        if cash < 0.0 {
            negative_present += cash / discount;
        }
        positive_future = positive_future * (1.0 + reinvest_rate) + cash.max(0.0);
        discount *= 1.0 + finance_rate;
        cash_count += 1;
    }
    if cash_count < 2 || negative_present == 0.0 || positive_future == 0.0 {
        return Err(FormulaError::DivZero);
    }
    let last_period = (cash_count - 1) as f64;
    Ok((-positive_future / negative_present).powf(1.0 / last_period) - 1.0)
}

const fn list_number(entry: &FuncValue) -> NumberResult {
    match &entry.value {
        Value::Number(number) if number.is_finite() => Ok(*number),
        Value::Blank => Ok(0.0),
        Value::Error(error) => Err(*error),
        Value::Number(_) | Value::Text(_) | Value::Bool(_) => Err(FormulaError::Value),
    }
}

fn dated_return(arguments: &FuncAccumulator, is_internal: bool) -> NumberResult {
    require_arity(arguments, if is_internal { 2 } else { 3 }, 3)?;
    let cash_index = if is_internal { 0 } else { 1 };
    let cash_flows = arguments.arg(cash_index).unwrap_or_default();
    let dates = arguments.arg(cash_index + 1).unwrap_or_default();
    if cash_flows.is_empty() || cash_flows.len() != dates.len() {
        return Err(FormulaError::Num);
    }
    let first_date = list_number(&dates[0])?.trunc();
    let mut has_positive = false;
    let mut has_negative = false;
    let mut cash_scale = 0.0;
    let mut last_date = first_date;
    for (cash_cell, date_cell) in cash_flows.iter().zip(dates) {
        let cash = list_number(cash_cell)?;
        let date = list_number(date_cell)?.trunc();
        if !(0.0..=LAST_DATE_SERIAL).contains(&date) {
            return Err(FormulaError::Value);
        }
        if date < first_date {
            return Err(FormulaError::Num);
        }
        has_positive |= cash > 0.0;
        has_negative |= cash < 0.0;
        cash_scale += cash.abs();
        last_date = last_date.max(date);
    }
    let mut rate = number_arg(
        arguments,
        if is_internal { 2 } else { 0 },
        if is_internal {
            Some(XIRR_DEFAULT_GUESS)
        } else {
            None
        },
    )?;
    if rate <= -1.0 {
        return Err(FormulaError::Num);
    }
    let date_count = (last_date - first_date) as usize + 1;
    // Cache one power per day of the date span only when the span is dense, with at least
    // two cash flows per day. Otherwise one power per cash flow costs less.
    let mut cached_powers = (date_count <= cash_flows.len() / 2).then(|| {
        let years = (0..date_count)
            .map(|days| days as f64 / DAYS_PER_YEAR)
            .collect::<Vec<_>>();
        (years, vec![0.0; date_count])
    });
    let mut discount = |rate| match &mut cached_powers {
        Some((years, powers)) => {
            discounted_cached(cash_flows, dates, first_date, years, powers, rate)
        }
        None => discounted(cash_flows, dates, first_date, rate),
    };
    if !is_internal {
        return Ok(discount(rate).0);
    }
    if !has_positive || !has_negative {
        return Err(FormulaError::Num);
    }
    for _ in 0..XIRR_MAX_ITERATIONS {
        let (present, derivative) = discount(rate);
        if !present.is_finite() || !derivative.is_finite() || derivative == 0.0 {
            return Err(FormulaError::Num);
        }
        let next = rate - present / derivative;
        if !next.is_finite() || next <= -1.0 {
            return Err(FormulaError::Num);
        }
        if (next - rate).abs() <= XIRR_TOLERANCE * (1.0 + next.abs())
            && present.abs() <= XIRR_TOLERANCE * cash_scale
        {
            return Ok(next);
        }
        rate = next;
    }
    Err(FormulaError::Num)
}

fn discounted(
    cash_flows: &[FuncValue],
    dates: &[FuncValue],
    first_date: f64,
    rate: f64,
) -> (f64, f64) {
    let mut present = 0.0;
    let mut derivative = 0.0;
    for (cash_cell, date_cell) in cash_flows.iter().zip(dates) {
        // `dated_return` checked both slices with `list_number`: only numbers and blanks
        // remain, and a blank counts as 0.
        let cash = match &cash_cell.value {
            Value::Number(number) => *number,
            Value::Text(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => 0.0,
        };
        let date = match &date_cell.value {
            Value::Number(number) => number.trunc(),
            Value::Text(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => 0.0,
        };
        let years = (date - first_date) / DAYS_PER_YEAR;
        let discounted_cash = cash / (1.0 + rate).powf(years);
        present += discounted_cash;
        derivative -= years * discounted_cash / (1.0 + rate);
    }
    (present, derivative)
}

fn discounted_cached(
    cash_flows: &[FuncValue],
    dates: &[FuncValue],
    first_date: f64,
    years: &[f64],
    powers: &mut [f64],
    rate: f64,
) -> (f64, f64) {
    // Repeated dates share a power, but cash flows retain their original summation order.
    for (power, &year) in powers.iter_mut().zip(years) {
        *power = (1.0 + rate).powf(year);
    }
    let mut present = 0.0;
    let mut derivative = 0.0;
    for (cash_cell, date_cell) in cash_flows.iter().zip(dates) {
        let cash = match &cash_cell.value {
            Value::Number(number) => *number,
            Value::Text(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => 0.0,
        };
        let date = match &date_cell.value {
            Value::Number(number) => number.trunc(),
            Value::Text(_) | Value::Bool(_) | Value::Blank | Value::Error(_) => 0.0,
        };
        let year_index = (date - first_date) as usize;
        let discounted_cash = cash / powers[year_index];
        present += discounted_cash;
        derivative -= years[year_index] * discounted_cash / (1.0 + rate);
    }
    (present, derivative)
}
