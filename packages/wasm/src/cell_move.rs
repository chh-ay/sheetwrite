//! Excel's Cut and Paste: a block of cells moves to another place on its
//! sheet or on another sheet
//! (<https://support.microsoft.com/en-us/office/move-or-copy-cells-and-cell-contents-803d65eb-6a3e-4534-8c6f-ff12d1c4139e>).
//! References follow the cells, in every formula and defined name of the
//! workbook: a reference to a moved cell, or a range inside the block, names
//! the cell's new place; a reference to a cell the block lands on becomes
//! `#REF!`. A range the block covers only in part changes only when the block
//! holds a whole edge of it and moves along it: that edge follows the cells,
//! so `=SUM(A1:A10)` becomes `=SUM(A1:A15)` when A10 moves to A15
//! (<https://chandoo.org/forum/threads/cut-and-paste-weirdness.2548/>). A
//! formula inside the block keeps pointing at the same cells.
//!
//! A move with `shift` is Excel's Insert or Delete with Shift cells instead
//! (<https://support.microsoft.com/en-us/office/insert-or-delete-cells-rows-and-columns-6f40e6e4-85af-45e0-b39d-65dd504a3246>):
//! the block holds every used cell from the inserted or deleted cells to the
//! sheet's edge in their columns (rows, for a move along a row), and
//! references follow the rule of inserted and deleted rows inside those
//! columns (see [`CellMove::shift_fate`]).

use rustc_hash::FxHashMap;

use wasm_bindgen::prelude::*;

use crate::calc::{
    sheet_name_needs_quotes, shift_range, Ast, RangeFlags, SheetRef, SHEET_COLS, SHEET_ROWS,
};
use crate::graph::DirtyRect;
use crate::permute::PERMUTE_PARTIAL_SPILL;
use crate::store::{CellStore, BLOCK_INVALID, BLOCK_OK, BLOCK_RESOURCE_LIMIT};
use crate::types::{cell_key, FormulaEntry, KIND_EMPTY, KIND_FORMULA};

/// One corner of a block: its sheet and its top-left cell.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct BlockAt {
    pub(crate) sheet: u32,
    pub(crate) row: u32,
    pub(crate) col: u32,
}

/// A block of `rows` by `cols` cells that moves from `from` to `to`.
#[derive(Clone, Copy, Debug)]
pub(crate) struct CellMove {
    pub(crate) from: BlockAt,
    pub(crate) to: BlockAt,
    pub(crate) rows: u32,
    pub(crate) cols: u32,
    /// Whether a reference to the source sheet's name needs quotes.
    from_quoted: bool,
    /// Whether a reference to the target sheet's name needs quotes.
    to_quoted: bool,
    /// Excel's Insert or Delete with Shift cells: on one sheet, along one
    /// axis, with references moved by [`CellMove::shift_fate`] instead of
    /// the rule of Cut and Paste.
    shift: bool,
}

/// Where a referenced cell or range is after a move.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Fate {
    Kept,
    /// Sheet, first row, first column, last row, last column.
    Moved(u32, u32, u32, u32, u32),
    Lost,
}

impl CellMove {
    /// A move of the block at `row`, `col` to `to_row`, `to_col` on the sheet
    /// that a formula's unqualified references name; `shift` as in
    /// [`CellMove::shift`].
    pub(crate) const fn on_own_sheet(
        (row, col): (u32, u32),
        (rows, cols): (u32, u32),
        (to_row, to_col): (u32, u32),
        shift: bool,
    ) -> Self {
        Self {
            from: BlockAt { sheet: 0, row, col },
            to: BlockAt {
                sheet: 0,
                row: to_row,
                col: to_col,
            },
            rows,
            cols,
            from_quoted: false,
            to_quoted: false,
            shift,
        }
    }

    /// The move that puts the block back.
    pub(crate) const fn reversed(&self) -> Self {
        Self {
            from: self.to,
            to: self.from,
            rows: self.rows,
            cols: self.cols,
            from_quoted: self.to_quoted,
            to_quoted: self.from_quoted,
            shift: self.shift,
        }
    }

