//! The cells that SUBTOTAL and AGGREGATE leave out of a reference: rows that
//! the sheet's view hides, and cells whose formula calls SUBTOTAL or
//! AGGREGATE, which Excel skips so that a subtotal is not counted twice.

use crate::calc::{Ast, Func};
use crate::row_visibility::SkippedRows;
use crate::sheet::SheetData;
use crate::types::FormulaEntry;

/// Whether `ast` calls SUBTOTAL or AGGREGATE anywhere.
pub(crate) fn ast_calls_subtotal(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Subtotal, _) => true,
        #[cfg(feature = "analysis")]
        Ast::Func(Func::Analysis(super::analysis::AGGREGATE_ID), _) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_calls_subtotal),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_calls_subtotal(left) || ast_calls_subtotal(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_calls_subtotal(inner),
        Ast::LetSlot { expression, .. } => ast_calls_subtotal(expression),
        _ => false,
    }
}

/// What a SUBTOTAL or AGGREGATE reference argument leaves out. A skipped
/// cell is read as blank and is not evaluated, so an error there does not
/// reach the result.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SkippedCells {
    pub(crate) rows: Option<SkippedRows>,
    pub(crate) nested_subtotals: bool,
}

impl SkippedCells {
    // Out of line: the range readers that inline the call run it only for
    // SUBTOTAL and AGGREGATE, so one copy keeps the engine binary small.
    #[inline(never)]
    pub(crate) fn skips_row(self, sheet: &SheetData, row: u32) -> bool {
        self.rows
            .is_some_and(|rows| sheet.visibility.skips(row, rows))
    }

    #[inline(never)]
    pub(crate) fn skips_cell(self, sheet: &SheetData, row: u32, col: u32) -> bool {
        self.nested_subtotals
            && sheet
                .formulas
                .get((row, col))
                .is_some_and(FormulaEntry::calls_subtotal)
    }
}
