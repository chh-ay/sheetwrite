//! Reference rewrites that replace only the text of references, so a
//! formula keeps the spacing, case and parentheses that its author wrote, as
//! Excel keeps them. Pasted and filled cells and conditional-format rules are
//! rewritten from their text alone; formulas and defined names in the store
//! are rewritten through their parse tree, and their references are then
//! written again from the tree. Each reference follows the rules of formulas
//! in the store (whole columns and rows, the `XFD1048576` sheet edge, `#REF!`
//! for a reference that leaves the sheet).

use wasm_bindgen::prelude::wasm_bindgen;

use crate::calc::{
    area, lex_token, rewrite_own_sheet_axis, translate_relative_refs, write_ast,
    write_ast_with_sheets, AreaEnd, Ast, Axis, AxisChange, Func, Tok,
};
use crate::types::FormulaError;

/// Move the relative references of a copied formula by the distance from
/// its source cell to its target cell. Absolute parts stay; a reference
/// moved off the sheet becomes `#REF!`.
#[wasm_bindgen(js_name = translateFormula)]
pub fn translate_formula(source: &str, row_delta: i32, col_delta: i32) -> String {
    rewrite_references(source, |reference, _| {
        translate_relative_refs(reference, i64::from(row_delta), i64::from(col_delta));
    })
}

/// Adjust a formula whose row a sort moves by `row_delta`, as Excel does: the
/// relative row parts of references without a sheet name move with the row,
/// so a reference to the same row stays on that row. Absolute parts, columns
/// and references with a sheet name, also of the formula's own sheet, stay.
pub(crate) fn sort_formula(source: &str, row_delta: i32) -> String {
    rewrite_references(source, |reference, qualified| {
        if !qualified {
            translate_relative_refs(reference, i64::from(row_delta), 0);
        }
    })
}

/// Follow `delta` rows or columns inserted (positive) or deleted (negative)
/// at `at` on the formula's own sheet. A range loses its deleted rows or
/// columns and becomes `#REF!` only when none are left.
#[wasm_bindgen(js_name = shiftFormulaAxis)]
pub fn shift_formula_axis(source: &str, columns: bool, at: u32, delta: i32) -> String {
    let change = AxisChange::Shift {
        at,
        delta: i64::from(delta),
    };
    rewrite_own_sheet(source, columns, change)
}

/// Follow `count` rows or columns moved from `from` to `to` on the formula's
/// own sheet; `to` is the first index of the moved block after the move.
#[wasm_bindgen(js_name = moveFormulaAxis)]
pub fn move_formula_axis(source: &str, columns: bool, from: u32, count: u32, to: u32) -> String {
    rewrite_own_sheet(source, columns, AxisChange::Move { from, count, to })
}

/// A structural edit moves cells, so absolute and relative parts both follow
/// it. A reference qualified by a sheet name is left to that sheet's edit.
fn rewrite_own_sheet(source: &str, columns: bool, change: AxisChange) -> String {
    let axis = if columns { Axis::Col } else { Axis::Row };
    rewrite_references(source, |reference, qualified| {
        if !qualified {
            rewrite_own_sheet_axis(reference, axis, change);
        }
    })
}

/// Rename a table or a table column in the structured references of a
/// formula, as Excel updates formulas when a table or a column is renamed.
/// An empty `column` renames table `table` to `to`; otherwise column
/// `column` of `table` becomes `to`, where an empty `table` means
/// references without a table name. Names match without case.
#[wasm_bindgen(js_name = renameStructuredReference)]
pub fn rename_structured_reference(source: &str, table: &str, column: &str, to: &str) -> String {
    let Some(lexemes) = lex(source) else {
        return source.to_owned();
    };

    let mut out = String::with_capacity(source.len());
    let mut copied = 0;
    for (index, lexeme) in lexemes.iter().enumerate() {
        let Tok::Structured(raw) = &lexeme.tok else {
            continue;
        };
        let owner = index.checked_sub(1).map(|owner| &lexemes[owner]);
        let owner_name = match owner.map(|before| &before.tok) {
            Some(Tok::Ident(name, _)) => name.as_ref(),
            _ => "",
        };
        if !same_name(owner_name, table) {
            continue;
        }

        let span = if column.is_empty() {
            owner
                .filter(|_| !owner_name.is_empty())
                .map(|before| before.start..before.end)
        } else {
            let columns = column_span(raw);
            same_name(&raw[columns.clone()], column)
                .then(|| lexeme.start + columns.start..lexeme.start + columns.end)
        };
        if let Some(replaced) = span {
            out.push_str(&source[copied..replaced.start]);
            out.push_str(to);
            copied = replaced.end;
        }
    }

    out.push_str(&source[copied..]);
    out
}

fn same_name(left: &str, right: &str) -> bool {
    left.to_lowercase() == right.to_lowercase()
}

/// The byte span of the column name in a structured reference token:
/// `[Column]`, `[@Column]` or `[[#Section],[Column]]`.
fn column_span(raw: &str) -> std::ops::Range<usize> {
    if let Some(separator) = raw.strip_prefix("[[").and_then(|inner| inner.find("],[")) {
        return separator + 5..raw.len() - 2;
    }
    let start = if raw.starts_with("[@") { 2 } else { 1 };
    start..raw.len() - 1
}

