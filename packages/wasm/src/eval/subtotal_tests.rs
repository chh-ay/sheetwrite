//! SUBTOTAL over hidden rows and nested subtotals, and the recalculation that
//! a hidden-row change starts.

use crate::store::CellStore;
use crate::types::FormulaError;

const DATA_COLUMN: usize = 0;
const FORMULA_COLUMN: usize = 2;

/// The Microsoft SUBTOTAL example: 120, 10, 150 and 23 in A1:A4.
/// <https://support.microsoft.com/en-us/excel/functions/subtotal-function>
fn microsoft_example(formulas: &[&str]) -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 12);
    for (row, value) in [120.0, 10.0, 150.0, 23.0].into_iter().enumerate() {
        store.set_number(sheet, row, DATA_COLUMN, value, 0);
    }
    for (row, formula) in formulas.iter().enumerate() {
        store.set_formula(sheet, row, FORMULA_COLUMN, formula, 0);
    }
    store.commit_sources();
    (store, sheet)
}

/// Results rounded to ten decimals, since the running AVERAGE can differ from
/// the exact quotient in the last bit.
fn results(store: &CellStore, sheet: usize, count: usize) -> Vec<String> {
    const TEN_DECIMALS: f64 = 1e10;

    (0..count)
        .map(|row| {
            let cell = store.get_cell(sheet, row, FORMULA_COLUMN);
            cell.string()
                .unwrap_or_else(|| ((cell.num() * TEN_DECIMALS).round() / TEN_DECIMALS).to_string())
        })
        .collect()
}

#[test]
fn codes_1_to_11_skip_filtered_rows_and_101_to_111_also_skip_hidden_rows() {
    let formulas = [
        "=SUBTOTAL(9,A1:A4)",
        "=SUBTOTAL(109,A1:A4)",
        "=SUBTOTAL(1,A1:A4)",
        "=SUBTOTAL(101,A1:A4)",
        "=SUBTOTAL(103,A1:A4)",
    ];
    let (mut store, sheet) = microsoft_example(&formulas);
    assert_eq!(
        results(&store, sheet, formulas.len()),
        ["303", "303", "75.75", "75.75", "4"]
    );

    // The user hides row 2 (10).
    assert!(store.set_hidden_rows(sheet, &[1, 1], &[]));
    assert_eq!(
        results(&store, sheet, formulas.len()),
        ["303", "293", "75.75", "97.6666666667", "3"]
    );

    // A filter also hides row 3 (150), which every code skips.
    assert!(store.set_hidden_rows(sheet, &[1, 1], &[2, 2]));
    assert_eq!(
        results(&store, sheet, formulas.len()),
        ["153", "143", "51", "71.5", "2"]
    );

    assert!(store.set_hidden_rows(sheet, &[], &[]));
    assert_eq!(
        results(&store, sheet, formulas.len()),
        ["303", "303", "75.75", "75.75", "4"]
    );
}

#[test]
fn a_cell_argument_is_a_reference_whose_row_can_be_hidden() {
    let formulas = ["=SUBTOTAL(109,A1,A2)", "=SUBTOTAL(9,A2)"];
    let (mut store, sheet) = microsoft_example(&formulas);
    assert_eq!(results(&store, sheet, formulas.len()), ["130", "10"]);

    assert!(store.set_hidden_rows(sheet, &[1, 1], &[]));

    assert_eq!(results(&store, sheet, formulas.len()), ["120", "10"]);
}

#[test]
fn nested_subtotals_and_errors_in_hidden_rows_are_skipped() {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(4, 12);
    store.set_number(sheet, 0, 0, 10.0, 0);
    store.set_number(sheet, 1, 0, 20.0, 0);
    store.set_formula(sheet, 2, 0, "=SUBTOTAL(9,A1:A2)", 0);
    store.set_formula(sheet, 3, 0, "=1/0", 0);
    store.set_formula(sheet, 0, FORMULA_COLUMN, "=SUBTOTAL(9,A1:A3)", 0);
    store.set_formula(sheet, 1, FORMULA_COLUMN, "=SUBTOTAL(109,A1:A4)", 0);
    store.set_formula(sheet, 2, FORMULA_COLUMN, "=SUBTOTAL(9,A1:A4)", 0);
    store.commit_sources();

    assert!(store.set_hidden_rows(sheet, &[3, 3], &[]));

    assert_eq!(
        results(&store, sheet, 3),
        ["30", "30", FormulaError::DivZero.sentinel()]
    );
}

#[test]
fn a_hidden_row_change_recalculates_only_subtotals_and_their_dependents() {
    let (mut store, sheet) = microsoft_example(&[
        "=SUBTOTAL(109,A1:A4)",
        "=C1*2",
        "=SUM(A1:A4)",
        "=SUBTOTAL(109,B1:B4)",
    ]);
    let other = store.add_sheet(1, 1);
    store.set_sheet_name(sheet, "data", "Data");
    store.set_formula(other, 0, 0, "=SUBTOTAL(109,Data!A1:A4)", 0);
    store.commit_sources();
    let before = store.recomputed_formulas;

    assert!(store.set_hidden_rows(sheet, &[0, 0], &[]));

    // C1, its reader C2, C4 (it reads the sheet) and the other sheet's formula.
    assert_eq!(store.recomputed_formulas - before, 4);
    assert_eq!(results(&store, sheet, 3), ["183", "366", "303"]);
    assert_eq!(store.get_cell(other, 0, 0).num(), 183.0);

    let before = store.recomputed_formulas;
    assert!(store.set_hidden_rows(sheet, &[0, 0], &[]));
    assert_eq!(store.recomputed_formulas, before);
}

#[test]
fn inside_a_mutation_the_commit_barrier_recalculates() {
    let (mut store, sheet) = microsoft_example(&["=SUBTOTAL(109,A1:A4)"]);

    store.begin_mutation();
    assert!(store.set_hidden_rows(sheet, &[2, 3], &[]));
    assert_eq!(results(&store, sheet, 1), ["303"]);

    store.commit_sources();
    assert_eq!(results(&store, sheet, 1), ["130"]);
}

#[test]
fn rejects_invalid_runs_and_missing_sheets() {
    let (mut store, sheet) = microsoft_example(&["=SUBTOTAL(109,A1:A4)"]);

    assert!(!store.set_hidden_rows(sheet, &[3, 2], &[]));
    assert!(!store.set_hidden_rows(sheet, &[], &[1]));
    assert!(!store.set_hidden_rows(sheet + 1, &[0, 0], &[]));
    assert_eq!(results(&store, sheet, 1), ["303"]);
}

#[test]
fn hidden_rows_move_with_inserted_and_deleted_rows() {
    let (mut store, sheet) = microsoft_example(&["=SUBTOTAL(109,A1:A4)"]);
    assert!(store.set_hidden_rows(sheet, &[1, 1], &[]));

    assert!(store.add_rows(sheet, 0, 1));
    store.commit_sources();
    assert_eq!(store.get_cell(sheet, 1, FORMULA_COLUMN).num(), 293.0);

    assert!(store.remove_rows(sheet, 2, 1));
    store.commit_sources();
    assert_eq!(store.get_cell(sheet, 1, FORMULA_COLUMN).num(), 293.0);
}
