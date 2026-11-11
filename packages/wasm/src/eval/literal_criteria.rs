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

use crate::calc::CmpOp;
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

/// How a criterion answers a finite number cell: one comparison, or the same
/// answer for every number (text, boolean and pattern criteria).
#[derive(Clone, Copy)]
enum NumberTest {
    Compare(CmpOp, f64),
    Always(bool),
}

/// A criterion with its answers, decided once per call, for the cells that
/// need no text comparison: numbers, blanks, booleans, non-finite numbers
/// (which read as `#NUM!`) and text missing from the pool (`#REF!`).
struct CellTest<'c> {
    criterion: &'c Criterion,
    number: NumberTest,
    blank: bool,
    when_true: bool,
    when_false: bool,
    non_finite: bool,
    missing_text: bool,
}

impl<'c> CellTest<'c> {
    fn new(criterion: &'c Criterion) -> Self {
        // Any finite number answers like `matches_number` when there is no
        // comparison; zero is one.
        let number = criterion.number_comparison().map_or(
            NumberTest::Always(criterion.matches_number(0.0)),
            |(op, operand)| NumberTest::Compare(op, operand),
        );

        Self {
            criterion,
            number,
            blank: criterion.matches(&Value::Blank),
            when_true: criterion.matches(&Value::Bool(true)),
            when_false: criterion.matches(&Value::Bool(false)),
            non_finite: criterion.matches(&Value::Error(FormulaError::Num)),
            missing_text: criterion.matches(&Value::Error(FormulaError::Ref)),
        }
    }

    /// Whether the literal cell `(kind, payload)` matches, as
    /// `Criterion::matches` would on the cell's value. The float operators
    /// answer as the `partial_cmp` ordering `Criterion::matches` uses.
    #[inline]
    fn matches(&self, strings: &StringStorage, kind: u8, payload: u64) -> bool {
        match kind {
            KIND_NUMBER => {
                let number = payload_num(payload);
                if !number.is_finite() {
                    return self.non_finite;
                }
                match self.number {
                    NumberTest::Compare(CmpOp::Eq, operand) => number == operand,
                    NumberTest::Compare(CmpOp::Ne, operand) => number != operand,
                    NumberTest::Compare(CmpOp::Lt, operand) => number < operand,
                    NumberTest::Compare(CmpOp::Le, operand) => number <= operand,
                    NumberTest::Compare(CmpOp::Gt, operand) => number > operand,
                    NumberTest::Compare(CmpOp::Ge, operand) => number >= operand,
                    NumberTest::Always(answer) => answer,
                }
            }
            KIND_STRING => string_from_pool_ref(strings, payload_str_id(payload))
                .map_or(self.missing_text, |text| self.criterion.matches_text(text)),
            KIND_BOOL if payload_num(payload) != 0.0 => self.when_true,
            KIND_BOOL => self.when_false,
            _ => self.blank,
        }
    }

    /// The answers for a finite number below, equal to and above the
    /// criterion's operand; with no comparison all three are the same answer
    /// and the operand is unused.
    fn number_answers(&self) -> (f64, [bool; 3]) {
        match self.number {
            NumberTest::Compare(op, operand) => {
                let answers = match op {
                    CmpOp::Eq => [false, true, false],
                    CmpOp::Ne => [true, false, true],
                    CmpOp::Lt => [true, false, false],
                    CmpOp::Le => [true, true, false],
                    CmpOp::Gt => [false, false, true],
                    CmpOp::Ge => [false, true, true],
                };
                (operand, answers)
            }
            NumberTest::Always(answer) => (0.0, [answer; 3]),
        }
    }

    /// Matches one column into `mask`, one bit per row. The first criterion
    /// writes every word; later ones clear the bits of rows they reject and
    /// skip words with no row left. A finite number against a finite operand
    /// is below, equal to or above it, so its answer is one select of three,
    /// without a branch per comparison operator. A text cell's answer depends
    /// only on its pool id, and a column usually repeats a few values, so the
    /// answers for the last two ids seen are reused for this column only.
    fn mask_column(
        &self,
        strings: &StringStorage,
        (kinds, payloads): LiteralColumn<'_>,
        mask: &mut [u64],
        first: bool,
    ) {
        let (operand, [below, equal, above]) = self.number_answers();
        let mut texts: [Option<(u32, bool)>; 2] = [None; 2];
        let mut next_text = 0;
        let chunks = kinds.chunks(MASK_ROWS).zip(payloads.chunks(MASK_ROWS));
        for (word, (kinds, payloads)) in mask.iter_mut().zip(chunks) {
            if !first && *word == 0 {
                continue;
            }

            let mut bits = 0;
            for (bit, (&kind, &payload)) in kinds.iter().zip(payloads).enumerate() {
                let number = payload_num(payload);
                let matched = if kind == KIND_NUMBER && number.is_finite() {
                    (number < operand && below)
                        | (number == operand && equal)
                        | (number > operand && above)
                } else if kind == KIND_STRING {
                    let id = payload_str_id(payload);
                    let known = texts.iter().flatten().find(|&&(text, _)| text == id);
                    if let Some(&(_, answer)) = known {
                        answer
                    } else {
                        let answer = self.matches(strings, kind, payload);
                        texts[next_text] = Some((id, answer));
                        next_text ^= 1;
                        answer
                    }
                } else {
                    self.matches(strings, kind, payload)
                };
                bits |= u64::from(matched) << bit;
            }

            *word = if first { bits } else { *word & bits };
        }
    }
}

/// Rows per word of a match mask.
const MASK_ROWS: usize = u64::BITS as usize;

