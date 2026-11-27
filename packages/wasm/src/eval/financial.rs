//! Financial function family dispatch.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

use super::functions::{number_arg, require_arity, FuncAccumulator, FuncValue};
use super::value::aggregate_number;

const ROOT_BRACKET_STEPS: usize = 14;
const ROOT_SOLVE_STEPS: usize = 100;
const ROOT_VALUE_REL_TOLERANCE: f64 = 1e-12;
const ROOT_X_ABS_TOLERANCE: f64 = 1e-12;
const ROOT_X_REL_TOLERANCE: f64 = 1e-12;
const ROOT_X_MIN: f64 = -36.0;
const ROOT_X_MAX: f64 = 700.0;

#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "functions outside this family are left to the caller; listing the 200 other Func variants adds nothing"
)]
pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    let result = match func {
        Func::Pv => pv(values),
        Func::Fv => fv(values),
        Func::Pmt => pmt(values),
        Func::Npv => npv(values),
        Func::Irr => irr(values),
        Func::Rate => rate(values),
        Func::Ipmt => ipmt(values),
        Func::Ppmt => ppmt(values),
        _ => return None,
    };
    Some(result.map_or_else(Value::Error, Value::number))
}

fn pv(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 5)?;
    let rate = number_arg(values, 0, None)?;
    let periods = number_arg(values, 1, None)?;
    let payment = number_arg(values, 2, None)?;
    let future_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    pv_value(rate, periods, payment, future_value, timing)
}

fn fv(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 5)?;
    let rate = number_arg(values, 0, None)?;
    let periods = number_arg(values, 1, None)?;
    let payment = number_arg(values, 2, None)?;
    let present_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    fv_value(rate, periods, payment, present_value, timing)
}

fn pmt(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 5)?;
    let rate = number_arg(values, 0, None)?;
    let periods = number_arg(values, 1, None)?;
    let present_value = number_arg(values, 2, None)?;
    let future_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    pmt_value(rate, periods, present_value, future_value, timing)
}

fn npv(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 254)?;
    let rate = number_arg(values, 0, None)?;
    let base = 1.0 + rate;
    let mut discount = base;
    let mut sum = 0.0;
    let mut compensation = 0.0;

    for entry in values.entries_from_arg(1) {
        let Some(cashflow) = cashflow_number(entry)? else {
            continue;
        };
        if discount == 0.0 {
            return Err(FormulaError::DivZero);
        }
        let contribution = cashflow / discount;
        if !contribution.is_finite() {
            return Err(FormulaError::Num);
        }
        let adjusted = contribution - compensation;
        let next = sum + adjusted;
        if !next.is_finite() {
            return Err(FormulaError::Num);
        }
        compensation = (next - sum) - adjusted;
        sum = next;
        discount *= base;
        if discount.is_nan() {
            return Err(FormulaError::Num);
        }
    }
    Ok(sum)
}

fn irr(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 1, 2)?;
    let entries = values.arg(0).ok_or(FormulaError::Value)?;
    // The solver samples the cashflows dozens of times (40 for six yearly
    // cashflows from a 0.1 guess), so each entry is read as a number once
    // and every sample is only multiply-adds.
    let mut cashflows = Vec::with_capacity(entries.len());
    let mut has_positive = false;
    let mut has_negative = false;
    for entry in entries {
        if let Some(cashflow) = cashflow_number(entry)? {
            has_positive |= cashflow > 0.0;
            has_negative |= cashflow < 0.0;
            cashflows.push(cashflow);
        }
    }
    if !has_positive || !has_negative {
        return Err(FormulaError::Num);
    }

    let guess = number_arg(values, 1, Some(0.1))?;
    solve_root(guess, |x| irr_sample(&cashflows, x))
}

fn rate(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 3, 6)?;
    let periods = number_arg(values, 0, None)?;
    let payment = number_arg(values, 1, None)?;
    let present_value = number_arg(values, 2, None)?;
    let future_value = number_arg(values, 3, Some(0.0))?;
    let timing = payment_timing(values, 4)?;
    let guess = number_arg(values, 5, Some(0.1))?;
    if periods <= 0.0 || (payment == 0.0 && present_value == 0.0 && future_value == 0.0) {
        return Err(FormulaError::Num);
    }
    solve_root(guess, |x| {
        rate_sample(periods, payment, present_value, future_value, timing, x)
    })
}

