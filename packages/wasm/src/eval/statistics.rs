//! Statistical function family dispatch.

use crate::calc::Func;
use crate::types::{EvalResult, FormulaError, Value, RANGE_CELL_LIMIT};

use super::criteria::Criterion;
use super::functions::{require_arity, FuncAccumulator};
use super::statistic_args::StatisticArgs;
use super::value::{aggregate_number, number_from_value};

/// The most values `MEDIAN`, `PERCENTILE.INC` and the other selections read.
pub(super) const MAX_SELECTION_VALUES: usize = RANGE_CELL_LIMIT as usize;
const MAX_CRITERIA_PAIRS: usize = 126;

/// A statistic that reads only numbers, through [`StatisticArgs`].
#[derive(Clone, Copy)]
pub(super) enum NumberStatistic {
    Median,
    Mode,
    Large,
    Small,
    Rank,
    Percentile,
    Quartile,
    Variance {
        sample: bool,
        standard_deviation: bool,
    },
    GeoMean,
    Paired(PairedKind),
}

impl NumberStatistic {
    /// Whether the statistic pairs the cells of two arguments by position.
    pub(super) const fn is_paired(self) -> bool {
        matches!(self, Self::Paired(_))
    }
}

/// What a statistical function computes.
enum Statistic {
    Numbers(NumberStatistic),
    CountBlank,
    ConditionalExtreme {
        maximum: bool,
    },
    CountedAverage,
    CountedExtreme {
        maximum: bool,
    },
    CountedVariance {
        sample: bool,
        standard_deviation: bool,
    },
}

/// The statistic `func` computes, or `None` for a function of another family.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "functions outside this family are left to the caller; listing the 200 other Func variants adds nothing"
)]
const fn statistic(func: Func) -> Option<Statistic> {
    Some(match func {
        Func::Median => Statistic::Numbers(NumberStatistic::Median),
        Func::ModeSngl => Statistic::Numbers(NumberStatistic::Mode),
        Func::Large => Statistic::Numbers(NumberStatistic::Large),
        Func::Small => Statistic::Numbers(NumberStatistic::Small),
        Func::RankEq => Statistic::Numbers(NumberStatistic::Rank),
        Func::PercentileInc => Statistic::Numbers(NumberStatistic::Percentile),
        Func::QuartileInc => Statistic::Numbers(NumberStatistic::Quartile),
        Func::StdevS => Statistic::Numbers(NumberStatistic::Variance {
            sample: true,
            standard_deviation: true,
        }),
        Func::StdevP => Statistic::Numbers(NumberStatistic::Variance {
            sample: false,
            standard_deviation: true,
        }),
        Func::VarS => Statistic::Numbers(NumberStatistic::Variance {
            sample: true,
            standard_deviation: false,
        }),
        Func::VarP => Statistic::Numbers(NumberStatistic::Variance {
            sample: false,
            standard_deviation: false,
        }),
        Func::GeoMean => Statistic::Numbers(NumberStatistic::GeoMean),
        Func::Correl => Statistic::Numbers(NumberStatistic::Paired(PairedKind::Correlation)),
        Func::CovarianceS => {
            Statistic::Numbers(NumberStatistic::Paired(PairedKind::SampleCovariance))
        }
        Func::CovarianceP => {
            Statistic::Numbers(NumberStatistic::Paired(PairedKind::PopulationCovariance))
        }
        Func::CountBlank => Statistic::CountBlank,
        Func::MaxIfs => Statistic::ConditionalExtreme { maximum: true },
        Func::MinIfs => Statistic::ConditionalExtreme { maximum: false },
        Func::AverageA => Statistic::CountedAverage,
        Func::MaxA => Statistic::CountedExtreme { maximum: true },
        Func::MinA => Statistic::CountedExtreme { maximum: false },
        Func::StdevA => Statistic::CountedVariance {
            sample: true,
            standard_deviation: true,
        },
        Func::StdevPA => Statistic::CountedVariance {
            sample: false,
            standard_deviation: true,
        },
        Func::VarA => Statistic::CountedVariance {
            sample: true,
            standard_deviation: false,
        },
        Func::VarPA => Statistic::CountedVariance {
            sample: false,
            standard_deviation: false,
        },
        _ => return None,
    })
}

