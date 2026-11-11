//! Rows or columns that move by a permutation. Excel's Sort moves the rows
//! of a rectangle: each cell keeps its value, style and source, and a
//! formula is adjusted for the move of its own row (`sort_formula`). Excel's
//! Cut and Insert Cut Cells moves whole rows or columns: every reference in
//! the workbook follows the cells it names (`moved_index`, `moved_span`).
//! Formulas are read as source text and written back through the same
//! source-replacement path that packed block writes use, so this module does
//! not depend on how the store keeps formulas.

use rustc_hash::FxHashMap;

use wasm_bindgen::prelude::*;

use crate::calc::{move_refs, moved_index};
use crate::formula_rewrite::sort_formula;
use crate::graph::DirtyRect;
use crate::row_order::order_targets;
use crate::store::{CellStore, BLOCK_INVALID, BLOCK_OK, BLOCK_RESOURCE_LIMIT};
use crate::types::{cell_key, AbsCellKey, FormulaEntry, KIND_EMPTY, KIND_FORMULA};

/// The storage of moved cells: kind, payload and style.
type MovedSlots = Vec<(u8, u64, u32)>;

/// The sources of moved formula and reference cells, keyed by target cell.
type MovedSources = FxHashMap<(u32, u32), FormulaEntry>;

/// Status of a permutation that moves part of a spill range, which Excel
/// rejects with "You can't change part of an array."
pub(crate) const PERMUTE_PARTIAL_SPILL: u32 = 4;

/// The rectangle whose rows a permutation moves.
#[derive(Clone, Copy)]
struct PermutedBlock {
    sheet: usize,
    start_row: usize,
    start_col: usize,
    rows: usize,
    cols: usize,
}

/// The source of one moved cell, read before any cell of its column is written.
enum MovedSource {
    Formula(String),
    Reference(AbsCellKey),
}

#[wasm_bindgen]
impl CellStore {
    /// Move the rows of a rectangle: target row offset `i` gets the cells of
    /// source row offset `order[i]`, for the `cols` columns from `start_col`.
    /// `order` must be a permutation of `0..order.len()`. Status: `0`
    /// success, `1` invalid shape, bounds or order, `3` dirty-capacity
    /// rejection, `4` a spill range that the rectangle moves only in part.
    #[wasm_bindgen(js_name = permuteRows)]
    pub fn permute_rows(
        &mut self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        cols: usize,
        order: &[u32],
    ) -> u32 {
        let block = PermutedBlock {
            sheet,
            start_row,
            start_col,
            rows: order.len(),
            cols,
        };
        if !self.permutation_fits(block, order) {
            return BLOCK_INVALID;
        }

        if !self.spills_move_whole(block) {
            return PERMUTE_PARTIAL_SPILL;
        }

        let revision = self.local_dirty_revision();
        if revision.is_some()
            && !self.sheets[sheet]
                .cells
                .can_dirty_rect(start_row, start_col, block.rows, cols)
        {
            return BLOCK_RESOURCE_LIMIT;
        }

        if self.permute_block_rows(block, order, revision, true) {
            BLOCK_OK
        } else {
            BLOCK_RESOURCE_LIMIT
        }
    }

    /// Move `count` whole rows from row `from`, so that the first of them is
    /// row `to` after the move, as Excel's Cut and Insert Cut Cells moves
    /// rows. Each cell keeps its value, style and formula, and every
    /// reference in the workbook follows the cells it names. Status: `0`
    /// success, `1` invalid rows, `3` dirty-capacity rejection.
    #[wasm_bindgen(js_name = moveRows)]
    pub fn move_rows(&mut self, sheet: usize, from: usize, count: usize, to: usize) -> u32 {
        self.move_block(sheet, false, (from, count, to))
    }

    /// Column counterpart of [`CellStore::move_rows`].
    #[wasm_bindgen(js_name = moveCols)]
    pub fn move_cols(&mut self, sheet: usize, from: usize, count: usize, to: usize) -> u32 {
        self.move_block(sheet, true, (from, count, to))
    }

