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
        ]
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
        write_references(source, &ast),
        "= sum( A1 , B1:C2 ) & {1,#REF!;TRUE,\"x\"} & 'My Sheet'!B2:C3 \
         + First:Last!A1 + [Book.xlsx]S!A1 + A1# + #REF! + 1:3 + A:B \
         + T[[#Headers],[C]] + [@C] + Name + LOG10(A1) + (A1,B1) + A1 B1"
    );
}
