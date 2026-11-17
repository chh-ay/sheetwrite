//! Excel's Cut and Paste moves a block of cells, and every reference to
//! the moved cells follows them
//! (<https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e>).

use crate::permute::PERMUTE_PARTIAL_SPILL;
use crate::store::{CellStore, BLOCK_OK};
use crate::types::KIND_EMPTY;

const ROWS: usize = 30;
const COLS: usize = 8;

/// `Data` and `Summary`, both empty.
fn store() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let data = store.add_sheet(COLS, ROWS);
    let summary = store.add_sheet(COLS, ROWS);
    store.set_sheet_name(data, "data", "Data");
    store.set_sheet_name(summary, "summary", "Summary");
    (store, data, summary)
}

fn text(store: &CellStore, sheet: usize, row: usize, col: usize) -> String {
    store.formula_source(sheet, row, col).unwrap_or_default()
}

fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
    store.get_cell(sheet, row, col).num()
}

fn is_empty(store: &CellStore, sheet: usize, row: usize, col: usize) -> bool {
    store.get_cell(sheet, row, col).kind() == KIND_EMPTY
}

/// The text of `formula` in `Summary!A1` after the block of `Data` at
/// `from` (`[row, col, rows, cols]`) moves to `to` on `Data`.
fn after_move(formula: &str, from: [usize; 4], to: (usize, usize)) -> String {
    let (mut store, data, summary) = store();
    store.set_formula(summary, 0, 0, formula, 0);
    let [row, col, rows, cols] = from;
    assert_eq!(
        store.move_cells(data, row, col, rows, cols, data, to.0, to.1),
        BLOCK_OK,
        "the move succeeds"
    );
    text(&store, summary, 0, 0)
}

#[test]
fn moved_cells_leave_the_source_and_references_follow_them() {
    // The steps of #756.
    let (mut store, data, _) = store();
    store.set_number(data, 0, 0, 1.0, 0);
    store.set_number(data, 1, 0, 2.0, 0);
    store.set_formula(data, 0, 1, "=A1*10", 0);
    store.set_formula(data, 5, 5, "=A1+A2", 0);

    assert_eq!(store.move_cells(data, 0, 0, 2, 1, data, 19, 0), BLOCK_OK);
    store.recompute(data);

    assert_eq!(number(&store, data, 19, 0), 1.0);
    assert_eq!(number(&store, data, 20, 0), 2.0);
    assert!(is_empty(&store, data, 0, 0), "A1 is empty");
    assert!(is_empty(&store, data, 1, 0), "A2 is empty");
    assert_eq!(text(&store, data, 0, 1), "=A20*10");
    assert_eq!(text(&store, data, 5, 5), "=A20+A21");
    assert_eq!(number(&store, data, 0, 1), 10.0);
    assert_eq!(number(&store, data, 5, 5), 3.0);
}

#[test]
fn a_moved_formula_keeps_pointing_at_the_same_cells() {
    let (mut store, data, _) = store();
    store.set_number(data, 0, 0, 4.0, 0);
    store.set_number(data, 0, 2, 5.0, 0);
    store.set_formula(data, 0, 1, "=A1+C1", 0);

    // A1:B1 lands on D10:E10; C1 stays.
    assert_eq!(store.move_cells(data, 0, 0, 1, 2, data, 9, 3), BLOCK_OK);
    store.recompute(data);

    assert_eq!(text(&store, data, 9, 4), "=D10+C1");
    assert_eq!(number(&store, data, 9, 4), 9.0);
}

#[test]
fn a_reference_to_a_cell_the_block_lands_on_becomes_ref() {
    let (mut store, data, _) = store();
    store.set_number(data, 0, 0, 1.0, 0);
    store.set_number(data, 4, 2, 7.0, 0);
    store.set_formula(data, 0, 6, "=C5", 0);
    store.set_formula(data, 1, 6, "=SUM(C5:C5)+1", 0);

    assert_eq!(store.move_cells(data, 0, 0, 1, 1, data, 4, 2), BLOCK_OK);

    assert_eq!(number(&store, data, 4, 2), 1.0);
    assert_eq!(text(&store, data, 0, 6), "=#REF!");
    assert_eq!(text(&store, data, 1, 6), "=SUM(#REF!)+1");
}

#[test]
fn a_block_moves_onto_part_of_itself() {
    let (mut store, data, summary) = store();
    for row in 0..3 {
        store.set_number(data, row, 0, (row + 1) as f64, 0);
    }
    store.set_formula(summary, 0, 0, "=SUM(Data!A1:A3)", 0);

    assert_eq!(store.move_cells(data, 0, 0, 3, 1, data, 1, 0), BLOCK_OK);
    store.recompute(summary);

    assert!(is_empty(&store, data, 0, 0), "A1 is empty");
    let column: Vec<f64> = (1..4).map(|row| number(&store, data, row, 0)).collect();
    assert_eq!(column, [1.0, 2.0, 3.0]);
    assert_eq!(text(&store, summary, 0, 0), "=SUM(Data!A2:A4)");
    assert_eq!(number(&store, summary, 0, 0), 6.0);
}

