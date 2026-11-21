//! Function results through formulas in cells, for the tests that cross
//! function families: argument errors in many families at once, information
//! with control functions, criteria with lookups, and number text and
//! wildcards that every function reads alike. A test of one family lives with
//! that family in `eval/`.

use super::*;

#[test]
fn builtin_argument_errors_and_numeric_boundaries_propagate_without_panics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(48, 1);
    let error_formulas = [
        ("=ROUND(\"x\",2)", "#VALUE!"),
        ("=ROUND(1,\"x\")", "#VALUE!"),
        ("=ROUND(1,400)", "#NUM!"),
        ("=MOD(\"x\",2)", "#VALUE!"),
        ("=MOD(1,\"x\")", "#VALUE!"),
        ("=POW(\"x\",2)", "#VALUE!"),
        ("=POW(2,\"x\")", "#VALUE!"),
        ("=FLOOR(\"x\",1)", "#VALUE!"),
        ("=FLOOR(1,\"x\")", "#VALUE!"),
        ("=FLOOR(1,0)", "#DIV/0!"),
        ("=CEILING(\"x\",1)", "#VALUE!"),
        ("=CEILING(1,\"x\")", "#VALUE!"),
        ("=TRUNC(\"x\",1)", "#VALUE!"),
        ("=TRUNC(1,\"x\")", "#VALUE!"),
        ("=TRUNC(1,400)", "#NUM!"),
        ("=AND(TRUE,\"not-bool\")", "#VALUE!"),
        ("=OR(FALSE,\"not-bool\")", "#VALUE!"),
        ("=NOT(\"not-bool\")", "#VALUE!"),
        ("=LEN(1/0)", "#DIV/0!"),
        ("=LEFT(\"abc\",-1)", "#VALUE!"),
        ("=RIGHT(\"abc\",-1)", "#VALUE!"),
        ("=MID(\"abc\",0,1)", "#VALUE!"),
        ("=MID(\"abc\",1,-1)", "#VALUE!"),
        ("=CONCAT(\"ok\",1/0)", "#DIV/0!"),
        ("=UPPER(1/0)", "#DIV/0!"),
        ("=LOWER(1/0)", "#DIV/0!"),
        ("=TRIM(1/0)", "#DIV/0!"),
        ("=TEXT(1,1/0)", "#DIV/0!"),
        ("=DATE(\"x\",1,1)", "#VALUE!"),
        ("=DATE(2024,\"x\",1)", "#VALUE!"),
        ("=DATE(2024,1,\"x\")", "#VALUE!"),
        ("=DATEVALUE(\"not-a-date\")", "#VALUE!"),
        ("=DAY(1/0)", "#DIV/0!"),
        ("=EXACT(1/0,\"x\")", "#DIV/0!"),
        ("=EXACT(\"x\",1/0)", "#DIV/0!"),
    ];
    for (col, (formula, _)) in error_formulas.iter().enumerate() {
        store.set_formula(sheet, 0, col, formula, 0);
    }
    store.set_formula(sheet, 0, 36, "=AVG()", 0);
    store.set_formula(sheet, 0, 37, "=MIN()", 0);
    store.set_formula(sheet, 0, 38, "=MAX()", 0);
    store.set_formula(sheet, 0, 39, "=SIGN(9)", 0);
    store.set_formula(sheet, 0, 40, "=SIGN(0)", 0);
    store.recompute(sheet);

    for (col, (formula, expected)) in error_formulas.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 0, col).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
    for col in 36..=38 {
        assert_close(number(&store, sheet, 0, col), 0.0);
    }
    assert_close(number(&store, sheet, 0, 39), 1.0);
    assert_close(number(&store, sheet, 0, 40), 0.0);
}

#[test]
fn information_and_control_functions_preserve_types_errors_and_lazy_branches() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(24, 1);
    let formulas = [
        "=ISBLANK(A1)",
        "=ISNUMBER(1)",
        "=ISTEXT(\"x\")",
        "=ISLOGICAL(TRUE)",
        "=ISERROR(1/0)",
        "=ISERR(NA())",
        "=ISNA(NA())",
        "=TYPE(\"x\")",
        "=TYPE(1/0)",
        "=N(TRUE)",
        "=T(\"kept\")",
        "=T(7)",
        "=IFNA(NA(),7)",
        "=IFNA(2,1/0)",
        "=IFS(FALSE,1/0,TRUE,8)",
        "=SWITCH(2,1,1/0,2,9,1/0)",
        "=XOR(TRUE,FALSE,TRUE)",
        "=TRUE()",
        "=FALSE()",
    ];
    for (col, source) in formulas.into_iter().enumerate() {
        store.set_formula(sheet, 0, col + 1, source, 0);
    }
    store.recompute(sheet);

    for col in [1, 2, 3, 4, 5, 7, 18] {
        assert_eq!(store.get_cell(sheet, 0, col).kind(), KIND_BOOL);
        assert_close(number(&store, sheet, 0, col), 1.0);
    }
    for col in [6, 17, 19] {
        assert_eq!(store.get_cell(sheet, 0, col).kind(), KIND_BOOL);
        assert_close(number(&store, sheet, 0, col), 0.0);
    }
    assert_close(number(&store, sheet, 0, 8), 2.0);
    assert_close(number(&store, sheet, 0, 9), 16.0);
    assert_close(number(&store, sheet, 0, 10), 1.0);
    assert_eq!(string(&store, sheet, 0, 11).as_deref(), Some("kept"));
    assert_eq!(string(&store, sheet, 0, 12).as_deref(), Some(""));
    assert_close(number(&store, sheet, 0, 13), 7.0);
    assert_close(number(&store, sheet, 0, 14), 2.0);
    assert_close(number(&store, sheet, 0, 15), 8.0);
    assert_close(number(&store, sheet, 0, 16), 9.0);
}