    /// Whether the block at `at` holds the cell.
    const fn holds(&self, at: BlockAt, sheet: u32, row: u32, col: u32) -> bool {
        sheet == at.sheet
            && row >= at.row
            && row - at.row < self.rows
            && col >= at.col
            && col - at.col < self.cols
    }

    /// Whether the cell is in the source block or the target block, or, for
    /// a shift, in the cells a deletion closes between them.
    pub(crate) fn touches(&self, sheet: u32, row: u32, col: u32) -> bool {
        if self.shift {
            let (from, to) = (self.from, self.to);
            return sheet == from.sheet
                && (from.row.min(to.row)..from.row.max(to.row) + self.rows).contains(&row)
                && (from.col.min(to.col)..from.col.max(to.col) + self.cols).contains(&col);
        }
        self.holds(self.from, sheet, row, col) || self.holds(self.to, sheet, row, col)
    }

    /// Where a range is after the move, when it moves: sheet, first row,
    /// first column, last row, last column. A range the move would make
    /// `#REF!` stays where it is.
    pub(crate) fn moved_range(
        &self,
        sheet: u32,
        start: (u32, u32),
        end: (u32, u32),
    ) -> Option<[u32; 5]> {
        match self.fate(sheet, start, end) {
            Fate::Moved(to_sheet, r0, c0, r1, c1) => Some([to_sheet, r0, c0, r1, c1]),
            Fate::Kept | Fate::Lost => None,
        }
    }

    const fn quoted(&self, sheet: u32) -> bool {
        if sheet == self.to.sheet {
            self.to_quoted
        } else {
            self.from_quoted
        }
    }

    /// The fate of the range `r0..=r1` by `c0..=c1` on `sheet`; a cell is a
    /// range of one.
    fn fate(&self, sheet: u32, (r0, c0): (u32, u32), (r1, c1): (u32, u32)) -> Fate {
        if self.shift {
            return self.shift_fate(sheet, (r0, c0), (r1, c1));
        }
        let (from, to) = (self.from, self.to);
        if self.holds(from, sheet, r0, c0) && self.holds(from, sheet, r1, c1) {
            return Fate::Moved(
                to.sheet,
                r0 - from.row + to.row,
                c0 - from.col + to.col,
                r1 - from.row + to.row,
                c1 - from.col + to.col,
            );
        }
        if self.holds(to, sheet, r0, c0) && self.holds(to, sheet, r1, c1) {
            return Fate::Lost;
        }
        if sheet != from.sheet || to.sheet != from.sheet {
            return Fate::Kept;
        }
        self.edge_fate((r0, c0), (r1, c1))
    }

    /// A move along one axis that holds a whole edge of the range moves that
    /// edge with the cells, unless the range spans its sheet on that axis or
    /// would turn inside out.
    fn edge_fate(&self, (r0, c0): (u32, u32), (r1, c1): (u32, u32)) -> Fate {
        let (from, to) = (self.from, self.to);
        let along_rows = from.col == to.col
            && from.col <= c0
            && c1 < from.col + self.cols
            && !(r0 == 0 && r1 >= SHEET_ROWS - 1);
        let along_cols = from.row == to.row
            && from.row <= r0
            && r1 < from.row + self.rows
            && !(c0 == 0 && c1 >= SHEET_COLS - 1);
        let moved_edge = if along_rows {
            moved_edge((r0, r1), (from.row, self.rows, to.row))
        } else if along_cols {
            moved_edge((c0, c1), (from.col, self.cols, to.col))
        } else {
            None
        };
        match moved_edge {
            Some((start, end)) if along_rows => Fate::Moved(from.sheet, start, c0, end, c1),
            Some((start, end)) => Fate::Moved(from.sheet, r0, start, r1, end),
            None => Fate::Kept,
        }
    }

