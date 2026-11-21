//! Formula text after edits that rewrite references. As in Excel, only the
//! references are written again: the formula keeps its operators, spacing
//! and parentheses, and gets no new ones.

use crate::calc::{parse, WrittenNames};
use crate::formula_rewrite::write_references;
use crate::store::CellStore;
use crate::tests::support::{set_header_table, tree_address};
use crate::types::AbsCellKey;

const COLS: usize = 4;
const ROWS: usize = 8;

/// A store with `Sales` and `Summary`, in that tab order.
fn two_sheets() -> (CellStore, usize, usize) {
    let mut store = CellStore::new();
    let sales = store.add_sheet(COLS, ROWS);
    let summary = store.add_sheet(COLS, ROWS);
    store.set_sheet_name(sales, "sales", "Sales");
    store.set_sheet_name(summary, "summary", "Summary");
    (store, sales, summary)
}

/// Enter each formula in column A of `sheet`, one per row from row 1.
fn enter(store: &mut CellStore, sheet: usize, formulas: &[&str]) {
    for (row, formula) in formulas.iter().enumerate() {
        store.set_formula(sheet, row, 0, formula, 0);
    }
}

/// The text of the formulas in column A of `sheet` from row `first`.
fn texts(store: &CellStore, sheet: usize, first: usize, count: usize) -> Vec<String> {
    (first..first + count)
        .map(|row| store.formula_source(sheet, row, 0).unwrap_or_default())
        .collect()
}

#[test]
fn a_sheet_rename_changes_only_the_sheet_names() {
    let (mut store, sales, summary) = two_sheets();
    let formulas = [
        "=Sales!A1+1",
        "=SUM(Sales!A1:A3) * (Sales!B1)",
        "=-Sales!A1^2",
        "=[Book.xlsx]S!A1+Sales!A1",
        "=SUM(Sales:Summary!B1)/2",
        "=IF(Sales!A1>0,\"Sales!A1\",(Sales!B1))",
    ];
    enter(&mut store, summary, &formulas);

    assert!(store.rename_sheet(sales, "sales", "Sales Data"));

    assert_eq!(
        texts(&store, summary, 0, formulas.len()),
        [
            "='Sales Data'!A1+1",
            "=SUM('Sales Data'!A1:A3) * ('Sales Data'!B1)",
            "=-'Sales Data'!A1^2",
            "=[Book.xlsx]S!A1+'Sales Data'!A1",
            "=SUM('Sales Data:Summary'!B1)/2",
            "=IF('Sales Data'!A1>0,\"Sales!A1\",('Sales Data'!B1))",
        ]
    );

    // A quote in the new name is doubled inside the quoted sheet name.
    assert!(store.rename_sheet(sales, "sales", "O'Brien"));
    assert_eq!(texts(&store, summary, 0, 1), ["='O''Brien'!A1+1"]);
}

#[test]
fn naming_and_renaming_refuse_what_another_sheet_holds() {
    let (mut store, sales, summary) = two_sheets();
    enter(&mut store, summary, &["=Sales!A1"]);

    // Names fold case, so both entry points refuse another sheet's name in any case.
    assert!(!store.set_sheet_name(summary, "summary", "SALES"));
    assert!(!store.rename_sheet(summary, "summary", "sales"));
    assert!(!store.set_sheet_name(summary, "summary", ""));
    assert!(!store.rename_sheet(summary, "summary", ""));
    assert!(!store.set_sheet_name(summary, "sales", "Totals"));

    // The refusals changed nothing: a reference entered before or after them
    // still names Sales.
    store.set_formula(summary, 1, 0, "=Sales!A1", 0);
    assert!(store.rename_sheet(sales, "sales", "Revenue"));
    assert_eq!(texts(&store, summary, 0, 2), ["=Revenue!A1", "=Revenue!A1"]);

    // A sheet may take its own name again in another case.
    assert!(store.set_sheet_name(summary, "summary", "SUMMARY"));
    assert!(store.rename_sheet(summary, "summary", "Summary"));
}

