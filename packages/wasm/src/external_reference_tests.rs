//! References to cells in other workbooks: `[Budget.xlsx]Annual!C10`, in
//! the forms of Microsoft's page "Create an external reference (link) to a
//! cell range in another workbook". Without values for the other workbook,
//! a reference is `#REF!`, and its formula text stays as written.

use crate::calc::{parse, serialize, shift_cols, shift_rows, translate_relative_refs};
use crate::store::CellStore;

const SHEET: u32 = 0;

fn round_trip(source: &str) -> String {
    let ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
    let written = serialize(&ast);
    assert_eq!(parse(&written).as_ref(), Ok(&ast), "{source} -> {written}");
    written
}

fn copied(source: &str, rows: i64, cols: i64) -> String {
    let mut ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
    translate_relative_refs(&mut ast, rows, cols);
    serialize(&ast)
}

#[test]
fn external_references_parse_and_write_back_as_written() {
    for source in [
        "=[Budget.xlsx]Annual!C10",
        "=[Budget.xlsx]Annual!$C$10",
        "=SUM([Budget.xlsx]Annual!C10:C25)",
        "=SUM([Budget.xlsx]Annual!C:C)",
        "='[Budget 2024.xlsx]Annual Plan'!C10",
        "=SUM('C:\\Reports\\[Budget.xlsx]Annual'!C10:C25)",
        "=SUM([Budget.xlsx]Annual!A1,[Sales.xlsm]Q1!B2)",
    ] {
        assert_eq!(round_trip(source), source);
    }
}

#[test]
fn copies_move_relative_external_references_and_edits_do_not() {
    assert_eq!(
        copied("=[Budget.xlsx]Annual!C10", 1, 2),
        "=[Budget.xlsx]Annual!E11"
    );
    assert_eq!(
        copied("=[Budget.xlsx]Annual!$C$10", 1, 2),
        "=[Budget.xlsx]Annual!$C$10"
    );

    // A row or column edit in this workbook does not change the other one.
    for source in [
        "=[Budget.xlsx]Annual!C10",
        "=SUM('[Budget 2024.xlsx]Annual Plan'!C10:C25)",
    ] {
        let mut rows = parse(source).unwrap();
        shift_rows(&mut rows, 0, 3, SHEET, SHEET);
        assert_eq!(serialize(&rows), source);

        let mut cols = parse(source).unwrap();
        shift_cols(&mut cols, 0, 3, SHEET, SHEET);
        assert_eq!(serialize(&cols), source);
    }
}

#[test]
fn external_references_without_values_are_ref_errors() {
    let mut store = CellStore::new();
    let annual = store.add_sheet(3, 10);
    let report = store.add_sheet(1, 5);
    store.set_sheet_name(annual, "annual", "Annual");
    store.set_sheet_name(report, "report", "Report");
    // A local sheet with the same name must not answer for the other workbook.
    store.set_number(annual, 9, 2, 7.0, 0);

    let formulas = [
        "=[Budget.xlsx]Annual!C10",
        "=SUM([Budget.xlsx]Annual!C10:C25)",
        "=SUM('[Budget 2024.xlsx]Annual Plan'!C10:C25)",
        "=[Budget.xlsx]Annual!C10:C12",
    ];
    for (row, formula) in formulas.iter().enumerate() {
        store.set_formula(report, row, 0, formula, 0);
    }
    store.set_formula(report, 4, 0, "=IFERROR([Budget.xlsx]Annual!C10,5)", 0);
    store.recompute(report);

    for (row, formula) in formulas.iter().enumerate() {
        let cell = store.get_cell(report, row, 0);
        assert_eq!(cell.string().as_deref(), Some("#REF!"), "{formula}");
        assert_eq!(
            store.formula_source(report, row, 0).as_deref(),
            Some(*formula)
        );
    }
    assert_eq!(store.get_cell(report, 4, 0).num(), 5.0);

    assert!(store.add_rows(report, 0, 1));
    assert!(store.rename_sheet(annual, "annual", "Plan"));
    assert_eq!(
        store.formula_source(report, 1, 0).as_deref(),
        Some(formulas[0])
    );
}