/// The statistic of `func` that reads only numbers, if it is one.
pub(super) const fn number_statistic(func: Func) -> Option<NumberStatistic> {
    match statistic(func) {
        Some(Statistic::Numbers(statistic)) => Some(statistic),
        Some(
            Statistic::CountBlank
            | Statistic::ConditionalExtreme { .. }
            | Statistic::CountedAverage
            | Statistic::CountedExtreme { .. }
            | Statistic::CountedVariance { .. },
        )
        | None => None,
    }
}

pub(super) fn apply(func: Func, values: &FuncAccumulator) -> Option<EvalResult> {
    Some(match statistic(func)? {
        Statistic::Numbers(statistic) => apply_numbers(
            statistic,
            &mut StatisticArgs::from_accumulator(values, statistic.is_paired()),
        ),
        Statistic::CountBlank => count_blank(values),
        Statistic::ConditionalExtreme { maximum } => conditional_extreme(values, maximum),
        Statistic::CountedAverage => aggregate_result(counted_average(values)),
        Statistic::CountedExtreme { maximum } => aggregate_result(counted_extreme(values, maximum)),
        Statistic::CountedVariance {
            sample,
            standard_deviation,
        } => aggregate_result(counted_variance(values, sample, standard_deviation)),
    })
}

/// `statistic` of `values`.
pub(super) fn apply_numbers(statistic: NumberStatistic, values: &mut StatisticArgs) -> EvalResult {
    aggregate_result(match statistic {
        NumberStatistic::Median => median(values),
        NumberStatistic::Mode => mode_sngl(values),
        NumberStatistic::Large => large_small(values, false),
        NumberStatistic::Small => large_small(values, true),
        NumberStatistic::Rank => rank_eq(values),
        NumberStatistic::Percentile => percentile_inc(values),
        NumberStatistic::Quartile => quartile_inc(values),
        NumberStatistic::Variance {
            sample,
            standard_deviation,
        } => variance_result(values, sample, standard_deviation),
        NumberStatistic::GeoMean => geomean(values),
        NumberStatistic::Paired(kind) => paired_result(values, kind),
    })
}

fn aggregate_result(result: Result<f64, FormulaError>) -> Value {
    result.map_or_else(Value::Error, Value::number)
}

/// `#VALUE!` unless the statistic has between `minimum` and `maximum`
/// arguments.
fn require_args(
    values: &StatisticArgs,
    minimum: usize,
    maximum: usize,
) -> Result<(), FormulaError> {
    if (minimum..=maximum).contains(&values.arg_count()) {
        Ok(())
    } else {
        Err(FormulaError::Value)
    }
}

fn require_at_least_one_arg(values: &StatisticArgs) -> Result<(), FormulaError> {
    require_args(values, 1, 254)
}

/// Argument `index` as one number; `default` when it is left out.
fn number_at(
    values: &StatisticArgs,
    index: usize,
    default: Option<f64>,
) -> Result<f64, FormulaError> {
    if values.arg_missing(index) {
        return default.ok_or(FormulaError::Value);
    }
    match values.arg_value(index) {
        Some(value) => number_from_value(value),
        None => default.ok_or(FormulaError::Value),
    }
}

/// Argument `index` as an integer, truncated toward zero.
fn integer_at(values: &StatisticArgs, index: usize) -> Result<i64, FormulaError> {
    let number = number_at(values, index, None)?;
    if !number.is_finite() || number < i64::MIN as f64 || number > i64::MAX as f64 {
        return Err(FormulaError::Num);
    }
    Ok(number.trunc() as i64)
}

fn median(values: &mut StatisticArgs) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    let numbers = values.all_numbers(MAX_SELECTION_VALUES)?;
    if numbers.is_empty() {
        return Ok(0.0);
    }
    let middle = numbers.len() / 2;
    let odd = middle * 2 != numbers.len();
    let (left, upper, _) = numbers.select_nth_unstable_by(middle, f64::total_cmp);
    if odd {
        return Ok(*upper);
    }
    let lower = left
        .iter()
        .copied()
        .max_by(f64::total_cmp)
        .ok_or(FormulaError::Num)?;
    Ok(lower * 0.5 + *upper * 0.5)
}