    /// Cells, as `[sheet, row, col]` triples at their address before the
    /// move, whose formula a move back cannot restore: a range that loses a
    /// moved row or column at its edge does not get it back. Undo restores
    /// these cells from a capture. Pass `columns` for a column move.
    #[wasm_bindgen(js_name = moveLosses)]
    pub fn move_losses(
        &self,
        sheet: usize,
        columns: bool,
        from: u32,
        count: u32,
        to: u32,
    ) -> Vec<u32> {
        let edited = sheet as u32;
        let mut losses = Vec::new();
        for (formula_sheet, data) in self.sheets.iter().enumerate() {
            if !self.sheet_alive[formula_sheet] {
                continue;
            }
            let formula_sheet = formula_sheet as u32;
            for ((row, col), entry) in data.formulas.iter(&self.formula_slots) {
                let Some(ast) = entry.ast.as_ref().filter(|_| entry.is_formula()) else {
                    continue;
                };
                let mut moved = ast.clone();
                if !move_refs(
                    &mut moved,
                    edited,
                    formula_sheet,
                    columns,
                    (from, count, to),
                ) {
                    continue;
                }
                move_refs(
                    &mut moved,
                    edited,
                    formula_sheet,
                    columns,
                    (to, count, from),
                );
                if moved != *ast {
                    losses.extend_from_slice(&[formula_sheet, row, col]);
                }
            }
        }
        losses
    }

    /// Offsets, row-major in the rectangle before the move, of the formula
    /// cells whose adjusted text the inverse order cannot restore: a
    /// reference that leaves the sheet becomes `#REF!`. Undo restores these
    /// cells from a capture, so their order does not matter. An invalid
    /// shape or order gives no offsets.
    #[wasm_bindgen(js_name = permuteRowsLosses)]
    pub fn permute_rows_losses(
        &self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        cols: usize,
        order: &[u32],
    ) -> Vec<u32> {
        let block = PermutedBlock {
            sheet,
            start_row,
            start_col,
            rows: order.len(),
            cols,
        };
        if !self.permutation_fits(block, order) {
            return Vec::new();
        }

        let mut losses = Vec::new();
        for (target, &source) in order.iter().enumerate() {
            let source = source as usize;
            let row_delta = target as i32 - source as i32;
            for col_offset in 0..cols {
                let row = start_row + source;
                let col = start_col + col_offset;
                let Some(text) = self.formula_source(sheet, row, col) else {
                    continue;
                };
                let moved = sort_formula(&text, row_delta);
                if sort_formula(&moved, -row_delta) != text {
                    losses.push((source * cols + col_offset) as u32);
                }
            }
        }
        losses
    }

    /// Where each row of `order` goes: entry `i` is the new row offset of
    /// source row offset `i`, which is also the order that moves every row
    /// back. Empty when `order` is not a permutation of `0..order.len()`.
    #[wasm_bindgen(js_name = rowOrderTargets)]
    pub fn row_order_targets(&self, order: &[u32]) -> Vec<u32> {
        order_targets(order).unwrap_or_default()
    }

    /// Excel's current region around a cell, as `[top, left, bottom, right]`:
    /// the smallest rectangle that holds the cell and is bounded by empty rows
    /// and columns (cells that touch it at a corner count). The quick sort
    /// sorts this region. Empty for a cell outside the sheet.
    #[wasm_bindgen(js_name = currentRegion)]
    pub fn current_region(&self, sheet: usize, row: usize, col: usize) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let rows = data.cells.row_count();
        let cols = data.cells.n_cols();
        if row >= rows || col >= cols {
            return Vec::new();
        }

        let occupied = |r: usize, c: usize| data.cells.kind_at(data.cells.idx(r, c)) != KIND_EMPTY;
        let mut region = Region {
            top: row,
            left: col,
            bottom: row,
            right: col,
        };

        // Rows grow first and columns after, so a tall region checks each
        // full-height column once per round instead of once per added row.
        loop {
            let grew_rows = grow_rows(&mut region, rows, cols, &occupied);
            let grew_cols = grow_columns(&mut region, rows, cols, &occupied);
            if !grew_rows && !grew_cols {
                break;
            }
        }

        [region.top, region.left, region.bottom, region.right]
            .map(|edge| edge as u32)
            .to_vec()
    }
}

impl CellStore {
    /// Whether the rectangle lies on the sheet and `order` names each of its
    /// rows exactly once.
    fn permutation_fits(&self, block: PermutedBlock, order: &[u32]) -> bool {
        let Some(data) = self.sheets.get(block.sheet) else {
            return false;
        };
        let fits = block.rows > 0
            && block.cols > 0
            && i32::try_from(block.rows).is_ok()
            && block
                .start_row
                .checked_add(block.rows)
                .is_some_and(|end| end <= data.cells.row_count())
            && block
                .start_col
                .checked_add(block.cols)
                .is_some_and(|end| end <= data.cells.n_cols());
        fits && order_targets(order).is_some()
    }

