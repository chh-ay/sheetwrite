//! `PERCENTILE.INC`, `CORREL` and `COVARIANCE.S`/`.P` over ranges of dense
//! literal cells, read in place.
//!
//! The accumulator path materialises each range argument as a list of
//! `Value`s before the statistic collects its numbers (a 100,000-row range
//! allocates about 3 MB per argument). When the range arguments hold only
//! dense literals, this kernel reads the numbers from the stored payloads and
//! hands them to the same statistic code ([`percentile`] and
//! [`paired_statistic`]), with the accumulator's reading rules: in a range,
//! text, logical values and blanks are left out, a non-finite number reads as
//! `#NUM!` and text missing from the pool as `#REF!`.

use super::matrix::written_range;
use super::range_reader::{LiteralColumns, RangeReader};
use super::statistics::{
    paired_statistic, percentile, PairedCell, PairedKind, MAX_SELECTION_VALUES,
};

use crate::calc::{Ast, Func};
use crate::cells::{payload_num, payload_str_id};
use crate::store::CellStore;
use crate::types::{
    string_from_pool_ref, EvalResult, FormulaError, StringStorage, Value, KIND_NUMBER, KIND_STRING,
};

#[cfg(test)]
thread_local! {
    /// Calls that took the kernel, so tests can tell it ran.
    static KERNEL_RESULTS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

/// A literal cell as a paired statistic reads it.
#[inline]
fn paired_cell(strings: &StringStorage, kind: u8, payload: u64) -> PairedCell {
    match kind {
        KIND_NUMBER => {
            let number = payload_num(payload);
            if number.is_finite() {
                PairedCell::Number(number)
            } else {
                PairedCell::Error(FormulaError::Num)
            }
        }
        KIND_STRING if string_from_pool_ref(strings, payload_str_id(payload)).is_none() => {
            PairedCell::Error(FormulaError::Ref)
        }
        _ => PairedCell::Skipped,
    }
}

/// The cells of `range` in row-major order, as a paired statistic reads them.
fn paired_cells<'a>(
    strings: &'a StringStorage,
    range: &'a LiteralColumns<'a>,
) -> impl Iterator<Item = PairedCell> + 'a {
    (0..range.rows).flat_map(move |row| {
        range
            .columns
            .iter()
            .map(move |&(kinds, payloads)| paired_cell(strings, kinds[row], payloads[row]))
    })
}

impl CellStore {
    /// The dense literal cells of the range `arg`, or `None` when it is not a
    /// range of them. Only an argument written as a range qualifies: these
    /// functions read a lone cell as a scalar, whose numeric text counts.
    fn literal_range_argument(
        &self,
        arg: &Ast,
        sheet: usize,
        depth: usize,
    ) -> Option<LiteralColumns<'_>> {
        RangeReader::new(self, written_range(arg, sheet)?, depth)
            .ok()?
            .literal_columns()
    }

    /// `PERCENTILE.INC` with a number literal as its fraction, or `CORREL`
    /// and `COVARIANCE.S`/`.P`, when their ranges hold only dense literals.
    /// `None` keeps the accumulator path, which also checks the arguments.
    ///
    /// Out of line, and named `*_family`, so its loops stay out of `eval_ast`.
    #[inline(never)]
    pub(super) fn literal_statistics_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        depth: usize,
    ) -> Option<EvalResult> {
        let result = match (func, args) {
            (Func::PercentileInc, [values, Ast::Num(fraction)]) => {
                let range = self.literal_range_argument(values, sheet, depth)?;
                self.literal_percentile(&range, *fraction)
            }
            (_, [left_ast, right_ast]) => {
                let kind = PairedKind::of(func)?;
                let left = self.literal_range_argument(left_ast, sheet, depth)?;
                let right = self.literal_range_argument(right_ast, sheet, depth)?;
                if left.rows * left.columns.len() != right.rows * right.columns.len() {
                    return None;
                }
                let pairs =
                    paired_cells(&self.strings, &left).zip(paired_cells(&self.strings, &right));
                paired_statistic(pairs, kind)
            }
            _ => return None,
        };

        #[cfg(test)]
        KERNEL_RESULTS.with(|calls| calls.set(calls.get() + 1));

        Some(result.map_or_else(Value::Error, Value::number))
    }

    /// The numbers of `range` in row-major order, then their percentile.
    fn literal_percentile(
        &self,
        range: &LiteralColumns<'_>,
        fraction: f64,
    ) -> Result<f64, FormulaError> {
        let cells = range.rows * range.columns.len();
        if cells > MAX_SELECTION_VALUES {
            return Err(FormulaError::Num);
        }

        let mut numbers = Vec::new();
        numbers
            .try_reserve_exact(cells)
            .map_err(|_| FormulaError::Num)?;
        for row in 0..range.rows {
            for &(kinds, payloads) in &range.columns {
                match paired_cell(&self.strings, kinds[row], payloads[row]) {
                    PairedCell::Number(number) => numbers.push(number),
                    PairedCell::Error(error) => return Err(error),
                    PairedCell::Skipped => {}
                }
            }
        }

        percentile(numbers, fraction)
    }
}

