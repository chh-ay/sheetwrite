//! Criteria functions over ranges of dense literal cells, read in place.
//!
//! The cell-by-cell walk (`RangeReader::next_allow_errors`) builds a `Value`
//! for every cell, with a fresh string for every text cell. When every range
//! of a `COUNTIF`, `COUNTIFS`, `SUMIF(S)`, `AVERAGEIF(S)`, `MAXIFS` or
//! `MINIFS` call holds only literals on dense storage, this kernel reads each
//! cell's kind byte and payload instead. It gives the walk's results: cells
//! are matched with [`Criterion::matches_number`] and
//! [`Criterion::matches_text`], other kinds with [`Criterion::matches`] once
//! per call, and rows are visited in the same row-major order, so sums add in
//! the same order.

use super::criteria::{Criterion, IfExtreme, IfSum};
use super::range_reader::LiteralColumns;

use crate::cells::{payload_num, payload_str_id};
use crate::store::CellStore;
use crate::types::{
    string_from_pool_ref, EvalResult, FormulaError, StringStorage, Value, KIND_BOOL, KIND_NUMBER,
    KIND_STRING,
};

#[cfg(test)]
thread_local! {
    /// Calls of the kernel, so tests can tell it ran.
    static KERNEL_CALLS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

/// What a criteria call computes from the cells whose criteria all match.
#[derive(Clone, Copy)]
pub(super) enum CriteriaFold {
    /// `COUNTIF` and `COUNTIFS`.
    Count,
    /// `SUMIF(S)`, or `AVERAGEIF(S)` when `average` is set.
    Sum { average: bool },
    /// `MAXIFS`, or `MINIFS` when `maximum` is unset.
    Extreme { maximum: bool },
}

/// A criterion with its answers, decided once per call, for the cells that
/// need no comparison: blanks, booleans, non-finite numbers (which read as
/// `#NUM!`) and text missing from the pool (which reads as `#REF!`).
struct CellTest<'c> {
    criterion: &'c Criterion,
    blank: bool,
    when_true: bool,
    when_false: bool,
    non_finite: bool,
    missing_text: bool,
}

impl<'c> CellTest<'c> {
    fn new(criterion: &'c Criterion) -> Self {
        Self {
            criterion,
            blank: criterion.matches(&Value::Blank),
            when_true: criterion.matches(&Value::Bool(true)),
            when_false: criterion.matches(&Value::Bool(false)),
            non_finite: criterion.matches(&Value::Error(FormulaError::Num)),
            missing_text: criterion.matches(&Value::Error(FormulaError::Ref)),
        }
    }

    /// Whether the literal cell `(kind, payload)` matches, as
    /// `Criterion::matches` would on the cell's value.
    #[inline]
    fn matches(&self, strings: &StringStorage, kind: u8, payload: u64) -> bool {
        match kind {
            KIND_NUMBER => {
                let number = payload_num(payload);
                if number.is_finite() {
                    self.criterion.matches_number(number)
                } else {
                    self.non_finite
                }
            }
            KIND_STRING => string_from_pool_ref(strings, payload_str_id(payload))
                .map_or(self.missing_text, |text| self.criterion.matches_text(text)),
            KIND_BOOL if payload_num(payload) != 0.0 => self.when_true,
            KIND_BOOL => self.when_false,
            _ => self.blank,
        }
    }
}

/// The value the sum and extreme folds see for a literal cell. They skip
/// text, so a text cell reads as blank instead of copying its string.
#[inline]
fn folded_value(strings: &StringStorage, kind: u8, payload: u64) -> Value {
    match kind {
        KIND_NUMBER => Value::number(payload_num(payload)),
        KIND_STRING => match string_from_pool_ref(strings, payload_str_id(payload)) {
            Some(_) => Value::Blank,
            None => Value::Error(FormulaError::Ref),
        },
        KIND_BOOL => Value::Bool(payload_num(payload) != 0.0),
        _ => Value::Blank,
    }
}