    /// Excel moves a spill range only with its anchor, and only when the
    /// spill stays inside one row. A spill that covers more rows of the
    /// rectangle, or whose anchor lies outside it, cannot move.
    fn spills_move_whole(&self, block: PermutedBlock) -> bool {
        let Some(rect) = DirtyRect::new(
            block.start_row,
            block.start_col,
            block.start_row + block.rows - 1,
            block.start_col + block.cols - 1,
        ) else {
            return false;
        };

        let spill = &self.sheets[block.sheet].spill;
        let mut whole = true;
        spill.for_each_anchor_intersecting(&[rect], |anchor| {
            let Some(range) = spill.installed(anchor) else {
                return;
            };
            let anchor_inside = anchor.0 >= rect.row_start
                && anchor.0 <= rect.row_end
                && anchor.1 >= rect.col_start
                && anchor.1 <= rect.col_end;
            if !anchor_inside || range.row_end != anchor.0 {
                whole = false;
            }
        });
        whole
    }

    /// Move the rows of `block` by `order`, column by column. With `adjust`,
    /// a moved formula is adjusted for the move of its own row, as a sort
    /// does; without it, its text is kept. Returns false when the store
    /// cannot take a write.
    fn permute_block_rows(
        &mut self,
        block: PermutedBlock,
        order: &[u32],
        revision: Option<u64>,
        adjust: bool,
    ) -> bool {
        let mut slots = Vec::with_capacity(block.rows);
        for col in block.start_col..block.start_col + block.cols {
            slots.clear();
            let mut sources = FxHashMap::default();
            for (target, &source) in order.iter().enumerate() {
                let row_delta = if adjust {
                    target as i32 - source as i32
                } else {
                    0
                };
                self.read_moved_cell(
                    block.sheet,
                    [
                        (block.start_row + source as usize, col),
                        (block.start_row + target, col),
                    ],
                    row_delta,
                    &mut slots,
                    &mut sources,
                );
            }
            if !self.write_moved_column(
                block.sheet,
                (block.start_row, col),
                revision,
                sources,
                &slots,
            ) {
                return false;
            }
        }
        true
    }

    /// Move whole columns from `start`: target column offset `i` gets the
    /// cells of source column offset `order[i]`. Every moved column is read
    /// before any is written, since a column can be the target of another.
    fn permute_columns(
        &mut self,
        sheet: usize,
        start: usize,
        order: &[u32],
        revision: Option<u64>,
    ) -> bool {
        let rows = self.sheets[sheet].cells.row_count();
        let mut columns = Vec::with_capacity(order.len());
        for (target, &source) in order.iter().enumerate() {
            let mut slots = Vec::with_capacity(rows);
            let mut sources = FxHashMap::default();
            for row in 0..rows {
                self.read_moved_cell(
                    sheet,
                    [(row, start + source as usize), (row, start + target)],
                    0,
                    &mut slots,
                    &mut sources,
                );
            }
            columns.push((slots, sources));
        }

        columns
            .into_iter()
            .enumerate()
            .all(|(offset, (slots, sources))| {
                self.write_moved_column(sheet, (0, start + offset), revision, sources, &slots)
            })
    }

    /// Write the moved cells of one column from `top`: `slots` holds their
    /// storage and `sources` their formulas. One writer serves row and column
    /// moves, so the block writer is compiled once for them.
    fn write_moved_column(
        &mut self,
        sheet: usize,
        top: (usize, usize),
        revision: Option<u64>,
        sources: MovedSources,
        slots: &[(u8, u64, u32)],
    ) -> bool {
        self.replace_range_sources(sheet, top, (slots.len(), 1), revision, sources, |row, _| {
            slots[row]
        })
    }

    /// Read the cell at the first address that moves to the second: its
    /// storage goes to `slots`, and the source of a formula or reference
    /// cell, adjusted for a sort that moves its row by `row_delta`, to
    /// `sources`.
    fn read_moved_cell(
        &self,
        sheet: usize,
        [(source_row, source_col), (target_row, target_col)]: [(usize, usize); 2],
        row_delta: i32,
        slots: &mut MovedSlots,
        sources: &mut MovedSources,
    ) {
        let data = &self.sheets[sheet];
        let index = data.cells.idx(source_row, source_col);
        let kind = data.cells.source_kind_at(index);
        let style = data.cells.style_at(index);
        if kind != KIND_FORMULA {
            slots.push((kind, data.cells.source_payload_at(index), style));
            return;
        }

        let moved = self.moved_source(sheet, source_row, source_col, row_delta);
        let (Some(moved), Some(key)) = (moved, cell_key(target_row, target_col)) else {
            slots.push((KIND_EMPTY, 0, style));
            return;
        };
        slots.push((KIND_FORMULA, 0, style));
        sources.insert(key, self.source_entry(sheet, key, moved));
    }

    fn moved_source(
        &self,
        sheet: usize,
        row: usize,
        col: usize,
        row_delta: i32,
    ) -> Option<MovedSource> {
        if let Some(text) = self.formula_source(sheet, row, col) {
            let text = if row_delta == 0 {
                text
            } else {
                sort_formula(&text, row_delta)
            };
            return Some(MovedSource::Formula(text));
        }

        let target = self.reference_target(sheet, row, col)?;
        Some(MovedSource::Reference(AbsCellKey {
            sheet: target[0],
            row: target[1],
            col: target[2],
        }))
    }

