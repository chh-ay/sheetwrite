//! Discrete distributions: `BINOM.DIST.RANGE`, `BINOM.INV`, `HYPGEOM.DIST`
//! and `NEGBINOM.DIST`. The Excel 2007 names `HYPGEOMDIST` and
//! `NEGBINOMDIST` use the same code without the `cumulative` argument.

use super::super::functions::{bool_arg, number_arg, require_arity, FuncAccumulator};
use super::distributions::{
    beta_probability, binomial_inverse, ensure, hypergeometric_mass, log_gamma,
    negative_binomial_mass,
};
use crate::types::{EvalResult, FormulaError, Value};

family_functions! {
    BINOM_DIST_RANGE = "BINOM.DIST.RANGE",
    BINOM_INV = "BINOM.INV",
    HYPGEOM_DIST = "HYPGEOM.DIST",
    NEGBINOM_DIST = "NEGBINOM.DIST",
}

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(function: Function, values: &FuncAccumulator) -> EvalResult {
    let result = match function {
        Function::BINOM_DIST_RANGE => binomial_range(values),
        Function::BINOM_INV => binomial_inverse_arguments(values),
        Function::HYPGEOM_DIST => hypergeometric(values, true),
        Function::NEGBINOM_DIST => negative_binomial(values, true),
    };

    match result {
        Ok(number) if number.is_finite() => Value::number(number),
        Ok(_) => Value::Error(FormulaError::Num),
        Err(error) => Value::Error(error),
    }
}

/// `BINOM.DIST.RANGE(trials, probability_s, number_s, [number_s2])`: the
/// probability of `number_s` successes, or of `number_s` to `number_s2`.
fn binomial_range(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 4)?;

    let trials = number_arg(values, 0, None)?.trunc();
    let probability = number_arg(values, 1, None)?;
    let first = number_arg(values, 2, None)?.trunc();
    let last = number_arg(values, 3, Some(first))?.trunc();

    ensure(trials >= 0.0 && (0.0..=1.0).contains(&probability))?;
    ensure(first >= 0.0 && first <= last && last <= trials)?;

    if first == last {
        return Ok(binomial_mass(first, trials, probability));
    }

    Ok(binomial_at_most(last, trials, probability)?
        - binomial_at_most(first - 1.0, trials, probability)?)
}

fn binomial_mass(successes: f64, trials: f64, probability: f64) -> f64 {
    if probability == 0.0 {
        return if successes == 0.0 { 1.0 } else { 0.0 };
    }

    if probability == 1.0 {
        return if successes == trials { 1.0 } else { 0.0 };
    }

    let failures = trials - successes;

    (log_gamma(trials + 1.0) - log_gamma(successes + 1.0) - log_gamma(failures + 1.0)
        + successes * probability.ln()
        + failures * (-probability).ln_1p())
    .exp()
}

/// P(X <= successes), through the regularized incomplete beta function.
fn binomial_at_most(successes: f64, trials: f64, probability: f64) -> NumberResult {
    if successes < 0.0 {
        return Ok(0.0);
    }

    if successes >= trials {
        return Ok(1.0);
    }

    beta_probability(1.0 - probability, trials - successes, successes + 1.0)
}

/// `BINOM.INV(trials, probability_s, alpha)`: unlike `CRITBINOM`, the
/// probability and alpha must be strictly between 0 and 1.
fn binomial_inverse_arguments(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 3)?;

    let trials = number_arg(values, 0, None)?.trunc();
    let probability = number_arg(values, 1, None)?;
    let alpha = number_arg(values, 2, None)?;

    ensure(trials >= 0.0)?;
    ensure(probability > 0.0 && probability < 1.0 && alpha > 0.0 && alpha < 1.0)?;

    binomial_inverse(trials, probability, alpha)
}

/// `HYPGEOM.DIST(sample_s, number_sample, population_s, number_pop,
/// cumulative)`, and `HYPGEOMDIST` without `cumulative`. All counts are
/// truncated.
pub(super) fn hypergeometric(values: &FuncAccumulator, has_cumulative: bool) -> NumberResult {
    let arity = if has_cumulative { 5 } else { 4 };

    require_arity(values, arity, arity)?;

    let sample_successes = number_arg(values, 0, None)?.trunc();
    let sample_size = number_arg(values, 1, None)?.trunc();
    let population_successes = number_arg(values, 2, None)?.trunc();
    let population_size = number_arg(values, 3, None)?.trunc();
    let is_cumulative = has_cumulative && bool_arg(values, 4, None)?;
    let lowest = (sample_size - population_size + population_successes).max(0.0);

    ensure(population_size > 0.0)?;
    ensure(sample_size > 0.0 && sample_size <= population_size)?;
    ensure(population_successes > 0.0 && population_successes <= population_size)?;
    ensure(sample_successes <= sample_size.min(population_successes))?;
    ensure(sample_successes >= lowest)?;

    let mass = |successes: f64| {
        hypergeometric_mass(
            successes,
            sample_size,
            population_successes,
            population_size,
        )
    };

    if !is_cumulative {
        return Ok(mass(sample_successes));
    }

    let mut total = 0.0;
    let mut successes = lowest;

    while successes <= sample_successes {
        total += mass(successes);
        successes += 1.0;
    }

    Ok(total.min(1.0))
}

/// `NEGBINOM.DIST(number_f, number_s, probability_s, cumulative)`, and
/// `NEGBINOMDIST` without `cumulative`. The cumulative probability of at
/// most `number_f` failures is the regularized incomplete beta function
/// `I_p(number_s`, `number_f` + 1).
pub(super) fn negative_binomial(values: &FuncAccumulator, has_cumulative: bool) -> NumberResult {
    let arity = if has_cumulative { 4 } else { 3 };

    require_arity(values, arity, arity)?;

    let failures = number_arg(values, 0, None)?.trunc();
    let successes = number_arg(values, 1, None)?.trunc();
    let probability = number_arg(values, 2, None)?;
    let is_cumulative = has_cumulative && bool_arg(values, 3, None)?;

    ensure((0.0..=1.0).contains(&probability))?;
    ensure(failures >= 0.0 && successes >= 1.0)?;

    if !is_cumulative {
        return Ok(negative_binomial_mass(failures, successes, probability));
    }

    if probability == 0.0 || probability == 1.0 {
        return Ok(probability);
    }

    beta_probability(probability, successes, failures + 1.0)
}
