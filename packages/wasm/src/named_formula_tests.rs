//! Defined names that hold a formula, in both engines, and named LAMBDAs in
//! the full engine. Excel is the reference:
//! https://support.microsoft.com/en-us/office/define-and-use-names-in-formulas-4d0f13ac-53b7-422e-afd2-abd7ff379c64
//! https://support.microsoft.com/en-us/office/lambda-function-bd212d27-1cd1-4321-a34a-ccbf254b8b67

use std::time::{Duration, Instant};

use crate::store::CellStore;

fn number(store: &CellStore, sheet: usize, row: usize, col: usize) -> f64 {
    store.get_cell(sheet, row, col).num()
}

fn text(store: &CellStore, sheet: usize, row: usize, col: usize) -> Option<String> {
    store.get_cell(sheet, row, col).string()
}

/// A store with one sheet, `Data`, holding 1, 2, 3 in A1:A3 and 10, 20, 30
/// in B1:B3.
fn data_store() -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(6, 12);
    store.set_sheet_name(sheet, "data", "Data");
    for (row, value) in [1.0, 2.0, 3.0].into_iter().enumerate() {
        store.set_number(sheet, row, 0, value, 0);
        store.set_number(sheet, row, 1, value * 10.0, 0);
    }
    (store, sheet)
}

#[test]
fn a_constant_name_calculates_and_follows_its_definition() {
    let (mut store, sheet) = data_store();
    store.set_formula(sheet, 0, 3, "=B1*Tax", 0);

    assert!(store.set_named_formula("Tax", -1, "=0.2"));
    assert_eq!(number(&store, sheet, 0, 3), 2.0);

    assert!(store.set_named_formula("tax", -1, "=0.5"));
    assert_eq!(number(&store, sheet, 0, 3), 5.0);
    assert_eq!(
        store.named_formula_source("TAX", -1).as_deref(),
        Some("=0.5")
    );

    assert!(store.remove_named_range("Tax", -1));
    assert_eq!(text(&store, sheet, 0, 3).as_deref(), Some("#NAME?"));
    assert_eq!(
        store.formula_source(sheet, 0, 3).as_deref(),
        Some("=B1*Tax")
    );
}

#[test]
fn a_name_that_holds_a_reference_works_where_a_reference_is_needed() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("Sales", -1, "=Data!$B$1:$B$3"));
    store.set_formula(sheet, 0, 3, "=SUM(Sales)", 0);
    store.set_formula(sheet, 1, 3, "=ROWS(Sales)", 0);
    store.set_formula(sheet, 2, 3, "=INDEX(Sales,2)", 0);
    store.recompute(sheet);
    assert_eq!(number(&store, sheet, 0, 3), 60.0);
    assert_eq!(number(&store, sheet, 1, 3), 3.0);
    assert_eq!(number(&store, sheet, 2, 3), 20.0);

    store.set_number(sheet, 1, 1, 50.0, 0);
    store.recompute(sheet);
    assert_eq!(number(&store, sheet, 0, 3), 90.0);
}

#[test]
fn a_dynamic_name_reads_the_range_its_formula_returns() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("Filled", -1, "=OFFSET(Data!$A$1,0,0,COUNT(Data!$A:$A),1)"));
    store.set_formula(sheet, 0, 3, "=SUM(Filled)", 0);
    store.recompute(sheet);
    assert_eq!(number(&store, sheet, 0, 3), 6.0);

    store.set_number(sheet, 3, 0, 4.0, 0);
    store.recompute(sheet);
    assert_eq!(number(&store, sheet, 0, 3), 10.0);
}

