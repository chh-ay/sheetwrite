//! Bessel functions of integer order: `BESSELJ`, `BESSELY`, `BESSELI` and
//! `BESSELK`.
//!
//! Excel's published results match the rational and polynomial
//! approximations of Press et al., Numerical Recipes in C, 2nd edition,
//! section 6.5, evaluated in double precision: `BESSELJ(1.9,2)` is
//! 0.329925829 there and in Excel, while the exact value is 0.3299257277.
//! These functions use the same approximations, so they give Excel's
//! results; they are accurate to about 1E-8.

use super::super::functions::{number_arg, require_arity, FuncAccumulator};
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &["BESSELI", "BESSELJ", "BESSELK", "BESSELY"];

/// Below this argument J and Y use rational functions; above it, the
/// asymptotic form.
const RATIONAL_LIMIT: f64 = 8.0;
/// Below this argument I uses a polynomial in (x/3.75)^2.
const MODIFIED_POLYNOMIAL_LIMIT: f64 = 3.75;
/// At or below this argument K uses its series form.
const MODIFIED_SERIES_LIMIT: f64 = 2.0;
/// The start order of the downward recurrence is n + sqrt(accuracy * n).
const J_ACCURACY: f64 = 40.0;
const I_ACCURACY: f64 = 200.0;
/// The downward recurrence rescales its values above this size.
const RESCALE_LIMIT: f64 = 1e10;
const RESCALE: f64 = 1e-10;
/// 2 / pi and the phase offsets pi / 4 and 3 pi / 4, rounded as Numerical
/// Recipes writes them. The exact constants change the ninth digit.
#[allow(
    clippy::approx_constant,
    reason = "Excel's results use the rounded value"
)]
const TWO_OVER_PI: f64 = 0.636_619_772;
const QUARTER_PI: f64 = 0.785_398_164;
const THREE_QUARTER_PI: f64 = 2.356_194_491;

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
        "BESSELJ" => Ok(bessel_j(order, x)),
        "BESSELI" => Ok(bessel_i(order, x)),
        "BESSELY" if x > 0.0 => Ok(bessel_y(order, x)),
        "BESSELK" if x > 0.0 => Ok(bessel_k(order, x)),
        "BESSELY" | "BESSELK" => Err(FormulaError::Num),
        _ => Err(FormulaError::Name),
    }
}

fn j0(x: f64) -> f64 {
    if x.abs() >= RATIONAL_LIMIT {
        return asymptotic(x.abs(), 0, false);
    }

    let y = x * x;
    let numerator = 57_568_490_574.0
        + y * (-13_362_590_354.0
            + y * (651_619_640.7
                + y * (-11_214_424.18 + y * (77_392.330_17 + y * -184.905_245_6))));
    let denominator = 57_568_490_411.0
        + y * (1_029_532_985.0
            + y * (9_494_680.718 + y * (59_272.648_53 + y * (267.853_271_2 + y))));

    numerator / denominator
}

fn j1(x: f64) -> f64 {
    if x.abs() >= RATIONAL_LIMIT {
        return asymptotic(x.abs(), 1, false).copysign(x);
    }

    let y = x * x;
    let numerator = x
        * (72_362_614_232.0
            + y * (-7_895_059_235.0
                + y * (242_396_853.1
                    + y * (-2_972_611.439 + y * (15_704.482_60 + y * -30.160_366_06)))));
    let denominator = 144_725_228_442.0
        + y * (2_300_535_178.0
            + y * (18_583_304.74 + y * (99_447.433_94 + y * (376.999_139_7 + y))));

    numerator / denominator
}

/// J and Y of order 0 or 1 for x >= 8: sqrt(2 / (pi x)) times a phase
/// combination of the polynomials P and Q in (8 / x)^2, which J and Y share.
/// Numerical Recipes prints the last Q coefficient of order 0 as
/// 0.934935152E-7 for J and 0.934945152E-7 for Y. Both use the first, which
/// moves Y_0 by less than 1E-11.
fn asymptotic(x: f64, order: u32, is_second_kind: bool) -> f64 {
    let z = RATIONAL_LIMIT / x;
    let y = z * z;

    let (phase, p, q) = if order == 0 {
        (
            x - QUARTER_PI,
            1.0 + y
                * (-0.109_862_862_7e-2
                    + y * (0.273_451_040_7e-4
                        + y * (-0.207_337_063_9e-5 + y * 0.209_388_721_1e-6))),
            -0.156_249_999_5e-1
                + y * (0.143_048_876_5e-3
                    + y * (-0.691_114_765_1e-5 + y * (0.762_109_516_1e-6 - y * 0.934_935_152e-7))),
        )
    } else {
        (
            x - THREE_QUARTER_PI,
            1.0 + y
                * (0.183_105e-2
                    + y * (-0.351_639_649_6e-4 + y * (0.245_752_017_4e-5 + y * -0.240_337_019e-6))),
            0.046_874_999_95
                + y * (-0.200_269_087_3e-3
                    + y * (0.844_919_909_6e-5 + y * (-0.882_289_87e-6 + y * 0.105_787_412e-6))),
        )
    };

    let (sine, cosine) = (phase.sin(), phase.cos());
    let combination = if is_second_kind {
        sine * p + z * cosine * q
    } else {
        cosine * p - z * sine * q
    };

    (TWO_OVER_PI / x).sqrt() * combination
}