    /// Move `count` rows or, with `columns`, columns from `from` to `to`:
    /// the references first, then the cells, which read the text of each
    /// moved formula with its references already moved.
    fn move_block(
        &mut self,
        sheet: usize,
        columns: bool,
        (from, count, to): (usize, usize, usize),
    ) -> u32 {
        let Some(data) = self.sheets.get(sheet).filter(|_| self.sheet_alive[sheet]) else {
            return BLOCK_INVALID;
        };
        let (rows, cols) = (data.cells.row_count(), data.cells.n_cols());
        let length = if columns { cols } else { rows };
        let fits = count > 0
            && u32::try_from(length).is_ok()
            && from.checked_add(count).is_some_and(|end| end <= length)
            && to.checked_add(count).is_some_and(|end| end <= length);
        if !fits {
            return BLOCK_INVALID;
        }
        if from == to {
            return BLOCK_OK;
        }

        let start = from.min(to);
        let span = from.max(to) + count - start;
        let block = (from as u32, count as u32, to as u32);
        let (rect_start, rect_size) = if columns {
            ((0, start), (rows, span))
        } else {
            ((start, 0), (span, cols))
        };
        let revision = self.local_dirty_revision();
        if revision.is_some()
            && !self.sheets[sheet].cells.can_dirty_rect(
                rect_start.0,
                rect_start.1,
                rect_size.0,
                rect_size.1,
            )
        {
            return BLOCK_RESOURCE_LIMIT;
        }

        self.move_references(sheet as u32, columns, block);
        let order = moved_order(start, span, block);
        let written = rect_size.0 == 0
            || rect_size.1 == 0
            || if columns {
                self.permute_columns(sheet, start, &order, revision)
            } else {
                let rows = PermutedBlock {
                    sheet,
                    start_row: start,
                    start_col: 0,
                    rows: span,
                    cols,
                };
                self.permute_block_rows(rows, &order, revision, false)
            };
        self.graph.invalidate();
        if written {
            BLOCK_OK
        } else {
            BLOCK_RESOURCE_LIMIT
        }
    }

    fn source_entry(&self, sheet: usize, key: (u32, u32), moved: MovedSource) -> FormulaEntry {
        match moved {
            MovedSource::Formula(text) => {
                self.parse_formula_entry(&text, sheet as u32, key.0, key.1)
            }
            MovedSource::Reference(target) => FormulaEntry::reference(
                target,
                &self.sheet_names[target.sheet as usize],
                sheet as u32,
            ),
        }
    }
}

/// The order that moves `block` (`from`, `count`, `to`) within the `span`
/// indices from `start`: entry `i` is the source offset of target offset `i`.
fn moved_order(start: usize, span: usize, (from, count, to): (u32, u32, u32)) -> Vec<u32> {
    let mut order = vec![0; span];
    for source in 0..span {
        let target = moved_index((start + source) as u32, from, count, to) as usize - start;
        order[target] = source as u32;
    }
    order
}

/// A rectangle of cells, inclusive on every edge.
struct Region {
    top: usize,
    left: usize,
    bottom: usize,
    right: usize,
}

/// Add the rows above and below `region` while they hold a cell next to it.
fn grow_rows(
    region: &mut Region,
    rows: usize,
    cols: usize,
    occupied: &impl Fn(usize, usize) -> bool,
) -> bool {
    let mut grew = false;
    let left = region.left.saturating_sub(1);
    let right = (region.right + 1).min(cols - 1);

    while region.top > 0 && (left..=right).any(|c| occupied(region.top - 1, c)) {
        region.top -= 1;
        grew = true;
    }
    while region.bottom + 1 < rows && (left..=right).any(|c| occupied(region.bottom + 1, c)) {
        region.bottom += 1;
        grew = true;
    }
    grew
}

/// Add the columns left and right of `region` while they hold a cell next to it.
fn grow_columns(
    region: &mut Region,
    rows: usize,
    cols: usize,
    occupied: &impl Fn(usize, usize) -> bool,
) -> bool {
    let mut grew = false;
    let top = region.top.saturating_sub(1);
    let bottom = (region.bottom + 1).min(rows - 1);

    while region.left > 0 && (top..=bottom).any(|r| occupied(r, region.left - 1)) {
        region.left -= 1;
        grew = true;
    }
    while region.right + 1 < cols && (top..=bottom).any(|r| occupied(r, region.right + 1)) {
        region.right += 1;
        grew = true;
    }
    grew
}
