//! Formula text rewrites for paste, fill and conditional-format rules.
//! `packages/core/test/a1.test.ts` checks the common cases through the
//! public `shiftA1Refs` and `remapFormulaA1Refs`, which call these
//! rewrites; the cases here are the ones it does not reach.

use crate::formula_rewrite::{move_formula_axis, shift_formula_axis, translate_formula};

const ROWS: bool = false;

#[test]
fn copies_move_relative_parts_and_leave_the_rest_as_written() {
    // (source, rows moved, columns moved, rewritten source)
    let copies = [
        ("=SUM($A:A,$1:2)", 1, 1, "=SUM($A:B,$1:3)"),
        ("=SUM(A:A)", 5, 0, "=SUM(A:A)"),
        // A copy can move a relative edge past an absolute one; each edge
        // keeps its own `$` marker, as Excel writes it.
        ("=A$5:A10", -8, 0, "=A$5:A2"),
        ("=$B1:A1", 0, 3, "=D1:$B1"),
        ("=Sheet2!A1#+1", 0, -1, "=#REF!+1"),
        (
            "= sum( a1 , $B$2 ) & \"A1\" & 'A1 sheet'!c3",
            1,
            0,
            "= sum( A2 , $B$2 ) & \"A1\" & 'A1 sheet'!C4",
        ),
        ("=Table1[Col]+A1", 1, 0, "=Table1[Col]+A2"),
        // Text that does not lex stays unchanged.
        ("=A1&\"open", 1, 0, "=A1&\"open"),
    ];
    for (source, rows, columns, rewritten) in copies {
        assert_eq!(
            translate_formula(source, rows, columns),
            rewritten,
            "{source} copied by {rows} rows and {columns} columns"
        );
    }
}

#[test]
fn row_edits_move_the_references_on_their_sheet() {
    assert_eq!(
        shift_formula_axis("=SUM(A1:A5)", ROWS, 3, -2),
        "=SUM(A1:A3)"
    );
    assert_eq!(shift_formula_axis("=$A$2+A:A", ROWS, 0, 2), "=$A$4+A:A");
    assert_eq!(
        shift_formula_axis("=Sheet2!A3+A3", ROWS, 0, 1),
        "=Sheet2!A3+A4"
    );
    assert_eq!(
        move_formula_axis("=SUM(A1:A10)", ROWS, 1, 2, 8),
        "=SUM(A1:A8)"
    );
}

/// A sort moves each row as a unit and adjusts the formulas of that row for
/// its own move only (Microsoft Support, "Overview of formulas in Excel":
/// relative references change when the formula cell moves).
#[test]
fn a_sort_moves_only_the_relative_rows_of_a_formula() {
    use crate::formula_rewrite::sort_formula;

    // (source, rows the formula's cell moves, rewritten source)
    let sorts = [
        ("=A1+B3", -1, "=#REF!+B2"),
        ("=$A$1+A$1+$A1", 2, "=$A$1+A$1+$A3"),
        ("=SUM(B:B)+C2", 1, "=SUM(B:B)+C3"),
        ("=[@Qty]*Rate", 4, "=[@Qty]*Rate"),
    ];
    for (source, rows, rewritten) in sorts {
        assert_eq!(
            sort_formula(source, rows),
            rewritten,
            "{source} moved {rows} rows"
        );
    }
}

/// Renaming a table or a column updates the structured references that name
/// it, as Excel updates formulas: "Rename an Excel table" and "Using
/// structured references with Excel tables" on Microsoft Support.
mod structured_renames {
    use crate::formula_rewrite::rename_structured_reference;

    /// The column argument of a table rename.
    const NO_COLUMN: &str = "";

    #[test]
    fn a_table_rename_updates_its_references_only() {
        assert_eq!(
            rename_structured_reference(
                "=SUM(orders[amount]) / SUM(Orders2[amount])",
                "ORDERS",
                NO_COLUMN,
                "Sales"
            ),
            "=SUM(Sales[amount]) / SUM(Orders2[amount])"
        );
        assert_eq!(
            rename_structured_reference(
                "=orders[[#Headers],[amount]]&\"orders[x]\"",
                "orders",
                NO_COLUMN,
                "Sales"
            ),
            "=Sales[[#Headers],[amount]]&\"orders[x]\""
        );
        // Text that does not lex stays unchanged.
        assert_eq!(
            rename_structured_reference("=\"open", "orders", NO_COLUMN, "x"),
            "=\"open"
        );
    }

    #[test]
    fn a_column_rename_updates_that_tables_column_in_every_section() {
        assert_eq!(
            rename_structured_reference(
                "=SUM(orders[Amount])+orders[@amount]+LEN(orders[[#Totals],[AMOUNT]])+other[amount]+orders[qty]",
                "Orders",
                "amount",
                "Net"
            ),
            "=SUM(orders[Net])+orders[@Net]+LEN(orders[[#Totals],[Net]])+other[amount]+orders[qty]"
        );
    }

    #[test]
    fn an_empty_table_renames_unqualified_references() {
        assert_eq!(
            rename_structured_reference(
                "=[Total Sales]/orders[total sales]+[Other]",
                "",
                "total sales",
                "Revenue"
            ),
            "=[Revenue]/orders[total sales]+[Other]"
        );
    }
}
