//! Rewriting references when rows or columns are inserted, removed or moved.

use super::*;

#[derive(Clone, Copy)]
pub(crate) enum Axis {
    Row,
    Col,
}

impl Axis {
    /// The rows or columns of a sheet.
    pub(super) const fn len(self) -> u32 {
        match self {
            Self::Row => SHEET_ROWS,
            Self::Col => SHEET_COLS,
        }
    }

    const fn pick<'a>(self, row: &'a mut u32, col: &'a mut u32) -> &'a mut u32 {
        match self {
            Self::Row => row,
            Self::Col => col,
        }
    }
}

/// What a row or column edit did to one reference.
#[derive(PartialEq)]
enum Moved {
    Unchanged,
    Changed,
    Deleted,
}

/// What a row or column edit does to the indices of its axis.
#[derive(Clone, Copy)]
pub(crate) enum AxisChange {
    /// `delta` rows or columns inserted (positive) or deleted (negative) at `at`.
    Shift { at: u32, delta: i64 },
    /// `count` rows or columns moved from `from`. `to` is the first index of
    /// the moved block after the move.
    Move { from: u32, count: u32, to: u32 },
}

/// One axis change on `edited_sheet`, applied to a formula on `formula_sheet`.
#[derive(Clone, Copy)]
struct AxisEdit {
    axis: Axis,
    change: AxisChange,
    formula_sheet: u32,
    edited_sheet: u32,
}

impl AxisEdit {
    /// A cell pushed past the last row or column is deleted, as in Excel.
    fn move_index(self, coord: &mut u32) -> Moved {
        let target = match self.change {
            AxisChange::Shift { at, delta } => shift_index(*coord, at, delta),
            AxisChange::Move { from, count, to } => Some(moved_index(*coord, from, count, to)),
        };
        match target.filter(|&index| index < self.axis.len()) {
            Some(shifted) if shifted == *coord => Moved::Unchanged,
            Some(shifted) => {
                *coord = shifted;
                Moved::Changed
            }
            None => Moved::Deleted,
        }
    }

    /// A whole column or row keeps spanning its axis. Another range whose
    /// end is pushed past the sheet edge stops at the last row or column.
    fn move_span(self, start: &mut u32, end: &mut u32) -> Moved {
        let last = self.axis.len() - 1;
        if *start == 0 && *end == last {
            return Moved::Unchanged;
        }

        let span = match self.change {
            AxisChange::Shift { at, delta } => shift_range(*start, *end, at, delta),
            AxisChange::Move { from, count, to } => moved_span(*start, *end, from, count, to),
        };
        match span {
            Some((shifted_start, unclamped_end)) if shifted_start <= last => {
                let shifted_end = unclamped_end.min(last);
                if (shifted_start, shifted_end) == (*start, *end) {
                    return Moved::Unchanged;
                }
                *start = shifted_start;
                *end = shifted_end;
                Moved::Changed
            }
            _ => Moved::Deleted,
        }
    }
}

/// Rewrite row references affected by an edit on `edited_sheet`. Returns
/// whether any reference changed.
pub(crate) fn shift_rows(
    ast: &mut Ast,
    at: u32,
    delta: i64,
    formula_sheet: u32,
    edited_sheet: u32,
) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis: Axis::Row,
            change: AxisChange::Shift { at, delta },
            formula_sheet,
            edited_sheet,
        },
    )
}

/// Rewrite column references affected by an edit on `edited_sheet`. Returns
/// whether any reference changed.
pub(crate) fn shift_cols(
    ast: &mut Ast,
    at: u32,
    delta: i64,
    formula_sheet: u32,
    edited_sheet: u32,
) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis: Axis::Col,
            change: AxisChange::Shift { at, delta },
            formula_sheet,
            edited_sheet,
        },
    )
}

/// Rewrite the references of a formula on the sheet that `change` edits.
/// The formula's sheet and the edited sheet both count as handle 0, so pass
/// a tree whose references name no sheet. Returns whether any reference
/// changed.
pub(crate) fn rewrite_own_sheet_axis(ast: &mut Ast, axis: Axis, change: AxisChange) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis,
            change,
            formula_sheet: 0,
            edited_sheet: 0,
        },
    )
}

/// Follow `count` rows or columns of `edited_sheet` moved from `from` to
/// `to`, in a formula on `formula_sheet`: references to moved cells and to
/// the cells the block passes over follow those cells. A defined name's
/// formula has no sheet: pass `u32::MAX`, so only the references that name
/// `edited_sheet` move. Returns whether any reference changed.
pub(crate) fn move_refs(
    ast: &mut Ast,
    edited_sheet: u32,
    formula_sheet: u32,
    columns: bool,
    (from, count, to): (u32, u32, u32),
) -> bool {
    rewrite_axis(
        ast,
        AxisEdit {
            axis: if columns { Axis::Col } else { Axis::Row },
            change: AxisChange::Move { from, count, to },
            formula_sheet,
            edited_sheet,
        },
    )
}