fn mode_sngl(values: &mut StatisticArgs) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    let numbers = values.all_numbers(MAX_SELECTION_VALUES)?;
    if numbers.len() < 2 {
        return Err(FormulaError::Na);
    }
    numbers.sort_unstable_by(f64::total_cmp);
    let mut best_value = numbers[0];
    let mut best_count = 1usize;
    let mut run_count = 1usize;
    for index in 1..numbers.len() {
        if numbers[index] == numbers[index - 1] {
            run_count += 1;
        } else {
            if run_count > best_count {
                best_count = run_count;
                best_value = numbers[index - 1];
            }
            run_count = 1;
        }
    }
    if run_count > best_count {
        best_count = run_count;
        best_value = *numbers.last().unwrap_or(&best_value);
    }
    if best_count < 2 {
        Err(FormulaError::Na)
    } else {
        Ok(best_value)
    }
}

fn large_small(values: &mut StatisticArgs, ascending: bool) -> Result<f64, FormulaError> {
    require_args(values, 2, 2)?;
    values.numbers(0, MAX_SELECTION_VALUES)?;
    let k = usize::try_from(integer_at(values, 1)?).map_err(|_| FormulaError::Num)?;
    let numbers = values.numbers(0, MAX_SELECTION_VALUES)?;
    if k == 0 || k > numbers.len() {
        return Err(FormulaError::Num);
    }
    let index = if ascending { k - 1 } else { numbers.len() - k };
    let (_, selected, _) = numbers.select_nth_unstable_by(index, f64::total_cmp);
    Ok(*selected)
}

/// RANK.EQ counts in place: it needs no copy of the numbers.
fn rank_eq(values: &mut StatisticArgs) -> Result<f64, FormulaError> {
    require_args(values, 2, 3)?;
    let target = number_at(values, 0, None)?;
    let numbers = values.numbers(1, MAX_SELECTION_VALUES)?;
    if numbers.is_empty() || !numbers.contains(&target) {
        return Err(FormulaError::Na);
    }
    let ascending = number_at(values, 2, Some(0.0))? != 0.0;
    let before = values
        .numbers(1, MAX_SELECTION_VALUES)?
        .iter()
        .filter(|&&value| {
            if ascending {
                value < target
            } else {
                value > target
            }
        })
        .count();
    Ok((before + 1) as f64)
}

fn percentile_inc(values: &mut StatisticArgs) -> Result<f64, FormulaError> {
    require_args(values, 2, 2)?;
    values.numbers(0, MAX_SELECTION_VALUES)?;
    let fraction = number_at(values, 1, None)?;
    percentile(values.numbers(0, MAX_SELECTION_VALUES)?, fraction)
}

fn quartile_inc(values: &mut StatisticArgs) -> Result<f64, FormulaError> {
    require_args(values, 2, 2)?;
    let quartile = integer_at(values, 1)?;
    if !(0..=4).contains(&quartile) {
        return Err(FormulaError::Num);
    }
    let numbers = values.numbers(0, MAX_SELECTION_VALUES)?;
    percentile(numbers, quartile as f64 * 0.25)
}

/// The `PERCENTILE.INC` of `numbers` at `fraction`.
fn percentile(numbers: &mut [f64], fraction: f64) -> Result<f64, FormulaError> {
    if numbers.is_empty() || !(0.0..=1.0).contains(&fraction) {
        return Err(FormulaError::Num);
    }
    let rank = (numbers.len() - 1) as f64 * fraction;
    let lower_index = rank.floor() as usize;
    let interpolation = rank - lower_index as f64;
    let (_, lower_slot, right) = numbers.select_nth_unstable_by(lower_index, f64::total_cmp);
    if interpolation == 0.0 {
        return Ok(*lower_slot);
    }
    let lower = *lower_slot;
    let upper = right
        .iter()
        .copied()
        .min_by(f64::total_cmp)
        .ok_or(FormulaError::Num)?;
    Ok(lower * (1.0 - interpolation) + upper * interpolation)
}

#[derive(Default)]
struct Moments {
    count: usize,
    mean: f64,
    m2: f64,
}