/// Tokens past half the source length that the first token buffer holds.
const TOKEN_SLACK: usize = 4;

/// Tokens per reference in a typical formula, for the first reference buffer:
/// a reference and the operator or separator around it.
const TOKENS_PER_REFERENCE: usize = 4;

/// One token of the source and its byte span.
struct Lexeme<'a> {
    tok: Tok<'a>,
    start: usize,
    end: usize,
}

/// One reference in the source text, as the parser reads it: a cell, range
/// or 3-D reference, a table reference, or `#REF!`.
struct Reference {
    /// The cell or range of a cell, range or 3-D reference, without its sheet
    /// qualifier. A table reference and `#REF!` have none.
    ast: Option<Ast>,
    /// Whether a sheet name qualifies the reference.
    qualified: bool,
    /// Byte offset of the reference, with its sheet or workbook qualifier.
    start: usize,
    /// Byte offset of the coordinates.
    coordinates_start: usize,
    end: usize,
}

impl Reference {
    /// A table reference or `#REF!` from lexeme `first` to lexeme `last`.
    fn whole(lexemes: &[Lexeme<'_>], first: usize, last: usize) -> Self {
        Self {
            ast: None,
            qualified: false,
            start: lexemes[first].start,
            coordinates_start: lexemes[first].start,
            end: lexemes[last].end,
        }
    }

    /// Whether the text ends with the spill suffix `#`.
    fn spills(&self) -> bool {
        matches!(self.ast, Some(Ast::Func(Func::AnchorArray, _)))
    }
}

/// Rewrite each reference through `rewrite` and replace the text of the
/// ones that change. A source that does not lex is not a formula the engine
/// accepts, so it is returned unchanged.
fn rewrite_references(source: &str, mut rewrite: impl FnMut(&mut Ast, bool)) -> String {
    let Some(lexemes) = lex(source) else {
        return source.to_owned();
    };

    let mut out = String::with_capacity(source.len());
    let mut copied = 0;
    for reference in references(&lexemes) {
        let Some(original) = &reference.ast else {
            continue;
        };
        let mut rewritten = original.clone();
        rewrite(&mut rewritten, reference.qualified);
        if rewritten == *original {
            continue;
        }

        // A deleted reference loses its sheet name and spill suffix too:
        // `Sheet2!A1#` becomes `#REF!`, which is how the engine writes it.
        let replaced_from = if is_deleted(&rewritten) {
            rewritten = Ast::InvalidRef;
            reference.start
        } else {
            reference.coordinates_start
        };
        out.push_str(&source[copied..replaced_from]);
        write_ast(&rewritten, &mut out);
        copied = reference.end;
    }

    out.push_str(&source[copied..]);
    out
}

/// `source` with each reference written again from `ast`, its parse after a
/// rewrite of the references. A reference is a cell, range, 3-D or table
/// reference, or `#REF!`. Only a reference whose text differs from what the
/// tree writes is replaced, in Excel's spelling; the operators, spacing and
/// parentheses stay as written.
///
/// The references of the tree and of the text are paired in source order.
/// When the counts differ, they cannot be paired, and the whole formula is
/// written from the tree. Out of line: every reader of formula text calls it.
#[inline(never)]
pub(crate) fn write_references(source: &str, ast: &Ast, names: &[String]) -> String {
    let spans = lex(source).map_or_else(Vec::new, |lexemes| references(&lexemes));
    let mut out = String::with_capacity(source.len());
    let mut copied = 0;
    let mut count = 0;
    for_each_reference(ast, &mut |node| {
        let Some(span) = spans.get(count) else {
            count += 1;
            return;
        };
        count += 1;
        let kept = out.len();
        out.push_str(&source[copied..span.start]);
        let written = out.len();
        write_ast_with_sheets(node, &mut out, names);

        // A deleted spill anchor writes as `#REF!`, without the suffix.
        if span.spills() && !matches!(node, Ast::InvalidRef) {
            out.push('#');
        }
        if out[written..] == source[span.start..span.end] {
            out.truncate(kept);
        } else {
            copied = span.end;
        }
    });

    debug_assert_eq!(count, spans.len(), "references of {source}");
    if count != spans.len() {
        out.clear();
        write_ast_with_sheets(ast, &mut out, names);
        return out;
    }
    out.push_str(&source[copied..]);
    out
}

/// Visit each reference of `ast` in source order: the nodes that
/// [`references`] finds in the text.
fn for_each_reference(ast: &Ast, visit: &mut dyn FnMut(&Ast)) {
    match ast {
        Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::SheetSpan(_)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::InvalidRef => visit(ast),
        _ => {
            ast.any_child(&mut |child| {
                for_each_reference(child, visit);
                false
            });
        }
    }
}

fn is_deleted(reference: &Ast) -> bool {
    match reference {
        Ast::InvalidRef => true,
        Ast::Func(Func::AnchorArray, anchor) => matches!(anchor.as_ref(), [Ast::InvalidRef]),
        _ => false,
    }
}

fn lex(source: &str) -> Option<Vec<Lexeme<'_>>> {
    // A token is about two bytes of a formula on average, so one
    // allocation holds the tokens of most formulas.
    let mut lexemes: Vec<Lexeme<'_>> = Vec::with_capacity(source.len() / 2 + TOKEN_SLACK);
    let mut index = 0;
    while index < source.len() {
        let start = index;
        let previous = lexemes.last().map(|lexeme| &lexeme.tok);
        if let Some(tok) = lex_token(source, &mut index, previous).ok()? {
            lexemes.push(Lexeme {
                tok,
                start,
                end: index,
            });
        }
    }
    Some(lexemes)
}

