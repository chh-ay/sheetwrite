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
use crate::store::{CellStore, BLOCK_INVALID, BLOCK_OK, BLOCK_RESOURCE_LIMIT};
use crate::types::{cell_key, AbsCellKey, FormulaEntry, KIND_EMPTY, KIND_FORMULA};

/// Status of a permutation that moves part of a spill range, which Excel
/// rejects with "You can't change part of an array."
pub(crate) const PERMUTE_PARTIAL_SPILL: u32 = 4;

const BITS_PER_WORD: usize = 64;

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
    /// `order` must be a permutation of `0..order.len()`. Status: `0` success,
    /// `1` invalid shape, bounds or order, `3` dirty-capacity rejection, `4`
    /// a spill range that the rectangle moves only in part.
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

        let mut slots = Vec::with_capacity(block.rows);
        for col in start_col..start_col + cols {
            slots.clear();
            let sources = self.read_moved_column(block, col, order, &mut slots);
            let written = self.replace_range_sources(
                sheet,
                (start_row, col),
                (block.rows, 1),
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
    /// cells whose adjusted text the inverse permutation cannot restore: a
    /// reference that leaves the sheet becomes `#REF!`. Undo restores these
    /// cells from a capture. An invalid shape or order gives no offsets.
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
        losses.sort_unstable();
        losses
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
        fits && is_permutation(order)
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
            MovedSource::Formula(text) => self.parse_formula_entry(&text, sheet as u32, key.0, key.1),
            MovedSource::Reference(target) => FormulaEntry::reference(
                target,
                &self.sheet_names[target.sheet as usize],
                sheet as u32,
            ),
        }
    }
}

/// Whether `order` holds each of `0..order.len()` exactly once. One bit per
/// row marks the rows already seen.
fn is_permutation(order: &[u32]) -> bool {
    let mut seen = vec![0u64; order.len().div_ceil(BITS_PER_WORD)];
    for &row in order {
        let row = row as usize;
        if row >= order.len() {
            return false;
        }

        let word = row / BITS_PER_WORD;
        let bit = 1u64 << (row % BITS_PER_WORD);
        if seen[word] & bit != 0 {
            return false;
        }
        seen[word] |= bit;
    }
    true
}