    /// Excel's Insert or Delete with Shift cells, as inserted or deleted rows
    /// change references, but only inside the block's columns (rows, for a
    /// move along a row). Inserting moves every cell from the block's first
    /// row down by the offset; deleting removes the cells between where the
    /// block lands and where it starts, and moves the cells below them up. A
    /// reference to a deleted cell, or one pushed past the sheet's edge, is
    /// lost; a range inside the columns grows or shrinks; a range that also
    /// covers a column beside them, or spans the whole sheet, keeps its place.
    fn shift_fate(&self, sheet: u32, (r0, c0): (u32, u32), (r1, c1): (u32, u32)) -> Fate {
        let (from, to) = (self.from, self.to);
        let down = from.col == to.col;
        // The span along the move, the span across it, the block's span across it.
        let ((start, end), (cross_start, cross_end), (first, count)) = if down {
            ((r0, r1), (c0, c1), (from.col, self.cols))
        } else {
            ((c0, c1), (r0, r1), (from.row, self.rows))
        };
        let (block_start, landing, last) = if down {
            (from.row, to.row, SHEET_ROWS - 1)
        } else {
            (from.col, to.col, SHEET_COLS - 1)
        };
        let outside = cross_start < first || cross_end >= first + count;
        if sheet != from.sheet || outside || (start == 0 && end >= last) {
            return Fate::Kept;
        }
        // Inserting at the block's start, or deleting from where it lands.
        let (at, delta) = if landing >= block_start {
            (block_start, i64::from(landing - block_start))
        } else {
            (landing, -i64::from(block_start - landing))
        };
        let Some((moved_start, moved_end)) =
            shift_range(start, end, at, delta).filter(|&(moved_start, _)| moved_start <= last)
        else {
            return Fate::Lost;
        };
        let clamped_end = moved_end.min(last);
        if (moved_start, clamped_end) == (start, end) {
            Fate::Kept
        } else if down {
            Fate::Moved(sheet, moved_start, c0, clamped_end, c1)
        } else {
            Fate::Moved(sheet, r0, moved_start, r1, clamped_end)
        }
    }
}

/// The span `start..=end` after the `count` indices from `from` move to
/// `to`, when the block holds exactly one end of it.
fn moved_edge((start, end): (u32, u32), (from, count, to): (u32, u32, u32)) -> Option<(u32, u32)> {
    let holds = |index: u32| index >= from && index - from < count;
    let shifted = |index: u32| index - from + to;
    let span = match (holds(start), holds(end)) {
        (false, true) => (start, shifted(end)),
        (true, false) => (shifted(start), end),
        (true, true) | (false, false) => return None,
    };
    (span.0 <= span.1).then_some(span)
}

/// A visit of one cell or range reference; returns whether it changed it.
type RefVisit<'a> = dyn FnMut(&mut Ast) -> bool + 'a;

/// Whether the formula cell at `[sheet, row, col]` stays out of a losses walk.
type CellFilter<'a> = dyn Fn(u32, u32, u32) -> bool + 'a;

/// A change of a formula's tree on its sheet and its inverse; returns whether
/// the change touched the tree.
type RoundTrip<'a> = dyn Fn(&mut Ast, u32) -> bool + 'a;

/// Run `visit` on every cell and range reference of `ast`, and return whether
/// any visit changed one. Every other node kind is walked through its
/// children; one walk serves the moves of references and their rewrite for
/// another sheet.
fn rewrite_cell_refs(ast: &mut Ast, visit: &mut RefVisit<'_>) -> bool {
    if matches!(
        ast,
        Ast::Cell(..) | Ast::AbsCell(..) | Ast::Range(..) | Ast::AbsRange(..)
    ) {
        return visit(ast);
    }
    ast.fold_children_mut(&mut |child| rewrite_cell_refs(child, visit))
}

/// Follow `edit` in the references of a formula on `formula_sheet`. A defined
/// name's formula has no sheet: pass `u32::MAX`, so only references that name
/// a sheet move. Returns whether any reference changed.
#[inline(never)]
pub(crate) fn move_cell_refs(ast: &mut Ast, formula_sheet: u32, edit: &CellMove) -> bool {
    rewrite_cell_refs(ast, &mut |node| move_ref(node, formula_sheet, edit))
}

