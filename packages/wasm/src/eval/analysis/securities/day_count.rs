//! Calendar dates, Excel's five day-count bases and coupon dates.
//!
//! The rules follow Excel's results, which differ from the textbook rules in
//! some places. The 30/360 US rule changes the end date in two ways, and
//! coupon dates step back from maturity one period at a time, so a day that
//! a short month clamps stays clamped.

use super::super::super::date::{date_parts, date_serial};
use crate::types::FormulaError;

const MONTHS_PER_YEAR: i64 = 12;
const DAYS_PER_30_360_YEAR: f64 = 360.0;
const DAYS_PER_YEAR: f64 = 365.0;
const DAYS_PER_LEAP_YEAR: f64 = 366.0;
const DAYS_PER_30_360_MONTH: i64 = 30;
const FEBRUARY: i64 = 2;

/// Excel's day-count bases, the `basis` argument from 0 to 4.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Basis {
    /// 0: 30/360 with the US (NASD) end-of-month rules.
    UsThirty,
    /// 1: actual days over actual days in the year.
    ActualActual,
    /// 2: actual days over 360.
    Actual360,
    /// 3: actual days over 365.
    Actual365,
    /// 4: 30/360 with the European end-of-month rule.
    EuropeanThirty,
}

impl Basis {
    /// Reads a `basis` argument. Excel truncates it, and a value outside 0
    /// to 4 is `#NUM!`.
    pub(crate) fn from_number(value: f64) -> Result<Self, FormulaError> {
        let basis = value.trunc();

        if !(0.0..=4.0).contains(&basis) {
            return Err(FormulaError::Num);
        }

        Ok(match basis as u8 {
            0 => Self::UsThirty,
            1 => Self::ActualActual,
            2 => Self::Actual360,
            3 => Self::Actual365,
            _ => Self::EuropeanThirty,
        })
    }

    /// The days from `start` to `end` that count for interest.
    pub(crate) fn days(self, start: Date, end: Date) -> f64 {
        match self {
            Self::UsThirty => days_360_us(start, end, false),
            Self::EuropeanThirty => days_360_european(start, end),
            Self::ActualActual | Self::Actual360 | Self::Actual365 => actual_days(start, end),
        }
    }

    /// The days in a year for an interval from `start` to `end`.
    pub(crate) fn year_days(self, start: Date, end: Date) -> f64 {
        match self {
            Self::Actual365 => DAYS_PER_YEAR,
            Self::ActualActual => actual_year_days(start, end),
            Self::UsThirty | Self::Actual360 | Self::EuropeanThirty => DAYS_PER_30_360_YEAR,
        }
    }

    /// The days in a regular coupon period from `previous` to `next`.
    pub(crate) fn period_days(self, previous: Date, next: Date, frequency: f64) -> f64 {
        match self {
            Self::ActualActual => actual_days(previous, next),
            Self::Actual365 => DAYS_PER_YEAR / frequency,
            Self::UsThirty | Self::Actual360 | Self::EuropeanThirty => {
                DAYS_PER_30_360_YEAR / frequency
            }
        }
    }

    /// The days from the previous coupon date to the settlement date.
    pub(crate) fn days_before_settlement(self, coupons: Coupons) -> f64 {
        self.days(coupons.previous, coupons.settlement)
    }

    /// The days from the settlement date to the next coupon date. The US
    /// 30/360 rule counts the whole period with both dates changed, so this
    /// is not always `days(settlement, next)`.
    pub(crate) fn days_after_settlement(self, coupons: Coupons) -> f64 {
        match self {
            Self::UsThirty => {
                days_360_us(coupons.previous, coupons.next, true)
                    - days_360_us(coupons.previous, coupons.settlement, false)
            }
            Self::ActualActual | Self::Actual360 | Self::Actual365 | Self::EuropeanThirty => {
                self.days(coupons.settlement, coupons.next)
            }
        }
    }
}

/// A calendar date. Fields are in year, month, day order, so the derived
/// order is the date order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct Date {
    year: i64,
    month: i64,
    day: i64,
}

impl Date {
    /// Reads a date serial. Excel truncates the time of day. A serial that
    /// is not a date is `#VALUE!`, as the function pages say.
    #[inline(never)]
    pub(crate) fn from_serial(serial: f64) -> Result<Self, FormulaError> {
        let whole = serial.trunc();

        if whole < 1.0 {
            return Err(FormulaError::Value);
        }

        let (year, month, day) = date_parts(whole).ok_or(FormulaError::Value)?;

        Ok(Self { year, month, day })
    }

    /// The date serial, or NaN for a date after the last Excel date.
    #[inline(never)]
    pub(crate) fn serial(self) -> f64 {
        date_serial(self.year, self.month, self.day).unwrap_or(f64::NAN)
    }

    pub(crate) fn month(self) -> i64 {
        self.month
    }

    pub(crate) fn day(self) -> i64 {
        self.day
    }

    pub(crate) fn is_last_day_of_month(self) -> bool {
        self.day == days_in_month(self.year, self.month)
    }

    pub(crate) fn is_leap_year(self) -> bool {
        is_leap_year(self.year)
    }

