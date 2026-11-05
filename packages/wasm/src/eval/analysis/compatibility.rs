//! Excel 2007 statistical names that later Excel versions keep for
//! compatibility, such as `STDEV`, `NORMDIST` and `TDIST`.
//!
//! A name whose contract is the same as its newer function evaluates with
//! that function. The other names keep their own argument order or tail.

use super::super::functions::{apply_func, number_arg, require_arity, FuncAccumulator};
use super::discrete;
use super::distributions::{
    self, beta_probability, binomial_inverse, degrees_arg, ensure, normal_cdf, student_tail,
};
use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value};

pub(crate) const NAMES: &[&str] = &[
    "BETADIST",
    "BETAINV",
    "BINOMDIST",
    "CHIDIST",
    "CHIINV",
    "CONFIDENCE",
    "COVAR",
    "CRITBINOM",
    "EXPONDIST",
    "FDIST",
    "FINV",
    "GAMMADIST",
    "GAMMAINV",
    "HYPGEOMDIST",
    "LOGINV",
    "LOGNORMDIST",
    "MODE",
    "NEGBINOMDIST",
    "NORMDIST",
    "NORMINV",
    "NORMSDIST",
    "NORMSINV",
    "POISSON",
    "STDEV",
    "STDEVP",
    "TDIST",
    "TINV",
    "VAR",
    "VARP",
    "WEIBULL",
];

/// Functions whose arguments are number lists: a single-cell argument is a
/// reference, so text and logical values in that cell are ignored.
pub(crate) const REFERENCE_CELLS: &[&str] = &["MODE", "STDEV", "STDEVP", "VAR", "VARP"];

/// Names that read every sheet of a 3-D reference, as `STDEV.S` does.
pub(crate) const SHEET_SPAN_READERS: &[&str] = &["STDEV", "STDEVP", "VAR", "VARP"];

/// Names that read a union as one list of values, as `MODE.SNGL` does.
pub(crate) const UNION_READERS: &[&str] = &["MODE", "STDEV", "STDEVP", "VAR", "VARP"];

const ONE_TAIL: f64 = 1.0;
const TWO_TAILS: f64 = 2.0;

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    if let Some(func) = built_in_successor(name) {
        return apply_func(func, values);
    }

    if let Some(successor) = distribution_successor(name) {
        return distributions::evaluate(successor, values);
    }

    calculate(name, values).map_or_else(Value::Error, |number| {
        if number.is_finite() {
            Value::number(number)
        } else {
            Value::Error(FormulaError::Num)
        }
    })
}

/// The default-engine function with the same contract.
fn built_in_successor(name: &str) -> Option<Func> {
    Some(match name {
        "COVAR" => Func::CovarianceP,
        "MODE" => Func::ModeSngl,
        "STDEV" => Func::StdevS,
        "STDEVP" => Func::StdevP,
        "VAR" => Func::VarS,
        "VARP" => Func::VarP,
        _ => return None,
    })
}

/// The newer distribution with the same arguments, errors and result.
fn distribution_successor(name: &str) -> Option<&'static str> {
    Some(match name {
        "BETAINV" => "BETA.INV",
        "BINOMDIST" => "BINOM.DIST",
        "CHIDIST" => "CHISQ.DIST.RT",
        "CHIINV" => "CHISQ.INV.RT",
        "CONFIDENCE" => "CONFIDENCE.NORM",
        "EXPONDIST" => "EXPON.DIST",
        "FDIST" => "F.DIST.RT",
        "FINV" => "F.INV.RT",
        "GAMMADIST" => "GAMMA.DIST",
        "GAMMAINV" => "GAMMA.INV",
        "LOGINV" => "LOGNORM.INV",
        "NORMDIST" => "NORM.DIST",
        "NORMINV" => "NORM.INV",
        "NORMSINV" => "NORM.S.INV",
        "POISSON" => "POISSON.DIST",
        "TINV" => "T.INV.2T",
        "WEIBULL" => "WEIBULL.DIST",
        _ => return None,
    })
}

fn calculate(name: &str, values: &FuncAccumulator) -> NumberResult {
    match name {
        "BETADIST" => beta_cumulative(values),
        "CRITBINOM" => critical_binomial(values),
        "HYPGEOMDIST" => discrete::hypergeometric(values, false),
        "LOGNORMDIST" => lognormal_cumulative(values),
        "NEGBINOMDIST" => discrete::negative_binomial(values, false),
        "NORMSDIST" => {
            require_arity(values, 1, 1)?;
            normal_cdf(number_arg(values, 0, None)?)
        }
        "TDIST" => student_tails(values),
        _ => Err(FormulaError::Name),
    }
}

