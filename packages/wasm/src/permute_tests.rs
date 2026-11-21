//! In-place row sort in the engine: cells move with their row, formulas
//! follow Excel's sort rules and spill ranges move only as a whole.

use crate::permute::PERMUTE_PARTIAL_SPILL;
use crate::store::{CellStore, BLOCK_INVALID, BLOCK_OK};
use crate::tests::support::shown;

const ROWS: usize = 6;
const COLS: usize = 4;
const STYLE: u32 = 7;

fn sheet() -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(COLS, ROWS);
    store.set_sheet_name(sheet, "sheet1", "Sheet1");
    (store, sheet)
}

fn permute(
    store: &mut CellStore,
    sheet: usize,
    start_row: usize,
    start_col: usize,
    cols: usize,
    order: &[u32],
) -> u32 {
    store.permute_rows(sheet, start_row, start_col, cols, order)
}

fn losses(store: &CellStore, sheet: usize, cols: usize, order: &[u32]) -> Vec<u32> {
    store.permute_rows_losses(sheet, 0, 0, cols, order)
}

fn column(store: &CellStore, sheet: usize, col: usize, rows: usize) -> Vec<String> {
    (0..rows).map(|row| shown(store, sheet, row, col)).collect()
}

#[test]
fn values_and_styles_move_with_their_row_and_other_columns_stay() {
    let (mut store, sheet) = sheet();
    for (row, value) in [30.0, 10.0, 20.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
    }
    store.set_string(sheet, 0, 1, "c", STYLE);
    store.set_string(sheet, 1, 1, "a", 0);
    store.set_bool(sheet, 2, 1, true, 0);
    store.set_string(sheet, 0, 2, "first", 0);
    store.set_string(sheet, 1, 2, "second", 0);

    assert_eq!(permute(&mut store, sheet, 0, 0, 2, &[1, 2, 0]), BLOCK_OK);
    store.recompute(sheet);

    assert_eq!(column(&store, sheet, 0, 3), ["10", "20", "30"]);
    assert_eq!(column(&store, sheet, 1, 3), ["a", "TRUE", "c"]);
    assert_eq!(store.get_cell(sheet, 2, 1).style(), STYLE);
    assert_eq!(column(&store, sheet, 2, 2), ["first", "second"]);
}

#[test]
fn references_keep_their_target() {
    let (mut store, sheet) = sheet();
    store.set_number(sheet, 5, 3, 42.0, 0);
    store.set_formula(sheet, 0, 0, "=1", 0);
    assert_eq!(
        store.set_block_packed(
            sheet,
            1,
            0,
            1,
            1,
            &[0],
            &[0.0],
            &[],
            &[0],
            &[0],
            &[],
            Vec::new(),
            &[0],
            &[sheet as u32, 5, 3]
        ),
        BLOCK_OK
    );
    store.recompute(sheet);

    assert_eq!(permute(&mut store, sheet, 0, 0, 1, &[1, 0]), BLOCK_OK);
    store.recompute(sheet);

    assert_eq!(
        store.reference_target(sheet, 0, 0),
        Some(vec![sheet as u32, 5, 3])
    );
    assert_eq!(shown(&store, sheet, 0, 0), "42");
}

#[test]
fn an_order_that_is_not_a_permutation_changes_nothing() {
    let (mut store, sheet) = sheet();
    store.set_number(sheet, 0, 0, 2.0, 0);
    store.set_number(sheet, 1, 0, 1.0, 0);

    assert_eq!(permute(&mut store, sheet, 0, 0, 1, &[1, 1]), BLOCK_INVALID);
    assert_eq!(permute(&mut store, sheet, 0, 0, 1, &[0, 2]), BLOCK_INVALID);
    assert_eq!(
        permute(&mut store, sheet, ROWS - 1, 0, 1, &[1, 0]),
        BLOCK_INVALID
    );
    assert_eq!(
        permute(&mut store, sheet, 0, COLS, 1, &[1, 0]),
        BLOCK_INVALID
    );

    assert_eq!(column(&store, sheet, 0, 2), ["2", "1"]);
}

/// Microsoft Support, "Dynamic array formulas and spilled array behavior":
/// only the anchor of a spill holds its formula, so a sort cannot move part
/// of the spill, nor a spill cell whose anchor is outside the rows.
#[test]
fn a_spill_over_several_rows_rejects_the_sort() {
    let (mut store, sheet) = sheet();
    store.set_formula(sheet, 0, 0, "=SEQUENCE(3)", 0);
    store.set_formula(sheet, 4, 2, "=SEQUENCE(1,2)", 0);
    store.set_number(sheet, 0, 1, 3.0, 0);
    store.set_number(sheet, 1, 1, 1.0, 0);
    store.set_number(sheet, 2, 1, 2.0, 0);
    store.recompute(sheet);

    assert_eq!(
        permute(&mut store, sheet, 0, 0, 2, &[1, 2, 0]),
        PERMUTE_PARTIAL_SPILL
    );
    assert_eq!(column(&store, sheet, 1, 3), ["3", "1", "2"]);
    assert_eq!(
        permute(&mut store, sheet, 4, 3, 1, &[1, 0]),
        PERMUTE_PARTIAL_SPILL
    );
}

#[test]
fn a_spill_inside_one_row_moves_with_its_anchor() {
    let (mut store, sheet) = sheet();
    store.set_formula(sheet, 0, 0, "=SEQUENCE(1,2,5)", 0);
    store.set_number(sheet, 1, 0, 1.0, 0);
    store.recompute(sheet);

    assert_eq!(permute(&mut store, sheet, 0, 0, 2, &[1, 0]), BLOCK_OK);
    store.recompute(sheet);

    assert_eq!(column(&store, sheet, 0, 2), ["1", "5"]);
    assert_eq!(column(&store, sheet, 1, 2), ["", "6"]);
}

#[test]
fn losses_name_the_formulas_that_the_inverse_cannot_restore() {
    let (mut store, sheet) = sheet();
    store.set_formula(sheet, 1, 0, "=A1", 0);
    store.set_formula(sheet, 2, 0, "=B3", 0);

    assert_eq!(losses(&store, sheet, 2, &[1, 2, 0]), [2]);
    assert!(losses(&store, sheet, 2, &[0, 0, 1]).is_empty());
}

#[test]
fn row_order_targets_invert_the_order_and_reject_other_lists() {
    let (store, _) = sheet();

    assert_eq!(store.row_order_targets(&[2, 0, 1]), [1, 2, 0]);
    assert_eq!(store.row_order_targets(&[0]), [0]);
    assert!(store.row_order_targets(&[0, 0]).is_empty());
    assert!(store.row_order_targets(&[1, 2]).is_empty());
}

#[test]
fn the_current_region_is_bounded_by_empty_rows_and_columns() {
    let (mut store, sheet) = sheet();
    store.set_number(sheet, 1, 1, 1.0, 0);
    store.set_number(sheet, 2, 1, 2.0, 0);
    store.set_number(sheet, 3, 2, 3.0, 0);
    store.set_number(sheet, 5, 0, 9.0, 0);

    assert_eq!(store.current_region(sheet, 1, 1), [1, 1, 3, 2]);
    assert_eq!(store.current_region(sheet, 5, 0), [5, 0, 5, 0]);
    assert!(store.current_region(sheet, ROWS, 0).is_empty());
}