/// Follow `edit` in one cell or range reference.
#[inline(never)]
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "rewrite_cell_refs passes only cell and range references"
)]
fn move_ref(node: &mut Ast, formula_sheet: u32, edit: &CellMove) -> bool {
    let (sheet, start, end) = match &*node {
        Ast::Cell(row, col, _) => (formula_sheet, (*row, *col), (*row, *col)),
        Ast::AbsCell(sheet, row, col, _) => (sheet.handle, (*row, *col), (*row, *col)),
        Ast::Range(r0, c0, r1, c1, _) => (formula_sheet, (*r0, *c0), (*r1, *c1)),
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) => (sheet.handle, (*r0, *c0), (*r1, *c1)),
        _ => return false,
    };
    let (to_sheet, r0, c0, r1, c1) = match edit.fate(sheet, start, end) {
        Fate::Kept => return false,
        Fate::Lost => {
            *node = Ast::InvalidRef;
            return true;
        }
        Fate::Moved(to_sheet, r0, c0, r1, c1) => (to_sheet, r0, c0, r1, c1),
    };
    let named = to_sheet != formula_sheet;
    let quoted = edit.quoted(to_sheet);
    let placed = match &*node {
        Ast::Cell(_, _, flags) if !named => Ast::Cell(r0, c0, *flags),
        Ast::Cell(_, _, flags) | Ast::AbsCell(_, _, _, flags) => Ast::AbsCell(
            SheetRef { handle: to_sheet },
            r0,
            c0,
            flags.with_quoted(quoted),
        ),
        Ast::Range(.., range) if !named => Ast::Range(r0, c0, r1, c1, *range),
        Ast::Range(.., range) | Ast::AbsRange(.., range) => Ast::AbsRange(
            SheetRef { handle: to_sheet },
            r0,
            c0,
            r1,
            c1,
            RangeFlags {
                start: range.start.with_quoted(quoted),
                end: range.end,
            },
        ),
        _ => return false,
    };
    *node = placed;
    true
}

/// Write the references of a formula that moves from `edit.from.sheet` to
/// `edit.to.sheet` as that sheet reads them: a reference without a sheet
/// name gains the source sheet's name, and one to the target sheet drops it.
pub(crate) fn rehome_refs(ast: &mut Ast, edit: &CellMove) -> bool {
    rewrite_cell_refs(ast, &mut |node| rehome_ref(node, edit))
}

/// Rewrite one cell or range reference for [`rehome_refs`].
#[inline(never)]
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "rewrite_cell_refs passes only cell and range references"
)]
fn rehome_ref(node: &mut Ast, edit: &CellMove) -> bool {
    let source = SheetRef {
        handle: edit.from.sheet,
    };
    let placed = match &*node {
        Ast::Cell(row, col, flags) => {
            Ast::AbsCell(source, *row, *col, flags.with_quoted(edit.from_quoted))
        }
        Ast::AbsCell(sheet, row, col, flags) if sheet.handle == edit.to.sheet => {
            Ast::Cell(*row, *col, flags.with_quoted(false))
        }
        Ast::Range(r0, c0, r1, c1, flags) => Ast::AbsRange(
            source,
            *r0,
            *c0,
            *r1,
            *c1,
            RangeFlags {
                start: flags.start.with_quoted(edit.from_quoted),
                end: flags.end,
            },
        ),
        Ast::AbsRange(sheet, r0, c0, r1, c1, flags) if sheet.handle == edit.to.sheet => Ast::Range(
            *r0,
            *c0,
            *r1,
            *c1,
            RangeFlags {
                start: flags.start.with_quoted(false),
                end: flags.end,
            },
        ),
        _ => return false,
    };
    *node = placed;
    true
}

/// The storage of the moved cells, row by row: kind, payload and style.
type MovedSlots = Vec<(u8, u64, u32)>;

/// The entries of moved formula and reference cells, keyed by target cell.
type MovedSources = FxHashMap<(u32, u32), FormulaEntry>;