fn ipmt(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 4, 6)?;
    let rate = number_arg(values, 0, None)?;
    let period = number_arg(values, 1, None)?;
    let periods = number_arg(values, 2, None)?;
    let present_value = number_arg(values, 3, None)?;
    let future_value = number_arg(values, 4, Some(0.0))?;
    let timing = payment_timing(values, 5)?;
    ipmt_value(rate, period, periods, present_value, future_value, timing)
}

fn ppmt(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 4, 6)?;
    let rate = number_arg(values, 0, None)?;
    let period = number_arg(values, 1, None)?;
    let periods = number_arg(values, 2, None)?;
    let present_value = number_arg(values, 3, None)?;
    let future_value = number_arg(values, 4, Some(0.0))?;
    let timing = payment_timing(values, 5)?;
    let interest = ipmt_value(rate, period, periods, present_value, future_value, timing)?;
    let payment = pmt_value(rate, periods, present_value, future_value, timing)?;
    finite(payment - interest)
}

fn payment_timing(values: &FuncAccumulator, index: usize) -> Result<bool, FormulaError> {
    Ok(number_arg(values, index, Some(0.0))? != 0.0)
}

fn periodic_terms(rate: f64, periods: f64) -> Result<(f64, f64), FormulaError> {
    if rate == 0.0 {
        return Ok((1.0, periods));
    }

    let base = 1.0 + rate;
    let (growth, annuity) = if base > 0.0 {
        let exponent = periods * rate.ln_1p();
        let growth_minus_one = exponent.exp_m1();
        (exponent.exp(), growth_minus_one / rate)
    } else if base == 0.0 {
        let growth = if periods > 0.0 {
            0.0
        } else if periods == 0.0 {
            1.0
        } else {
            return Err(FormulaError::Num);
        };
        (growth, (growth - 1.0) / rate)
    } else {
        if periods.fract() != 0.0 || periods < i64::MIN as f64 || periods > i64::MAX as f64 {
            return Err(FormulaError::Num);
        }
        let magnitude = base.abs().powf(periods);
        let integer_periods = periods as i64;
        let growth = if integer_periods & 1 == 0 {
            magnitude
        } else {
            -magnitude
        };
        (growth, (growth - 1.0) / rate)
    };
    if growth.is_finite() && annuity.is_finite() {
        Ok((growth, annuity))
    } else {
        Err(FormulaError::Num)
    }
}

fn pv_value(
    rate: f64,
    periods: f64,
    payment: f64,
    future_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    let (growth, annuity) = periodic_terms(rate, periods)?;
    if growth == 0.0 {
        return Err(FormulaError::DivZero);
    }
    let timing_factor = if timing { 1.0 + rate } else { 1.0 };
    finite(-(future_value + payment * timing_factor * annuity) / growth)
}

fn fv_value(
    rate: f64,
    periods: f64,
    payment: f64,
    present_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    let (growth, annuity) = periodic_terms(rate, periods)?;
    let timing_factor = if timing { 1.0 + rate } else { 1.0 };
    finite(-(present_value * growth + payment * timing_factor * annuity))
}

fn pmt_value(
    rate: f64,
    periods: f64,
    present_value: f64,
    future_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    let (growth, annuity) = periodic_terms(rate, periods)?;
    let timing_factor = if timing { 1.0 + rate } else { 1.0 };
    let denominator = timing_factor * annuity;
    if denominator == 0.0 {
        return Err(FormulaError::DivZero);
    }
    finite(-(future_value + present_value * growth) / denominator)
}

fn ipmt_value(
    rate: f64,
    period: f64,
    periods: f64,
    present_value: f64,
    future_value: f64,
    timing: bool,
) -> Result<f64, FormulaError> {
    if period < 1.0 || period > periods || periods < 1.0 {
        return Err(FormulaError::Num);
    }
    let payment = pmt_value(rate, periods, present_value, future_value, timing)?;
    if timing && period == 1.0 {
        return Ok(0.0);
    }
    let balance = fv_value(rate, period - 1.0, payment, present_value, timing)?;
    let mut interest = balance * rate;
    if timing {
        let base = 1.0 + rate;
        if base == 0.0 {
            return Err(FormulaError::DivZero);
        }
        interest /= base;
    }
    finite(interest)
}

