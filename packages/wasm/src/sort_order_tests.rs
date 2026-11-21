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

/// A column, its row order ascending and, when checked, descending.
type SortCase<'a> = (&'a str, &'a [Entry], &'a [u32], Option<&'a [u32]>);

#[test]
fn columns_sort_in_the_documented_order() {
    use Entry::{Blank, Bool, Formula, Number, Text};
    let cases: &[SortCase<'_>] = &[
        (
            "numbers from the smallest negative to the largest positive",
            &[Number(3.0), Number(-10.0), Number(0.5), Number(-1.0)],
            &[1, 3, 2, 0],
            Some(&[0, 2, 3, 1]),
        ),
        (
            "text character by character",
            &[Text("A11"), Text("A100"), Text("A1")],
            &[2, 1, 0],
            Some(&[0, 1, 2]),
        ),
        (
            "text ignores case and keeps the original order of equal text",
            &[Text("b"), Text("B"), Text("a"), Text("A")],
            &[2, 3, 0, 1],
            Some(&[0, 1, 2, 3]),
        ),
        (
            "text ignores apostrophes and hyphens, the hyphen last on a tie",
            &[
                Text("co-op"),
                Text("cop"),
                Text("coop"),
                Text("o'clock"),
                Text("oak"),
            ],
            &[2, 0, 1, 4, 3],
            None,
        ),
        (
            "error values are equal",
            &[Formula("=NA()"), Formula("=1/0"), Formula("=SQRT(-1)")],
            &[0, 1, 2],
            Some(&[0, 1, 2]),
        ),
        (
            "numbers, text, logical values, errors, then blanks",
            &[
                Blank,
                Formula("=1/0"),
                Bool(false),
                Text("alpha"),
                Number(7.0),
                Formula("=\"beta\""),
                Formula("=TRUE"),
                Formula("=2+3"),
            ],
            &[7, 4, 3, 5, 2, 6, 1, 0],
            Some(&[1, 6, 2, 5, 3, 4, 7, 0]),
        ),
    ];
    for &(name, entries, ascending, descending) in cases {
        let (store, sheet) = column(entries);
        assert_eq!(sorted(&store, sheet, true), ascending, "{name}");
        if let Some(descending_rows) = descending {
            assert_eq!(sorted(&store, sheet, false), descending_rows, "{name}");
        }
    }
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
    let ascending: Vec<u32> = (0..documented.len() as u32).rev().collect();

    assert_eq!(sorted(&store, sheet, true), ascending);
}
