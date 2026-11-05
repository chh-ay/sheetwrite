//! ODDFPRICE, ODDFYIELD, ODDLPRICE and ODDLYIELD: bonds with a short or
//! long first or last coupon period.
//!
//! A long odd period is split into quasi-coupon periods of normal length.
//! Each one adds its share of a coupon, and the price discounts the cash
//! flows from the settlement date, as on the Microsoft Support pages.

use super::day_count::{days_360_us, period_months, Basis, Coupons, Date};
use super::{
    basis_arg, date_arg, ensure, frequency_arg, number_arg, require_arity, solve, FuncAccumulator,
    NumberResult, FACE_VALUE,
};

/// The odd first period bond of ODDFPRICE and ODDFYIELD.
struct FirstPeriodBond {
    settlement: Date,
    maturity: Date,
    issue: Date,
    first_coupon: Date,
    rate: f64,
    redemption: f64,
    frequency: f64,
    basis: Basis,
}

/// ODDFPRICE and ODDFYIELD(settlement, maturity, issue, first_coupon, rate,
/// yld or pr, redemption, frequency, [basis]).
pub(super) fn first_period(values: &FuncAccumulator, is_yield: bool) -> NumberResult {
    require_arity(values, 8, 9)?;

    let bond = FirstPeriodBond {
        settlement: date_arg(values, 0)?,
        maturity: date_arg(values, 1)?,
        issue: date_arg(values, 2)?,
        first_coupon: date_arg(values, 3)?,
        rate: number_arg(values, 4, None)?,
        redemption: number_arg(values, 6, None)?,
        frequency: frequency_arg(values, 7)?,
        basis: basis_arg(values, 8)?,
    };
    let quote = number_arg(values, 5, None)?;

    ensure(
        bond.maturity > bond.first_coupon
            && bond.first_coupon > bond.settlement
            && bond.settlement > bond.issue,
    )?;
    ensure(bond.rate >= 0.0 && if is_yield { quote > 0.0 } else { quote >= 0.0 })?;
    ensure(bond.is_on_maturity_schedule())?;

    if !is_yield {
        return Ok(bond.price(quote));
    }

    solve(
        |annual_yield| quote - bond.price(annual_yield),
        bond.yield_guess(quote),
    )
}

impl FirstPeriodBond {
    fn days(&self, start: Date, end: Date) -> f64 {
        self.basis.days(start, end).max(0.0)
    }

    fn months(&self) -> i64 {
        period_months(self.frequency)
    }

    /// Excel needs the first coupon date on the schedule that steps back
    /// from maturity.
    fn is_on_maturity_schedule(&self) -> bool {
        let is_month_end = self.maturity.is_last_day_of_month();
        let mut date = self.maturity.add_months(-self.months(), is_month_end);

        while date > self.first_coupon {
            date = date.add_months(-self.months(), is_month_end);
        }

        date == self.first_coupon
    }

    /// A first guess for the yield, from the simple-interest return.
    fn yield_guess(&self, price: f64) -> f64 {
        let days = self.basis.days(self.settlement, self.maturity);
        let gain = price - FACE_VALUE;
        let numerator = self.rate * days * FACE_VALUE - gain;
        let denominator = gain / 4.0 + days * gain / 2.0 + days * FACE_VALUE;

        numerator / denominator
    }

    fn price(&self, annual_yield: f64) -> f64 {
        let first_period = Coupons::find(self.settlement, self.first_coupon, self.frequency);
        let period_days =
            self.basis
                .period_days(first_period.previous, first_period.next, self.frequency);

        if self.days(self.issue, self.first_coupon) < period_days {
            self.short_first_price(annual_yield, period_days)
        } else {
            self.long_first_price(annual_yield, period_days, first_period)
        }
    }

    /// The first period is shorter than a normal period.
    fn short_first_price(&self, annual_yield: f64, period_days: f64) -> f64 {
        let coupons = Coupons::find(self.settlement, self.maturity, self.frequency).remaining;
        let coupon = FACE_VALUE * self.rate / self.frequency;
        let base = annual_yield / self.frequency + 1.0;
        let first_share = self.days(self.settlement, self.first_coupon) / period_days;
        let odd_share = self.days(self.issue, self.first_coupon) / period_days;
        let accrued_share = self.days(self.issue, self.settlement) / period_days;
        let mut value = self.redemption / base.powf(coupons - 1.0 + first_share);

        value += coupon * odd_share / base.powf(first_share);

        for index in 2..=coupons as u64 {
            value += coupon / base.powf(index as f64 - 1.0 + first_share);
        }

        value - coupon * accrued_share
    }

