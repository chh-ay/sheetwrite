//! Formula text rewrites for paste, fill and conditional-format rules.

use crate::formula_rewrite::{move_formula_axis, shift_formula_axis, translate_formula};

const ROWS: bool = false;
const COLUMNS: bool = true;

#[test]
fn copy_moves_whole_columns_and_rows() {
    assert_eq!(translate_formula("=SUM(A:A)", 0, 1), "=SUM(B:B)");
    assert_eq!(translate_formula("=SUM(1:1)", 2, 0), "=SUM(3:3)");
    assert_eq!(
        translate_formula("=SUM($A:A,$1:2)", 1, 1),
        "=SUM($A:B,$1:3)"
    );
    assert_eq!(translate_formula("=SUM(A:A)", 5, 0), "=SUM(A:A)");
}

#[test]
fn copy_keeps_names_past_the_last_column() {
    assert_eq!(translate_formula("=XYZ1+A1", 1, 1), "=XYZ1+B2");
    assert_eq!(
        translate_formula("=LOG10(A1)+A1_name", 1, 0),
        "=LOG10(A2)+A1_name"
    );
}

#[test]
fn copy_keeps_absolute_parts() {
    assert_eq!(translate_formula("=$A$1+$A1+A$1", 2, 3), "=$A$1+$A3+D$1");
}

#[test]
fn copy_past_the_sheet_edge_gives_ref_errors() {
    assert_eq!(translate_formula("=XFD1", 0, 1), "=#REF!");
    assert_eq!(translate_formula("=A1048576", 1, 0), "=#REF!");
    assert_eq!(translate_formula("=XFC1048575", 1, 1), "=XFD1048576");
    assert_eq!(translate_formula("=SUM(A1:B2)", -1, 0), "=SUM(#REF!)");
    assert_eq!(translate_formula("=Sheet2!A1#+1", 0, -1), "=#REF!+1");
}

#[test]
fn copy_rewrites_only_the_references_that_change() {
    assert_eq!(
        translate_formula("= sum( a1 , $B$2 ) & \"A1\" & 'A1 sheet'!c3", 1, 0),
        "= sum( A2 , $B$2 ) & \"A1\" & 'A1 sheet'!C4"
    );
    assert_eq!(
        translate_formula("=SUM(A1#)+$B$2#", 1, 1),
        "=SUM(B2#)+$B$2#"
    );
    assert_eq!(
        translate_formula("=Table1[Col]+A1", 1, 0),
        "=Table1[Col]+A2"
    );
}

#[test]
fn text_that_does_not_lex_stays_unchanged() {
    assert_eq!(translate_formula("=A1&\"open", 1, 0), "=A1&\"open");
}

#[test]
fn deleted_rows_shrink_a_range() {
    assert_eq!(
        shift_formula_axis("=SUM(A1:A5)", ROWS, 3, -2),
        "=SUM(A1:A3)"
    );
    assert_eq!(
        shift_formula_axis("=SUM(A2:A3)", ROWS, 1, -2),
        "=SUM(#REF!)"
    );
    assert_eq!(
        shift_formula_axis("=A1+B1+C1", COLUMNS, 1, -1),
        "=A1+#REF!+B1"
    );
    assert_eq!(shift_formula_axis("=SUM(A3#)", ROWS, 0, -1), "=SUM(A2#)");
}

#[test]
fn structural_edits_move_absolute_parts_and_keep_whole_axes() {
    assert_eq!(shift_formula_axis("=$A$2+A:A", ROWS, 0, 2), "=$A$4+A:A");
    assert_eq!(shift_formula_axis("=SUM(B:B)", COLUMNS, 0, -1), "=SUM(A:A)");
    assert_eq!(
        shift_formula_axis("=SUM(A:A)", COLUMNS, 0, -1),
        "=SUM(#REF!)"
    );
}

#[test]
fn structural_edits_leave_other_sheet_references() {
    assert_eq!(
        shift_formula_axis("=Sheet2!A3+A3", ROWS, 0, 1),
        "=Sheet2!A3+A4"
    );
}

#[test]
fn moved_rows_take_their_references_along() {
    assert_eq!(move_formula_axis("=A1+A2+A4", ROWS, 0, 2, 1), "=A2+A3+A4");
    assert_eq!(
        move_formula_axis("=SUM(A1:A10)", ROWS, 1, 2, 8),
        "=SUM(A1:A8)"
    );
}
