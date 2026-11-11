//! Bessel functions of integer order: `BESSELJ`, `BESSELY`, `BESSELI` and
//! `BESSELK`.
//!
//! Excel's published results differ from the exact values in the ninth
//! significant digit: `BESSELJ(1.9,2)` is 0.329925829 in Excel, while the
//! exact value is 0.3299257277. They match these approximations:
//!
//! - J and Y of order 0 and 1: the rational functions for x < 8, and the
//!   asymptotic form with polynomials in (8/x)^2 for x >= 8, from J. F. Hart
//!   et al., "Computer Approximations" (Wiley, 1968).
//! - I and K of order 0 and 1: the polynomials of M. Abramowitz and
//!   I. A. Stegun, "Handbook of Mathematical Functions" (NBS, 1964),
//!   formulas 9.8.1 to 9.8.8.
//! - Higher orders: the recurrence f(n+1) = 2n/x f(n) -/+ f(n-1). It runs
//!   upward where that is stable, and downward from a high start order,
//!   normalized by a known sum, where it is not.
//!
//! The results are accurate to about 1E-8.

use super::super::functions::{number_arg, require_arity, FuncAccumulator};
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &["BESSELI", "BESSELJ", "BESSELK", "BESSELY"];

/// J and Y switch from the rational functions to the asymptotic form here.
const ASYMPTOTIC_START: f64 = 8.0;
/// I switches from the series in (x/3.75)^2 to the series in 3.75/x here.
const I_SCALE: f64 = 3.75;
/// K uses the series in (x/2)^2 up to here, and the series in 2/x above.
const K_SCALE: f64 = 2.0;

/// The following parameters are chosen to match Excel's published results
/// to 1E-9: the start of each downward recurrence, n + sqrt(m n) with m 40
/// for J and 200 for I, and the constants 2/pi, pi/4, 3pi/4 and Euler's
/// constant rounded to the digits below. The exact constants change the
/// ninth digit.
const J_START_FACTOR: f64 = 40.0;
const I_START_FACTOR: f64 = 200.0;
#[allow(clippy::approx_constant, reason = "chosen to match Excel's results")]
const TWO_OVER_PI: f64 = 0.636_619_772;
const PI_OVER_FOUR: f64 = 0.785_398_164;
const THREE_PI_OVER_FOUR: f64 = 2.356_194_491;
#[allow(clippy::approx_constant, reason = "chosen to match Excel's results")]
const EULER_GAMMA: f64 = 0.577_215_66;

/// A downward recurrence scales its values down by this factor when they
/// pass the bound, to stay in range.
const OVERFLOW_BOUND: f64 = 1e10;
const OVERFLOW_SCALE: f64 = 1e-10;

/// Coefficient tables, lowest power first. Each `*_NUMERATOR` and
/// `*_DENOMINATOR` pair is a rational function of x^2 for x < 8.
const J0_NUMERATOR: [f64; 6] = [
    57_568_490_574.0,
    -13_362_590_354.0,
    651_619_640.7,
    -11_214_424.18,
    77_392.330_17,
    -184.905_245_6,
];
const J0_DENOMINATOR: [f64; 6] = [
    57_568_490_411.0,
    1_029_532_985.0,
    9_494_680.718,
    59_272.648_53,
    267.853_271_2,
    1.0,
];
const J1_NUMERATOR: [f64; 6] = [
    72_362_614_232.0,
    -7_895_059_235.0,
    242_396_853.1,
    -2_972_611.439,
    15_704.482_60,
    -30.160_366_06,
];
const J1_DENOMINATOR: [f64; 6] = [
    144_725_228_442.0,
    2_300_535_178.0,
    18_583_304.74,
    99_447.433_94,
    376.999_139_7,
    1.0,
];
const Y0_NUMERATOR: [f64; 6] = [
    -2_957_821_389.0,
    7_062_834_065.0,
    -512_359_803.6,
    10_879_881.29,
    -86_327.927_57,
    228.462_273_3,
];
const Y0_DENOMINATOR: [f64; 6] = [
    40_076_544_269.0,
    745_249_964.8,
    7_189_466.438,
    47_447.264_70,
    226.103_024_4,
    1.0,
];
const Y1_NUMERATOR: [f64; 6] = [
    -0.490_060_494_3e13,
    0.127_527_439_0e13,
    -0.515_343_813_9e11,
    0.734_926_455_1e9,
    -0.423_792_272_6e7,
    0.851_193_793_5e4,
];
const Y1_DENOMINATOR: [f64; 7] = [
    0.249_958_057_0e14,
    0.424_441_966_4e12,
    0.373_365_036_7e10,
    0.224_590_400_2e8,
    0.102_042_605_0e6,
    0.354_963_288_5e3,
    1.0,
];