#[cfg(test)]
mod tests {
    use super::KERNEL_RESULTS;

    use crate::eval::range_reader::LITERAL_COLUMNS_OFF;
    use crate::store::CellStore;

    const ROWS: usize = 30;

    /// Columns A–D mixing numbers, text, booleans and blanks; C also holds a
    /// non-finite number.
    fn mixed_store() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(10, ROWS + 2);
        for row in 0..ROWS {
            for col in 0..4 {
                match (row * 3 + col * 5) % 7 {
                    0 => store.set_string(sheet, row, col, ["4", "x", ""][(row + col) % 3], 0),
                    1 => store.set_bool(sheet, row, col, row % 2 == 0, 0),
                    2 => {}
                    _ => store.set_number(
                        sheet,
                        row,
                        col,
                        (row as f64).mul_add(1.75, -(col as f64) * 3.5),
                        0,
                    ),
                }
            }
        }
        store.set_number(sheet, 20, 2, f64::INFINITY, 0);
        (store, sheet)
    }

    fn formulas() -> Vec<String> {
        let last = ROWS;
        vec![
            format!("=PERCENTILE.INC(A1:A{last},0.9)"),
            format!("=PERCENTILE.INC(A1:B{last},0)"),
            format!("=PERCENTILE.INC(B1:B{last},1)"),
            format!("=PERCENTILE.INC(B1:D{last},0.37)"),
            format!("=PERCENTILE.INC(A1:A{last},1.5)"),
            format!("=PERCENTILE.INC(F1:F{last},0.5)"),
            format!("=COVARIANCE.P(A1:A{last},B1:B{last})"),
            format!("=COVARIANCE.S(A1:A{last},D1:D{last})"),
            format!("=CORREL(B1:B{last},D1:D{last})"),
            format!("=COVARIANCE.P(A1:B15,D1:D{last})"),
            format!("=COVARIANCE.P(B1:B{last},C1:C{last})"),
            format!("=CORREL(F1:F{last},F1:F{last})"),
            "=COVARIANCE.P(A1:A10,B1:B12)".to_owned(),
            // A lone cell is a scalar argument: its numeric text counts.
            "=PERCENTILE.INC(A1,0.5)".to_owned(),
            "=COVARIANCE.P(A1,B1)".to_owned(),
        ]
    }

    /// Each formula's result, as kind, number bits and text.
    fn results(literal_columns: bool) -> Vec<(u8, u64, Option<String>)> {
        LITERAL_COLUMNS_OFF.with(|off| off.set(!literal_columns));
        let (mut store, sheet) = mixed_store();
        let sources = formulas();
        for (row, source) in sources.iter().enumerate() {
            store.set_formula(sheet, row, 7, source, 0);
        }
        store.recompute(sheet);
        LITERAL_COLUMNS_OFF.with(|off| off.set(false));

        (0..sources.len())
            .map(|row| {
                let cell = store.get_cell(sheet, row, 7);
                (cell.kind(), cell.num().to_bits(), cell.string())
            })
            .collect()
    }

    #[test]
    fn literal_statistics_match_the_accumulator_path() {
        let accumulated = results(false);

        KERNEL_RESULTS.with(|calls| calls.set(0));
        let scanned = results(true);

        // Every formula but the one with different cell counts and the two
        // with lone cells takes the kernel.
        assert_eq!(
            KERNEL_RESULTS.with(std::cell::Cell::get),
            formulas().len() - 3
        );
        for ((source, accumulated), scanned) in formulas().iter().zip(&accumulated).zip(&scanned) {
            assert_eq!(accumulated, scanned, "{source}");
        }
    }
}
