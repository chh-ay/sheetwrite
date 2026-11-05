//! Excel's securities functions: coupon dates, accrued interest, bond
//! prices, yields and durations, discounted securities and Treasury bills.
//!
//! Each function follows its Microsoft Support page for arguments and
//! errors. Dates are truncated serials, `frequency` is 1, 2 or 4, and
//! `basis` selects one of Excel's day-count bases.

mod day_count;
mod odd;

pub(super) use day_count::{Basis, Date};

use super::super::functions::{bool_arg, number_arg, require_arity, FuncAccumulator};
use crate::types::{EvalResult, FormulaError, Value};
use day_count::{period_months, Coupons};

pub(crate) const NAMES: &[&str] = &[
    "ACCRINT",
    "ACCRINTM",
    "COUPDAYBS",
    "COUPDAYS",
    "COUPDAYSNC",
    "COUPNCD",
    "COUPNUM",
    "COUPPCD",
    "DISC",
    "DURATION",
    "INTRATE",
    "MDURATION",
    "ODDFPRICE",
    "ODDFYIELD",
    "ODDLPRICE",
    "ODDLYIELD",
    "PRICE",
    "PRICEDISC",
    "PRICEMAT",
    "RECEIVED",
    "TBILLEQ",
    "TBILLPRICE",
    "TBILLYIELD",
    "YIELD",
    "YIELDDISC",
    "YIELDMAT",
];

/// Prices and yields are per 100 of face value.
const FACE_VALUE: f64 = 100.0;
/// The par value that ACCRINT and ACCRINTM use when the argument is empty.
const DEFAULT_PAR: f64 = 1_000.0;
/// Treasury bill rates use a 360-day year.
const BILL_YEAR_DAYS: f64 = 360.0;
/// A Treasury bill of more than half a year has a semiannual coupon
/// equivalent, which TBILLEQ solves as a quadratic.
const BILL_HALF_YEAR_DAYS: f64 = 182.0;
const DAYS_PER_YEAR: f64 = 365.0;
const DAYS_PER_LEAP_YEAR: f64 = 366.0;
const MONTHS_PER_YEAR: i64 = 12;
/// YIELD starts its search at 5%.
const YIELD_GUESS: f64 = 0.05;
/// The same iteration limit as XIRR and RATE.
const SOLVER_MAX_ITERATIONS: usize = 100;
const SOLVER_TOLERANCE: f64 = 1e-10;
const BISECTION_MAX_ITERATIONS: usize = 200;
/// Bracket search: start width, growth factor and tries.
const BRACKET_SHIFT: f64 = 0.01;
const BRACKET_GROWTH: f64 = 1.6;
const BRACKET_MAX_TRIES: usize = 60;
const LOWEST_RATE: f64 = -1.0;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    match calculate(name, values) {
        Ok(number) if number.is_finite() => Value::number(number),
        Ok(_) => Value::Error(FormulaError::Num),
        Err(error) => Value::Error(error),
    }
}

fn calculate(name: &str, values: &FuncAccumulator) -> NumberResult {
    match name {
        "COUPDAYBS" | "COUPDAYS" | "COUPDAYSNC" | "COUPNCD" | "COUPNUM" | "COUPPCD" => {
            coupon(name, values)
        }
        "ACCRINT" => accrued_interest(values),
        "ACCRINTM" => accrued_at_maturity(values),
        "PRICE" => price(values),
        "YIELD" => bond_yield(values),
        "DURATION" | "MDURATION" => duration(values, name == "MDURATION"),
        "DISC" | "INTRATE" | "PRICEDISC" | "RECEIVED" | "YIELDDISC" => discounted(name, values),
        "PRICEMAT" | "YIELDMAT" => interest_at_maturity(values, name == "PRICEMAT"),
        "TBILLEQ" | "TBILLPRICE" | "TBILLYIELD" => treasury_bill(name, values),
        "ODDFPRICE" | "ODDFYIELD" => odd::first_period(values, name == "ODDFYIELD"),
        "ODDLPRICE" | "ODDLYIELD" => odd::last_period(values, name == "ODDLYIELD"),
        _ => Err(FormulaError::Name),
    }
}

fn ensure(is_valid: bool) -> Result<(), FormulaError> {
    if is_valid {
        Ok(())
    } else {
        Err(FormulaError::Num)
    }
}

fn date_arg(values: &FuncAccumulator, index: usize) -> Result<Date, FormulaError> {
    Date::from_serial(number_arg(values, index, None)?)
}

/// Reads a truncated `frequency`: 1 (annual), 2 (semiannual) or 4
/// (quarterly). Any other value is `#NUM!`.
fn frequency_arg(values: &FuncAccumulator, index: usize) -> NumberResult {
    let frequency = number_arg(values, index, None)?.trunc();

    ensure(frequency == 1.0 || frequency == 2.0 || frequency == 4.0)?;

    Ok(frequency)
}

fn basis_arg(values: &FuncAccumulator, index: usize) -> Result<Basis, FormulaError> {
    Basis::from_number(number_arg(values, index, Some(0.0))?)
}

/// COUPDAYBS, COUPDAYS, COUPDAYSNC, COUPNCD, COUPNUM and COUPPCD.
fn coupon(name: &str, values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 4)?;

    let settlement = date_arg(values, 0)?;
    let maturity = date_arg(values, 1)?;
    let frequency = frequency_arg(values, 2)?;
    let basis = basis_arg(values, 3)?;

    ensure(settlement < maturity)?;

    let coupons = Coupons::find(settlement, maturity, frequency);

    Ok(match name {
        "COUPDAYBS" => basis.days_before_settlement(coupons),
        "COUPDAYS" => basis.period_days(coupons.previous, coupons.next, frequency),
        "COUPDAYSNC" => basis.days_after_settlement(coupons),
        "COUPNCD" => coupons.next.serial(),
        "COUPPCD" => coupons.previous.serial(),
        _ => coupons.remaining,
    })
}

/// ACCRINT(issue, first_interest, settlement, rate, par, frequency,
/// [basis], [calc_method]).
fn accrued_interest(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 6, 8)?;

    let issue = date_arg(values, 0)?;
    let first_interest = date_arg(values, 1)?;
    let settlement = date_arg(values, 2)?;
    let rate = number_arg(values, 3, None)?;
    let par = number_arg(values, 4, Some(DEFAULT_PAR))?;
    let frequency = frequency_arg(values, 5)?;
    let basis = basis_arg(values, 6)?;
    let from_issue = bool_arg(values, 7, Some(true))?;

    ensure(rate > 0.0 && par > 0.0 && issue < settlement)?;

    let schedule = Schedule {
        anchor: first_interest,
        frequency,
        basis,
    };

    let periods = if settlement <= first_interest {
        schedule.first_period_share(issue, settlement)
    } else {
        let before = if from_issue {
            schedule.first_period_share(issue, first_interest)
        } else {
            0.0
        };

        before + schedule.regular_periods(settlement)
    };

    Ok(par * rate / frequency * periods)
}