impl CellStore {
    /// Folds the cells of `values` (or counts the rows, for `Count`) where
    /// every criteria range's cell matches its criterion. All ranges have the
    /// shape the caller checked.
    ///
    /// Out of line, and named `*_family`, so its loops stay out of `eval_ast`.
    #[inline(never)]
    pub(super) fn literal_criteria_family(
        &self,
        fold: CriteriaFold,
        values: Option<&LiteralColumns<'_>>,
        criteria: &[(LiteralColumns<'_>, &Criterion)],
    ) -> EvalResult {
        let Some((first, _)) = criteria.first() else {
            return Value::Error(FormulaError::Value);
        };
        let rows = first.rows;
        let cols = first.columns.len();
        #[cfg(test)]
        KERNEL_CALLS.with(|calls| calls.set(calls.get() + 1));

        let strings = &self.strings;

        let mut tests = Vec::new();
        if tests.try_reserve_exact(criteria.len()).is_err() {
            return Value::Error(FormulaError::Num);
        }
        tests.extend(
            criteria
                .iter()
                .map(|(range, criterion)| (range, CellTest::new(criterion))),
        );

        let mut count = 0.0;
        let mut sums = IfSum::new();
        let mut extremes = IfExtreme::new(matches!(fold, CriteriaFold::Extreme { maximum: true }));

        for row in 0..rows {
            for col in 0..cols {
                let matched = tests.iter().all(|(range, test)| {
                    let (kinds, payloads) = range.columns[col];
                    test.matches(strings, kinds[row], payloads[row])
                });

                if !matched {
                    continue;
                }

                let folded = match (fold, values) {
                    (CriteriaFold::Count, _) => {
                        count += 1.0;
                        Ok(())
                    }
                    (_, None) => Err(FormulaError::Value),
                    (CriteriaFold::Sum { .. }, Some(values)) => {
                        let (kinds, payloads) = values.columns[col];
                        sums.add(&folded_value(strings, kinds[row], payloads[row]))
                    }
                    (CriteriaFold::Extreme { .. }, Some(values)) => {
                        let (kinds, payloads) = values.columns[col];
                        extremes.add(&folded_value(strings, kinds[row], payloads[row]))
                    }
                };

                if let Err(error) = folded {
                    return Value::Error(error);
                }
            }
        }

        match fold {
            CriteriaFold::Count => Value::number(count),
            CriteriaFold::Sum { average } => sums.finish(average),
            CriteriaFold::Extreme { .. } => extremes.finish(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::KERNEL_CALLS;

    use crate::eval::range_reader::LITERAL_COLUMNS_OFF;
    use crate::store::CellStore;

    const ROWS: usize = 24;

    /// Criteria of every kind the parser produces: comparisons against
    /// numbers, text and booleans, blanks, wildcards and numeric text.
    const CRITERIA: &[&str] = &[
        "\">5\"",
        "\"<=0\"",
        "\"=\"",
        "\"<>\"",
        "\"\"",
        "\"abc\"",
        "\"ABC\"",
        "\"a*\"",
        "\"<>a*\"",
        "\"?b?\"",
        "\">b\"",
        "\"<B\"",
        "\"TRUE\"",
        "\"<>FALSE\"",
        "\"10\"",
        "\"=10\"",
        "\"<>10\"",
        "\">=2.5\"",
        "\"#REF!\"",
        "5",
        "TRUE",
        "FALSE",
        "Z1",
        "\"~*\"",
        "\" abc \"",
    ];

    /// A sheet whose columns A–E mix numbers, text, booleans, blanks and a
    /// non-finite number, which reads as `#NUM!`.
    fn mixed_store() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(26, ROWS + 4);
        let texts = [
            "abc", "ABC", "a*", "Abd", "b", "", "10", "xbx", "#REF!", "*", "B",
        ];

        for row in 0..ROWS {
            for col in 0..5 {
                match (row * 7 + col * 3) % 6 {
                    0 => store.set_number(sheet, row, col, row as f64 - 4.5 + col as f64, 0),
                    1 => store.set_string(sheet, row, col, texts[(row + col) % texts.len()], 0),
                    2 => store.set_bool(sheet, row, col, (row + col) % 2 == 0, 0),
                    3 => store.set_number(sheet, row, col, ((row * 3 + col) % 12) as f64, 0),
                    4 => {}
                    _ => store.set_number(sheet, row, col, 10.0, 0),
                }
            }
        }

        store.set_number(sheet, 3, 1, f64::INFINITY, 0);
        (store, sheet)
    }

    fn formulas() -> Vec<String> {
        let last = ROWS;
        let mut sources = Vec::new();

        for criterion in CRITERIA {
            sources.push(format!("=COUNTIF(A1:A{last},{criterion})"));
            sources.push(format!("=COUNTIF(A1:C{last},{criterion})"));
            sources.push(format!("=SUMIF(A1:A{last},{criterion},C1:C{last})"));
            sources.push(format!("=SUMIF(A1:B{last},{criterion},C1)"));
            sources.push(format!("=AVERAGEIF(B1:B{last},{criterion},C1:C{last})"));
            sources.push(format!(
                "=COUNTIFS(A1:A{last},{criterion},D1:D{last},\"<>b\")"
            ));
            sources.push(format!(
                "=SUMIFS(C1:C{last},A1:A{last},{criterion},E1:E{last},\">0\")"
            ));
            sources.push(format!("=SUMIFS(B1:B{last},A1:A{last},{criterion})"));
            sources.push(format!("=AVERAGEIFS(C1:D{last},A1:B{last},{criterion})"));
            sources.push(format!("=MAXIFS(E1:E{last},D1:D{last},{criterion})"));
            sources.push(format!(
                "=MINIFS(B1:B{last},A1:A{last},{criterion},C1:C{last},\"<>\")"
            ));
        }

        sources
    }

    /// Each formula's result, as kind, number and text.
    fn results(literal_columns: bool) -> Vec<(u8, u64, Option<String>)> {
        LITERAL_COLUMNS_OFF.with(|off| off.set(!literal_columns));
        let (mut store, sheet) = mixed_store();
        let sources = formulas();

        for (index, source) in sources.iter().enumerate() {
            store.set_formula(sheet, index % ROWS, 6 + index / ROWS, source, 0);
        }
        store.recompute(sheet);
        LITERAL_COLUMNS_OFF.with(|off| off.set(false));

        (0..sources.len())
            .map(|index| {
                let cell = store.get_cell(sheet, index % ROWS, 6 + index / ROWS);
                (cell.kind(), cell.num().to_bits(), cell.string())
            })
            .collect()
    }

    #[test]
    fn literal_criteria_match_the_cell_by_cell_walk() {
        let walked = results(false);

        KERNEL_CALLS.with(|calls| calls.set(0));
        let scanned = results(true);
        let kernel_calls = KERNEL_CALLS.with(std::cell::Cell::get);

        assert_eq!(
            kernel_calls,
            scanned.len(),
            "every formula takes the literal kernel"
        );
        for ((source, walked), scanned) in formulas().iter().zip(&walked).zip(&scanned) {
            assert_eq!(walked, scanned, "{source}");
        }
    }

    #[test]
    fn formula_cells_in_a_range_keep_the_cell_by_cell_walk() {
        let (mut store, sheet) = mixed_store();
        store.set_formula(sheet, 0, 0, "=1+1", 0);
        store.set_formula(sheet, 0, 6, &format!("=COUNTIF(A1:A{ROWS},\">1\")"), 0);

        KERNEL_CALLS.with(|calls| calls.set(0));
        store.recompute(sheet);

        assert_eq!(KERNEL_CALLS.with(std::cell::Cell::get), 0);
    }
}
