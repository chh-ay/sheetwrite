//! Row and column inserts that the store cannot hold, and formula text that
//! structural edits must leave alone.

use crate::cells::MAX_DENSE_CELLS;
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
fn dense_growth_past_the_cell_limit_changes_nothing() {
    let (mut store, sheet, reader) = sheet_with_reference();
    let rows_past_limit = MAX_DENSE_CELLS / COLS;

    assert!(!store.add_rows(sheet, 0, rows_past_limit));
    assert_unchanged(&store, sheet, reader);

    let wide = store.add_sheet(1, MAX_DENSE_CELLS);
    assert!(!store.insert_cols(wide, 0, 1));
    assert_eq!(store.col_count(wide), 1);
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