/// `BETADIST(x, alpha, beta, [A], [B])`: always the cumulative probability.
fn beta_cumulative(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 5)?;
    let x = number_arg(values, 0, None)?;
    let alpha = number_arg(values, 1, None)?;
    let beta = number_arg(values, 2, None)?;
    let lower = number_arg(values, 3, Some(0.0))?;
    let upper = number_arg(values, 4, Some(1.0))?;

    ensure(alpha > 0.0 && beta > 0.0 && upper > lower)?;
    ensure(x >= lower && x <= upper)?;

    beta_probability((x - lower) / (upper - lower), alpha, beta)
}

/// `CRITBINOM(trials, probability_s, alpha)`.
fn critical_binomial(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 3)?;
    let trials = number_arg(values, 0, None)?.trunc();
    let probability = number_arg(values, 1, None)?;
    let criterion = number_arg(values, 2, None)?;

    ensure(trials >= 0.0)?;
    ensure((0.0..=1.0).contains(&probability) && (0.0..=1.0).contains(&criterion))?;

    binomial_inverse(trials, probability, criterion)
}

/// `LOGNORMDIST(x, mean, standard_dev)`: always the cumulative probability.
fn lognormal_cumulative(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 3)?;
    let x = number_arg(values, 0, None)?;
    let mean = number_arg(values, 1, None)?;
    let deviation = number_arg(values, 2, None)?;

    ensure(x > 0.0 && deviation > 0.0)?;

    normal_cdf((x.ln() - mean) / deviation)
}

