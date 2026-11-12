//! Depreciation by variable declining balance (`VDB`) and by the French
//! accounting system (`AMORDEGRC`, `AMORLINC`).

use super::super::functions::{bool_arg, number_arg, require_arity, FuncAccumulator};
use super::securities::{Basis, Date};
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &["AMORDEGRC", "AMORLINC", "VDB"];

const DEFAULT_FACTOR: f64 = 2.0;
/// VDB sums one term per period. A larger end period is `#NUM!`, so one
/// call cannot run without bound.
const MAX_PERIODS: f64 = 1_000_000.0;
const DAYS_PER_YEAR: f64 = 365.0;
const DAYS_PER_LEAP_YEAR: f64 = 366.0;
/// AMORDEGRC rounds each result to a whole number after rounding it to
/// 13 decimal places, as Excel does.
const ROUNDING_SCALE: f64 = 1e13;
/// AMORDEGRC takes half of the remaining value when two years of the
/// asset's life remain, within this tolerance.
const LIFE_TOLERANCE: f64 = 1e-4;
const LAST_TWO_YEARS: f64 = 2.0;
const FEBRUARY: i64 = 2;
const LAST_SHARED_FEBRUARY_DAY: i64 = 28;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    let result = if name == "VDB" {
        variable_declining_balance(values)
    } else {
        french_depreciation(values, name == "AMORDEGRC")
    };

    match result {
        Ok(number) if number.is_finite() => Value::number(number),
        Ok(_) => Value::Error(FormulaError::Num),
        Err(error) => Value::Error(error),
    }
}

fn ensure(is_valid: bool) -> Result<(), FormulaError> {
    if is_valid {
        Ok(())
    } else {
        Err(FormulaError::Num)
    }
}

/// VDB(cost, salvage, life, `start_period`, `end_period`, [factor],
/// [`no_switch`]). A fraction of a period takes the same fraction of that
/// period's depreciation.
fn variable_declining_balance(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 5, 7)?;

    let asset = Asset {
        cost: number_arg(values, 0, None)?,
        salvage: number_arg(values, 1, None)?,
        life: number_arg(values, 2, None)?,
        factor: number_arg(values, 5, Some(DEFAULT_FACTOR))?,
    };
    let start = number_arg(values, 3, None)?;
    let end = number_arg(values, 4, None)?;
    let no_switch = bool_arg(values, 6, Some(false))?;

    ensure(asset.cost >= 0.0 && asset.salvage >= 0.0 && asset.salvage <= asset.cost)?;
    ensure(asset.life > 0.0 && asset.factor > 0.0)?;
    ensure(start >= 0.0 && start <= end && end <= asset.life && end <= MAX_PERIODS)?;

    if no_switch {
        Ok(asset.declining_between(start, end))
    } else {
        Ok(asset.switching_between(start, end))
    }
}

struct Asset {
    cost: f64,
    salvage: f64,
    life: f64,
    factor: f64,
}

impl Asset {
    /// The declining balance depreciation of one whole period, as DDB.
    fn declining_balance(&self, cost: f64, period: f64) -> f64 {
        let full_rate = self.factor / self.life;

        let (rate, before) = if full_rate >= 1.0 {
            (1.0, if period == 1.0 { cost } else { 0.0 })
        } else {
            (full_rate, cost * (1.0 - full_rate).powf(period - 1.0))
        };

        let after = cost * (1.0 - rate).powf(period);
        let depreciation = if after < self.salvage {
            before - self.salvage
        } else {
            before - after
        };

        depreciation.max(0.0)
    }

    /// Declining balance only, with the first and last periods cut to the
    /// requested fractions.
    fn declining_between(&self, start: f64, end: f64) -> f64 {
        let whole_start = start.floor();
        let whole_end = end.ceil();
        let mut total = 0.0;
        let mut period = whole_start + 1.0;

        while period <= whole_end {
            let mut term = self.declining_balance(self.cost, period);

            if period == whole_start + 1.0 {
                term *= end.min(whole_start + 1.0) - start;
            } else if period == whole_end {
                term *= end + 1.0 - whole_end;
            }

            total += term;
            period += 1.0;
        }

        total
    }

    /// Declining balance that switches to straight line when straight line
    /// gives more. Fractions at either end are taken from whole periods.
    fn switching_between(&self, start: f64, end: f64) -> f64 {
        let whole_start = start.floor();
        let whole_end = end.ceil();
        let mut part = 0.0;

        if start != whole_start {
            part += (start - whole_start) * self.period_after(whole_start);
        }

        if end != whole_end {
            part += (whole_end - end) * self.period_after(whole_end - 1.0);
        }

        let remaining = self.cost - self.switching_total(self.cost, self.life, whole_start);

        self.switching_total(remaining, self.life - whole_start, whole_end - whole_start) - part
    }

    /// The switching depreciation of the one whole period after `periods`.
    fn period_after(&self, periods: f64) -> f64 {
        let remaining = self.cost - self.switching_total(self.cost, self.life, periods);

        self.switching_total(remaining, self.life - periods, 1.0)
    }

    /// The switching depreciation of the first `periods` periods of an
    /// asset with value `cost` and `life_left` periods to go.
    fn switching_total(&self, cost: f64, life_left: f64, periods: f64) -> f64 {
        let whole_periods = periods.ceil();
        let mut left_to_depreciate = cost - self.salvage;
        let mut straight_line = 0.0;
        let mut is_straight_line = false;
        let mut total = 0.0;
        let mut period = 1.0;

        while period <= whole_periods {
            let mut term = if is_straight_line {
                straight_line
            } else {
                let declining = self.declining_balance(cost, period);

                straight_line = left_to_depreciate / (life_left - (period - 1.0));

                if straight_line > declining {
                    is_straight_line = true;
                    straight_line
                } else {
                    left_to_depreciate -= declining;
                    declining
                }
            };

            if period == whole_periods {
                term *= periods + 1.0 - whole_periods;
            }

            total += term;
            period += 1.0;
        }

        total
    }
}

