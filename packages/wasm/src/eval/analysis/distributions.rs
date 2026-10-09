//! Scalar probability distributions for the opt-in analysis engine.

use super::super::functions::{bool_arg, number_arg, require_arity, FuncAccumulator};
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "BETA.DIST",
    "BETA.INV",
    "BINOM.DIST",
    "CHISQ.DIST",
    "CHISQ.DIST.RT",
    "CHISQ.INV",
    "CHISQ.INV.RT",
    "CONFIDENCE.NORM",
    "CONFIDENCE.T",
    "EXPON.DIST",
    "F.DIST",
    "F.DIST.RT",
    "F.INV",
    "F.INV.RT",
    "FISHER",
    "FISHERINV",
    "GAMMA",
    "GAMMA.DIST",
    "GAMMA.INV",
    "GAMMALN",
    "GAUSS",
    "LOGNORM.DIST",
    "LOGNORM.INV",
    "NORM.DIST",
    "NORM.INV",
    "NORM.S.DIST",
    "NORM.S.INV",
    "PHI",
    "POISSON.DIST",
    "STANDARDIZE",
    "T.DIST",
    "T.DIST.2T",
    "T.DIST.RT",
    "T.INV",
    "T.INV.2T",
    "WEIBULL.DIST",
];

const MAX_ITERATIONS: usize = 10_000;
const MAX_INVERSE_ITERATIONS: usize = 1_100;
const RELATIVE_TOLERANCE: f64 = 4.0 * f64::EPSILON;
const CONTINUED_FRACTION_FLOOR: f64 = 1e-300;
const MAX_DEGREES: f64 = 1e10;
const LOG_SQRT_TWO_PI: f64 = 0.9189385332046727;
const HALF: f64 = 0.5;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    calculate(name, values).map_or_else(Value::Error, |number| {
        if number.is_finite() {
            Value::number(number)
        } else {
            Value::Error(FormulaError::Num)
        }
    })
}