#[test]
fn a_row_or_column_edit_changes_only_the_moved_references() {
    let (mut store, sales, _) = two_sheets();
    let formulas = [
        "=SUM(B1:B3) * (C1)",
        "=-B2^2+{1,2}",
        "=(B1+C1)/2",
        "=LET(x, B2, x*2)",
        "= B1 & \" B1 \"",
        " =  B1 & \" λ \"  ",
    ];
    enter(&mut store, sales, &formulas);

    assert!(store.add_rows(sales, 0, 1));
    assert_eq!(
        texts(&store, sales, 1, formulas.len()),
        [
            "=SUM(B2:B4) * (C2)",
            "=-B3^2+{1,2}",
            "=(B2+C2)/2",
            "=LET(x, B3, x*2)",
            "= B2 & \" B1 \"",
            " =  B2 & \" λ \"  ",
        ]
    );

    assert!(store.insert_cols(sales, 1, 1));
    assert!(store.remove_rows(sales, 0, 1));
    assert_eq!(
        texts(&store, sales, 0, formulas.len()),
        [
            "=SUM(C1:C3) * (D1)",
            "=-C2^2+{1,2}",
            "=(C1+D1)/2",
            "=LET(x, C2, x*2)",
            "= C1 & \" B1 \"",
            " =  C1 & \" λ \"  ",
        ]
    );
}

#[test]
fn a_deleted_reference_becomes_ref_error_and_the_rest_stays() {
    let (mut store, sales, _) = two_sheets();
    enter(&mut store, sales, &["=(B2 + B3) * 2"]);

    assert!(store.remove_rows(sales, 2, 1));

    assert_eq!(texts(&store, sales, 0, 1), ["=(B2 + #REF!) * 2"]);
}

#[test]
fn a_tab_move_changes_only_the_three_d_reference() {
    let mut store = CellStore::new();
    let [first, middle, last, summary] = ["First", "Middle", "Last", "Summary"].map(|name| {
        let sheet = store.add_sheet(COLS, ROWS);
        store.set_sheet_name(sheet, name, name);
        sheet as u32
    });
    store.set_formula(summary as usize, 0, 0, "=(SUM(First:Last!B1) + 1)*2", 0);

    // Moving the first endpoint past the last one drops it from the span.
    assert!(store.set_sheet_order(&[summary, middle, last, first]));

    assert_eq!(
        texts(&store, summary as usize, 0, 1),
        ["=(SUM(Middle:Last!B1) + 1)*2"]
    );
}

/// Every kind of reference in the text pairs with its node in the tree, so
/// each reference is written over exactly its own text: here, each one in
/// Excel's spelling.
#[test]
fn each_reference_of_the_text_pairs_with_the_tree() {
    let source = "= sum( a1 , b1:c2 ) & {1,#REF!;TRUE,\"x\"} & 'My Sheet'!b2:c3 \
                  + First:Last!a1 + [Book.xlsx]S!a1 + a1# + #ref! + 1:3 + a:b \
                  + T[[#Headers],[C]] + [@C] + Name + LOG10(a1) + (a1,b1) + a1 b1 \
                  + 'My Sheet':Other!a1 + 'O''Brien:Last'!a1 + 'München Süd'!b2 \
                  +\u{2003}Sales.Data";
    let ast = parse(source).expect("formula parses");

    assert_eq!(
        write_references(source, &ast, &WrittenNames::NONE),
        "= sum( A1 , B1:C2 ) & {1,#REF!;TRUE,\"x\"} & 'My Sheet'!B2:C3 \
         + First:Last!A1 + [Book.xlsx]S!A1 + A1# + #REF! + 1:3 + A:B \
         + T[[#Headers],[C]] + [@C] + Name + LOG10(A1) + (A1,B1) + A1 B1 \
         + 'My Sheet:Other'!A1 + 'O''Brien:Last'!A1 + 'München Süd'!B2 \
         +\u{2003}Sales.Data"
    );
}

#[test]
fn detached_references_keep_their_exact_sheet_text() {
    for source in [
        "='O''Brien'!$B$2",
        "='C:\\Reports\\[Missing.xlsx]O''Brien'!$A$1:$B$2",
    ] {
        assert_eq!(
            crate::formula_rewrite::translate_formula(source, 0, 0),
            source
        );
        let mut store = CellStore::new();
        let report = store.add_sheet(2, 2);
        store.set_sheet_name(report, "report", "Report");
        store.set_formula(report, 0, 0, source, 0);
        store.recompute(report);
        assert_eq!(
            store.get_cell(report, 0, 0).string().as_deref(),
            Some("#REF!")
        );
        assert_eq!(store.formula_source(report, 0, 0).as_deref(), Some(source));
    }
}