#[test]
fn criteria_and_lookup_validation_preserves_error_precedence_and_shapes() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(48, 3);
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
        store.set_number(sheet, row, 1, value * 10.0, 0);
    }
    let errors = [
        ("=TODAY(1)", "#VALUE!"),
        ("=COUNTIF(A1:A2)", "#VALUE!"),
        ("=COUNTIF(1,\">0\")", "#VALUE!"),
        ("=COUNTIF(A1:A2,1/0)", "#DIV/0!"),
        ("=COUNTIFS()", "#VALUE!"),
        ("=COUNTIFS(A1:A2,\">0\",B1:B3,\">0\")", "#VALUE!"),
        ("=SUMIF(A1:A2)", "#VALUE!"),
        ("=SUMIF(1,\">0\")", "#VALUE!"),
        ("=SUMIFS(A1:A2)", "#VALUE!"),
        ("=SUMIFS(A1:A2,B1:B3,\">0\")", "#VALUE!"),
        ("=AVERAGEIF(A1:A2,\">9\")", "#DIV/0!"),
        ("=INDEX(A1:B2)", "#VALUE!"),
        ("=INDEX(A1:B2,-1,1)", "#VALUE!"),
        ("=INDEX(A1:B2,1)", "#VALUE!"),
        ("=INDEX(A1:B2,9,1)", "#REF!"),
        ("=MATCH(1,A1:B2,0)", "#N/A"),
        ("=MATCH(1,A1:A2,9)", "#VALUE!"),
        ("=MATCH(1/0,A1:A2)", "#DIV/0!"),
        ("=MATCH(1,1)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2)", "#VALUE!"),
        ("=VLOOKUP(1/0,A1:B2,2)", "#DIV/0!"),
        ("=VLOOKUP(1,1,2)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2,0)", "#VALUE!"),
        ("=VLOOKUP(1,A1:B2,2,\"bad\")", "#VALUE!"),
        ("=VLOOKUP(9,A1:B2,2,FALSE)", "#N/A"),
        ("=VLOOKUP(1,A1:B2,9,FALSE)", "#REF!"),
        ("=XLOOKUP(1,A1:A2)", "#VALUE!"),
        ("=XLOOKUP(1/0,A1:A2,B1:B2)", "#DIV/0!"),
        ("=XLOOKUP(1,1,B1:B2)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B3)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B2,,9)", "#VALUE!"),
        ("=XLOOKUP(1,A1:A2,B1:B2,,,0)", "#VALUE!"),
        ("=XLOOKUP(9,A1:A2,B1:B2)", "#N/A"),
    ];
    for (offset, (formula, _)) in errors.iter().enumerate() {
        store.set_formula(sheet, 0, offset + 2, formula, 0);
    }
    store.set_formula(sheet, 0, 36, "=IF(FALSE,1)", 0);
    store.set_formula(sheet, 0, 37, "=IFERROR(1/0)", 0);
    store.recompute(sheet);

    for (offset, (formula, expected)) in errors.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 0, offset + 2).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
    assert_close(number(&store, sheet, 0, 36), 0.0);
    assert_close(number(&store, sheet, 0, 37), 0.0);
}
#[test]
fn criteria_wildcards_approximate_lookup_and_empty_logic_follow_spreadsheet_semantics() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(24, 4);
    for (row, value) in ["Alpha", "a*", "ax", "a~b"].into_iter().enumerate() {
        store.set_string(sheet, row, 0, value, 0);
    }
    for (row, value) in [1.0, 2.0, 3.0, 4.0].into_iter().enumerate() {
        store.set_number(sheet, row, 1, value, 0);
        store.set_number(sheet, row, 2, 4.0 - row as f64, 0);
    }
    let numeric_formulas = [
        "=COUNTIF(A1:A4,\"a?\")",
        "=COUNTIF(A1:A4,\"a~*\")",
        "=COUNTIF(A1:A4,\"a~b\")",
        "=COUNTIF(B1:B4,\">=2\")",
        "=COUNTIF(B1:B4,\"<=2\")",
        "=COUNTIF(B1:B4,\"<>2\")",
        "=COUNTIF(B1:B4,\"=2\")",
        "=SUMIF(B1:B4,\">2\")",
        "=XLOOKUP(\"a*\",A1:A4,B1:B4,,2)",
        "=XLOOKUP(2.5,B1:B4,B1:B4,,-1,2)",
        "=XLOOKUP(2.5,B1:B4,B1:B4,,1,2)",
        "=MATCH(2.5,C1:C4,-1)",
        "=AND()",
        "=OR()",
    ];
    for (offset, formula) in numeric_formulas.iter().enumerate() {
        store.set_formula(sheet, 0, offset + 3, formula, 0);
    }
    let errors = [
        ("=AVG(\"x\")", "#VALUE!"),
        ("=MIN(\"x\")", "#VALUE!"),
        ("=MAX(\"x\")", "#VALUE!"),
        ("=LEFT(1/0,1)", "#DIV/0!"),
        ("=RIGHT(1/0,1)", "#DIV/0!"),
        ("=MID(1/0,1,1)", "#DIV/0!"),
        ("=MID(\"x\",1,1/0)", "#DIV/0!"),
        ("=NA()", "#N/A"),
    ];
    for (offset, (formula, _)) in errors.iter().enumerate() {
        store.set_formula(sheet, 1, offset + 3, formula, 0);
    }
    store.recompute(sheet);

    let expected = [
        2.0, 1.0, 1.0, 3.0, 2.0, 3.0, 1.0, 7.0, 1.0, 2.0, 3.0, 2.0, 1.0, 0.0,
    ];
    for (offset, value) in expected.into_iter().enumerate() {
        let actual = number(&store, sheet, 0, offset + 3);
        assert!(
            (actual - value).abs() < 1e-9,
            "{} expected {value}, got {actual}",
            numeric_formulas[offset]
        );
    }
    for (offset, (formula, expected)) in errors.iter().enumerate() {
        assert_eq!(
            string(&store, sheet, 1, offset + 3).as_deref(),
            Some(*expected),
            "{formula}"
        );
    }
}

