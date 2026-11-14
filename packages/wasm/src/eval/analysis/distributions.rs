//! Scalar probability distributions for the opt-in analysis engine.

use super::super::functions::{bool_arg, number_arg, require_arity, FuncAccumulator};
use crate::types::{EvalResult, FormulaError, Value};

family_functions! {
    BETA_DIST = "BETA.DIST",
    BETA_INV = "BETA.INV",
    BINOM_DIST = "BINOM.DIST",
    CHISQ_DIST = "CHISQ.DIST",
    CHISQ_DIST_RT = "CHISQ.DIST.RT",
    CHISQ_INV = "CHISQ.INV",
    CHISQ_INV_RT = "CHISQ.INV.RT",
    CONFIDENCE_NORM = "CONFIDENCE.NORM",
    CONFIDENCE_T = "CONFIDENCE.T",
    EXPON_DIST = "EXPON.DIST",
    F_DIST = "F.DIST",
    F_DIST_RT = "F.DIST.RT",
    F_INV = "F.INV",
    F_INV_RT = "F.INV.RT",
    FISHER,
    FISHERINV,
    GAMMA,
    GAMMA_DIST = "GAMMA.DIST",
    GAMMA_INV = "GAMMA.INV",
    GAMMALN,
    GAMMALN_PRECISE = "GAMMALN.PRECISE",
    GAUSS,
    LOGNORM_DIST = "LOGNORM.DIST",
    LOGNORM_INV = "LOGNORM.INV",
    NORM_DIST = "NORM.DIST",
    NORM_INV = "NORM.INV",
    NORM_S_DIST = "NORM.S.DIST",
    NORM_S_INV = "NORM.S.INV",
    PHI,
    POISSON_DIST = "POISSON.DIST",
    STANDARDIZE,
    T_DIST = "T.DIST",
    T_DIST_2T = "T.DIST.2T",
    T_DIST_RT = "T.DIST.RT",
    T_INV = "T.INV",
    T_INV_2T = "T.INV.2T",
    WEIBULL_DIST = "WEIBULL.DIST",
}

const MAX_ITERATIONS: usize = 10_000;
const MAX_INVERSE_ITERATIONS: usize = 1_100;
const RELATIVE_TOLERANCE: f64 = 4.0 * f64::EPSILON;
const CONTINUED_FRACTION_FLOOR: f64 = 1e-300;
const MAX_DEGREES: f64 = 1e10;
const LOG_SQRT_TWO_PI: f64 = 0.9189385332046727;
const HALF: f64 = 0.5;
/// The relative rounding error of a continued-fraction cumulative
/// probability.
const CUMULATIVE_TOLERANCE: f64 = 64.0 * f64::EPSILON;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(function: Function, values: &FuncAccumulator) -> EvalResult {
    calculate(function, values).map_or_else(Value::Error, |number| {
        if number.is_finite() {
            Value::number(number)
        } else {
            Value::Error(FormulaError::Num)
        }
    })
}