/// Excel keeps a name's relative references relative to A1 and moves them
/// to the cell that uses the name, wrapping past the last column, so
/// `=Data!XFD1` reads the cell to the left of each cell that uses it.
#[test]
fn relative_references_in_a_name_follow_the_cell_that_uses_it() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("SameRow", -1, "=Data!$A1"));
    assert!(store.set_named_formula("Left", -1, "=Data!XFD1"));
    store.set_formula(sheet, 1, 3, "=SameRow*100", 0);
    store.set_formula(sheet, 2, 3, "=SameRow*100", 0);
    store.set_formula(sheet, 2, 2, "=Left+1", 0);
    store.recompute(sheet);

    assert_eq!(number(&store, sheet, 1, 3), 200.0);
    assert_eq!(number(&store, sheet, 2, 3), 300.0);
    assert_eq!(number(&store, sheet, 2, 2), 31.0);
}

/// `$A1048575:$A1`, relative to A1, is the two rows above a cell and the
/// cell itself in column A; used in row 3 it wraps to A1:A3.
#[test]
fn a_relative_range_in_a_name_wraps_past_the_last_row() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("LastThree", -1, "=SUM(Data!$A1048575:$A1)"));
    store.set_formula(sheet, 2, 3, "=LastThree", 0);
    store.recompute(sheet);

    assert_eq!(number(&store, sheet, 2, 3), 6.0);
}

#[test]
fn a_chain_of_names_that_doubles_at_each_step_is_bounded() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("Step_30", -1, "=1"));
    for step in 1..30 {
        let source = format!("=Step_{next}+Step_{next}", next = step + 1);
        assert!(store.set_named_formula(&format!("Step_{step}"), -1, &source));
    }
    store.set_formula(sheet, 0, 3, "=Step_21", 0);
    store.set_formula(sheet, 1, 3, "=Step_1", 0);
    store.recompute(sheet);

    assert_eq!(number(&store, sheet, 0, 3), 512.0);
    assert_eq!(text(&store, sheet, 1, 3).as_deref(), Some("#NUM!"));
}

/// Most time a formula may take to bind to a chain of 22 names. Expanding
/// each name once per formula takes milliseconds; expanding it once per use
/// takes 2^21 expansions, which is minutes in a debug build.
const CHAIN_BIND_LIMIT: Duration = Duration::from_secs(1);

/// A name over a sheet's own name reads differently on that sheet, so it is
/// expanded where it is used. Each name of a chain is still expanded once per
/// formula, not once per use.
#[test]
fn a_chain_of_names_over_a_sheets_own_name_binds_in_linear_time() {
    let (mut store, sheet) = data_store();
    let other = store.add_sheet(2, 2);
    store.set_sheet_name(other, "other", "Other");
    assert!(store.set_named_formula("Rate", -1, "=1"));
    assert!(store.set_named_formula("Rate", other as i32, "=2"));
    assert!(store.set_named_formula("Step_22", -1, "=Rate"));
    for step in 1..22 {
        let source = format!("=Step_{next}+Step_{next}", next = step + 1);
        assert!(store.set_named_formula(&format!("Step_{step}"), -1, &source));
    }

    let started = Instant::now();
    store.set_formula(sheet, 0, 3, "=Step_1", 0);
    let elapsed = started.elapsed();
    store.set_formula(sheet, 1, 3, "=Step_13", 0);
    store.set_formula(other, 0, 0, "=Step_13", 0);
    store.recompute(sheet);
    store.recompute(other);

    assert!(elapsed < CHAIN_BIND_LIMIT, "binding took {elapsed:?}");
    assert_eq!(text(&store, sheet, 0, 3).as_deref(), Some("#NUM!"));
    assert_eq!(number(&store, sheet, 1, 3), 512.0);
    assert_eq!(number(&store, other, 0, 0), 1024.0);
}

#[test]
fn names_refer_to_other_names_and_a_cycle_through_names_is_a_name_error() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("Rate", -1, "=0.1"));
    assert!(store.set_named_formula("Total", -1, "=SUM(Data!$B$1:$B$3)*(1+Rate)"));
    assert!(store.set_named_formula("Loop", -1, "=Loop+1"));
    store.set_formula(sheet, 0, 3, "=Total", 0);
    store.set_formula(sheet, 1, 3, "=Loop", 0);
    store.recompute(sheet);

    assert!((number(&store, sheet, 0, 3) - 66.0).abs() < 1e-9);
    assert_eq!(text(&store, sheet, 1, 3).as_deref(), Some("#NAME?"));
}

