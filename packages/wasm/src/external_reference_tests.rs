//! References to cells in other workbooks: `[Budget.xlsx]Annual!C10`, in
//! the forms of Microsoft's page "Create an external reference (link) to a
//! cell range in another workbook". Without values for the other workbook,
//! a reference is `#REF!`, and its formula text stays as written.

use crate::calc::{parse, serialize, shift_cols, shift_rows, translate_relative_refs};
use crate::store::CellStore;

const SHEET: u32 = 0;

fn copied(source: &str, rows: i64, cols: i64) -> String {
    let mut ast = parse(source).unwrap_or_else(|error| panic!("{source}: {error}"));
    translate_relative_refs(&mut ast, rows, cols);
    serialize(&ast)
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

/// Define a name of `Budget.xlsx` as core does from its link part: the
/// name qualified by the book (and its sheet), referring to the link sheet.
fn define(store: &mut CellStore, name: &str, cells: &str) -> bool {
    store.set_named_formula(name, -1, &format!("='[Budget.xlsx]Annual'!{cells}"))
}

/// `linked_store` with the names of `Budget.xlsx` that its link part saves:
/// `Total` (C10) and `Rows` (C10:C11) for the workbook, and `Local` (C11)
/// for the sheet `Annual`.
fn store_with_names() -> (CellStore, usize, usize) {
    let (mut store, report, annual) = linked_store();
    assert!(define(&mut store, "[Budget.xlsx]!Total", "$C$10"));
    assert!(define(&mut store, "[Budget.xlsx]!Rows", "$C$10:$C$11"));
    assert!(define(&mut store, "'[Budget.xlsx]Annual'!Local", "$C$11"));
    (store, report, annual)
}

/// Excel writes a name of another workbook as `Budget.xlsx!Total`, with the
/// path when the workbook is closed (Microsoft, "Create workbook links":
/// `=SUM(Budget.xlsx!Sales)`), and keeps the saved values of the cells the
/// name refers to.
#[test]
fn defined_names_of_a_link_read_its_saved_values() {
    let (mut store, report, _) = store_with_names();
    let cases = [
        ("=Budget.xlsx!Total", "7"),
        ("=SUM(budget.xlsx!ROWS) * 2", "24"),
        ("='C:\\Reports\\Budget.xlsx'!Total", "7"),
        ("=[Budget.xlsx]!Total+1", "8"),
        ("='C:\\Reports\\[Budget.xlsx]'!Total", "7"),
        ("=[Budget.xlsx]Annual!Local", "5"),
        // A name the link does not hold, or a link without values.
        ("=Budget.xlsx!Missing", "#REF!"),
        ("=Sales.xlsx!Total", "#REF!"),
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
fn a_link_name_follows_its_values_and_its_removal() {
    let (mut store, report, annual) = store_with_names();
    store.set_formula(report, 0, 0, "=Budget.xlsx!Total", 0);
    store.recompute(report);

    store.set_number(annual, 9, 2, 10.0, 0);
    store.recompute(annual);
    assert_eq!(store.get_cell(report, 0, 0).num(), 10.0);

    // Without the link sheet, the name refers to `#REF!`.
    assert!(store.remove_external_sheet("budget.xlsx", "annual"));
    assert_eq!(
        store.get_cell(report, 0, 0).string().as_deref(),
        Some("#REF!")
    );

    let annual = store.add_external_sheet("Budget.xlsx", "Annual", 3, 11);
    store.set_number(annual, 10, 2, 5.0, 0);
    assert!(define(&mut store, "[Budget.xlsx]!Total", "$C$11"));
    assert_eq!(store.get_cell(report, 0, 0).num(), 5.0);
    assert_eq!(
        store.formula_source(report, 0, 0).as_deref(),
        Some("=Budget.xlsx!Total")
    );
}

/// A rename rewrites only the references of the text: the names of a link
/// stay as written (#491).
#[test]
fn a_rename_keeps_the_link_names_of_a_formula() {
    let (mut store, report, _) = store_with_names();
    store.set_formula(report, 0, 0, "=[Budget.xlsx]!Total + Report!A3", 0);
    store.set_formula(
        report,
        1,
        0,
        "='C:\\Reports\\Budget.xlsx'!Total*2+Report!A3",
        0,
    );

    assert!(store.rename_sheet(report, "report", "Summary"));

    assert_eq!(
        store.formula_source(report, 0, 0).as_deref(),
        Some("=[Budget.xlsx]!Total + Summary!A3")
    );
    assert_eq!(
        store.formula_source(report, 1, 0).as_deref(),
        Some("='C:\\Reports\\Budget.xlsx'!Total*2+Summary!A3")
    );
}