fn calculate(function: Function, values: &FuncAccumulator) -> NumberResult {
    let (minimum, maximum) = match function {
        Function::BETA_DIST => (4, 6),
        Function::BETA_INV => (3, 5),
        Function::NORM_DIST
        | Function::BINOM_DIST
        | Function::GAMMA_DIST
        | Function::WEIBULL_DIST
        | Function::F_DIST => (4, 4),
        Function::NORM_INV
        | Function::T_DIST
        | Function::CHISQ_DIST
        | Function::F_DIST_RT
        | Function::F_INV
        | Function::F_INV_RT
        | Function::POISSON_DIST
        | Function::EXPON_DIST
        | Function::GAMMA_INV
        | Function::LOGNORM_INV
        | Function::CONFIDENCE_NORM
        | Function::CONFIDENCE_T
        | Function::STANDARDIZE => (3, 3),
        Function::LOGNORM_DIST => (4, 4),
        Function::NORM_S_DIST
        | Function::T_DIST_2T
        | Function::T_DIST_RT
        | Function::T_INV
        | Function::T_INV_2T
        | Function::CHISQ_DIST_RT
        | Function::CHISQ_INV
        | Function::CHISQ_INV_RT => (2, 2),
        Function::NORM_S_INV
        | Function::GAMMA
        | Function::GAMMALN
        | Function::GAMMALN_PRECISE
        | Function::FISHER
        | Function::FISHERINV
        | Function::PHI
        | Function::GAUSS => (1, 1),
    };
    require_arity(values, minimum, maximum)?;
    let x = number_arg(values, 0, None)?;
    match function {
        Function::PHI => Ok(normal_density(x)),
        Function::GAUSS => {
            let probability = gamma_probability(HALF, x * x * HALF, false)?;
            Ok(x.signum() * HALF * probability)
        }
        Function::FISHER => {
            ensure(x.abs() < 1.0)?;
            Ok(HALF * (x.ln_1p() - (-x).ln_1p()))
        }
        Function::FISHERINV => Ok(x.tanh()),
        Function::GAMMA => gamma(x),
        Function::GAMMALN | Function::GAMMALN_PRECISE => {
            ensure(x > 0.0)?;
            Ok(log_gamma(x))
        }
        Function::NORM_S_DIST => {
            if bool_arg(values, 1, None)? {
                normal_cdf(x)
            } else {
                Ok(normal_density(x))
            }
        }
        Function::NORM_S_INV => normal_inverse(x),
        Function::NORM_DIST
        | Function::NORM_INV
        | Function::LOGNORM_DIST
        | Function::LOGNORM_INV
        | Function::STANDARDIZE => {
            let mean = number_arg(values, 1, None)?;
            let deviation = number_arg(values, 2, None)?;
            ensure(deviation > 0.0)?;
            if function == Function::STANDARDIZE {
                Ok((x - mean) / deviation)
            } else if function == Function::NORM_INV {
                Ok(mean + deviation * normal_inverse(x)?)
            } else if function == Function::LOGNORM_INV {
                Ok((mean + deviation * normal_inverse(x)?).exp())
            } else {
                let is_log = function == Function::LOGNORM_DIST;
                ensure(!is_log || x > 0.0)?;
                let standardized = ((if is_log { x.ln() } else { x }) - mean) / deviation;
                if bool_arg(values, 3, None)? {
                    normal_cdf(standardized)
                } else {
                    Ok(normal_density(standardized) / deviation / if is_log { x } else { 1.0 })
                }
            }
        }
        Function::T_DIST
        | Function::T_DIST_2T
        | Function::T_DIST_RT
        | Function::T_INV
        | Function::T_INV_2T => {
            let degrees = degrees_arg(values, 1)?;
            if function == Function::T_INV {
                student_inverse(x, degrees)
            } else if function == Function::T_INV_2T {
                ensure(x > 0.0 && x <= 1.0)?;
                positive_inverse(x * HALF, |point| student_tail(point, degrees), true)
            } else if function == Function::T_DIST_2T {
                ensure(x >= 0.0)?;
                Ok(2.0 * student_tail(x, degrees)?)
            } else if function == Function::T_DIST_RT {
                let tail = student_tail(x.abs(), degrees)?;
                Ok(if x < 0.0 { 1.0 - tail } else { tail })
            } else if bool_arg(values, 2, None)? {
                let tail = student_tail(x.abs(), degrees)?;
                Ok(if x < 0.0 { tail } else { 1.0 - tail })
            } else {
                Ok((log_gamma((degrees + 1.0) * HALF)
                    - log_gamma(degrees * HALF)
                    - HALF * (degrees.ln() + std::f64::consts::PI.ln())
                    - (degrees + 1.0) * HALF * (x * x / degrees).ln_1p())
                .exp())
            }
        }
        Function::CHISQ_DIST
        | Function::CHISQ_DIST_RT
        | Function::CHISQ_INV
        | Function::CHISQ_INV_RT => {
            let shape = degrees_arg(values, 1)? * HALF;
            let is_right = matches!(function, Function::CHISQ_DIST_RT | Function::CHISQ_INV_RT);
            if matches!(function, Function::CHISQ_INV | Function::CHISQ_INV_RT) {
                gamma_inverse(x, shape, 2.0, is_right)
            } else {
                ensure(x >= 0.0)?;
                if is_right || bool_arg(values, 2, None)? {
                    gamma_probability(shape, x * HALF, is_right)
                } else {
                    gamma_density(x, shape, 2.0)
                }
            }
        }
        Function::F_DIST | Function::F_DIST_RT | Function::F_INV | Function::F_INV_RT => {
            let numerator = degrees_arg(values, 1)?;
            let denominator = degrees_arg(values, 2)?;
            let is_right = matches!(function, Function::F_DIST_RT | Function::F_INV_RT);
            if matches!(function, Function::F_INV | Function::F_INV_RT) {
                f_inverse(x, numerator, denominator, is_right)
            } else {
                ensure(x >= 0.0)?;
                if is_right || bool_arg(values, 3, None)? {
                    f_probability(x, numerator, denominator, is_right)
                } else if x == 0.0 {
                    if numerator < 2.0 {
                        Err(FormulaError::Num)
                    } else {
                        Ok(if numerator == 2.0 { 1.0 } else { 0.0 })
                    }
                } else {
                    let ratio = numerator / denominator;
                    Ok(
                        ((numerator * HALF - 1.0) * x.ln() + numerator * HALF * ratio.ln()
                            - log_beta(numerator * HALF, denominator * HALF)
                            - (numerator + denominator) * HALF * (ratio * x).ln_1p())
                        .exp(),
                    )
                }
            }
        }
        Function::GAMMA_DIST | Function::GAMMA_INV => {
            let shape = number_arg(values, 1, None)?;
            let scale = number_arg(values, 2, None)?;
            ensure(shape > 0.0 && scale > 0.0)?;
            if function == Function::GAMMA_INV {
                gamma_inverse(x, shape, scale, false)
            } else {
                ensure(x >= 0.0)?;
                if bool_arg(values, 3, None)? {
                    gamma_probability(shape, x / scale, false)
                } else {
                    gamma_density(x, shape, scale)
                }
            }
        }
        Function::BETA_DIST | Function::BETA_INV => {
            let alpha = number_arg(values, 1, None)?;
            let beta = number_arg(values, 2, None)?;
            let is_inverse = function == Function::BETA_INV;
            let bound_index = if is_inverse { 3 } else { 4 };
            let lower = number_arg(values, bound_index, Some(0.0))?;
            let upper = number_arg(values, bound_index + 1, Some(1.0))?;
            ensure(alpha > 0.0 && beta > 0.0 && upper > lower)?;
            if is_inverse {
                ensure(x > 0.0 && x <= 1.0)?;
                Ok(lower + (upper - lower) * beta_inverse(x, alpha, beta)?)
            } else {
                ensure(x >= lower && x <= upper)?;
                let point = (x - lower) / (upper - lower);
                if bool_arg(values, 3, None)? {
                    beta_probability(point, alpha, beta)
                } else {
                    Ok(beta_density(point, alpha, beta)? / (upper - lower))
                }
            }
        }
        Function::BINOM_DIST => {
            let successes = x.trunc();
            let trials = number_arg(values, 1, None)?.trunc();
            let probability = number_arg(values, 2, None)?;
            ensure(successes >= 0.0 && trials >= successes && (0.0..=1.0).contains(&probability))?;
            let is_cumulative = bool_arg(values, 3, None)?;
            if probability == 0.0 {
                return Ok(if is_cumulative || successes == 0.0 {
                    1.0
                } else {
                    0.0
                });
            }
            if probability == 1.0 {
                return Ok(if successes == trials { 1.0 } else { 0.0 });
            }
            if is_cumulative {
                if successes == trials {
                    Ok(1.0)
                } else {
                    beta_probability(1.0 - probability, trials - successes, successes + 1.0)
                }
            } else {
                Ok((log_gamma(trials + 1.0)
                    - log_gamma(successes + 1.0)
                    - log_gamma(trials - successes + 1.0)
                    + successes * probability.ln()
                    + (trials - successes) * (-probability).ln_1p())
                .exp())
            }
        }
        Function::POISSON_DIST => {
            let occurrences = x.trunc();
            let mean = number_arg(values, 1, None)?;
            ensure(x >= 0.0 && mean >= 0.0)?;
            if bool_arg(values, 2, None)? {
                gamma_probability(occurrences + 1.0, mean, true)
            } else if mean == 0.0 {
                Ok(if occurrences == 0.0 { 1.0 } else { 0.0 })
            } else {
                Ok((occurrences * mean.ln() - mean - log_gamma(occurrences + 1.0)).exp())
            }
        }
        Function::EXPON_DIST => {
            let rate = number_arg(values, 1, None)?;
            ensure(x >= 0.0 && rate > 0.0)?;
            if bool_arg(values, 2, None)? {
                Ok(-(-rate * x).exp_m1())
            } else {
                Ok(rate * (-rate * x).exp())
            }
        }
        Function::WEIBULL_DIST => {
            let shape = number_arg(values, 1, None)?;
            let scale = number_arg(values, 2, None)?;
            ensure(x >= 0.0 && shape > 0.0 && scale > 0.0)?;
            let power = (x / scale).powf(shape);
            if bool_arg(values, 3, None)? {
                Ok(-(-power).exp_m1())
            } else if x == 0.0 {
                ensure(shape >= 1.0)?;
                Ok(if shape == 1.0 { 1.0 / scale } else { 0.0 })
            } else {
                Ok((shape.ln() - scale.ln() + (shape - 1.0) * (x / scale).ln() - power).exp())
            }
        }
        Function::CONFIDENCE_NORM | Function::CONFIDENCE_T => {
            let deviation = number_arg(values, 1, None)?;
            let size = number_arg(values, 2, None)?.trunc();
            ensure(x > 0.0 && x < 1.0 && deviation > 0.0 && size >= 1.0)?;
            let critical = if function == Function::CONFIDENCE_NORM {
                -normal_inverse(x * HALF)?
            } else {
                if size == 1.0 {
                    return Err(FormulaError::DivZero);
                }
                positive_inverse(x * HALF, |point| student_tail(point, size - 1.0), true)?
            };
            Ok(critical * deviation / size.sqrt())
        }
    }
}