#[test]
fn a_sheet_scoped_name_shadows_the_workbook_name_on_its_sheet() {
    let (mut store, data) = data_store();
    let other = store.add_sheet(2, 2);
    store.set_sheet_name(other, "other", "Other");
    assert!(store.set_named_formula("Rate", -1, "=1"));
    assert!(store.set_named_formula("Rate", other as i32, "=2"));
    store.set_formula(data, 0, 3, "=Rate", 0);
    store.set_formula(other, 0, 0, "=Rate", 0);
    store.recompute(data);
    store.recompute(other);

    assert_eq!(number(&store, data, 0, 3), 1.0);
    assert_eq!(number(&store, other, 0, 0), 2.0);
}

#[test]
fn a_name_and_a_range_of_one_name_replace_each_other() {
    let (mut store, sheet) = data_store();
    store.set_formula(sheet, 0, 3, "=SUM(Values)", 0);
    assert!(store.set_named_range("Values", -1, sheet, 0, 0, 2, 0));
    assert_eq!(number(&store, sheet, 0, 3), 6.0);

    assert!(store.set_named_formula("Values", -1, "=Data!$B$1:$B$3"));
    assert_eq!(number(&store, sheet, 0, 3), 60.0);

    assert!(store.set_named_range("Values", -1, sheet, 0, 0, 2, 0));
    assert_eq!(store.named_formula_source("Values", -1), None);
    assert_eq!(number(&store, sheet, 0, 3), 6.0);
}

#[test]
fn invalid_names_and_formulas_are_refused() {
    let (mut store, _) = data_store();
    assert!(!store.set_named_formula("A1", -1, "=1"));
    assert!(!store.set_named_formula("Rate", -1, "=1+"));
    assert!(!store.set_named_formula("Rate", -1, "=Missing!A1"));
    assert!(!store.set_named_formula("Rate", 7, "=1"));
}

#[test]
fn sheet_edits_rewrite_the_names_formula() {
    let (mut store, data) = data_store();
    let summary = store.add_sheet(2, 4);
    store.set_sheet_name(summary, "summary", "Summary");
    assert!(store.set_named_formula("Sales", -1, "=SUM(Data!$B$1:$B$3)"));
    store.set_formula(summary, 0, 0, "=Sales", 0);
    store.recompute(summary);
    assert_eq!(number(&store, summary, 0, 0), 60.0);

    store.add_rows(data, 0, 1);
    store.recompute(summary);
    assert_eq!(
        store.named_formula_source("Sales", -1).as_deref(),
        Some("=SUM(Data!$B$2:$B$4)")
    );
    assert_eq!(number(&store, summary, 0, 0), 60.0);

    assert!(store.rename_sheet(data, "data", "Sales Data"));
    assert_eq!(
        store.named_formula_source("Sales", -1).as_deref(),
        Some("=SUM('Sales Data'!$B$2:$B$4)")
    );

    assert!(store.remove_sheet(data));
    store.recompute(summary);
    assert_eq!(
        store.named_formula_source("Sales", -1).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(text(&store, summary, 0, 0).as_deref(), Some("#REF!"));
}

#[test]
fn a_formula_rewritten_by_a_row_edit_keeps_the_name() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("Tax", -1, "=0.2"));
    store.set_formula(sheet, 3, 3, "=B3*Tax", 0);

    store.add_rows(sheet, 0, 1);
    store.recompute(sheet);
    assert_eq!(
        store.formula_source(sheet, 4, 3).as_deref(),
        Some("=B4*Tax")
    );
    assert_eq!(number(&store, sheet, 4, 3), 6.0);
}

