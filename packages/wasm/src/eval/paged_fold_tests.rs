//! Column folds over a paged sheet answer as over the dense sheet, whether
//! they read clean page slices or fall back to reading cell by cell.

use crate::store::CellStore;
use crate::types::KIND_EMPTY;

const ROWS: usize = 14;
const COLS: usize = 3;

/// A dense sheet and a fully loaded paged sheet in four-row pages, with the
/// same cells: A numbers and blanks, B numbers with one text cell.
fn twin_sheets() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let dense = store.add_sheet(COLS, ROWS);
    let paged = store.add_paged_sheet(COLS, ROWS, 4, 0, 0);
    store.begin_page_load();
    let cells = ROWS * COLS;
    let offsets: Vec<u32> = (0..cells as u32).collect();
    let status = store.set_sparse_block(
        paged, 0, 0, ROWS, COLS, &offsets, &vec![KIND_EMPTY; cells], &vec![0.0; cells], &[],
        &[0], &vec![0; cells], &[], Vec::new(), &[], &[],
    );
    assert_eq!(status, crate::store::BLOCK_OK, "the blank page load must apply");
    for sheet in [dense, paged] {
        for row in (0..ROWS).filter(|row| row % 3 != 1) {
            store.set_number(sheet, row, 0, row as f64 * 1.5 - 4.0, 0);
            store.set_number(sheet, row, 1, row as f64, 0);
        }
        store.set_string(sheet, 9, 1, "text", 0);
    }
    store.commit_sources();
    (store, dense, paged)
}

const FOLDS: &[&str] = &[
    "=SUM(A1:A14)",
    "=COUNT(A1:A14)",
    "=COUNTA(A1:A14)",
    "=AVERAGE(A2:A13)",
    "=MIN(A1:A14)",
    "=MAX(A3:A14)",
    "=SUM(B1:B14)",
    "=COUNT(B1:B14)",
    "=MAX(B1:B14)",
];

fn results(store: &mut CellStore, sheet: usize) -> Vec<(u8, f64)> {
    for (row, source) in FOLDS.iter().enumerate() {
        store.set_formula(sheet, row, 2, source, 0);
    }
    store.recompute(sheet);
    (0..FOLDS.len())
        .map(|row| {
            let cell = store.get_cell(sheet, row, 2);
            (cell.kind(), cell.num())
        })
        .collect()
}

#[test]
fn paged_column_folds_match_the_dense_sheet() {
    let (mut store, dense, paged) = twin_sheets();
    assert_eq!(results(&mut store, paged), results(&mut store, dense));
}

#[test]
fn paged_column_folds_read_an_unacknowledged_edit() {
    let (mut store, dense, paged) = twin_sheets();
    for sheet in [dense, paged] {
        store.set_number(sheet, 5, 0, 1_000.0, 0);
    }
    assert!(store.sheets[paged].cells.is_cell_dirty(5, 0));
    assert_eq!(results(&mut store, paged), results(&mut store, dense));
}