/// Coupon periods counted from a first interest date.
struct Schedule {
    anchor: Date,
    frequency: f64,
    basis: Basis,
}

impl Schedule {
    fn months(&self) -> i64 {
        period_months(self.frequency)
    }

    fn is_month_end(&self) -> bool {
        self.anchor.is_last_day_of_month()
    }

    /// The coupon periods from `issue` to `end`, where `end` is on or
    /// before the first interest date. The period that ends at the first
    /// interest date counts its days up to `end`; each earlier quasi-coupon
    /// period counts as a whole, except the one that holds the issue date,
    /// which counts its days from the issue date.
    fn first_period_share(&self, issue: Date, end: Date) -> f64 {
        let months = self.months();
        let is_month_end = self.is_month_end();
        let previous = self.anchor.add_months(-months, is_month_end);
        let start = previous.max(issue);
        let length = self
            .basis
            .period_days(previous, self.anchor, self.frequency);
        let mut share = self.basis.days(start, end) / length;
        let mut next = previous;

        while next > issue {
            let earlier = next.add_months(-months, is_month_end);

            share += if issue <= earlier {
                1.0
            } else {
                self.basis.days(issue, next) / self.quasi_period_days(earlier, next)
            };

            next = earlier;
        }

        share
    }

    /// The length of a quasi-coupon period before the first interest date,
    /// as Excel counts it for each basis. US 30/360 changes both dates;
    /// actual/360 counts 30/360 days with only the start date changed.
    fn quasi_period_days(&self, previous: Date, next: Date) -> f64 {
        match self.basis {
            Basis::UsThirty => day_count::days_360_us(previous, next, true),
            Basis::Actual360 => day_count::days_360_us(previous, next, false),
            Basis::Actual365 => DAYS_PER_YEAR / self.frequency,
            Basis::ActualActual | Basis::EuropeanThirty => self.basis.days(previous, next),
        }
    }

    /// The coupon periods from the first interest date to `settlement`,
    /// which is after it: whole periods, then the share of the period that
    /// holds the settlement date.
    fn regular_periods(&self, settlement: Date) -> f64 {
        let months = self.months();
        let is_month_end = self.is_month_end();
        let mut previous = self.anchor;
        let mut periods = 0.0;

        loop {
            let next = previous.add_months(months, is_month_end);

            if next >= settlement {
                let length = self.basis.period_days(previous, next, self.frequency);

                return periods + self.basis.days(previous, settlement) / length;
            }

            periods += 1.0;
            previous = next;
        }
    }
}

/// ACCRINTM(issue, settlement, rate, par, [basis]).
fn accrued_at_maturity(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 4, 5)?;

    let issue = date_arg(values, 0)?;
    let settlement = date_arg(values, 1)?;
    let rate = number_arg(values, 2, None)?;
    let par = number_arg(values, 3, Some(DEFAULT_PAR))?;
    let basis = basis_arg(values, 4)?;

    ensure(rate > 0.0 && par > 0.0 && issue < settlement)?;

    let days = basis.days(issue, settlement);
    let year_days = basis.year_days(issue, settlement);

    Ok(par * rate * days / year_days)
}

/// A coupon bond between settlement and maturity.
struct Bond {
    rate: f64,
    redemption: f64,
    frequency: f64,
    /// Coupons payable from settlement to maturity.
    coupons: f64,
    /// Days from the previous coupon date to settlement.
    accrued_days: f64,
    /// Days in the coupon period that holds the settlement date.
    period_days: f64,
}

impl Bond {
    fn read(values: &FuncAccumulator, frequency_index: usize) -> Result<(Self, f64), FormulaError> {
        let settlement = date_arg(values, 0)?;
        let maturity = date_arg(values, 1)?;
        let rate = number_arg(values, 2, None)?;
        let yield_or_price = number_arg(values, 3, None)?;
        let redemption = number_arg(values, 4, None)?;
        let frequency = frequency_arg(values, frequency_index)?;
        let basis = basis_arg(values, frequency_index + 1)?;

        ensure(settlement < maturity)?;

        let coupons = Coupons::find(settlement, maturity, frequency);
        let bond = Self {
            rate,
            redemption,
            frequency,
            coupons: coupons.remaining,
            accrued_days: basis.days_before_settlement(coupons),
            period_days: basis.period_days(coupons.previous, coupons.next, frequency),
        };

        Ok((bond, yield_or_price))
    }

    fn coupon(&self) -> f64 {
        FACE_VALUE * self.rate / self.frequency
    }

    /// The share of the current period left after settlement.
    fn remaining_share(&self) -> f64 {
        (self.period_days - self.accrued_days) / self.period_days
    }

    /// The clean price per 100 for an annual yield, as PRICE defines it.
    fn price(&self, annual_yield: f64) -> f64 {
        let coupon = self.coupon();
        let accrued = coupon * self.accrued_days / self.period_days;
        let remaining = self.remaining_share();

        if self.coupons == 1.0 {
            let discount = 1.0 + remaining * annual_yield / self.frequency;

            return (self.redemption + coupon) / discount - accrued;
        }

        let base = 1.0 + annual_yield / self.frequency;
        let mut value = self.redemption / base.powf(self.coupons - 1.0 + remaining);

        for index in 1..=self.coupons as u64 {
            value += coupon / base.powf(index as f64 - 1.0 + remaining);
        }

        value - accrued
    }
}

/// PRICE(settlement, maturity, rate, yld, redemption, frequency, [basis]).
fn price(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 6, 7)?;

    let (bond, annual_yield) = Bond::read(values, 5)?;

    ensure(bond.rate >= 0.0 && annual_yield >= 0.0 && bond.redemption > 0.0)?;

    Ok(bond.price(annual_yield))
}

