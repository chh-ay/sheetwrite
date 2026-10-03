//! Financial functions that are not part of the default engine.

use crate::types::{EvalResult, FormulaError, Value};
use super::super::functions::{integer_arg, number_arg, require_arity, FuncAccumulator, FuncValue};
use super::super::value::aggregate_number;

pub(crate) const NAMES: &[&str] = &[
    "CUMIPMT", "CUMPRINC", "DB", "DDB", "EFFECT", "FVSCHEDULE", "MIRR", "NOMINAL",
    "NPER", "PDURATION", "RRI", "SLN", "SYD", "XIRR", "XNPV",
];

const DAYS_PER_YEAR: f64 = 365.0;
const MONTHS_PER_YEAR: f64 = 12.0;
const LAST_DATE_SERIAL: f64 = 2_958_465.0;
const XIRR_DEFAULT_GUESS: f64 = 0.1;
const XIRR_MAX_ITERATIONS: usize = 100;
const XIRR_TOLERANCE: f64 = 1e-8;
const DB_RATE_PRECISION: f64 = 1000.0;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, arguments: &FuncAccumulator) -> EvalResult {
    match calculate(name, arguments) {
        Ok(number) if number.is_finite() => Value::number(number),
        Ok(_) => Value::Error(FormulaError::Num),
        Err(error) => Value::Error(error),
    }
}

fn calculate(name: &str, arguments: &FuncAccumulator) -> NumberResult {
    match name {
        "NPER" => periods(arguments),
        "CUMIPMT" | "CUMPRINC" => cumulative(arguments, name == "CUMIPMT"),
        "DB" | "DDB" => depreciation(arguments, name == "DB"),
        "XNPV" | "XIRR" => dated_return(arguments, name == "XIRR"),
        "MIRR" => modified_return(arguments),
        "FVSCHEDULE" => scheduled_value(arguments),
        "EFFECT" | "NOMINAL" => {
            require_arity(arguments, 2, 2)?;
            let rate = number_arg(arguments, 0, None)?;
            let periods = integer_arg(arguments, 1, None)?;
            if rate <= 0.0 || periods < 1 { return Err(FormulaError::Num); }
            let periods = periods as f64;
            Ok(if name == "EFFECT" {
                (periods * (rate / periods).ln_1p()).exp_m1()
            } else {
                periods * (rate.ln_1p() / periods).exp_m1()
            })
        }
        "RRI" | "PDURATION" => {
            require_arity(arguments, 3, 3)?;
            let rate_or_periods = number_arg(arguments, 0, None)?;
            let present = number_arg(arguments, 1, None)?;
            let future = number_arg(arguments, 2, None)?;
            if rate_or_periods <= 0.0 { return Err(FormulaError::Num); }
            if name == "RRI" {
                if present == 0.0 { return Err(FormulaError::DivZero); }
                if future / present < 0.0 { return Err(FormulaError::Num); }
            } else if present <= 0.0 || future <= 0.0 {
                return Err(FormulaError::Num);
            }
            Ok(if name == "RRI" {
                ((future / present).ln() / rate_or_periods).exp_m1()
            } else {
                (future.ln() - present.ln()) / rate_or_periods.ln_1p()
            })
        }
        "SLN" | "SYD" => {
            let arity = if name == "SLN" { 3 } else { 4 };
            require_arity(arguments, arity, arity)?;
            let cost = number_arg(arguments, 0, None)?;
            let salvage = number_arg(arguments, 1, None)?;
            let life = number_arg(arguments, 2, None)?;
            if name == "SLN" {
                if life == 0.0 { return Err(FormulaError::DivZero); }
                Ok((cost - salvage) / life)
            } else {
                let period = number_arg(arguments, 3, None)?;
                if life <= 0.0 || period <= 0.0 || period > life { return Err(FormulaError::Num); }
                Ok((cost - salvage) * (life - period + 1.0) * 2.0 / (life * (life + 1.0)))
            }
        }
        _ => Err(FormulaError::Name),
    }
}