    fn is_last_day_of_february(self) -> bool {
        self.month == FEBRUARY && self.is_last_day_of_month()
    }

    /// Moves the date by whole months. The day stays the same unless the
    /// new month is shorter; `to_last_day` moves it to the month's last day.
    pub(crate) fn add_months(self, months: i64, to_last_day: bool) -> Self {
        let total = self.year * MONTHS_PER_YEAR + self.month - 1 + months;
        let year = total.div_euclid(MONTHS_PER_YEAR);
        let month = total.rem_euclid(MONTHS_PER_YEAR) + 1;
        let last_day = days_in_month(year, month);

        let day = if to_last_day {
            last_day
        } else {
            self.day.min(last_day)
        };

        Self { year, month, day }
    }

    /// The same date with another day of the month.
    pub(crate) fn with_day(self, day: i64) -> Self {
        Self { day, ..self }
    }

    /// The last day of the date's month.
    pub(crate) fn month_end(self) -> Self {
        self.with_day(days_in_month(self.year, self.month))
    }
}

/// The coupon dates around a settlement date.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Coupons {
    pub(crate) previous: Date,
    pub(crate) settlement: Date,
    pub(crate) next: Date,
    /// The number of coupons payable from settlement to maturity.
    pub(crate) remaining: f64,
}

impl Coupons {
    /// Steps back from `maturity` one coupon period at a time to the last
    /// coupon date on or before `settlement`. A maturity on the last day of
    /// a month keeps every coupon on the last day of its month.
    pub(crate) fn find(settlement: Date, maturity: Date, frequency: f64) -> Self {
        let months = period_months(frequency);
        let is_month_end = maturity.is_last_day_of_month();
        let mut previous = maturity;
        let mut next = settlement;

        while previous > settlement {
            next = previous;
            previous = previous.add_months(-months, is_month_end);
        }

        let elapsed_months =
            (maturity.year - previous.year) * MONTHS_PER_YEAR + maturity.month - previous.month;

        Self {
            previous,
            settlement,
            next,
            remaining: elapsed_months as f64 * frequency / MONTHS_PER_YEAR as f64,
        }
    }
}

/// The months in one coupon period.
pub(crate) fn period_months(frequency: f64) -> i64 {
    MONTHS_PER_YEAR / frequency as i64
}

/// Actual calendar days from `start` to `end`.
pub(crate) fn actual_days(start: Date, end: Date) -> f64 {
    end.serial() - start.serial()
}

/// US 30/360 days. Both rules change a 31st and a last day of February to
/// the 30th. `change_both` also changes the end date when the start date is
/// not at a month end.
pub(crate) fn days_360_us(start: Date, end: Date, change_both: bool) -> f64 {
    let mut start_day = start.day;
    let mut end_day = end.day;

    if end.is_last_day_of_february() && (start.is_last_day_of_february() || change_both) {
        end_day = DAYS_PER_30_360_MONTH;
    }

    if end_day == 31 && (start_day >= DAYS_PER_30_360_MONTH || change_both) {
        end_day = DAYS_PER_30_360_MONTH;
    }

    if start_day == 31 || start.is_last_day_of_february() {
        start_day = DAYS_PER_30_360_MONTH;
    }

    days_360(start, start_day, end, end_day)
}

/// European 30/360 days: a 31st counts as the 30th.
fn days_360_european(start: Date, end: Date) -> f64 {
    days_360(
        start,
        start.day.min(DAYS_PER_30_360_MONTH),
        end,
        end.day.min(DAYS_PER_30_360_MONTH),
    )
}

fn days_360(start: Date, start_day: i64, end: Date, end_day: i64) -> f64 {
    let years = end.year - start.year;
    let months = end.month - start.month;

    (years * 360 + months * DAYS_PER_30_360_MONTH + end_day - start_day) as f64
}

/// The actual/actual year length. An interval of up to one year has 366
/// days when it holds a 29 February, or ends on one. A longer interval uses
/// the average length of the calendar years it touches.
fn actual_year_days(start: Date, end: Date) -> f64 {
    let is_within_a_year = start.year == end.year
        || (end.year == start.year + 1 && (start.month, start.day) >= (end.month, end.day));

    if !is_within_a_year {
        let years = end.year - start.year + 1;
        let first = Date {
            year: start.year,
            month: 1,
            day: 1,
        };
        let after_last = Date {
            year: end.year + 1,
            month: 1,
            day: 1,
        };

        return actual_days(first, after_last) / years as f64;
    }

    if holds_leap_day(start, end) {
        DAYS_PER_LEAP_YEAR
    } else {
        DAYS_PER_YEAR
    }
}

fn holds_leap_day(start: Date, end: Date) -> bool {
    if start.year == end.year {
        return start.is_leap_year();
    }

    if end.month == FEBRUARY && end.day == 29 {
        return true;
    }

    if start.is_leap_year() {
        start.month <= FEBRUARY
    } else {
        end.is_leap_year() && end.month > FEBRUARY
    }
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        FEBRUARY if is_leap_year(year) => 29,
        FEBRUARY => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}
