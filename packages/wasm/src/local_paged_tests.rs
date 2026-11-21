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
    assert!(
        store.sheets[local].cells.is_local_paged(),
        "the copy converts"
    );
    (store, dense, local)
}

/// Each cell's kind, number and text.
type ColumnCells = Vec<(u8, f64, Option<String>)>;

fn column(store: &CellStore, sheet: usize, rows: usize, col: usize) -> ColumnCells {
    (0..rows)
        .map(|row| {
            let cell = store.get_cell(sheet, row, col);
            (cell.kind(), cell.num(), cell.string())
        })
        .collect()
}

#[test]
fn sorts_on_a_local_sheet_match_the_dense_sheet() {
    for rows in [SORT_ROWS, SHORT_ROWS] {
        let (store, dense, local) = twin_sheets(rows);
        for ascending in [true, false] {
            assert_eq!(
                store.sort_rows(local, 0, ascending),
                store.sort_rows(dense, 0, ascending),
                "numbers, {rows} rows, ascending {ascending}"
            );
        }
        assert_eq!(
            store.sort_rows(local, 1, true),
            store.sort_rows(dense, 1, true),
            "text and blanks, {rows} rows"
        );
    }
}

#[test]
fn edits_on_a_local_sheet_keep_no_dirty_overlay() {
    let (mut store, dense, local) = twin_sheets(SHORT_ROWS);
    // A local sheet is not paged: it loads no pages and is always loaded.
    assert!(!store.is_paged(dense));
    assert!(!store.is_paged(local));
    assert!(store.range_fully_loaded(local, 0, 0, SHORT_ROWS - 1, COLS - 1));
    assert_eq!(store.paged_stats(local)[4], 1.0, "fully loaded");

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
            b"x",
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
            (
                restored.source_kind_at(index),
                restored.source_payload_at(index)
            ),
            (
                original.source_kind_at(index),
                original.source_payload_at(index)
            ),
            "cell {index}"
        );
    }
}

#[test]
fn lookups_on_a_local_sheet_match_the_dense_sheet() {
    let (mut store, dense, local) = twin_sheets(ROWS);
    let lookups = [
        "=VLOOKUP(A100,A1:B9000,2,FALSE)",
        "=VLOOKUP(500,A1:B9000,1,TRUE)",
        "=MATCH(A4000,A1:A9000,0)",
        "=XMATCH(\"k5\",B1:B9000)",
        "=XLOOKUP(\"k12\",B1:B9000,A1:A9000,\"none\")",
        "=XLOOKUP(-1,A1:A9000,B1:B9000,\"none\")",
        "=HLOOKUP(A1,A1:C3,2,FALSE)",
        "=INDEX(A1:B9000,MATCH(A2500,A1:A9000,0),2)",
        "=COUNTIF(B1:B9000,\"k1*\")",
    ];
    for sheet in [dense, local] {
        // An edit the range reads, so `=SUM(A1:A9000)` in C1 reads again.
        store.set_number(sheet, 5, 0, 1_000.0, 0);
        for (row, source) in lookups.iter().enumerate() {
            store.set_formula(sheet, row + 1, 2, source, 0);
            // A second formula over the same range shares the pass's index.
            store.set_formula(sheet, row + 21, 2, source, 0);
        }
        store.recompute(sheet);
    }
    let cell = |sheet, row| {
        let out = store.get_cell(sheet, row, 2);
        (out.kind(), out.num(), out.string())
    };
    assert_eq!(cell(local, 0), cell(dense, 0), "=SUM(A1:A9000)");
    for (index, source) in lookups.iter().enumerate() {
        for row in [index + 1, index + 21] {
            assert_eq!(cell(local, row), cell(dense, row), "{source}");
        }
    }
}

#[test]
fn column_folds_over_absent_local_pages_match_the_dense_sheet() {
    let mut store = CellStore::new();
    let dense = store.add_sheet(COLS, ROWS);
    let local = store.add_sheet(COLS, ROWS);
    for sheet in [dense, local] {
        // Only the first and last pages of column A hold a cell.
        store.set_number(sheet, 0, 0, 2.5, 0);
        store.set_number(sheet, ROWS - 1, 0, -4.0, 0);
    }
    store.convert_sheet_to_local_paged(local);
    let folds = [
        "=SUM(A1:A9000)",
        "=COUNT(A1:A9000)",
        "=COUNTA(A1:A9000)",
        "=MIN(A2:A9000)",
    ];
    for sheet in [dense, local] {
        for (row, source) in folds.iter().enumerate() {
            store.set_formula(sheet, row, 1, source, 0);
        }
        store.recompute(sheet);
    }
    for (row, source) in folds.iter().enumerate() {
        assert_eq!(
            store.get_cell(local, row, 1).num(),
            store.get_cell(dense, row, 1).num(),
            "{source}"
        );
    }
}

#[test]
fn a_memory_transfer_drops_the_rows_of_free_local_pages() {
    use crate::cells::CellStorage;
    use crate::transfer::{Reader, Writer};

    // Two pages of 4,096 rows; deleting the second frees its page.
    let mut cells = CellStorage::try_new_local(1, 8_192).unwrap();
    for row in [0, 5_000] {
        assert!(cells.write_cell(row, 0, KIND_NUMBER, 7, 0, None), "write");
    }
    cells.delete_rows(4_096, 4_096).unwrap();
    let transfer = |cells: &CellStorage| {
        let mut out = Writer::new(1);
        cells.write_transfer(&mut out);
        out.0
    };
    let before = transfer(&cells);
    let mut input = Reader::new(&before, 1).unwrap();
    let mut restored = CellStorage::read_transfer(&mut input).unwrap();
    input.finish().unwrap();
    assert!(
        // One page holds 13 bytes a row; the other page is free.
        before.len() < 2 * 4_096 * 13,
        "the free page's rows stay behind: {} bytes",
        before.len()
    );

    // Growing again reuses the free page with whole, empty arrays.
    restored.insert_rows(4_096, 4_096).unwrap();
    assert!(
        restored.write_cell(6_000, 0, KIND_NUMBER, 9, 0, None),
        "write"
    );
    assert_eq!(restored.source_payload_at(0), 7);
    assert_eq!(restored.source_payload_at(6_000), 9);
    assert_eq!(restored.source_kind_at(5_000), crate::types::KIND_EMPTY);
}
