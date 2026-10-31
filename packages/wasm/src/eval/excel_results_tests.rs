//! Formula results checked against the results that Microsoft documents for
//! Excel. Each case is evaluated in its own cell of a report sheet; the data
//! sheet `Data` holds the values the cases read.

use crate::store::CellStore;
use crate::types::{KIND_BOOL, KIND_EMPTY};

const REPORT_COLS: usize = 8;
const REPORT_ROWS: usize = 64;
const DATA_COLS: usize = 6;
const DATA_ROWS: usize = 12;
const FORMULA_COL: usize = 0;

/// `Data!A1:A3` = 1, 2, 3; `Data!B1:B3` = 10, 20, 30; `Data!D1:D3` = 5, "x"
/// and a blank cell. `Report!C1:C3` = 4, 5, 6.
fn workbook() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let report = store.add_sheet(REPORT_COLS, REPORT_ROWS);
    let data = store.add_sheet(DATA_COLS, DATA_ROWS);
    store.set_sheet_name(report, "report", "Report");
    store.set_sheet_name(data, "data", "Data");

    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(data, row, 0, value, 0);
        store.set_number(data, row, 1, value * 10.0, 0);
        store.set_number(report, row, 2, value + 3.0, 0);
    }
    store.set_number(data, 0, 3, 5.0, 0);
    store.set_string(data, 1, 3, "x", 0);

    (store, report, data)
}

fn shown(store: &CellStore, sheet: usize, row: usize, col: usize) -> String {
    let cell = store.get_cell(sheet, row, col);
    match cell.string() {
        Some(text) => text,
        None if cell.kind() == KIND_EMPTY => String::new(),
        None if cell.kind() == KIND_BOOL => if cell.num() != 0.0 { "TRUE" } else { "FALSE" }.into(),
        None => cell.num().to_string(),
    }
}

/// Evaluates every case and reports all mismatches at once.
fn assert_results(cases: &[(&str, &str)]) {
    let (mut store, report, _) = workbook();
    for (row, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(report, row, FORMULA_COL, formula, 0);
    }
    store.recompute(report);

    let mismatches: Vec<String> = cases
        .iter()
        .enumerate()
        .filter_map(|(row, (formula, expected))| {
            let actual = shown(&store, report, row, FORMULA_COL);
            (actual != *expected)
                .then(|| format!("{formula}: expected {expected:?}, got {actual:?}"))
        })
        .collect();
    assert!(mismatches.is_empty(), "\n{}", mismatches.join("\n"));
}

#[test]
fn issue_reproduction_formulas_give_the_excel_result() {
    assert_results(&[
        ("=1E3", "1000"),
        ("=SUM(C:C)", "15"),
        ("=ROUND(1.005,2)", "1.01"),
        ("=(0.1+0.2)&\"\"", "0.3"),
        ("=CHOOSE(1.5,\"a\",\"b\")", "a"),
        ("=TEXT(0.5,\"0%\")", "50%"),
        ("=REPLACE(\"abc\",5,1,\"X\")", "abcX"),
    ]);
}

#[cfg(feature = "analysis")]
#[test]
fn lambda_arguments_can_be_errors_that_the_body_handles() {
    assert_results(&[
        ("=LAMBDA(x,IFERROR(x,0))(1/0)", "0"),
        ("=LAMBDA(x,ISERROR(x))(NA())", "TRUE"),
        ("=LAMBDA(x,x+1)(1/0)", "#DIV/0!"),
    ]);
}

#[test]
fn whole_columns_and_rows_read_the_used_part_of_the_sheet() {
    assert_results(&[
        ("=SUM(C:C)", "15"),
        ("=SUM($C:$C)", "15"),
        ("=SUM(Data!A:B)", "66"),
        ("=SUM(Data!1:1)", "16"),
        ("=SUM(Data!$1:$2)", "38"),
        ("=COUNT(Data!A:A)", "3"),
        ("=SUMIF(Data!A:A,\">1\",Data!B:B)", "50"),
        ("=ROWS(Data!A:A)", "1048576"),
        ("=COLUMNS(Data!1:1)", "16384"),
        ("=SUM(2.5e+2,1E1)", "260"),
    ]);
}