impl Moments {
    fn push(&mut self, value: f64) -> Result<(), FormulaError> {
        self.count += 1;
        let delta = value - self.mean;
        self.mean += delta / self.count as f64;
        self.m2 += delta * (value - self.mean);
        if self.mean.is_finite() && self.m2.is_finite() {
            Ok(())
        } else {
            Err(FormulaError::Num)
        }
    }
}

fn variance_result(
    values: &mut StatisticArgs,
    sample: bool,
    standard_deviation: bool,
) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    variance(
        values.all_numbers(MAX_SELECTION_VALUES)?,
        sample,
        standard_deviation,
    )
}

fn variance(numbers: &[f64], sample: bool, standard_deviation: bool) -> Result<f64, FormulaError> {
    let mut moments = Moments::default();
    for &value in numbers {
        moments.push(value)?;
    }
    let divisor = if sample {
        if moments.count < 2 {
            return Err(FormulaError::DivZero);
        }
        moments.count - 1
    } else {
        if moments.count == 0 {
            return Err(FormulaError::DivZero);
        }
        moments.count
    };
    let variance = (moments.m2 / divisor as f64).max(0.0);
    Ok(if standard_deviation {
        variance.sqrt()
    } else {
        variance
    })
}

/// The values of AVERAGEA, MAXA, MINA, STDEVA, STDEVPA, VARA and VARPA. A
/// logical value counts as 1 or 0 and text in a reference as 0. Text typed
/// as an argument is read as a number, and empty text is 0. Empty cells
/// are skipped.
fn counted_numbers(values: &FuncAccumulator) -> Result<Vec<f64>, FormulaError> {
    require_arity(values, 1, 254)?;

    let entries = values.entries();

    if entries.len() > MAX_SELECTION_VALUES {
        return Err(FormulaError::Num);
    }

    let mut numbers = Vec::new();

    for entry in entries {
        let counted = match &entry.value {
            Value::Bool(value) => Some(if *value { 1.0 } else { 0.0 }),
            Value::Text(_) if entry.from_range => Some(0.0),
            Value::Text(text) if text.is_empty() => Some(0.0),
            value @ (Value::Number(_) | Value::Text(_) | Value::Blank | Value::Error(_)) => {
                aggregate_number(value, entry.from_range)?
            }
        };

        if let Some(number) = counted {
            numbers.push(number);
        }
    }

    Ok(numbers)
}

fn counted_average(values: &FuncAccumulator) -> Result<f64, FormulaError> {
    let numbers = counted_numbers(values)?;

    if numbers.is_empty() {
        return Err(FormulaError::DivZero);
    }

    Ok(numbers.iter().sum::<f64>() / numbers.len() as f64)
}

/// MAXA and MINA: 0 when there is no value.
fn counted_extreme(values: &FuncAccumulator, is_maximum: bool) -> Result<f64, FormulaError> {
    let numbers = counted_numbers(values)?;
    let extreme = if is_maximum {
        numbers.iter().copied().reduce(f64::max)
    } else {
        numbers.iter().copied().reduce(f64::min)
    };

    Ok(extreme.unwrap_or_default())
}

fn counted_variance(
    values: &FuncAccumulator,
    sample: bool,
    standard_deviation: bool,
) -> Result<f64, FormulaError> {
    variance(&counted_numbers(values)?, sample, standard_deviation)
}

fn geomean(values: &mut StatisticArgs) -> Result<f64, FormulaError> {
    require_at_least_one_arg(values)?;
    let numbers = values.all_numbers(MAX_SELECTION_VALUES)?;
    if numbers.is_empty() || numbers.iter().any(|&value| value <= 0.0) {
        return Err(FormulaError::Num);
    }
    let mut sum = 0.0;
    let mut correction = 0.0;
    for value in numbers.iter().copied() {
        let logarithm = value.ln();
        let adjusted = logarithm - correction;
        let next = sum + adjusted;
        correction = (next - sum) - adjusted;
        sum = next;
    }
    let result = (sum / numbers.len() as f64).exp();
    if result.is_finite() {
        Ok(result)
    } else {
        Err(FormulaError::Num)
    }
}

/// The statistic a paired function computes.
#[derive(Clone, Copy)]
pub(super) enum PairedKind {
    Correlation,
    SampleCovariance,
    PopulationCovariance,
}