/// Formulas that name a sheet before it exists bind to it once it is named,
/// and then read its edits.
#[test]
fn overwritten_and_moved_pending_formulas_do_not_leave_stale_sheet_users() {
    let mut store = CellStore::new();
    let report = store.add_sheet(2, 4);
    store.set_sheet_name(report, "report", "Report");
    store.set_formula(report, 0, 0, "=Later!A1", 0);
    store.set_formula(report, 0, 1, "=SUM(Later!A1:A1)*3", 0);
    store.set_formula(report, 1, 0, "=Later!A1+2", 0);
    store.set_number(report, 0, 0, 17.0, 0);
    store.add_rows(report, 0, 1);
    store.set_formula(report, 3, 1, "=(2+3)*4", 0);
    store.recompute(report);
    let unrelated = tree_address(&store, report, 3, 1);
    assert!(unrelated.is_some(), "(2+3)*4 has a tree");
    let data = store.add_sheet(1, 1);
    store.set_number(data, 0, 0, 5.0, 0);
    store.set_sheet_name(data, "data", "Later");
    store.recompute(report);
    assert_eq!(store.get_cell(report, 1, 0).num(), 17.0);
    assert_eq!(store.get_cell(report, 2, 0).num(), 7.0);
    assert_eq!(store.get_cell(report, 1, 1).num(), 15.0, "the range binds");
    assert_eq!(
        tree_address(&store, report, 3, 1),
        unrelated,
        "a formula that does not name the sheet is not parsed again"
    );

    store.set_number(data, 0, 0, 11.0, 0);
    store.recompute(data);
    assert_eq!(
        store.get_cell(report, 2, 0).num(),
        13.0,
        "late binding installed graph reads"
    );
    assert_eq!(store.get_cell(report, 1, 1).num(), 33.0);
}

/// Table Sales over A1:B`last_row + 1` of `sheet`, with a header row and
/// columns `amount` (ID `a`, A) and Double (ID `d`, B).
fn set_sales(store: &mut CellStore, sheet: usize, last_row: usize, amount: &str) -> bool {
    set_header_table(
        store,
        ("sales", "Sales"),
        sheet,
        [0, 0, last_row, 1],
        &[("a", amount), ("d", "Double")],
    )
}

/// A sheet with Sales over amounts 2, 3 and 4, `[@Amount]*2` in B2,
/// `SUM(sales[amount])` in D1, a formula without tables in D2, and one
/// that names a table that does not exist yet in D3.
fn sales_sheet() -> (CellStore, usize) {
    let mut store = CellStore::new();
    let sheet = store.add_sheet(8, 8);
    store.set_sheet_name(sheet, "data", "Data");
    for (row, amount) in [(1, 2.0), (2, 3.0), (3, 4.0)] {
        store.set_number(sheet, row, 0, amount, 0);
    }
    assert!(set_sales(&mut store, sheet, 3, "Amount"), "Sales is set");
    store.set_formula(sheet, 1, 1, "=[@Amount]*2", 0);
    store.set_formula(sheet, 0, 3, "=SUM(sales[amount])", 0);
    store.set_formula(sheet, 1, 3, "=(2+3)*4", 0);
    store.set_formula(sheet, 2, 3, "=later[x]+1", 0);
    store.recompute(sheet);
    assert_eq!(store.get_cell(sheet, 1, 1).num(), 4.0, "[@Amount]*2 in B2");
    assert_eq!(store.get_cell(sheet, 0, 3).num(), 9.0, "SUM(sales[amount])");
    assert_eq!(
        store.get_cell(sheet, 2, 3).string().as_deref(),
        Some("#NAME?"),
        "a table that does not exist yet is an unknown name"
    );
    (store, sheet)
}

#[test]
fn appending_table_rows_rebuilds_only_whole_column_users() {
    let (mut store, sheet) = sales_sheet();
    let unrelated = tree_address(&store, sheet, 1, 3);
    let own_row = tree_address(&store, sheet, 1, 1);
    assert!(unrelated.is_some() && own_row.is_some());

    store.set_number(sheet, 4, 0, 10.0, 0);
    assert!(set_sales(&mut store, sheet, 4, "Amount"));
    store.recompute(sheet);
    assert_eq!(store.get_cell(sheet, 0, 3).num(), 19.0);
    assert_eq!(tree_address(&store, sheet, 1, 3), unrelated);
    assert_eq!(tree_address(&store, sheet, 1, 1), own_row);
    // An edited table's users name it as it is now, as before slots.
    assert_eq!(
        store.formula_source(sheet, 0, 3).as_deref(),
        Some("=SUM(Sales[Amount])")
    );
    store.set_number(sheet, 4, 0, 20.0, 0);
    store.recompute(sheet);
    assert_eq!(
        store.get_cell(sheet, 0, 3).num(),
        29.0,
        "the new row is read"
    );
}