#[test]
fn numbers_convert_to_text_with_fifteen_significant_digits() {
    assert_results(&[
        ("=(0.1+0.2)&\"\"", "0.3"),
        ("=1/3&\"\"", "0.333333333333333"),
        ("=2/3&\"\"", "0.666666666666667"),
        ("=LEN(0.1+0.2)", "3"),
        ("=CONCAT(0.1+0.2,\"!\")", "0.3!"),
        ("=-1.5&\"\"", "-1.5"),
        ("=123456789012345&\"\"", "123456789012345"),
        ("=1E+15&\"\"", "1E+15"),
        ("=12345678901234567890&\"\"", "1.23456789012346E+19"),
        ("=0.000001&\"\"", "0.000001"),
        ("=1E-10&\"\"", "1E-10"),
    ]);
}

#[test]
fn rounding_uses_the_decimal_value_that_excel_shows() {
    assert_results(&[
        ("=ROUND(1.005,2)", "1.01"),
        ("=ROUND(2.675,2)", "2.68"),
        ("=ROUND(-1.005,2)", "-1.01"),
        ("=ROUND(0.285,2)", "0.29"),
        ("=ROUND(1234.5,-2)", "1200"),
        ("=ROUND(2.5,0)", "3"),
        ("=ROUNDUP(1.001,2)", "1.01"),
        ("=ROUNDDOWN(1.009,2)", "1"),
        ("=ROUNDUP(-1.001,2)", "-1.01"),
    ]);
}

#[test]
fn text_applies_the_number_format_codes() {
    assert_results(&[
        ("=TEXT(0.5,\"0%\")", "50%"),
        ("=TEXT(0.125,\"0.0%\")", "12.5%"),
        ("=TEXT(2.5,\"0\")", "3"),
        ("=TEXT(1234.5,\"#,##0.00\")", "1,234.50"),
        ("=TEXT(-1234.5,\"#,##0\")", "-1,235"),
        ("=TEXT(1234567,\"#,##0\")", "1,234,567"),
        ("=TEXT(3,\"000\")", "003"),
        ("=TEXT(0.25,\"0.0#\")", "0.25"),
        ("=TEXT(0.2,\"0.0#\")", "0.2"),
        ("=TEXT(12345,\"0.00E+00\")", "1.23E+04"),
        ("=TEXT(5,\"$0.00\")", "$5.00"),
        ("=TEXT(-5,\"0;(0)\")", "(5)"),
        ("=TEXT(0,\"0;-0;\"\"zero\"\"\")", "zero"),
        ("=TEXT(1234,\"0,\")", "1"),
        ("=TEXT(7,\"0 \"\"units\"\"\")", "7 units"),
        ("=TEXT(1234.5,\"General\")", "1234.5"),
        ("=TEXT(45000,\"yyyy-mm-dd\")", "2023-03-15"),
    ]);
}

#[test]
fn index_arguments_truncate_fractions() {
    assert_results(&[
        ("=CHOOSE(1.5,\"a\",\"b\")", "a"),
        ("=CHOOSE(2.9,\"a\",\"b\")", "b"),
        ("=CHOOSE(0.5,\"a\",\"b\")", "#VALUE!"),
        ("=INDEX(Data!A1:A3,2.9)", "2"),
        ("=INDEX(Data!A1:B3,2.5,1.5)", "2"),
        ("=ADDRESS(2.5,1)", "$A$2"),
    ]);
}

#[test]
fn index_zero_selects_a_whole_row_or_column() {
    assert_results(&[
        ("=SUM(INDEX(Data!A1:B3,0,1))", "6"),
        ("=SUM(INDEX(Data!A1:B3,1,0))", "11"),
        ("=SUM(INDEX(Data!A1:B3,0,0))", "66"),
        ("=INDEX(Data!A1:B1,0,2)", "10"),
    ]);
}

