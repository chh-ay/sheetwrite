//! Reference rewrites of formula text that the store does not hold: pasted
//! and filled cells, and conditional-format rules. Each reference follows
//! the rules of formulas in the store (whole columns and rows, the
//! `XFD1048576` sheet edge, `#REF!` for a reference that leaves the sheet).
//! Only the text of a reference that changes is replaced, so the formula
//! keeps the spacing, case and parentheses that its author wrote.

use wasm_bindgen::prelude::wasm_bindgen;

use crate::calc::{
    area, lex_token, rewrite_own_sheet_axis, translate_relative_refs, write_ast, AreaEnd, Ast,
    Axis, AxisChange, Func, Tok,
};

/// Move the relative references of a copied formula by the distance from
/// its source cell to its target cell. Absolute parts stay; a reference
/// moved off the sheet becomes `#REF!`.
#[wasm_bindgen(js_name = translateFormula)]
pub fn translate_formula(source: &str, row_delta: i32, col_delta: i32) -> String {
    rewrite_references(source, |reference, _| {
        translate_relative_refs(reference, i64::from(row_delta), i64::from(col_delta));
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

/// One token of the source and its byte span.
struct Lexeme<'a> {
    tok: Tok<'a>,
    start: usize,
    end: usize,
}

/// One cell or range reference in the source text.
struct Reference {
    /// The reference with its coordinates, without a sheet qualifier.
    ast: Ast,
    /// Whether a sheet name qualifies the reference.
    qualified: bool,
    /// Byte offset of the sheet qualifier, or of the coordinates without one.
    start: usize,
    /// Byte offset of the coordinates.
    coordinates_start: usize,
    end: usize,
}

/// Rewrite each reference through `rewrite` and replace the text of the
/// ones that change. A source that does not lex is not a formula the engine
/// accepts, so it is returned unchanged.
fn rewrite_references(source: &str, mut rewrite: impl FnMut(&mut Ast, bool)) -> String {
    let Some(lexemes) = lex(source) else {
        return source.to_string();
    };

    let mut out = String::with_capacity(source.len());
    let mut copied = 0;
    for reference in references(&lexemes) {
        let mut rewritten = reference.ast.clone();
        rewrite(&mut rewritten, reference.qualified);
        if rewritten == reference.ast {
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

fn is_deleted(reference: &Ast) -> bool {
    match reference {
        Ast::InvalidRef => true,
        Ast::Func(Func::AnchorArray, anchor) => matches!(anchor.as_slice(), [Ast::InvalidRef]),
        _ => false,
    }
}

fn lex(source: &str) -> Option<Vec<Lexeme<'_>>> {
    let mut lexemes: Vec<Lexeme<'_>> = Vec::new();
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
/// `First:Last!`) a sheet qualifier of the reference after it.
fn references(lexemes: &[Lexeme<'_>]) -> Vec<Reference> {
    let tok = |index: usize| lexemes.get(index).map(|lexeme| &lexeme.tok);
    let mut found = Vec::new();
    let mut index = 0;
    while index < lexemes.len() {
        let start = lexemes[index].start;
        let (coordinates, qualified) = match (tok(index), tok(index + 1)) {
            (Some(Tok::Ident(..)), Some(Tok::Structured(_) | Tok::LParen)) => {
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
                    ast,
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
        return Some((Ast::Func(Func::AnchorArray, vec![cell]), index + 2));
    }
    Some((cell, index + 1))
}