#[test]
fn a_new_table_binds_only_the_formulas_waiting_for_it() {
    let (mut store, sheet) = sales_sheet();
    let unrelated = tree_address(&store, sheet, 1, 3);
    assert!(unrelated.is_some());

    store.set_number(sheet, 1, 5, 5.0, 0);
    assert!(set_header_table(
        &mut store,
        ("later", "Later"),
        sheet,
        [0, 5, 1, 5],
        &[("x", "X")],
    ));
    store.recompute(sheet);
    assert_eq!(store.get_cell(sheet, 2, 3).num(), 6.0);
    assert_eq!(
        store.formula_source(sheet, 2, 3).as_deref(),
        Some("=later[x]+1")
    );
    assert_eq!(tree_address(&store, sheet, 1, 3), unrelated);
    store.set_number(sheet, 1, 5, 7.0, 0);
    store.recompute(sheet);
    assert_eq!(
        store.get_cell(sheet, 2, 3).num(),
        8.0,
        "bound reads reach the graph"
    );
}

/// Table1 over A`row + 1`:B`row + 1 + amounts` of `sheet`, with a header
/// row, ID `id` and columns Amount and Other, holding `amounts`.
fn table_one(store: &mut CellStore, sheet: usize, row: usize, id: &str, amounts: &[f64]) -> bool {
    for (offset, &amount) in amounts.iter().enumerate() {
        store.set_number(sheet, row + 1 + offset, 0, amount, 0);
    }
    set_header_table(
        store,
        (id, "Table1"),
        sheet,
        [row, 0, row + amounts.len(), 1],
        &[("a", "Amount"), ("o", "Other")],
    )
}

/// How a test removes the cells of Table1 on Data.
#[derive(Clone, Copy, Debug)]
enum TableCellsRemoval {
    Sheet,
    Rows,
    Columns,
}

/// After the table that Report!A1 read is gone with its cells, a new table
/// of the same name in the freed slot leaves the old formula as `#REF!`:
/// the edit that removed the cells made the reference `#REF!` and dropped
/// the formula from the slot's users, so editing the new table does not
/// rebuild it either. New formulas bind to the new table.
#[test]
fn a_table_slot_freed_by_removing_its_cells_does_not_rebind_old_users() {
    const AMOUNTS: [f64; 2] = [2.0, 3.0];
    const TABLE_ROW_ON_DATA: usize = 2;

    for removal in [
        TableCellsRemoval::Sheet,
        TableCellsRemoval::Rows,
        TableCellsRemoval::Columns,
    ] {
        let mut store = CellStore::new();
        let [data, report, other] = ["Data", "Report", "Other"].map(|name| {
            let sheet = store.add_sheet(4, 8);
            store.set_sheet_name(sheet, &name.to_lowercase(), name);
            sheet
        });
        assert!(table_one(
            &mut store,
            data,
            TABLE_ROW_ON_DATA,
            "old",
            &AMOUNTS
        ));
        store.set_formula(report, 0, 0, "=SUM(Table1[Amount])", 0);
        store.recompute(report);
        assert_eq!(store.get_cell(report, 0, 0).num(), 5.0, "{removal:?}");

        let removed = match removal {
            TableCellsRemoval::Sheet => store.remove_sheet(data),
            TableCellsRemoval::Rows => store.remove_rows(data, TABLE_ROW_ON_DATA, 3),
            TableCellsRemoval::Columns => store.remove_cols(data, 0, 2),
        };
        assert!(removed, "{removal:?}");
        let ref_error = |store: &CellStore| {
            assert_eq!(
                store.get_cell(report, 0, 0).string().as_deref(),
                Some("#REF!"),
                "{removal:?}: the old formula reads nothing"
            );
            assert_eq!(
                store.formula_source(report, 0, 0).as_deref(),
                Some("=SUM(#REF!)"),
                "{removal:?}: the old formula names no table"
            );
        };
        store.recompute(report);
        ref_error(&store);

        // The only live table, so it takes the freed slot; then it grows.
        assert!(table_one(&mut store, other, 0, "new", &AMOUNTS));
        store.recompute(report);
        ref_error(&store);
        assert!(table_one(&mut store, other, 0, "new", &[2.0, 3.0, 10.0]));
        store.recompute(report);
        ref_error(&store);
        let stale = AbsCellKey {
            sheet: report as u32,
            row: 0,
            col: 0,
        };
        assert!(
            store
                .formula_id(stale)
                .is_some_and(|id| !store.formula_slots.table_users(0, true).contains(&id)),
            "{removal:?}: the old formula stays, and slot 0 does not list it"
        );

        store.set_formula(report, 1, 0, "=SUM(Table1[Amount])", 0);
        store.recompute(report);
        assert_eq!(store.get_cell(report, 1, 0).num(), 15.0, "{removal:?}");
    }
}