/// The references in source order. The shapes follow the parser: a name
/// before `(` is a function, before `[` a table, and before `!` (or as
/// `First:Last!`) a sheet qualifier of the reference after it; a `[...]`
/// before `Sheet!` names another workbook, and any other one is a table
/// reference. An array constant holds values only.
fn references(lexemes: &[Lexeme<'_>]) -> Vec<Reference> {
    let tok = |index: usize| lexemes.get(index).map(|lexeme| &lexeme.tok);
    let mut found = Vec::with_capacity(lexemes.len() / TOKENS_PER_REFERENCE + 1);
    let mut open_arrays = 0usize;
    let mut index = 0;
    while index < lexemes.len() {
        let start = lexemes[index].start;
        let (coordinates, qualified) = match (tok(index), tok(index + 1)) {
            (Some(Tok::LBrace), _) => {
                open_arrays += 1;
                index += 1;
                continue;
            }
            (Some(Tok::RBrace), _) => {
                open_arrays = open_arrays.saturating_sub(1);
                index += 1;
                continue;
            }
            _ if open_arrays > 0 => {
                index += 1;
                continue;
            }
            (Some(Tok::Error(FormulaError::Ref)), _) => {
                found.push(Reference::whole(lexemes, index, index));
                index += 1;
                continue;
            }
            (Some(Tok::Ident(..)), Some(Tok::Structured(_))) => {
                found.push(Reference::whole(lexemes, index, index + 1));
                index += 2;
                continue;
            }
            // `[Budget.xlsx]!Total`: a defined name of another workbook.
            (Some(Tok::Structured(_)), Some(Tok::Bang)) => {
                index += 2;
                continue;
            }
            (Some(Tok::Structured(_)), Some(Tok::Ident(_, false)))
                if tok(index + 2) == Some(&Tok::Bang) =>
            {
                (index + 3, true)
            }
            (Some(Tok::Structured(_)), _) => {
                found.push(Reference::whole(lexemes, index, index));
                index += 1;
                continue;
            }
            (Some(Tok::Ident(..)), Some(Tok::LParen)) => {
                index += 2;
                continue;
            }
            (Some(Tok::Ident(..)), Some(Tok::Bang)) => (index + 2, true),
            (Some(Tok::Ident(..)), Some(Tok::Colon))
                if matches!(
                    (tok(index + 2), tok(index + 3)),
                    (Some(Tok::Ident(..)), Some(Tok::Bang))
                ) =>
            {
                (index + 4, true)
            }
            (Some(Tok::Ident(..)), _) | (Some(Tok::Num(_)), Some(Tok::Colon)) => (index, false),
            _ => {
                index += 1;
                continue;
            }
        };

        match reference_at(lexemes, coordinates) {
            Some((ast, next)) => {
                found.push(Reference {
                    ast: Some(ast),
                    qualified,
                    start,
                    coordinates_start: lexemes[coordinates].start,
                    end: lexemes[next - 1].end,
                });
                index = next;
            }
            None => index = coordinates.max(index + 1),
        }
    }
    found
}

/// The cell, spill or range reference that starts at lexeme `index`, and the
/// index of the lexeme after it.
fn reference_at(lexemes: &[Lexeme<'_>], index: usize) -> Option<(Ast, usize)> {
    let tok = |index: usize| lexemes.get(index).map(|lexeme| &lexeme.tok);
    let start = AreaEnd::of(tok(index)?)?;

    if tok(index + 1) == Some(&Tok::Colon) {
        // `Sheet1!A1:Sheet1!B2` names its sheet again before the end.
        let mut end_index = index + 2;
        if matches!(
            (tok(end_index), tok(end_index + 1)),
            (Some(Tok::Ident(..)), Some(Tok::Bang))
        ) {
            end_index += 2;
        }
        let end = AreaEnd::of(tok(end_index)?)?;
        let (r0, c0, r1, c1, flags) = area(start, end)?;
        return Some((Ast::Range(r0, c0, r1, c1, flags), end_index + 1));
    }

    let AreaEnd::Cell(row, col, flags) = start else {
        return None;
    };
    let cell = Ast::Cell(row, col, flags);
    if tok(index + 1) == Some(&Tok::Hash) {
        return Some((Ast::Func(Func::AnchorArray, (vec![cell]).into()), index + 2));
    }
    Some((cell, index + 1))
}