/// `data_store` and a second sheet, `Other`, holding 4, 5, 6 in A1:A3 and 7
/// in B1.
fn two_sheet_store() -> (CellStore, usize, usize) {
    let (mut store, data) = data_store();
    let other = store.add_sheet(6, 12);
    store.set_sheet_name(other, "other", "Other");
    for (row, value) in [4.0, 5.0, 6.0].into_iter().enumerate() {
        store.set_number(other, row, 0, value, 0);
    }
    store.set_number(other, 0, 1, 7.0, 0);
    (store, data, other)
}

/// A sheet named `Summary`, for formulas that use names from another sheet.
fn add_summary(store: &mut CellStore) -> usize {
    let summary = store.add_sheet(6, 6);
    store.set_sheet_name(summary, "summary", "Summary");
    summary
}

/// A reference with no sheet in a workbook name reads the sheet of the
/// formula that uses the name, also inside another name.
#[test]
fn a_workbook_name_without_a_sheet_reads_the_sheet_of_each_formula() {
    let (mut store, data, other) = two_sheet_store();
    assert!(store.set_named_formula("First", -1, "=$B$1"));
    assert!(store.set_named_formula("FirstTwice", -1, "=$B$1*2"));
    assert!(store.set_named_formula("Column", -1, "=$A$1:$A$3"));
    assert!(store.set_named_formula("ColumnTotal", -1, "=SUM(Column)"));
    assert!(store.set_named_formula("ColumnSecond", -1, "=INDEX(Column,2)"));
    assert!(store.set_named_formula("ColumnHeight", -1, "=ROWS(Column)"));
    assert!(store.set_named_formula("Alias", -1, "=Column"));
    for sheet in [data, other] {
        store.set_formula(sheet, 0, 4, "=First", 0);
        store.set_formula(sheet, 1, 4, "=FirstTwice", 0);
        store.set_formula(sheet, 2, 4, "=ColumnTotal", 0);
        store.set_formula(sheet, 3, 4, "=ColumnSecond", 0);
        store.set_formula(sheet, 4, 4, "=ColumnHeight", 0);
        store.set_formula(sheet, 5, 4, "=SUM(Alias)", 0);
        store.recompute(sheet);
    }

    assert_eq!(number(&store, data, 0, 4), 10.0);
    assert_eq!(number(&store, data, 1, 4), 20.0);
    assert_eq!(number(&store, data, 2, 4), 6.0);
    assert_eq!(number(&store, other, 0, 4), 7.0);
    assert_eq!(number(&store, other, 1, 4), 14.0);
    assert_eq!(number(&store, other, 2, 4), 15.0);
    assert_eq!(number(&store, data, 3, 4), 2.0);
    assert_eq!(number(&store, other, 3, 4), 5.0);
    for sheet in [data, other] {
        assert_eq!(number(&store, sheet, 4, 4), 3.0);
    }
    assert_eq!(number(&store, data, 5, 4), 6.0);
    assert_eq!(number(&store, other, 5, 4), 15.0);
}

/// A workbook name that uses another name reads that sheet's own definition
/// on a sheet that has one, and the workbook's once it is removed.
#[test]
fn a_workbook_name_reads_a_sheets_own_name_on_that_sheet() {
    let (mut store, data, other) = two_sheet_store();
    assert!(store.set_named_formula("Rate", -1, "=1"));
    assert!(store.set_named_formula("Rate", other as i32, "=2"));
    assert!(store.set_named_formula("Calc", -1, "=Rate*10"));
    store.set_formula(data, 0, 4, "=Calc", 0);
    store.set_formula(other, 0, 4, "=Calc", 0);
    store.recompute(data);
    store.recompute(other);
    assert_eq!(number(&store, data, 0, 4), 10.0);
    assert_eq!(number(&store, other, 0, 4), 20.0);

    assert!(store.remove_named_range("Rate", other as i32));
    store.set_formula(other, 1, 4, "=Calc", 0);
    store.recompute(other);
    assert_eq!(number(&store, other, 0, 4), 10.0);
    assert_eq!(number(&store, other, 1, 4), 10.0);
}

