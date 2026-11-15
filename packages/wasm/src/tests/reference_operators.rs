//! The reference operators: intersection (space), union (comma inside
//! parentheses) and 3-D references across a span of sheet tabs.

use super::*;

/// A1:E4 hold `10 * row + column`, both counted from 1: B2 is 22.
fn grid_sheet(store: &mut CellStore, formula_rows: usize) -> usize {
    let sheet = store.add_sheet(7, 4.max(formula_rows));
    for row in 0..4 {
        for col in 0..5 {
            store.set_number(sheet, row, col, ((row + 1) * 10 + col + 1) as f64, 0);
        }
    }
    sheet
}

fn assert_results(store: &CellStore, sheet: usize, col: usize, cases: &[(&str, &str)]) {
    for (row, (formula, expected)) in cases.iter().enumerate() {
        let actual = match string(store, sheet, row, col) {
            Some(text) => text,
            None => number(store, sheet, row, col).to_string(),
        };
        assert_eq!(&actual, expected, "{formula}");
    }
}

fn set_formulas(store: &mut CellStore, sheet: usize, col: usize, cases: &[(&str, &str)]) {
    for (row, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(sheet, row, col, formula, 0);
    }
    store.recompute(sheet);
}

#[test]
fn a_space_between_references_intersects_them_and_other_spaces_stay_insignificant() {
    let cases = [
        ("=SUM(A1:C3 B2:D4)", "110"),
        ("=A1:C3 C3:D4", "33"),
        ("=SUM(A1:C3 B1:D4 C2:C9)", "56"),
        ("=ROWS(A1:C3 B2:D4)", "2"),
        ("=SUM(A1:A2 C1:C2)", "#NULL!"),
        ("=A1:B2 C3:D4", "#NULL!"),
        ("=SUM(A1:C3 \"x\")", "#VALUE!"),
        ("=SUM( A1:A2 , B1 )", "44"),
        ("= A1 + B1 ", "23"),
        ("=IF( A1 > 5 , \"big\" , \"small\" )", "big"),
        ("=SUM (A1:A2)", "32"),
    ];
    let mut store = CellStore::new();
    let sheet = grid_sheet(&mut store, cases.len());
    set_formulas(&mut store, sheet, 6, &cases);
    assert_results(&store, sheet, 6, &cases);
    assert_eq!(
        store.formula_source(sheet, 0, 6).as_deref(),
        Some("=SUM(A1:C3 B2:D4)")
    );
}

#[test]
fn an_intersection_with_a_deleted_operand_parses_back_as_ref_error() {
    let mut store = CellStore::new();
    let data = store.add_sheet(4, 4);
    store.set_sheet_name(data, "Data", "Data");
    let main = grid_sheet(&mut store, 4);
    store.set_sheet_name(main, "Main", "Main");
    store.set_formula(main, 0, 6, "=SUM(Data!A1:C3 B2:D4)", 0);
    store.recompute(main);

    assert!(store.remove_sheet(data));
    let source = store.formula_source(main, 0, 6).unwrap_or_default();
    assert_eq!(source, "=SUM(#REF! B2:D4)");

    // A reload parses the stored text again.
    store.set_formula(main, 0, 6, &source, 0);
    store.recompute(main);
    assert_eq!(string(&store, main, 0, 6).as_deref(), Some("#REF!"));
}