/// YIELD(settlement, maturity, rate, pr, redemption, frequency, [basis]).
/// With one coupon left the yield has a closed form; otherwise Newton's
/// method solves PRICE for the yield.
fn bond_yield(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 6, 7)?;

    let (bond, price) = Bond::read(values, 5)?;

    ensure(bond.rate >= 0.0 && price > 0.0 && bond.redemption > 0.0)?;

    if bond.coupons <= 1.0 {
        let coupon = bond.rate / bond.frequency;
        let accrued = bond.accrued_days / bond.period_days * coupon;
        let growth = (bond.redemption / FACE_VALUE + coupon) / (price / FACE_VALUE + accrued) - 1.0;

        return Ok(growth * bond.frequency / bond.remaining_share());
    }

    solve(|annual_yield| bond.price(annual_yield) - price, YIELD_GUESS)
}

/// DURATION and MDURATION(settlement, maturity, coupon, yld, frequency,
/// [basis]): the Macaulay duration, and the modified duration.
fn duration(values: &FuncAccumulator, is_modified: bool) -> NumberResult {
    require_arity(values, 5, 6)?;

    let settlement = date_arg(values, 0)?;
    let maturity = date_arg(values, 1)?;
    let rate = number_arg(values, 2, None)?;
    let annual_yield = number_arg(values, 3, None)?;
    let frequency = frequency_arg(values, 4)?;
    let basis = basis_arg(values, 5)?;

    ensure(settlement < maturity && rate >= 0.0 && annual_yield >= 0.0)?;

    let coupons = Coupons::find(settlement, maturity, frequency);
    let period_days = basis.period_days(coupons.previous, coupons.next, frequency);
    let remaining = 1.0 - basis.days_before_settlement(coupons) / period_days;
    let last_time = remaining + coupons.remaining - 1.0;
    let base = annual_yield / frequency + 1.0;
    let redemption = FACE_VALUE / base.powf(last_time);
    let coupon = FACE_VALUE * rate / frequency;
    let mut weighted = last_time * redemption;
    let mut total = redemption;

    for index in 1..=coupons.remaining as u64 {
        let time = index as f64 - 1.0 + remaining;
        let value = coupon / base.powf(time);

        weighted += value * time;
        total += value;
    }

    let macaulay = weighted / total / frequency;

    Ok(if is_modified {
        macaulay / base
    } else {
        macaulay
    })
}

/// DISC, INTRATE, PRICEDISC, RECEIVED and YIELDDISC(settlement, maturity,
/// first, second, [basis]): securities that pay no coupon.
fn discounted(name: &str, values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 4, 5)?;

    let settlement = date_arg(values, 0)?;
    let maturity = date_arg(values, 1)?;
    let first = number_arg(values, 2, None)?;
    let second = number_arg(values, 3, None)?;
    let basis = basis_arg(values, 4)?;

    ensure(settlement < maturity && first > 0.0 && second > 0.0)?;

    let year_share = basis.days(settlement, maturity) / basis.year_days(settlement, maturity);

    match name {
        "DISC" => Ok((1.0 - first / second) / year_share),
        "INTRATE" => Ok((second - first) / first / year_share),
        "PRICEDISC" => Ok(second - first * second * year_share),
        "YIELDDISC" => Ok((second - first) / first / year_share),
        _ => {
            let discount = second * year_share;

            ensure(discount < 1.0)?;

            Ok(first / (1.0 - discount))
        }
    }
}

/// PRICEMAT and YIELDMAT(settlement, maturity, issue, rate, yld or pr,
/// [basis]): securities that pay all interest at maturity.
fn interest_at_maturity(values: &FuncAccumulator, is_price: bool) -> NumberResult {
    require_arity(values, 5, 6)?;

    let settlement = date_arg(values, 0)?;
    let maturity = date_arg(values, 1)?;
    let issue = date_arg(values, 2)?;
    let rate = number_arg(values, 3, None)?;
    let yield_or_price = number_arg(values, 4, None)?;
    let basis = basis_arg(values, 5)?;

    let is_valid_quote = if is_price {
        yield_or_price >= 0.0
    } else {
        yield_or_price > 0.0
    };

    ensure(settlement < maturity && rate >= 0.0 && is_valid_quote)?;

    let year_days = basis.year_days(issue, settlement);
    let issue_to_maturity = basis.days(issue, maturity) / year_days;
    let issue_to_settlement = basis.days(issue, settlement) / year_days;
    let settlement_to_maturity = issue_to_maturity - issue_to_settlement;
    let accrued = issue_to_settlement * rate;

    if is_price {
        let value = FACE_VALUE * (1.0 + issue_to_maturity * rate);

        return Ok(value / (1.0 + settlement_to_maturity * yield_or_price) - FACE_VALUE * accrued);
    }

    let price = yield_or_price / FACE_VALUE;
    let gain = issue_to_maturity * rate + 1.0 - price - accrued;

    Ok(gain / (price + accrued) / settlement_to_maturity)
}

/// TBILLEQ, TBILLPRICE and TBILLYIELD(settlement, maturity, discount or
/// pr). Maturity must be at most one year after settlement.
fn treasury_bill(name: &str, values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 3)?;

    let settlement = date_arg(values, 0)?;
    let maturity = date_arg(values, 1)?;
    let rate_or_price = number_arg(values, 2, None)?;

    ensure(settlement < maturity)?;
    ensure(maturity <= settlement.add_months(MONTHS_PER_YEAR, false))?;
    ensure(rate_or_price > 0.0)?;

    let days = day_count::actual_days(settlement, maturity);

    match name {
        "TBILLPRICE" => {
            let price = FACE_VALUE * (1.0 - rate_or_price * days / BILL_YEAR_DAYS);

            ensure(price > 0.0)?;

            Ok(price)
        }
        "TBILLYIELD" => Ok((FACE_VALUE - rate_or_price) / rate_or_price * BILL_YEAR_DAYS / days),
        _ => bond_equivalent(rate_or_price, days),
    }
}

/// TBILLEQ: the bond-equivalent yield of a Treasury bill.
fn bond_equivalent(discount: f64, days: f64) -> NumberResult {
    if days <= BILL_HALF_YEAR_DAYS {
        return Ok(DAYS_PER_YEAR * discount / (BILL_YEAR_DAYS - discount * days));
    }

    let price = 1.0 - discount * days / BILL_YEAR_DAYS;
    let year_days = if days == DAYS_PER_LEAP_YEAR {
        DAYS_PER_LEAP_YEAR
    } else {
        DAYS_PER_YEAR
    };
    let share = days / year_days;
    let linear = 2.0 * share - 1.0;
    let discriminant = share * share - linear * (1.0 - 1.0 / price);

    ensure(discriminant >= 0.0 && linear != 0.0)?;

    Ok(2.0 * (discriminant.sqrt() - share) / linear)
}