fn periods(arguments: &FuncAccumulator) -> NumberResult {
    require_arity(arguments, 3, 5)?;
    let rate = number_arg(arguments, 0, None)?;
    let payment = number_arg(arguments, 1, None)?;
    let present = number_arg(arguments, 2, None)?;
    let future = number_arg(arguments, 3, Some(0.0))?;
    let timing = if number_arg(arguments, 4, Some(0.0))? != 0.0 { 1.0 } else { 0.0 };
    if rate == 0.0 {
        if payment == 0.0 { return Err(FormulaError::DivZero); }
        return Ok(-(present + future) / payment);
    }
    if rate <= -1.0 { return Err(FormulaError::Num); }
    let annuity = payment * (1.0 + rate * timing) / rate;
    let denominator = present + annuity;
    if denominator == 0.0 { return Err(FormulaError::Num); }
    let ratio = (annuity - future) / denominator;
    if ratio <= 0.0 { return Err(FormulaError::Num); }
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
    if rate <= 0.0 || periods <= 0.0 || present <= 0.0 || start < 1.0
        || end < start || end > periods || (timing != 0.0 && timing != 1.0) {
        return Err(FormulaError::Num);
    }
    let log_growth = rate.ln_1p();
    let growth_minus_one = (periods * log_growth).exp_m1();
    let payment = -present * rate * (1.0 + 1.0 / growth_minus_one) / (1.0 + rate * timing);
    let balance = |paid: f64| {
        if paid == 0.0 { return present; }
        let growth_minus_one = (paid * log_growth).exp_m1();
        present * (growth_minus_one + 1.0) / (1.0 + rate * timing)
            + payment * growth_minus_one / rate
    };
    let principal = balance(end) - balance(start - 1.0);
    Ok(if is_interest { payment * (end - start + 1.0) - principal } else { principal })
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
        let period = period.trunc();
        if month < 1.0 || month > MONTHS_PER_YEAR || period < 1.0
            || period > life + if month < MONTHS_PER_YEAR { 1.0 } else { 0.0 } {
            return Err(FormulaError::Num);
        }
        if cost == 0.0 { return Ok(0.0); }
        let rate = ((1.0 - (salvage / cost).powf(1.0 / life)) * DB_RATE_PRECISION).round() / DB_RATE_PRECISION;
        let first = cost * rate * month / MONTHS_PER_YEAR;
        if period == 1.0 { return Ok(first); }
        let depreciation = (cost - first) * (1.0 - rate).powf(period - 2.0) * rate;
        Ok(if period > life { depreciation * (MONTHS_PER_YEAR - month) / MONTHS_PER_YEAR } else { depreciation })
    } else {
        let factor = number_arg(arguments, 4, Some(2.0))?;
        if factor <= 0.0 || period > life { return Err(FormulaError::Num); }
        if cost <= salvage { return Ok(0.0); }
        let rate = (factor / life).min(1.0);
        let previous = if rate == 1.0 {
            if period <= 1.0 { cost } else { 0.0 }
        } else {
            cost * (1.0 - rate).powf(period - 1.0)
        };
        Ok((previous * rate).min(previous - salvage).max(0.0))
    }
}

fn scheduled_value(arguments: &FuncAccumulator) -> NumberResult {
    require_arity(arguments, 2, 2)?;
    let mut future = number_arg(arguments, 0, None)?;
    for entry in arguments.arg(1).unwrap_or_default() {
        match &entry.value {
            Value::Number(rate) => future *= 1.0 + rate,
            Value::Blank => (),
            Value::Error(error) => return Err(*error),
            _ => return Err(FormulaError::Value),
        }
    }
    Ok(future)
}