/// The amplitude polynomials P and Q of the asymptotic form, in (8/x)^2.
/// J and Y of the same order share them.
const P0: [f64; 5] = [
    1.0,
    -0.109_862_862_7e-2,
    0.273_451_040_7e-4,
    -0.207_337_063_9e-5,
    0.209_388_721_1e-6,
];
const Q0: [f64; 5] = [
    -0.156_249_999_5e-1,
    0.143_048_876_5e-3,
    -0.691_114_765_1e-5,
    0.762_109_516_1e-6,
    -0.934_935_152e-7,
];
const P1: [f64; 5] = [
    1.0,
    0.183_105e-2,
    -0.351_639_649_6e-4,
    0.245_752_017_4e-5,
    -0.240_337_019e-6,
];
const Q1: [f64; 5] = [
    0.046_874_999_95,
    -0.200_269_087_3e-3,
    0.844_919_909_6e-5,
    -0.882_289_87e-6,
    0.105_787_412e-6,
];

/// I0 and I1: series in (x/3.75)^2 below 3.75, and series in 3.75/x
/// times e^x / sqrt(x) above (formulas 9.8.1 to 9.8.4).
const I0_SMALL: [f64; 7] = [
    1.0,
    3.515_622_9,
    3.089_942_4,
    1.206_749_2,
    0.265_973_2,
    0.360_768e-1,
    0.458_13e-2,
];
const I0_LARGE: [f64; 9] = [
    0.398_942_28,
    0.132_859_2e-1,
    0.225_319e-2,
    -0.157_565e-2,
    0.916_281e-2,
    -0.205_770_6e-1,
    0.263_553_7e-1,
    -0.164_763_3e-1,
    0.392_377e-2,
];
const I1_SMALL: [f64; 7] = [
    0.5,
    0.878_905_94,
    0.514_988_69,
    0.150_849_34,
    0.265_873_3e-1,
    0.301_532e-2,
    0.324_11e-3,
];
const I1_LARGE: [f64; 9] = [
    0.398_942_28,
    -0.398_802_4e-1,
    -0.362_018e-2,
    0.163_801e-2,
    -0.103_155_5e-1,
    0.228_296_7e-1,
    -0.289_531_2e-1,
    0.178_765_4e-1,
    -0.420_059e-2,
];

/// K0 and K1: series in (x/2)^2 up to 2, and series in 2/x times
/// e^-x / sqrt(x) above (formulas 9.8.5 to 9.8.8). The constant term of
/// `K0_SMALL` is -gamma.
const K0_SMALL: [f64; 7] = [
    -EULER_GAMMA,
    0.422_784_20,
    0.230_697_56,
    0.348_859_0e-1,
    0.262_698e-2,
    0.107_50e-3,
    0.74e-5,
];
const K0_LARGE: [f64; 7] = [
    1.253_314_14,
    -0.783_235_8e-1,
    0.218_956_8e-1,
    -0.106_244_6e-1,
    0.587_872e-2,
    -0.251_540e-2,
    0.532_08e-3,
];
const K1_SMALL: [f64; 7] = [
    1.0,
    0.154_431_44,
    -0.672_785_79,
    -0.181_568_97,
    -0.191_940_2e-1,
    -0.110_404e-2,
    -0.468_6e-4,
];
const K1_LARGE: [f64; 7] = [
    1.253_314_14,
    0.234_986_19,
    -0.365_562_0e-1,
    0.150_426_8e-1,
    -0.780_353e-2,
    0.325_614e-2,
    -0.682_45e-3,
];

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    calculate(name, values).map_or_else(Value::Error, Value::number)
}