pub(super) const fn ensure(is_valid: bool) -> Result<(), FormulaError> {
    if is_valid {
        Ok(())
    } else {
        Err(FormulaError::Num)
    }
}

pub(super) fn degrees_arg(values: &FuncAccumulator, index: usize) -> NumberResult {
    let degrees = number_arg(values, index, None)?.trunc();
    ensure((1.0..=MAX_DEGREES).contains(&degrees))?;
    Ok(degrees)
}

// Lanczos coefficients (g = 7), evaluated in log space to avoid overflow.
pub(super) fn log_gamma(x: f64) -> f64 {
    const COEFFICIENTS: [f64; 9] = [
        0.9999999999998099,
        676.5203681218851,
        -1259.1392167224028,
        771.3234287776531,
        -176.6150291621406,
        12.507343278686905,
        -0.13857109526572012,
        9.984369578019572e-6,
        1.5056327351493116e-7,
    ];
    const LANCZOS_SHIFT: f64 = 7.5;
    if x < HALF {
        return std::f64::consts::PI.ln()
            - (std::f64::consts::PI * x).sin().abs().ln()
            - log_gamma(1.0 - x);
    }
    let shifted = x - 1.0;
    let mut sum = COEFFICIENTS[0];
    for (index, coefficient) in COEFFICIENTS.iter().enumerate().skip(1) {
        sum += coefficient / (shifted + index as f64);
    }
    let base = shifted + LANCZOS_SHIFT;
    LOG_SQRT_TWO_PI + (shifted + HALF) * base.ln() - base + sum.ln()
}

fn gamma(x: f64) -> NumberResult {
    ensure(x != 0.0 && !(x < 0.0 && x == x.trunc()))?;
    let magnitude = log_gamma(x).exp();
    Ok(if x < 0.0 {
        magnitude.copysign((std::f64::consts::PI * x).sin())
    } else {
        magnitude
    })
}

fn log_beta(alpha: f64, beta: f64) -> f64 {
    log_gamma(alpha) + log_gamma(beta) - log_gamma(alpha + beta)
}

fn gamma_density(x: f64, shape: f64, scale: f64) -> NumberResult {
    if x == 0.0 {
        ensure(shape >= 1.0)?;
        return Ok(if shape == 1.0 { 1.0 / scale } else { 0.0 });
    }
    Ok(((shape - 1.0) * (x / scale).ln() - x / scale - log_gamma(shape) - scale.ln()).exp())
}

