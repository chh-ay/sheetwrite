//! Discrete distributions: `BINOM.DIST.RANGE`, `BINOM.INV`, `HYPGEOM.DIST`
//! and `NEGBINOM.DIST`. The Excel 2007 names `HYPGEOMDIST` and
//! `NEGBINOMDIST` use the same code without the `cumulative` argument.

use super::super::functions::{bool_arg, number_arg, require_arity, FuncAccumulator};
use super::distributions::{
    beta_probability, binomial_inverse, ensure, hypergeometric_mass, log_gamma,
    negative_binomial_mass,
};
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "BINOM.DIST.RANGE",
    "BINOM.INV",
    "HYPGEOM.DIST",
    "NEGBINOM.DIST",
];

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    let result = match name {
        "BINOM.DIST.RANGE" => binomial_range(values),
        "BINOM.INV" => binomial_inverse_arguments(values),
        "HYPGEOM.DIST" => hypergeometric(values, true),
        "NEGBINOM.DIST" => negative_binomial(values, true),
        _ => Err(FormulaError::Name),
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
/// I_p(number_s, number_f + 1).
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

    fn numbers(arguments: &[f64]) -> Vec<Value> {
        arguments
            .iter()
            .map(|&value| Value::Number(value))
            .collect()
    }

    /// The example tables of the Microsoft Support pages,
    /// `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    #[test]
    fn microsoft_published_examples() {
        let cases: &[(&str, Vec<Value>, &str)] = &[
            ("BINOM.DIST.RANGE", numbers(&[60.0, 0.75, 48.0]), "0.084"),
            (
                "BINOM.DIST.RANGE",
                numbers(&[60.0, 0.75, 45.0, 50.0]),
                "0.524",
            ),
            ("BINOM.INV", numbers(&[6.0, 0.5, 0.75]), "4"),
            (
                "HYPGEOM.DIST",
                [numbers(&[1.0, 4.0, 8.0, 20.0]), vec![Value::Bool(true)]].concat(),
                "0.4654",
            ),
            (
                "HYPGEOM.DIST",
                [numbers(&[1.0, 4.0, 8.0, 20.0]), vec![Value::Bool(false)]].concat(),
                "0.3633",
            ),
            (
                "NEGBINOM.DIST",
                [numbers(&[10.0, 5.0, 0.25]), vec![Value::Bool(true)]].concat(),
                "0.3135141",
            ),
            (
                "NEGBINOM.DIST",
                [numbers(&[10.0, 5.0, 0.25]), vec![Value::Bool(false)]].concat(),
                "0.0550487",
            ),
        ];

        for (name, arguments, published) in cases {
            let decimals = published.split_once('.').map_or(0, |(_, part)| part.len());
            let tolerance = 0.5 * 10f64.powi(-(decimals as i32));
            let expected: f64 = published.parse().unwrap();
            let Value::Number(actual) = call(name, arguments) else {
                panic!("{name}{arguments:?} is not a number");
            };

            assert!(
                (actual - expected).abs() <= tolerance,
                "{name}{arguments:?}: {actual} is not {published}"
            );
        }
    }

    /// Sums worked by hand: a fair coin tossed 4 times gives 1, 4, 6, 4, 1
    /// sixteenths for 0 to 4 heads.
    #[test]
    fn ranges_and_cumulative_sums_add_the_masses() {
        let cases: &[(&str, Vec<Value>, f64)] = &[
            (
                "BINOM.DIST.RANGE",
                numbers(&[4.0, 0.5, 1.0, 3.0]),
                14.0 / 16.0,
            ),
            ("BINOM.DIST.RANGE", numbers(&[4.0, 0.5, 0.0, 4.0]), 1.0),
            ("BINOM.DIST.RANGE", numbers(&[4.0, 0.0, 0.0]), 1.0),
            (
                "NEGBINOM.DIST",
                [numbers(&[1.0, 1.0, 0.5]), vec![Value::Bool(true)]].concat(),
                0.75,
            ),
            (
                "HYPGEOM.DIST",
                [numbers(&[2.0, 2.0, 2.0, 4.0]), vec![Value::Bool(true)]].concat(),
                1.0,
            ),
        ];

        for (name, arguments, expected) in cases {
            let Value::Number(actual) = call(name, arguments) else {
                panic!("{name}{arguments:?} is not a number");
            };

            assert!(
                (actual - expected).abs() < 1e-12,
                "{name}{arguments:?}: {actual}"
            );
        }
    }

    #[test]
    fn invalid_arguments_follow_the_microsoft_remarks() {
        let cases: &[(&str, Vec<Value>)] = &[
            ("BINOM.DIST.RANGE", numbers(&[4.0, 1.5, 1.0])),
            ("BINOM.DIST.RANGE", numbers(&[4.0, 0.5, 5.0])),
            ("BINOM.DIST.RANGE", numbers(&[4.0, 0.5, 3.0, 2.0])),
            ("BINOM.INV", numbers(&[6.0, 0.0, 0.75])),
            ("BINOM.INV", numbers(&[6.0, 0.5, 1.0])),
            (
                "HYPGEOM.DIST",
                [numbers(&[5.0, 4.0, 8.0, 20.0]), vec![Value::Bool(true)]].concat(),
            ),
            (
                "NEGBINOM.DIST",
                [numbers(&[1.0, 0.0, 0.5]), vec![Value::Bool(true)]].concat(),
            ),
        ];

        for (name, arguments) in cases {
            assert_eq!(
                call(name, arguments),
                Value::Error(FormulaError::Num),
                "{name}{arguments:?}"
            );
        }
    }
}