fn calculate(name: &str, values: &FuncAccumulator) -> Result<f64, FormulaError> {
    require_arity(values, 2, 2)?;

    let x = number_arg(values, 0, None)?;
    let order = number_arg(values, 1, None)?.trunc();

    if order < 0.0 || order > f64::from(u16::MAX) {
        return Err(FormulaError::Num);
    }

    let order = order as u32;

    match name {
        "BESSELJ" => Ok(odd_order_sign(order, x) * first_kind(order, x.abs())),
        "BESSELI" => Ok(odd_order_sign(order, x) * modified_first_kind(order, x.abs())),
        "BESSELY" if x > 0.0 => Ok(second_kind(order, x)),
        "BESSELK" if x > 0.0 => Ok(modified_second_kind(order, x)),
        "BESSELY" | "BESSELK" => Err(FormulaError::Num),
        _ => Err(FormulaError::Name),
    }
}

/// J and I of odd order are odd functions of x; of even order, even.
fn odd_order_sign(order: u32, x: f64) -> f64 {
    if x < 0.0 && order % 2 == 1 {
        -1.0
    } else {
        1.0
    }
}

/// Evaluates a polynomial with coefficients from the lowest power.
fn polynomial(coefficients: &[f64], y: f64) -> f64 {
    coefficients
        .iter()
        .rev()
        .fold(0.0, |total, coefficient| total * y + coefficient)
}

fn rational(numerator: &[f64], denominator: &[f64], y: f64) -> f64 {
    polynomial(numerator, y) / polynomial(denominator, y)
}

/// The asymptotic form of J or Y of order 0 or 1 for x >= 8:
/// sqrt(2/(pi x)) (P cos(phase) - (8/x) Q sin(phase)) for J, and
/// sqrt(2/(pi x)) (P sin(phase) + (8/x) Q cos(phase)) for Y.
fn asymptotic(order: u32, x: f64, is_y: bool) -> f64 {
    let (p, q, offset) = if order == 0 {
        (&P0, &Q0, PI_OVER_FOUR)
    } else {
        (&P1, &Q1, THREE_PI_OVER_FOUR)
    };
    let ratio = ASYMPTOTIC_START / x;
    let square = ratio * ratio;
    let amplitude = polynomial(p, square);
    let correction = ratio * polynomial(q, square);
    let (sine, cosine) = (x - offset).sin_cos();
    let wave = if is_y {
        amplitude * sine + correction * cosine
    } else {
        amplitude * cosine - correction * sine
    };

    (TWO_OVER_PI / x).sqrt() * wave
}

/// J0 or J1 for x >= 0.
fn first_kind_base(order: u32, x: f64) -> f64 {
    if x >= ASYMPTOTIC_START {
        return asymptotic(order, x, false);
    }

    let square = x * x;

    if order == 0 {
        rational(&J0_NUMERATOR, &J0_DENOMINATOR, square)
    } else {
        x * rational(&J1_NUMERATOR, &J1_DENOMINATOR, square)
    }
}

/// `J_n(x)` for x >= 0. The upward recurrence is stable while x is above the
/// order; below it, the downward recurrence runs from a high order and is
/// normalized by J0 + 2 (J2 + J4 + ...) = 1.
fn first_kind(order: u32, x: f64) -> f64 {
    if order <= 1 {
        return first_kind_base(order, x);
    }

    if x == 0.0 {
        return 0.0;
    }

    if x > f64::from(order) {
        return upward(order, x, first_kind_base(0, x), first_kind_base(1, x), -1.0);
    }

    let start = 2 * ((order + (J_START_FACTOR * f64::from(order)).sqrt() as u32) / 2);
    let (value, at_zero, even_sum) = downward(order, x, start, -1.0);

    value / (at_zero + 2.0 * even_sum)
}

