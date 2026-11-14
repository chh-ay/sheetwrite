//! A local sheet (a dense sheet that grew past the dense cap) answers every
//! store path that branches on paged storage as the dense sheet it replaced.

use crate::store::CellStore;
use crate::types::{KIND_NUMBER, KIND_STRING};

const ROWS: usize = 9_000;
const COLS: usize = 3;
/// Above `MIN_RADIX_SORT_ROWS`, so the numeric sort takes its radix path.
const SORT_ROWS: usize = ROWS;
/// Below it, so the numeric sort takes its comparison path.
const SHORT_ROWS: usize = 40;

/// The same sheet twice: dense, and converted to local pages.
fn twin_sheets(rows: usize) -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let dense = store.add_sheet(COLS, rows);
    let local = store.add_sheet(COLS, rows);
    for sheet in [dense, local] {
        for row in 0..rows {
            store.set_number(sheet, row, 0, ((row * 7_919) % 1_009) as f64, 0);
            if row % 3 == 0 {
                store.set_string(sheet, row, 1, &format!("k{}", (row * 31) % 97), 0);
            }
        }
        store.set_formula(sheet, 0, 2, &format!("=SUM(A1:A{rows})"), 0);
        store.recompute(sheet);
    }
    store.convert_sheet_to_local_paged(local);
    assert!(store.sheets[local].cells.is_local_paged());
    (store, dense, local)
}

fn column(
    store: &CellStore,
    sheet: usize,
    rows: usize,
    col: usize,
) -> Vec<(u8, f64, Option<String>)> {
    (0..rows)
        .map(|row| {
            let cell = store.get_cell(sheet, row, col);
            (cell.kind(), cell.num(), cell.string())
        })
        .collect()
}

#[test]
fn a_local_sheet_is_not_reported_as_paged() {
    let (store, dense, local) = twin_sheets(SHORT_ROWS);
    assert!(!store.is_paged(dense));
    assert!(!store.is_paged(local));
    assert!(store.range_fully_loaded(local, 0, 0, SHORT_ROWS - 1, COLS - 1));
    assert_eq!(store.paged_stats(local)[4], 1.0, "fully loaded");
}

#[test]
fn range_reads_on_a_local_sheet_match_the_dense_sheet() {
    let (mut store, dense, local) = twin_sheets(ROWS);
    for sheet in [dense, local] {
        store.set_number(sheet, 5, 0, 1_000.0, 0);
        store.recompute(sheet);
    }
    assert_eq!(
        store.get_cell(local, 0, 2).num(),
        store.get_cell(dense, 0, 2).num()
    );
}

#[test]
fn numeric_sorts_on_a_local_sheet_match_the_dense_sheet() {
    for rows in [SORT_ROWS, SHORT_ROWS] {
        let (store, dense, local) = twin_sheets(rows);
        for ascending in [true, false] {
            assert_eq!(
                store.sort_rows(local, 0, ascending),
                store.sort_rows(dense, 0, ascending),
                "{rows} rows, ascending {ascending}"
            );
        }
    }
}

#[test]
fn mixed_sorts_on_a_local_sheet_match_the_dense_sheet() {
    let (store, dense, local) = twin_sheets(ROWS);
    assert_eq!(
        store.sort_rows(local, 1, true),
        store.sort_rows(dense, 1, true)
    );
}

#[test]
fn edits_on_a_local_sheet_keep_no_dirty_overlay() {
    let (mut store, dense, local) = twin_sheets(SHORT_ROWS);
    for sheet in [dense, local] {
        store.set_number(sheet, 2, 0, 42.0, 0);
        assert!(store.clear_range(sheet, 3, 0, 4, 1, true, false));
        let offsets = [0, 1, 4];
        let status = store.set_sparse_block(
            sheet,
            10,
            0,
            2,
            COLS,
            &offsets,
            &[KIND_NUMBER, KIND_STRING, KIND_NUMBER],
            &[1.5, 0.0, 2.5],
            "x".as_bytes(),
            &[0, 1],
            &[0; 3],
            &[],
            Vec::new(),
            &[],
            &[],
        );
        assert_eq!(status, 0);
    }
    assert_eq!(store.paged_stats(local)[2], 0.0, "no dirty cells");
    assert_eq!(store.cell_state(local, 2, 0), store.cell_state(dense, 2, 0));
    for col in 0..COLS {
        assert_eq!(
            column(&store, local, SHORT_ROWS, col),
            column(&store, dense, SHORT_ROWS, col),
            "column {col}"
        );
    }
}

#[test]
fn a_local_sheet_stays_local_through_a_memory_transfer() {
    use crate::cells::CellStorage;
    use crate::transfer::{Reader, Writer};

    let (store, dense, local) = twin_sheets(SHORT_ROWS);
    let mut out = Writer::new(1);
    store.sheets[local].cells.write_transfer(&mut out);
    let mut input = Reader::new(&out.0, 1).unwrap();
    let restored = CellStorage::read_transfer(&mut input).unwrap();
    input.finish().unwrap();
    assert!(restored.is_local_paged() && !restored.is_datasource_paged());
    assert!(restored.is_fully_loaded());
    let original = &store.sheets[dense].cells;
    for index in 0..SHORT_ROWS * COLS {
        assert_eq!(
            (restored.source_kind_at(index), restored.source_payload_at(index)),
            (original.source_kind_at(index), original.source_payload_at(index)),
            "cell {index}"
        );
    }
}
