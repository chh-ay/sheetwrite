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

/// A copy can move a relative edge past an absolute one; each edge keeps
/// its own `$` marker, as Excel writes it.
#[test]
fn copy_keeps_each_range_edge_with_its_marker() {
    assert_eq!(translate_formula("=A$5:A10", -8, 0), "=A$5:A2");
    assert_eq!(translate_formula("=$B1:A1", 0, 3), "=D1:$B1");
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

/// A sort moves each row as a unit and adjusts the formulas of that row for
/// its own move only (Microsoft Support, "Overview of formulas in Excel":
/// relative references change when the formula cell moves).
mod sort {
    use crate::formula_rewrite::sort_formula;

    #[test]
    fn same_row_references_move_with_the_row() {
        assert_eq!(sort_formula("=A2*B2", 3), "=A5*B5");
        assert_eq!(sort_formula("=SUM(A2:C2)", -1), "=SUM(A1:C1)");
    }

    #[test]
    fn references_to_other_rows_keep_their_offset() {
        assert_eq!(sort_formula("=A1+1", 3), "=A4+1");
    }

    #[test]
    fn a_reference_that_leaves_the_sheet_becomes_ref() {
        assert_eq!(sort_formula("=A1+B3", -1), "=#REF!+B2");
    }

    #[test]
    fn absolute_rows_stay() {
        assert_eq!(sort_formula("=$A$1+A$1+$A1", 2), "=$A$1+A$1+$A3");
    }

    #[test]
    fn columns_stay() {
        assert_eq!(sort_formula("=SUM(B:B)+C2", 1), "=SUM(B:B)+C3");
    }

    /// Microsoft Q&A, "INDEX + MATCH Breaks When Sorting": a reference with
    /// a sheet name does not follow the sort, also on the formula's own sheet.
    #[test]
    fn references_with_a_sheet_name_stay() {
        assert_eq!(sort_formula("=Sheet1!A2+A2", 2), "=Sheet1!A2+A4");
        assert_eq!(sort_formula("='My Data'!B2:B9", 2), "='My Data'!B2:B9");
    }

    #[test]
    fn structured_references_and_names_stay() {
        assert_eq!(sort_formula("=[@Qty]*Rate", 4), "=[@Qty]*Rate");
    }
}