/// Y0 or Y1 for x > 0: a rational function plus the logarithmic term of
/// J, or the asymptotic form.
fn second_kind_base(order: u32, x: f64) -> f64 {
    if x >= ASYMPTOTIC_START {
        return asymptotic(order, x, true);
    }

    let square = x * x;

    if order == 0 {
        rational(&Y0_NUMERATOR, &Y0_DENOMINATOR, square)
            + TWO_OVER_PI * first_kind_base(0, x) * x.ln()
    } else {
        x * rational(&Y1_NUMERATOR, &Y1_DENOMINATOR, square)
            + TWO_OVER_PI * (first_kind_base(1, x) * x.ln() - 1.0 / x)
    }
}

fn second_kind(order: u32, x: f64) -> f64 {
    upward(
        order,
        x,
        second_kind_base(0, x),
        second_kind_base(1, x),
        -1.0,
    )
}

/// I0 or I1 for x >= 0.
fn modified_first_kind_base(order: u32, x: f64) -> f64 {
    if x < I_SCALE {
        let square = (x / I_SCALE).powi(2);

        return if order == 0 {
            polynomial(&I0_SMALL, square)
        } else {
            x * polynomial(&I1_SMALL, square)
        };
    }

    let coefficients = if order == 0 { &I0_LARGE } else { &I1_LARGE };

    polynomial(coefficients, I_SCALE / x) * x.exp() / x.sqrt()
}

/// `I_n(x)` for x >= 0: the downward recurrence, scaled so that its order 0
/// value is I0.
fn modified_first_kind(order: u32, x: f64) -> f64 {
    if order <= 1 {
        return modified_first_kind_base(order, x);
    }

    if x == 0.0 {
        return 0.0;
    }

    let start = 2 * (order + (I_START_FACTOR * f64::from(order)).sqrt() as u32);
    let (value, at_zero, _) = downward(order, x, start, 1.0);

    value * modified_first_kind_base(0, x) / at_zero
}

/// K0 or K1 for x > 0.
fn modified_second_kind_base(order: u32, x: f64) -> f64 {
    if x <= K_SCALE {
        let square = x * x / 4.0;
        let log_half = (x / 2.0).ln();

        return if order == 0 {
            polynomial(&K0_SMALL, square) - log_half * modified_first_kind_base(0, x)
        } else {
            polynomial(&K1_SMALL, square) / x + log_half * modified_first_kind_base(1, x)
        };
    }

    let coefficients = if order == 0 { &K0_LARGE } else { &K1_LARGE };

    polynomial(coefficients, K_SCALE / x) * (-x).exp() / x.sqrt()
}

fn modified_second_kind(order: u32, x: f64) -> f64 {
    upward(
        order,
        x,
        modified_second_kind_base(0, x),
        modified_second_kind_base(1, x),
        1.0,
    )
}

/// f(n+1) = 2n/x f(n) + sign f(n-1) from f(0) and f(1): Y with `sign` -1,
/// K with 1, and J above its order with -1.
fn upward(order: u32, x: f64, zero: f64, one: f64, sign: f64) -> f64 {
    if order == 0 {
        return zero;
    }

    let mut lower = zero;
    let mut value = one;

    for index in 1..order {
        let higher = 2.0 * f64::from(index) / x * value + sign * lower;

        lower = value;
        value = higher;
    }

    value
}

