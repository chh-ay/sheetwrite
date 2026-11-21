//! Excel's Insert and Delete with Shift cells: the cells below (or right of)
//! the inserted or deleted cells move, and references follow the rule of
//! inserted and deleted rows inside their columns
//! (<https://support.microsoft.com/en-us/office/insert-or-delete-cells-rows-and-columns-6f40e6e4-85af-45e0-b39d-65dd504a3246>).

use crate::store::{CellStore, BLOCK_INVALID, BLOCK_OK};
use crate::types::KIND_EMPTY;

const ROWS: usize = 30;
const COLS: usize = 8;

/// `Data` with 1 to 6 in A1:A6 and 10 in B3, and an empty `Summary`.
fn store() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let data = store.add_sheet(COLS, ROWS);
    let summary = store.add_sheet(COLS, ROWS);
    store.set_sheet_name(data, "data", "Data");
    store.set_sheet_name(summary, "summary", "Summary");
    for row in 0..6 {
        store.set_number(data, row, 0, (row + 1) as f64, 0);
    }
    store.set_number(data, 2, 1, 10.0, 0);
    (store, data, summary)
}

/// Each formula in `Summary!A1`, `A2` and on, and their text after `edit`.
fn after(formulas: &[&str], edit: impl FnOnce(&mut CellStore, usize)) -> Vec<String> {
    let (mut store, data, summary) = store();
    for (row, formula) in formulas.iter().enumerate() {
        store.set_formula(summary, row, 0, formula, 0);
    }
    edit(&mut store, data);
    (0..formulas.len())
        .map(|row| store.formula_source(summary, row, 0).unwrap_or_default())
        .collect()
}

fn column(store: &CellStore, sheet: usize, col: usize, rows: usize) -> Vec<Option<f64>> {
    (0..rows)
        .map(|row| {
            let cell = store.get_cell(sheet, row, col);
            (cell.kind() != KIND_EMPTY).then(|| cell.num())
        })
        .collect()
}

#[test]
fn inserting_cells_shifts_down_the_cells_below_and_references_to_them() {
    // Insert two cells at A3, Shift cells down: A3:A6 move to A5:A8.
    let insert = |store: &mut CellStore, data: usize| {
        assert_eq!(
            store.move_cells(data, 2, 0, 4, 1, data, 4, 0, true),
            BLOCK_OK
        );
    };
    assert_eq!(
        after(
            &[
                "=SUM(Data!A1:A6)",
                "=Data!A3",
                "=Data!A2",
                "=Data!A20",
                "=Data!B3",
                "=SUM(Data!A1:B6)",
                "=SUM(Data!A:A)",
                "=SUM(Data!A3:A4)",
            ],
            insert,
        ),
        [
            "=SUM(Data!A1:A8)",
            "=Data!A5",
            "=Data!A2",
            "=Data!A22",
            "=Data!B3",
            "=SUM(Data!A1:B6)",
            "=SUM(Data!A:A)",
            "=SUM(Data!A5:A6)",
        ],
    );
}

#[test]
fn deleting_cells_shifts_up_the_cells_below_and_loses_references_to_them() {
    // Delete A2:A3, Shift cells up: A4:A6 move to A2:A4.
    let delete = |store: &mut CellStore, data: usize| {
        assert_eq!(
            store.move_cells(data, 3, 0, 3, 1, data, 1, 0, true),
            BLOCK_OK
        );
    };
    assert_eq!(
        after(
            &[
                "=Data!A2",
                "=Data!A5",
                "=SUM(Data!A1:A6)",
                "=SUM(Data!A2:A3)",
                "=SUM(Data!A3:A5)",
                "=SUM(Data!A1:B6)",
                "=Data!A1",
            ],
            delete,
        ),
        [
            "=#REF!",
            "=Data!A3",
            "=SUM(Data!A1:A4)",
            "=SUM(#REF!)",
            "=SUM(Data!A2:A3)",
            "=SUM(Data!A1:B6)",
            "=Data!A1",
        ],
    );
}

#[test]
fn deleting_more_cells_than_move_up_empties_the_rest() {
    // Delete A2:A4: only A5:A6 move up, to A2:A3, and A4 empties too.
    let (mut store, data, summary) = store();
    store.set_formula(summary, 0, 0, "=Data!A4", 0);
    assert_eq!(
        store.move_cells(data, 4, 0, 2, 1, data, 1, 0, true),
        BLOCK_OK
    );
    assert_eq!(
        column(&store, data, 0, 7),
        [Some(1.0), Some(5.0), Some(6.0), None, None, None, None],
    );
    assert_eq!(
        store.formula_source(summary, 0, 0).unwrap_or_default(),
        "=#REF!"
    );
}

#[test]
fn inserting_and_deleting_cells_shifts_right_and_left_along_a_row() {
    // Insert one cell at A1, Shift cells right: A1:B1 move to B1:C1.
    assert_eq!(
        after(
            &["=Data!B1", "=Data!B2", "=SUM(Data!A1:C1)"],
            |store, data| {
                assert_eq!(
                    store.move_cells(data, 0, 0, 1, 2, data, 0, 1, true),
                    BLOCK_OK
                );
            }
        ),
        ["=Data!C1", "=Data!B2", "=SUM(Data!B1:D1)"],
    );
    // Delete B3, Shift cells left: C3 moves to B3.
    assert_eq!(
        after(&["=Data!B3", "=Data!C3", "=Data!B4"], |store, data| {
            assert_eq!(
                store.move_cells(data, 2, 2, 1, 1, data, 2, 1, true),
                BLOCK_OK
            );
        }),
        ["=#REF!", "=Data!B3", "=Data!B4"],
    );
}

#[test]
fn a_shift_stays_on_one_sheet_and_one_axis() {
    let (mut store, data, summary) = store();
    for (to_sheet, to_col) in [(summary, 0), (data, 1)] {
        assert_eq!(
            store.move_cells(data, 0, 0, 1, 1, to_sheet, 1, to_col, true),
            BLOCK_INVALID
        );
    }
}

#[test]
fn undo_restores_the_formulas_a_deletion_changes_for_good() {
    let (mut store, data, summary) = store();
    store.set_formula(summary, 0, 0, "=Data!A2", 0);
    store.set_formula(summary, 1, 0, "=SUM(Data!A1:A6)", 0);
    store.set_formula(summary, 2, 0, "=Data!A5", 0);
    let summary_handle = summary as u32;
    assert_eq!(
        store.move_cells_losses(data, 3, 0, 3, 1, data, 1, 0, true),
        [summary_handle, 0, 0],
        "the #REF! only: the inverse insert moves A3 back to A5 and grows A1:A4 back to A1:A6",
    );
}