fn fraction_floor(value: f64) -> f64 {
    if value.abs() < CONTINUED_FRACTION_FLOOR {
        CONTINUED_FRACTION_FLOOR.copysign(value)
    } else {
        value
    }
}

// Series for P and modified Lentz fraction for Q. The requested small tail
// is calculated directly; subtracting a tiny tail would lose its precision.
pub(super) fn gamma_probability(shape: f64, x: f64, is_right: bool) -> NumberResult {
    if x == 0.0 {
        return Ok(if is_right { 1.0 } else { 0.0 });
    }
    if x.is_infinite() {
        return Ok(if is_right { 0.0 } else { 1.0 });
    }
    gamma_probability_with_log(shape, x, is_right, log_gamma(shape))
}

fn gamma_probability_with_log(shape: f64, x: f64, is_right: bool, log_shape: f64) -> NumberResult {
    if x == 0.0 {
        return Ok(if is_right { 1.0 } else { 0.0 });
    }
    if x.is_infinite() {
        return Ok(if is_right { 0.0 } else { 1.0 });
    }
    let factor = (shape * x.ln() - x - log_shape).exp();
    if x < shape + 1.0 {
        let mut term = 1.0 / shape;
        let mut sum = term;
        for index in 1..=MAX_ITERATIONS {
            term *= x / (shape + index as f64);
            sum += term;
            if term.abs() <= sum.abs() * RELATIVE_TOLERANCE {
                let lower = (factor * sum).clamp(0.0, 1.0);
                return Ok(if is_right { 1.0 - lower } else { lower });
            }
        }
    } else {
        let mut denominator = x + 1.0 - shape;
        let mut forward = 1.0 / CONTINUED_FRACTION_FLOOR;
        let mut reciprocal = 1.0 / fraction_floor(denominator);
        let mut fraction = reciprocal;
        for index in 1..=MAX_ITERATIONS {
            let coefficient = -(index as f64) * (index as f64 - shape);
            denominator += 2.0;
            reciprocal = 1.0 / fraction_floor(coefficient * reciprocal + denominator);
            forward = fraction_floor(denominator + coefficient / forward);
            let change = reciprocal * forward;
            fraction *= change;
            if (change - 1.0).abs() <= RELATIVE_TOLERANCE {
                let upper = (factor * fraction).clamp(0.0, 1.0);
                return Ok(if is_right { upper } else { 1.0 - upper });
            }
        }
    }
    Err(FormulaError::Num)
}

fn beta_fraction(x: f64, alpha: f64, beta: f64) -> NumberResult {
    let total = alpha + beta;
    let mut forward = 1.0;
    let mut reciprocal = 1.0 / fraction_floor(1.0 - total * x / (alpha + 1.0));
    let mut fraction = reciprocal;
    for index in 1..=MAX_ITERATIONS {
        let step = index as f64;
        let twice = 2.0 * step;
        let first = step * (beta - step) * x / ((alpha + twice - 1.0) * (alpha + twice));
        let second =
            -(alpha + step) * (total + step) * x / ((alpha + twice) * (alpha + twice + 1.0));
        for coefficient in [first, second] {
            reciprocal = 1.0 / fraction_floor(1.0 + coefficient * reciprocal);
            forward = fraction_floor(1.0 + coefficient / forward);
            let change = reciprocal * forward;
            fraction *= change;
            if coefficient == second && (change - 1.0).abs() <= RELATIVE_TOLERANCE {
                return Ok(fraction);
            }
        }
    }
    Err(FormulaError::Num)
}

pub(super) fn beta_probability(x: f64, alpha: f64, beta: f64) -> NumberResult {
    if x <= 0.0 {
        return Ok(0.0);
    }
    if x >= 1.0 {
        return Ok(1.0);
    }
    beta_probability_with_log(x, alpha, beta, log_beta(alpha, beta))
}

fn beta_probability_with_log(x: f64, alpha: f64, beta: f64, log_normalizer: f64) -> NumberResult {
    if x <= 0.0 {
        return Ok(0.0);
    }
    if x >= 1.0 {
        return Ok(1.0);
    }
    let factor = (alpha * x.ln() + beta * (-x).ln_1p() - log_normalizer).exp();
    let probability = if x < (alpha + 1.0) / (alpha + beta + 2.0) {
        factor * beta_fraction(x, alpha, beta)? / alpha
    } else {
        1.0 - factor * beta_fraction(1.0 - x, beta, alpha)? / beta
    };
    Ok(probability.clamp(0.0, 1.0))
}

fn beta_density(x: f64, alpha: f64, beta: f64) -> NumberResult {
    if x == 0.0 {
        ensure(alpha >= 1.0)?;
        return Ok(if alpha == 1.0 { beta } else { 0.0 });
    }
    if x == 1.0 {
        ensure(beta >= 1.0)?;
        return Ok(if beta == 1.0 { alpha } else { 0.0 });
    }
    Ok(((alpha - 1.0) * x.ln() + (beta - 1.0) * (-x).ln_1p() - log_beta(alpha, beta)).exp())
}

fn normal_density(x: f64) -> f64 {
    (-x * x * HALF - LOG_SQRT_TWO_PI).exp()
}

pub(super) fn normal_cdf(x: f64) -> NumberResult {
    let tail = HALF * gamma_probability(HALF, x * x * HALF, true)?;
    Ok(if x < 0.0 { tail } else { 1.0 - tail })
}

