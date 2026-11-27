//! Moving relative references when a formula is copied or filled.

use super::*;

/// Move the relative parts of the A1 references in `ast` by `row_delta` rows
/// and `col_delta` columns, as a copy of the formula does. Absolute row and
/// column markers stay fixed. A reference moved off the sheet becomes
/// `#REF!`.
///
/// Copied and filled formula text is moved here one reference at a time.
/// Conditional-format expressions store one parsed tree at the rule range's
/// top-left. A window read evaluates it in place with a reference shift; it
/// translates a copy here only at a cell where [`relative_reach`] says the
/// shift could not keep every reference in the sheet.
pub(crate) fn translate_relative_refs(ast: &mut Ast, row_delta: i64, col_delta: i64) {
    if !translate_relative_refs_inner(ast, row_delta, col_delta, false) {
        *ast = Ast::InvalidRef;
    }
}

/// One past the largest row and column that a relative axis of a reference
/// in `ast` names, or 0 for an axis no reference leaves relative. Moving the
/// references by a shift keeps them in the sheet, exactly as
/// [`translate_relative_refs`] would, while `shift + reach` stays within the
/// sheet's rows and columns. A defined name reports a reach past the sheet,
/// so a conditional-format rule that uses one reads a translated copy.
pub(crate) fn relative_reach(ast: &Ast) -> (u32, u32) {
    let mut reach = (0, 0);
    add_relative_reach(ast, 0, &mut reach);
    reach
}

/// Raise `reach` to cover the references in `ast`; see [`relative_reach`].
fn add_relative_reach(ast: &Ast, depth: usize, reach: &mut (u32, u32)) {
    const PAST_SHEET: (u32, u32) = (SHEET_ROWS + 1, SHEET_COLS + 1);
    if depth > FORMULA_RECURSION_LIMIT {
        *reach = PAST_SHEET;
        return;
    }
    match ast {
        Ast::Cell(row, col, flags) | Ast::AbsCell(_, row, col, flags) => {
            add_end_reach(reach, (*row, *col), *flags);
        }
        Ast::SheetCell(reference) => {
            add_end_reach(reach, (reference.row, reference.col), reference.flags);
        }
        Ast::Range(r0, c0, r1, c1, flags) | Ast::AbsRange(_, r0, c0, r1, c1, flags) => {
            add_end_reach(reach, (*r0, *c0), flags.start);
            add_end_reach(reach, (*r1, *c1), flags.end);
        }
        Ast::SheetRange(reference) => {
            let (start, end) = (reference.flags.start, reference.flags.end);
            add_end_reach(reach, (reference.row_start, reference.col_start), start);
            add_end_reach(reach, (reference.row_end, reference.col_end), end);
        }
        Ast::SheetSpan(span) => {
            add_end_reach(reach, (span.row_start, span.col_start), span.flags.start);
            add_end_reach(reach, (span.row_end, span.col_end), span.flags.end);
        }
        // A conditional-format rule that uses a defined name takes the
        // translated copy, which reads the name for the rule's cell.
        Ast::DefinedName(..) => *reach = PAST_SHEET,
        // These hold no reference of their own; `any_child` visits the
        // children of those that have some.
        Ast::Func(..)
        | Ast::UnknownFunc(_)
        | Ast::LetSlot { .. }
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(..)
        | Ast::Pos(..)
        | Ast::Percent(..)
        | Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::LetName { .. }
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::InvalidRef
        | Ast::Array(_) => add_children_reach(ast, depth, reach),
        #[cfg(feature = "analysis")]
        Ast::Lambda(_) | Ast::Parameter { .. } | Ast::RegexPattern(_) => {
            add_children_reach(ast, depth, reach);
        }
    }
}

/// Raise `reach` to cover one reference end at (`row`, `col`).
fn add_end_reach(reach: &mut (u32, u32), (row, col): (u32, u32), flags: RefFlags) {
    if !flags.row_abs() {
        reach.0 = reach.0.max(row + 1);
    }
    if !flags.col_abs() {
        reach.1 = reach.1.max(col + 1);
    }
}

fn add_children_reach(ast: &Ast, depth: usize, reach: &mut (u32, u32)) {
    ast.any_child(&mut |child| {
        add_relative_reach(child, depth + 1, reach);
        false
    });
}

/// Move the relative references of a defined name's formula from cell A1,
/// which they are written relative to, to the cell (`row`, `col`) whose
/// formula uses the name. As in Excel, a reference that passes the last row
/// or column wraps around to the first, so a name can refer to cells above
/// or left of the cell that uses it.
pub(crate) fn translate_name_refs(ast: &mut Ast, row: u32, col: u32) {
    translate_relative_refs_inner(ast, i64::from(row), i64::from(col), true);
}

/// A coordinate moved by `delta` unless it is absolute. Past the sheet it is
/// `None`, or with `wrap` the coordinate it reaches from the other edge.
fn translated_coordinate(
    value: u32,
    delta: i64,
    absolute: bool,
    axis: Axis,
    wrap: bool,
) -> Option<u32> {
    if absolute {
        return Some(value);
    }
    let shifted = i64::from(value).checked_add(delta)?;
    let translated = if wrap {
        shifted.rem_euclid(i64::from(axis.len()))
    } else {
        shifted
    };
    u32::try_from(translated)
        .ok()
        .filter(|&index| index < axis.len())
}