/// AMORDEGRC and AMORLINC(cost, `date_purchased`, `first_period`, salvage,
/// period, rate, [basis]). The actual/360 basis is `#NUM!`.
fn french_depreciation(values: &FuncAccumulator, is_degressive: bool) -> NumberResult {
    require_arity(values, 6, 7)?;

    let cost = number_arg(values, 0, None)?;
    let purchased = Date::from_serial(number_arg(values, 1, None)?)?;
    let first_period = Date::from_serial(number_arg(values, 2, None)?)?;
    let salvage = number_arg(values, 3, None)?;
    let period = number_arg(values, 4, None)?;
    let rate = number_arg(values, 5, None)?;
    let basis = Basis::from_number(number_arg(values, 6, Some(0.0))?)?;

    ensure(cost >= 0.0 && salvage >= 0.0 && salvage < cost)?;
    ensure(period >= 0.0 && rate >= 0.0 && purchased < first_period)?;
    ensure(basis != Basis::Actual360)?;

    let asset = FrenchAsset {
        cost,
        purchased,
        first_period,
        salvage,
        basis,
    };

    if is_degressive {
        let life = 1.0 / rate;

        ensure(!(0.0..=3.0).contains(&life) && !(4.0..=5.0).contains(&life))?;

        Ok(asset.degressive(period, rate))
    } else {
        Ok(asset.linear(period, rate))
    }
}

struct FrenchAsset {
    cost: f64,
    purchased: Date,
    first_period: Date,
    salvage: f64,
    basis: Basis,
}

impl FrenchAsset {
    /// The depreciation of the first, partial period, and the number of
    /// periods in the asset's life. A purchase on the first period's start
    /// date depreciates a whole period and adds no period.
    fn first_depreciation(&self, rate: f64, life: f64) -> (f64, f64) {
        let year_days = match self.basis {
            Basis::ActualActual if self.purchased.is_leap_year() => DAYS_PER_LEAP_YEAR,
            Basis::ActualActual => DAYS_PER_YEAR,
            Basis::UsThirty | Basis::Actual360 | Basis::Actual365 | Basis::EuropeanThirty => {
                self.basis.year_days(self.purchased, self.purchased)
            }
        };
        let start = self.shared_february_day(self.purchased);
        let end = self.shared_february_day(self.first_period);
        let share = self.basis.days(start, end) / year_days * rate * self.cost;

        let (depreciation, periods) = if share == 0.0 {
            (self.cost * rate, life)
        } else {
            (share, life + 1.0)
        };

        (depreciation.min(self.cost - self.salvage), periods)
    }

    /// The actual-day bases count 28 and 29 February of a leap year as 28
    /// February.
    fn shared_february_day(&self, date: Date) -> Date {
        let is_actual = matches!(self.basis, Basis::ActualActual | Basis::Actual365);

        if is_actual
            && date.is_leap_year()
            && date.month() == FEBRUARY
            && date.day() >= LAST_SHARED_FEBRUARY_DAY
        {
            date.with_day(LAST_SHARED_FEBRUARY_DAY)
        } else {
            date
        }
    }

    /// AMORLINC: the same depreciation each period until the value left
    /// reaches the salvage value.
    fn linear(&self, period: f64, rate: f64) -> f64 {
        let life = (1.0 / rate).ceil();

        if self.cost == self.salvage || period > life {
            return 0.0;
        }

        let (first, _) = self.first_depreciation(rate, life);

        if period == 0.0 {
            return first;
        }

        let mut depreciation = rate * self.cost;
        let mut left = self.cost - self.salvage - first;
        let mut counted = 1.0;

        while counted <= period {
            depreciation = depreciation.min(left);
            left = (left - depreciation).max(0.0);
            counted += 1.0;
        }

        depreciation
    }

    /// AMORDEGRC: a declining rate scaled by a coefficient for the asset
    /// life, with half the remaining value in each of the last two years.
    fn degressive(&self, period: f64, rate: f64) -> f64 {
        let whole_life = (1.0 / rate).ceil();

        if self.cost == self.salvage || period > whole_life {
            return 0.0;
        }

        let mut period_rate = rate * life_coefficient(whole_life);
        let (unrounded_first, life) = self.first_depreciation(period_rate, whole_life);
        let first = excel_round(unrounded_first);

        if period == 0.0 {
            return first;
        }

        let mut remaining = self.cost - first;
        let mut depreciation = 0.0;
        let mut counted = 1.0;

        while counted <= period {
            counted += 1.0;

            let is_last_two_years = (life - counted - LAST_TWO_YEARS).abs() < LIFE_TOLERANCE;
            let declining = if is_last_two_years {
                remaining * 0.5
            } else {
                period_rate * remaining
            };

            if is_last_two_years {
                period_rate = 1.0;
            }

            depreciation = if remaining < self.salvage {
                (remaining - self.salvage).max(0.0)
            } else {
                declining
            };
            remaining -= depreciation;
        }

        excel_round(depreciation)
    }
}

/// The AMORDEGRC coefficient for an asset life in years.
fn life_coefficient(life: f64) -> f64 {
    if (3.0..=4.0).contains(&life) {
        1.5
    } else if (5.0..=6.0).contains(&life) {
        2.0
    } else if life > 6.0 {
        2.5
    } else {
        1.0
    }
}

fn excel_round(number: f64) -> f64 {
    ((number * ROUNDING_SCALE).round() / ROUNDING_SCALE).round()
}
