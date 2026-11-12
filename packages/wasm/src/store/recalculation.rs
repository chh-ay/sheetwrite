//! Bounded commit output for chart tracking, collected from existing pass work.

use wasm_bindgen::prelude::*;

use super::CellStore;
use crate::cells::CellStorage;
use crate::graph::{DirtyRect, DirtySeeds};
use crate::sheet::SheetData;
use crate::types::KIND_EMPTY;

/// At most 80 KiB of rectangle coordinates; overflow requests a conservative refresh.
const MAX_RECTS: usize = 4096;
const RECT_WIDTH: usize = 5;
/// Seed rectangles up to this many cells are checked cell by cell; larger
/// block writes are reported whole, since checking them would cost a scan.
const CHECKED_SEED_CELLS: u64 = 64;

/// Reused flat half-open rectangles. Only stores with an attached tracker allocate it.
#[derive(Default)]
pub(crate) struct Recalculation {
    rects: Vec<u32>,
    overflow: bool,
}

impl Recalculation {
    /// Add one recomputed formula or changed spill/pivot cell.
    pub(crate) fn cell(&mut self, sheet: u32, row: u32, col: u32) {
        self.rect([sheet, row, row + 1, col, col + 1]);
    }

    /// Coalesce adjacent runs without scanning previously reported rectangles.
    pub(crate) fn rect(&mut self, rect: [u32; RECT_WIDTH]) {
        if self.overflow {
            return;
        }
        if let Some(last) = self.rects.last_chunk_mut::<RECT_WIDTH>() {
            if last[0] == rect[0] {
                if last[3..] == rect[3..] && last[1] <= rect[2] && rect[1] <= last[2] {
                    last[1] = last[1].min(rect[1]);
                    last[2] = last[2].max(rect[2]);
                    return;
                }
                if last[1..3] == rect[1..3] && last[3] <= rect[4] && rect[3] <= last[4] {
                    last[3] = last[3].min(rect[3]);
                    last[4] = last[4].max(rect[4]);
                    return;
                }
            }
        }
        if self.rects.len() == MAX_RECTS * RECT_WIDTH {
            self.rects.clear();
            self.overflow = true;
        } else {
            self.rects.extend_from_slice(&rect);
        }
    }

    /// Report the sheet's dirty seeds before the pass clears them. A source
    /// write that cuts a spill marks the vacated cells dirty here, and they can
    /// lie outside the written rectangle. A seed that now holds a source value
    /// is a direct edit, which core matches itself, so only seeds that may be
    /// empty are reported: an unrelated literal edit then reports nothing.
    pub(crate) fn dirty_seeds(&mut self, sheet: usize, data: &SheetData) {
        let sheet_id = sheet as u32;
        match data.formulas.dirty_seeds() {
            DirtySeeds::All => self.rect([
                sheet_id,
                0,
                data.cells.row_count() as u32,
                0,
                data.cells.n_cols() as u32,
            ]),
            DirtySeeds::Cells(cells) => {
                for &(row, col) in cells {
                    if may_be_vacated(
                        &data.cells,
                        DirtyRect {
                            row_start: row,
                            col_start: col,
                            row_end: row,
                            col_end: col,
                        },
                    ) {
                        self.cell(sheet_id, row, col);
                    }
                }
            }
            DirtySeeds::Ranges(rects) => {
                for &rect in rects {
                    if may_be_vacated(&data.cells, rect) {
                        self.rect([
                            sheet_id,
                            rect.row_start,
                            rect.row_end.saturating_add(1),
                            rect.col_start,
                            rect.col_end.saturating_add(1),
                        ]);
                    }
                }
            }
        }
    }

    fn reset(&mut self) {
        self.rects.clear();
        self.overflow = false;
    }

    /// Logical and retained collector bytes, including its boxed header.
    pub(crate) const fn bytes(&self) -> (usize, usize) {
        let header = std::mem::size_of::<Self>();
        (
            header + self.rects.len() * 4,
            header + self.rects.capacity() * 4,
        )
    }
}

/// Whether the inclusive seed `rect` may hold a cell a cut spill vacated: a
/// large rectangle always may; a small one only when a cell has no source.
fn may_be_vacated(cells: &CellStorage, rect: DirtyRect) -> bool {
    let rows = u64::from(rect.row_end - rect.row_start) + 1;
    let cols = u64::from(rect.col_end - rect.col_start) + 1;
    if rows * cols > CHECKED_SEED_CELLS {
        return true;
    }
    (rect.col_start..=rect.col_end).any(|col| {
        let col_index = col as usize;
        (rect.row_start..=rect.row_end).any(|row| {
            let row_index = row as usize;
            !cells.contains_cell(row_index, col_index)
                || cells.source_kind_at(cells.idx(row_index, col_index)) == KIND_EMPTY
        })
    })
}

#[wasm_bindgen]
impl CellStore {
    /// Enable bounded recalculation reporting while a chart tracker is attached.
    /// Disabling releases its storage. Enabling starts with an empty report.
    #[wasm_bindgen(js_name = setRecalculationTracking)]
    pub fn set_recalculation_tracking(&mut self, enabled: bool) {
        self.recalculation = enabled.then(|| Box::new(Recalculation::default()));
    }

