//! A coordinate model checks rows independently of page layout and directories.

use super::super::{PagedStorage, NONE};
use crate::types::KIND_NUMBER;

#[derive(Clone, Copy, Debug, PartialEq)]
struct ModelCell {
    payload: u64,
    style: u32,
    revision: Option<u64>,
}

type ModelColumns = [Vec<Option<ModelCell>>];

fn next(seed: &mut u32, bound: usize) -> usize {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 17;
    *seed ^= *seed << 5;
    *seed as usize % bound
}

fn check(storage: &PagedStorage, columns: &ModelColumns) {
    for (col, cells) in columns.iter().enumerate() {
        for (row, expected) in cells.iter().enumerate() {
            let actual = storage.read(row, col);
            match expected {
                Some(cell) => assert_eq!(
                    actual,
                    (
                        KIND_NUMBER,
                        cell.payload,
                        cell.style,
                        true,
                        cell.revision.is_some()
                    ),
                    "row {row}, col {col}"
                ),
                None => assert!(!actual.3, "row {row}, col {col} should be unloaded"),
            }
        }
        for (start, end) in [
            (0, cells.len() - 1),
            (0, 0),
            (cells.len() / 2, cells.len() - 1),
        ] {
            assert_eq!(
                storage.range_loaded(start, col, end, col),
                cells[start..=end].iter().all(Option::is_some)
            );
        }
    }
    assert_eq!(
        storage.loaded_cells(),
        columns
            .iter()
            .flatten()
            .filter(|cell| cell.is_some())
            .count()
    );
}

#[test]
fn insert_delete_keep_loaded_cells_styles_and_revision_ownership() {
    let mut seed = 0x9E37_79B9;
    for chunk in [1, 4, 64, 128, 4096] {
        for _ in 0..32 {
            let mut rows = 129 + next(&mut seed, 200);
            let mut columns = vec![vec![None; rows]; 3];
            let mut storage = PagedStorage::new(chunk, 0, rows * columns.len()).unwrap();
            for (col, cells) in columns.iter_mut().enumerate() {
                for (row, expected) in cells.iter_mut().enumerate() {
                    if next(&mut seed, 3) == 0 {
                        continue;
                    }
                    let revision = (next(&mut seed, 3) == 0).then(|| 1 + next(&mut seed, 3) as u64);
                    let cell = ModelCell {
                        payload: next(&mut seed, 1000) as u64,
                        style: next(&mut seed, 4) as u32,
                        revision,
                    };
                    assert!(storage.write(
                        row,
                        col,
                        KIND_NUMBER,
                        cell.payload,
                        cell.style,
                        revision
                    ));
                    *expected = Some(cell);
                }
            }
            for _ in 0..8 {
                let at = next(&mut seed, rows);
                let count = 1 + next(&mut seed, chunk * 2 + 3);
                if next(&mut seed, 2) == 0 {
                    storage.move_rows(at, at + count, rows);
                    for cells in &mut columns {
                        cells.splice(at..at, vec![None; count]);
                    }
                    rows += count;
                } else {
                    let removed = count.min(rows - at).min(rows - 1);
                    storage.move_rows(at + removed, at, rows);
                    for cells in &mut columns {
                        cells.drain(at..at + removed);
                    }
                    rows -= removed;
                }
                check(&storage, &columns);
            }
            for revision in 1..=3 {
                storage.acknowledge_revision(revision);
                for cell in columns.iter_mut().flatten().flatten() {
                    if cell.revision == Some(revision) {
                        cell.revision = None;
                    }
                }
                check(&storage, &columns);
            }
        }
    }
}

#[test]
fn row_edit_keeps_read_and_viewport_pins_and_unpinned_access_order() {
    let mut storage = PagedStorage::new(4, 0, 10).unwrap();
    for page in 0..4 {
        assert!(storage.hydrate(page * 4, 0, KIND_NUMBER, page as u64, 0));
    }
    storage.pin_viewport_bands(&[0, 4, 0, 1]);
    storage.pin_read_window(4, 8, &[], &[0]);
    storage.read(8, 0); // Page 3, not page 2, is the oldest unpinned page.
    storage.move_rows(16, 17, 16);
    storage.byte_budget = storage.chunk_bytes() * 4;
    assert!(storage.hydrate(20, 0, KIND_NUMBER, 5, 0));
    assert!(storage.clean_loaded(0, 0));
    assert!(storage.clean_loaded(4, 0));
    assert!(storage.clean_loaded(8, 0));
    assert_eq!(storage.page_id(0, 3), NONE);
}

#[test]
fn loaded_checks_cover_dirty_holes_without_refreshing_access_order() {
    let mut storage = PagedStorage::new(128, 0, 4).unwrap();
    for row in 0..256 {
        if row != 63 && row != 127 {
            assert!(storage.hydrate(row, 0, KIND_NUMBER, row as u64, 0));
        }
    }
    assert!(!storage.range_loaded(1, 0, 255, 0));
    for row in [63, 127] {
        assert!(storage.write(row, 0, KIND_NUMBER, 7, 0, Some(1)));
    }
    assert!(storage.range_loaded(1, 0, 255, 0));
    storage.read(0, 0);
    assert!(storage.range_loaded(128, 0, 255, 0));
    storage.byte_budget = 2 * storage.chunk_bytes();
    assert!(storage.hydrate(256, 0, KIND_NUMBER, 9, 0));
    assert!(storage.clean_loaded(0, 0));
    assert!(!storage.clean_loaded(128, 0));
}

#[test]
fn widely_separated_sparse_pages_move_without_loading_the_gap() {
    let mut storage = PagedStorage::new(64, 0, 4).unwrap();
    let last = 1_000_000_000;
    assert!(storage.hydrate(1, 0, KIND_NUMBER, 10, 0));
    assert!(storage.hydrate(last, 0, KIND_NUMBER, 20, 3));
    assert!(storage.write(last - 1, 0, KIND_NUMBER, 30, 4, Some(7)));
    storage.move_rows(1, 1_000_001, last + 1);
    assert_eq!(storage.loaded_cells(), 3);
    assert!(storage.resident_chunks() <= 3);
    assert!(!storage.range_loaded(1, 0, 1_000_000, 0));
    assert_eq!(storage.read(1_000_001, 0).1, 10);
    assert_eq!(
        storage.read(last + 1_000_000, 0),
        (KIND_NUMBER, 20, 3, true, false)
    );
    storage.move_rows(1_000_001, 1, last + 1_000_001);
    assert_eq!(storage.read(last, 0), (KIND_NUMBER, 20, 3, true, false));
    assert_eq!(storage.read(last - 1, 0), (KIND_NUMBER, 30, 4, true, true));
}
