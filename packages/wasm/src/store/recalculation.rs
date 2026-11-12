//! Bounded commit output for chart tracking, collected from existing pass work.

use wasm_bindgen::prelude::*;

use super::CellStore;

/// At most 80 KiB of rectangle coordinates; overflow requests a conservative refresh.
const MAX_RECTS: usize = 4096;
const RECT_WIDTH: usize = 5;

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

#[wasm_bindgen]
impl CellStore {
    /// Enable bounded recalculation reporting while a chart tracker is attached.
    /// Disabling releases its storage. Enabling starts with an empty report.
    #[wasm_bindgen(js_name = setRecalculationTracking)]
    pub fn set_recalculation_tracking(&mut self, enabled: bool) {
        self.recalculation = enabled.then(|| Box::new(Recalculation::default()));
    }

    /// Take `[sheet, row_start, row_end, col_start, col_end]` half-open rectangles
    /// accumulated since `beginMutation`, standalone `recompute` or `recomputeVolatile`.
    /// Includes selected formulas (even when their value stayed equal), changed
    /// spill/pivot cells and dirty source seeds, which also hold detached spill cells.
    /// Empty means no work. `None` means disabled or overflow: refresh conservatively.
    /// Taking clears the report but retains its capacity for the next commit.
    #[wasm_bindgen(js_name = recalculatedRects)]
    pub fn recalculated_rects(&mut self) -> Option<Vec<u32>> {
        let changes = self.recalculation.as_deref_mut()?;
        let result = (!changes.overflow).then(|| changes.rects.clone());
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
    use crate::store::CellStore;

    #[test]
    fn reports_only_tracked_formula_work_and_releases_when_disabled() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(10, 4);
        store.set_formula(sheet, 0, 1, "=A1*2", 0);
        store.set_number(sheet, 9, 3, 1.0, 0);
        store.recompute(sheet);
        assert_eq!(store.recalculated_rects(), None);

        store.set_recalculation_tracking(true);
        store.begin_mutation();
        store.set_number(sheet, 9, 3, 2.0, 0);
        store.commit_sources();
        // Direct edits are classified by core; no formula reads this cell.
        assert_eq!(store.recalculated_rects(), Some(Vec::new()));

        store.begin_mutation();
        store.set_number(sheet, 0, 0, 3.0, 0);
        store.commit_sources();
        let rects = store.recalculated_rects().unwrap_or_default();
        // The dirty source seed A1 and recomputed B1 coalesce into one row run.
        assert_eq!(rects, vec![sheet as u32, 0, 1, 0, 2]);
        assert_eq!(store.recalculated_rects(), Some(Vec::new()));

        store.set_recalculation_tracking(false);
        assert!(store.recalculation.is_none());
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
        let rects = store.recalculated_rects().unwrap_or_default();
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