/// J_n(x). Above the order, the upward recurrence is stable; below it,
/// Miller's downward recurrence is normalized by J_0 + 2 (J_2 + J_4 + ...).
fn bessel_j(order: u32, x: f64) -> f64 {
    match order {
        0 => return j0(x),
        1 => return j1(x),
        _ => {}
    }

    let magnitude = x.abs();

    if magnitude == 0.0 {
        return 0.0;
    }

    let twice_inverse = 2.0 / magnitude;
    let result = if magnitude > f64::from(order) {
        let mut previous = j0(magnitude);
        let mut current = j1(magnitude);

        for step in 1..order {
            let next = f64::from(step) * twice_inverse * current - previous;
            previous = current;
            current = next;
        }

        current
    } else {
        miller_j(order, twice_inverse)
    };

    if x < 0.0 && order % 2 == 1 {
        -result
    } else {
        result
    }
}

fn miller_j(order: u32, twice_inverse: f64) -> f64 {
    let start = 2 * ((order + (J_ACCURACY * f64::from(order)).sqrt() as u32) / 2);
    let mut is_even = false;
    let mut higher = 0.0;
    let mut current = 1.0;
    let mut result = 0.0;
    let mut even_sum = 0.0;

    for step in (1..=start).rev() {
        let lower = f64::from(step) * twice_inverse * current - higher;
        higher = current;
        current = lower;

        if current.abs() > RESCALE_LIMIT {
            current *= RESCALE;
            higher *= RESCALE;
            result *= RESCALE;
            even_sum *= RESCALE;
        }

        if is_even {
            even_sum += current;
        }

        is_even = !is_even;

        if step == order {
            result = higher;
        }
    }

    result / (2.0 * even_sum - current)
}

fn y0(x: f64) -> f64 {
    if x >= RATIONAL_LIMIT {
        return asymptotic(x, 0, true);
    }

    let y = x * x;
    let numerator = -2_957_821_389.0
        + y * (7_062_834_065.0
            + y * (-512_359_803.6
                + y * (10_879_881.29 + y * (-86_327.927_57 + y * 228.462_273_3))));
    let denominator = 40_076_544_269.0
        + y * (745_249_964.8 + y * (7_189_466.438 + y * (47_447.264_70 + y * (226.103_024_4 + y))));

    numerator / denominator + TWO_OVER_PI * j0(x) * x.ln()
}

fn y1(x: f64) -> f64 {
    if x >= RATIONAL_LIMIT {
        return asymptotic(x, 1, true);
    }

    let y = x * x;
    let numerator = x
        * (-0.490_060_494_3e13
            + y * (0.127_527_439_0e13
                + y * (-0.515_343_813_9e11
                    + y * (0.734_926_455_1e9 + y * (-0.423_792_272_6e7 + y * 0.851_193_793_5e4)))));
    let denominator = 0.249_958_057_0e14
        + y * (0.424_441_966_4e12
            + y * (0.373_365_036_7e10
                + y * (0.224_590_400_2e8 + y * (0.102_042_605_0e6 + y * (0.354_963_288_5e3 + y)))));

    numerator / denominator + TWO_OVER_PI * (j1(x) * x.ln() - 1.0 / x)
}

/// Y_n(x) for x > 0, by the upward recurrence from Y_0 and Y_1.
fn bessel_y(order: u32, x: f64) -> f64 {
    upward(order, x, y0(x), y1(x), -1.0)
}

fn i0(x: f64) -> f64 {
    let magnitude = x.abs();

    if magnitude < MODIFIED_POLYNOMIAL_LIMIT {
        let y = (x / MODIFIED_POLYNOMIAL_LIMIT).powi(2);

        return 1.0
            + y * (3.515_622_9
                + y * (3.089_942_4
                    + y * (1.206_749_2
                        + y * (0.265_973_2 + y * (0.360_768e-1 + y * 0.458_13e-2)))));
    }

    let y = MODIFIED_POLYNOMIAL_LIMIT / magnitude;
    let series = 0.398_942_28
        + y * (0.132_859_2e-1
            + y * (0.225_319e-2
                + y * (-0.157_565e-2
                    + y * (0.916_281e-2
                        + y * (-0.205_770_6e-1
                            + y * (0.263_553_7e-1 + y * (-0.164_763_3e-1 + y * 0.392_377e-2)))))));

    magnitude.exp() / magnitude.sqrt() * series
}