fn modified_return(arguments: &FuncAccumulator) -> NumberResult {
    require_arity(arguments, 3, 3)?;
    let cash_flows = arguments.arg(0).unwrap_or_default();
    let finance_rate = number_arg(arguments, 1, None)?;
    let reinvest_rate = number_arg(arguments, 2, None)?;
    if finance_rate <= -1.0 || reinvest_rate <= -1.0 { return Err(FormulaError::Num); }
    let mut cash_count = 0usize;
    let mut discount = 1.0;
    let mut negative_present = 0.0;
    let mut positive_future = 0.0;
    for entry in cash_flows {
        let Some(cash) = aggregate_number(&entry.value, entry.from_range)? else { continue; };
        if cash < 0.0 { negative_present += cash / discount; }
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

fn list_number(entry: &FuncValue) -> NumberResult {
    match &entry.value {
        Value::Number(number) if number.is_finite() => Ok(*number),
        Value::Blank => Ok(0.0),
        Value::Error(error) => Err(*error),
        _ => Err(FormulaError::Value),
    }
}

fn dated_return(arguments: &FuncAccumulator, is_internal: bool) -> NumberResult {
    require_arity(arguments, if is_internal { 2 } else { 3 }, 3)?;
    let cash_index = if is_internal { 0 } else { 1 };
    let cash_flows = arguments.arg(cash_index).unwrap_or_default();
    let dates = arguments.arg(cash_index + 1).unwrap_or_default();
    if cash_flows.is_empty() || cash_flows.len() != dates.len() { return Err(FormulaError::Num); }
    let first_date = list_number(&dates[0])?.trunc();
    let mut has_positive = false;
    let mut has_negative = false;
    let mut cash_scale = 0.0;
    for (cash, date) in cash_flows.iter().zip(dates) {
        let cash = list_number(cash)?;
        let date = list_number(date)?.trunc();
        if !(0.0..=LAST_DATE_SERIAL).contains(&date) { return Err(FormulaError::Value); }
        if date < first_date { return Err(FormulaError::Num); }
        has_positive |= cash > 0.0;
        has_negative |= cash < 0.0;
        cash_scale += cash.abs();
    }
    let rate = number_arg(arguments, if is_internal { 2 } else { 0 }, if is_internal { Some(XIRR_DEFAULT_GUESS) } else { None })?;
    if rate <= -1.0 { return Err(FormulaError::Num); }
    if !is_internal { return Ok(discounted(cash_flows, dates, first_date, rate).0); }
    if !has_positive || !has_negative { return Err(FormulaError::Num); }
    let mut rate = rate;
    for _ in 0..XIRR_MAX_ITERATIONS {
        let (present, derivative) = discounted(cash_flows, dates, first_date, rate);
        if !present.is_finite() || !derivative.is_finite() || derivative == 0.0 { return Err(FormulaError::Num); }
        let next = rate - present / derivative;
        if !next.is_finite() || next <= -1.0 { return Err(FormulaError::Num); }
        if (next - rate).abs() <= XIRR_TOLERANCE * (1.0 + next.abs())
            && present.abs() <= XIRR_TOLERANCE * cash_scale {
            return Ok(next);
        }
        rate = next;
    }
    Err(FormulaError::Num)
}

fn discounted(cash_flows: &[FuncValue], dates: &[FuncValue], first_date: f64, rate: f64) -> (f64, f64) {
    let mut present = 0.0;
    let mut derivative = 0.0;
    for (cash, date) in cash_flows.iter().zip(dates) {
        // Both slices have been validated before the iteration starts.
        let cash = match &cash.value { Value::Number(number) => *number, _ => 0.0 };
        let date = match &date.value { Value::Number(number) => number.trunc(), _ => 0.0 };
        let years = (date - first_date) / DAYS_PER_YEAR;
        let discounted_cash = cash / (1.0 + rate).powf(years);
        present += discounted_cash;
        derivative -= years * discounted_cash / (1.0 + rate);
    }
    (present, derivative)
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    fn assert_formulas(cases: &[(&str, f64, f64)]) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, cases.len());
        for (row, (formula, _, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row, 0, formula, 0);
        }
        store.recompute(sheet);
        for (row, (formula, expected, tolerance)) in cases.iter().enumerate() {
            let cell = store.get_cell(sheet, row, 0);
            assert!(cell.string().is_none(), "{formula}: {:?}", cell.string());
            assert!((cell.num() - expected).abs() <= *tolerance,
                "{formula}: expected {expected}, got {}", cell.num());
        }
    }

    #[test]
    fn microsoft_scalar_examples() {
        // https://support.microsoft.com/en-us/excel/functions/nper-function
        // https://support.microsoft.com/en-us/excel/functions/cumipmt-function
        // https://support.microsoft.com/en-us/excel/functions/cumprinc-function
        // https://support.microsoft.com/en-us/excel/functions/db-function
        // https://support.microsoft.com/en-us/excel/functions/ddb-function
        // https://support.microsoft.com/en-us/excel/functions/effect-function
        // https://support.microsoft.com/en-us/excel/functions/nominal-function
        // https://support.microsoft.com/en-us/excel/functions/rri-function
        // https://support.microsoft.com/en-us/excel/functions/pduration-function
        // https://support.microsoft.com/en-us/excel/functions/sln-function
        // https://support.microsoft.com/en-us/excel/functions/syd-function
        assert_formulas(&[
            ("=NPER(0.12/12,-100,-1000,10000,1)", 59.6738657, 1e-7),
            ("=NPER(0.12/12,-100,-1000,10000)", 60.0821229, 1e-7),
            ("=NPER(0.12/12,-100,-1000)", -9.57859404, 1e-8),
            ("=CUMIPMT(0.09/12,30*12,125000,13,24,0)", -11135.23213, 1e-5),
            ("=CUMIPMT(0.09/12,30*12,125000,1,1,0)", -937.5, 1e-8),
            ("=CUMPRINC(0.09/12,30*12,125000,13,24,0)", -934.1071234, 1e-7),
            ("=CUMPRINC(0.09/12,30*12,125000,1,1,0)", -68.27827118, 1e-8),
            ("=DB(1000000,100000,6,1,7)", 186083.33, 0.005),
            ("=DB(1000000,100000,6,2,7)", 259639.42, 0.005),
            ("=DB(1000000,100000,6,7,7)", 15845.10, 0.005),
            ("=DDB(2400,300,10,1)", 480.0, 1e-12),
            ("=DDB(2400,300,10,10)", 22.1225472, 1e-8),
            ("=EFFECT(0.0525,4)", 0.0535427, 1e-7),
            ("=NOMINAL(0.053543,4)", 0.05250032, 1e-8),
            ("=RRI(96,10000,11000)", 0.0009933, 1e-7),
            ("=PDURATION(0.025,2000,2200)", 3.86, 0.005),
            ("=SLN(30000,7500,10)", 2250.0, 1e-12),
            ("=SYD(30000,7500,10,1)", 4090.91, 0.005),
            ("=SYD(30000,7500,10,10)", 409.09, 0.005),
        ]);
    }

    #[test]
    fn microsoft_cash_flow_examples_use_cell_ranges() {
        // https://support.microsoft.com/en-us/excel/functions/xnpv-function
        // https://support.microsoft.com/en-us/excel/functions/xirr-function
        // https://support.microsoft.com/en-us/excel/functions/mirr-function
        // https://support.microsoft.com/en-us/excel/functions/fvschedule-function
        let mut store = CellStore::new();
        let sheet = store.add_sheet(7, 10);
        let cash_flows = [-10000.0, 2750.0, 4250.0, 3250.0, 2750.0];
        let dates = [39448.0, 39508.0, 39751.0, 39859.0, 39904.0];
        let periodic = [-120000.0, 39000.0, 30000.0, 21000.0, 37000.0, 46000.0];
        for (row, cash) in cash_flows.iter().enumerate() {
            store.set_number(sheet, row, 0, *cash, 0);
            store.set_number(sheet, row, 1, dates[row], 0);
        }
        for (row, cash) in periodic.iter().enumerate() {
            store.set_number(sheet, row, 2, *cash, 0);
        }
        for (row, rate) in [0.09, 0.11, 0.1].iter().enumerate() {
            store.set_number(sheet, row, 3, *rate, 0);
        }
        let cases = [
            ("=XNPV(0.09,A1:A5,B1:B5)", 2086.65, 0.005),
            ("=XIRR(A1:A5,B1:B5)", 0.373362535, 1e-8),
            ("=XIRR(A1:A5,B1:B5,0.1)", 0.373362535, 1e-8),
            ("=MIRR(C1:C6,0.1,0.12)", 0.1260941304, 1e-9),
            ("=FVSCHEDULE(1,D1:D4)", 1.3309, 0.00005),
        ];
        for (row, (formula, _, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row, 6, formula, 0);
        }
        store.recompute(sheet);
        for (row, (formula, expected, tolerance)) in cases.iter().enumerate() {
            let cell = store.get_cell(sheet, row, 6);
            assert!(cell.string().is_none(), "{formula}: {:?}", cell.string());
            assert!((cell.num() - expected).abs() <= *tolerance, "{formula}: {}", cell.num());
        }
    }

    #[test]
    fn cash_flow_dates_and_reference_coercion() {
        assert_formulas(&[
            ("=NPER(0,-10,100)", 10.0, 1e-12),
            ("=EFFECT(0.0525,4.9)", 0.0535427, 1e-7),
            ("=CUMIPMT(0.1,3,100,1,1,1)", 0.0, 1e-12),
            ("=DDB(100,20,2,2,4)", 0.0, 1e-12),
            ("=RRI(2,-100,-121)", 0.1, 1e-12),
        ]);
        let mut dated_store = CellStore::new();
        let dated_sheet = dated_store.add_sheet(6, 3);
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 5);
        for (column, numbers) in [
            &[-100.0, 110.0][..], &[1.9, 366.9][..], &[-100.0, 55.0, 55.0][..],
            &[1.0, 366.0, 366.0][..], &[-100.0, 90.0][..],
        ].iter().enumerate() {
            for (row, &number) in numbers.iter().enumerate() { dated_store.set_number(dated_sheet, row, column, number, 0); }
        }
        store.set_number(sheet, 0, 0, -100.0, 0);
        store.set_string(sheet, 1, 0, "ignored", 0);
        store.set_formula(sheet, 2, 0, "=TRUE()", 0);
        store.set_number(sheet, 3, 0, 121.0, 0);
        store.set_formula(sheet, 0, 2, "=MIRR(A1:A5,0.1,0.1)", 0);
        store.set_formula(sheet, 1, 2, "=FVSCHEDULE(1,A1:A5)", 0);
        store.recompute(sheet);
        assert!((store.get_cell(sheet, 0, 2).num() - 0.21).abs() < 1e-12);
        assert_eq!(store.get_cell(sheet, 1, 2).string().as_deref(), Some("#VALUE!"));
        for (row, formula) in [
            "=XNPV(0.1,A1:A2,B1:B2)", "=XNPV(0.1,C1:C3,D1:D3)", "=XIRR(E1:E2,D1:D2)",
        ].iter().enumerate() { dated_store.set_formula(dated_sheet, row, 5, formula, 0); }
        dated_store.recompute(dated_sheet);
        for (row, expected) in [0.0, 0.0, -0.1].iter().enumerate() {
            let cell = dated_store.get_cell(dated_sheet, row, 5);
            assert!(cell.string().is_none(), "{:?}", cell.string());
            assert!((cell.num() - expected).abs() < 1e-9);
        }
    }

    #[test]
    fn documented_domain_and_convergence_errors() {
        // Domain restrictions: Microsoft function pages linked in the example tests.
        let cases = [
            ("=NPER(0,0,100)", "#DIV/0!"),
            ("=NPER(0.1,0,100,100)", "#NUM!"),
            ("=CUMIPMT(0,12,100,1,12,0)", "#NUM!"),
            ("=CUMPRINC(0.1,0,100,1,1,0)", "#NUM!"),
            ("=CUMIPMT(0.1,12,-100,1,12,0)", "#NUM!"),
            ("=CUMPRINC(0.1,12,100,0,12,0)", "#NUM!"),
            ("=CUMIPMT(0.1,12,100,4,3,0)", "#NUM!"),
            ("=CUMPRINC(0.1,12,100,1,13,0)", "#NUM!"),
            ("=CUMIPMT(0.1,12,100,1,12,2)", "#NUM!"),
            ("=DB(100,10,5,1,13)", "#NUM!"),
            ("=DB(-100,10,5,1)", "#NUM!"),
            ("=DDB(100,10,5,6)", "#NUM!"),
            ("=DDB(100,10,5,1,0)", "#NUM!"),
            ("=EFFECT(0,4)", "#NUM!"),
            ("=NOMINAL(0.1,0.9)", "#NUM!"),
            ("=RRI(0,100,110)", "#NUM!"),
            ("=RRI(2,0,100)", "#DIV/0!"),
            ("=RRI(2,100,-110)", "#NUM!"),
            ("=PDURATION(0,100,110)", "#NUM!"),
            ("=PDURATION(0.1,100,0)", "#NUM!"),
            ("=SLN(100,10,0)", "#DIV/0!"),
            ("=SYD(100,10,5,6)", "#NUM!"),
            ("=FVSCHEDULE(1,H1:H2)", "#VALUE!"),
            ("=MIRR(F1:F2,0.1,0.1)", "#DIV/0!"),
            ("=XNPV(0.1,A1:A2,C1:C2)", "#NUM!"),
            ("=XNPV(0.1,A1:A2,B1)", "#NUM!"),
            ("=XNPV(0.1,A1:A2,D1:D2)", "#VALUE!"),
            ("=XNPV(0.1,A1:A2,E1:E2)", "#VALUE!"),
            ("=XIRR(F1:F2,B1:B2)", "#NUM!"),
            ("=XIRR(A1:A2,G1:G2)", "#NUM!"),
            ("=XIRR(A1:A2,B1:B2,-1)", "#NUM!"),
            ("=XIRR(A1:A2,B1:B2,10^100)", "#NUM!"),
            (r#"=EFFECT("bad",4)"#, "#VALUE!"),
            ("=FVSCHEDULE(1,J1:J2)", "#DIV/0!"),
            ("=SLN(100,10)", "#VALUE!"),
        ];
        let mut store = CellStore::new();
        let sheet = store.add_sheet(11, cases.len());
        for (column, numbers) in [
            &[-100.0, 110.0][..], &[1.0, 366.0][..], &[2.0, 1.0][..],
            &[1.0, 2958466.0][..], &[1.0][..], &[100.0, 110.0][..],
            &[1.0, 1.0][..], &[0.1][..], &[][..], &[0.1][..],
        ].iter().enumerate() {
            for (row, &number) in numbers.iter().enumerate() { store.set_number(sheet, row, column, number, 0); }
        }
        store.set_string(sheet, 1, 4, "bad", 0);
        store.set_formula(sheet, 1, 7, "=TRUE()", 0);
        store.set_formula(sheet, 1, 9, "=1/0", 0);
        for (row, (formula, _)) in cases.iter().enumerate() {
            store.set_formula(sheet, row, 10, formula, 0);
        }
        store.recompute(sheet);
        for (row, (formula, expected)) in cases.iter().enumerate() {
            assert_eq!(store.get_cell(sheet, row, 10).string().as_deref(), Some(*expected), "{formula}");
        }
    }
}