    /// The first period is longer than a normal period. It is split into
    /// quasi-coupon periods that step back from the first coupon date.
    fn long_first_price(&self, annual_yield: f64, period_days: f64, first_period: Coupons) -> f64 {
        let quasi_periods = Coupons::find(self.issue, self.first_coupon, self.frequency).remaining;
        let mut later = self.first_coupon;
        let mut odd_share = 0.0;
        let mut accrued_share = 0.0;

        for index in (1..=quasi_periods as u64).rev() {
            let earlier = later.add_months(-self.months(), false);
            let length = if self.basis == Basis::ActualActual {
                self.days(earlier, later)
            } else {
                period_days
            };
            let counted = if index > 1 {
                length
            } else {
                self.days(self.issue, later)
            };
            let accrued = self.days(self.issue.max(earlier), self.settlement.min(later));

            odd_share += counted / length;
            accrued_share += accrued / length;
            later = earlier;
        }

        let to_next = if matches!(self.basis, Basis::Actual360 | Basis::Actual365) {
            self.days(self.settlement, first_period.next)
        } else {
            period_days - self.basis.days(first_period.previous, self.settlement)
        };
        let first_share = to_next / period_days;
        let whole_periods = self.quasi_periods_to_first_coupon();
        let coupons = Coupons::find(self.first_coupon, self.maturity, self.frequency).remaining;
        let coupon = FACE_VALUE * self.rate / self.frequency;
        let base = annual_yield / self.frequency + 1.0;
        let mut value = self.redemption / base.powf(first_share + whole_periods + coupons);

        value += coupon * odd_share / base.powf(whole_periods + first_share);

        for index in 1..=coupons as u64 {
            value += coupon / base.powf(index as f64 + whole_periods + first_share);
        }

        value - coupon * accrued_share
    }

    /// The whole quasi-coupon periods from the settlement date to the first
    /// coupon date. A first coupon on the 29th or 30th of a 31-day month
    /// takes its month-end rule from the settlement date.
    fn quasi_periods_to_first_coupon(&self) -> f64 {
        let first = self.first_coupon;
        let mut is_month_end = first.is_last_day_of_month();

        if !is_month_end && first.month() != 2 && first.day() > 28 {
            is_month_end = self.settlement.is_last_day_of_month();
        }

        let start = if is_month_end {
            self.settlement.month_end()
        } else {
            self.settlement
        };
        let mut periods = if self.settlement < start { 1.0 } else { 0.0 };
        let mut date = start.add_months(self.months(), is_month_end);

        while date < first {
            date = date.add_months(self.months(), is_month_end);
            periods += 1.0;
        }

        periods
    }
}

/// The odd last period bond of ODDLPRICE and ODDLYIELD.
struct LastPeriodBond {
    settlement: Date,
    maturity: Date,
    last_interest: Date,
    frequency: f64,
    basis: Basis,
}

/// The shares of normal periods in the odd last period: the whole period,
/// the part before settlement, and the part after it.
struct LastPeriodShares {
    period: f64,
    accrued: f64,
    remaining: f64,
}

/// ODDLPRICE and ODDLYIELD(settlement, maturity, last_interest, rate, yld
/// or pr, redemption, frequency, [basis]).
pub(super) fn last_period(values: &FuncAccumulator, is_yield: bool) -> NumberResult {
    require_arity(values, 7, 8)?;

    let bond = LastPeriodBond {
        settlement: date_arg(values, 0)?,
        maturity: date_arg(values, 1)?,
        last_interest: date_arg(values, 2)?,
        frequency: frequency_arg(values, 6)?,
        basis: basis_arg(values, 7)?,
    };
    let rate = number_arg(values, 3, None)?;
    let quote = number_arg(values, 4, None)?;
    let redemption = number_arg(values, 5, None)?;

    ensure(bond.maturity > bond.settlement && bond.settlement > bond.last_interest)?;
    ensure(rate >= 0.0 && if is_yield { quote > 0.0 } else { quote >= 0.0 })?;

    let shares = bond.shares();
    let coupon = FACE_VALUE * rate / bond.frequency;
    let at_maturity = shares.period * coupon + redemption;
    let accrued = shares.accrued * coupon;

    if is_yield {
        let cost = accrued + quote;

        return Ok((at_maturity - cost) / cost * bond.frequency / shares.remaining);
    }

    Ok(at_maturity / (shares.remaining * quote / bond.frequency + 1.0) - accrued)
}

impl LastPeriodBond {
    fn days(&self, start: Date, end: Date) -> f64 {
        self.basis.days(start, end).max(0.0)
    }

    /// Period lengths in US 30/360 change both dates.
    fn period_days(&self, start: Date, end: Date) -> f64 {
        if self.basis == Basis::UsThirty {
            days_360_us(start, end, true).max(0.0)
        } else {
            self.days(start, end)
        }
    }

    fn shares(&self) -> LastPeriodShares {
        let quasi_periods =
            Coupons::find(self.last_interest, self.maturity, self.frequency).remaining as u64;
        let months = period_months(self.frequency);
        let mut earlier = self.last_interest;
        let mut shares = LastPeriodShares {
            period: 0.0,
            accrued: 0.0,
            remaining: 0.0,
        };

        for index in 1..=quasi_periods {
            let later = earlier.add_months(months, false);
            let length = self.period_days(earlier, later);
            let counted = if index < quasi_periods {
                length
            } else {
                self.period_days(earlier, self.maturity)
            };
            let accrued = if later < self.settlement {
                counted
            } else if earlier < self.settlement {
                self.days(earlier, self.settlement)
            } else {
                0.0
            };
            let remaining = self.days(self.settlement.max(earlier), self.maturity.min(later));

            shares.period += counted / length;
            shares.accrued += accrued / length;
            shares.remaining += remaining / length;
            earlier = later;
        }

        shares
    }
}
