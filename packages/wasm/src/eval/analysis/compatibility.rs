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

family_functions! {
    BETADIST,
    BETAINV,
    BINOMDIST,
    CHIDIST,
    CHIINV,
    CONFIDENCE,
    COVAR,
    CRITBINOM,
    EXPONDIST,
    FDIST,
    FINV,
    GAMMADIST,
    GAMMAINV,
    HYPGEOMDIST,
    LOGINV,
    LOGNORMDIST,
    MODE,
    NEGBINOMDIST,
    NORMDIST,
    NORMINV,
    NORMSDIST,
    NORMSINV,
    POISSON,
    STDEV,
    STDEVP,
    TDIST,
    TINV,
    VAR,
    VARP,
    WEIBULL,
}

/// Functions whose arguments are number lists: a single-cell argument is a
/// reference, so text and logical values in that cell are ignored.
pub(crate) const fn reads_cells_as_references(function: Function) -> bool {
    matches!(
        function,
        Function::MODE | Function::STDEV | Function::STDEVP | Function::VAR | Function::VARP
    )
}

const ONE_TAIL: f64 = 1.0;
const TWO_TAILS: f64 = 2.0;

type NumberResult = Result<f64, FormulaError>;

/// A name with the contract of a default-engine function evaluates with it,
/// and one with the arguments, errors and result of a newer distribution
/// evaluates with that. The others keep their own rules.
pub(crate) fn evaluate(function: Function, values: &FuncAccumulator) -> EvalResult {
    use distributions::Function as Newer;

    let built_in = |func| apply_func(func, values);
    let newer = |successor| distributions::evaluate(successor, values);
    let own = match function {
        Function::COVAR => return built_in(Func::CovarianceP),
        Function::MODE => return built_in(Func::ModeSngl),
        Function::STDEV => return built_in(Func::StdevS),
        Function::STDEVP => return built_in(Func::StdevP),
        Function::VAR => return built_in(Func::VarS),
        Function::VARP => return built_in(Func::VarP),
        Function::BETAINV => return newer(Newer::BETA_INV),
        Function::BINOMDIST => return newer(Newer::BINOM_DIST),
        Function::CHIDIST => return newer(Newer::CHISQ_DIST_RT),
        Function::CHIINV => return newer(Newer::CHISQ_INV_RT),
        Function::CONFIDENCE => return newer(Newer::CONFIDENCE_NORM),
        Function::EXPONDIST => return newer(Newer::EXPON_DIST),
        Function::FDIST => return newer(Newer::F_DIST_RT),
        Function::FINV => return newer(Newer::F_INV_RT),
        Function::GAMMADIST => return newer(Newer::GAMMA_DIST),
        Function::GAMMAINV => return newer(Newer::GAMMA_INV),
        Function::LOGINV => return newer(Newer::LOGNORM_INV),
        Function::NORMDIST => return newer(Newer::NORM_DIST),
        Function::NORMINV => return newer(Newer::NORM_INV),
        Function::NORMSINV => return newer(Newer::NORM_S_INV),
        Function::POISSON => return newer(Newer::POISSON_DIST),
        Function::TINV => return newer(Newer::T_INV_2T),
        Function::WEIBULL => return newer(Newer::WEIBULL_DIST),
        Function::BETADIST => beta_cumulative(values),
        Function::CRITBINOM => critical_binomial(values),
        Function::HYPGEOMDIST => discrete::hypergeometric(values, false),
        Function::LOGNORMDIST => lognormal_cumulative(values),
        Function::NEGBINOMDIST => discrete::negative_binomial(values, false),
        Function::NORMSDIST => require_arity(values, 1, 1)
            .and_then(|()| number_arg(values, 0, None))
            .and_then(normal_cdf),
        Function::TDIST => student_tails(values),
    };

    own.map_or_else(Value::Error, |number| {
        if number.is_finite() {
            Value::number(number)
        } else {
            Value::Error(FormulaError::Num)
        }
    })
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

    fn call(function: Function, arguments: &[Value]) -> Value {
        let mut values = FuncAccumulator::default();

        for argument in arguments {
            values.push_scalar(argument.clone()).unwrap();
            values.finish_arg(1, 1).unwrap();
        }

        evaluate(function, &values)
    }

    fn call_numbers(function: Function, numbers: &[f64]) -> Value {
        let arguments: Vec<Value> = numbers.iter().copied().map(Value::number).collect();

        call(function, &arguments)
    }

    fn call_list(function: Function, list: &[f64]) -> Value {
        let mut values = FuncAccumulator::default();

        for &number in list {
            values.push_range(Value::number(number)).unwrap();
        }
        values.finish_arg(list.len(), 1).unwrap();

        evaluate(function, &values)
    }

    fn assert_published(function: Function, value: Value, published: &str) {
        let Value::Number(actual) = value else {
            panic!("{function} returned {value:?}");
        };
        let decimals = published
            .split_once('.')
            .map_or(0, |(_, fraction)| fraction.len());
        let tolerance = 10f64.powi(-(decimals as i32));
        let expected: f64 = published.parse().unwrap();

        assert!(
            (actual - expected).abs() <= tolerance,
            "{function}: {actual} != {published}"
        );
    }

    /// Excel results published in the "Example" table of each Microsoft
    /// Support page, `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    /// The tolerance is one unit in the last published digit.
    const MICROSOFT_EXAMPLES: &[(Function, &[f64], &str)] = &[
        (Function::BETADIST, &[2.0, 8.0, 10.0, 1.0, 3.0], "0.6854706"),
        (Function::BETAINV, &[0.685470581, 8.0, 10.0, 1.0, 3.0], "2"),
        (Function::BINOMDIST, &[6.0, 10.0, 0.5, 0.0], "0.2050781"),
        (Function::CHIDIST, &[18.307, 10.0], "0.0500006"),
        (Function::CHIINV, &[0.050001, 10.0], "18.306973"),
        (Function::CONFIDENCE, &[0.05, 2.5, 50.0], "0.692951912"),
        (Function::CRITBINOM, &[6.0, 0.5, 0.75], "4"),
        (Function::EXPONDIST, &[0.2, 10.0, 1.0], "0.86466472"),
        (Function::EXPONDIST, &[0.2, 10.0, 0.0], "1.35335283"),
        (Function::FDIST, &[15.2069, 6.0, 4.0], "0.01"),
        (Function::FINV, &[0.01, 6.0, 4.0], "15.206865"),
        (
            Function::GAMMADIST,
            &[10.00001131, 9.0, 2.0, 0.0],
            "0.032639",
        ),
        (
            Function::GAMMADIST,
            &[10.00001131, 9.0, 2.0, 1.0],
            "0.068094",
        ),
        (Function::GAMMAINV, &[0.068094, 9.0, 2.0], "10.0000112"),
        (Function::HYPGEOMDIST, &[1.0, 4.0, 8.0, 20.0], "0.3633"),
        (Function::LOGINV, &[0.039084, 3.5, 1.2], "4.0000252"),
        (Function::LOGNORMDIST, &[4.0, 3.5, 1.2], "0.0390836"),
        (Function::NEGBINOMDIST, &[10.0, 5.0, 0.25], "0.05504866"),
        (Function::NORMDIST, &[42.0, 40.0, 1.5, 1.0], "0.9087888"),
        (Function::NORMDIST, &[42.0, 40.0, 1.5, 0.0], "0.10934"),
        (Function::NORMINV, &[0.908789, 40.0, 1.5], "42.000002"),
        (Function::NORMSDIST, &[1.333333], "0.908788726"),
        (Function::NORMSINV, &[0.908789], "1.3333347"),
        (Function::POISSON, &[2.0, 5.0, 1.0], "0.124652"),
        (Function::POISSON, &[2.0, 5.0, 0.0], "0.084224"),
        (Function::TDIST, &[1.959999998, 60.0, 2.0], "0.054645"),
        (Function::TDIST, &[1.959999998, 60.0, 1.0], "0.027322"),
        (Function::TINV, &[0.054644930, 60.0], "1.96"),
        (Function::WEIBULL, &[105.0, 20.0, 100.0, 1.0], "0.929581"),
        (Function::WEIBULL, &[105.0, 20.0, 100.0, 0.0], "0.035589"),
    ];

    /// Tensile strength samples from the Microsoft STDEV, STDEVP, VAR and
    /// VARP examples.
    const TENSILE_STRENGTH: &[f64] = &[
        1345.0, 1301.0, 1368.0, 1322.0, 1310.0, 1370.0, 1318.0, 1350.0, 1303.0, 1299.0,
    ];

    #[test]
    fn microsoft_published_examples_give_the_excel_results() {
        for (function, arguments, published) in MICROSOFT_EXAMPLES {
            assert_published(*function, call_numbers(*function, arguments), published);
        }

        assert_published(
            Function::STDEV,
            call_list(Function::STDEV, TENSILE_STRENGTH),
            "27.46392",
        );
        assert_published(
            Function::STDEVP,
            call_list(Function::STDEVP, TENSILE_STRENGTH),
            "26.05456",
        );
        assert_published(
            Function::VAR,
            call_list(Function::VAR, TENSILE_STRENGTH),
            "754.2667",
        );
        assert_published(
            Function::VARP,
            call_list(Function::VARP, TENSILE_STRENGTH),
            "678.84",
        );
        assert_published(
            Function::MODE,
            call_list(Function::MODE, &[5.6, 4.0, 4.0, 3.0, 2.0, 4.0]),
            "4",
        );
    }

    #[test]
    fn discrete_distributions_use_exact_closed_forms() {
        // C(4,2) C(6,1) / C(10,3) = 36 / 120.
        assert_published(
            Function::HYPGEOMDIST,
            call_numbers(Function::HYPGEOMDIST, &[2.0, 3.0, 4.0, 10.0]),
            "0.300000000000",
        );
        // One failure before the second success: C(2,1) 0.5^2 0.5^1 = 1/4.
        assert_published(
            Function::NEGBINOMDIST,
            call_numbers(Function::NEGBINOMDIST, &[1.0, 2.0, 0.5]),
            "0.250000000000",
        );
        assert_eq!(
            call_numbers(Function::NEGBINOMDIST, &[0.0, 3.0, 1.0]),
            Value::Number(1.0)
        );
        assert_eq!(
            call_numbers(Function::NEGBINOMDIST, &[2.0, 3.0, 0.0]),
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
                call_numbers(Function::CRITBINOM, &[4.0, 0.5, criterion]),
                Value::Number(expected),
                "alpha {criterion}"
            );
        }
        assert_eq!(
            call_numbers(Function::CRITBINOM, &[1e9, 0.5, 0.5]),
            Value::Number(5e8)
        );
    }

    #[test]
    fn domain_errors_follow_the_microsoft_remarks() {
        for (function, arguments) in [
            (Function::BETADIST, vec![0.5, 0.0, 2.0]),
            (Function::BETADIST, vec![0.5, 2.0, 2.0, 1.0, 1.0]),
            (Function::BETADIST, vec![3.5, 8.0, 10.0, 1.0, 3.0]),
            (Function::CRITBINOM, vec![-1.0, 0.5, 0.5]),
            (Function::CRITBINOM, vec![4.0, 1.5, 0.5]),
            (Function::CRITBINOM, vec![4.0, 0.5, -0.5]),
            (Function::HYPGEOMDIST, vec![5.0, 4.0, 8.0, 20.0]),
            (Function::HYPGEOMDIST, vec![1.0, 21.0, 8.0, 20.0]),
            (Function::HYPGEOMDIST, vec![1.0, 4.0, 0.0, 20.0]),
            (Function::HYPGEOMDIST, vec![0.0, 15.0, 8.0, 20.0]),
            (Function::LOGNORMDIST, vec![0.0, 3.5, 1.2]),
            (Function::LOGNORMDIST, vec![4.0, 3.5, 0.0]),
            (Function::NEGBINOMDIST, vec![-1.0, 5.0, 0.25]),
            (Function::NEGBINOMDIST, vec![10.0, 0.5, 0.25]),
            (Function::NEGBINOMDIST, vec![10.0, 5.0, 1.5]),
            (Function::TDIST, vec![1.0, 0.5, 1.0]),
            (Function::CHIDIST, vec![-1.0, 10.0]),
            (Function::FINV, vec![1.5, 6.0, 4.0]),
            (Function::TINV, vec![0.0, 60.0]),
        ] {
            assert_eq!(
                call_numbers(function, &arguments),
                Value::Error(FormulaError::Num),
                "{function}{arguments:?}"
            );
        }

        assert_eq!(
            call(Function::NORMSDIST, &[Value::text("one")]),
            Value::Error(FormulaError::Value)
        );
        assert_eq!(
            call(
                Function::TDIST,
                &[Value::number(1.0), Value::number(2.0), Value::Bool(true)]
            ),
            call_numbers(Function::TDIST, &[1.0, 2.0, 1.0])
        );
        assert_eq!(
            call_list(Function::STDEV, &[1.0]),
            Value::Error(FormulaError::DivZero)
        );
    }
}