/// One column of a literal range: kind bytes and payloads, row by row.
type LiteralColumn<'a> = (&'a [u8], &'a [u64]);

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

        // One column per range is the common shape: match whole columns into
        // a row mask, then fold the matched rows in row order, as below.
        if cols == 1 {
            let columns: Option<Vec<_>> = tests
                .iter()
                .map(|(range, test)| Some((column_rows(range, rows)?, test)))
                .collect();
            let values = values.map(|values| column_rows(values, rows));
            if let (Some(columns), None | Some(Some(_))) = (columns, values) {
                return self.literal_criteria_column_family(fold, values.flatten(), &columns, rows);
            }
        }

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

    /// [`Self::literal_criteria_family`] for single-column ranges: each
    /// criterion masks its whole column, and the fold reads only the matched
    /// rows, lowest first, so sums add in the same order.
    #[inline(never)]
    fn literal_criteria_column_family(
        &self,
        fold: CriteriaFold,
        values: Option<LiteralColumn<'_>>,
        criteria: &[(LiteralColumn<'_>, &CellTest<'_>)],
        rows: usize,
    ) -> EvalResult {
        let strings = &self.strings;
        let words = rows.div_ceil(MASK_ROWS);
        let mut mask = Vec::new();
        if mask.try_reserve_exact(words).is_err() {
            return Value::Error(FormulaError::Num);
        }
        mask.resize(words, 0);

        for (index, &(column, test)) in criteria.iter().enumerate() {
            test.mask_column(strings, column, &mut mask, index == 0);
        }

        if matches!(fold, CriteriaFold::Count) {
            let count: u64 = mask.iter().map(|word| u64::from(word.count_ones())).sum();
            return Value::number(count as f64);
        }

        let mut sums = IfSum::new();
        let mut extremes = IfExtreme::new(matches!(fold, CriteriaFold::Extreme { maximum: true }));
        for (word, &bits) in mask.iter().enumerate() {
            let mut bits = bits;
            while bits != 0 {
                let row = word * MASK_ROWS + bits.trailing_zeros() as usize;
                bits &= bits - 1;

                let Some((kinds, payloads)) = values else {
                    return Value::Error(FormulaError::Value);
                };
                let (kind, payload) = (kinds[row], payloads[row]);
                let number = payload_num(payload);
                let folded = match fold {
                    CriteriaFold::Sum { .. } if kind == KIND_NUMBER && number.is_finite() => {
                        sums.add_number(number);
                        Ok(())
                    }
                    CriteriaFold::Sum { .. } => sums.add(&folded_value(strings, kind, payload)),
                    _ => extremes.add(&folded_value(strings, kind, payload)),
                };

                if let Err(error) = folded {
                    return Value::Error(error);
                }
            }
        }

        match fold {
            CriteriaFold::Sum { average } => sums.finish(average),
            _ => extremes.finish(),
        }
    }
}

/// The first column of `columns` cut to `rows` rows, when it has them.
fn column_rows<'a>(columns: &LiteralColumns<'a>, rows: usize) -> Option<LiteralColumn<'a>> {
    let &(kinds, payloads) = columns.columns.first()?;
    Some((kinds.get(..rows)?, payloads.get(..rows)?))
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

    /// Columns longer than one mask word, where later criteria skip words
    /// the first one emptied, give the cell-by-cell walk's results.
    #[test]
    fn long_columns_match_the_cell_by_cell_walk() {
        const LONG: usize = 300;
        let sources = [
            format!("=COUNTIF(A1:A{LONG},\">=150\")"),
            format!("=COUNTIFS(A1:A{LONG},\"<64\",B1:B{LONG},\"<>b\")"),
            format!("=SUMIFS(C1:C{LONG},A1:A{LONG},\">200\",B1:B{LONG},\"a*\")"),
            format!("=SUMIF(A1:A{LONG},\"<>7\",C1:C{LONG})"),
            format!("=AVERAGEIFS(C1:C{LONG},A1:A{LONG},\">=0\",B1:B{LONG},TRUE)"),
            format!("=MAXIFS(C1:C{LONG},A1:A{LONG},\"<128\")"),
            format!("=MINIFS(C1:C{LONG},B1:B{LONG},\"\")"),
        ];
        let results = |literal_columns: bool| {
            LITERAL_COLUMNS_OFF.with(|off| off.set(!literal_columns));
            let mut store = CellStore::new();
            let sheet = store.add_sheet(4, LONG);
            for row in 0..LONG {
                store.set_number(sheet, row, 0, row as f64, 0);
                match row % 5 {
                    0 => store.set_string(sheet, row, 1, "abc", 0),
                    1 => store.set_string(sheet, row, 1, "b", 0),
                    2 => store.set_bool(sheet, row, 1, row % 2 == 0, 0),
                    3 => {}
                    _ => store.set_number(sheet, row, 1, 1.0, 0),
                }
                if row % 7 != 0 {
                    store.set_number(sheet, row, 2, (row % 13) as f64 * 0.1, 0);
                }
            }
            for (index, source) in sources.iter().enumerate() {
                store.set_formula(sheet, index, 3, source, 0);
            }
            store.recompute(sheet);
            LITERAL_COLUMNS_OFF.with(|off| off.set(false));
            (0..sources.len())
                .map(|index| {
                    let cell = store.get_cell(sheet, index, 3);
                    (cell.kind(), cell.num().to_bits(), cell.string())
                })
                .collect::<Vec<_>>()
        };

        let walked = results(false);
        let scanned = results(true);
        for ((source, walked), scanned) in sources.iter().zip(&walked).zip(&scanned) {
            assert_eq!(walked, scanned, "{source}");
        }
    }
}
