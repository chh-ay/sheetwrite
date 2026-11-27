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

    /// The argument whose range LARGE, SMALL and RANK.EQ may read as the
    /// sorted numbers of a range shared in the pass.
    pub(super) const fn ordered_arg(self) -> Option<usize> {
        match self {
            Self::Large | Self::Small => Some(0),
            Self::Rank => Some(1),
            Self::Median
            | Self::Mode
            | Self::Percentile
            | Self::Quartile
            | Self::Variance { .. }
            | Self::GeoMean
            | Self::Paired(_) => None,
        }
    }
}

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
    crate::sorting::sort_f64(numbers);
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
    if let Some(sorted) = values.ordered() {
        if k == 0 || k > sorted.len() {
            return Err(FormulaError::Num);
        }
        let index = if ascending { k - 1 } else { sorted.len() - k };
        return sorted.get(index).copied().ok_or(FormulaError::Num);
    }
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
    if values.ordered().is_some() {
        values.numbers(1, MAX_SELECTION_VALUES)?;
        return sorted_rank(values, target);
    }
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

/// [`rank_eq`] over the sorted numbers of a shared range: the same checks
/// and count, found by binary search.
fn sorted_rank(values: &StatisticArgs, target: f64) -> Result<f64, FormulaError> {
    let sorted = values.ordered().unwrap_or_default();
    let below = sorted.partition_point(|&value| value < target);
    let through = sorted.partition_point(|&value| value <= target);
    if below == through {
        return Err(FormulaError::Na);
    }
    let ascending = number_at(values, 2, Some(0.0))? != 0.0;
    let before = if ascending {
        below
    } else {
        sorted.len() - through
    };
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

#[derive(Clone, Copy)]
pub(super) enum PairedKind {
    Correlation,
    SampleCovariance,
    PopulationCovariance,
}

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
