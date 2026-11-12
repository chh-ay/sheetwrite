//! Formula text after edits that rewrite references. As in Excel, only the
//! references are written again: the formula keeps its operators, spacing
//! and parentheses, and gets no new ones.

use crate::calc::parse;
use crate::formula_rewrite::write_references;
use crate::store::CellStore;

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
        write_references(source, &ast, &[]),
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
