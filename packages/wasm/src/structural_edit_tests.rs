//! Row and column inserts that the store cannot hold, and formula text that
//! structural edits must leave alone.

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

#[test]
fn dense_growth_past_the_dense_cap_continues_in_local_pages() {
    const WIDE_COLS: usize = 10;
    let (mut store, sheet, reader) = sheet_with_reference();
    assert!(store.insert_cols(sheet, COLS, WIDE_COLS - COLS));
    let rows_past_limit = MAX_DENSE_CELLS / WIDE_COLS;

    assert!(store.add_rows(sheet, 0, rows_past_limit));
    store.recompute(sheet);
    assert_eq!(store.row_count(sheet), ROWS + rows_past_limit);
    assert!(!store.is_paged(sheet), "a local sheet loads no pages");
    let moved = 1 + rows_past_limit;
    assert_eq!(store.get_cell(sheet, moved, 0).num(), 7.0);
    assert_eq!(
        store.formula_source(reader, 0, 0).as_deref(),
        Some(format!("=Grid!A{}", moved + 1).as_str())
    );
    assert_eq!(store.get_cell(reader, 0, 0).num(), 7.0);

    let wide = store.add_sheet(1, MAX_DENSE_CELLS);
    assert!(store.insert_cols(wide, 0, 1));
    assert_eq!(store.col_count(wide), 2);
}

#[test]
fn local_growth_past_the_workbook_budget_changes_nothing() {
    let (mut store, sheet, reader) = sheet_with_reference();
    let rows_past_budget = MAX_LOCAL_PAGED_CELLS / COLS;

    assert!(!store.add_rows(sheet, 0, rows_past_budget));
    assert_unchanged(&store, sheet, reader);

    // Local sheets share one budget across the workbook.
    let first = store.add_sheet(1, MAX_LOCAL_PAGED_CELLS / 2);
    assert!(store
        .try_add_sheet(1, MAX_LOCAL_PAGED_CELLS / 2 + 1)
        .is_err());
    assert!(store.insert_cols(first, 0, 1), "exactly at the budget");
    assert!(!store.add_rows(first, 0, 1), "one row past the budget");
    assert_eq!(store.col_count(first), 2);
    assert_eq!(store.row_count(first), MAX_LOCAL_PAGED_CELLS / 2);
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

#[test]
fn structural_edits_keep_the_text_of_formulas_they_do_not_move() {
    let (mut store, sheet, reader) = sheet_with_reference();
    let untouched = store.add_sheet(COLS, ROWS);
    store.set_formula(untouched, 0, 0, "=A2+B2*2", 0);
    store.recompute(untouched);

    assert!(store.add_rows(sheet, 0, 1));
    store.recompute(sheet);

    assert_eq!(
        store.formula_source(untouched, 0, 0).as_deref(),
        Some("=A2+B2*2")
    );
    assert_eq!(
        store.formula_source(reader, 0, 0).as_deref(),
        Some("=Grid!A3")
    );
    assert_eq!(store.get_cell(reader, 0, 0).num(), 7.0);
}

#[test]
fn formula_ids_survive_structural_edits_and_slot_reuse() {
    use crate::types::AbsCellKey;

    let (mut store, sheet, reader) = sheet_with_reference();
    let original = store.formula_id(AbsCellKey::new(sheet, 0, 1)).unwrap();
    let reader_id = store.formula_id(AbsCellKey::new(reader, 0, 0)).unwrap();

    assert!(store.add_rows(sheet, 0, 1));
    assert!(store.insert_cols(sheet, 0, 1));
    store.commit_sources();
    assert_eq!(
        store.formula_id(AbsCellKey::new(sheet, 1, 2)),
        Some(original)
    );
    assert_eq!(
        store.formula_id(AbsCellKey::new(reader, 0, 0)),
        Some(reader_id)
    );
    assert_eq!(store.get_cell(sheet, 1, 2).num(), 7.0);
    assert_eq!(store.get_cell(reader, 0, 0).num(), 7.0);

    assert!(store.remove_rows(sheet, 0, 1));
    assert!(store.remove_cols(sheet, 0, 1));
    store.commit_sources();
    assert_eq!(
        store.formula_id(AbsCellKey::new(sheet, 0, 1)),
        Some(original)
    );

    // A new source may reuse the removed reader's slot, never the live source.
    assert!(store.remove_sheet(reader));
    store.set_formula(sheet, 0, 0, "=B1+10", 0);
    store.commit_sources();
    assert_eq!(
        store.formula_id(AbsCellKey::new(sheet, 0, 1)),
        Some(original)
    );
    assert_ne!(
        store.formula_id(AbsCellKey::new(sheet, 0, 0)),
        Some(original)
    );
    assert_eq!(store.get_cell(sheet, 0, 0).num(), 17.0);
}

#[test]
fn the_dense_sheet_that_passes_the_workbook_dense_cap_moves_to_local_pages() {
    let mut store = CellStore::new();
    let large = store.add_sheet(1, MAX_DENSE_CELLS - 2_000_000);
    let small = store.add_sheet(1, 1_900_000);
    store.set_number(small, 1_899_999, 0, 5.0, 0);

    assert!(store.add_rows(small, 0, 200_000));
    assert!(store.sheets[small].cells.is_local_paged());
    assert!(!store.sheets[large].cells.is_paged());
    assert_eq!(store.get_cell(small, 2_099_999, 0).num(), 5.0);
    assert!(!store.is_paged(small));

    // A new sheet that would pass the dense cap starts in local pages.
    let added = store.add_sheet(1, 2_000_001);
    assert!(store.sheets[added].cells.is_local_paged());
}