/// `TDIST(x, deg_freedom, tails)`: the right tail, or both tails, of a
/// non-negative `x`.
fn student_tails(values: &FuncAccumulator) -> NumberResult {
    require_arity(values, 3, 3)?;
    let x = number_arg(values, 0, None)?;
    let degrees = degrees_arg(values, 1)?;
    let tails = number_arg(values, 2, None)?.trunc();

    ensure(x >= 0.0)?;
    ensure(tails == ONE_TAIL || tails == TWO_TAILS)?;

    Ok(tails * student_tail(x, degrees)?)
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

    fn call_numbers(name: &str, arguments: &[f64]) -> Value {
        let arguments: Vec<Value> = arguments.iter().copied().map(Value::number).collect();

        call(name, &arguments)
    }

    fn call_list(name: &str, list: &[f64]) -> Value {
        let mut values = FuncAccumulator::default();

        for &number in list {
            values.push_range(Value::number(number)).unwrap();
        }
        values.finish_arg(list.len(), 1).unwrap();

        evaluate(name, &values)
    }

    fn assert_published(name: &str, actual: Value, published: &str) {
        let Value::Number(actual) = actual else {
            panic!("{name} returned {actual:?}");
        };
        let decimals = published
            .split_once('.')
            .map_or(0, |(_, fraction)| fraction.len());
        let tolerance = 10f64.powi(-(decimals as i32));
        let expected: f64 = published.parse().unwrap();

        assert!(
            (actual - expected).abs() <= tolerance,
            "{name}: {actual} != {published}"
        );
    }

    /// Excel results published in the "Example" table of each Microsoft
    /// Support page, `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    /// The tolerance is one unit in the last published digit.
    const MICROSOFT_EXAMPLES: &[(&str, &[f64], &str)] = &[
        ("BETADIST", &[2.0, 8.0, 10.0, 1.0, 3.0], "0.6854706"),
        ("BETAINV", &[0.685470581, 8.0, 10.0, 1.0, 3.0], "2"),
        ("BINOMDIST", &[6.0, 10.0, 0.5, 0.0], "0.2050781"),
        ("CHIDIST", &[18.307, 10.0], "0.0500006"),
        ("CHIINV", &[0.050001, 10.0], "18.306973"),
        ("CONFIDENCE", &[0.05, 2.5, 50.0], "0.692951912"),
        ("CRITBINOM", &[6.0, 0.5, 0.75], "4"),
        ("EXPONDIST", &[0.2, 10.0, 1.0], "0.86466472"),
        ("EXPONDIST", &[0.2, 10.0, 0.0], "1.35335283"),
        ("FDIST", &[15.2069, 6.0, 4.0], "0.01"),
        ("FINV", &[0.01, 6.0, 4.0], "15.206865"),
        ("GAMMADIST", &[10.00001131, 9.0, 2.0, 0.0], "0.032639"),
        ("GAMMADIST", &[10.00001131, 9.0, 2.0, 1.0], "0.068094"),
        ("GAMMAINV", &[0.068094, 9.0, 2.0], "10.0000112"),
        ("HYPGEOMDIST", &[1.0, 4.0, 8.0, 20.0], "0.3633"),
        ("LOGINV", &[0.039084, 3.5, 1.2], "4.0000252"),
        ("LOGNORMDIST", &[4.0, 3.5, 1.2], "0.0390836"),
        ("NEGBINOMDIST", &[10.0, 5.0, 0.25], "0.05504866"),
        ("NORMDIST", &[42.0, 40.0, 1.5, 1.0], "0.9087888"),
        ("NORMDIST", &[42.0, 40.0, 1.5, 0.0], "0.10934"),
        ("NORMINV", &[0.908789, 40.0, 1.5], "42.000002"),
        ("NORMSDIST", &[1.333333], "0.908788726"),
        ("NORMSINV", &[0.908789], "1.3333347"),
        ("POISSON", &[2.0, 5.0, 1.0], "0.124652"),
        ("POISSON", &[2.0, 5.0, 0.0], "0.084224"),
        ("TDIST", &[1.959999998, 60.0, 2.0], "0.054645"),
        ("TDIST", &[1.959999998, 60.0, 1.0], "0.027322"),
        ("TINV", &[0.054644930, 60.0], "1.96"),
        ("WEIBULL", &[105.0, 20.0, 100.0, 1.0], "0.929581"),
        ("WEIBULL", &[105.0, 20.0, 100.0, 0.0], "0.035589"),
    ];

    /// Tensile strength samples from the Microsoft STDEV, STDEVP, VAR and
    /// VARP examples.
    const TENSILE_STRENGTH: &[f64] = &[
        1345.0, 1301.0, 1368.0, 1322.0, 1310.0, 1370.0, 1318.0, 1350.0, 1303.0, 1299.0,
    ];

    #[test]
    fn microsoft_published_examples_give_the_excel_results() {
        for (name, arguments, published) in MICROSOFT_EXAMPLES {
            assert_published(name, call_numbers(name, arguments), published);
        }

        assert_published("STDEV", call_list("STDEV", TENSILE_STRENGTH), "27.46392");
        assert_published("STDEVP", call_list("STDEVP", TENSILE_STRENGTH), "26.05456");
        assert_published("VAR", call_list("VAR", TENSILE_STRENGTH), "754.2667");
        assert_published("VARP", call_list("VARP", TENSILE_STRENGTH), "678.84");
        assert_published(
            "MODE",
            call_list("MODE", &[5.6, 4.0, 4.0, 3.0, 2.0, 4.0]),
            "4",
        );
    }

    #[test]
    fn covar_is_the_population_covariance_of_paired_values() {
        let mut values = FuncAccumulator::default();

        for list in [[3.0, 2.0, 4.0, 5.0, 6.0], [9.0, 7.0, 12.0, 15.0, 17.0]] {
            for number in list {
                values.push_range(Value::number(number)).unwrap();
            }
            values.finish_arg(list.len(), 1).unwrap();
        }

        assert_published("COVAR", evaluate("COVAR", &values), "5.2");
    }

    #[test]
    fn every_name_has_a_published_example() {
        let mut covered: Vec<&str> = MICROSOFT_EXAMPLES.iter().map(|example| example.0).collect();
        covered.extend(["COVAR", "MODE", "STDEV", "STDEVP", "VAR", "VARP"]);
        covered.sort_unstable();
        covered.dedup();

        assert_eq!(covered, NAMES);
    }

    #[test]
    fn legacy_contracts_differ_from_their_successors() {
        // NORMSDIST and LOGNORMDIST have no cumulative argument and always
        // return the cumulative probability.
        assert_eq!(call_numbers("NORMSDIST", &[0.0]), Value::Number(0.5));
        assert_eq!(
            call_numbers("NORMSDIST", &[0.0, 1.0]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            call_numbers("LOGNORMDIST", &[1.0, 0.0, 1.0]),
            Value::Number(0.5)
        );

        // TDIST takes a tail count and rejects a negative x.
        assert_eq!(
            call_numbers("TDIST", &[-1.0, 3.0, 1.0]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            call_numbers("TDIST", &[1.0, 3.0, 3.0]),
            Value::Error(FormulaError::Num)
        );

        // Tails and degrees of freedom are truncated to integers.
        assert_eq!(
            call_numbers("TDIST", &[1.0, 1.9, 2.9]),
            call_numbers("TDIST", &[1.0, 1.0, 2.0])
        );
        // One degree of freedom is the Cauchy distribution: P(T > 1) = 1/4.
        assert_published(
            "TDIST",
            call_numbers("TDIST", &[1.0, 1.0, 1.0]),
            "0.250000000000000",
        );
    }

    #[test]
    fn discrete_distributions_use_exact_closed_forms() {
        // C(4,2) C(6,1) / C(10,3) = 36 / 120.
        assert_published(
            "HYPGEOMDIST",
            call_numbers("HYPGEOMDIST", &[2.0, 3.0, 4.0, 10.0]),
            "0.300000000000",
        );
        // One failure before the second success: C(2,1) 0.5^2 0.5^1 = 1/4.
        assert_published(
            "NEGBINOMDIST",
            call_numbers("NEGBINOMDIST", &[1.0, 2.0, 0.5]),
            "0.250000000000",
        );
        assert_eq!(
            call_numbers("NEGBINOMDIST", &[0.0, 3.0, 1.0]),
            Value::Number(1.0)
        );
        assert_eq!(
            call_numbers("NEGBINOMDIST", &[2.0, 3.0, 0.0]),
            Value::Number(0.0)
        );

        // With probability 1/2 and 4 trials the cumulative probabilities are
        // 1/16, 5/16, 11/16, 15/16 and 1.
        for (criterion, expected) in [
            (0.0, 0.0),
            (0.0625, 0.0),
            (0.07, 1.0),
            (0.7, 3.0),
            (1.0, 4.0),
        ] {
            assert_eq!(
                call_numbers("CRITBINOM", &[4.0, 0.5, criterion]),
                Value::Number(expected),
                "alpha {criterion}"
            );
        }
        assert_eq!(
            call_numbers("CRITBINOM", &[1e9, 0.5, 0.5]),
            Value::Number(5e8)
        );
    }

    #[test]
    fn domain_errors_follow_the_microsoft_remarks() {
        for (name, arguments) in [
            ("BETADIST", vec![0.5, 0.0, 2.0]),
            ("BETADIST", vec![0.5, 2.0, 2.0, 1.0, 1.0]),
            ("BETADIST", vec![3.5, 8.0, 10.0, 1.0, 3.0]),
            ("CRITBINOM", vec![-1.0, 0.5, 0.5]),
            ("CRITBINOM", vec![4.0, 1.5, 0.5]),
            ("CRITBINOM", vec![4.0, 0.5, -0.5]),
            ("HYPGEOMDIST", vec![5.0, 4.0, 8.0, 20.0]),
            ("HYPGEOMDIST", vec![1.0, 21.0, 8.0, 20.0]),
            ("HYPGEOMDIST", vec![1.0, 4.0, 0.0, 20.0]),
            ("HYPGEOMDIST", vec![0.0, 15.0, 8.0, 20.0]),
            ("LOGNORMDIST", vec![0.0, 3.5, 1.2]),
            ("LOGNORMDIST", vec![4.0, 3.5, 0.0]),
            ("NEGBINOMDIST", vec![-1.0, 5.0, 0.25]),
            ("NEGBINOMDIST", vec![10.0, 0.5, 0.25]),
            ("NEGBINOMDIST", vec![10.0, 5.0, 1.5]),
            ("TDIST", vec![1.0, 0.5, 1.0]),
            ("CHIDIST", vec![-1.0, 10.0]),
            ("FINV", vec![1.5, 6.0, 4.0]),
            ("TINV", vec![0.0, 60.0]),
        ] {
            assert_eq!(
                call_numbers(name, &arguments),
                Value::Error(FormulaError::Num),
                "{name}{arguments:?}"
            );
        }

        assert_eq!(
            call("NORMSDIST", &[Value::text("one")]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            call(
                "TDIST",
                &[Value::number(1.0), Value::number(2.0), Value::Bool(true)]
            ),
            call_numbers("TDIST", &[1.0, 2.0, 1.0])
        );
        assert_eq!(
            call_list("STDEV", &[1.0]),
            Value::Error(FormulaError::DivZero)
        );
    }
}