/// Put one axis of a range back in order after a wrapping translation moved
/// one edge past the other; each edge keeps its `$` marker.
const fn order_wrapped_edges(start: &mut u32, end: &mut u32, flags: &mut RangeFlags, row: bool) {
    if *start > *end {
        std::mem::swap(start, end);
        let axis_mask = if row { 1 } else { 2 };
        let difference = (flags.start.0 ^ flags.end.0) & axis_mask;
        flags.start.0 ^= difference;
        flags.end.0 ^= difference;
    }
}

fn translate_relative_refs_inner(
    ast: &mut Ast,
    row_delta: i64,
    col_delta: i64,
    wrap: bool,
) -> bool {
    let row = |value, absolute| translated_coordinate(value, row_delta, absolute, Axis::Row, wrap);
    let col = |value, absolute| translated_coordinate(value, col_delta, absolute, Axis::Col, wrap);
    // A child that leaves the sheet becomes `#REF!`; its parent stays.
    let mut translate_child = |child: &mut Ast| {
        if !translate_relative_refs_inner(child, row_delta, col_delta, wrap) {
            *child = Ast::InvalidRef;
        }
        false
    };
    match ast {
        Ast::Cell(r, c, flags) | Ast::AbsCell(_, r, c, flags) => {
            let (Some(next_row), Some(next_col)) =
                (row(*r, flags.row_abs()), col(*c, flags.col_abs()))
            else {
                return false;
            };
            *r = next_row;
            *c = next_col;
            true
        }
        Ast::SheetCell(reference) => {
            let DetachedCellRef {
                sheet: _,
                row: r,
                col: c,
                flags,
            } = &mut **reference;

            let (Some(next_row), Some(next_col)) =
                (row(*r, flags.row_abs()), col(*c, flags.col_abs()))
            else {
                return false;
            };
            *r = next_row;
            *c = next_col;
            true
        }
        Ast::Range(r0, c0, r1, c1, flags) | Ast::AbsRange(_, r0, c0, r1, c1, flags) => {
            let (Some(next_r0), Some(next_c0), Some(next_r1), Some(next_c1)) = (
                row(*r0, flags.start.row_abs()),
                col(*c0, flags.start.col_abs()),
                row(*r1, flags.end.row_abs()),
                col(*c1, flags.end.col_abs()),
            ) else {
                return false;
            };
            (*r0, *c0, *r1, *c1) = (next_r0, next_c0, next_r1, next_c1);
            if wrap {
                order_wrapped_edges(r0, r1, flags, true);
                order_wrapped_edges(c0, c1, flags, false);
            }
            true
        }
        Ast::SheetRange(reference) => {
            let DetachedRangeRef {
                sheet: _,
                row_start: r0,
                col_start: c0,
                row_end: r1,
                col_end: c1,
                flags,
            } = &mut **reference;

            let (Some(next_r0), Some(next_c0), Some(next_r1), Some(next_c1)) = (
                row(*r0, flags.start.row_abs()),
                col(*c0, flags.start.col_abs()),
                row(*r1, flags.end.row_abs()),
                col(*c1, flags.end.col_abs()),
            ) else {
                return false;
            };
            (*r0, *c0, *r1, *c1) = (next_r0, next_c0, next_r1, next_c1);
            if wrap {
                order_wrapped_edges(r0, r1, flags, true);
                order_wrapped_edges(c0, c1, flags, false);
            }
            true
        }
        Ast::SheetSpan(span) => {
            let (Some(row_start), Some(col_start), Some(row_end), Some(col_end)) = (
                row(span.row_start, span.flags.start.row_abs()),
                col(span.col_start, span.flags.start.col_abs()),
                row(span.row_end, span.flags.end.row_abs()),
                col(span.col_end, span.flags.end.col_abs()),
            ) else {
                return false;
            };
            (span.row_start, span.col_start) = (row_start, col_start);
            (span.row_end, span.col_end) = (row_end, col_end);
            if wrap {
                order_wrapped_edges(
                    &mut span.row_start,
                    &mut span.row_end,
                    &mut span.flags,
                    true,
                );
                order_wrapped_edges(
                    &mut span.col_start,
                    &mut span.col_end,
                    &mut span.flags,
                    false,
                );
            }
            true
        }
        Ast::LetSlot { expression, .. } => {
            translate_relative_refs_inner(expression, row_delta, col_delta, wrap)
        }
        Ast::Func(..)
        | Ast::UnknownFunc(_)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(..)
        | Ast::Pos(..)
        | Ast::Percent(..) => {
            ast.fold_children_mut(&mut translate_child);
            true
        }
        // A defined name's formula is moved to the cell that uses it when the
        // name is read (`translate_name_refs`).
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::LetName { .. }
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::InvalidRef
        | Ast::Array(_) => true,
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::RegexPattern(_) => true,
        #[cfg(feature = "analysis")]
        Ast::Lambda(_) => {
            ast.fold_children_mut(&mut translate_child);
            true
        }
    }
}