/// The running moments of a paired statistic.
#[derive(Default)]
pub(super) struct PairedMoments {
    count: usize,
    mean_x: f64,
    mean_y: f64,
    m2_x: f64,
    m2_y: f64,
    co_moment: f64,
}

impl PairedMoments {
    /// Adds the pair `x`, `y`; `#NUM!` once a moment stops being finite.
    pub(super) fn push(&mut self, x: f64, y: f64) -> Result<(), FormulaError> {
        self.count += 1;
        let divisor = self.count as f64;
        let delta_x = x - self.mean_x;
        let delta_y = y - self.mean_y;
        self.mean_x += delta_x / divisor;
        self.mean_y += delta_y / divisor;
        self.m2_x += delta_x * (x - self.mean_x);
        self.m2_y += delta_y * (y - self.mean_y);
        self.co_moment += delta_x * (y - self.mean_y);
        if self.mean_x.is_finite()
            && self.mean_y.is_finite()
            && self.m2_x.is_finite()
            && self.m2_y.is_finite()
            && self.co_moment.is_finite()
        {
            Ok(())
        } else {
            Err(FormulaError::Num)
        }
    }
}

fn paired_result(values: &StatisticArgs, kind: PairedKind) -> Result<f64, FormulaError> {
    require_args(values, 2, 2)?;
    let left = values.paired(0);
    let right = values.paired(1);
    if left.len() != right.len() {
        return Err(FormulaError::Na);
    }
    paired_statistic(left.iter().copied().zip(right.iter().copied()), kind)
}

/// One cell of a paired statistic's argument, as the statistic reads it.
#[derive(Clone, Copy)]
pub(super) enum PairedCell {
    Number(f64),
    Error(FormulaError),
    /// Text, a logical value or a blank: the pair is left out.
    Skipped,
}