fn normal_inverse(probability: f64) -> NumberResult {
    ensure(probability > 0.0 && probability < 1.0)?;
    let is_negative = probability < HALF;
    let tail = if is_negative {
        probability
    } else {
        1.0 - probability
    };
    let log_shape = log_gamma(HALF);
    let quantile = positive_inverse(
        tail,
        |point| Ok(HALF * gamma_probability_with_log(HALF, point * point * HALF, true, log_shape)?),
        true,
    )?;
    Ok(if is_negative { -quantile } else { quantile })
}

pub(super) fn student_tail(x: f64, degrees: f64) -> NumberResult {
    Ok(HALF * beta_probability(degrees / (degrees + x * x), degrees * HALF, HALF)?)
}

fn student_inverse(probability: f64, degrees: f64) -> NumberResult {
    ensure(probability > 0.0 && probability < 1.0)?;
    let is_negative = probability < HALF;
    let tail = if is_negative {
        probability
    } else {
        1.0 - probability
    };
    let alpha = degrees * HALF;
    let log_normalizer = log_beta(alpha, HALF);
    let quantile = positive_inverse(
        tail,
        |point| {
            Ok(HALF
                * beta_probability_with_log(
                    degrees / (degrees + point * point),
                    alpha,
                    HALF,
                    log_normalizer,
                )?)
        },
        true,
    )?;
    Ok(if is_negative { -quantile } else { quantile })
}

pub(super) fn f_probability(
    x: f64,
    numerator: f64,
    denominator: f64,
    is_right: bool,
) -> NumberResult {
    if x == 0.0 {
        return Ok(if is_right { 1.0 } else { 0.0 });
    }
    if x.is_infinite() {
        return Ok(if is_right { 0.0 } else { 1.0 });
    }
    let log_normalizer = if is_right {
        log_beta(denominator * HALF, numerator * HALF)
    } else {
        log_beta(numerator * HALF, denominator * HALF)
    };
    f_probability_with_log(x, numerator, denominator, is_right, log_normalizer)
}

fn f_probability_with_log(
    x: f64,
    numerator: f64,
    denominator: f64,
    is_right: bool,
    log_normalizer: f64,
) -> NumberResult {
    if is_right {
        beta_probability_with_log(
            1.0 / (1.0 + numerator / denominator * x),
            denominator * HALF,
            numerator * HALF,
            log_normalizer,
        )
    } else {
        let ratio = numerator / denominator * x;
        beta_probability_with_log(
            if ratio.is_infinite() {
                1.0
            } else {
                ratio / (1.0 + ratio)
            },
            numerator * HALF,
            denominator * HALF,
            log_normalizer,
        )
    }
}

fn f_inverse(probability: f64, numerator: f64, denominator: f64, is_right: bool) -> NumberResult {
    ensure((0.0..=1.0).contains(&probability))?;
    let log_normalizer = if is_right {
        log_beta(denominator * HALF, numerator * HALF)
    } else {
        log_beta(numerator * HALF, denominator * HALF)
    };
    positive_inverse(
        probability,
        |point| f_probability_with_log(point, numerator, denominator, is_right, log_normalizer),
        is_right,
    )
}

fn gamma_inverse(probability: f64, shape: f64, scale: f64, is_right: bool) -> NumberResult {
    ensure((0.0..=1.0).contains(&probability))?;
    let use_right = if is_right {
        probability <= HALF
    } else {
        probability > HALF
    };
    let target = if use_right == is_right {
        probability
    } else {
        1.0 - probability
    };
    // The shape is fixed throughout bracketing and bisection.
    let log_shape = log_gamma(shape);
    Ok(scale
        * positive_inverse(
            target,
            |point| gamma_probability_with_log(shape, point, use_right, log_shape),
            use_right,
        )?)
}

fn beta_inverse(probability: f64, alpha: f64, beta: f64) -> NumberResult {
    if probability == 0.0 || probability == 1.0 {
        return Ok(probability);
    }
    if probability > HALF {
        return Ok(1.0 - beta_inverse(1.0 - probability, beta, alpha)?);
    }
    let log_normalizer = log_beta(alpha, beta);
    bisect(
        probability,
        0.0,
        1.0,
        |point| beta_probability_with_log(point, alpha, beta, log_normalizer),
        false,
    )
}

fn positive_inverse(
    probability: f64,
    cumulative: impl Fn(f64) -> NumberResult,
    is_right: bool,
) -> NumberResult {
    let at_zero = cumulative(0.0)?;
    if probability == at_zero {
        return Ok(0.0);
    }
    ensure(if is_right {
        probability > 0.0 && probability < at_zero
    } else {
        probability > at_zero && probability < 1.0
    })?;
    let mut upper = 1.0;
    for _ in 0..MAX_INVERSE_ITERATIONS {
        let at_upper = cumulative(upper)?;
        if if is_right {
            at_upper <= probability
        } else {
            at_upper >= probability
        } {
            return bisect(probability, 0.0, upper, cumulative, is_right);
        }
        upper *= 2.0;
        if !upper.is_finite() {
            break;
        }
    }
    Err(FormulaError::Num)
}

fn bisect(
    probability: f64,
    mut lower: f64,
    mut upper: f64,
    cumulative: impl Fn(f64) -> NumberResult,
    is_right: bool,
) -> NumberResult {
    for _ in 0..MAX_INVERSE_ITERATIONS {
        let midpoint = lower + (upper - lower) * HALF;
        if midpoint == lower
            || midpoint == upper
            || upper - lower <= RELATIVE_TOLERANCE * midpoint.abs()
        {
            return Ok(midpoint);
        }
        let at_midpoint = cumulative(midpoint)?;
        if if is_right {
            at_midpoint > probability
        } else {
            at_midpoint < probability
        } {
            lower = midpoint;
        } else {
            upper = midpoint;
        }
    }
    Err(FormulaError::Num)
}