    /// Rectangles waiting in the report: `-1` when tracking is off or the
    /// report overflowed (refresh conservatively), otherwise the count. Core
    /// asks this first so a commit with nothing to report crosses no array.
    #[wasm_bindgen(js_name = recalculatedRectCount)]
    #[must_use]
    pub fn recalculated_rect_count(&self) -> i32 {
        self.recalculation
            .as_deref()
            .filter(|changes| !changes.overflow)
            .map_or(-1, |changes| (changes.rects.len() / RECT_WIDTH) as i32)
    }

    /// Take `[sheet, row_start, row_end, col_start, col_end]` half-open rectangles
    /// accumulated since `beginMutation`, standalone `recompute` or `recomputeVolatile`.
    /// Includes selected formulas (even when their value stayed equal), changed
    /// spill/pivot cells and dirty source seeds, which also hold detached spill cells.
    /// Empty after overflow or with tracking off; check `recalculatedRectCount` first.
    /// Taking clears the report but retains its capacity for the next commit.
    #[wasm_bindgen(js_name = recalculatedRects)]
    pub fn recalculated_rects(&mut self) -> Vec<u32> {
        let Some(changes) = self.recalculation.as_deref_mut() else {
            return Vec::new();
        };
        let result = if changes.overflow {
            Vec::new()
        } else {
            changes.rects.clone()
        };
        changes.reset();
        result
    }
}

impl CellStore {
    /// Start the next tracked mutation without discarding its reusable capacity.
    pub(crate) fn reset_recalculation(&mut self) {
        if let Some(changes) = self.recalculation.as_deref_mut() {
            changes.reset();
        }
    }

    /// Append the pass's existing changed list, with no work when tracking is off.
    pub(crate) fn record_recalculated_cells(&mut self, sheet: usize, cells: &[(u32, u32)]) {
        if let Some(changes) = self.recalculation.as_deref_mut() {
            for &(row, col) in cells {
                changes.cell(sheet as u32, row, col);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Recalculation, MAX_RECTS};
    use crate::graph::DirtyRect;
    use crate::store::CellStore;

    #[test]
    fn reports_only_tracked_formula_work_and_releases_when_disabled() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 10);
        store.set_formula(sheet, 0, 1, "=A1*2", 0);
        store.set_number(sheet, 9, 3, 1.0, 0);
        store.recompute(sheet);
        assert_eq!(store.recalculated_rect_count(), -1);

        store.set_recalculation_tracking(true);
        store.begin_mutation();
        store.set_number(sheet, 9, 3, 2.0, 0);
        store.commit_sources();
        // Direct edits are classified by core; no formula reads this cell.
        assert_eq!(store.recalculated_rect_count(), 0);

        store.begin_mutation();
        store.set_number(sheet, 0, 0, 3.0, 0);
        store.commit_sources();
        let rects = store.recalculated_rects();
        // Only recomputed B1: the edited A1 holds a source value, which core matches itself.
        assert_eq!(rects, vec![sheet as u32, 0, 1, 1, 2]);
        assert_eq!(store.recalculated_rect_count(), 0);

        store.set_recalculation_tracking(false);
        assert!(store.recalculation.is_none());
    }

    #[test]
    fn leaves_direct_edits_out_of_small_seed_rectangles() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 10);
        store.set_formula(sheet, 0, 1, "=A1*2", 0);
        store.recompute(sheet);
        store.set_recalculation_tracking(true);

        // Block writes seed rectangles instead of cells.
        store.begin_mutation();
        store.set_number(sheet, 9, 3, 2.0, 0);
        store.sheets[sheet].formulas.mark_dirty_rect(DirtyRect {
            row_start: 9,
            col_start: 3,
            row_end: 9,
            col_end: 3,
        });
        store.commit_sources();
        assert_eq!(store.recalculated_rects(), Vec::<u32>::new());

        // An emptied cell may be a vacated spill cell, so it is reported.
        store.begin_mutation();
        store.clear_cell(sheet, 9, 3, 0);
        store.sheets[sheet].formulas.mark_dirty_rect(DirtyRect {
            row_start: 9,
            col_start: 3,
            row_end: 9,
            col_end: 3,
        });
        store.commit_sources();
        assert_eq!(store.recalculated_rects(), vec![sheet as u32, 9, 10, 3, 4]);
    }

    #[test]
    fn reports_cells_vacated_by_a_shrinking_spill() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, 4);
        store.set_number(sheet, 0, 0, 3.0, 0);
        store.set_formula(sheet, 1, 1, "=SEQUENCE(A1)", 0);
        store.recompute(sheet);
        store.set_recalculation_tracking(true);

        store.begin_mutation();
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.commit_sources();
        let rects = store.recalculated_rects();
        assert!(rects
            .as_chunks::<5>()
            .0
            .iter()
            .any(|rect| rect[0] == sheet as u32
                && rect[1] <= 2
                && rect[2] >= 4
                && rect[3] <= 1
                && rect[4] >= 2));
    }

    #[test]
    fn coalesces_runs_and_requests_a_conservative_refresh_on_overflow() {
        let mut report = Recalculation::default();
        report.cell(0, 1, 2);
        report.cell(0, 2, 2);
        assert_eq!(report.rects, vec![0, 1, 3, 2, 3]);

        for row in 0..=MAX_RECTS as u32 {
            report.cell(1, row * 2, 0);
        }
        assert!(report.overflow);
        assert!(report.rects.is_empty());
    }
}
