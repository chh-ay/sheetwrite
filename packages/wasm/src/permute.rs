//! In-place row sort: the rows of a rectangle move by a permutation, as
//! Excel's Sort moves them. Each cell keeps its value, style and source; a
//! formula is adjusted for the move of its own row (`sort_formula`).
//! Formulas are read as source text and written back through the same
//! source-replacement path that packed block writes use, so this module does
//! not depend on how the store keeps formulas.

use std::collections::HashMap;

use wasm_bindgen::prelude::*;

use crate::formula_rewrite::sort_formula;
use crate::graph::DirtyRect;
use crate::row_order::{decode_row_order, encode_row_order, invert_row_order, is_permutation};
use crate::store::{CellStore, BLOCK_INVALID, BLOCK_OK, BLOCK_RESOURCE_LIMIT};
use crate::types::{cell_key, AbsCellKey, FormulaEntry, KIND_EMPTY, KIND_FORMULA};

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

/// The rectangle of a `permuteRows` call.
fn permuted_block(
    sheet: usize,
    start_row: usize,
    start_col: usize,
    rows: usize,
    cols: usize,
) -> PermutedBlock {
    PermutedBlock {
        sheet,
        start_row,
        start_col,
        rows,
        cols,
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Move the rows of a rectangle of `rows` × `cols` cells: target row
    /// offset `i` gets the cells of source row offset `order[i]`. `order` is
    /// the base64 row order of a `permuteRows` operation. Status: `0`
    /// success, `1` invalid shape, bounds or order, `3` dirty-capacity
    /// rejection, `4` a spill range that the rectangle moves only in part.
    #[wasm_bindgen(js_name = permuteRows)]
    pub fn permute_rows(
        &mut self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        rows: usize,
        cols: usize,
        order: &str,
    ) -> u32 {
        let block = permuted_block(sheet, start_row, start_col, rows, cols);
        let Some(order) = self.decoded_order(block, order) else {
            return BLOCK_INVALID;
        };

        if !self.spills_move_whole(block) {
            return PERMUTE_PARTIAL_SPILL;
        }

        let revision = self.local_dirty_revision();
        if revision.is_some()
            && !self.sheets[sheet]
                .cells
                .can_dirty_rect(start_row, start_col, rows, cols)
        {
            return BLOCK_RESOURCE_LIMIT;
        }

        let mut slots = Vec::with_capacity(rows);
        for col in start_col..start_col + cols {
            slots.clear();
            let sources = self.read_moved_column(block, col, &order, &mut slots);
            let written = self.replace_range_sources(
                sheet,
                (start_row, col),
                (rows, 1),
                revision,
                sources,
                |row, _| slots[row],
            );
            if !written {
                return BLOCK_RESOURCE_LIMIT;
            }
        }

        BLOCK_OK
    }

    /// Row-major offsets, in the rectangle before the move, of the formula
    /// cells whose adjusted text the inverse order cannot restore: a
    /// reference that leaves the sheet becomes `#REF!`. Undo restores these
    /// cells from a capture. An invalid shape or order gives no offsets.
    #[wasm_bindgen(js_name = permuteRowsLosses)]
    pub fn permute_rows_losses(
        &self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        rows: usize,
        cols: usize,
        order: &str,
    ) -> Vec<u32> {
        let block = permuted_block(sheet, start_row, start_col, rows, cols);
        let Some(order) = self.decoded_order(block, order) else {
            return Vec::new();
        };

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
        losses.sort_unstable();
        losses
    }

    /// The base64 row order that sorts the records of a range: `starts` are
    /// the first rows of the records that may move, in sheet order, and each
    /// record has `height` rows. Records sort by the keys of their first row;
    /// rows of the range that start no listed record keep their place. `None`
    /// when the starts or the height do not fit the `rows` rows from
    /// `data_start`.
    #[wasm_bindgen(js_name = sortRangeOrder)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn sort_range_order(
        &self,
        sheet: usize,
        data_start: u32,
        rows: u32,
        height: u32,
        cols: &[u32],
        ascending: &[u8],
        starts: &[u32],
    ) -> Option<String> {
        let fits = height > 0
            && starts.iter().all(|&start| {
                start >= data_start
                    && start
                        .checked_add(height)
                        .is_some_and(|end| end <= data_start.saturating_add(rows))
            });
        if !fits {
            return None;
        }

        let sorted = self.sort_rows_multi(sheet, cols, ascending, starts);
        if sorted.len() != starts.len() {
            return None;
        }

        let mut order: Vec<u32> = (0..rows).collect();
        for (&target, &source) in starts.iter().zip(&sorted) {
            for row in 0..height {
                order[(target - data_start + row) as usize] = source - data_start + row;
            }
        }
        is_permutation(&order).then(|| encode_row_order(&order))
    }

    /// Where each row of a base64 row order goes: entry `i` is the new row
    /// offset of source row offset `i`. `None` when the order is not a
    /// permutation of `rows` rows.
    #[wasm_bindgen(js_name = rowOrderTargets)]
    pub fn row_order_targets(&self, order: &str, rows: usize) -> Option<Vec<u32>> {
        decode_row_order(order, rows).map(|order| invert_row_order(&order))
    }

    /// The base64 order that moves every row of `order` back, or `None` when
    /// `order` is not a permutation of `rows` rows.
    #[wasm_bindgen(js_name = invertRowOrder)]
    pub fn invert_row_order_text(&self, order: &str, rows: usize) -> Option<String> {
        decode_row_order(order, rows).map(|order| encode_row_order(&invert_row_order(&order)))
    }
}

