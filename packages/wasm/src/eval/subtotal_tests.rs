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

/// AGGREGATE's odd options skip rows hidden by hand or by a filter; option 4
/// and option 6 do not.
#[cfg(feature = "analysis")]
#[test]
fn aggregate_odd_options_skip_rows_hidden_by_hand_or_by_a_filter() {
    let formulas = [
        "=AGGREGATE(9,1,A1:A4)",
        "=AGGREGATE(9,3,A1:A5)",
        "=AGGREGATE(9,5,A1:A5)",
        "=AGGREGATE(9,7,A1:A5)",
        "=AGGREGATE(9,6,A1:A5)",
        "=AGGREGATE(9,4,A1:A4)",
        "=AGGREGATE(14,5,A1:A5,1)",
    ];
    let (mut store, sheet) = microsoft_example(&formulas);
    store.set_formula(sheet, 4, DATA_COLUMN, "=1/0", 0);
    // Row 2 is hidden by hand, rows 3 and 5 by a filter.
    assert!(store.set_hidden_rows(sheet, &[1, 1], &[2, 2, 4, 4]));
    store.commit_sources();

    assert_eq!(
        results(&store, sheet, formulas.len()),
        ["143", "143", "143", "143", "303", "303", "120"]
    );
}
