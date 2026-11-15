//! `SUMPRODUCT` over ranges of dense literal cells, read in place.
//!
//! The accumulator path materialises every argument as a list of `Value`s
//! (two 100,000-row ranges allocate about 10 MB) and then multiplies them.
//! When every argument is written as a range (`A1:A9`, not a lone cell, whose
//! text the accumulator coerces) of dense literals with one shape, this
//! kernel multiplies the stored payloads directly. It follows the accumulator
//! path's rules: text, booleans and blanks in a range count as zero, a
//! non-finite number reads as `#NUM!`, text missing from the pool as `#REF!`,
//! and the first error in item order, or the first non-finite product or
//! running total, decides the result. Items are visited in the same row-major
//! order, so the total is the same.

use super::matrix::written_range;
use super::preview_limits::RangeRead;
use super::range_view::{LiteralColumns, RangeView};

use crate::calc::Ast;
use crate::cells::{payload_num, payload_str_id};
use crate::store::CellStore;
use crate::types::{
    string_from_pool_ref, EvalResult, FormulaError, Value, KIND_EMPTY, KIND_NUMBER, KIND_STRING,
};

#[cfg(test)]
thread_local! {
    /// Calls that took the kernel, so tests can tell it ran.
    static KERNEL_RESULTS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

impl CellStore {
    /// `SUMPRODUCT` of `args` when each one is a range of dense literals and
    /// all have one shape. `None` keeps the accumulator path, which also
    /// reports shape and reference errors.
    ///
    /// Out of line, and named `*_family`, so its loops stay out of `eval_ast`.
    #[inline(never)]
    pub(super) fn sum_product_range_family(
        &self,
        args: &[Ast],
        sheet: usize,
        depth: usize,
    ) -> Option<EvalResult> {
        let mut ranges: Vec<LiteralColumns<'_>> = Vec::new();
        ranges.try_reserve_exact(args.len()).ok()?;
        let mut shape = None;

        for arg in args {
            let reader = RangeView::clipped(self, written_range(arg, sheet)?, depth).ok()?;
            let (rows, cols) = reader.shape();
            if (rows as u64).saturating_mul(cols as u64) > crate::types::RANGE_CELL_LIMIT {
                return None;
            }
            reader.charge_preview(RangeRead::Typed).ok()?;
            if *shape.get_or_insert(reader.shape()) != reader.shape() {
                return None;
            }
            ranges.push(reader.literal_columns()?);
        }

        let (rows, cols) = shape?;

        #[cfg(test)]
        KERNEL_RESULTS.with(|calls| calls.set(calls.get() + 1));

        // Single columns of numbers and blanks go to `number_columns_total`.
        // Its only errors are a non-finite input, product or total, and each of
        // them leaves the total non-finite (an infinity stays infinite or
        // turns into NaN), which `Value::number` reads as `#NUM!`.
        if cols == 1 {
            if let Some(total) = number_columns_total(&ranges, rows) {
                return Some(Value::number(total));
            }
        }

        let mut total = 0.0;
        for row in 0..rows {
            for col in 0..cols {
                let mut product = 1.0;
                for range in &ranges {
                    let (kinds, payloads) = range.columns[col];
                    let factor = match kinds[row] {
                        KIND_NUMBER => {
                            let number = payload_num(payloads[row]);
                            if !number.is_finite() {
                                return Some(Value::Error(FormulaError::Num));
                            }
                            number
                        }
                        KIND_STRING
                            if string_from_pool_ref(
                                &self.strings,
                                payload_str_id(payloads[row]),
                            )
                            .is_none() =>
                        {
                            return Some(Value::Error(FormulaError::Ref));
                        }
                        _ => 0.0,
                    };
                    product *= factor;
                    if !product.is_finite() {
                        return Some(Value::Error(FormulaError::Num));
                    }
                }
                total += product;
                if !total.is_finite() {
                    return Some(Value::Error(FormulaError::Num));
                }
            }
        }

        Some(Value::number(total))
    }
}

// The slice loop tells empty and number kinds apart from the rest by their
// bits alone.
const _: () = assert!(
    KIND_EMPTY == 0 && KIND_NUMBER == 1,
    "the slice loop tells empty and number kinds apart by their bits"
);

/// The `SUMPRODUCT` total of single columns that hold only numbers and
/// blanks, a blank counting as zero, with the products and the running total
/// in the item loop's order. `None` when a column holds anything else.
#[inline(never)]
fn number_columns_total(ranges: &[LiteralColumns<'_>], rows: usize) -> Option<f64> {
    let mut columns = Vec::new();
    columns.try_reserve_exact(ranges.len()).ok()?;
    for range in ranges {
        let &(column_kinds, column_payloads) = range.columns.first()?;
        let kinds = column_kinds.get(..rows)?;
        let payloads = column_payloads.get(..rows)?;
        if kinds.iter().fold(0, |any, &kind| any | kind) & !KIND_NUMBER != 0 {
            return None;
        }
        columns.push((kinds, payloads));
    }

    let factor = |kind: u8, payload: u64| {
        if kind == KIND_NUMBER {
            payload_num(payload)
        } else {
            0.0
        }
    };
    let mut total = 0.0;

    // Two ranges are the common call; zipped slices need no index checks.
    // `1.0 * a * b` rounds as `a * b`, so the product matches the item loop.
    if let [(left_kinds, left_payloads), (right_kinds, right_payloads)] = columns[..] {
        let left = left_kinds.iter().zip(left_payloads);
        let right = right_kinds.iter().zip(right_payloads);
        for ((&left_kind, &left), (&right_kind, &right)) in left.zip(right) {
            total += factor(left_kind, left) * factor(right_kind, right);
        }
        return Some(total);
    }

    for row in 0..rows {
        let mut product = 1.0;
        for &(kinds, payloads) in &columns {
            product *= factor(kinds[row], payloads[row]);
        }
        total += product;
    }
    Some(total)
}

#[cfg(test)]
mod tests {
    use super::KERNEL_RESULTS;

    use crate::eval::range_reader::LITERAL_COLUMNS_OFF;
    use crate::store::CellStore;

    const ROWS: usize = 40;

    /// Columns A–F mixing numbers, text, booleans and blanks; B also holds a
    /// non-finite number and F numbers large enough to overflow a product.
    /// G and H hold only numbers and blanks, with a non-finite number in H's
    /// last rows.
    fn mixed_store() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(12, ROWS + 2);
        for row in 0..ROWS {
            for col in 0..5 {
                match (row * 5 + col * 3) % 5 {
                    0 => store.set_string(sheet, row, col, ["7", "x", ""][(row + col) % 3], 0),
                    1 => store.set_bool(sheet, row, col, row % 2 == 0, 0),
                    2 => {}
                    _ => store.set_number(
                        sheet,
                        row,
                        col,
                        (row as f64 - 11.5) * (col as f64 + 0.25),
                        0,
                    ),
                }
            }
            store.set_number(sheet, row, 5, 1e200, 0);
            if row % 4 != 1 {
                store.set_number(sheet, row, 6, row as f64 * 0.3 - 2.0, 0);
            }
            if row % 3 != 2 {
                store.set_number(sheet, row, 7, 1.0 / (row as f64 + 1.5), 0);
            }
        }
        store.set_number(sheet, 17, 1, f64::NAN, 0);
        store.set_number(sheet, ROWS - 3, 7, f64::INFINITY, 0);
        (store, sheet)
    }

    fn formulas() -> Vec<String> {
        let last = ROWS;
        let half = ROWS / 2;
        vec![
            format!("=SUMPRODUCT(A1:A{last})"),
            format!("=SUMPRODUCT(A1:A{last},C1:C{last})"),
            format!("=SUMPRODUCT(A1:A{half},C1:C{half},D1:D{half})"),
            format!("=SUMPRODUCT(A1:B{last},C1:D{last})"),
            format!("=SUMPRODUCT(A1:A{last},B1:B{last})"),
            format!("=SUMPRODUCT(B1:B{half},C1:C{half})"),
            format!("=SUMPRODUCT(F1:F{last},F1:F{last})"),
            format!("=SUMPRODUCT(D1:E{last})"),
            format!("=SUMPRODUCT(A1:A{last},C1:C{half})"),
            // Number-only columns.
            format!("=SUMPRODUCT(G1:G{half},H1:H{half})"),
            format!("=SUMPRODUCT(G1:G{last},H1:H{last})"),
            format!("=SUMPRODUCT(G1:G{half})"),
            format!("=SUMPRODUCT(G1:G{half},H1:H{half},G1:G{half})"),
            // A lone cell is a scalar argument: its numeric text counts.
            "=SUMPRODUCT(A1,F1)".to_owned(),
            "=SUMPRODUCT(A1,C1)".to_owned(),
        ]
    }

    /// Each formula's result, as kind, number bits and text.
    fn results(literal_columns: bool) -> Vec<(u8, u64, Option<String>)> {
        LITERAL_COLUMNS_OFF.with(|off| off.set(!literal_columns));
        let (mut store, sheet) = mixed_store();
        let sources = formulas();
        for (row, source) in sources.iter().enumerate() {
            store.set_formula(sheet, row, 8, source, 0);
        }
        store.recompute(sheet);
        LITERAL_COLUMNS_OFF.with(|off| off.set(false));

        (0..sources.len())
            .map(|row| {
                let cell = store.get_cell(sheet, row, 8);
                (cell.kind(), cell.num().to_bits(), cell.string())
            })
            .collect()
    }

    #[test]
    fn literal_sum_products_match_the_accumulator_path() {
        let accumulated = results(false);

        KERNEL_RESULTS.with(|calls| calls.set(0));
        let scanned = results(true);

        // Every formula but the mismatched shapes and the two with lone cells
        // takes the kernel.
        assert_eq!(
            KERNEL_RESULTS.with(std::cell::Cell::get),
            formulas().len() - 3
        );
        for ((source, accumulated), scanned) in formulas().iter().zip(&accumulated).zip(&scanned) {
            assert_eq!(accumulated, scanned, "{source}");
        }
    }
}