/// Formulas that used the names before a row and a column edit and formulas
/// that use them after it read the same moved cells.
#[test]
fn names_follow_row_and_column_edits_for_formulas_before_and_after_them() {
    let (mut store, data) = data_store();
    let summary = add_summary(&mut store);
    assert!(store.set_named_formula("Sales", -1, "=SUM(Data!$B$1:$B$3)"));
    assert!(store.set_named_formula("Second", -1, "=Data!$B$2"));
    assert!(store.set_named_formula("NextRow", -1, "=Data!$B2"));
    store.set_formula(summary, 0, 0, "=Sales", 0);
    store.set_formula(summary, 0, 1, "=Second", 0);
    store.set_formula(summary, 0, 2, "=NextRow", 0);

    store.add_rows(data, 0, 1);
    store.insert_cols(data, 0, 1);
    store.set_formula(summary, 1, 0, "=Sales", 0);
    store.set_formula(summary, 1, 1, "=Second", 0);
    store.set_formula(summary, 1, 2, "=NextRow", 0);
    store.recompute(summary);

    assert_eq!(
        store.named_formula_source("Second", -1).as_deref(),
        Some("=Data!$C$3")
    );
    for row in [0, 1] {
        assert_eq!(number(&store, summary, row, 0), 60.0);
        assert_eq!(number(&store, summary, row, 1), 20.0);
    }
    assert_eq!(number(&store, summary, 0, 2), 20.0);
    assert_eq!(number(&store, summary, 1, 2), 30.0);
}

/// A sheet's own name follows a row edit on the sheet it reads, and turns
/// into `#REF!` when that row is removed.
#[test]
fn a_sheets_own_name_follows_row_edits() {
    let (mut store, data) = data_store();
    let summary = add_summary(&mut store);
    assert!(store.set_named_formula("Local", summary as i32, "=Data!$B$1*2"));
    store.set_formula(summary, 0, 0, "=Local", 0);

    store.add_rows(data, 0, 1);
    store.set_formula(summary, 1, 0, "=Local", 0);
    store.recompute(summary);
    assert_eq!(number(&store, summary, 0, 0), 20.0);
    assert_eq!(number(&store, summary, 1, 0), 20.0);

    store.remove_rows(data, 1, 1);
    store.set_formula(summary, 2, 0, "=Local", 0);
    store.recompute(summary);
    for row in 0..3 {
        assert_eq!(text(&store, summary, row, 0).as_deref(), Some("#REF!"));
    }
}

/// Formulas that used the names before a sheet rename or removal and
/// formulas that use them after it give the same result.
#[test]
fn names_follow_a_sheet_rename_and_removal() {
    let (mut store, data) = data_store();
    let summary = add_summary(&mut store);
    assert!(store.set_named_formula("Sales", -1, "=SUM(Data!$B$1:$B$3)"));
    assert!(store.set_named_formula("First", -1, "=Data!$B$1"));
    store.set_formula(summary, 0, 0, "=Sales", 0);
    store.set_formula(summary, 0, 1, "=First", 0);

    assert!(store.rename_sheet(data, "data", "Sales Data"));
    store.set_formula(summary, 1, 0, "=Sales", 0);
    store.set_formula(summary, 1, 1, "=First", 0);
    store.recompute(summary);
    for row in [0, 1] {
        assert_eq!(number(&store, summary, row, 0), 60.0);
        assert_eq!(number(&store, summary, row, 1), 10.0);
    }
    assert_eq!(
        store.formula_source(summary, 1, 0).as_deref(),
        Some("=Sales")
    );

    assert!(store.remove_sheet(data));
    store.set_formula(summary, 2, 0, "=Sales", 0);
    store.set_formula(summary, 2, 1, "=First", 0);
    store.recompute(summary);
    for row in 0..3 {
        assert_eq!(text(&store, summary, row, 0).as_deref(), Some("#REF!"));
        assert_eq!(text(&store, summary, row, 1).as_deref(), Some("#REF!"));
    }
}

