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