fn i1(x: f64) -> f64 {
    let magnitude = x.abs();
    let result = if magnitude < MODIFIED_POLYNOMIAL_LIMIT {
        let y = (x / MODIFIED_POLYNOMIAL_LIMIT).powi(2);

        magnitude
            * (0.5
                + y * (0.878_905_94
                    + y * (0.514_988_69
                        + y * (0.150_849_34
                            + y * (0.265_873_3e-1 + y * (0.301_532e-2 + y * 0.324_11e-3))))))
    } else {
        let y = MODIFIED_POLYNOMIAL_LIMIT / magnitude;
        let tail = 0.228_296_7e-1 + y * (-0.289_531_2e-1 + y * (0.178_765_4e-1 - y * 0.420_059e-2));
        let series = 0.398_942_28
            + y * (-0.398_802_4e-1
                + y * (-0.362_018e-2 + y * (0.163_801e-2 + y * (-0.103_155_5e-1 + y * tail))));

        series * (magnitude.exp() / magnitude.sqrt())
    };

    if x < 0.0 {
        -result
    } else {
        result
    }
}

/// I_n(x) by Miller's downward recurrence, normalized by I_0.
fn bessel_i(order: u32, x: f64) -> f64 {
    match order {
        0 => return i0(x),
        1 => return i1(x),
        _ => {}
    }

    if x == 0.0 {
        return 0.0;
    }

    let twice_inverse = 2.0 / x.abs();
    let start = 2 * (order + (I_ACCURACY * f64::from(order)).sqrt() as u32);
    let mut higher = 0.0;
    let mut current = 1.0;
    let mut result = 0.0;

    for step in (1..=start).rev() {
        let lower = higher + f64::from(step) * twice_inverse * current;
        higher = current;
        current = lower;

        if current.abs() > RESCALE_LIMIT {
            result *= RESCALE;
            current *= RESCALE;
            higher *= RESCALE;
        }

        if step == order {
            result = higher;
        }
    }

    result *= i0(x) / current;

    if x < 0.0 && order % 2 == 1 {
        -result
    } else {
        result
    }
}

/// The series coefficient -0.57721566 is Euler's constant, rounded as
/// Numerical Recipes writes it.
#[allow(
    clippy::approx_constant,
    reason = "Excel's results use the rounded value"
)]
fn k0(x: f64) -> f64 {
    if x <= MODIFIED_SERIES_LIMIT {
        let y = x * x / 4.0;

        return -(x / 2.0).ln() * i0(x)
            + (-0.577_215_66
                + y * (0.422_784_20
                    + y * (0.230_697_56
                        + y * (0.348_859_0e-1
                            + y * (0.262_698e-2 + y * (0.107_50e-3 + y * 0.74e-5))))));
    }

    let y = 2.0 / x;

    (-x).exp() / x.sqrt()
        * (1.253_314_14
            + y * (-0.783_235_8e-1
                + y * (0.218_956_8e-1
                    + y * (-0.106_244_6e-1
                        + y * (0.587_872e-2 + y * (-0.251_540e-2 + y * 0.532_08e-3))))))
}

fn k1(x: f64) -> f64 {
    if x <= MODIFIED_SERIES_LIMIT {
        let y = x * x / 4.0;

        return (x / 2.0).ln() * i1(x)
            + (1.0 / x)
                * (1.0
                    + y * (0.154_431_44
                        + y * (-0.672_785_79
                            + y * (-0.181_568_97
                                + y * (-0.191_940_2e-1
                                    + y * (-0.110_404e-2 + y * -0.468_6e-4))))));
    }

    let y = 2.0 / x;

    (-x).exp() / x.sqrt()
        * (1.253_314_14
            + y * (0.234_986_19
                + y * (-0.365_562_0e-1
                    + y * (0.150_426_8e-1
                        + y * (-0.780_353e-2 + y * (0.325_614e-2 + y * -0.682_45e-3))))))
}

/// K_n(x) for x > 0, by the upward recurrence from K_0 and K_1.
fn bessel_k(order: u32, x: f64) -> f64 {
    upward(order, x, k0(x), k1(x), 1.0)
}

/// The stable upward recurrence of Y (`sign` -1) and K (`sign` 1):
/// f_{n+1} = 2n / x f_n + sign f_{n-1}.
fn upward(order: u32, x: f64, zero: f64, one: f64, sign: f64) -> f64 {
    if order == 0 {
        return zero;
    }

    let twice_inverse = 2.0 / x;
    let mut previous = zero;
    let mut current = one;

    for step in 1..order {
        let next = f64::from(step) * twice_inverse * current + sign * previous;
        previous = current;
        current = next;
    }

    current
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
