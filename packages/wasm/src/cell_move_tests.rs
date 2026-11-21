//! Excel's Cut and Paste moves a block of cells, and every reference to
//! the moved cells follows them
//! (<https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e>).

use crate::permute::PERMUTE_PARTIAL_SPILL;
use crate::store::{CellStore, BLOCK_INVALID, BLOCK_OK};
use crate::tests::support::{formula_text as text, number};
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
        store.move_cells(data, row, col, rows, cols, data, to.0, to.1, false),
        BLOCK_OK,
        "the move succeeds"
    );
    text(&store, summary, 0, 0)
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
    // Only `A:A`, which runs to the sheet edge at row 1,048,576, keeps
    // spanning it; a range down to the last row of a short sheet does not.
    assert_eq!(
        after_move("=SUM(Data!A1:A30)", [29, 0, 1, 1], (24, 0)),
        "=SUM(Data!A1:A25)"
    );
    // A reference to a cell the block lands on becomes `#REF!`.
    assert_eq!(
        after_move("=Data!C5+SUM(Data!C5:C5)", [0, 0, 1, 1], (4, 2)),
        "=#REF!+SUM(#REF!)"
    );
}

#[test]
fn a_block_moves_to_another_sheet() {
    let (mut store, data, summary) = store();
    store.set_number(data, 0, 0, 3.0, 0);
    store.set_number(data, 4, 1, 5.0, 0);
    store.set_formula(data, 1, 0, "=A1+B5", 0);
    store.set_formula(summary, 0, 0, "=Data!A2", 0);

    // Data!A1:A2 lands on Summary!C3:C4.
    assert_eq!(
        store.move_cells(data, 0, 0, 2, 1, summary, 2, 2, false),
        BLOCK_OK
    );
    store.recompute(data);
    store.recompute(summary);

    assert!(is_empty(&store, data, 0, 0), "Data!A1 is empty");
    assert_eq!(text(&store, summary, 3, 2), "=C3+Data!B5");
    assert_eq!(number(&store, summary, 3, 2), 8.0);
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

    assert_eq!(
        store.move_cells(data, 1, 0, 1, 1, data, 7, 3, false),
        BLOCK_OK
    );
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
        store.move_cells_losses(data, 0, 0, 1, 1, data, 4, 2, false),
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
        store.move_cells(data, 1, 0, 2, 1, data, 0, 4, false),
        PERMUTE_PARTIAL_SPILL
    );
    for (rows, to_row) in [(1, ROWS), (0, 5)] {
        assert_eq!(
            store.move_cells(data, 0, 0, rows, 1, data, to_row, 0, false),
            BLOCK_INVALID
        );
    }
    assert_eq!(text(&store, data, 0, 0), "=SEQUENCE(3)");

    // The formula moves and spills again where it lands.
    assert_eq!(
        store.move_cells(data, 0, 0, 1, 1, data, 0, 4, false),
        BLOCK_OK
    );
    store.recompute(data);
    assert_eq!(text(&store, data, 0, 4), "=SEQUENCE(3)");
    assert_eq!(number(&store, data, 2, 4), 3.0);
    assert!(is_empty(&store, data, 2, 0), "the old spill is gone");
}

#[test]
fn formula_text_follows_a_block_moved_on_its_sheet() {
    // A1:B3 lands on D10:E12, as a conditional-format rule's formula reads it.
    let moved =
        |source: &str| crate::formula_rewrite::move_formula_cells(source, 0, 0, 3, 2, 9, 3, false);
    assert_eq!(moved("=A1>B1+$C$1"), "=D10>E10+$C$1");
    assert_eq!(moved("=SUM(A1:B3)"), "=SUM(D10:E12)");
    assert_eq!(moved("=D11*2"), "=#REF!*2");
    assert_eq!(moved("=Other!A1"), "=Other!A1");
}