impl CellStore {
    /// The decoded order, when the rectangle lies on the sheet and `order`
    /// is base64 of a permutation of its rows.
    fn decoded_order(&self, block: PermutedBlock, order: &str) -> Option<Vec<u32>> {
        let data = self.sheets.get(block.sheet)?;
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
        if !fits {
            return None;
        }

        decode_row_order(order, block.rows)
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

    /// Read the cells that move into column `col`, in target order. Slots
    /// receive the storage of each target cell; the returned map holds the
    /// adjusted source of each formula or reference cell, keyed by target.
    fn read_moved_column(
        &self,
        block: PermutedBlock,
        col: usize,
        order: &[u32],
        slots: &mut Vec<(u8, u64, u32)>,
    ) -> HashMap<(u32, u32), FormulaEntry> {
        let data = &self.sheets[block.sheet];
        let mut sources = HashMap::new();

        for (target, &source) in order.iter().enumerate() {
            let source_row = block.start_row + source as usize;
            let target_row = block.start_row + target;
            let index = data.cells.idx(source_row, col);
            let kind = data.cells.source_kind_at(index);
            let style = data.cells.style_at(index);

            if kind != KIND_FORMULA {
                slots.push((kind, data.cells.source_payload_at(index), style));
                continue;
            }

            let row_delta = target as i32 - source as i32;
            let moved = self.moved_source(block.sheet, source_row, col, row_delta);
            let (Some(moved), Some(key)) = (moved, cell_key(target_row, col)) else {
                slots.push((KIND_EMPTY, 0, style));
                continue;
            };
            slots.push((KIND_FORMULA, 0, style));
            sources.insert(key, self.source_entry(block.sheet, key, moved));
        }

        sources
    }

    fn moved_source(
        &self,
        sheet: usize,
        row: usize,
        col: usize,
        row_delta: i32,
    ) -> Option<MovedSource> {
        if let Some(text) = self.formula_source(sheet, row, col) {
            return Some(MovedSource::Formula(sort_formula(&text, row_delta)));
        }

        let target = self.reference_target(sheet, row, col)?;
        Some(MovedSource::Reference(AbsCellKey {
            sheet: target[0],
            row: target[1],
            col: target[2],
        }))
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