/// f(n-1) = 2n/x f(n) + sign f(n+1), from f(start + 1) = 0 and
/// f(start) = 1 down to order 0. Returns the unnormalized values at
/// `order` and at 0, and the sum of the values at even orders from 2 up.
/// Values that pass the bound are scaled down together.
fn downward(order: u32, x: f64, start: u32, sign: f64) -> (f64, f64, f64) {
    let mut higher = 0.0;
    let mut value = 1.0;
    let mut at_order = 0.0;
    let mut even_sum = 0.0;

    for index in (1..=start).rev() {
        let lower = 2.0 * f64::from(index) / x * value + sign * higher;

        higher = value;
        value = lower;

        if value.abs() > OVERFLOW_BOUND {
            value *= OVERFLOW_SCALE;
            higher *= OVERFLOW_SCALE;
            at_order *= OVERFLOW_SCALE;
            even_sum *= OVERFLOW_SCALE;
        }

        // `higher` now holds f(index) and `value` f(index - 1).
        if index == order {
            at_order = higher;
        }

        if (index - 1) % 2 == 0 && index > 1 {
            even_sum += value;
        }
    }

    (at_order, value, even_sum)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(name: &str, x: f64, order: f64) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in [x, order] {
            values.push_scalar(Value::number(argument)).unwrap();
            values.finish_arg(1, 1).unwrap();
        }

        evaluate(name, &values)
    }

    fn number(name: &str, x: f64, order: f64) -> f64 {
        let Value::Number(actual) = call(name, x, order) else {
            panic!("{name}({x},{order}) returned an error");
        };

        actual
    }

    /// Results from the "Example" table of each Microsoft Support page,
    /// published to nine decimal places.
    #[test]
    fn microsoft_published_examples() {
        for (name, x, order, published) in [
            ("BESSELI", 1.5, 1.0, 0.981_666_428),
            ("BESSELJ", 1.9, 2.0, 0.329_925_829),
            ("BESSELK", 1.5, 1.0, 0.277_387_804),
            ("BESSELY", 2.5, 1.0, 0.145_918_138),
        ] {
            let actual = number(name, x, order);

            assert!(
                (actual - published).abs() <= 5e-10,
                "{name}({x},{order}): {actual}"
            );
        }
    }

    /// The approximations stay within 1E-7 of 15-digit values from
    /// Abramowitz and Stegun, Tables 9.1 and 9.8, on both sides of each
    /// branch limit.
    #[test]
    fn approximations_stay_close_to_reference_tables() {
        for (name, x, order, expected) in [
            ("BESSELJ", 1.0, 0.0, 0.765_197_686_557_966_6),
            ("BESSELJ", 10.0, 0.0, -0.245_935_764_451_348_3),
            ("BESSELJ", 10.0, 3.0, 0.058_379_379_305_186_81),
            ("BESSELJ", 1.0, 10.0, 2.630_615_123_687_453e-10),
            ("BESSELY", 1.0, 0.0, 0.088_256_964_215_676_96),
            ("BESSELY", 1.0, 1.0, -0.781_212_821_300_288_7),
            ("BESSELY", 10.0, 1.0, 0.249_015_424_206_953_9),
            ("BESSELI", 1.0, 0.0, 1.266_065_877_752_008_4),
            ("BESSELI", 10.0, 1.0, 2_670.988_303_701_254_7),
            ("BESSELI", 1.0, 3.0, 0.022_168_424_924_331_9),
            ("BESSELK", 1.0, 0.0, 0.421_024_438_240_708_3),
            ("BESSELK", 10.0, 0.0, 1.778_006_231_616_917e-5),
            ("BESSELK", 0.5, 2.0, 7.550_183_551_240_869),
        ] {
            let actual = number(name, x, order);

            assert!(
                (actual - expected).abs() <= 1e-7 * expected.abs().max(1.0),
                "{name}({x},{order}): {actual} != {expected}"
            );
        }
    }

    #[test]
    fn arguments_follow_the_microsoft_remarks() {
        assert_eq!(call("BESSELJ", 1.9, 2.9), call("BESSELJ", 1.9, 2.0));
        assert_eq!(call("BESSELJ", 1.0, -1.0), Value::Error(FormulaError::Num));
        assert_eq!(call("BESSELY", 0.0, 1.0), Value::Error(FormulaError::Num));
        assert_eq!(call("BESSELK", -1.0, 1.0), Value::Error(FormulaError::Num));
        assert_eq!(call("BESSELJ", 0.0, 2.0), Value::Number(0.0));
        assert_eq!(call("BESSELI", 0.0, 2.0), Value::Number(0.0));
        assert_eq!(number("BESSELJ", -2.0, 1.0), -number("BESSELJ", 2.0, 1.0));
        assert_eq!(number("BESSELI", -2.0, 3.0), -number("BESSELI", 2.0, 3.0));
        assert_eq!(number("BESSELI", -2.0, 2.0), number("BESSELI", 2.0, 2.0));
    }
}