#[wasm_bindgen]
impl CellStore {
    /// Move the `rows` by `cols` block whose top-left cell is `row`, `col` of
    /// `sheet` so that it lands at `to_row`, `to_col` of `to_sheet`, as
    /// Excel's Cut and Paste does. The block keeps its values, styles and
    /// formulas, the cells it lands on are replaced, the cells it leaves are
    /// emptied, and references follow the cells (see the module docs).
    /// With `shift`, the move is Excel's Insert or Delete with Shift cells
    /// along one axis of one sheet: references follow that rule instead, and
    /// a deletion also empties the cells between where the block lands and
    /// where it starts.
    /// Status: `0` success, `1` invalid block, `3` dirty-capacity rejection,
    /// `4` a block that holds cells of a spill range without its formula.
    #[wasm_bindgen(js_name = moveCells)]
    #[allow(
        clippy::too_many_arguments,
        reason = "a WebAssembly export: JavaScript passes the block as numbers, without building an object per call"
    )]
    pub fn move_cells(
        &mut self,
        sheet: usize,
        row: usize,
        col: usize,
        rows: usize,
        cols: usize,
        to_sheet: usize,
        to_row: usize,
        to_col: usize,
        shift: bool,
    ) -> u32 {
        let Some(edit) = self.cell_move(
            [sheet, row, col, rows, cols, to_sheet, to_row, to_col],
            shift,
        ) else {
            return BLOCK_INVALID;
        };
        if edit.from == edit.to {
            return BLOCK_OK;
        }
        if !self.spills_inside(&edit) {
            return PERMUTE_PARTIAL_SPILL;
        }

        let revision = self.local_dirty_revision();
        if revision.is_some()
            && !(self.can_dirty(edit.from, &edit) && self.can_dirty(edit.to, &edit))
        {
            return BLOCK_RESOURCE_LIMIT;
        }

        self.move_cell_references(&edit);
        let written =
            self.move_block_cells(&edit, revision) && self.clear_shift_gap(&edit, revision);
        self.drop_invalid_references();
        self.graph.invalidate();
        if written {
            BLOCK_OK
        } else {
            BLOCK_RESOURCE_LIMIT
        }
    }

    /// Cells outside both blocks, as `[sheet, row, col]` triples, whose
    /// formula the move back cannot restore: a reference that became
    /// `#REF!`, or a range whose edge moved. Undo restores these cells, and
    /// both blocks, from a capture.
    #[wasm_bindgen(js_name = moveCellsLosses)]
    #[allow(
        clippy::too_many_arguments,
        reason = "a WebAssembly export: JavaScript passes the block as numbers, without building an object per call"
    )]
    pub fn move_cells_losses(
        &self,
        sheet: usize,
        row: usize,
        col: usize,
        rows: usize,
        cols: usize,
        to_sheet: usize,
        to_row: usize,
        to_col: usize,
        shift: bool,
    ) -> Vec<u32> {
        let Some(edit) = self.cell_move(
            [sheet, row, col, rows, cols, to_sheet, to_row, to_col],
            shift,
        ) else {
            return Vec::new();
        };
        let back = edit.reversed();
        self.formula_losses(
            &|sheet, row, col| edit.touches(sheet, row, col),
            &|ast, sheet| {
                move_cell_refs(ast, sheet, &edit) && {
                    move_cell_refs(ast, sheet, &back);
                    true
                }
            },
        )
    }
}

impl CellStore {
    /// `[sheet, row, col]` of every live formula cell, except those `skip`
    /// names, whose tree `round_trip` changes (it returns `true`) without
    /// putting it back: undo restores these cells from a capture. Shared by
    /// row, column and cell moves; it runs once per edit, so it takes trait
    /// objects to keep one copy of the walk.
    #[inline(never)]
    pub(crate) fn formula_losses(
        &self,
        skip: &CellFilter<'_>,
        round_trip: &RoundTrip<'_>,
    ) -> Vec<u32> {
        let mut losses = Vec::new();
        for (formula_sheet, data) in self.sheets.iter().enumerate() {
            if !self.sheet_alive[formula_sheet] {
                continue;
            }
            let sheet = formula_sheet as u32;
            for ((row, col), entry) in data.formulas.iter(&self.formula_slots) {
                let Some(ast) = entry.ast.as_ref().filter(|_| entry.is_formula()) else {
                    continue;
                };
                if skip(sheet, row, col) {
                    continue;
                }
                let mut moved = ast.clone();
                if round_trip(&mut moved, sheet) && moved != *ast {
                    losses.extend_from_slice(&[sheet, row, col]);
                }
            }
        }
        losses
    }

