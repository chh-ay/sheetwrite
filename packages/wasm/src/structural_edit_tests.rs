//! Row and column inserts that the store cannot hold, and growth past the
//! dense limit into local pages.

use crate::cells::{MAX_DENSE_CELLS, MAX_LOCAL_PAGED_CELLS};
use crate::store::CellStore;

const COLS: usize = 2;
const ROWS: usize = 4;

/// A count whose cell total overflows `usize` on every target.
const OVERFLOWING_ROWS: usize = usize::MAX / COLS + 1;

fn sheet_with_reference() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(COLS, ROWS);
    let reader = store.add_sheet(COLS, ROWS);
    store.set_sheet_name(sheet, "grid", "Grid");
    store.set_sheet_name(reader, "reader", "Reader");
    store.set_number(sheet, 1, 0, 7.0, 0);
    store.set_formula(sheet, 0, 1, "=A2", 0);
    store.set_formula(reader, 0, 0, "=Grid!A2", 0);
    store.recompute(sheet);
    (store, sheet, reader)
}

fn assert_unchanged(store: &CellStore, sheet: usize, reader: usize) {
    assert_eq!(store.row_count(sheet), ROWS, "the row count");
    assert_eq!(
        store.formula_source(sheet, 0, 1).as_deref(),
        Some("=A2"),
        "the same-sheet reference"
    );
    assert_eq!(
        store.formula_source(reader, 0, 0).as_deref(),
        Some("=Grid!A2"),
        "the cross-sheet reference"
    );
    assert_eq!(
        store.get_cell(sheet, 1, 0).num(),
        7.0,
        "the referenced value"
    );
}

#[test]
fn a_row_insert_whose_cell_count_overflows_changes_nothing() {
    let (mut store, sheet, reader) = sheet_with_reference();

    assert!(!store.add_rows(sheet, 0, OVERFLOWING_ROWS));
    assert_unchanged(&store, sheet, reader);
}

/// The dense cells of the two sheets of [`sheet_with_reference`].
const BOTH_SHEETS: usize = 2 * COLS * ROWS;

#[test]
fn dense_growth_past_the_dense_limit_continues_in_local_pages() {
    let (mut store, sheet, reader) = sheet_with_reference();
    store.set_storage_limits(BOTH_SHEETS, MAX_LOCAL_PAGED_CELLS);

    assert!(store.add_rows(sheet, 0, 1));
    store.recompute(sheet);
    assert!(store.is_local_paged(sheet));
    assert!(
        !store.is_local_paged(reader),
        "only the sheet that grows moves"
    );
    assert!(!store.is_paged(sheet), "a local sheet loads no pages");
    assert_eq!(store.get_cell(sheet, 2, 0).num(), 7.0);
    assert_eq!(
        store.formula_source(reader, 0, 0).as_deref(),
        Some("=Grid!A3")
    );
    assert_eq!(store.get_cell(reader, 0, 0).num(), 7.0);

    // Inserted columns move a dense sheet to local pages too.
    let wide = store.add_sheet(1, ROWS);
    assert!(store.insert_cols(wide, 0, COLS));
    assert!(store.is_local_paged(wide));
    assert_eq!(store.col_count(wide), COLS + 1);
}

#[test]
fn local_growth_past_the_local_limit_changes_nothing() {
    let (mut store, sheet, reader) = sheet_with_reference();
    store.set_storage_limits(BOTH_SHEETS, BOTH_SHEETS);

    assert!(!store.add_rows(sheet, 0, ROWS + 1));
    assert_unchanged(&store, sheet, reader);

    assert!(store.add_rows(sheet, 0, ROWS), "exactly at the local limit");
    assert!(!store.add_rows(sheet, 0, 1), "one row past the local limit");
    assert_eq!(store.row_count(sheet), 2 * ROWS);
}

#[test]
fn host_storage_limits_place_sheets_and_refuse_growth() {
    const DENSE_LIMIT: usize = 100;
    const LOCAL_LIMIT: usize = 300;
    const WIDTH: usize = 10;
    let mut store = CellStore::new();
    store.set_storage_limits(DENSE_LIMIT, LOCAL_LIMIT);

    let dense = store.add_sheet(WIDTH, DENSE_LIMIT / WIDTH);
    assert!(!store.is_local_paged(dense), "exactly at the dense limit");
    let local = store.add_sheet(WIDTH, DENSE_LIMIT / WIDTH);
    assert!(store.is_local_paged(local), "past the dense limit");
    assert!(
        store.try_add_sheet(WIDTH, 21).is_err(),
        "210 more local cells pass the local limit"
    );

    assert!(store.add_rows(dense, 0, 1));
    assert!(
        store.is_local_paged(dense),
        "growing past the dense limit moves the sheet to local pages"
    );
    assert!(
        !store.add_rows(dense, 0, WIDTH + 1),
        "310 local cells pass the local limit"
    );
    assert_eq!(store.row_count(dense), DENSE_LIMIT / WIDTH + 1);
}

#[test]
fn host_storage_limits_above_the_engine_ceilings_are_capped() {
    let mut store = CellStore::new();
    store.set_storage_limits(usize::MAX, usize::MAX);

    let local = store.add_sheet(1, MAX_DENSE_CELLS + 1);
    assert!(
        store.is_local_paged(local),
        "past the engine's dense ceiling"
    );
    assert!(store
        .try_add_sheet(1, MAX_LOCAL_PAGED_CELLS - MAX_DENSE_CELLS)
        .is_err());
}

#[test]
fn a_paged_sheet_rejects_a_chunk_size_it_cannot_round() {
    let mut store = CellStore::new();
    let oversized_chunk_rows = usize::MAX / 2 + 2;
    assert!(store
        .try_add_paged_sheet(1, ROWS, oversized_chunk_rows, 0, 0)
        .is_err());
    assert!(store.sheets.is_empty());
}