fn rewrite_axis(ast: &mut Ast, edit: AxisEdit) -> bool {
    let on_edited_sheet = edit.formula_sheet == edit.edited_sheet;
    let moved = match ast {
        Ast::Cell(row, col, _) if on_edited_sheet => edit.move_index(edit.axis.pick(row, col)),
        Ast::AbsCell(sheet, row, col, _) if sheet.handle == edit.edited_sheet => {
            edit.move_index(edit.axis.pick(row, col))
        }
        Ast::Range(r0, c0, r1, c1, _) if on_edited_sheet => {
            edit.move_span(edit.axis.pick(r0, c0), edit.axis.pick(r1, c1))
        }
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) if sheet.handle == edit.edited_sheet => {
            edit.move_span(edit.axis.pick(r0, c0), edit.axis.pick(r1, c1))
        }
        Ast::Structured(reference) if reference.sheet == edit.edited_sheet => match edit.axis {
            Axis::Row => edit.move_span(&mut reference.row_start, &mut reference.row_end),
            Axis::Col => edit.move_index(&mut reference.col),
        },
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::Range(..)
        | Ast::SheetRange(..)
        | Ast::AbsRange(..)
        | Ast::SheetSpan(_)
        | Ast::InvalidRef
        | Ast::Func(..)
        | Ast::UnknownFunc(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(..)
        | Ast::Pos(..)
        | Ast::Percent(..)
        | Ast::LetSlot { .. }
        | Ast::LetName { .. }
        | Ast::Array { .. } => {
            return ast.fold_children_mut(&mut |child| rewrite_axis(child, edit))
        }
        #[cfg(feature = "analysis")]
        Ast::Parameter { .. } | Ast::Lambda(_) | Ast::RegexPattern(_) => {
            return ast.fold_children_mut(&mut |child| rewrite_axis(child, edit))
        }
    };

    if moved == Moved::Deleted {
        *ast = Ast::InvalidRef;
    }
    moved != Moved::Unchanged
}

/// Shift one coordinate. `None` when the deletion removes it; the caller
/// then writes `#REF!`.
fn shift_index(index: u32, at: u32, delta: i64) -> Option<u32> {
    if index < at {
        return Some(index);
    }
    if delta < 0 && index < at.saturating_add((-delta) as u32) {
        return None;
    }
    Some(clamp_index(i64::from(index) + delta))
}

/// Where `index` is after `count` indices move from `from` to `to`; `to` is
/// the first index of the moved block after the move. A moved cell takes its
/// references along, so a reference to one cell follows it.
pub(crate) fn moved_index(index: u32, from: u32, count: u32, to: u32) -> u32 {
    let block_end = from.saturating_add(count);
    if (from..block_end).contains(&index) {
        return to + (index - from);
    }

    let without_block = if index < from { index } else { index - count };
    if without_block >= to {
        without_block + count
    } else {
        without_block
    }
}

/// The inclusive span `start..=end` after `count` indices move from `from`
/// to `to`, as Excel's Insert Cut Cells changes a range. A span inside the
/// moved block moves with it. Any other span changes as if the block were
/// deleted where it was and inserted where it lands: it loses the moved
/// indices it held, a cut corner included, and grows by the block when the
/// block lands after its first index and at or before its last.
pub(crate) fn moved_span(
    start: u32,
    end: u32,
    from: u32,
    count: u32,
    to: u32,
) -> Option<(u32, u32)> {
    if from <= start && end < from.saturating_add(count) {
        return Some((
            moved_index(start, from, count, to),
            moved_index(end, from, count, to),
        ));
    }

    let (closed_start, closed_end) = shift_range(start, end, from, -i64::from(count))?;
    shift_range(closed_start, closed_end, to, i64::from(count))
}

/// Shift or contract an inclusive range; deleting every target invalidates it.
pub(crate) fn shift_range(start: u32, end: u32, at: u32, delta: i64) -> Option<(u32, u32)> {
    if delta >= 0 {
        let shifted_start = if start >= at {
            clamp_index(i64::from(start) + delta)
        } else {
            start
        };
        let shifted_end = if end >= at {
            clamp_index(i64::from(end) + delta)
        } else {
            end
        };
        return Some((shifted_start, shifted_end));
    }

    let count = (-delta) as u32;
    let deleted_end = at.saturating_add(count);
    if end < at {
        return Some((start, end));
    }
    if start >= deleted_end {
        return Some((start - count, end - count));
    }

    match (start < at, end >= deleted_end) {
        (true, true) => Some((start, end - count)),
        (true, false) => Some((start, at.saturating_sub(1))),
        (false, true) => Some((at, end - count)),
        (false, false) => None,
    }
}

fn clamp_index(shifted: i64) -> u32 {
    if shifted <= 0 {
        0
    } else if shifted >= i64::from(u32::MAX) {
        u32::MAX
    } else {
        shifted as u32
    }
}