    /// The move of a block, when both blocks lie on live sheets; a shift
    /// also needs one sheet, one axis, and every cell between the blocks.
    #[inline(never)]
    fn cell_move(&self, at: [usize; 8], shift: bool) -> Option<CellMove> {
        let [sheet, row, col, rows, cols, to_sheet, to_row, to_col] = at;
        if !(self.block_fits(sheet, (row, col), (rows, cols))
            && self.block_fits(to_sheet, (to_row, to_col), (rows, cols)))
        {
            return None;
        }
        if shift {
            let one_axis = sheet == to_sheet && (row == to_row || col == to_col);
            let (top, left) = (row.min(to_row), col.min(to_col));
            let span = (row.max(to_row) - top + rows, col.max(to_col) - left + cols);
            if !(one_axis && self.block_fits(sheet, (top, left), span)) {
                return None;
            }
        }
        let quoted = |handle: usize| {
            self.sheet_names
                .get(handle)
                .is_some_and(|name| sheet_name_needs_quotes(name))
        };
        Some(CellMove {
            from: BlockAt {
                sheet: u32::try_from(sheet).ok()?,
                row: u32::try_from(row).ok()?,
                col: u32::try_from(col).ok()?,
            },
            to: BlockAt {
                sheet: u32::try_from(to_sheet).ok()?,
                row: u32::try_from(to_row).ok()?,
                col: u32::try_from(to_col).ok()?,
            },
            rows: u32::try_from(rows).ok()?,
            cols: u32::try_from(cols).ok()?,
            from_quoted: quoted(sheet),
            to_quoted: quoted(to_sheet),
            shift,
        })
    }

    /// Whether the block lies on a live sheet whose cells are all loaded
    /// over it.
    fn block_fits(
        &self,
        sheet: usize,
        (row, col): (usize, usize),
        (rows, cols): (usize, usize),
    ) -> bool {
        let Some(data) = self.sheets.get(sheet).filter(|_| self.sheet_alive[sheet]) else {
            return false;
        };
        let (sheet_rows, sheet_cols) = (data.cells.row_count(), data.cells.n_cols());
        let fits = rows > 0
            && cols > 0
            && row.checked_add(rows).is_some_and(|end| end <= sheet_rows)
            && col.checked_add(cols).is_some_and(|end| end <= sheet_cols);
        let loaded = !data.cells.is_paged()
            || (row..row + rows).all(|r| (col..col + cols).all(|c| data.cells.is_loaded(r, c)));
        fits && loaded
    }

    fn can_dirty(&self, at: BlockAt, edit: &CellMove) -> bool {
        self.sheets[at.sheet as usize].cells.can_dirty_rect(
            at.row as usize,
            at.col as usize,
            edit.rows as usize,
            edit.cols as usize,
        )
    }

    /// Excel moves a spill range with its formula: every spill range that
    /// meets the source block has its formula in the block, and spills again
    /// where the formula lands.
    fn spills_inside(&self, edit: &CellMove) -> bool {
        let from = edit.from;
        let Some(rect) = DirtyRect::new(
            from.row as usize,
            from.col as usize,
            (from.row + edit.rows - 1) as usize,
            (from.col + edit.cols - 1) as usize,
        ) else {
            return false;
        };
        let spill = &self.sheets[from.sheet as usize].spill;
        let mut inside = true;
        spill.for_each_anchor_intersecting(&[rect], |anchor| {
            inside &= edit.holds(from, from.sheet, anchor.0, anchor.1);
        });
        inside
    }

