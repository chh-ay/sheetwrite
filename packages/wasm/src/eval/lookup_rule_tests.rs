//! Lookup results that must not drift: duplicates, text order, mixed types,
//! errors and search directions. Each formula runs once alone and once with
//! several copies, so both the single-reader path and the shared search of a
//! range with many readers give the listed result.

use crate::store::CellStore;

/// Copies of a formula that make its ranges shared by several readers.
const SHARED_COPIES: usize = 4;

/// Columns: A mixed list, B ascending numbers with duplicates, C ascending
/// text, D a list with an error, E results, F a list with formula cells, G
/// descending numbers. Rows 1-10.
fn store() -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(12, 20);

    // A: 3, "b", TRUE, blank, 0, "B", 3, "", FALSE, 2.5
    store.set_number(sheet, 0, 0, 3.0, 0);
    store.set_string(sheet, 1, 0, "b", 0);
    store.set_bool(sheet, 2, 0, true, 0);
    store.set_number(sheet, 4, 0, 0.0, 0);
    store.set_string(sheet, 5, 0, "B", 0);
    store.set_number(sheet, 6, 0, 3.0, 0);
    store.set_string(sheet, 7, 0, "", 0);
    store.set_bool(sheet, 8, 0, false, 0);
    store.set_number(sheet, 9, 0, 2.5, 0);

    for (row, value) in [1.0, 2.0, 2.0, 3.0, 5.0, 8.0].into_iter().enumerate() {
        store.set_number(sheet, row, 1, value, 0);
    }
    for (row, text) in ["apple", "Banana", "banana", "cherry", "date", "fig"]
        .into_iter()
        .enumerate()
    {
        store.set_string(sheet, row, 2, text, 0);
    }

    store.set_number(sheet, 0, 3, 1.0, 0);
    store.set_formula(sheet, 1, 3, "=1/0", 0);
    store.set_number(sheet, 2, 3, 3.0, 0);
    store.set_number(sheet, 3, 3, 4.0, 0);

    for row in 0..10 {
        store.set_number(sheet, row, 4, ((row + 1) * 10) as f64, 0);
    }

    store.set_formula(sheet, 0, 5, "=1+1", 0);
    store.set_number(sheet, 1, 5, 5.0, 0);
    store.set_formula(sheet, 2, 5, "=B2*3", 0);
    store.set_number(sheet, 3, 5, 7.0, 0);

    for (row, value) in [9.0, 7.0, 7.0, 4.0, 2.0, 1.0].into_iter().enumerate() {
        store.set_number(sheet, row, 6, value, 0);
    }

    // H: 1, an infinity (read as `#NUM!`), 2.
    store.set_number(sheet, 0, 7, 1.0, 0);
    store.set_number(sheet, 1, 7, f64::INFINITY, 0);
    store.set_number(sheet, 2, 7, 2.0, 0);
    (store, sheet)
}

/// The displayed result of `source` with `copies` identical formulas.
fn result(source: &str, copies: usize) -> String {
    let (mut store, sheet) = store();
    for copy in 0..copies {
        store.set_formula(sheet, copy, 10, source, 0);
    }
    store.recompute(sheet);
    let results: Vec<String> = (0..copies)
        .map(|copy| {
            let cell = store.get_cell(sheet, copy, 10);
            cell.string().unwrap_or_else(|| cell.num().to_string())
        })
        .collect();
    assert!(
        results.iter().all(|value| value == &results[0]),
        "{source}: copies disagree: {results:?}"
    );
    results[0].clone()
}