#[test]
fn argument_errors_are_returned_unchanged() {
    assert_results(&[
        ("=ADDRESS(1,1,NA())", "#N/A"),
        ("=ADDRESS(1,1,1/0)", "#DIV/0!"),
        ("=MATCH(1,Data!A1:A3,NA())", "#N/A"),
        ("=XMATCH(1,Data!A1:A3,NA())", "#N/A"),
        ("=XMATCH(1,Data!A1:A3,0,NA())", "#N/A"),
        ("=XLOOKUP(1,Data!A1:A3,Data!B1:B3,,NA())", "#N/A"),
        ("=ADDRESS(1,1,5)", "#VALUE!"),
    ]);
}

#[test]
fn not_equal_criteria_match_values_of_another_type() {
    assert_results(&[
        ("=COUNTIF(Data!D1:D3,\"<>\")", "2"),
        ("=COUNTIF(Data!D1:D3,\"<>5\")", "2"),
        ("=COUNTIF(Data!D1:D3,\"<>x\")", "2"),
        ("=COUNTIFS(Data!D1:D3,\"<>\")", "2"),
        ("=COUNTIF(Data!D1:D3,\"=\")", "1"),
    ]);
}

#[test]
fn sum_if_ranges_take_their_extent_from_the_criteria_range() {
    assert_results(&[
        ("=SUMIF(Data!A1:A3,\">1\",Data!B1)", "50"),
        ("=SUMIF(Data!A1:A3,\">1\",Data!B1:B2)", "50"),
        ("=AVERAGEIF(Data!A1:A3,\">1\",Data!B1)", "25"),
    ]);
}

#[test]
fn date_parts_follow_the_excel_serial_domain() {
    assert_results(&[
        ("=YEAR(0)", "1900"),
        ("=MONTH(0)", "1"),
        ("=DAY(0)", "0"),
        ("=YEAR(Data!F1)", "1900"),
        ("=DAY(0.75)", "0"),
        ("=DATE(1900,1,0)", "0"),
        ("=DATE(1900,1,-1)", "#NUM!"),
        ("=YEAR(-1)", "#NUM!"),
        ("=DAY(-0.5)", "#NUM!"),
        ("=TEXT(0,\"yyyy-mm-dd\")", "1900-01-00"),
    ]);
}

#[test]
fn floor_and_ceiling_follow_the_significance_rules() {
    assert_results(&[
        ("=FLOOR(0.3,0.1)", "0.3"),
        ("=CEILING(0.3,0.1)", "0.3"),
        ("=CEILING(0.234,0.01)", "0.24"),
        ("=FLOOR(2.5,-2)", "#NUM!"),
        ("=CEILING(2.5,-2)", "#NUM!"),
        ("=FLOOR(-2.5,-2)", "-2"),
        ("=CEILING(-2.5,-2)", "-4"),
        ("=FLOOR(-2.5,2)", "-4"),
        ("=CEILING(-2.5,2)", "-2"),
        ("=FLOOR(3.7,2)", "2"),
        ("=CEILING(2.5,1)", "3"),
        ("=FLOOR(5,0)", "#DIV/0!"),
        ("=CEILING(5,0)", "0"),
        ("=FLOOR(2.5)", "#VALUE!"),
        ("=CEILING(2.5)", "#VALUE!"),
    ]);
}

#[test]
fn text_functions_follow_excel_edge_rules() {
    assert_results(&[
        ("=REPLACE(\"abc\",5,1,\"X\")", "abcX"),
        ("=REPLACE(\"abc\",4,0,\"X\")", "abcX"),
        ("=REPLACE(\"abc\",2,1,\"X\")", "aXc"),
        ("=TRIM(\"  a   b  \")", "a b"),
        ("=LEN(TRIM(\"a\"&CHAR(10)&\"b\"))", "3"),
        ("=CODE(MID(TRIM(\"a\"&CHAR(10)&\"b\"),2,1))", "10"),
        ("=LEN(TRIM(\"a\"&CHAR(9)&\"  b\"))", "4"),
    ]);
}