fn calculate(name: &str, values: &FuncAccumulator) -> NumberResult {
    let (minimum, maximum) = match name {
        "BETA.DIST" => (4, 6),
        "BETA.INV" => (3, 5),
        "NORM.DIST" | "BINOM.DIST" | "GAMMA.DIST" | "WEIBULL.DIST" | "F.DIST" => (4, 4),
        "NORM.INV" | "T.DIST" | "CHISQ.DIST" | "F.DIST.RT" | "F.INV" | "F.INV.RT"
        | "POISSON.DIST" | "EXPON.DIST" | "GAMMA.INV" | "LOGNORM.INV" | "CONFIDENCE.NORM"
        | "CONFIDENCE.T" | "STANDARDIZE" => (3, 3),
        "LOGNORM.DIST" => (4, 4),
        "NORM.S.DIST" | "T.DIST.2T" | "T.DIST.RT" | "T.INV" | "T.INV.2T" | "CHISQ.DIST.RT"
        | "CHISQ.INV" | "CHISQ.INV.RT" => (2, 2),
        "NORM.S.INV" | "GAMMA" | "GAMMALN" | "FISHER" | "FISHERINV" | "PHI" | "GAUSS" => (1, 1),
        _ => return Err(FormulaError::Name),
    };
    require_arity(values, minimum, maximum)?;
    let x = number_arg(values, 0, None)?;
    match name {
        "PHI" => Ok(normal_density(x)),
        "GAUSS" => {
            let probability = gamma_probability(HALF, x * x * HALF, false)?;
            Ok(x.signum() * HALF * probability)
        }
        "FISHER" => {
            ensure(x.abs() < 1.0)?;
            Ok(HALF * (x.ln_1p() - (-x).ln_1p()))
        }
        "FISHERINV" => Ok(x.tanh()),
        "GAMMA" => gamma(x),
        "GAMMALN" => {
            ensure(x > 0.0)?;
            Ok(log_gamma(x))
        }
        "NORM.S.DIST" => {
            if bool_arg(values, 1, None)? {
                normal_cdf(x)
            } else {
                Ok(normal_density(x))
            }
        }
        "NORM.S.INV" => normal_inverse(x),
        "NORM.DIST" | "NORM.INV" | "LOGNORM.DIST" | "LOGNORM.INV" | "STANDARDIZE" => {
            let mean = number_arg(values, 1, None)?;
            let deviation = number_arg(values, 2, None)?;
            ensure(deviation > 0.0)?;
            match name {
                "STANDARDIZE" => Ok((x - mean) / deviation),
                "NORM.INV" => Ok(mean + deviation * normal_inverse(x)?),
                "LOGNORM.INV" => Ok((mean + deviation * normal_inverse(x)?).exp()),
                _ => {
                    let is_log = name == "LOGNORM.DIST";
                    ensure(!is_log || x > 0.0)?;
                    let standardized = ((if is_log { x.ln() } else { x }) - mean) / deviation;
                    if bool_arg(values, 3, None)? {
                        normal_cdf(standardized)
                    } else {
                        Ok(normal_density(standardized) / deviation / if is_log { x } else { 1.0 })
                    }
                }
            }
        }
        "T.DIST" | "T.DIST.2T" | "T.DIST.RT" | "T.INV" | "T.INV.2T" => {
            let degrees = degrees_arg(values, 1)?;
            match name {
                "T.INV" => student_inverse(x, degrees),
                "T.INV.2T" => {
                    ensure(x > 0.0 && x <= 1.0)?;
                    positive_inverse(x * HALF, |point| student_tail(point, degrees), true)
                }
                "T.DIST.2T" => {
                    ensure(x >= 0.0)?;
                    Ok(2.0 * student_tail(x, degrees)?)
                }
                "T.DIST.RT" => {
                    let tail = student_tail(x.abs(), degrees)?;
                    Ok(if x < 0.0 { 1.0 - tail } else { tail })
                }
                _ => {
                    if bool_arg(values, 2, None)? {
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
            }
        }
        "CHISQ.DIST" | "CHISQ.DIST.RT" | "CHISQ.INV" | "CHISQ.INV.RT" => {
            let shape = degrees_arg(values, 1)? * HALF;
            if name.starts_with("CHISQ.INV") {
                gamma_inverse(x, shape, 2.0, name.ends_with(".RT"))
            } else {
                ensure(x >= 0.0)?;
                if name.ends_with(".RT") || bool_arg(values, 2, None)? {
                    gamma_probability(shape, x * HALF, name.ends_with(".RT"))
                } else {
                    gamma_density(x, shape, 2.0)
                }
            }
        }
        "F.DIST" | "F.DIST.RT" | "F.INV" | "F.INV.RT" => {
            let numerator = degrees_arg(values, 1)?;
            let denominator = degrees_arg(values, 2)?;
            let is_right = name.ends_with(".RT");
            if name.starts_with("F.INV") {
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
        "GAMMA.DIST" | "GAMMA.INV" => {
            let shape = number_arg(values, 1, None)?;
            let scale = number_arg(values, 2, None)?;
            ensure(shape > 0.0 && scale > 0.0)?;
            if name == "GAMMA.INV" {
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
        "BETA.DIST" | "BETA.INV" => {
            let alpha = number_arg(values, 1, None)?;
            let beta = number_arg(values, 2, None)?;
            let is_inverse = name == "BETA.INV";
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
        "BINOM.DIST" => {
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
        "POISSON.DIST" => {
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
        "EXPON.DIST" => {
            let rate = number_arg(values, 1, None)?;
            ensure(x >= 0.0 && rate > 0.0)?;
            if bool_arg(values, 2, None)? {
                Ok(-(-rate * x).exp_m1())
            } else {
                Ok(rate * (-rate * x).exp())
            }
        }
        "WEIBULL.DIST" => {
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
        "CONFIDENCE.NORM" | "CONFIDENCE.T" => {
            let deviation = number_arg(values, 1, None)?;
            let size = number_arg(values, 2, None)?.trunc();
            ensure(x > 0.0 && x < 1.0 && deviation > 0.0 && size >= 1.0)?;
            let critical = if name == "CONFIDENCE.NORM" {
                -normal_inverse(x * HALF)?
            } else {
                if size == 1.0 {
                    return Err(FormulaError::DivZero);
                }
                positive_inverse(x * HALF, |point| student_tail(point, size - 1.0), true)?
            };
            Ok(critical * deviation / size.sqrt())
        }
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

fn degrees_arg(values: &FuncAccumulator, index: usize) -> NumberResult {
    let degrees = number_arg(values, index, None)?.trunc();
    ensure((1.0..=MAX_DEGREES).contains(&degrees))?;
    Ok(degrees)
}

// Lanczos coefficients (g = 7), evaluated in log space to avoid overflow.
fn log_gamma(x: f64) -> f64 {
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
fn gamma_probability(shape: f64, x: f64, is_right: bool) -> NumberResult {
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

fn beta_probability(x: f64, alpha: f64, beta: f64) -> NumberResult {
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

fn normal_cdf(x: f64) -> NumberResult {
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

fn student_tail(x: f64, degrees: f64) -> NumberResult {
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

fn f_probability(x: f64, numerator: f64, denominator: f64, is_right: bool) -> NumberResult {
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
    ensure(probability >= 0.0 && probability <= 1.0)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn call(name: &str, arguments: &[Value]) -> Value {
        let mut values = FuncAccumulator::default();
        for argument in arguments {
            values.push_scalar(argument.clone()).unwrap();
            values.finish_arg(1, 1).unwrap();
        }
        evaluate(name, &values)
    }

    fn assert_number(name: &str, arguments: &[f64], expected: f64, tolerance: f64) {
        let arguments: Vec<Value> = arguments.iter().copied().map(Value::number).collect();
        let Value::Number(actual) = call(name, &arguments) else {
            panic!("{name} returned an error");
        };
        assert!(
            (actual - expected).abs() <= tolerance,
            "{name}: {actual} != {expected}"
        );
    }

    /// Excel results published in the "Example" table of each Microsoft Support page,
    /// `https://support.microsoft.com/en-us/excel/functions/<slug>-function`.
    /// Some pages truncate and others round, so the tolerance is one unit in the last
    /// published digit.
    const MICROSOFT_EXAMPLES: &[(&str, &str, &[f64], &str)] = &[
        (
            "beta-dist",
            "BETA.DIST",
            &[2.0, 8.0, 10.0, 1.0, 1.0, 3.0],
            "0.6854706",
        ),
        (
            "beta-dist",
            "BETA.DIST",
            &[2.0, 8.0, 10.0, 0.0, 1.0, 3.0],
            "1.4837646",
        ),
        (
            "beta-inv",
            "BETA.INV",
            &[0.685470581, 8.0, 10.0, 1.0, 3.0],
            "2",
        ),
        (
            "binom-dist",
            "BINOM.DIST",
            &[6.0, 10.0, 0.5, 0.0],
            "0.2050781",
        ),
        ("chisq-dist", "CHISQ.DIST", &[0.5, 1.0, 1.0], "0.52049988"),
        ("chisq-dist", "CHISQ.DIST", &[2.0, 3.0, 0.0], "0.20755375"),
        (
            "chisq-dist-rt",
            "CHISQ.DIST.RT",
            &[18.307, 10.0],
            "0.0500006",
        ),
        ("chisq-inv", "CHISQ.INV", &[0.93, 1.0], "3.283020286"),
        ("chisq-inv", "CHISQ.INV", &[0.6, 2.0], "1.832581464"),
        (
            "chisq-inv-rt",
            "CHISQ.INV.RT",
            &[0.050001, 10.0],
            "18.306973",
        ),
        (
            "confidence-norm",
            "CONFIDENCE.NORM",
            &[0.05, 2.5, 50.0],
            "0.692952",
        ),
        (
            "confidence-t",
            "CONFIDENCE.T",
            &[0.05, 1.0, 50.0],
            "0.284196855",
        ),
        ("expon-dist", "EXPON.DIST", &[0.2, 10.0, 1.0], "0.86466472"),
        ("expon-dist", "EXPON.DIST", &[0.2, 10.0, 0.0], "1.35335283"),
        ("f-dist", "F.DIST", &[15.2069, 6.0, 4.0, 1.0], "0.99"),
        ("f-dist", "F.DIST", &[15.2069, 6.0, 4.0, 0.0], "0.0012238"),
        ("f-dist-rt", "F.DIST.RT", &[15.2068649, 6.0, 4.0], "0.01"),
        ("f-inv", "F.INV", &[0.01, 6.0, 4.0], "0.10930991"),
        ("f-inv-rt", "F.INV.RT", &[0.01, 6.0, 4.0], "15.20686"),
        ("fisher", "FISHER", &[0.75], "0.9729551"),
        ("fisherinv", "FISHERINV", &[0.972955], "0.75"),
        ("gamma", "GAMMA", &[2.5], "1.329"),
        ("gamma", "GAMMA", &[-3.75], "0.268"),
        (
            "gamma-dist",
            "GAMMA.DIST",
            &[10.00001131, 9.0, 2.0, 0.0],
            "0.032639",
        ),
        (
            "gamma-dist",
            "GAMMA.DIST",
            &[10.00001131, 9.0, 2.0, 1.0],
            "0.068094",
        ),
        (
            "gamma-inv",
            "GAMMA.INV",
            &[0.068094, 9.0, 2.0],
            "10.0000112",
        ),
        ("gammaln", "GAMMALN", &[4.0], "1.7917595"),
        ("gauss", "GAUSS", &[2.0], "0.47725"),
        (
            "lognorm-dist",
            "LOGNORM.DIST",
            &[4.0, 3.5, 1.2, 1.0],
            "0.0390836",
        ),
        (
            "lognorm-dist",
            "LOGNORM.DIST",
            &[4.0, 3.5, 1.2, 0.0],
            "0.0176176",
        ),
        (
            "lognorm-inv",
            "LOGNORM.INV",
            &[0.039084, 3.5, 1.2],
            "4.0000252",
        ),
        (
            "norm-dist",
            "NORM.DIST",
            &[42.0, 40.0, 1.5, 1.0],
            "0.9087888",
        ),
        ("norm-dist", "NORM.DIST", &[42.0, 40.0, 1.5, 0.0], "0.10934"),
        ("norm-inv", "NORM.INV", &[0.908789, 40.0, 1.5], "42.000002"),
        (
            "norm-s-dist",
            "NORM.S.DIST",
            &[1.333333, 1.0],
            "0.908788726",
        ),
        (
            "norm-s-dist",
            "NORM.S.DIST",
            &[1.333333, 0.0],
            "0.164010148",
        ),
        ("norm-s-inv", "NORM.S.INV", &[0.908789], "1.3333347"),
        ("phi", "PHI", &[0.75], "0.301137432"),
        ("poisson-dist", "POISSON.DIST", &[2.0, 5.0, 1.0], "0.124652"),
        ("poisson-dist", "POISSON.DIST", &[2.0, 5.0, 0.0], "0.084224"),
        (
            "standardize",
            "STANDARDIZE",
            &[42.0, 40.0, 1.5],
            "1.33333333",
        ),
        ("t-dist", "T.DIST", &[60.0, 1.0, 1.0], "0.99469533"),
        ("t-dist", "T.DIST", &[8.0, 3.0, 0.0], "0.00073691"),
        ("t-dist-2t", "T.DIST.2T", &[1.959999998, 60.0], "0.054645"),
        ("t-dist-rt", "T.DIST.RT", &[1.959999998, 60.0], "0.027322"),
        ("t-inv", "T.INV", &[0.75, 2.0], "0.8164966"),
        ("t-inv-2t", "T.INV.2T", &[0.546449, 60.0], "0.606533076"),
        (
            "weibull-dist",
            "WEIBULL.DIST",
            &[105.0, 20.0, 100.0, 1.0],
            "0.929581",
        ),
        (
            "weibull-dist",
            "WEIBULL.DIST",
            &[105.0, 20.0, 100.0, 0.0],
            "0.035589",
        ),
    ];

    #[test]
    fn microsoft_published_examples_cover_every_function() {
        for (slug, name, arguments, published) in MICROSOFT_EXAMPLES {
            let decimals = published
                .split_once('.')
                .map_or(0, |(_, fraction)| fraction.len());
            let tolerance = 10f64.powi(-(decimals as i32));
            let expected: f64 = published.parse().unwrap();
            assert_number(name, arguments, expected, tolerance);
            assert!(
                slug.replace('-', ".").eq_ignore_ascii_case(name),
                "{slug} documents {name}"
            );
        }
        let mut covered: Vec<&str> = MICROSOFT_EXAMPLES.iter().map(|example| example.1).collect();
        covered.dedup();
        assert_eq!(covered, NAMES);
    }

    #[test]
    fn standard_normal_matches_fifteen_digit_tables() {
        // Abramowitz and Stegun, Handbook of Mathematical Functions, Table 26.1:
        // P(1.0) = 0.841344746068543 and P(2.0) = 0.977249868051821.
        assert_number("NORM.S.DIST", &[1.0, 1.0], 0.841344746068543, 1e-15);
        assert_number("NORM.S.DIST", &[2.0, 1.0], 0.977249868051821, 1e-15);
        assert_number("NORM.S.DIST", &[-2.0, 1.0], 1.0 - 0.977249868051821, 1e-15);
        assert_number("NORM.S.INV", &[0.841344746068543], 1.0, 1e-13);
    }

    #[test]
    fn distribution_tails_and_inverse_endpoints() {
        // Independent closed forms: df=2 chi-square and shape=1 gamma are exponential;
        // df=1 Student is Cauchy, and equal unit beta parameters are uniform.
        assert_number("CHISQ.DIST.RT", &[100.0, 2.0], (-50.0f64).exp(), 1e-35);
        assert_number("CHISQ.INV.RT", &[1e-20, 2.0], -2.0 * (1e-20f64).ln(), 1e-11);
        assert_number("GAMMA.INV", &[0.25, 1.0, 3.0], -3.0 * (0.75f64).ln(), 1e-12);
        assert_number("T.INV", &[0.75, 1.0], 1.0, 1e-13);
        assert_number("T.INV.2T", &[1.0, 3.0], 0.0, 0.0);
        assert_number("BETA.INV", &[1e-20, 1.0, 1.0], 1e-20, 1e-32);
        assert_number("NORM.S.INV", &[0.5], 0.0, 0.0);
        assert_number("BETA.INV", &[1.0, 2.0, 4.0, 3.0, 8.0], 8.0, 0.0);
        assert_number("GAMMA", &[-0.5], -2.0 * std::f64::consts::PI.sqrt(), 1e-13);
        assert_number("BINOM.DIST", &[2.9, 4.8, 0.5, 0.0], 0.375, 1e-14);
        assert_number("POISSON.DIST", &[0.0, 0.0, 1.0], 1.0, 0.0);
        assert_number("WEIBULL.DIST", &[0.0, 1.0, 2.0, 0.0], 0.5, 0.0);
        assert_number("T.DIST.RT", &[-1.0, 1.0], 0.75, 1e-15);
    }

    #[test]
    fn scalar_coercion_arity_and_domain_errors() {
        assert_eq!(
            call("NORM.S.DIST", &[Value::text("0"), Value::text("TRUE")]),
            Value::Number(0.5)
        );
        assert_eq!(
            call("PHI", &[Value::Error(FormulaError::Ref)]),
            Value::Error(FormulaError::Ref)
        );
        assert_eq!(
            call("NORM.S.DIST", &[Value::text("one"), Value::Bool(true)]),
            Value::Error(FormulaError::Value)
        );
        // Domain rules from the "Remarks" section of each Microsoft Support page.
        for (name, arguments, error) in [
            ("NORM.DIST", vec![0.0, 0.0, 0.0, 1.0], FormulaError::Num),
            ("NORM.INV", vec![1.0, 0.0, 1.0], FormulaError::Num),
            ("T.DIST", vec![1.0, 0.5, 1.0], FormulaError::Num),
            ("T.DIST.2T", vec![-1.0, 3.0], FormulaError::Num),
            ("T.INV", vec![0.0, 2.0], FormulaError::Num),
            ("T.INV.2T", vec![0.0, 2.0], FormulaError::Num),
            ("CHISQ.DIST", vec![-1.0, 2.0, 1.0], FormulaError::Num),
            ("CHISQ.DIST.RT", vec![1.0, 1e11], FormulaError::Num),
            ("CHISQ.INV", vec![1.5, 2.0], FormulaError::Num),
            ("CHISQ.INV.RT", vec![-0.5, 2.0], FormulaError::Num),
            ("F.DIST", vec![1.0, 0.9, 2.0, 1.0], FormulaError::Num),
            ("F.DIST.RT", vec![-1.0, 2.0, 2.0], FormulaError::Num),
            ("F.INV", vec![1.5, 2.0, 2.0], FormulaError::Num),
            ("F.INV.RT", vec![0.5, 2.0, 0.0], FormulaError::Num),
            ("BINOM.DIST", vec![5.0, 4.0, 0.5, 1.0], FormulaError::Num),
            ("BINOM.DIST", vec![1.0, 4.0, 1.5, 1.0], FormulaError::Num),
            ("POISSON.DIST", vec![1.0, -1.0, 1.0], FormulaError::Num),
            ("EXPON.DIST", vec![1.0, 0.0, 1.0], FormulaError::Num),
            ("GAMMA.DIST", vec![-1.0, 1.0, 1.0, 1.0], FormulaError::Num),
            ("GAMMA.INV", vec![0.5, 1.0, 0.0], FormulaError::Num),
            ("BETA.DIST", vec![0.5, 2.0, 2.0], FormulaError::Value),
            (
                "BETA.DIST",
                vec![0.5, 2.0, 2.0, 1.0, 1.0, 1.0],
                FormulaError::Num,
            ),
            ("BETA.INV", vec![0.0, 2.0, 2.0], FormulaError::Num),
            ("LOGNORM.DIST", vec![0.0, 0.0, 1.0, 1.0], FormulaError::Num),
            ("LOGNORM.INV", vec![1.0, 0.0, 1.0], FormulaError::Num),
            ("WEIBULL.DIST", vec![1.0, 0.0, 1.0, 1.0], FormulaError::Num),
            ("CONFIDENCE.NORM", vec![1.0, 1.0, 10.0], FormulaError::Num),
            ("CONFIDENCE.T", vec![0.05, 1.0, 1.0], FormulaError::DivZero),
            ("STANDARDIZE", vec![1.0, 0.0, 0.0], FormulaError::Num),
            ("FISHER", vec![1.0], FormulaError::Num),
            ("GAMMA", vec![0.0], FormulaError::Num),
            ("GAMMA", vec![-2.0], FormulaError::Num),
            ("GAMMALN", vec![0.0], FormulaError::Num),
            ("NORM.S.INV", vec![0.0], FormulaError::Num),
        ] {
            let arguments: Vec<Value> = arguments.into_iter().map(Value::number).collect();
            assert_eq!(call(name, &arguments), Value::Error(error), "{name}");
        }
    }
}
