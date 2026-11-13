//! Formula text after edits that rewrite references. As in Excel, only the
//! references are written again: the formula keeps its operators, spacing
//! and parentheses, and gets no new ones.

use crate::calc::{parse, WrittenNames};
use crate::formula_rewrite::write_references;
use crate::store::CellStore;
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
                  + T[[#Headers],[C]] + [@C] + Name + LOG10(a1) + (a1,b1) + a1 b1";
    let ast = parse(source).expect("formula parses");

    assert_eq!(
        write_references(source, &ast, &WrittenNames::NONE),
        "= sum( A1 , B1:C2 ) & {1,#REF!;TRUE,\"x\"} & 'My Sheet'!B2:C3 \
         + First:Last!A1 + [Book.xlsx]S!A1 + A1# + #REF! + 1:3 + A:B \
         + T[[#Headers],[C]] + [@C] + Name + LOG10(A1) + (A1,B1) + A1 B1"
    );
}

#[test]
fn detached_references_keep_their_exact_sheet_text() {
    for source in [
        "='O''Brien'!$B$2",
        "='C:\\Reports\\[Missing.xlsx]O''Brien'!$A$1:$B$2",
    ] {
        let ast = parse(source).expect("detached formula parses");
        assert_eq!(crate::calc::serialize(&ast), source);
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

#[test]
fn a_late_sheet_binds_only_the_formulas_that_name_it() {
    use crate::calc::Ast;

    let mut store = CellStore::new();
    let report = store.add_sheet(3, 4);
    store.set_sheet_name(report, "report", "Report");
    let source = "=SUM('O''Brien'!A1:A2)+1";
    store.set_formula(report, 0, 0, source, 0);
    store.set_formula(report, 1, 0, "=IF(FALSE,'O''Brien'!A1,9)", 0);
    store.set_formula(report, 2, 0, "=(2+3)*4", 0);
    store.recompute(report);
    for row in 0..2 {
        assert_eq!(
            store.get_cell(report, row, 0).string().as_deref(),
            Some("#REF!")
        );
    }
    let unrelated_operand = |store: &CellStore| {
        let entry = store.sheets[report]
            .formulas
            .get((2, 0), &store.formula_slots)
            .unwrap();
        let Some(Ast::Bin(_, left, _)) = &entry.ast else {
            panic!("binary formula");
        };
        std::ptr::from_ref::<Ast>(left)
    };
    let original_operand = unrelated_operand(&store);
    let data = store.add_sheet(1, 2);
    store.set_number(data, 0, 0, 7.0, 0);
    store.set_number(data, 1, 0, 5.0, 0);
    store.set_sheet_name(data, "data", "O'Brien");
    store.recompute(report);
    assert_eq!(store.get_cell(report, 0, 0).num(), 13.0);
    assert_eq!(store.get_cell(report, 1, 0).num(), 9.0);
    assert_eq!(store.get_cell(report, 2, 0).num(), 20.0);
    assert_eq!(
        unrelated_operand(&store),
        original_operand,
        "unrelated tree was not reparsed"
    );
    assert_eq!(store.formula_source(report, 0, 0).as_deref(), Some(source));
    store.set_number(data, 0, 0, 11.0, 0);
    store.recompute(data);
    assert_eq!(
        store.get_cell(report, 0, 0).num(),
        17.0,
        "late binding installed graph reads"
    );
}

#[test]
fn overwritten_and_moved_pending_formulas_do_not_leave_stale_sheet_users() {
    let mut store = CellStore::new();
    let report = store.add_sheet(2, 4);
    store.set_sheet_name(report, "report", "Report");
    store.set_formula(report, 0, 0, "=Later!A1", 0);
    store.set_formula(report, 1, 0, "=Later!A1+2", 0);
    store.set_number(report, 0, 0, 17.0, 0);
    store.add_rows(report, 0, 1);
    let data = store.add_sheet(1, 1);
    store.set_number(data, 0, 0, 5.0, 0);
    store.set_sheet_name(data, "data", "Later");
    store.recompute(report);
    assert_eq!(store.get_cell(report, 1, 0).num(), 17.0);
    assert_eq!(store.get_cell(report, 2, 0).num(), 7.0);
}

/// The tree of the formula at (`row`, `col`), as an address that changes
/// when the formula is parsed or rebuilt again.
fn tree_address(
    store: &CellStore,
    sheet: usize,
    row: u32,
    col: u32,
) -> Option<*const crate::calc::Ast> {
    let entry = store.sheets[sheet]
        .formulas
        .get((row, col), &store.formula_slots)?;
    entry.ast.as_ref().map(std::ptr::from_ref)
}

/// Table Sales over A1:B`last_row + 1` of `sheet`, with a header row and
/// columns `amount` (ID `a`, A) and Double (ID `d`, B).
fn set_sales(store: &mut CellStore, sheet: usize, last_row: usize, amount: &str) -> bool {
    store.set_table(
        "sales",
        "Sales",
        sheet,
        0,
        0,
        last_row,
        1,
        true,
        false,
        vec!["a".to_owned(), "d".to_owned()],
        vec![amount.to_owned(), "Double".to_owned()],
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
    assert!(store.set_table(
        "later",
        "Later",
        sheet,
        0,
        5,
        1,
        5,
        true,
        false,
        vec!["x".to_owned()],
        vec!["X".to_owned()],
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

#[test]
fn renaming_and_removing_a_table_rewrite_only_its_users() {
    let (mut store, sheet) = sales_sheet();
    let unrelated = tree_address(&store, sheet, 1, 3);
    assert!(unrelated.is_some());

    assert!(set_sales(&mut store, sheet, 3, "Total"));
    store.recompute(sheet);
    assert_eq!(
        store.formula_source(sheet, 0, 3).as_deref(),
        Some("=SUM(Sales[Total])")
    );
    assert_eq!(
        store.formula_source(sheet, 1, 1).as_deref(),
        Some("=[@Total]*2")
    );
    assert_eq!(store.get_cell(sheet, 1, 1).num(), 4.0);

    assert!(store.remove_table("sales"));
    store.recompute(sheet);
    assert_eq!(
        store.get_cell(sheet, 0, 3).string().as_deref(),
        Some("#REF!")
    );
    assert_eq!(
        store.formula_source(sheet, 0, 3).as_deref(),
        Some("=SUM(#REF!)")
    );
    assert_eq!(tree_address(&store, sheet, 1, 3), unrelated);
}

/// Table1 over A`row + 1`:B`row + 3` of `sheet`, with a header row, ID `id`
/// and columns Amount and Other; its amounts are 2 and 3.
fn table_one(store: &mut CellStore, sheet: usize, row: usize, id: &str) -> bool {
    store.set_number(sheet, row + 1, 0, 2.0, 0);
    store.set_number(sheet, row + 2, 0, 3.0, 0);
    store.set_table(
        id,
        "Table1",
        sheet,
        row,
        0,
        row + 2,
        1,
        true,
        false,
        vec!["a".to_owned(), "o".to_owned()],
        vec!["Amount".to_owned(), "Other".to_owned()],
    )
}

/// A store with Data, Report and Other, Table1 on Data from row `row`, and
/// `SUM(Table1[Amount])` in Report!A1.
fn table_on_data(row: usize) -> (CellStore, usize, usize, usize) {
    let mut store = CellStore::new();
    let data = store.add_sheet(4, 8);
    let report = store.add_sheet(4, 8);
    let other = store.add_sheet(4, 8);
    store.set_sheet_name(data, "data", "Data");
    store.set_sheet_name(report, "report", "Report");
    store.set_sheet_name(other, "other", "Other");
    assert!(table_one(&mut store, data, row, "old"), "Table1 is set");
    store.set_formula(report, 0, 0, "=SUM(Table1[Amount])", 0);
    store.recompute(report);
    assert_eq!(store.get_cell(report, 0, 0).num(), 5.0, "the table is read");
    (store, data, report, other)
}

/// After the table that Report!A1 read is gone with its cells, a new table
/// of the same name in the freed slot leaves the old formula as `#REF!`:
/// the edit that removed the cells made the reference `#REF!` and dropped
/// the formula from the slot's users, so editing the new table does not
/// rebuild it either.
fn assert_reused_slot_leaves_ref_error(mut store: CellStore, report: usize, other: usize) {
    let stale = AbsCellKey {
        sheet: report as u32,
        row: 0,
        col: 0,
    };
    let ref_error = |store: &CellStore| {
        assert_eq!(
            store.get_cell(report, 0, 0).string().as_deref(),
            Some("#REF!"),
            "the old formula reads nothing"
        );
        assert_eq!(
            store.formula_source(report, 0, 0).as_deref(),
            Some("=SUM(#REF!)"),
            "the old formula names no table"
        );
    };
    store.recompute(report);
    ref_error(&store);
    let tree = tree_address(&store, report, 0, 0);

    // The only live table, so it takes the freed slot 0.
    assert!(
        table_one(&mut store, other, 0, "new"),
        "the new Table1 is set"
    );
    store.recompute(report);
    ref_error(&store);
    assert!(
        store
            .formula_id(stale)
            .is_some_and(|id| !store.formula_slots.table_users(0, true).contains(&id)),
        "the old formula stays, and slot 0 does not list it"
    );

    store.set_number(other, 3, 0, 10.0, 0);
    let grown = store.set_table(
        "new",
        "Table1",
        other,
        0,
        0,
        3,
        1,
        true,
        false,
        vec!["a".to_owned(), "o".to_owned()],
        vec!["Amount".to_owned(), "Other".to_owned()],
    );
    assert!(grown, "the new table grows");
    store.recompute(report);
    ref_error(&store);
    assert_eq!(
        tree_address(&store, report, 0, 0),
        tree,
        "editing the new table leaves the old formula alone"
    );

    store.set_formula(report, 1, 0, "=SUM(Table1[Amount])", 0);
    store.recompute(report);
    assert_eq!(
        store.get_cell(report, 1, 0).num(),
        15.0,
        "new formulas bind"
    );
}

#[test]
fn a_table_slot_freed_by_removing_its_sheet_does_not_rebind_old_users() {
    let (mut store, data, report, other) = table_on_data(0);
    assert!(store.remove_sheet(data), "Data is removed");
    assert_reused_slot_leaves_ref_error(store, report, other);
}

#[test]
fn a_table_slot_freed_by_removing_its_rows_does_not_rebind_old_users() {
    let (mut store, data, report, other) = table_on_data(2);
    assert!(store.remove_rows(data, 2, 3), "Table1's rows are removed");
    assert_reused_slot_leaves_ref_error(store, report, other);
}

#[test]
fn a_table_slot_freed_by_removing_its_columns_does_not_rebind_old_users() {
    let (mut store, data, report, other) = table_on_data(0);
    assert!(
        store.remove_cols(data, 0, 2),
        "Table1's columns are removed"
    );
    assert_reused_slot_leaves_ref_error(store, report, other);
}
