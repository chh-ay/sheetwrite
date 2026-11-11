//! Row order of the engine sort against the sort order that Microsoft
//! documents for Excel ("Sort data in a range or table in Excel", section
//! "Learn about sort orders"). Each test sorts one column and checks the
//! data-row permutation for both directions.

use crate::query::{ComparableCell, SortKeyBuilder};
use crate::store::CellStore;

const SORT_COLUMN: usize = 0;

/// One cell value of a test column.
enum Entry {
    Number(f64),
    Text(&'static str),
    Blank,
}

fn column(entries: &[Entry]) -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, entries.len());
    for (row, entry) in entries.iter().enumerate() {
        match entry {
            Entry::Number(value) => store.set_number(sheet, row, SORT_COLUMN, *value, 0),
            Entry::Text(text) => store.set_string(sheet, row, SORT_COLUMN, text, 0),
            Entry::Blank => {}
        }
    }
    store.recompute(sheet);
    (store, sheet)
}

/// The single-key path and the multi-key path must give the same order.
fn sorted(store: &CellStore, sheet: usize, ascending: bool) -> Vec<u32> {
    let single = store.sort_rows(sheet, SORT_COLUMN, ascending);
    let candidates: Vec<u32> = (0..single.len() as u32).collect();
    let multi = store.sort_rows_multi(
        sheet,
        &[SORT_COLUMN as u32],
        &[u8::from(ascending)],
        &candidates,
    );
    assert_eq!(single, multi, "single-key and multi-key order differ");
    single
}

#[test]
fn numbers_sort_from_the_smallest_negative_to_the_largest_positive() {
    let (store, sheet) = column(&[
        Entry::Number(3.0),
        Entry::Number(-10.0),
        Entry::Number(0.5),
        Entry::Number(-1.0),
    ]);

    assert_eq!(sorted(&store, sheet, true), vec![1, 3, 2, 0]);
    assert_eq!(sorted(&store, sheet, false), vec![0, 2, 3, 1]);
}

#[test]
fn text_ignores_case_and_keeps_the_original_order_of_equal_text() {
    let (store, sheet) = column(&[
        Entry::Text("b"),
        Entry::Text("B"),
        Entry::Text("a"),
        Entry::Text("A"),
    ]);

    assert_eq!(sorted(&store, sheet, true), vec![2, 3, 0, 1]);
    assert_eq!(sorted(&store, sheet, false), vec![0, 1, 2, 3]);
}

#[test]
fn text_ignores_apostrophes_and_hyphens_and_puts_the_hyphen_last_on_a_tie() {
    let (store, sheet) = column(&[
        Entry::Text("co-op"),
        Entry::Text("cop"),
        Entry::Text("coop"),
        Entry::Text("o'clock"),
        Entry::Text("oak"),
    ]);

    assert_eq!(sorted(&store, sheet, true), vec![2, 0, 1, 4, 3]);
}

#[test]
fn blank_cells_are_last_in_both_directions() {
    let (store, sheet) = column(&[Entry::Blank, Entry::Number(2.0), Entry::Number(1.0)]);

    assert_eq!(sorted(&store, sheet, true), vec![2, 1, 0]);
    assert_eq!(sorted(&store, sheet, false), vec![1, 2, 0]);
}

/// Each distinct pool string is collated once: the arena holds one byte per
/// collated ASCII character of the distinct strings, whatever the row count.
#[test]
fn each_distinct_string_is_collated_once() {
    const ROWS: usize = 100_000;
    const DISTINCT_LABELS: usize = 5_000;
    const SPAN_AND_ID_BYTES: usize = 16;

    let labels: Vec<String> = (0..DISTINCT_LABELS)
        .map(|label| format!("item-{label}"))
        .collect();
    let mut keys = SortKeyBuilder::with_capacity(ROWS);
    for row in 0..ROWS {
        let id = row % DISTINCT_LABELS;
        keys.push(ComparableCell::Text {
            id: id as u32,
            text: &labels[id],
        });
    }

    let collated: usize = labels.iter().map(|label| label.len() - 1).sum();
    assert_eq!(keys.arena_len(), collated);
    assert!(keys.collation_bytes() < 2 * (collated + DISTINCT_LABELS * SPAN_AND_ID_BYTES));
}