fn cashflow_number(entry: &FuncValue) -> Result<Option<f64>, FormulaError> {
    if !entry.from_range && matches!(entry.value, Value::Blank) {
        Ok(Some(0.0))
    } else {
        aggregate_number(&entry.value, entry.from_range)
    }
}

const fn finite(value: f64) -> Result<f64, FormulaError> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(FormulaError::Num)
    }
}

#[derive(Clone, Copy)]
struct RootSample {
    value: f64,
    scale: f64,
}

impl RootSample {
    const fn new(value: f64, scale: f64) -> Result<Self, FormulaError> {
        if value.is_nan() || scale.is_nan() {
            Err(FormulaError::Num)
        } else {
            Ok(Self { value, scale })
        }
    }

    fn converged(self) -> bool {
        self.value.is_finite()
            && self.scale.is_finite()
            && self.scale > 0.0
            && (self.value == 0.0 || self.value.abs() <= ROOT_VALUE_REL_TOLERANCE * self.scale)
    }
}

fn irr_sample(cashflows: &[f64], x: f64) -> Result<RootSample, FormulaError> {
    let inverse_growth = (-x).exp();
    let mut value = 0.0;
    let mut scale = 0.0;
    for &cashflow in cashflows.iter().rev() {
        value = value * inverse_growth + cashflow;
        scale = scale * inverse_growth + cashflow.abs();
    }
    RootSample::new(value, scale)
}

fn rate_sample(
    periods: f64,
    payment: f64,
    present_value: f64,
    future_value: f64,
    timing: bool,
    x: f64,
) -> Result<RootSample, FormulaError> {
    if x == 0.0 {
        let payment_term = payment * periods;
        let value = present_value + future_value + payment_term;
        let scale = present_value.abs() + future_value.abs() + payment_term.abs();
        return RootSample::new(value, scale);
    }

    let rate = x.exp_m1();
    let exponent = periods * x;
    let (present_term, future_term, annuity) = if exponent > 0.0 {
        let numerator = -(-exponent).exp_m1();
        let annuity = if timing {
            numerator / -(-x).exp_m1()
        } else {
            numerator / rate
        };
        (present_value, future_value * (-exponent).exp(), annuity)
    } else {
        let annuity = if timing {
            exponent.exp_m1() / -(-x).exp_m1()
        } else {
            exponent.exp_m1() / rate
        };
        (present_value * exponent.exp(), future_value, annuity)
    };
    let payment_term = if payment == 0.0 {
        0.0
    } else {
        payment * annuity
    };
    RootSample::new(
        present_term + future_term + payment_term,
        present_term.abs() + future_term.abs() + payment_term.abs(),
    )
}

#[derive(Clone, Copy)]
struct RootBracket {
    low_x: f64,
    low: RootSample,
    high_x: f64,
    high: RootSample,
}

fn solve_root(
    guess: f64,
    mut sample: impl FnMut(f64) -> Result<RootSample, FormulaError>,
) -> Result<f64, FormulaError> {
    if guess <= -1.0 {
        return Err(FormulaError::Num);
    }
    let initial_x = guess.ln_1p();
    if !initial_x.is_finite() || !(ROOT_X_MIN..=ROOT_X_MAX).contains(&initial_x) {
        return Err(FormulaError::Num);
    }

    let initial = sample(initial_x)?;
    if initial.converged() {
        return rate_from_x(initial_x);
    }

    let mut left_x = initial_x;
    let mut left = initial;
    let mut right_x = initial_x;
    let mut right = initial;
    let mut step = 0.125;
    for _ in 0..ROOT_BRACKET_STEPS {
        let mut left_bracket = None;
        let next_left_x = (left_x - step).max(ROOT_X_MIN);
        if next_left_x < left_x {
            let next_left = sample(next_left_x)?;
            if next_left.converged() {
                return rate_from_x(next_left_x);
            }
            if opposite_signs(next_left, left) {
                left_bracket = Some(RootBracket {
                    low_x: next_left_x,
                    low: next_left,
                    high_x: left_x,
                    high: left,
                });
            }
            left_x = next_left_x;
            left = next_left;
        }

        let mut right_bracket = None;
        let next_right_x = (right_x + step).min(ROOT_X_MAX);
        if next_right_x > right_x {
            let next_right = sample(next_right_x)?;
            if next_right.converged() {
                return rate_from_x(next_right_x);
            }
            if opposite_signs(right, next_right) {
                right_bracket = Some(RootBracket {
                    low_x: right_x,
                    low: right,
                    high_x: next_right_x,
                    high: next_right,
                });
            }
            right_x = next_right_x;
            right = next_right;
        }

        if let Some(bracket) = choose_bracket(left_bracket, right_bracket, initial_x) {
            return solve_bracket(bracket, &mut sample);
        }
        if left_x == ROOT_X_MIN && right_x == ROOT_X_MAX {
            break;
        }
        step *= 2.0;
    }
    Err(FormulaError::Num)
}

