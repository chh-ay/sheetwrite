//! Whole rows and columns that move, as Excel's Cut and Insert Cut Cells
//! moves them. A reference follows the cells it names. A range follows
//! Excel's rules for a cut and an insert: it keeps the block when the block
//! moves inside it, loses a moved row or column at its edge
//! (<https://techcommunity.microsoft.com/discussions/excelgeneral/in-excel-cut-and-paste-may-change-the-cell-range-set-in-a-formula/4465923>),
//! and grows by a block that lands inside it but not by one that lands
//! just outside it, as for an inserted row
//! (<https://support.microsoft.com/en-us/excel/get-started/sum-function>,
//! "Formulas won't update references when inserting rows or columns").

use crate::store::{CellStore, BLOCK_OK};

const ROWS: usize = 10;
const COLS: usize = 4;

/// `Data` with 1..=10 in A1:A10, and an empty `Summary`.
fn store() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let data = store.add_sheet(COLS, ROWS);
    let summary = store.add_sheet(COLS, ROWS);
    store.set_sheet_name(data, "data", "Data");
    store.set_sheet_name(summary, "summary", "Summary");
    for row in 0..ROWS {
        store.set_number(data, row, 0, (row + 1) as f64, 0);
    }
    (store, data, summary)
}

fn text(store: &CellStore, sheet: usize, row: usize, col: usize) -> String {
    store.formula_source(sheet, row, col).unwrap_or_default()
}

fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
    store.get_cell(sheet, row, col).num()
}

/// The text of `formula` on `Summary` after `count` rows of `Data` move
/// from row index `from` so that the first lands on row index `to`.
fn after_row_move(formula: &str, from: usize, count: usize, to: usize) -> String {
    let (mut store, data, summary) = store();
    store.set_formula(summary, 0, 0, formula, 0);
    assert_eq!(store.move_rows(data, from, count, to), BLOCK_OK);
    text(&store, summary, 0, 0)
}

#[test]
fn moved_cells_keep_their_values_and_references_follow_them() {
    let (mut store, data, summary) = store();
    store.set_formula(data, 1, 1, "=A2*2", 0);
    store.set_formula(data, 2, 1, "=A3 + A2", 0);
    store.set_formula(summary, 0, 0, "=Data!A2*2", 0);
    store.set_formula(summary, 1, 0, "=(Data!A3 + 1) * 2", 0);

    // Row 2 lands below row 4.
    assert_eq!(store.move_rows(data, 1, 1, 3), BLOCK_OK);
    store.recompute(summary);
    store.recompute(data);

    let column: Vec<f64> = (0..5).map(|row| number(&store, data, row, 0)).collect();
    assert_eq!(column, [1.0, 3.0, 4.0, 2.0, 5.0]);
    assert_eq!(text(&store, data, 3, 1), "=A4*2");
    assert_eq!(text(&store, data, 1, 1), "=A2 + A4");
    assert_eq!(text(&store, summary, 0, 0), "=Data!A4*2");
    assert_eq!(text(&store, summary, 1, 0), "=(Data!A2 + 1) * 2");
    assert_eq!(number(&store, data, 3, 1), 4.0);
    assert_eq!(number(&store, data, 1, 1), 5.0);
    assert_eq!(number(&store, summary, 0, 0), 4.0);
    assert_eq!(number(&store, summary, 1, 0), 8.0);
}

#[test]
fn a_range_follows_excel_rules_for_a_moved_block() {
    // The block moves inside the range: the range is the same.
    assert_eq!(
        after_row_move("=SUM(Data!A1:A10)", 1, 2, 5),
        "=SUM(Data!A1:A10)"
    );
    // The whole range moves with the block.
    assert_eq!(
        after_row_move("=SUM(Data!A2:A3)", 1, 2, 6),
        "=SUM(Data!A7:A8)"
    );
    // The last row of the range moves out: the range loses it.
    assert_eq!(
        after_row_move("=SUM(Data!A1:A4)", 3, 1, 5),
        "=SUM(Data!A1:A3)"
    );
    // The first row of the range moves out: the range loses it.
    assert_eq!(
        after_row_move("=SUM(Data!A2:A4)", 1, 1, 5),
        "=SUM(Data!A2:A3)"
    );
    // A block lands inside the range: the range grows.
    assert_eq!(
        after_row_move("=SUM(Data!A1:A3)", 5, 1, 1),
        "=SUM(Data!A1:A4)"
    );
    // A block lands just below the range: the range stays.
    assert_eq!(
        after_row_move("=SUM(Data!A1:A3)", 5, 1, 3),
        "=SUM(Data!A1:A3)"
    );
    // A block passes over the range: the range shifts.
    assert_eq!(
        after_row_move("=SUM(Data!A2:A3)", 4, 2, 0),
        "=SUM(Data!A4:A5)"
    );
    // Whole columns are not changed by a row move.
    assert_eq!(after_row_move("=SUM(Data!A:B)", 4, 2, 0), "=SUM(Data!A:B)");
}

#[test]
fn moved_columns_follow_the_same_rules() {
    let (mut store, data, summary) = store();
    store.set_number(data, 0, 1, 20.0, 0);
    store.set_formula(summary, 0, 0, "=Data!B1+SUM(Data!A1:C1)", 0);
    store.set_formula(data, 1, 3, "=A1", 0);

    // Column A lands after column C.
    assert_eq!(store.move_cols(data, 0, 1, 2), BLOCK_OK);
    store.recompute(summary);
    store.recompute(data);

    assert_eq!(number(&store, data, 0, 0), 20.0);
    assert_eq!(number(&store, data, 0, 2), 1.0);
    assert_eq!(text(&store, summary, 0, 0), "=Data!A1+SUM(Data!A1:B1)");
    assert_eq!(text(&store, data, 1, 3), "=C1");
    assert_eq!(number(&store, data, 1, 3), 1.0);
}

#[test]
fn defined_names_follow_a_move() {
    let (mut store, data, summary) = store();
    assert!(store.set_named_range("Second", -1, data, 1, 0, 1, 0));
    assert!(store.set_named_formula("Double", -1, "=Data!$A$2 * 2"));
    store.set_formula(summary, 0, 0, "=Second+Double", 0);

    assert_eq!(store.move_rows(data, 1, 1, 3), BLOCK_OK);
    store.recompute(summary);

    assert_eq!(
        store.named_formula_source("Double", -1).as_deref(),
        Some("=Data!$A$4 * 2")
    );
    assert_eq!(number(&store, summary, 0, 0), 6.0);
}

#[test]
fn losses_list_the_formulas_a_move_back_cannot_restore() {
    let (mut store, data, summary) = store();
    store.set_formula(summary, 0, 0, "=SUM(Data!A1:A4)", 0);
    store.set_formula(summary, 1, 0, "=Data!A4", 0);
    store.set_formula(summary, 2, 0, "=SUM(Data!A1:A10)", 0);

    assert_eq!(
        store.move_losses(data, false, 3, 1, 5),
        [summary as u32, 0, 0]
    );
}

#[test]
fn a_move_that_does_not_fit_changes_nothing() {
    let (mut store, data, _) = store();
    assert_ne!(store.move_rows(data, 9, 2, 0), BLOCK_OK);
    assert_ne!(store.move_rows(data, 0, 1, 10), BLOCK_OK);
    assert_ne!(store.move_rows(data, 0, 0, 1), BLOCK_OK);
    assert_eq!(number(&store, data, 0, 0), 1.0);
}
