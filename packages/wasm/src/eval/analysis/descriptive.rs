//! Descriptive statistics, ranking and simple linear regression.

use crate::types::{EvalResult, FormulaError, Value, RANGE_CELL_LIMIT};
use super::super::functions::{
    integer_arg, number_arg, numeric_entries, require_arity, FuncAccumulator, FuncValue,
};

pub(crate) const NAMES: &[&str] = &[
    "AVEDEV", "DEVSQ", "FORECAST", "FORECAST.LINEAR", "HARMEAN", "INTERCEPT", "KURT",
    "PEARSON", "PERCENTILE.EXC", "PERCENTRANK.EXC", "PERCENTRANK.INC", "QUARTILE.EXC",
    "RANK.AVG", "RSQ", "SKEW", "SKEW.P", "SLOPE", "STEYX", "TRIMMEAN",
];

/// Functions whose arguments are number lists: a single-cell argument is a
/// reference, so text and logical values in that cell are ignored.
pub(crate) const REFERENCE_CELLS: &[&str] =
    &["AVEDEV", "DEVSQ", "HARMEAN", "KURT", "SKEW", "SKEW.P"];

type NumberResult = Result<f64, FormulaError>;

pub(crate) fn evaluate(name: &str, values: &FuncAccumulator) -> EvalResult {
    calculate(name, values).map_or_else(Value::Error, |number| {
        if number.is_finite() { Value::number(number) } else { Value::Error(FormulaError::Num) }
    })
}

fn calculate(name: &str, values: &FuncAccumulator) -> NumberResult {
    match name {
        "AVEDEV" | "DEVSQ" | "HARMEAN" | "KURT" | "SKEW" | "SKEW.P" => {
            require_arity(values, 1, 255)?;
            let numbers = numbers(values.entries())?;
            match name {
                "AVEDEV" => average_deviation(&numbers),
                "DEVSQ" => Ok(moments(&numbers)?.m2),
                "HARMEAN" => harmonic_mean(&numbers),
                "KURT" => kurtosis(&numbers),
                "SKEW" => skewness(&numbers, true),
                _ => skewness(&numbers, false),
            }
        }
        "TRIMMEAN" => {
            require_arity(values, 2, 2)?;
            trimmed_mean(numbers(values.arg(0).unwrap_or_default())?, number_arg(values, 1, None)?)
        }
        "PERCENTILE.EXC" => {
            require_arity(values, 2, 2)?;
            percentile_exclusive(numbers(values.arg(0).unwrap_or_default())?, number_arg(values, 1, None)?)
        }
        "QUARTILE.EXC" => {
            require_arity(values, 2, 2)?;
            let quartile = integer_arg(values, 1, None)?;
            if !(1..=3).contains(&quartile) {
                return Err(FormulaError::Num);
            }
            percentile_exclusive(numbers(values.arg(0).unwrap_or_default())?, quartile as f64 * 0.25)
        }
        "PERCENTRANK.INC" | "PERCENTRANK.EXC" => {
            require_arity(values, 2, 3)?;
            let numbers = numbers(values.arg(0).unwrap_or_default())?;
            let target = number_arg(values, 1, None)?;
            let significance = integer_arg(values, 2, Some(3))?;
            if significance < 1 {
                return Err(FormulaError::Num);
            }
            percent_rank(numbers, target, name == "PERCENTRANK.EXC", significance)
        }
        "RANK.AVG" => {
            require_arity(values, 2, 3)?;
            let target = number_arg(values, 0, None)?;
            let numbers = numbers(values.arg(1).unwrap_or_default())?;
            let ascending = number_arg(values, 2, Some(0.0))? != 0.0;
            rank_average(&numbers, target, ascending)
        }
        "PEARSON" | "RSQ" | "SLOPE" | "INTERCEPT" | "STEYX" => {
            require_arity(values, 2, 2)?;
            // PEARSON takes (array1, array2); the others take (known_y, known_x).
            let fit = Fit::from_pairs(values.arg(1).unwrap_or_default(), values.arg(0).unwrap_or_default())?;
            match name {
                "PEARSON" => fit.correlation(),
                "RSQ" => fit.correlation().map(|r| r * r),
                "SLOPE" => fit.slope(),
                "INTERCEPT" => fit.intercept(),
                _ => fit.standard_error(),
            }
        }
        "FORECAST" | "FORECAST.LINEAR" => {
            require_arity(values, 3, 3)?;
            let x = number_arg(values, 0, None)?;
            let fit = Fit::from_pairs(values.arg(2).unwrap_or_default(), values.arg(1).unwrap_or_default())?;
            Ok(fit.intercept()? + fit.slope()? * x)
        }
        _ => Err(FormulaError::Name),
    }
}