/// The natural logarithm of the binomial coefficient `C(total, chosen)`.
fn log_choose(total: f64, chosen: f64) -> f64 {
    log_gamma(total + 1.0) - log_gamma(chosen + 1.0) - log_gamma(total - chosen + 1.0)
}

/// The binomial cumulative probability of at most `successes` successes.
fn binomial_cumulative(successes: f64, trials: f64, probability: f64) -> NumberResult {
    if successes >= trials {
        return Ok(1.0);
    }

    beta_probability(1.0 - probability, trials - successes, successes + 1.0)
}

/// The smallest number of successes whose binomial cumulative probability is
/// at least `criterion`. Arguments must already be truncated and validated.
///
/// The cumulative probability rises with the count, so a bisection over the
/// integer counts needs about 34 steps for the largest trial counts. A
/// cumulative probability within rounding error of `criterion` meets it, so
/// exact cases such as 1/16 for no successes in 4 fair trials stop there.
pub(super) fn binomial_inverse(trials: f64, probability: f64, criterion: f64) -> NumberResult {
    let threshold = criterion - criterion * CUMULATIVE_TOLERANCE;
    let mut lower = 0.0;
    let mut upper = trials;

    while lower < upper {
        let middle = (lower + (upper - lower) * HALF).floor();

        if binomial_cumulative(middle, trials, probability)? >= threshold {
            upper = middle;
        } else {
            lower = middle + 1.0;
        }
    }

    Ok(lower)
}

/// The hypergeometric probability of exactly `sample_successes` successes in
/// a sample of `sample_size` items drawn without replacement. Arguments must
/// already be truncated and validated.
pub(super) fn hypergeometric_mass(
    sample_successes: f64,
    sample_size: f64,
    population_successes: f64,
    population_size: f64,
) -> f64 {
    let failures = population_size - population_successes;
    let sample_failures = sample_size - sample_successes;

    (log_choose(population_successes, sample_successes) + log_choose(failures, sample_failures)
        - log_choose(population_size, sample_size))
    .exp()
}

/// The negative binomial probability of exactly `failures` failures before
/// the `successes`-th success. Arguments must already be truncated and
/// validated.
pub(super) fn negative_binomial_mass(failures: f64, successes: f64, probability: f64) -> f64 {
    if probability == 0.0 {
        return 0.0;
    }

    if probability == 1.0 {
        return if failures == 0.0 { 1.0 } else { 0.0 };
    }

    (log_choose(failures + successes - 1.0, failures)
        + successes * probability.ln()
        + failures * (-probability).ln_1p())
    .exp()
}

#[cfg(test)]
mod tests {
    use super::*;
    use Function as F;

    fn call(function: Function, arguments: &[Value]) -> Value {
        let mut values = FuncAccumulator::default();
        for argument in arguments {
            values.push_scalar(argument.clone()).unwrap();
            values.finish_arg(1, 1).unwrap();
        }
        evaluate(function, &values)
    }

    fn assert_number(function: Function, numbers: &[f64], expected: f64, tolerance: f64) {
        let arguments: Vec<Value> = numbers.iter().copied().map(Value::number).collect();
        let Value::Number(actual) = call(function, &arguments) else {
            panic!("{function} returned an error");
        };
        assert!(
            (actual - expected).abs() <= tolerance,
            "{function}: {actual} != {expected}"
        );
    }