/// Number text and wildcards each have one rule, so every function that reads
/// them answers alike: arithmetic and SUM read text the way VALUE does, and
/// criteria, wildcard lookups and SEARCH match patterns the same way.
#[test]
fn number_text_and_wildcards_read_the_same_in_every_function() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(24, 2);
    store.set_string(sheet, 1, 0, "İ", 0);
    store.set_string(sheet, 1, 1, "café", 0);
    store.set_string(sheet, 1, 2, "inf", 0);
    let cases: [(&str, Result<f64, &str>); 24] = [
        // A group separator, a percent and a date read alike everywhere.
        ("=VALUE(\"1,000\")", Ok(1000.0)),
        ("=\"1,000\"+0", Ok(1000.0)),
        ("=SUM(\"1,000\",1)", Ok(1001.0)),
        ("=VALUE(\"50%\")*2", Ok(1.0)),
        ("=\"50%\"*2", Ok(1.0)),
        ("=VALUE(\"2024-01-31\")", Ok(45322.0)),
        ("=\"2024-01-31\"+0", Ok(45322.0)),
        // A date must be the whole text; a time may follow it, or stand alone.
        ("=\"2024-01-31 notes\"+0", Err("#VALUE!")),
        ("=VALUE(\"2024-01-31 notes\")", Err("#VALUE!")),
        ("=DAY(\"2024-01-31 notes\")", Err("#VALUE!")),
        ("=\"2024-01-31 12:00\"+0", Ok(45322.5)),
        ("=VALUE(\"2024-01-31T06:00\")", Ok(45322.25)),
        ("=\"12:00\"*2", Ok(1.0)),
        // A space inside a number is text, as in Excel's VALUE.
        ("=VALUE(\"1 234\")", Err("#VALUE!")),
        ("=\"1 234\"+0", Err("#VALUE!")),
        // `inf` is text to Excel, not an infinite number.
        ("=\"inf\"+0", Err("#VALUE!")),
        ("=DAY(\"inf\")", Err("#VALUE!")),
        ("=COUNTIF(C2,\"inf\")", Ok(1.0)),
        // `?` is one character as written, and case folds per character.
        ("=SEARCH(\"?\",A2)", Ok(1.0)),
        ("=COUNTIF(A2,\"?\")", Ok(1.0)),
        ("=XMATCH(\"?\",A2:A2,2)", Ok(1.0)),
        ("=SEARCH(\"CAFÉ\",B2)", Ok(1.0)),
        ("=COUNTIF(B2,\"CAF?\")", Ok(1.0)),
        ("=XMATCH(\"CAFÉ\",B2:B2,2)", Ok(1.0)),
    ];
    for (col, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(sheet, 0, col, formula, 0);
    }
    store.recompute(sheet);

    for (col, (formula, expected)) in cases.iter().enumerate() {
        match expected {
            Ok(value) => {
                let actual = number(&store, sheet, 0, col);
                assert!(
                    (actual - value).abs() < 1e-9,
                    "{formula} expected {value}, got {actual} ({:?})",
                    string(&store, sheet, 0, col)
                );
            }
            Err(error) => assert_eq!(
                string(&store, sheet, 0, col).as_deref(),
                Some(*error),
                "{formula}"
            ),
        }
    }
}