#[cfg(not(feature = "analysis"))]
#[test]
fn the_default_engine_keeps_a_named_lambda_and_calling_it_is_a_name_error() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("Double", -1, "=LAMBDA(x,x*2)"));
    store.set_formula(sheet, 0, 3, "=Double(A1)", 0);
    store.recompute(sheet);

    assert_eq!(text(&store, sheet, 0, 3).as_deref(), Some("#NAME?"));
    assert_eq!(
        store.named_formula_source("Double", -1).as_deref(),
        Some("=LAMBDA(x,x*2)")
    );
}

#[cfg(feature = "analysis")]
mod lambda {
    use super::*;

    #[test]
    fn a_named_lambda_is_called_by_its_name() {
        let (mut store, sheet) = data_store();
        assert!(store.set_named_formula("Double", -1, "=LAMBDA(x,x*2)"));
        store.set_formula(sheet, 0, 3, "=Double(B1)", 0);
        store.set_formula(sheet, 1, 3, "=SUM(MAP(A1:A3,Double))", 0);
        store.set_formula(sheet, 2, 3, "=Double", 0);
        store.set_formula(sheet, 3, 3, "=Double(1,2)", 0);
        store.recompute(sheet);

        assert_eq!(number(&store, sheet, 0, 3), 20.0);
        assert_eq!(number(&store, sheet, 1, 3), 12.0);
        assert_eq!(text(&store, sheet, 2, 3).as_deref(), Some("#CALC!"));
        assert_eq!(text(&store, sheet, 3, 3).as_deref(), Some("#VALUE!"));
        assert_eq!(
            store.formula_source(sheet, 0, 3).as_deref(),
            Some("=Double(B1)")
        );

        store.set_number(sheet, 0, 1, 7.0, 0);
        store.recompute(sheet);
        assert_eq!(number(&store, sheet, 0, 3), 14.0);
    }

    #[test]
    fn a_named_lambda_that_returns_an_array_spills() {
        let (mut store, sheet) = data_store();
        assert!(store.set_named_formula("Scaled", -1, "=LAMBDA(k,Data!$A$1:$A$3*k)"));
        store.set_formula(sheet, 0, 4, "=Scaled(2)", 0);
        store.recompute(sheet);

        assert_eq!(
            [0, 1, 2].map(|row| number(&store, sheet, row, 4)),
            [2.0, 4.0, 6.0]
        );
    }

    #[test]
    fn a_named_lambda_calls_itself() {
        let (mut store, sheet) = data_store();
        assert!(store.set_named_formula("Fact", -1, "=LAMBDA(n,IF(n<=1,1,n*Fact(n-1)))"));
        assert!(store.set_named_formula("IsEven", -1, "=LAMBDA(n,IF(n=0,TRUE,IsOdd(n-1)))"));
        assert!(store.set_named_formula("IsOdd", -1, "=LAMBDA(n,IF(n=0,FALSE,IsEven(n-1)))"));
        store.set_formula(sheet, 0, 3, "=Fact(5)", 0);
        store.set_formula(sheet, 1, 3, "=IsEven(7)", 0);
        store.recompute(sheet);

        assert_eq!(number(&store, sheet, 0, 3), 120.0);
        let even = store.get_cell(sheet, 1, 3);
        assert_eq!((even.kind(), even.num()), (crate::types::KIND_BOOL, 0.0));
    }
}

#[cfg(feature = "analysis")]
#[test]
fn recursion_past_the_call_limit_is_a_num_error() {
    let (mut store, sheet) = data_store();
    assert!(store.set_named_formula("SumTo", -1, "=LAMBDA(n,IF(n=0,0,n+SumTo(n-1)))"));
    store.set_formula(sheet, 0, 3, "=SumTo(10)", 0);
    store.set_formula(sheet, 1, 3, "=SumTo(100000)", 0);
    store.recompute(sheet);

    assert_eq!(number(&store, sheet, 0, 3), 55.0);
    assert_eq!(text(&store, sheet, 1, 3).as_deref(), Some("#NUM!"));
}