fn numbers(entries: &[FuncValue]) -> Result<Vec<f64>, FormulaError> {
    if entries.len() > RANGE_CELL_LIMIT as usize {
        return Err(FormulaError::Num);
    }
    numeric_entries(entries)
}

/// Count, mean and the sum of squared deviations, by Welford's method.
struct Moments {
    count: f64,
    mean: f64,
    m2: f64,
}

fn moments(numbers: &[f64]) -> Result<Moments, FormulaError> {
    if numbers.is_empty() {
        return Err(FormulaError::Num);
    }
    let mut result = Moments { count: 0.0, mean: 0.0, m2: 0.0 };
    for &value in numbers {
        result.count += 1.0;
        let delta = value - result.mean;
        result.mean += delta / result.count;
        result.m2 += delta * (value - result.mean);
    }
    if result.mean.is_finite() && result.m2.is_finite() { Ok(result) } else { Err(FormulaError::Num) }
}

fn average_deviation(numbers: &[f64]) -> NumberResult {
    let mean = moments(numbers)?.mean;
    Ok(numbers.iter().map(|value| (value - mean).abs()).sum::<f64>() / numbers.len() as f64)
}

fn harmonic_mean(numbers: &[f64]) -> NumberResult {
    if numbers.is_empty() || numbers.iter().any(|&value| value <= 0.0) {
        return Err(FormulaError::Num);
    }
    Ok(numbers.len() as f64 / numbers.iter().map(|value| 1.0 / value).sum::<f64>())
}

/// Sum of standardized powers `((x - mean) / deviation)^power`.
fn standardized_sum(numbers: &[f64], mean: f64, deviation: f64, power: i32) -> f64 {
    numbers.iter().map(|value| ((value - mean) / deviation).powi(power)).sum()
}

fn skewness(numbers: &[f64], sample: bool) -> NumberResult {
    let Moments { count, mean, m2 } = moments(numbers).map_err(|_| FormulaError::DivZero)?;
    if (sample && count < 3.0) || m2 <= 0.0 {
        return Err(FormulaError::DivZero);
    }
    if sample {
        let deviation = (m2 / (count - 1.0)).sqrt();
        Ok(count / ((count - 1.0) * (count - 2.0)) * standardized_sum(numbers, mean, deviation, 3))
    } else {
        let deviation = (m2 / count).sqrt();
        Ok(standardized_sum(numbers, mean, deviation, 3) / count)
    }
}

fn kurtosis(numbers: &[f64]) -> NumberResult {
    let Moments { count, mean, m2 } = moments(numbers).map_err(|_| FormulaError::DivZero)?;
    if count < 4.0 || m2 <= 0.0 {
        return Err(FormulaError::DivZero);
    }
    let deviation = (m2 / (count - 1.0)).sqrt();
    let lead = count * (count + 1.0) / ((count - 1.0) * (count - 2.0) * (count - 3.0));
    let tail = 3.0 * (count - 1.0) * (count - 1.0) / ((count - 2.0) * (count - 3.0));
    Ok(lead * standardized_sum(numbers, mean, deviation, 4) - tail)
}

fn trimmed_mean(mut numbers: Vec<f64>, percent: f64) -> NumberResult {
    if numbers.is_empty() || !(0.0..1.0).contains(&percent) {
        return Err(FormulaError::Num);
    }
    // Excel drops floor(n * percent / 2) points from each end.
    let drop = (numbers.len() as f64 * percent / 2.0).floor() as usize;
    numbers.sort_unstable_by(f64::total_cmp);
    let kept = &numbers[drop..numbers.len() - drop];
    Ok(kept.iter().sum::<f64>() / kept.len() as f64)
}

fn percentile_exclusive(mut numbers: Vec<f64>, fraction: f64) -> NumberResult {
    let count = numbers.len() as f64;
    let rank = fraction * (count + 1.0);
    if numbers.is_empty() || !(rank >= 1.0 && rank <= count) {
        return Err(FormulaError::Num);
    }
    numbers.sort_unstable_by(f64::total_cmp);
    let lower = rank.floor() as usize;
    let base = numbers[lower - 1];
    let next = numbers.get(lower).copied().unwrap_or(base);
    Ok(base + (rank - lower as f64) * (next - base))
}