#[test]
fn a_comma_inside_parentheses_unites_references_for_the_functions_that_take_them() {
    let cases = [
        ("=SUM((A1:A2,C1:C2))", "68"),
        ("=SUM(A1:A2,C1:C2)", "68"),
        ("=COUNT((A1,B2,C3))", "3"),
        ("=INDEX((A1:B2,D1:E2),1,1,2)", "14"),
        ("=INDEX((A1:B2,D1:E2),2,2)", "22"),
        ("=INDEX((A1:B2,D1:E2),1,1,3)", "#REF!"),
        ("=INDEX(A1:B2,1,1,2)", "#REF!"),
        ("=AREAS((A1:B2,D1:E2,E4))", "3"),
        ("=AREAS(A1:C3 B2:D4)", "1"),
        ("=AREAS(A1:G20)", "1"),
        ("=SMALL((A1:A2,C1:C2),2)", "13"),
        ("=LARGE((A1:A2,C1:C2),1)", "23"),
        ("=(A1,B1)", "#VALUE!"),
        ("=VLOOKUP(11,(A1:B2,D1:E2),2)", "#VALUE!"),
        ("=ROWS((A1:A2,C1:C2))", "#VALUE!"),
        ("=SUM((A1,1))", "#VALUE!"),
        ("=SUMPRODUCT((A1:A2,C1:C2))", "#VALUE!"),
        ("=CORREL((A1:A2,C1:C2),A1:B2)", "#VALUE!"),
    ];
    let mut store = CellStore::new();
    let sheet = grid_sheet(&mut store, cases.len());
    set_formulas(&mut store, sheet, 6, &cases);
    assert_results(&store, sheet, 6, &cases);

    store.set_number(sheet, 1, 2, 100.0, 0);
    store.recompute(sheet);
    assert_close(number(&store, sheet, 0, 6), 145.0);
    assert_eq!(
        store.formula_source(sheet, 0, 6).as_deref(),
        Some("=SUM((A1:A2,C1:C2))")
    );
}

/// Sheets First, Middle and Last hold 1, 10 and 100 in A1; Summary is
/// the fourth tab.
fn span_workbook() -> (CellStore, [usize; 4]) {
    let mut store = CellStore::new();
    let mut sheets = [0; 4];
    for (index, (name, value)) in [("First", 1.0), ("Middle", 10.0), ("Last", 100.0)]
        .into_iter()
        .enumerate()
    {
        sheets[index] = store.add_sheet(2, 2);
        store.set_sheet_name(sheets[index], name, name);
        store.set_number(sheets[index], 0, 0, value, 0);
    }
    sheets[3] = store.add_sheet(3, 3);
    store.set_sheet_name(sheets[3], "Summary", "Summary");
    (store, sheets)
}

fn order(handles: &[usize]) -> Vec<u32> {
    handles.iter().map(|&handle| handle as u32).collect()
}

#[test]
fn sheet_numbers_follow_added_and_moved_tabs() {
    let (mut store, [first, middle, last, summary]) = span_workbook();
    store.set_formula(summary, 0, 0, "=SHEETS()", 0);
    store.set_formula(summary, 1, 0, "=SHEET()", 0);
    store.set_formula(summary, 2, 0, "=SHEET(\"middle\")", 0);
    store.commit_sources();
    assert_close(number(&store, summary, 0, 0), 4.0);
    assert_close(number(&store, summary, 1, 0), 4.0);
    assert_close(number(&store, summary, 2, 0), 2.0);

    let added = store.add_sheet(2, 2);
    assert_close(number(&store, summary, 0, 0), 5.0);

    assert!(store.set_sheet_order(&order(&[summary, last, middle, first, added])));
    assert_close(number(&store, summary, 1, 0), 1.0);
    assert_close(number(&store, summary, 2, 0), 3.0);
}

#[test]
fn a_three_d_reference_aggregates_the_same_cells_on_every_sheet_of_the_span() {
    let (mut store, [_, middle, last, summary]) = span_workbook();
    let cases = [
        ("=SUM(First:Last!A1)", "111"),
        ("=COUNT(First:Last!A1:B2)", "3"),
        ("=MAX('First:Last'!A1)", "100"),
        ("=AVERAGE(Last:First!A1)", "37"),
        ("=VLOOKUP(1,First:Last!A1:B2,1)", "#VALUE!"),
        ("=First:Last!A1", "#VALUE!"),
        ("=SUM(First:Missing!A1)", "#REF!"),
    ];
    for (row, (formula, _)) in cases.iter().enumerate() {
        store.set_formula(summary, row % 3, row / 3, formula, 0);
    }
    store.recompute(summary);
    for (row, (formula, expected)) in cases.iter().enumerate() {
        let (row, col) = (row % 3, row / 3);
        let actual = string(&store, summary, row, col)
            .unwrap_or_else(|| number(&store, summary, row, col).to_string());
        assert_eq!(&actual, expected, "{formula}");
    }

    store.set_number(middle, 0, 0, 20.0, 0);
    store.recompute(middle);
    assert_close(number(&store, summary, 0, 0), 121.0);

    assert!(store.rename_sheet(last, "Last", "Last Tab"));
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=SUM('First:Last Tab'!A1)")
    );
    assert_close(number(&store, summary, 0, 0), 121.0);
}

