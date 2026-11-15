//! Function results through formulas in cells: text, date, information,
//! control, criteria and lookup functions.

use super::*;

#[test]
fn text_functions_surface_string_and_boolean_values() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 16);
    let formulas = [
        (0, r#"="Hello ""Q""""#),
        (1, r#"=LEN("Hello")"#),
        (2, r#"=LEFT("abcdef",3)"#),
        (3, r#"=RIGHT("abcdef",3)"#),
        (4, r#"=MID("abcdef",2,3)"#),
        (5, r#"=CONCAT("A",1,TRUE)"#),
        (6, r#"=CONCATENATE("x","y")"#),
        (7, r#"=UPPER("MiX")"#),
        (8, r#"=LOWER("MiX")"#),
        (9, r#"=TRIM("  a   b  ")"#),
        (10, r#"=TEXT(12.345,"0.00")"#),
        (11, r#"=EXACT("Hi","Hi")"#),
        (12, r#"=EXACT("Hi","hi")"#),
    ];
    for (row, src) in formulas {
        store.set_formula(sheet, row, 0, src, 0);
    }
    store.recompute(sheet);

    assert_eq!(store.get_cell(sheet, 0, 0).kind(), KIND_STRING);
    assert_eq!(string(&store, sheet, 0, 0).as_deref(), Some("Hello \"Q\""));

    let length = store.get_cell(sheet, 1, 0);
    assert_eq!((length.kind(), length.num()), (KIND_FORMULA, 5.0));

    assert_eq!(string(&store, sheet, 2, 0).as_deref(), Some("abc"));
    assert_eq!(string(&store, sheet, 3, 0).as_deref(), Some("def"));
    assert_eq!(string(&store, sheet, 4, 0).as_deref(), Some("bcd"));
    assert_eq!(string(&store, sheet, 5, 0).as_deref(), Some("A1TRUE"));
    assert_eq!(string(&store, sheet, 6, 0).as_deref(), Some("xy"));
    assert_eq!(string(&store, sheet, 7, 0).as_deref(), Some("MIX"));
    assert_eq!(string(&store, sheet, 8, 0).as_deref(), Some("mix"));
    assert_eq!(string(&store, sheet, 9, 0).as_deref(), Some("a b"));
    assert_eq!(string(&store, sheet, 10, 0).as_deref(), Some("12.35"));
    assert_eq!(store.get_cell(sheet, 11, 0).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 11, 0), 1.0);
    assert_eq!(store.get_cell(sheet, 12, 0).kind(), KIND_BOOL);
    assert_close(number(&store, sheet, 12, 0), 0.0);
}

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
fn date_time_functions_use_excel_serials_and_controlled_volatile_inputs() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(13, 1);
    let formulas = [
        (0, "=DATE(2024,2,29)"),
        (1, "=DATEVALUE(\"2024-02-29\")"),
        (2, "=DAY(A1)"),
        (3, "=MONTH(A1)"),
        (4, "=YEAR(A1)"),
        (5, "=TEXT(A1,\"yyyy-mm-dd\")"),
        (6, "=TODAY()"),
        (7, "=NOW()"),
        (8, "=DATE(1900,1,1)"),
        (9, "=DATE(1900,2,29)"),
        (10, "=DATE(1900,3,1)"),
        (11, "=DATE(2024,13,1)"),
        (12, "=DATE(1900,1,60)"),
    ];
    for (col, source) in formulas {
        store.set_formula(sheet, 0, col, source, 0);
    }
    store.recompute_volatile(46_000.75);

    assert_close(number(&store, sheet, 0, 0), 45_351.0);
    assert_close(number(&store, sheet, 0, 1), 45_351.0);
    assert_close(number(&store, sheet, 0, 2), 29.0);
    assert_close(number(&store, sheet, 0, 3), 2.0);
    assert_close(number(&store, sheet, 0, 4), 2024.0);
    assert_eq!(string(&store, sheet, 0, 5).as_deref(), Some("2024-02-29"));
    assert_close(number(&store, sheet, 0, 6), 46_000.0);
    assert_close(number(&store, sheet, 0, 7), 46_000.75);
    assert_close(number(&store, sheet, 0, 8), 1.0);
    assert_close(number(&store, sheet, 0, 9), 60.0);
    assert_close(number(&store, sheet, 0, 10), 61.0);
    assert_close(number(&store, sheet, 0, 11), 45_658.0);
    assert_close(number(&store, sheet, 0, 12), 60.0);
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

#[test]
fn match_cache_handles_repeats_eviction_and_collisions() {
    let mut store = CellStore::new();
    // More distinct values than MATCH_CACHE_SLOTS (1024) so str_ids collide
    // mod slot count and evict each other mid-scan.
    let rows = 3000usize;
    let sheet = store.add_sheet(2, rows);
    for r in 0..rows {
        store.set_string(sheet, r, 0, &format!("item{r}"), 0);
        store.set_string(sheet, r, 1, if r % 3 == 0 { "Tokyo" } else { "Berlin" }, 0);
    }

    // Unique column: a colliding/evicting cache must still equal a brute scan.
    let expected: Vec<u32> = (0..rows)
        .filter(|r| format!("item{r}").contains('7'))
        .map(|r| r as u32)
        .collect();
    assert_eq!(store.filter_rows(sheet, 0, "7"), expected);

    let tokyo: Vec<u32> = (0..rows).step_by(3).map(|r| r as u32).collect();
    assert_eq!(store.filter_rows(sheet, 1, "tokyo"), tokyo);
}

#[test]
fn scalar_index_does_not_charge_unselected_text_to_its_result_budget() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(2, 72);
    store.set_string(sheet, 0, 0, "short", 0);
    let long = "x".repeat(1024 * 1024);
    for row in 1..72 {
        store.set_string(sheet, row, 0, &long, 0);
    }
    store.set_formula(sheet, 0, 1, "=INDEX(A1:A72,1)", 0);
    store.recompute(sheet);
    assert_eq!(string(&store, sheet, 0, 1).as_deref(), Some("short"));
}

/// Lookup results through the public formula surface: duplicates, sorted-mode
/// validation, the blank/zero/empty/`FALSE` equivalences, case folding and
/// error precedence.
mod lookup_results {
    use super::{assert_close, number};
    use crate::CellStore;

    #[test]
    fn keys_compare_like_the_engine_for_blank_zero_empty_and_case() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        store.set_number(sheet, 0, 0, 0.0, 0);
        store.set_string(sheet, 2, 0, "", 0);
        store.set_bool(sheet, 3, 0, false, 0);
        store.set_string(sheet, 4, 0, "café", 0);
        store.set_string(sheet, 5, 0, "Key", 0);
        for row in 0..6 {
            store.set_number(sheet, row, 1, (row + 1) as f64, 0);
        }
        store.set_formula(sheet, 0, 2, "=VLOOKUP(0,A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 1, 2, "=VLOOKUP(\"\",A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 2, 2, "=VLOOKUP(FALSE,A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 3, 2, "=VLOOKUP(\"CAFÉ\",A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 4, 2, "=VLOOKUP(\"key\",A1:B6,2,FALSE)", 0);
        store.set_formula(sheet, 5, 2, "=XMATCH(\"k*\",A1:A6,2)", 0);
        store.recompute(sheet);
        assert_close(number(&store, sheet, 0, 2), 1.0);
        assert_close(number(&store, sheet, 1, 2), 2.0);
        assert_close(number(&store, sheet, 2, 2), 2.0);
        assert_close(number(&store, sheet, 3, 2), 5.0);
        assert_close(number(&store, sheet, 4, 2), 6.0);
        assert_close(number(&store, sheet, 5, 2), 6.0);
    }
}

/// FORMULATEXT, ISFORMULA, HYPERLINK and CELL describe a referenced cell or
/// return a display value.
mod cell_information {
    use super::*;

    fn bool_at(store: &CellStore, sheet: usize, col: usize) -> bool {
        assert_eq!(store.get_cell(sheet, 0, col).kind(), KIND_BOOL, "col {col}");
        number(store, sheet, 0, col) != 0.0
    }

    #[test]
    fn information_functions_read_formula_sources_and_cell_facts() {
        let mut store = CellStore::new();
        let data = store.add_sheet(2, 4);
        store.set_sheet_name(data, "data", "Data");
        let main = store.add_sheet(32, 3);
        store.set_sheet_name(main, "main", "Main");
        store.set_number(data, 0, 0, 5.0, 0);
        store.set_formula(data, 1, 0, "=A1*2", 0);
        store.set_string(data, 2, 0, "label", 0);

        let texts = [
            (0, "=FORMULATEXT(Data!A2)", "=A1*2"),
            (1, "=FORMULATEXT(Data!A1)", "#N/A"),
            (2, "=FORMULATEXT(Data!A4)", "#N/A"),
            (3, "=FORMULATEXT(1)", "#VALUE!"),
            (4, "=FORMULATEXT(1/0)", "#DIV/0!"),
            (5, "=FORMULATEXT(Data!A2:A3)", "=A1*2"),
            // The reference is a dependency, so a self-reference is a cycle.
            (6, "=FORMULATEXT(G1)", "#CYCLE!"),
            (7, "=ISFORMULA(\"A1\")", "#VALUE!"),
            (
                8,
                "=HYPERLINK(\"https://example.com\")",
                "https://example.com",
            ),
            (9, "=HYPERLINK(\"https://example.com\",\"Docs\")", "Docs"),
            (10, "=HYPERLINK(1/0,\"Docs\")", "#DIV/0!"),
            (11, "=HYPERLINK()", "#VALUE!"),
            (12, "=CELL(\"address\",Data!B3)", "'Data'!$B$3"),
            (13, "=CELL(\"Address\",B3)", "$B$3"),
            (14, "=CELL(\"type\",Data!A3)", "l"),
            (15, "=CELL(\"type\",Data!A4)", "b"),
            (16, "=CELL(\"type\",Data!A1)", "v"),
            (17, "=CELL(\"format\",Data!A1)", "#VALUE!"),
            (18, "=CELL(1,A1)", "#VALUE!"),
            (19, "=CELL(\"bogus\",A1)", "#VALUE!"),
            (29, "=CELL(\" row\",A1)", "#VALUE!"),
        ];
        let numbers = [
            (20, "=HYPERLINK(\"https://example.com\",Data!A1)", 5.0),
            (21, "=CELL(\"row\",Data!B3)", 3.0),
            (22, "=CELL(\"col\",Data!B3)", 2.0),
            (23, "=CELL(\"contents\",Data!A2)", 10.0),
            (24, "=CELL(\"col\")", 25.0),
        ];
        let bools = [
            (25, "=ISFORMULA(Data!A2)", true),
            (26, "=ISFORMULA(Data!A1)", false),
            (27, "=ISFORMULA(Data!A4)", false),
            (28, "=ISFORMULA(Data!A2:A3)", true),
        ];
        for (col, formula, _) in texts {
            store.set_formula(main, 0, col, formula, 0);
        }
        for (col, formula, _) in numbers {
            store.set_formula(main, 0, col, formula, 0);
        }
        for (col, formula, _) in bools {
            store.set_formula(main, 0, col, formula, 0);
        }
        store.commit_sources();

        for (col, formula, expected) in texts {
            assert_eq!(
                string(&store, main, 0, col).as_deref(),
                Some(expected),
                "{formula}"
            );
        }
        for (col, _, expected) in numbers {
            assert_close(number(&store, main, 0, col), expected);
        }
        for (col, formula, expected) in bools {
            assert_eq!(bool_at(&store, main, col), expected, "{formula}");
        }
    }
}