const CASES: &[(&str, &str)] = &[
    // Duplicates: the first match forwards, the last in reverse.
    ("=MATCH(3,A1:A10,0)", "1"),
    ("=XMATCH(3,A1:A10,0,-1)", "7"),
    ("=XMATCH(2,B1:B6,0,1)", "2"),
    ("=XMATCH(2,B1:B6,0,-1)", "3"),
    ("=XMATCH(2,B1:B6,0,2)", "2"),
    ("=XMATCH(2,B1:B6,0,-2)", "#N/A"),
    ("=XLOOKUP(3,A1:A10,E1:E10,\"none\",0,-1)", "70"),
    // Text matches without case, in a mixed list and a sorted one.
    ("=MATCH(\"B\",A1:A10,0)", "2"),
    ("=XMATCH(\"b\",A1:A10,0,-1)", "6"),
    ("=MATCH(\"BANANA\",C1:C6,0)", "2"),
    ("=XMATCH(\"banana\",C1:C6,0,-1)", "3"),
    ("=VLOOKUP(\"Cherry\",C1:E6,3,FALSE)", "40"),
    // Blank, 0, "" and FALSE.
    ("=MATCH(0,A1:A10,0)", "4"),
    ("=MATCH(FALSE,A1:A10,0)", "4"),
    ("=MATCH(\"\",A1:A10,0)", "4"),
    ("=XMATCH(0,A1:A10,0,-1)", "5"),
    ("=XMATCH(FALSE,A1:A10,0,-1)", "9"),
    ("=XMATCH(\"\",A1:A10,0,-1)", "8"),
    ("=MATCH(TRUE,A1:A10,0)", "3"),
    ("=MATCH(2.5,A1:A10,0)", "10"),
    ("=MATCH(4,A1:A10,0)", "#N/A"),
    ("=MATCH(\"c\",A1:A10,0)", "#N/A"),
    // Approximate matches, both directions and both list orders. A sorted
    // search answers with the first position of the nearest value.
    ("=MATCH(2.5,B1:B6,1)", "2"),
    ("=MATCH(0,B1:B6,1)", "#N/A"),
    ("=MATCH(9,B1:B6,1)", "6"),
    ("=VLOOKUP(4,B1:E6,4,TRUE)", "40"),
    ("=MATCH(\"c\",C1:C6,1)", "2"),
    ("=MATCH(\"zz\",C1:C6,1)", "6"),
    ("=MATCH(5,G1:G6,-1)", "2"),
    ("=MATCH(10,G1:G6,-1)", "#N/A"),
    ("=XLOOKUP(6,B1:B6,E1:E6,\"none\",1)", "60"),
    ("=XLOOKUP(6,B1:B6,E1:E6,\"none\",-1)", "50"),
    ("=XLOOKUP(2.5,A1:A10,E1:E10,\"none\",1)", "100"),
    ("=XLOOKUP(2.6,A1:A10,E1:E10,\"none\",-1)", "100"),
    ("=XLOOKUP(6,B1:B6,E1:E6,\"none\",-1,2)", "50"),
    ("=XLOOKUP(6,G1:G6,E1:E6,\"none\",-1,-2)", "40"),
    ("=XLOOKUP(6,G1:G6,E1:E6,\"none\",1,-2)", "20"),
    // Binary search on a list in the wrong order.
    ("=XMATCH(5,G1:G6,0,2)", "#N/A"),
    ("=XMATCH(3,B1:B6,0,-2)", "#N/A"),
    // Mixed keys against a typed list.
    ("=MATCH(\"2\",B1:B6,0)", "#N/A"),
    ("=MATCH(TRUE,B1:B6,0)", "#N/A"),
    ("=MATCH(2,C1:C6,1)", "#N/A"),
    ("=VLOOKUP(\"x\",B1:E6,2,TRUE)", "fig"),
    // Errors in the list and in the key.
    ("=MATCH(3,D1:D4,0)", "#DIV/0!"),
    ("=MATCH(1,D1:D4,0)", "1"),
    ("=MATCH(5,D1:D4,1)", "#DIV/0!"),
    ("=XMATCH(4,D1:D4,0,-1)", "4"),
    ("=MATCH(1/0,B1:B6,0)", "#DIV/0!"),
    ("=XLOOKUP(1/0,B1:B6,E1:E6)", "#DIV/0!"),
    // Lists with formula cells.
    ("=MATCH(6,F1:F4,0)", "3"),
    ("=VLOOKUP(2,F1:F4,1,FALSE)", "2"),
    ("=XLOOKUP(7,F1:F4,E1:E4)", "40"),
    // Wildcards.
    ("=XMATCH(\"b*\",C1:C6,2)", "2"),
    ("=XMATCH(\"?a*\",C1:C6,2,-1)", "5"),
    ("=XLOOKUP(\"*e\",C1:C6,E1:E6,\"none\",2)", "10"),
    ("=XMATCH(\"*\",A1:A10,2)", "2"),
    // Result index and shape errors.
    ("=VLOOKUP(3,B1:E6,5,FALSE)", "#REF!"),
    ("=VLOOKUP(3,B1:E6,0,FALSE)", "#VALUE!"),
    ("=HLOOKUP(2,B1:E1,2,FALSE)", "#N/A"),
    ("=HLOOKUP(10,B1:E1,2,FALSE)", "#REF!"),
    ("=HLOOKUP(\"apple\",C1:E2,2,FALSE)", "Banana"),
    // A non-finite number fails a scan that reaches it, in either direction.
    ("=MATCH(1,H1:H3,0)", "1"),
    ("=MATCH(2,H1:H3,0)", "#NUM!"),
    ("=XMATCH(2,H1:H3,0,-1)", "3"),
    ("=XMATCH(1,H1:H3,0,-1)", "#NUM!"),
    ("=XLOOKUP(3,B1:B6,E1:E5)", "#VALUE!"),
    ("=MATCH(3,B1:C6,0)", "#N/A"),
    ("=XLOOKUP(99,B1:B6,E1:E6)", "#N/A"),
    ("=XLOOKUP(99,B1:B6,E1:E6,\"none\")", "none"),
];

#[test]
fn lookup_results_match_the_recorded_rules() {
    let mut failures = Vec::new();
    for &(source, expected) in CASES {
        for copies in [1, SHARED_COPIES] {
            let actual = result(source, copies);
            if actual != expected {
                failures.push(format!(
                    "{source} x{copies}: expected {expected}, got {actual}"
                ));
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