/// A store with one local sheet, `Report`, and the cached values of the
/// sheet `Annual` of `Budget.xlsx`: C10 = 7 and C11 = 5.
fn linked_store() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let report = store.add_sheet(1, 8);
    store.set_sheet_name(report, "report", "Report");
    let annual = store.add_external_sheet("Budget.xlsx", "Annual", 3, 25);
    store.set_number(annual, 9, 2, 7.0, 0);
    store.set_number(annual, 10, 2, 5.0, 0);
    (store, report, annual)
}

#[test]
fn external_references_read_the_cached_values_of_the_link() {
    let (mut store, report, _) = linked_store();
    let cases = [
        ("=[Budget.xlsx]Annual!C10", "7"),
        ("=SUM([Budget.xlsx]Annual!C10:C25)", "12"),
        // The path and the letter case do not change which link is read.
        ("='C:\\Reports\\[budget.xlsx]ANNUAL'!C10", "7"),
        ("=[Budget.xlsx]Annual!C9", "0"),
        ("=[Budget.xlsx]Other!C10", "#REF!"),
        ("=[Sales.xlsx]Annual!C10", "#REF!"),
        // The link is not a tab of this workbook.
        ("=SHEETS()", "1"),
    ];
    for (row, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(report, row, 0, formula, 0);
    }
    store.recompute(report);

    for (row, (formula, expected)) in cases.iter().enumerate() {
        let cell = store.get_cell(report, row, 0);
        let shown = cell.string().unwrap_or_else(|| cell.num().to_string());
        assert_eq!(shown, *expected, "{formula}");
        assert_eq!(
            store.formula_source(report, row, 0).as_deref(),
            Some(*formula)
        );
    }
}

#[test]
fn new_link_values_recalculate_the_formulas_that_read_them() {
    let (mut store, report, annual) = linked_store();
    store.set_formula(report, 0, 0, "=SUM([Budget.xlsx]Annual!C10:C25)", 0);
    store.recompute(report);
    assert_eq!(store.get_cell(report, 0, 0).num(), 12.0);

    store.set_number(annual, 9, 2, 10.0, 0);
    store.recompute(annual);
    assert_eq!(store.get_cell(report, 0, 0).num(), 15.0);

    // Adding the same link again gives the sheet that holds its values.
    assert_eq!(
        store.add_external_sheet("budget.xlsx", "annual", 3, 25),
        annual
    );
}

#[test]
fn formulas_follow_a_link_that_is_added_removed_and_added_again() {
    let mut store = CellStore::new();
    let report = store.add_sheet(1, 2);
    store.set_sheet_name(report, "report", "Report");
    let formula = "=SUM([Budget.xlsx]Annual!C10:C11)";
    store.set_formula(report, 0, 0, formula, 0);
    store.recompute(report);
    assert_eq!(
        store.get_cell(report, 0, 0).string().as_deref(),
        Some("#REF!")
    );

    let annual = store.add_external_sheet("Budget.xlsx", "Annual", 3, 11);
    store.set_number(annual, 9, 2, 7.0, 0);
    store.recompute(annual);
    assert_eq!(store.get_cell(report, 0, 0).num(), 7.0);

    assert!(store.remove_external_sheet("budget.xlsx", "ANNUAL"));
    assert!(!store.remove_external_sheet("Budget.xlsx", "Annual"));
    assert_eq!(
        store.get_cell(report, 0, 0).string().as_deref(),
        Some("#REF!")
    );
    assert_eq!(store.formula_source(report, 0, 0).as_deref(), Some(formula));

    let annual = store.add_external_sheet("Budget.xlsx", "Annual", 3, 11);
    store.set_number(annual, 10, 2, 5.0, 0);
    store.recompute(annual);
    assert_eq!(store.get_cell(report, 0, 0).num(), 5.0);
    assert_eq!(store.formula_source(report, 0, 0).as_deref(), Some(formula));
}