fn sign(number: f64) -> i8 {
    if number > 0.0 {
        1
    } else if number < 0.0 {
        -1
    } else {
        0
    }
}

/// Finds a rate where `function` is zero. Newton's method runs first; a
/// root with another sign than the guess is not taken, and a bracket
/// search with bisection runs instead, so the root nearest a positive
/// guess wins.
fn solve(function: impl Fn(f64) -> f64, guess: f64) -> NumberResult {
    match newton(&function, guess) {
        Some(root) if sign(root) == sign(guess) => Ok(root),
        _ => bisect(&function, guess),
    }
}

fn newton(function: &impl Fn(f64) -> f64, guess: f64) -> Option<f64> {
    let mut rate = guess;

    for _ in 0..SOLVER_MAX_ITERATIONS {
        let step = SOLVER_TOLERANCE.sqrt() * rate.abs().max(1.0);
        let slope = (function(rate + step) - function(rate - step)) / (2.0 * step);
        let next = rate - function(rate) / slope;

        if !next.is_finite() {
            return None;
        }

        if (next - rate).abs() < SOLVER_TOLERANCE {
            return Some(next);
        }

        rate = next;
    }

    None
}

fn bisect(function: &impl Fn(f64) -> f64, guess: f64) -> NumberResult {
    ensure(guess > LOWEST_RATE)?;

    let floor = LOWEST_RATE + SOLVER_TOLERANCE;
    let mut lower = (guess - BRACKET_SHIFT).max(floor);
    let mut upper = guess + BRACKET_SHIFT;
    let mut is_bracketed = false;

    for _ in 0..BRACKET_MAX_TRIES {
        if function(lower) * function(upper) <= 0.0 {
            is_bracketed = true;
            break;
        }

        let width = upper - lower;

        lower = (lower - BRACKET_GROWTH * width).max(floor);
        upper += BRACKET_GROWTH * width;
    }

    ensure(is_bracketed)?;

    let lower_sign = sign(function(lower));

    for _ in 0..BISECTION_MAX_ITERATIONS {
        let middle = lower + (upper - lower) / 2.0;
        let value = function(middle);

        if value.abs() < SOLVER_TOLERANCE || upper - lower < SOLVER_TOLERANCE {
            return Ok(middle);
        }

        if sign(value) == lower_sign {
            lower = middle;
        } else {
            upper = middle;
        }
    }

    Err(FormulaError::Num)
}

#[cfg(test)]
mod tests {
    use super::super::evaluate_scalar;
    use super::*;

    fn call(name: &str, arguments: &[f64]) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in arguments {
            values.push_scalar(Value::Number(*argument)).unwrap();
            values.finish_arg(1, 1).unwrap();
        }