fn percent_rank(mut numbers: Vec<f64>, target: f64, exclusive: bool, significance: i64) -> NumberResult {
    if numbers.is_empty() {
        return Err(FormulaError::Num);
    }
    numbers.sort_unstable_by(f64::total_cmp);
    let (first, last) = (numbers[0], numbers[numbers.len() - 1]);
    if target < first || target > last {
        return Err(FormulaError::Na);
    }
    // Position of the target among the sorted values, interpolated between neighbours.
    let below = numbers.partition_point(|&value| value < target);
    let position = if numbers[below] == target {
        below as f64
    } else {
        let lower = numbers[below - 1];
        (below - 1) as f64 + (target - lower) / (numbers[below] - lower)
    };
    let count = numbers.len() as f64;
    let rank = if exclusive {
        (position + 1.0) / (count + 1.0)
    } else if numbers.len() == 1 {
        1.0
    } else {
        position / (count - 1.0)
    };
    // Excel truncates, not rounds, to the requested significant digits.
    let scale = 10f64.powi(i32::try_from(significance.min(15)).map_err(|_| FormulaError::Num)?);
    Ok((rank * scale + 1e-9).floor() / scale)
}

fn rank_average(numbers: &[f64], target: f64, ascending: bool) -> NumberResult {
    let ties = numbers.iter().filter(|&&value| value == target).count();
    if ties == 0 {
        return Err(FormulaError::Na);
    }
    let before = numbers
        .iter()
        .filter(|&&value| if ascending { value < target } else { value > target })
        .count();
    // Tied values share the average of the ranks they occupy.
    Ok(before as f64 + (ties as f64 + 1.0) / 2.0)
}

/// Least-squares fit of y on x over the pairs where both values are numbers.
struct Fit {
    count: f64,
    mean_x: f64,
    mean_y: f64,
    sxx: f64,
    syy: f64,
    sxy: f64,
}

impl Fit {
    fn from_pairs(xs: &[FuncValue], ys: &[FuncValue]) -> Result<Self, FormulaError> {
        if xs.len() != ys.len() {
            return Err(FormulaError::Na);
        }
        let mut fit = Fit { count: 0.0, mean_x: 0.0, mean_y: 0.0, sxx: 0.0, syy: 0.0, sxy: 0.0 };
        for (x, y) in xs.iter().zip(ys) {
            match (&x.value, &y.value) {
                (Value::Error(error), _) | (_, Value::Error(error)) => return Err(*error),
                (Value::Number(x), Value::Number(y)) if x.is_finite() && y.is_finite() => {
                    fit.count += 1.0;
                    let dx = x - fit.mean_x;
                    let dy = y - fit.mean_y;
                    fit.mean_x += dx / fit.count;
                    fit.mean_y += dy / fit.count;
                    fit.sxx += dx * (x - fit.mean_x);
                    fit.syy += dy * (y - fit.mean_y);
                    fit.sxy += dx * (y - fit.mean_y);
                }
                (Value::Number(_), Value::Number(_)) => return Err(FormulaError::Num),
                _ => {}
            }
        }
        Ok(fit)
    }

    fn slope(&self) -> NumberResult {
        if self.count < 1.0 || self.sxx <= 0.0 {
            return Err(FormulaError::DivZero);
        }
        Ok(self.sxy / self.sxx)
    }

    fn intercept(&self) -> NumberResult {
        Ok(self.mean_y - self.slope()? * self.mean_x)
    }

    fn correlation(&self) -> NumberResult {
        if self.count < 2.0 || self.sxx <= 0.0 || self.syy <= 0.0 {
            return Err(FormulaError::DivZero);
        }
        Ok((self.sxy / (self.sxx * self.syy).sqrt()).clamp(-1.0, 1.0))
    }