fn choose_bracket(
    left_bracket: Option<RootBracket>,
    right_bracket: Option<RootBracket>,
    initial_x: f64,
) -> Option<RootBracket> {
    match (left_bracket, right_bracket) {
        (Some(left), Some(right)) => {
            if bracket_distance(left, initial_x) <= bracket_distance(right, initial_x) {
                Some(left)
            } else {
                Some(right)
            }
        }
        (Some(bracket), None) | (None, Some(bracket)) => Some(bracket),
        (None, None) => None,
    }
}

fn bracket_distance(bracket: RootBracket, initial_x: f64) -> f64 {
    let estimate = secant_candidate(bracket).unwrap_or((bracket.low_x + bracket.high_x) * 0.5);
    (estimate - initial_x).abs()
}

fn solve_bracket(
    mut bracket: RootBracket,
    sample: &mut impl FnMut(f64) -> Result<RootSample, FormulaError>,
) -> Result<f64, FormulaError> {
    for _ in 0..ROOT_SOLVE_STEPS {
        let width = bracket.high_x - bracket.low_x;
        let tolerance = ROOT_X_ABS_TOLERANCE
            + ROOT_X_REL_TOLERANCE * bracket.low_x.abs().max(bracket.high_x.abs());
        if width <= tolerance {
            let midpoint = (bracket.low_x + bracket.high_x) * 0.5;
            if sample(midpoint)?.converged() {
                return rate_from_x(midpoint);
            }
            return Err(FormulaError::Num);
        }

        let lower_third = bracket.low_x + width / 3.0;
        let upper_third = bracket.high_x - width / 3.0;
        let candidate = secant_candidate(bracket)
            .filter(|candidate| *candidate >= lower_third && *candidate <= upper_third)
            .unwrap_or((bracket.low_x + bracket.high_x) * 0.5);
        let candidate_sample = sample(candidate)?;
        if candidate_sample.converged() {
            return rate_from_x(candidate);
        }
        if opposite_signs(bracket.low, candidate_sample) {
            bracket.high_x = candidate;
            bracket.high = candidate_sample;
        } else {
            bracket.low_x = candidate;
            bracket.low = candidate_sample;
        }
    }
    Err(FormulaError::Num)
}

fn secant_candidate(bracket: RootBracket) -> Option<f64> {
    if !bracket.low.value.is_finite() || !bracket.high.value.is_finite() {
        return None;
    }
    let scale = bracket.low.value.abs().max(bracket.high.value.abs());
    if scale == 0.0 {
        return None;
    }
    let low = bracket.low.value / scale;
    let high = bracket.high.value / scale;
    let denominator = high - low;
    if denominator == 0.0 {
        return None;
    }
    let candidate = bracket.low_x - low * (bracket.high_x - bracket.low_x) / denominator;
    candidate.is_finite().then_some(candidate)
}

const fn opposite_signs(left: RootSample, right: RootSample) -> bool {
    left.value.is_sign_positive() != right.value.is_sign_positive()
}

fn rate_from_x(x: f64) -> Result<f64, FormulaError> {
    let rate = x.exp_m1();
    if rate.is_finite() && rate > -1.0 {
        Ok(rate)
    } else {
        Err(FormulaError::Num)
    }
}