#[test]
fn inserting_moving_and_removing_tabs_inside_a_span_patches_its_dependencies() {
    let (mut store, [first, middle, last, summary]) = span_workbook();
    store.set_formula(summary, 0, 0, "=SUM(First:Last!A1)", 0);
    store.commit_sources();
    assert_close(number(&store, summary, 0, 0), 111.0);

    let inserted = store.add_sheet(2, 2);
    store.set_sheet_name(inserted, "Inserted", "Inserted");
    store.set_number(inserted, 0, 0, 1000.0, 0);
    store.commit_sources();
    assert_close(number(&store, summary, 0, 0), 111.0);

    let epoch = store.graph.epoch();
    assert!(store.set_sheet_order(&order(&[first, inserted, middle, last, summary])));
    assert_eq!(store.graph.epoch(), epoch, "a tab move patches the index");
    assert_close(number(&store, summary, 0, 0), 1111.0);

    // The new reads are in the index: an edit on the inserted tab reaches
    // the formula without any rebuild.
    store.set_number(inserted, 0, 0, 2000.0, 0);
    store.commit_sources();
    assert_close(number(&store, summary, 0, 0), 2111.0);

    assert!(store.set_sheet_order(&order(&[first, inserted, last, summary, middle])));
    assert_close(number(&store, summary, 0, 0), 2101.0);
    store.set_number(middle, 0, 0, 5000.0, 0);
    store.commit_sources();
    assert_close(number(&store, summary, 0, 0), 2101.0);

    assert!(store.remove_sheet(inserted));
    assert_close(number(&store, summary, 0, 0), 101.0);
    assert_eq!(
        store.formula_source(summary, 0, 0).as_deref(),
        Some("=SUM(First:Last!A1)")
    );

    assert!(!store.set_sheet_order(&order(&[first, last, summary])));
    assert!(!store.set_sheet_order(&order(&[first, last, summary, middle, middle])));
    assert!(!store.set_sheet_order(&order(&[first, last, summary, inserted])));
}

#[test]
fn moving_or_removing_an_endpoint_moves_the_span_edge_as_excel_does() {
    let (mut store, [first, middle, last, summary]) = span_workbook();
    store.set_formula(summary, 0, 0, "=SUM(First:Last!A1)", 0);
    store.set_formula(summary, 1, 0, "=SUM(First:Middle!A1)", 0);
    store.commit_sources();
    // Summary moves out of the way first; it never enters a span, which
    // would make the formulas read themselves.
    assert!(store.set_sheet_order(&order(&[summary, first, middle, last])));
    assert_close(number(&store, summary, 0, 0), 111.0);

    // Moving the first endpoint past the last one drops it: its inner
    // neighbour becomes the endpoint.
    assert!(store.set_sheet_order(&order(&[summary, middle, last, first])));
    let source = |store: &CellStore, row| store.formula_source(summary, row, 0);
    assert_eq!(source(&store, 0).as_deref(), Some("=SUM(Middle:Last!A1)"));
    assert_close(number(&store, summary, 0, 0), 110.0);
    assert_eq!(source(&store, 1).as_deref(), Some("=SUM(Middle:Middle!A1)"));
    assert_close(number(&store, summary, 1, 0), 10.0);

    // Moving an endpoint outward widens the span over the tab it passes.
    assert!(store.set_sheet_order(&order(&[summary, middle, first, last])));
    assert_eq!(source(&store, 0).as_deref(), Some("=SUM(Middle:Last!A1)"));
    assert_close(number(&store, summary, 0, 0), 111.0);

    // Removing an endpoint gives way to its inner neighbour.
    assert!(store.remove_sheet(last));
    assert_eq!(source(&store, 0).as_deref(), Some("=SUM(Middle:First!A1)"));
    assert_close(number(&store, summary, 0, 0), 11.0);

    // Removing every sheet of a span leaves #REF!.
    assert!(store.remove_sheet(middle));
    assert_eq!(source(&store, 0).as_deref(), Some("=SUM(First:First!A1)"));
    assert_close(number(&store, summary, 0, 0), 1.0);
    assert_eq!(source(&store, 1).as_deref(), Some("=SUM(#REF!)"));
    assert_eq!(string(&store, summary, 1, 0).as_deref(), Some("#REF!"));
}