    /// Excel results published in the "Example" table of each Microsoft Support page,
    /// `https://support.microsoft.com/en-us/excel/functions/<slug>-function`.
    /// Some pages truncate and others round, so the tolerance is one unit in the last
    /// published digit.
    const MICROSOFT_EXAMPLES: &[(&str, Function, &[f64], &str)] = &[
        (
            "beta-dist",
            F::BETA_DIST,
            &[2.0, 8.0, 10.0, 1.0, 1.0, 3.0],
            "0.6854706",
        ),
        (
            "beta-dist",
            F::BETA_DIST,
            &[2.0, 8.0, 10.0, 0.0, 1.0, 3.0],
            "1.4837646",
        ),
        (
            "beta-inv",
            F::BETA_INV,
            &[0.685470581, 8.0, 10.0, 1.0, 3.0],
            "2",
        ),
        (
            "binom-dist",
            F::BINOM_DIST,
            &[6.0, 10.0, 0.5, 0.0],
            "0.2050781",
        ),
        ("chisq-dist", F::CHISQ_DIST, &[0.5, 1.0, 1.0], "0.52049988"),
        ("chisq-dist", F::CHISQ_DIST, &[2.0, 3.0, 0.0], "0.20755375"),
        (
            "chisq-dist-rt",
            F::CHISQ_DIST_RT,
            &[18.307, 10.0],
            "0.0500006",
        ),
        ("chisq-inv", F::CHISQ_INV, &[0.93, 1.0], "3.283020286"),
        ("chisq-inv", F::CHISQ_INV, &[0.6, 2.0], "1.832581464"),
        (
            "chisq-inv-rt",
            F::CHISQ_INV_RT,
            &[0.050001, 10.0],
            "18.306973",
        ),
        (
            "confidence-norm",
            F::CONFIDENCE_NORM,
            &[0.05, 2.5, 50.0],
            "0.692952",
        ),
        (
            "confidence-t",
            F::CONFIDENCE_T,
            &[0.05, 1.0, 50.0],
            "0.284196855",
        ),
        ("expon-dist", F::EXPON_DIST, &[0.2, 10.0, 1.0], "0.86466472"),
        ("expon-dist", F::EXPON_DIST, &[0.2, 10.0, 0.0], "1.35335283"),
        ("f-dist", F::F_DIST, &[15.2069, 6.0, 4.0, 1.0], "0.99"),
        ("f-dist", F::F_DIST, &[15.2069, 6.0, 4.0, 0.0], "0.0012238"),
        ("f-dist-rt", F::F_DIST_RT, &[15.2068649, 6.0, 4.0], "0.01"),
        ("f-inv", F::F_INV, &[0.01, 6.0, 4.0], "0.10930991"),
        ("f-inv-rt", F::F_INV_RT, &[0.01, 6.0, 4.0], "15.20686"),
        ("fisher", F::FISHER, &[0.75], "0.9729551"),
        ("fisherinv", F::FISHERINV, &[0.972955], "0.75"),
        ("gamma", F::GAMMA, &[2.5], "1.329"),
        ("gamma", F::GAMMA, &[-3.75], "0.268"),
        (
            "gamma-dist",
            F::GAMMA_DIST,
            &[10.00001131, 9.0, 2.0, 0.0],
            "0.032639",
        ),
        (
            "gamma-dist",
            F::GAMMA_DIST,
            &[10.00001131, 9.0, 2.0, 1.0],
            "0.068094",
        ),
        (
            "gamma-inv",
            F::GAMMA_INV,
            &[0.068094, 9.0, 2.0],
            "10.0000112",
        ),
        ("gammaln", F::GAMMALN, &[4.0], "1.7917595"),
        ("gammaln-precise", F::GAMMALN_PRECISE, &[4.0], "1.7917595"),
        ("gauss", F::GAUSS, &[2.0], "0.47725"),
        (
            "lognorm-dist",
            F::LOGNORM_DIST,
            &[4.0, 3.5, 1.2, 1.0],
            "0.0390836",
        ),
        (
            "lognorm-dist",
            F::LOGNORM_DIST,
            &[4.0, 3.5, 1.2, 0.0],
            "0.0176176",
        ),
        (
            "lognorm-inv",
            F::LOGNORM_INV,
            &[0.039084, 3.5, 1.2],
            "4.0000252",
        ),
        (
            "norm-dist",
            F::NORM_DIST,
            &[42.0, 40.0, 1.5, 1.0],
            "0.9087888",
        ),
        (
            "norm-dist",
            F::NORM_DIST,
            &[42.0, 40.0, 1.5, 0.0],
            "0.10934",
        ),
        ("norm-inv", F::NORM_INV, &[0.908789, 40.0, 1.5], "42.000002"),
        (
            "norm-s-dist",
            F::NORM_S_DIST,
            &[1.333333, 1.0],
            "0.908788726",
        ),
        (
            "norm-s-dist",
            F::NORM_S_DIST,
            &[1.333333, 0.0],
            "0.164010148",
        ),
        ("norm-s-inv", F::NORM_S_INV, &[0.908789], "1.3333347"),
        ("phi", F::PHI, &[0.75], "0.301137432"),
        (
            "poisson-dist",
            F::POISSON_DIST,
            &[2.0, 5.0, 1.0],
            "0.124652",
        ),
        (
            "poisson-dist",
            F::POISSON_DIST,
            &[2.0, 5.0, 0.0],
            "0.084224",
        ),
        (
            "standardize",
            F::STANDARDIZE,
            &[42.0, 40.0, 1.5],
            "1.33333333",
        ),
        ("t-dist", F::T_DIST, &[60.0, 1.0, 1.0], "0.99469533"),
        ("t-dist", F::T_DIST, &[8.0, 3.0, 0.0], "0.00073691"),
        ("t-dist-2t", F::T_DIST_2T, &[1.959999998, 60.0], "0.054645"),
        ("t-dist-rt", F::T_DIST_RT, &[1.959999998, 60.0], "0.027322"),
        ("t-inv", F::T_INV, &[0.75, 2.0], "0.8164966"),
        ("t-inv-2t", F::T_INV_2T, &[0.546449, 60.0], "0.606533076"),
        (
            "weibull-dist",
            F::WEIBULL_DIST,
            &[105.0, 20.0, 100.0, 1.0],
            "0.929581",
        ),
        (
            "weibull-dist",
            F::WEIBULL_DIST,
            &[105.0, 20.0, 100.0, 0.0],
            "0.035589",
        ),
    ];

    #[test]
    fn microsoft_published_examples_cover_every_function() {
        for (slug, function, arguments, published) in MICROSOFT_EXAMPLES {
            let decimals = published
                .split_once('.')
                .map_or(0, |(_, fraction)| fraction.len());
            let tolerance = 10f64.powi(-(decimals as i32));
            let expected: f64 = published.parse().unwrap();
            assert_number(*function, arguments, expected, tolerance);
            assert!(
                slug.replace('-', ".").eq_ignore_ascii_case(function.name()),
                "{slug} documents {function}"
            );
        }
        let mut covered: Vec<&str> = MICROSOFT_EXAMPLES
            .iter()
            .map(|example| example.1.name())
            .collect();
        covered.dedup();
        assert_eq!(covered, NAMES);
    }