        evaluate_scalar(name, &values)
    }

    fn number(name: &str, arguments: &[f64]) -> f64 {
        let Value::Number(actual) = call(name, arguments) else {
            panic!("{name}{arguments:?} returned {:?}", call(name, arguments));
        };

        actual
    }

    /// The example table of each function's Microsoft Support page,
    /// `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    /// Dates are serials. The page rounds each result, so the check uses
    /// the published number of decimal places.
    const MICROSOFT_EXAMPLES: &[(&str, &[f64], &str)] = &[
        (
            "ACCRINT",
            &[39508.0, 39691.0, 39569.0, 0.1, 1000.0, 2.0, 0.0],
            "16.666667",
        ),
        (
            "ACCRINT",
            &[39512.0, 39691.0, 39569.0, 0.1, 1000.0, 2.0, 0.0, 0.0],
            "15.555556",
        ),
        (
            "ACCRINT",
            &[39543.0, 39691.0, 39569.0, 0.1, 1000.0, 2.0, 0.0, 1.0],
            "7.2222222",
        ),
        (
            "ACCRINTM",
            &[39539.0, 39614.0, 0.1, 1000.0, 3.0],
            "20.54794521",
        ),
        (
            "AMORDEGRC",
            &[2400.0, 39679.0, 39813.0, 300.0, 1.0, 0.15, 1.0],
            "776",
        ),
        (
            "AMORLINC",
            &[2400.0, 39679.0, 39813.0, 300.0, 1.0, 0.15, 0.15],
            "360",
        ),
        ("COUPDAYBS", &[40568.0, 40862.0, 2.0, 1.0], "71"),
        ("COUPDAYS", &[40568.0, 40862.0, 2.0, 1.0], "181"),
        ("COUPDAYSNC", &[40568.0, 40862.0, 2.0, 1.0], "110"),
        ("COUPNCD", &[40568.0, 40862.0, 2.0, 1.0], "40678"),
        ("COUPNUM", &[39107.0, 39767.0, 2.0, 1.0], "4"),
        ("COUPPCD", &[40568.0, 40862.0, 2.0, 1.0], "40497"),
        // The page lists maturity 1/1/2048, but its result 0.001038 is the
        // result for 1/1/2038 (serial 50406); 1/1/2048 gives 0.000686. The
        // formula matches all 2,747 DISC results recorded from Excel.
        ("DISC", &[43282.0, 50406.0, 97.975, 100.0, 1.0], "0.001038"),
        ("DOLLARDE", &[1.02, 16.0], "1.125"),
        ("DOLLARDE", &[1.1, 32.0], "1.3125"),
        ("DOLLARFR", &[1.125, 16.0], "1.02"),
        ("DOLLARFR", &[1.125, 32.0], "1.04"),
        (
            "DURATION",
            &[43282.0, 54058.0, 0.08, 0.09, 2.0, 1.0],
            "10.9191453",
        ),
        (
            "INTRATE",
            &[39493.0, 39583.0, 1_000_000.0, 1_014_420.0, 2.0],
            "0.05768",
        ),
        (
            "MDURATION",
            &[39448.0, 42370.0, 0.08, 0.09, 2.0, 1.0],
            "5.736",
        ),
        (
            "ODDFPRICE",
            &[
                39763.0, 44256.0, 39736.0, 39873.0, 0.0785, 0.0625, 100.0, 2.0, 1.0,
            ],
            "113.60",
        ),
        (
            "ODDFYIELD",
            &[
                39763.0, 44256.0, 39736.0, 39873.0, 0.0575, 84.5, 100.0, 2.0, 0.0,
            ],
            "0.0772",
        ),
        (
            "ODDLPRICE",
            &[39485.0, 39614.0, 39370.0, 0.0375, 0.0405, 100.0, 2.0, 0.0],
            "99.88",
        ),
        (
            "ODDLYIELD",
            &[39558.0, 39614.0, 39440.0, 0.0375, 99.875, 100.0, 2.0, 0.0],
            "0.04519",
        ),
        (
            "PRICE",
            &[39493.0, 43054.0, 0.0575, 0.065, 100.0, 2.0, 0.0],
            "94.63",
        ),
        (
            "PRICEDISC",
            &[39494.0, 39508.0, 0.0525, 100.0, 2.0],
            "99.80",
        ),
        (
            "PRICEMAT",
            &[39493.0, 39551.0, 39397.0, 0.061, 0.061, 0.0],
            "99.98",
        ),
        (
            "RECEIVED",
            &[39493.0, 39583.0, 1_000_000.0, 0.0575, 2.0],
            "1014584.65",
        ),
        ("TBILLEQ", &[39538.0, 39600.0, 0.0914], "0.09415"),
        ("TBILLPRICE", &[39538.0, 39600.0, 0.09], "98.45"),
        ("TBILLYIELD", &[39538.0, 39600.0, 98.45], "0.0914"),
        ("VDB", &[2400.0, 300.0, 3650.0, 0.0, 1.0], "1.32"),
        ("VDB", &[2400.0, 300.0, 120.0, 0.0, 1.0], "40.00"),
        ("VDB", &[2400.0, 300.0, 10.0, 0.0, 1.0], "480.00"),
        ("VDB", &[2400.0, 300.0, 120.0, 6.0, 18.0], "396.31"),
        ("VDB", &[2400.0, 300.0, 120.0, 6.0, 18.0, 1.5], "311.81"),
        ("VDB", &[2400.0, 300.0, 10.0, 0.0, 0.875, 1.5], "315.00"),
        (
            "YIELD",
            &[39493.0, 42689.0, 0.0575, 95.04287, 100.0, 2.0, 0.0],
            "0.065",
        ),
        (
            "YIELDDISC",
            &[39494.0, 39508.0, 99.795, 100.0, 2.0],
            "0.052823",
        ),
        (
            "YIELDMAT",
            &[39522.0, 39755.0, 39394.0, 0.0625, 100.0123, 0.0],
            "0.060954",
        ),
    ];

    /// Results recorded from Excel in the ExcelFinancialFunctions test data
    /// (`tests/ExcelFinancialFunctions.Tests/testdata`, Apache-2.0): one row
    /// per basis, chosen at random. Dates are serials; Excel wrote each
    /// result with 10 to 13 significant digits.
    const EXCEL_RESULTS: &[(&str, &[f64], f64)] = &[
        (
            "ACCRINT",
            &[36613.0, 37258.0, 36709.0, 0.1, 10000.0, 1.0, 2.0],
            266.6666666667,
        ),
        (
            "ACCRINT",
            &[34850.0, 37258.0, 35154.0, 0.07, 10000.0, 1.0, 3.0],
            579.1780821918,
        ),
        (
            "ACCRINT",
            &[34028.0, 40364.0, 36709.0, 0.07, 10000.0, 4.0, 1.0],
            5116.153846154,
        ),
        (
            "ACCRINT",
            &[34028.0, 37258.0, 34759.0, 0.1, 12030.34, 2.0, 0.0],
            2409.409761111,
        ),
        (
            "ACCRINT",
            &[32936.0, 40364.0, 40334.0, 0.1, 10000.0, 1.0, 4.0],
            20252.77777778,
        ),
        (
            "ACCRINTM",
            &[36613.0, 36709.0, 0.07, 12030.34, 1.0],
            220.8849311475,
        ),
        (
            "ACCRINTM",
            &[32936.0, 34758.0, 0.1, 10000.0, 4.0],
            4983.333333333,
        ),
        (
            "ACCRINTM",
            &[32936.0, 36709.0, 0.07, 12030.34, 3.0],
            8705.022184658,
        ),
        (
            "ACCRINTM",
            &[36613.0, 36709.0, 0.1, 12030.34, 0.0],
            314.1255444444,
        ),
        (
            "ACCRINTM",
            &[36252.0, 40334.0, 0.07, 10000.0, 2.0],
            7937.222222222,
        ),
        (
            "AMORDEGRC",
            &[200.0, 35489.0, 37711.0, 10.0, 2.0, 0.15, 1.0],
            0.0,
        ),
        (
            "AMORDEGRC",
            &[200.0, 28249.0, 28979.0, 0.0, 1.0, 0.15, 4.0],
            19.0,
        ),
        (
            "AMORDEGRC",
            &[200.0, 35489.0, 39994.0, 50.0, 0.3, 0.07, 0.0],
            0.0,
        ),
        (
            "AMORDEGRC",
            &[100.0, 35489.0, 36219.0, 50.0, 2.0, 0.3, 3.0],
            0.0,
        ),
        (
            "AMORLINC",
            &[200.0, 36981.0, 37711.0, 50.0, 1.0, 0.07, 1.0],
            14.0,
        ),
        (
            "AMORLINC",
            &[100.0, 39263.0, 39994.0, 50.0, 11.3, 0.07, 3.0],
            0.0,
        ),
        (
            "AMORLINC",
            &[100.0, 28249.0, 37711.0, 10.0, 2.0, 0.07, 0.0],
            0.0,
        ),
        (
            "AMORLINC",
            &[100.0, 28249.0, 28979.0, 0.0, 11.3, 0.07, 4.0],
            7.0,
        ),
        ("COUPDAYS", &[37666.0, 37755.0, 4.0, 2.0], 90.0),
        ("COUPDAYS", &[37666.0, 37755.0, 4.0, 4.0], 90.0),
        ("COUPDAYS", &[37666.0, 37755.0, 4.0, 0.0], 90.0),
        ("COUPDAYS", &[37666.0, 37755.0, 2.0, 3.0], 182.5),
        ("COUPDAYS", &[37666.0, 37755.0, 1.0, 1.0], 365.0),
        ("COUPDAYBS", &[29266.0, 38077.0, 1.0, 3.0], 321.0),
        ("COUPDAYBS", &[29676.0, 37755.0, 2.0, 1.0], 137.0),
        ("COUPDAYBS", &[34028.0, 40087.0, 1.0, 4.0], 147.0),
        ("COUPDAYBS", &[34334.0, 35033.0, 1.0, 0.0], 30.0),
        ("COUPDAYBS", &[34028.0, 34365.0, 4.0, 2.0], 28.0),
        ("COUPDAYSNC", &[34334.0, 35033.0, 1.0, 2.0], 334.0),
        ("COUPDAYSNC", &[34028.0, 38077.0, 4.0, 4.0], 32.0),
        ("COUPDAYSNC", &[29676.0, 34365.0, 1.0, 1.0], 306.0),
        ("COUPDAYSNC", &[34334.0, 40334.0, 1.0, 0.0], 154.0),
        ("COUPDAYSNC", &[29266.0, 40359.0, 2.0, 3.0], 136.0),
        ("COUPNCD", &[34028.0, 40359.0, 2.0, 0.0], 34150.0),
        ("COUPNCD", &[34028.0, 34365.0, 4.0, 1.0], 34089.0),
        ("COUPNCD", &[37666.0, 40087.0, 2.0, 4.0], 37712.0),
        ("COUPNCD", &[37666.0, 40334.0, 1.0, 3.0], 37777.0),
        ("COUPNCD", &[29266.0, 36584.0, 2.0, 2.0], 29279.0),
        ("COUPNUM", &[29295.0, 37755.0, 4.0, 2.0], 93.0),
        ("COUPNUM", &[29295.0, 37755.0, 1.0, 4.0], 24.0),
        ("COUPNUM", &[37666.0, 37755.0, 1.0, 1.0], 1.0),
        ("COUPNUM", &[34334.0, 40359.0, 2.0, 0.0], 33.0),
        ("COUPNUM", &[34028.0, 40087.0, 1.0, 3.0], 17.0),
        ("COUPPCD", &[30745.0, 32968.0, 4.0, 0.0], 30686.0),
        ("COUPPCD", &[29295.0, 34365.0, 4.0, 3.0], 29251.0),
        ("COUPPCD", &[29266.0, 36584.0, 2.0, 1.0], 29095.0),
        ("COUPPCD", &[34334.0, 38077.0, 2.0, 2.0], 34242.0),
        ("COUPPCD", &[39386.0, 40359.0, 4.0, 4.0], 39355.0),
        (
            "DISC",
            &[34028.0, 36584.0, 100.0, 130.0, 3.0],
            0.03295413506681,
        ),
        (
            "DISC",
            &[34028.0, 36584.0, 100.0, 67.0, 2.0],
            -0.06937145259617,
        ),
        (
            "DISC",
            &[34334.0, 37755.0, 200.0, 130.0, 4.0],
            -0.05745292052346,
        ),
        (
            "DISC",
            &[39386.0, 39507.0, 200.0, 67.0, 1.0],
            -6.004440606883,
        ),
        (
            "DISC",
            &[34028.0, 38077.0, 200.0, 100.0, 0.0],
            -0.09020295665247,
        ),
        ("DOLLARDE", &[-1.5, 1.0], -1.5),
        ("DOLLARDE", &[1.125, 16.0], 1.78125),
        ("DOLLARDE", &[2.34, 17.0], 4.0),
        ("DOLLARDE", &[-1.5, 20.0], -3.5),
        ("DOLLARFR", &[1.02, 20.0], 1.004),
        ("DOLLARFR", &[1.125, 16.0], 1.02),
        ("DOLLARFR", &[0.34, 20.0], 0.068),
        ("DOLLARFR", &[-1.5, 1.0], -1.5),
        (
            "DURATION",
            &[39386.0, 40334.0, 100.0, 0.1, 2.0, 0.0],
            1.277269312891,
        ),
        (
            "DURATION",
            &[39386.0, 40334.0, 23.0, 0.1, 4.0, 1.0],
            1.302520922648,
        ),
        (
            "DURATION",
            &[34028.0, 38077.0, 200.0, 0.1, 2.0, 2.0],
            4.530667448744,
        ),
        (
            "DURATION",
            &[34028.0, 40334.0, 23.0, 0.1, 1.0, 3.0],
            6.32874173321,
        ),
        (
            "DURATION",
            &[34334.0, 35033.0, 200.0, 0.03, 1.0, 4.0],
            1.410524160524,
        ),
        (
            "INTRATE",
            &[34334.0, 35033.0, 200.0, 130.0, 4.0],
            -0.1826086956522,
        ),
        (
            "INTRATE",
            &[37666.0, 40334.0, 200.0, 130.0, 1.0],
            -0.04791510494753,
        ),
        (
            "INTRATE",
            &[34028.0, 38077.0, 200.0, 100.0, 3.0],
            -0.04507285749568,
        ),
        (
            "INTRATE",
            &[34028.0, 34365.0, 23.0, 130.0, 0.0],
            5.059766189413,
        ),
        (
            "INTRATE",
            &[29266.0, 40087.0, 200.0, 67.0, 2.0],
            -0.02212364846133,
        ),
        ("ISPMT", &[1.5, 5.0, 10.0, -5.4], 4.05),
        ("ISPMT", &[-1.5, 2.5, 2.7, 100.0], 11.11111111111),
        ("ISPMT", &[-1.5, 1.0, 10.0, -300.0], -405.0),
        ("ISPMT", &[0.0, 1.0, 10.0, -100.0], 0.0),
        (
            "MDURATION",
            &[29676.0, 40359.0, 200.0, 0.1, 2.0, 0.0],
            8.089132010434,
        ),
        (
            "MDURATION",
            &[29676.0, 36584.0, 200.0, 0.1, 2.0, 3.0],
            6.560169895163,
        ),
        (
            "MDURATION",
            &[38077.0, 39507.0, 23.0, 0.1, 2.0, 4.0],
            1.955322571866,
        ),
        (
            "MDURATION",
            &[29266.0, 34365.0, 100.0, 0.03, 1.0, 1.0],
            6.78071877418,
        ),
        (
            "MDURATION",
            &[34334.0, 37755.0, 100.0, 0.1, 1.0, 2.0],
            3.71554663676,
        ),
        (
            "ODDFPRICE",
            &[
                36219.0, 40359.0, 35854.0, 39994.0, 0.07, 0.1, 100.0, 4.0, 0.0,
            ],
            56.61331703413,
        ),
        (
            "ODDFPRICE",
            &[
                28614.0, 36584.0, 28249.0, 36219.0, 0.07, 0.03, 67.0, 4.0, 3.0,
            ],
            113.5384708279,
        ),
        (
            "ODDFPRICE",
            &[
                35854.0, 39507.0, 35489.0, 36219.0, 0.07, 0.1, 100.0, 1.0, 4.0,
            ],
            80.92993504652,
        ),
        (
            "ODDFPRICE",
            &[
                37346.0, 38077.0, 35489.0, 37711.0, 0.07, 0.03, 67.0, 1.0, 2.0,
            ],
            74.96007684886,
        ),
        (
            "ODDFPRICE",
            &[
                37025.0, 37755.0, 35854.0, 37390.0, 0.07, 0.1, 130.0, 1.0, 1.0,
            ],
            117.5469262991,
        ),
        (
            "ODDFYIELD",
            &[
                39793.0, 44287.0, 39736.0, 39904.0, 0.06, 100.0, 100.0, 4.0, 1.0,
            ],
            0.05997699855589,
        ),
        (
            "ODDFYIELD",
            &[
                39763.0, 44256.0, 39736.0, 39873.0, 0.0575, 84.5, 100.0, 2.0, 0.0,
            ],
            0.0772455415973,
        ),
        (
            "ODDFYIELD",
            &[
                39872.0, 43981.0, 39706.0, 39963.0, 0.05, 75.0, 89.0, 1.0, 2.0,
            ],
            0.07763359756356,
        ),
        (
            "ODDLPRICE",
            &[37346.0, 40087.0, 36981.0, 0.1, 0.03, 67.0, 1.0, 4.0],
            114.0958664943,
        ),
        (
            "ODDLPRICE",
            &[34303.0, 35033.0, 28249.0, 0.07, 0.1, 130.0, 4.0, 3.0],
            100.6675724638,
        ),
        (
            "ODDLPRICE",
            &[35854.0, 39507.0, 35489.0, 0.07, 0.1, 100.0, 2.0, 2.0],
            81.50951086957,
        ),
        (
            "ODDLPRICE",
            &[34303.0, 40359.0, 28249.0, 0.07, 0.03, 130.0, 2.0, 0.0],
            125.7900296791,
        ),
        (
            "ODDLPRICE",
            &[39629.0, 40334.0, 35854.0, 0.07, 0.03, 67.0, 4.0, 1.0],
            72.14749258481,
        ),
        (
            "ODDLYIELD",
            &[36219.0, 40334.0, 35854.0, 0.07, 67.0, 130.0, 4.0, 2.0],
            0.1701243191118,
        ),
        (
            "ODDLYIELD",
            &[36219.0, 37755.0, 33938.0, 0.07, 100.0, 100.0, 1.0, 3.0],
            0.04870377430423,
        ),
        (
            "ODDLYIELD",
            &[37346.0, 39507.0, 35854.0, 0.07, 67.0, 67.0, 1.0, 4.0],
            0.07323914160255,
        ),
        (
            "ODDLYIELD",
            &[39629.0, 40087.0, 35854.0, 0.07, 100.0, 130.0, 1.0, 0.0],
            0.1807574822894,
        ),
        (
            "ODDLYIELD",
            &[34303.0, 40087.0, 28249.0, 0.1, 67.0, 67.0, 2.0, 1.0],
            0.04297041925834,
        ),
        (
            "PRICE",
            &[34028.0, 35033.0, 0.07, 0.1, 67.0, 4.0, 4.0],
            67.71356565349,
        ),
        (
            "PRICE",
            &[38077.0, 40087.0, 0.1, 0.1, 130.0, 4.0, 1.0],
            117.4208754209,
        ),
        (
            "PRICE",
            &[34028.0, 39507.0, 0.1, 0.1, 130.0, 1.0, 3.0],
            107.1817614811,
        ),
        (
            "PRICE",
            &[29295.0, 35033.0, 0.1, 0.03, 130.0, 4.0, 0.0],
            206.1836166848,
        ),
        (
            "PRICE",
            &[34028.0, 39507.0, 0.07, 0.03, 130.0, 4.0, 2.0],
            167.3343644787,
        ),
        (
            "PRICEDISC",
            &[37666.0, 38077.0, 0.25, 67.0, 4.0],
            48.10972222222,
        ),
        (
            "PRICEDISC",
            &[38077.0, 40334.0, 0.01, 100.0, 2.0],
            93.73055555556,
        ),
        (
            "PRICEDISC",
            &[34334.0, 34365.0, 0.75, 67.0, 3.0],
            62.73219178082,
        ),
        (
            "PRICEDISC",
            &[38077.0, 40334.0, 0.75, 130.0, 0.0],
            -472.6041666667,
        ),
        (
            "PRICEDISC",
            &[29295.0, 34365.0, 0.25, 67.0, 1.0],
            -165.4945245483,
        ),
        (
            "PRICEMAT",
            &[38077.0, 40087.0, 36613.0, 0.1, 0.03, 4.0],
            127.3859722322,
        ),
        (
            "PRICEMAT",
            &[39386.0, 39507.0, 34028.0, 0.1, 0.1, 1.0],
            95.29488215252,
        ),
        (
            "PRICEMAT",
            &[34334.0, 39507.0, 32936.0, 0.1, 0.03, 2.0],
            158.5889768823,
        ),
        (
            "PRICEMAT",
            &[38077.0, 40359.0, 36252.0, 0.1, 0.1, 3.0],
            80.76534052596,
        ),
        (
            "PRICEMAT",
            &[34334.0, 39507.0, 34028.0, 0.07, 0.1, 0.0],
            78.98455984724,
        ),
        (
            "RECEIVED",
            &[34028.0, 39507.0, 200.0, 0.01, 2.0],
            235.9031486517,
        ),
        (
            "RECEIVED",
            &[29266.0, 40087.0, 200.0, 0.01, 3.0],
            284.2789828264,
        ),
        (
            "RECEIVED",
            &[37666.0, 40359.0, 200.0, 0.01, 0.0],
            215.9309021113,
        ),
        (
            "RECEIVED",
            &[37666.0, 40334.0, 100.0, 0.01, 1.0],
            107.8802020262,
        ),
        (
            "RECEIVED",
            &[29295.0, 36584.0, 23.0, 0.01, 4.0],
            28.73303952528,
        ),
        ("TBILLEQ", &[38077.0, 38267.0, 0.75], 1.22881817441),
        ("TBILLEQ", &[34334.0, 34524.0, 0.75], 1.22881817441),
        ("TBILLEQ", &[29676.0, 29866.0, 0.75], 1.22881817441),
        ("TBILLEQ", &[29676.0, 29866.0, 0.01], 0.01019063395621),
        ("TBILLPRICE", &[29676.0, 29721.0, 0.25], 96.875),
        ("TBILLPRICE", &[29266.0, 29295.0, 0.25], 97.98611111111),
        ("TBILLPRICE", &[29266.0, 29340.0, 0.75], 84.58333333333),
        ("TBILLPRICE", &[38077.0, 38122.0, 0.25], 96.875),
        ("TBILLYIELD", &[29266.0, 29456.0, 130.0], -0.4372469635628),
        ("TBILLYIELD", &[34334.0, 34524.0, 130.0], -0.4372469635628),
        ("TBILLYIELD", &[29266.0, 29295.0, 75.0], 4.137931034483),
        ("TBILLYIELD", &[38077.0, 38122.0, 100.0], 0.0),
        (
            "VDB",
            &[200.0, 50.0, 40.0, 13.0, 20.0, 1.0, 1.0],
            23.37214139238,
        ),
        ("VDB", &[200.0, 0.0, 40.0, 0.0, 13.0, 50.3, 1.0], 200.0),
        (
            "VDB",
            &[200.0, 50.0, 40.0, 10.0, 13.0, 3.0, 0.0],
            19.12718284686,
        ),
        ("VDB", &[100.0, 50.0, 13.0, 0.0, 4.2, 3.0, 0.0], 50.0),
        (
            "YIELDDISC",
            &[29676.0, 40334.0, 200.0, 67.0, 2.0],
            -0.0224620003753,
        ),
        (
            "YIELDDISC",
            &[37666.0, 37755.0, 200.0, 67.0, 1.0],
            -2.727247191011,
        ),
        (
            "YIELDDISC",
            &[34028.0, 38077.0, 100.0, 130.0, 0.0],
            0.02706088699574,
        ),
        (
            "YIELDDISC",
            &[29676.0, 38077.0, 100.0, 67.0, 3.0],
            -0.01433757885966,
        ),
        (
            "YIELDDISC",
            &[29295.0, 40087.0, 23.0, 130.0, 4.0],
            0.1574635773501,
        ),
        (
            "YIELDMAT",
            &[38077.0, 40359.0, 32936.0, 0.07, 75.0, 3.0],
            0.06335848233573,
        ),
        (
            "YIELDMAT",
            &[39386.0, 40359.0, 36252.0, 0.1, 100.0, 1.0],
            0.05381819372585,
        ),
        (
            "YIELDMAT",
            &[34334.0, 38077.0, 32936.0, 0.1, 100.0, 2.0],
            0.07202881152461,
        ),
        (
            "YIELDMAT",
            &[34334.0, 35033.0, 32936.0, 0.07, 100.0, 0.0],
            0.05521593374088,
        ),
        (
            "YIELDMAT",
            &[37666.0, 40087.0, 34850.0, 0.1, 75.0, 4.0],
            0.09056178891294,
        ),
    ];

    #[test]
    fn microsoft_published_examples() {
        let mismatches: Vec<String> = MICROSOFT_EXAMPLES
            .iter()
            .filter_map(|(name, arguments, published)| {
                let decimals = published.split_once('.').map_or(0, |(_, part)| part.len());
                let tolerance = 0.5 * 10f64.powi(-(decimals as i32));
                let expected: f64 = published.parse().unwrap();
                let actual = number(name, arguments);

                ((actual - expected).abs() > tolerance)
                    .then(|| format!("{name}{arguments:?}: {actual} is not {published}"))
            })
            .collect();

        assert!(mismatches.is_empty(), "{}", mismatches.join("\n"));
    }

    #[test]
    fn results_recorded_from_excel() {
        for (name, arguments, expected) in EXCEL_RESULTS {
            let actual = number(name, arguments);
            let error = (actual - expected).abs() / expected.abs().max(1.0);

            assert!(
                error < 1e-9,
                "{name}{arguments:?}: {actual} is not {expected}"
            );
        }
    }

    #[test]
    fn invalid_arguments_follow_the_microsoft_remarks() {
        let cases: &[(&str, &[f64], FormulaError)] = &[
            ("COUPDAYS", &[40862.0, 40568.0, 2.0, 1.0], FormulaError::Num),
            ("COUPDAYS", &[40568.0, 40862.0, 3.0, 1.0], FormulaError::Num),
            ("COUPDAYS", &[40568.0, 40862.0, 2.0, 5.0], FormulaError::Num),
            ("COUPDAYS", &[-1.0, 40862.0, 2.0, 1.0], FormulaError::Value),
            (
                "PRICE",
                &[39493.0, 43054.0, -0.01, 0.065, 100.0, 2.0],
                FormulaError::Num,
            ),
            (
                "PRICE",
                &[39493.0, 43054.0, 0.0575, 0.065, 0.0, 2.0],
                FormulaError::Num,
            ),
            (
                "YIELD",
                &[39493.0, 42689.0, 0.0575, 0.0, 100.0, 2.0],
                FormulaError::Num,
            ),
            (
                "ACCRINT",
                &[39569.0, 39691.0, 39508.0, 0.1, 1000.0, 2.0],
                FormulaError::Num,
            ),
            (
                "ACCRINTM",
                &[39539.0, 39614.0, 0.0, 1000.0],
                FormulaError::Num,
            ),
            ("DISC", &[43282.0, 54058.0, 0.0, 100.0], FormulaError::Num),
            (
                "RECEIVED",
                &[39493.0, 39583.0, 1000.0, 4.0, 2.0],
                FormulaError::Num,
            ),
            ("TBILLPRICE", &[39538.0, 39904.0, 0.09], FormulaError::Num),
            ("TBILLYIELD", &[39538.0, 39600.0, 0.0], FormulaError::Num),
            (
                "ODDFPRICE",
                &[
                    39763.0, 44256.0, 39736.0, 39872.0, 0.0785, 0.0625, 100.0, 2.0, 1.0,
                ],
                FormulaError::Num,
            ),
            (
                "ODDLPRICE",
                &[39370.0, 39614.0, 39485.0, 0.0375, 0.0405, 100.0, 2.0],
                FormulaError::Num,
            ),
            ("DOLLARDE", &[1.02, 0.5], FormulaError::DivZero),
            ("DOLLARFR", &[1.02, -1.0], FormulaError::Num),
            ("ISPMT", &[0.1, 1.0, 0.0, 1000.0], FormulaError::DivZero),
            ("VDB", &[2400.0, 300.0, 10.0, 2.0, 1.0], FormulaError::Num),
            (
                "AMORDEGRC",
                &[2400.0, 39679.0, 39813.0, 300.0, 1.0, 0.22],
                FormulaError::Num,
            ),
            (
                "AMORLINC",
                &[2400.0, 39679.0, 39813.0, 300.0, 1.0, 0.15, 2.0],
                FormulaError::Num,
            ),
        ];

        for (name, arguments, error) in cases {
            assert_eq!(
                call(name, arguments),
                Value::Error(*error),
                "{name}{arguments:?}"
            );
        }
    }
}