impl PairedCell {
    /// The cell holding `value`.
    pub(super) const fn of(value: &Value) -> Self {
        match value {
            Value::Number(number) => Self::Number(*number),
            Value::Error(error) => Self::Error(*error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => Self::Skipped,
        }
    }
}

/// `CORREL`, `COVARIANCE.S` or `COVARIANCE.P` of the pairs, in order: the
/// first error in either cell decides the result, a pair of numbers with a
/// non-finite one is `#NUM!`, and any other pair is left out.
pub(super) fn paired_statistic(
    pairs: impl IntoIterator<Item = (PairedCell, PairedCell)>,
    kind: PairedKind,
) -> Result<f64, FormulaError> {
    let mut moments = PairedMoments::default();
    for pair in pairs {
        match pair {
            (PairedCell::Error(error), _) | (_, PairedCell::Error(error)) => return Err(error),
            (PairedCell::Number(x), PairedCell::Number(y)) if x.is_finite() && y.is_finite() => {
                moments.push(x, y)?;
            }
            (PairedCell::Number(_), PairedCell::Number(_)) => return Err(FormulaError::Num),
            _ => {}
        }
    }
    moments.finish(kind)
}

impl PairedMoments {
    /// The statistic `kind` of the pairs added so far.
    pub(super) fn finish(&self, kind: PairedKind) -> Result<f64, FormulaError> {
        match kind {
            PairedKind::Correlation => {
                if self.count < 2 || self.m2_x <= 0.0 || self.m2_y <= 0.0 {
                    return Err(FormulaError::DivZero);
                }
                let result = self.co_moment / self.m2_x.sqrt() / self.m2_y.sqrt();
                if result.is_finite() {
                    Ok(result.clamp(-1.0, 1.0))
                } else {
                    Err(FormulaError::Num)
                }
            }
            PairedKind::SampleCovariance => {
                if self.count < 2 {
                    Err(FormulaError::DivZero)
                } else {
                    Ok(self.co_moment / (self.count - 1) as f64)
                }
            }
            PairedKind::PopulationCovariance => {
                if self.count == 0 {
                    Err(FormulaError::DivZero)
                } else {
                    Ok(self.co_moment / self.count as f64)
                }
            }
        }
    }
}

fn count_blank(values: &FuncAccumulator) -> Value {
    if let Err(error) = require_arity(values, 1, 1) {
        return Value::Error(error);
    }
    Value::number(
        values
            .arg(0)
            .unwrap_or_default()
            .iter()
            .filter(|entry| {
                matches!(entry.value, Value::Blank)
                    || matches!(&entry.value, Value::Text(text) if text.is_empty())
            })
            .count() as f64,
    )
}

fn conditional_extreme(values: &FuncAccumulator, maximum: bool) -> Value {
    let arg_count = values.arg_count();
    if arg_count < 3 || arg_count.is_multiple_of(2) || (arg_count - 1) / 2 > MAX_CRITERIA_PAIRS {
        return Value::Error(FormulaError::Value);
    }
    let target = values.arg(0).unwrap_or_default();
    let target_shape = values.arg_shape(0);
    let mut criteria = Vec::new();
    if criteria.try_reserve((arg_count - 1) / 2).is_err() {
        return Value::Error(FormulaError::Num);
    }
    for pair in (1..arg_count).step_by(2) {
        let range = values.arg(pair).unwrap_or_default();
        if values.arg_shape(pair) != target_shape {
            return Value::Error(FormulaError::Value);
        }
        let Some(criterion_value) = values.arg_value(pair + 1) else {
            return Value::Error(FormulaError::Value);
        };
        match Criterion::parse(criterion_value.clone()) {
            Ok(criterion) => criteria.push((range, criterion)),
            Err(error) => return Value::Error(error),
        }
    }

    let mut result: Option<f64> = None;
    for (index, entry) in target.iter().enumerate() {
        if !criteria
            .iter()
            .all(|(range, criterion)| criterion.matches(&range[index].value))
        {
            continue;
        }
        match entry.value {
            Value::Number(value) if value.is_finite() => {
                result = Some(match result {
                    Some(current) if maximum => current.max(value),
                    Some(current) => current.min(value),
                    None => value,
                });
            }
            Value::Number(_) => return Value::Error(FormulaError::Num),
            Value::Error(error) => return Value::Error(error),
            Value::Text(_) | Value::Bool(_) | Value::Blank => {}
        }
    }
    Value::number(result.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use crate::calc::Func;
    use crate::types::{FormulaError, Value};

    use super::super::test_support::{range_arguments, scalar};
    use super::{apply, FuncAccumulator};

    fn shaped_accumulator(args: &[(Vec<Value>, usize, usize)]) -> FuncAccumulator {
        let mut values = FuncAccumulator::default();
        for (arg, rows, cols) in args {
            for value in arg {
                values.push_range(value.clone()).unwrap();
            }
            values.finish_arg(*rows, *cols).unwrap();
        }
        values
    }

    fn result(func: Func, args: &[Vec<Value>]) -> Value {
        apply(func, &range_arguments(args)).unwrap()
    }

    fn assert_near(value: Value, expected: f64) {
        let Value::Number(actual) = value else {
            panic!("expected number, got {value:?}");
        };
        assert!((actual - expected).abs() <= 1e-12 * expected.abs().max(1.0));
    }

    #[test]
    fn order_statistics_cover_boundaries_and_ties() {
        let data = vec![5.0, 1.0, 3.0, 3.0]
            .into_iter()
            .map(Value::number)
            .collect::<Vec<_>>();
        assert_near(result(Func::Median, std::slice::from_ref(&data)), 3.0);
        assert_near(result(Func::ModeSngl, std::slice::from_ref(&data)), 3.0);
        assert_near(result(Func::Large, &[data.clone(), scalar(2.0)]), 3.0);
        assert_near(result(Func::Small, &[data.clone(), scalar(1.0)]), 1.0);
        assert_eq!(
            result(Func::Large, &[data.clone(), scalar(0.0)]),
            Value::Error(FormulaError::Num)
        );
        assert_eq!(
            result(Func::Small, &[data.clone(), scalar(i64::MAX as f64)]),
            Value::Error(FormulaError::Num)
        );
        assert_near(
            result(Func::PercentileInc, &[data.clone(), scalar(0.25)]),
            2.5,
        );
        assert_near(result(Func::QuartileInc, &[data, scalar(3.0)]), 3.5);
    }

    #[test]
    fn rank_requires_the_target_in_both_orders() {
        let data = vec![Value::number(5.0), Value::number(3.0), Value::number(1.0)];
        assert_eq!(
            result(Func::RankEq, &[scalar(3.0), data.clone()]),
            Value::number(2.0)
        );
        assert_eq!(
            result(Func::RankEq, &[scalar(3.0), data.clone(), scalar(1.0)],),
            Value::number(2.0)
        );
        for order in [0.0, 1.0] {
            assert_eq!(
                result(Func::RankEq, &[scalar(4.0), data.clone(), scalar(order)],),
                Value::Error(FormulaError::Na)
            );
        }
    }

    #[test]
    fn conditional_extremes_share_criteria_and_require_equal_shapes() {
        let target = vec![Value::number(-4.0), Value::number(8.0), Value::number(3.0)];
        let groups = vec![
            Value::text("west"),
            Value::text("east"),
            Value::text("west"),
        ];
        assert_near(
            result(
                Func::MaxIfs,
                &[target.clone(), groups.clone(), vec![Value::text("w*")]],
            ),
            3.0,
        );
        assert_near(
            result(Func::MinIfs, &[target, groups, vec![Value::text("w*")]]),
            -4.0,
        );
        assert_eq!(
            result(
                Func::MaxIfs,
                &[
                    scalar(1.0),
                    vec![Value::number(1.0), Value::number(2.0)],
                    scalar(1.0)
                ],
            ),
            Value::Error(FormulaError::Value)
        );
        let shape_mismatch = shaped_accumulator(&[
            (
                vec![
                    Value::number(1.0),
                    Value::number(2.0),
                    Value::number(3.0),
                    Value::number(4.0),
                ],
                2,
                2,
            ),
            (
                vec![
                    Value::text("x"),
                    Value::text("x"),
                    Value::text("x"),
                    Value::text("x"),
                ],
                1,
                4,
            ),
            (vec![Value::text("x")], 1, 1),
        ]);
        assert_eq!(
            apply(Func::MaxIfs, &shape_mismatch).unwrap(),
            Value::Error(FormulaError::Value)
        );
    }

    /// The example tables of the Microsoft Support pages,
    /// `https://support.microsoft.com/en-us/excel/functions/<name>-function`.
    /// Each data column is one range argument.
    #[test]
    fn counted_functions_match_the_microsoft_examples() {
        let strength: Vec<Value> = [
            1345.0, 1301.0, 1368.0, 1322.0, 1310.0, 1370.0, 1318.0, 1350.0, 1303.0, 1299.0,
        ]
        .map(Value::number)
        .to_vec();
        let averaged = vec![
            Value::number(10.0),
            Value::number(7.0),
            Value::number(9.0),
            Value::number(2.0),
            Value::text("Not available"),
        ];
        let with_blank = vec![
            Value::number(10.0),
            Value::number(7.0),
            Value::number(9.0),
            Value::number(2.0),
        ];
        let maximum = vec![
            Value::number(0.0),
            Value::number(0.2),
            Value::number(0.5),
            Value::number(0.4),
            Value::Bool(true),
        ];
        let minimum = vec![
            Value::Bool(false),
            Value::number(0.2),
            Value::number(0.5),
            Value::number(0.4),
            Value::number(0.8),
        ];
        let cases: Vec<(Func, Vec<Vec<Value>>, f64, f64)> = vec![
            (Func::AverageA, vec![averaged], 5.6, 1e-12),
            // The page shows 5.6 for AVERAGEA(A2:A5,A7) with A7 empty, but
            // its remarks say empty cells are skipped, which gives 28 / 4.
            (
                Func::AverageA,
                vec![with_blank, vec![Value::Blank]],
                7.0,
                1e-12,
            ),
            (Func::MaxA, vec![maximum], 1.0, 0.0),
            (Func::MinA, vec![minimum], 0.0, 0.0),
            (Func::StdevA, vec![strength.clone()], 27.463_915_72, 5e-9),
            (Func::StdevPA, vec![strength.clone()], 26.054_56, 5e-6),
            (Func::VarA, vec![strength.clone()], 754.266_67, 5e-6),
            (Func::VarPA, vec![strength], 678.84, 5e-3),
        ];

        for (func, args, expected, tolerance) in cases {
            let Value::Number(actual) = result(func, &args) else {
                panic!("{func:?} is not a number");
            };

            assert!((actual - expected).abs() <= tolerance, "{func:?}: {actual}");
        }
    }
}