    /// A deletion that shifts cells up (or left) by more than the block it
    /// moves empties the deleted cells the block does not land on.
    fn clear_shift_gap(&mut self, edit: &CellMove, revision: Option<u64>) -> bool {
        let (from, to) = (edit.from, edit.to);
        let sheet = from.sheet as usize;
        if !edit.shift {
            return true;
        }
        if from.col == to.col {
            let start = to.row + edit.rows;
            if start >= from.row {
                return true;
            }
            let empty: MovedSlots = vec![(KIND_EMPTY, 0, 0); (from.row - start) as usize];
            return (from.col..from.col + edit.cols).all(|col| {
                let top = (start as usize, col as usize);
                self.write_moved_column(sheet, top, revision, MovedSources::default(), &empty)
            });
        }
        let start = to.col + edit.cols;
        let empty: MovedSlots = vec![(KIND_EMPTY, 0, 0); edit.rows as usize];
        (start..from.col).all(|col| {
            let top = (from.row as usize, col as usize);
            self.write_moved_column(sheet, top, revision, MovedSources::default(), &empty)
        })
    }

    /// Read every column of the source block, then empty the source block and
    /// write the target column by column through the writer that row and
    /// column moves use, so blocks that overlap move whole and the block
    /// writer is compiled once.
    fn move_block_cells(&mut self, edit: &CellMove, revision: Option<u64>) -> bool {
        let mut columns = Vec::with_capacity(edit.cols as usize);
        for col in 0..edit.cols {
            let mut slots: MovedSlots = Vec::with_capacity(edit.rows as usize);
            let mut sources = MovedSources::default();
            for row in 0..edit.rows {
                self.read_cell_to_move(edit, (row, col), &mut slots, &mut sources);
            }
            columns.push((slots, sources));
        }

        let (from, to) = (edit.from, edit.to);
        let empty: MovedSlots = vec![(KIND_EMPTY, 0, 0); edit.rows as usize];
        let cleared = (from.col..from.col + edit.cols).all(|col| {
            let top = (from.row as usize, col as usize);
            self.write_moved_column(
                from.sheet as usize,
                top,
                revision,
                MovedSources::default(),
                &empty,
            )
        });
        cleared
            && (to.col..).zip(columns).all(|(col, (slots, sources))| {
                let top = (to.row as usize, col as usize);
                self.write_moved_column(to.sheet as usize, top, revision, sources, &slots)
            })
    }

    /// Read the cell at `offset` in the source block: its storage goes to
    /// `slots` and, for a formula or reference cell, its entry at the target
    /// to `sources`.
    fn read_cell_to_move(
        &self,
        edit: &CellMove,
        (row_offset, col_offset): (u32, u32),
        slots: &mut MovedSlots,
        sources: &mut MovedSources,
    ) {
        let (from, to) = (edit.from, edit.to);
        let data = &self.sheets[from.sheet as usize];
        let (row, col) = (from.row + row_offset, from.col + col_offset);
        let index = data.cells.idx(row as usize, col as usize);
        let kind = data.cells.source_kind_at(index);
        let style = data.cells.style_at(index);
        if kind != KIND_FORMULA {
            slots.push((kind, data.cells.source_payload_at(index), style));
            return;
        }

        let target = (to.row + row_offset, to.col + col_offset);
        let entry = cell_key(row as usize, col as usize)
            .and_then(|key| data.formulas.get(key, &self.formula_slots))
            .and_then(|entry| self.moved_entry(edit, entry, target));
        let Some(moved) = entry else {
            slots.push((KIND_EMPTY, 0, style));
            return;
        };
        slots.push((KIND_FORMULA, 0, style));
        sources.insert(target, moved);
    }

    /// The entry a formula or reference cell has at `target` after the move.
    /// Its references were moved already; a formula that changes sheet
    /// writes them as the target sheet reads them.
    fn moved_entry(
        &self,
        edit: &CellMove,
        entry: &FormulaEntry,
        (row, col): (u32, u32),
    ) -> Option<FormulaEntry> {
        if let Some(target) = entry.reference_target(edit.from.sheet) {
            return Some(FormulaEntry::reference(target));
        }
        let names = self.written_names();
        let text = if edit.from.sheet == edit.to.sheet {
            entry.source(&names).into_owned()
        } else {
            entry.source_with(&names, |ast| rehome_refs(ast, edit))
        };
        Some(self.parse_formula_entry(&text, edit.to.sheet, row, col))
    }
}
