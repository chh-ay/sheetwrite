//! Row order of the engine sort against the sort order that Microsoft
//! documents for Excel ("Sort data in a range or table in Excel", section
//! "Learn about sort orders"). Each test sorts one column and checks the
//! data-row permutation for both directions.

use crate::store::CellStore;

const SORT_COLUMN: usize = 0;

/// One cell value of a test column.
enum Entry {
    Number(f64),
    Text(&'static str),
    Bool(bool),
    Formula(&'static str),
    Blank,
}

fn column(entries: &[Entry]) -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(1, entries.len());
    for (row, entry) in entries.iter().enumerate() {
        match entry {
            Entry::Number(value) => store.set_number(sheet, row, SORT_COLUMN, *value, 0),
            Entry::Text(text) => store.set_string(sheet, row, SORT_COLUMN, text, 0),
            Entry::Bool(value) => store.set_bool(sheet, row, SORT_COLUMN, *value, 0),
            Entry::Formula(source) => {
                store.set_formula(sheet, row, SORT_COLUMN, source, 0);
            }
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
fn text_sorts_character_by_character() {
    let (store, sheet) = column(&[Entry::Text("A11"), Entry::Text("A100"), Entry::Text("A1")]);

    assert_eq!(sorted(&store, sheet, true), vec![2, 1, 0]);
    assert_eq!(sorted(&store, sheet, false), vec![0, 1, 2]);
}

#[test]
fn text_characters_follow_the_documented_order() {
    let documented = [
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", " ", "!", "\"", "#", "$", "%", "&", "(",
        ")", "*", ",", ".", "/", ":", ";", "?", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}",
        "~", "+", "<", "=", ">", "A", "B", "Z",
    ];
    let entries: Vec<Entry> = documented
        .iter()
        .rev()
        .map(|text| Entry::Text(text))
        .collect();
    let (store, sheet) = column(&entries);
    let last = documented.len() as u32 - 1;
    let ascending: Vec<u32> = (0..=last).rev().collect();

    assert_eq!(sorted(&store, sheet, true), ascending);
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
fn error_values_are_equal() {
    let (store, sheet) = column(&[
        Entry::Formula("=NA()"),
        Entry::Formula("=1/0"),
        Entry::Formula("=SQRT(-1)"),
    ]);

    assert_eq!(sorted(&store, sheet, true), vec![0, 1, 2]);
    assert_eq!(sorted(&store, sheet, false), vec![0, 1, 2]);
}

#[test]
fn types_sort_as_numbers_text_logical_values_errors_then_blanks() {
    let (store, sheet) = column(&[
        Entry::Blank,
        Entry::Formula("=1/0"),
        Entry::Bool(false),
        Entry::Text("alpha"),
        Entry::Number(7.0),
        Entry::Formula("=\"beta\""),
        Entry::Formula("=TRUE"),
        Entry::Formula("=2+3"),
    ]);

    assert_eq!(sorted(&store, sheet, true), vec![7, 4, 3, 5, 2, 6, 1, 0]);
    assert_eq!(sorted(&store, sheet, false), vec![1, 6, 2, 5, 3, 4, 7, 0]);
}