    #[test]
    fn distribution_tails_and_inverse_endpoints() {
        // Independent closed forms: df=2 chi-square and shape=1 gamma are exponential;
        // df=1 Student is Cauchy, and equal unit beta parameters are uniform.
        assert_number(F::CHISQ_DIST_RT, &[100.0, 2.0], (-50.0f64).exp(), 1e-35);
        assert_number(
            F::CHISQ_INV_RT,
            &[1e-20, 2.0],
            -2.0 * (1e-20f64).ln(),
            1e-11,
        );
        assert_number(
            F::GAMMA_INV,
            &[0.25, 1.0, 3.0],
            -3.0 * (0.75f64).ln(),
            1e-12,
        );
        assert_number(F::T_INV, &[0.75, 1.0], 1.0, 1e-13);
        assert_number(F::T_INV_2T, &[1.0, 3.0], 0.0, 0.0);
        assert_number(F::BETA_INV, &[1e-20, 1.0, 1.0], 1e-20, 1e-32);
        assert_number(F::NORM_S_INV, &[0.5], 0.0, 0.0);
        assert_number(F::BETA_INV, &[1.0, 2.0, 4.0, 3.0, 8.0], 8.0, 0.0);
        assert_number(F::GAMMA, &[-0.5], -2.0 * std::f64::consts::PI.sqrt(), 1e-13);
        assert_number(F::BINOM_DIST, &[2.9, 4.8, 0.5, 0.0], 0.375, 1e-14);
        assert_number(F::POISSON_DIST, &[0.0, 0.0, 1.0], 1.0, 0.0);
        assert_number(F::WEIBULL_DIST, &[0.0, 1.0, 2.0, 0.0], 0.5, 0.0);
        assert_number(F::T_DIST_RT, &[-1.0, 1.0], 0.75, 1e-15);
    }

    #[test]
    fn scalar_coercion_arity_and_domain_errors() {
        assert_eq!(
            call(F::NORM_S_DIST, &[Value::text("0"), Value::text("TRUE")]),
            Value::Number(0.5)
        );
        assert_eq!(
            call(F::PHI, &[Value::Error(FormulaError::Ref)]),
            Value::Error(FormulaError::Ref)
        );
        assert_eq!(
            call(F::NORM_S_DIST, &[Value::text("one"), Value::Bool(true)]),
            Value::Error(FormulaError::Value)
        );
        // Domain rules from the "Remarks" section of each Microsoft Support page.
        for (function, inputs, error) in [
            (F::NORM_DIST, vec![0.0, 0.0, 0.0, 1.0], FormulaError::Num),
            (F::NORM_INV, vec![1.0, 0.0, 1.0], FormulaError::Num),
            (F::T_DIST, vec![1.0, 0.5, 1.0], FormulaError::Num),
            (F::T_DIST_2T, vec![-1.0, 3.0], FormulaError::Num),
            (F::T_INV, vec![0.0, 2.0], FormulaError::Num),
            (F::T_INV_2T, vec![0.0, 2.0], FormulaError::Num),
            (F::CHISQ_DIST, vec![-1.0, 2.0, 1.0], FormulaError::Num),
            (F::CHISQ_DIST_RT, vec![1.0, 1e11], FormulaError::Num),
            (F::CHISQ_INV, vec![1.5, 2.0], FormulaError::Num),
            (F::CHISQ_INV_RT, vec![-0.5, 2.0], FormulaError::Num),
            (F::F_DIST, vec![1.0, 0.9, 2.0, 1.0], FormulaError::Num),
            (F::F_DIST_RT, vec![-1.0, 2.0, 2.0], FormulaError::Num),
            (F::F_INV, vec![1.5, 2.0, 2.0], FormulaError::Num),
            (F::F_INV_RT, vec![0.5, 2.0, 0.0], FormulaError::Num),
            (F::BINOM_DIST, vec![5.0, 4.0, 0.5, 1.0], FormulaError::Num),
            (F::BINOM_DIST, vec![1.0, 4.0, 1.5, 1.0], FormulaError::Num),
            (F::POISSON_DIST, vec![1.0, -1.0, 1.0], FormulaError::Num),
            (F::EXPON_DIST, vec![1.0, 0.0, 1.0], FormulaError::Num),
            (F::GAMMA_DIST, vec![-1.0, 1.0, 1.0, 1.0], FormulaError::Num),
            (F::GAMMA_INV, vec![0.5, 1.0, 0.0], FormulaError::Num),
            (F::BETA_DIST, vec![0.5, 2.0, 2.0], FormulaError::Value),
            (
                F::BETA_DIST,
                vec![0.5, 2.0, 2.0, 1.0, 1.0, 1.0],
                FormulaError::Num,
            ),
            (F::BETA_INV, vec![0.0, 2.0, 2.0], FormulaError::Num),
            (F::LOGNORM_DIST, vec![0.0, 0.0, 1.0, 1.0], FormulaError::Num),
            (F::LOGNORM_INV, vec![1.0, 0.0, 1.0], FormulaError::Num),
            (F::WEIBULL_DIST, vec![1.0, 0.0, 1.0, 1.0], FormulaError::Num),
            (F::CONFIDENCE_NORM, vec![1.0, 1.0, 10.0], FormulaError::Num),
            (F::CONFIDENCE_T, vec![0.05, 1.0, 1.0], FormulaError::DivZero),
            (F::STANDARDIZE, vec![1.0, 0.0, 0.0], FormulaError::Num),
            (F::FISHER, vec![1.0], FormulaError::Num),
            (F::GAMMA, vec![0.0], FormulaError::Num),
            (F::GAMMA, vec![-2.0], FormulaError::Num),
            (F::GAMMALN, vec![0.0], FormulaError::Num),
            (F::NORM_S_INV, vec![0.0], FormulaError::Num),
        ] {
            let arguments: Vec<Value> = inputs.into_iter().map(Value::number).collect();
            assert_eq!(
                call(function, &arguments),
                Value::Error(error),
                "{function}"
            );
        }
    }
}