#[test]
fn a_range_moves_an_edge_only_when_the_block_holds_it_and_moves_along_it() {
    // The last cell moves down the column: the range follows it.
    assert_eq!(
        after_move("=SUM(Data!A1:A10)", [9, 0, 1, 1], (14, 0)),
        "=SUM(Data!A1:A15)"
    );
    // The first column moves along the row: the range follows it.
    assert_eq!(
        after_move("=SUM(Data!A2:D2)", [1, 0, 1, 1], (1, 1)),
        "=SUM(Data!B2:D2)"
    );
    // The last cell moves to the side: the range stays.
    assert_eq!(
        after_move("=SUM(Data!A1:A10)", [9, 0, 1, 1], (9, 2)),
        "=SUM(Data!A1:A10)"
    );
    // A cell inside the range moves out: the range stays.
    assert_eq!(
        after_move("=SUM(Data!A1:A10)", [4, 0, 1, 1], (19, 0)),
        "=SUM(Data!A1:A10)"
    );
    // The whole range moves with the block.
    assert_eq!(
        after_move("=SUM(Data!A1:B2)", [0, 0, 3, 3], (10, 4)),
        "=SUM(Data!E11:F12)"
    );
    // A whole column keeps spanning its sheet.
    assert_eq!(
        after_move("=SUM(Data!A:A)", [0, 0, 1, 1], (5, 0)),
        "=SUM(Data!A:A)"
    );
}

#[test]
fn a_block_moves_to_another_sheet() {
    let (mut store, data, summary) = store();
    store.set_number(data, 0, 0, 3.0, 0);
    store.set_number(data, 4, 1, 5.0, 0);
    store.set_formula(data, 1, 0, "=A1+B5", 0);
    store.set_formula(data, 0, 3, "=A1*2", 0);
    store.set_formula(summary, 0, 0, "=Data!A2", 0);

    // Data!A1:A2 lands on Summary!C3:C4.
    assert_eq!(store.move_cells(data, 0, 0, 2, 1, summary, 2, 2), BLOCK_OK);
    store.recompute(data);
    store.recompute(summary);

    assert!(is_empty(&store, data, 0, 0), "Data!A1 is empty");
    assert_eq!(text(&store, summary, 3, 2), "=C3+Data!B5");
    assert_eq!(number(&store, summary, 3, 2), 8.0);
    assert_eq!(text(&store, data, 0, 3), "=Summary!C3*2");
    assert_eq!(number(&store, data, 0, 3), 6.0);
    // A reference that names its sheet keeps naming one.
    assert_eq!(text(&store, summary, 0, 0), "=Summary!C4");
    assert_eq!(number(&store, summary, 0, 0), 8.0);
}

#[test]
fn defined_names_follow_moved_cells() {
    let (mut store, data, summary) = store();
    store.set_number(data, 1, 0, 6.0, 0);
    assert!(
        store.set_named_range("Second", -1, data, 1, 0, 1, 0),
        "Second is defined"
    );
    assert!(
        store.set_named_formula("Double", -1, "=Data!$A$2 * 2"),
        "Double is defined"
    );
    store.set_formula(summary, 0, 0, "=Second+Double", 0);

    assert_eq!(store.move_cells(data, 1, 0, 1, 1, data, 7, 3), BLOCK_OK);
    store.recompute(summary);

    assert_eq!(
        store.named_formula_source("Double", -1).as_deref(),
        Some("=Data!$D$8 * 2")
    );
    assert_eq!(number(&store, summary, 0, 0), 18.0);
}

#[test]
fn losses_list_the_formulas_a_move_back_cannot_restore() {
    let (mut store, data, summary) = store();
    store.set_formula(summary, 0, 0, "=Data!C5", 0);
    store.set_formula(summary, 1, 0, "=Data!A1", 0);
    store.set_formula(summary, 2, 0, "=SUM(Data!A1:A10)", 0);

    // A1 lands on C5; A1:A10 keeps its address, and A1 follows back.
    assert_eq!(
        store.move_cells_losses(data, 0, 0, 1, 1, data, 4, 2),
        [summary as u32, 0, 0]
    );
}

#[test]
fn a_spill_moves_with_its_formula_and_a_move_that_does_not_fit_changes_nothing() {
    let (mut store, data, _) = store();
    store.set_formula(data, 0, 0, "=SEQUENCE(3)", 0);
    store.recompute(data);

    // Spilled cells without their formula cannot move.
    assert_eq!(
        store.move_cells(data, 1, 0, 2, 1, data, 0, 4),
        PERMUTE_PARTIAL_SPILL
    );
    assert_ne!(store.move_cells(data, 0, 0, 1, 1, data, ROWS, 0), BLOCK_OK);
    assert_ne!(store.move_cells(data, 0, 0, 0, 1, data, 5, 0), BLOCK_OK);
    assert_eq!(text(&store, data, 0, 0), "=SEQUENCE(3)");

    // The formula moves and spills again where it lands.
    assert_eq!(store.move_cells(data, 0, 0, 1, 1, data, 0, 4), BLOCK_OK);
    store.recompute(data);
    assert_eq!(text(&store, data, 0, 4), "=SEQUENCE(3)");
    assert_eq!(number(&store, data, 2, 4), 3.0);
    assert!(is_empty(&store, data, 2, 0), "the old spill is gone");
}

#[test]
fn a_range_down_to_the_last_row_of_a_short_sheet_is_not_a_whole_column() {
    // Only `A:A`, which runs to the sheet edge at row 1,048,576, keeps spanning it.
    assert_eq!(
        after_move("=SUM(Data!A1:A30)", [29, 0, 1, 1], (24, 0)),
        "=SUM(Data!A1:A25)"
    );
}

#[test]
fn formula_text_follows_a_block_moved_on_its_sheet() {
    // A1:B3 lands on D10:E12, as a conditional-format rule's formula reads it.
    let moved = |source: &str| crate::formula_rewrite::move_formula_cells(source, 0, 0, 3, 2, 9, 3);
    assert_eq!(moved("=A1>B1+$C$1"), "=D10>E10+$C$1");
    assert_eq!(moved("=SUM(A1:B3)"), "=SUM(D10:E12)");
    assert_eq!(moved("=D11*2"), "=#REF!*2");
    assert_eq!(moved("=Other!A1"), "=Other!A1");
}