    fn standard_error(&self) -> NumberResult {
        if self.count < 3.0 || self.sxx <= 0.0 {
            return Err(FormulaError::DivZero);
        }
        let residual = (self.syy - self.sxy * self.sxy / self.sxx).max(0.0);
        Ok((residual / (self.count - 2.0)).sqrt())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One argument: whether it came from a range, and its values in order.
    type Arg = (bool, Vec<Value>);

    fn array_arg(numbers: &[f64]) -> Arg {
        (true, numbers.iter().copied().map(Value::number).collect())
    }

    fn scalar_arg(number: f64) -> Arg {
        (false, vec![Value::number(number)])
    }

    fn accumulator(args: Vec<Arg>) -> FuncAccumulator {
        let mut values = FuncAccumulator::default();
        for (from_range, argument) in args {
            let cells = argument.len();
            for value in argument {
                if from_range {
                    values.push_range(value).unwrap();
                } else {
                    values.push_scalar(value).unwrap();
                }
            }
            values.finish_arg(cells, 1).unwrap();
        }
        values
    }

    fn number(name: &str, args: Vec<Arg>) -> Value {
        evaluate(name, &accumulator(args))
    }

    fn assert_close(name: &str, args: Vec<Arg>, expected: f64, tolerance: f64) {
        match number(name, args) {
            Value::Number(actual) => {
                assert!((actual - expected).abs() <= tolerance, "{name}: {actual} vs {expected}");
            }
            other => panic!("{name}: expected {expected}, got {other:?}"),
        }
    }

    /// Example tables from each function's Microsoft Support page,
    /// `https://support.microsoft.com/en-us/office/<name>-function-<id>`.
    /// Published results are rounded, so the tolerance is one unit in the last
    /// published digit.
    #[test]
    fn microsoft_published_examples() {
        let skew_data = [3.0, 4.0, 5.0, 2.0, 3.0, 4.0, 5.0, 6.0, 4.0, 7.0];
        assert_close("SKEW", vec![array_arg(&skew_data)], 0.359543, 1e-6);
        assert_close("SKEW.P", vec![array_arg(&skew_data)], 0.303193, 1e-6);
        assert_close("KURT", vec![array_arg(&skew_data)], -0.151799637, 1e-9);
        assert_close("AVEDEV", vec![array_arg(&[4.0, 5.0, 6.0, 7.0, 5.0, 4.0, 3.0])], 1.020408163, 1e-9);
        let devsq = [4.0, 5.0, 8.0, 7.0, 11.0, 4.0, 3.0];
        assert_close("DEVSQ", vec![array_arg(&devsq)], 48.0, 0.0);
        assert_close("HARMEAN", vec![array_arg(&devsq)], 5.028376, 1e-6);
        let trim = [4.0, 5.0, 6.0, 7.0, 2.0, 3.0, 4.0, 5.0, 1.0, 2.0, 3.0];
        assert_close("TRIMMEAN", vec![array_arg(&trim), scalar_arg(0.2)], 3.777777778, 1e-9);

        let ys = [2.0, 3.0, 9.0, 1.0, 8.0, 7.0, 5.0];
        let xs = [6.0, 5.0, 11.0, 7.0, 5.0, 4.0, 4.0];
        assert_close("SLOPE", vec![array_arg(&ys), array_arg(&xs)], 0.305556, 1e-6);
        assert_close("RSQ", vec![array_arg(&ys), array_arg(&xs)], 0.05795, 1e-5);
        assert_close("STEYX", vec![array_arg(&ys), array_arg(&xs)], 3.305719, 1e-6);
        assert_close(
            "INTERCEPT",
            vec![array_arg(&[2.0, 3.0, 9.0, 1.0, 8.0]), array_arg(&[6.0, 5.0, 11.0, 7.0, 5.0])],
            0.0483871,
            1e-7,
        );
        assert_close(
            "PEARSON",
            vec![array_arg(&[9.0, 7.0, 5.0, 3.0, 1.0]), array_arg(&[10.0, 6.0, 1.0, 5.0, 3.0])],
            0.699379,
            1e-6,
        );
        let forecast = vec![
            scalar_arg(30.0),
            array_arg(&[6.0, 7.0, 9.0, 15.0, 21.0]),
            array_arg(&[20.0, 28.0, 31.0, 38.0, 40.0]),
        ];
        assert_close("FORECAST.LINEAR", forecast, 10.607253, 1e-6);

        let exc = [1.0, 2.0, 3.0, 6.0, 6.0, 6.0, 7.0, 8.0, 9.0];
        assert_close("PERCENTILE.EXC", vec![array_arg(&exc), scalar_arg(0.25)], 2.5, 0.0);
        let quartiles = [6.0, 7.0, 15.0, 36.0, 39.0, 40.0, 41.0, 42.0, 43.0, 47.0, 49.0];
        assert_close("QUARTILE.EXC", vec![array_arg(&quartiles), scalar_arg(1.0)], 15.0, 0.0);
        assert_close("QUARTILE.EXC", vec![array_arg(&quartiles), scalar_arg(3.0)], 43.0, 0.0);

        let inc = [13.0, 12.0, 11.0, 8.0, 4.0, 3.0, 2.0, 1.0, 1.0, 1.0];
        for (target, expected) in [(2.0, 0.333), (4.0, 0.555), (8.0, 0.666), (5.0, 0.583)] {
            assert_close("PERCENTRANK.INC", vec![array_arg(&inc), scalar_arg(target)], expected, 0.0);
        }
        assert_close("PERCENTRANK.EXC", vec![array_arg(&exc), scalar_arg(7.0)], 0.7, 0.0);
        assert_close("PERCENTRANK.EXC", vec![array_arg(&exc), scalar_arg(5.43)], 0.381, 0.0);
        assert_close(
            "PERCENTRANK.EXC",
            vec![array_arg(&exc), scalar_arg(5.43), scalar_arg(1.0)],
            0.3,
            0.0,
        );
        let temperatures = [89.0, 88.0, 92.0, 101.0, 94.0, 97.0, 95.0];
        assert_close("RANK.AVG", vec![scalar_arg(94.0), array_arg(&temperatures)], 4.0, 0.0);
    }

    #[test]
    fn ties_rank_at_their_average_position() {
        let values = [1.0, 3.0, 3.0, 5.0];
        // Descending: 5 is first, the two 3s share places 2 and 3.
        assert_close("RANK.AVG", vec![scalar_arg(3.0), array_arg(&values)], 2.5, 0.0);
        assert_close("RANK.AVG", vec![scalar_arg(3.0), array_arg(&values), scalar_arg(1.0)], 2.5, 0.0);
        assert_close("RANK.AVG", vec![scalar_arg(5.0), array_arg(&values), scalar_arg(1.0)], 4.0, 0.0);
    }

    #[test]
    fn domain_and_shape_errors() {
        let short = [1.0, 2.0];
        let cases: Vec<(&str, Vec<Arg>, FormulaError)> = vec![
            ("SKEW", vec![array_arg(&short)], FormulaError::DivZero),
            ("KURT", vec![array_arg(&[1.0, 2.0, 3.0])], FormulaError::DivZero),
            ("SKEW.P", vec![array_arg(&[4.0, 4.0, 4.0])], FormulaError::DivZero),
            ("HARMEAN", vec![array_arg(&[1.0, 0.0])], FormulaError::Num),
            ("TRIMMEAN", vec![array_arg(&short), scalar_arg(1.0)], FormulaError::Num),
            ("PERCENTILE.EXC", vec![array_arg(&[1.0, 2.0, 3.0]), scalar_arg(0.1)], FormulaError::Num),
            ("QUARTILE.EXC", vec![array_arg(&[1.0, 2.0, 3.0]), scalar_arg(4.0)], FormulaError::Num),
            ("PERCENTRANK.INC", vec![array_arg(&short), scalar_arg(9.0)], FormulaError::Na),
            ("PERCENTRANK.INC", vec![array_arg(&short), scalar_arg(1.0), scalar_arg(0.0)], FormulaError::Num),
            ("RANK.AVG", vec![scalar_arg(9.0), array_arg(&short)], FormulaError::Na),
            ("SLOPE", vec![array_arg(&short), array_arg(&[1.0])], FormulaError::Na),
            ("SLOPE", vec![array_arg(&short), array_arg(&[3.0, 3.0])], FormulaError::DivZero),
            ("STEYX", vec![array_arg(&short), array_arg(&[1.0, 2.0])], FormulaError::DivZero),
        ];
        for (name, args, error) in cases {
            assert_eq!(number(name, args), Value::Error(error), "{name}");
        }
    }

    #[test]
    fn regression_skips_pairs_with_non_numbers() {
        let ys: Arg = (true, vec![Value::number(2.0), Value::text("n/a"), Value::number(6.0)]);
        let xs = array_arg(&[1.0, 2.0, 3.0]);
        // Only (1, 2) and (3, 6) remain: slope 2, intercept 0.
        assert_close("SLOPE", vec![ys.clone(), xs.clone()], 2.0, 1e-12);
        assert_close("INTERCEPT", vec![ys, xs], 0.0, 1e-12);
    }

    #[test]
    fn cell_arguments_follow_the_reference_rules() {
        use crate::store::CellStore;
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 4);
        store.set_number(sheet, 0, 0, 3.0, 0);
        store.set_number(sheet, 1, 0, 4.0, 0);
        store.set_string(sheet, 0, 1, "seven", 0);
        // A cell argument is a reference: its text is ignored, like SUM(A1).
        store.set_formula(sheet, 0, 2, "=DEVSQ(A1,A2,B1)", 0);
        // A value typed in the argument list is converted.
        store.set_formula(sheet, 1, 2, "=DEVSQ(3,4,\"5\")", 0);
        store.set_formula(sheet, 2, 2, "=DEVSQ(3,4,\"seven\")", 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 0, 2).num(), 0.5);
        assert_eq!(store.get_cell(sheet, 1, 2).num(), 2.0);
        assert_eq!(store.get_cell(sheet, 2, 2).string().as_deref(), Some("#VALUE!"));
    }
}
