//! Pivot output that both engines place as spill state owned by the anchor.
//!
//! The full engine computes output from its caches (`pivots.rs`). The default
//! engine has no caches: it shows the output a file saved (for example the
//! cells Excel rendered) and never recalculates it. Either output is spill
//! state, so source cells, formulas and other spills block it with `#SPILL!`
//! at the anchor, and clearing the blocker places it again.

use std::borrow::Borrow;

use super::CellStore;
use crate::eval::calculated_slot;
use crate::graph::{DirtyRect, DirtySeeds};
use crate::sheet::SheetData;
use crate::spill::{spill_ownership_within_budget, SpillRange};
use crate::types::{CellKey, FormulaError, StringStorage, Value, KIND_EMPTY};

#[cfg(not(feature = "analysis"))]
pub(crate) use saved::SavedPivots;

/// Output cells one pivot may fill, computed or saved; more gives `#NUM!`
/// for computed output and rejects a saved output.
pub(crate) const MAX_PIVOT_OUTPUT_CELLS: usize = 1_000_000;

#[derive(Clone, Copy)]
pub(crate) enum ShiftAxis {
    Rows,
    Cols,
}

/// Writes `value` as the calculated value of a pivot anchor. An anchor that
/// holds a source or a formula keeps it. Returns whether the value changed.
pub(super) fn set_anchor_value(
    data: &mut SheetData,
    strings: &mut StringStorage,
    anchor: CellKey,
    value: &Value,
) -> bool {
    let (row, col) = (anchor.0 as usize, anchor.1 as usize);
    if !data.cells.contains_cell(row, col) || data.formulas.contains(anchor) {
        return false;
    }
    let index = data.cells.idx(row, col);
    if data.cells.source_kind_at(index) != KIND_EMPTY {
        return false;
    }
    let slot = calculated_slot(strings, value);
    if data.cells.calculated_cell_at(index) == Some(slot) {
        return false;
    }
    assert!(
        data.cells.set_derived(index, slot.0, slot.1),
        "calculated overlay allocation failed"
    );
    true
}

/// Whether the dirty cells of a finished pass cut `attempt`: a write inside
/// it that the output does not own, so the output must be placed again.
pub(super) fn attempt_cut(data: &SheetData, attempt: SpillRange, installed: bool) -> bool {
    let cut = |cell: CellKey| {
        attempt.contains(cell) && (!installed || data.spill.owner(cell) != Some(attempt.anchor))
    };
    match data.formulas.dirty_seeds() {
        DirtySeeds::All => true,
        DirtySeeds::Cells(mut cells) => cells.any(|&cell| cut(cell)),
        DirtySeeds::Ranges(rects) => rects.iter().any(|rect| {
            rect.intersects(DirtyRect {
                row_start: attempt.anchor.0,
                col_start: attempt.anchor.1,
                row_end: attempt.row_end,
                col_end: attempt.col_end,
            })
        }),
    }
}

/// Shifts the anchor coordinate `index` for an insert (`delta > 0`) or a
/// delete at `at`. An anchor whose row or column is deleted moves to the
/// first surviving one at the deletion, as core moves it.
pub(super) fn shift_anchor(index: u32, at: u32, delta: i64, extent_after: usize) -> u32 {
    if index < at {
        return index;
    }
    if delta >= 0 {
        return index.saturating_add(delta as u32);
    }
    let count = (-delta) as u32;
    if index - at >= count {
        index - count
    } else {
        at.min(extent_after.saturating_sub(1) as u32)
    }
}

impl CellStore {
    /// Clears the output of the pivot at `range.anchor`, then admits and
    /// installs `range` with `value_at(offset)` row-major, as a formula
    /// spill does. Returns the cells whose value changed (and anchors the
    /// vacated cells may unblock), and whether the output was placed.
    pub(super) fn place_pivot_output<V: Borrow<Value>>(
        &mut self,
        owner: usize,
        range: SpillRange,
        value_at: impl Fn(usize) -> V,
    ) -> (Vec<CellKey>, Result<(), FormulaError>) {
        let anchor = range.anchor;
        let current_owner_cells = self.sheets.iter().try_fold(0usize, |total, data| {
            total.checked_add(data.spill.owner_count())
        });
        let data = &mut self.sheets[owner];
        if !data
            .cells
            .contains_cell(anchor.0 as usize, anchor.1 as usize)
        {
            return (Vec::new(), Err(FormulaError::Ref));
        }

        let vacated_range = data.spill.installed(anchor);
        let vacated = data.spill.clear_keeping_values(anchor, &mut data.cells);
        let mut changed: Vec<CellKey> = Vec::new();
        if let Some(vacated_range) = vacated_range.filter(|&vacated| vacated != range) {
            changed.extend(data.spill.anchors_colliding_with(anchor, vacated_range));
        }
        let vacated_cells = |changed: &mut Vec<CellKey>| {
            changed.extend(vacated.iter().map(|&(cell, _)| cell));
        };

        // An anchor that holds a value or formula cannot show the output.
        let anchor_index = data.cells.idx(anchor.0 as usize, anchor.1 as usize);
        if data.formulas.contains(anchor) || data.cells.source_kind_at(anchor_index) != KIND_EMPTY {
            vacated_cells(&mut changed);
            return (changed, Err(FormulaError::Spill));
        }
        if let Err(error) = data.spill.admit(range, &mut data.cells, &data.formulas) {
            vacated_cells(&mut changed);
            return (changed, Err(error));
        }

        let cells = range.cells();
        let within_budget = current_owner_cells
            .map(|total| total - vacated.len().min(total))
            .and_then(|total| total.checked_add(cells))
            .is_some_and(|owners| {
                owners <= self.spill_owner_cell_limit && spill_ownership_within_budget(owners)
            });
        if !within_budget || !data.spill.reserve(cells, &mut data.cells) {
            data.spill.compact(&mut data.cells);
            vacated_cells(&mut changed);
            return (changed, Err(FormulaError::Num));
        }

        let strings = &mut self.strings;
        let written = data.spill.install(range, &mut data.cells, |offset| {
            calculated_slot(strings, value_at(offset).borrow())
        });

        // Output back over the same cells reports only changed values.
        let reinstalled = vacated_range == Some(range)
            && vacated.len() == written.len()
            && vacated
                .iter()
                .zip(&written)
                .all(|((vacated_cell, _), cell)| vacated_cell == cell);
        if reinstalled {
            for (&(cell, previous), _) in vacated.iter().zip(&written) {
                let index = data.cells.idx(cell.0 as usize, cell.1 as usize);
                if data.cells.calculated_cell_at(index) != previous {
                    changed.push(cell);
                }
            }
        } else {
            vacated_cells(&mut changed);
            changed.extend(written);
        }
        if set_anchor_value(data, strings, anchor, value_at(0).borrow()) {
            changed.push(anchor);
        }
        (changed, Ok(()))
    }

    /// Shows `error` at `anchor` and keeps `attempt` (or the anchor cell)
    /// registered, so clearing a blocker or the anchor retries it. Returns
    /// whether a cell changed, and the registered attempt: `None` when the
    /// anchor lies outside the sheet.
    pub(super) fn show_output_error(
        &mut self,
        owner: usize,
        anchor: CellKey,
        error: FormulaError,
        attempt: Option<SpillRange>,
    ) -> (bool, Option<SpillRange>) {
        let data = &self.sheets[owner];
        if !data
            .cells
            .contains_cell(anchor.0 as usize, anchor.1 as usize)
        {
            return (false, None);
        }

        let mut changed = self.vacate_pivot(owner, anchor);
        let data = &mut self.sheets[owner];
        let range = attempt
            .or_else(|| SpillRange::new(anchor, 1, 1))
            .expect("a cell inside the sheet is a one-cell range");
        data.spill.register_attempt(range);
        if set_anchor_value(data, &mut self.strings, anchor, &Value::Error(error)) {
            changed.push(anchor);
        }
        (self.mark_pivot_cells_dirty(owner, changed), Some(range))
    }

    /// Removes the installed output of the pivot at `anchor`, but not its
    /// anchor value. Returns the cleared cells and the anchors they may
    /// unblock.
    fn vacate_pivot(&mut self, owner: usize, anchor: CellKey) -> Vec<CellKey> {
        let data = &mut self.sheets[owner];
        let vacated_range = data.spill.installed(anchor);
        let mut changed = data.spill.clear(anchor, &mut data.cells);
        if let Some(vacated_range) = vacated_range {
            changed.extend(data.spill.anchors_colliding_with(anchor, vacated_range));
        }
        changed
    }

    /// Removes a deleted pivot's output, attempt and anchor value.
    pub(super) fn remove_pivot_output(&mut self, owner: usize, anchor: CellKey) {
        let mut changed = self.vacate_pivot(owner, anchor);
        let data = &mut self.sheets[owner];
        data.spill.forget(anchor, &mut data.cells);
        let (row, col) = (anchor.0 as usize, anchor.1 as usize);
        if data.cells.contains_cell(row, col) && !data.formulas.contains(anchor) {
            let index = data.cells.idx(row, col);
            if data.cells.source_kind_at(index) == KIND_EMPTY
                && data.cells.calculated_cell_at(index).is_some()
            {
                data.cells.remove_calculated(index);
                changed.push(anchor);
            }
        }
        self.mark_pivot_cells_dirty(owner, changed);
    }

    /// Marks changed output cells dirty so the formulas reading them, and
    /// pivots whose source holds them, update. Returns whether any changed.
    pub(super) fn mark_pivot_cells_dirty(&mut self, owner: usize, changed: Vec<CellKey>) -> bool {
        let any = !changed.is_empty();
        self.sheets[owner].formulas.mark_cells_dirty(changed);
        any
    }
}

/// The default engine: saved output only. Each saved output is placed when
/// it arrives, and again when a write cuts it or clears its blocker.
#[cfg(not(feature = "analysis"))]
mod saved {
    use std::mem::size_of;

    use rustc_hash::FxHashSet;
    use wasm_bindgen::prelude::*;

    use super::super::utf16_slices;
    use super::{attempt_cut, shift_anchor, CellStore, ShiftAxis, MAX_PIVOT_OUTPUT_CELLS};
    use crate::spill::SpillRange;
    use crate::types::{AbsCellKey, CellKey, FormulaError, Value};

    /// Spill contention between saved output and formula spills settles in a
    /// few rounds; a pivot still pending after this many retries at the next
    /// recalculation.
    const MAX_SETTLE_ROUNDS: usize = 32;
    /// Saved outputs one sheet may hold; core's workbook pivot bound is lower.
    const MAX_SAVED_PIVOTS_PER_SHEET: usize = 1_024;
    /// `layout` values per saved output: anchor row, anchor column, rows, cols.
    const LAYOUT_STRIDE: usize = 4;

    const CELL_BLANK: u8 = 0;
    const CELL_NUMBER: u8 = 1;
    const CELL_TEXT: u8 = 2;
    const CELL_BOOL: u8 = 3;

    struct SavedPivot {
        sheet: usize,
        anchor: CellKey,
        rows: u32,
        cols: u32,
        /// Row-major from the anchor.
        cells: Vec<Value>,
        /// Heap bytes of the texts in `cells`, for memory stats.
        text_bytes: usize,
        /// The output range last attempted, installed or blocked.
        attempt: Option<SpillRange>,
        is_installed: bool,
        /// New, moved, or cut since the last placement.
        is_pending: bool,
    }

    impl SavedPivot {
        fn shows_same_output(&self, other: &SavedPivot) -> bool {
            self.sheet == other.sheet
                && self.anchor == other.anchor
                && self.rows == other.rows
                && self.cols == other.cols
                && self.cells == other.cells
        }
    }

    /// The saved output of every pivot that has one, in no particular order.
    /// Pivots without saved output show nothing here, so they take no entry.
    #[derive(Default)]
    pub(crate) struct SavedPivots {
        pivots: Vec<SavedPivot>,
    }

    impl SavedPivots {
        pub(crate) fn retained_bytes(&self) -> usize {
            size_of::<Self>()
                + self.pivots.capacity() * size_of::<SavedPivot>()
                + self
                    .pivots
                    .iter()
                    .map(|pivot| pivot.cells.capacity() * size_of::<Value>() + pivot.text_bytes)
                    .sum::<usize>()
        }
    }

    /// Reads the saved outputs of one sheet; see `setSavedPivots`.
    fn decode(
        sheet: usize,
        layout: &[u32],
        kinds: &[u8],
        numbers: &[f64],
        texts: &[&str],
    ) -> Option<Vec<SavedPivot>> {
        let (entries, rest) = layout.as_chunks::<LAYOUT_STRIDE>();
        if !rest.is_empty()
            || entries.len() > MAX_SAVED_PIVOTS_PER_SHEET
            || kinds.len() != numbers.len()
        {
            return None;
        }

        let mut pivots = Vec::with_capacity(entries.len());
        let mut cell = 0;
        let mut text = 0;
        for &[anchor_row, anchor_col, rows, cols] in entries {
            let anchor = (anchor_row, anchor_col);
            let size = (rows as usize).checked_mul(cols as usize)?;
            if size == 0 || size > MAX_PIVOT_OUTPUT_CELLS || size > kinds.len() - cell {
                return None;
            }

            let mut cells = Vec::with_capacity(size);
            let mut text_bytes = 0;
            for (&kind, &number) in kinds[cell..cell + size]
                .iter()
                .zip(&numbers[cell..cell + size])
            {
                cells.push(match kind {
                    CELL_BLANK => Value::Blank,
                    CELL_NUMBER if number.is_finite() => Value::number(number),
                    CELL_TEXT => {
                        let value = texts.get(text)?;
                        text += 1;
                        text_bytes += value.len();
                        Value::text(*value)
                    }
                    CELL_BOOL => Value::Bool(number != 0.0),
                    _ => return None,
                });
            }
            cell += size;
            pivots.push(SavedPivot {
                sheet,
                anchor,
                rows,
                cols,
                cells,
                text_bytes,
                attempt: None,
                is_installed: false,
                is_pending: true,
            });
        }
        (cell == kinds.len() && text == texts.len()).then_some(pivots)
    }

    #[wasm_bindgen]
    impl CellStore {
        /// Replaces the saved pivot output anchored on `sheet`. This engine
        /// computes no pivots: it shows output a file saved, from the anchor,
        /// at the next recalculation, and never recalculates it.
        ///
        /// - `layout`: per output `[anchorRow, anchorCol, rows, cols]`.
        /// - `kinds` and `numbers`: one entry per cell, row-major, output
        ///   after output. Kinds: 0 blank, 1 number, 2 text, 3 boolean
        ///   (`numbers` holds 0 or 1). Text cells take `numbers` 0.
        /// - `text` and `textLengths`: the text cells joined in order, and
        ///   each one's length in UTF-16 code units.
        ///
        /// An output that did not change stays installed. Returns `false`,
        /// changing nothing, for a malformed payload or a dead sheet.
        #[wasm_bindgen(js_name = setSavedPivots)]
        pub fn set_saved_pivots(
            &mut self,
            sheet: usize,
            layout: &[u32],
            kinds: &[u8],
            numbers: &[f64],
            text: String,
            text_lengths: &[u32],
        ) -> bool {
            if !self.sheet_alive.get(sheet).copied().unwrap_or(false) {
                return false;
            }
            let texts = utf16_slices(&text, text_lengths, text_lengths.len());
            let Some(incoming) = decode(sheet, layout, kinds, numbers, &texts) else {
                return false;
            };
            if incoming.is_empty() && self.pivots.is_none() {
                return true;
            }

            let mut registry = self.pivots.take().unwrap_or_default();
            let (mut previous, others): (Vec<_>, Vec<_>) = std::mem::take(&mut registry.pivots)
                .into_iter()
                .partition(|pivot| pivot.sheet == sheet);
            registry.pivots = others;
            for pivot in incoming {
                let same = previous
                    .iter()
                    .position(|old| old.shows_same_output(&pivot));
                match same {
                    Some(index) => registry.pivots.push(previous.swap_remove(index)),
                    None => {
                        self.sheets[sheet].formulas.mark_cell_dirty(pivot.anchor);
                        registry.pivots.push(pivot);
                    }
                }
            }
            for removed in previous {
                self.remove_pivot_output(sheet, removed.anchor);
            }

            self.pivots = (!registry.pivots.is_empty()).then_some(registry);
            true
        }
    }

    impl CellStore {
        /// Records, before a pass clears the dirty state of `sheets`, which
        /// saved outputs a write cut or a cleared blocker may now admit.
        pub(crate) fn capture_pivot_changes<I>(
            &mut self,
            sheets: I,
            _affected: Option<&FxHashSet<AbsCellKey>>,
        ) where
            I: IntoIterator<Item = usize>,
        {
            let Some(registry) = self.pivots.as_deref_mut() else {
                return;
            };
            for sheet in sheets {
                for pivot in registry
                    .pivots
                    .iter_mut()
                    .filter(|pivot| pivot.sheet == sheet)
                {
                    if let Some(attempt) = pivot.attempt {
                        pivot.is_pending |=
                            attempt_cut(&self.sheets[sheet], attempt, pivot.is_installed);
                    }
                }
            }
        }

        /// Places every pending saved output and recomputes the formulas that
        /// read the changed cells, round by round, until nothing changes.
        pub(crate) fn settle_pivots(&mut self) {
            for _ in 0..MAX_SETTLE_ROUNDS {
                let Some(mut registry) = self.pivots.take() else {
                    return;
                };
                let mut changed = Vec::new();
                for pivot in registry.pivots.iter_mut().filter(|pivot| pivot.is_pending) {
                    if self.place_saved_output(pivot) && !changed.contains(&pivot.sheet) {
                        changed.push(pivot.sheet);
                    }
                }
                self.pivots = Some(registry);
                if changed.is_empty() {
                    return;
                }
                self.recompute_formulas(&changed);
            }
        }

        fn place_saved_output(&mut self, pivot: &mut SavedPivot) -> bool {
            pivot.is_pending = false;
            pivot.is_installed = false;
            let (sheet, anchor) = (pivot.sheet, pivot.anchor);
            let Some(range) = SpillRange::new(anchor, pivot.rows as usize, pivot.cols as usize)
            else {
                let (changed, attempt) =
                    self.show_output_error(sheet, anchor, FormulaError::Num, None);
                pivot.attempt = attempt;
                return changed;
            };

            let cells = &pivot.cells;
            let (changed, placed) = self.place_pivot_output(sheet, range, |offset| &cells[offset]);
            pivot.attempt = Some(range);
            let vacated = self.mark_pivot_cells_dirty(sheet, changed);
            match placed {
                Ok(()) => {
                    pivot.is_installed = true;
                    vacated
                }
                Err(error) => {
                    let (shown, attempt) =
                        self.show_output_error(sheet, anchor, error, Some(range));
                    pivot.attempt = attempt;
                    shown || vacated
                }
            }
        }

        /// Moves saved outputs anchored on `sheet` with a row or column
        /// insert or delete, by the rule core uses. The edit cleared the
        /// sheet's spills, so they are placed again; core resends them and
        /// drops saved output the edit cut.
        pub(crate) fn shift_pivots(&mut self, sheet: usize, axis: ShiftAxis, at: u32, delta: i64) {
            let extent_after = match axis {
                ShiftAxis::Rows => self.sheets[sheet].cells.row_count(),
                ShiftAxis::Cols => self.sheets[sheet].cells.n_cols(),
            };
            let Some(registry) = self.pivots.as_deref_mut() else {
                return;
            };
            for pivot in registry
                .pivots
                .iter_mut()
                .filter(|pivot| pivot.sheet == sheet)
            {
                let coordinate = match axis {
                    ShiftAxis::Rows => &mut pivot.anchor.0,
                    ShiftAxis::Cols => &mut pivot.anchor.1,
                };
                *coordinate = shift_anchor(*coordinate, at, delta, extent_after);
                pivot.attempt = None;
                pivot.is_installed = false;
                pivot.is_pending = true;
            }
        }

        /// Drops the saved outputs of a removed sheet.
        pub(crate) fn forget_pivot_sheet(&mut self, sheet: usize) {
            let Some(registry) = self.pivots.as_deref_mut() else {
                return;
            };
            registry.pivots.retain(|pivot| pivot.sheet != sheet);
            if registry.pivots.is_empty() {
                self.pivots = None;
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use crate::types::KIND_EMPTY;

        /// One 2 × 2 saved output at `anchor`: `Label`, 10 / 20, 30.
        const KINDS: [u8; 4] = [CELL_TEXT, CELL_NUMBER, CELL_NUMBER, CELL_NUMBER];
        const NUMBERS: [f64; 4] = [0.0, 10.0, 20.0, 30.0];
        const LABEL: &str = "Label";

        fn install(store: &mut CellStore, sheet: usize, anchor: (u32, u32)) -> bool {
            let layout = [anchor.0, anchor.1, 2, 2];
            let lengths = [LABEL.len() as u32];
            store.set_saved_pivots(sheet, &layout, &KINDS, &NUMBERS, LABEL.into(), &lengths)
        }

        fn store_with_sheet() -> (CellStore, usize) {
            let mut store = CellStore::new();
            let sheet = store.add_sheet(6, 10);
            (store, sheet)
        }

        #[test]
        fn saved_output_feeds_formulas_and_survives_unrelated_edits() {
            let (mut store, sheet) = store_with_sheet();
            assert!(install(&mut store, sheet, (1, 1)));
            store.set_formula(sheet, 8, 0, "=SUM(B2:C3)", 0);
            store.recompute(sheet);
            assert_eq!(store.get_cell(sheet, 1, 1).string().as_deref(), Some(LABEL));
            assert_eq!(store.get_cell(sheet, 2, 2).num(), 30.0);
            assert_eq!(store.get_cell(sheet, 8, 0).num(), 60.0);

            store.set_number(sheet, 9, 5, 1.0, 0);
            store.recompute(sheet);
            assert_eq!(store.get_cell(sheet, 1, 2).num(), 10.0);
            assert_eq!(store.get_cell(sheet, 8, 0).num(), 60.0);
        }

        #[test]
        fn saved_output_on_a_formula_free_sheet_survives_an_edit() {
            let (mut store, sheet) = store_with_sheet();
            assert!(install(&mut store, sheet, (0, 0)));
            store.recompute(sheet);
            store.set_number(sheet, 9, 5, 1.0, 0);
            store.recompute(sheet);
            assert_eq!(store.get_cell(sheet, 0, 0).string().as_deref(), Some(LABEL));
            assert_eq!(store.get_cell(sheet, 1, 1).num(), 30.0);
        }

        #[test]
        fn blocked_saved_output_shows_spill_and_returns_when_cleared() {
            let (mut store, sheet) = store_with_sheet();
            store.set_number(sheet, 2, 2, 5.0, 0);
            assert!(install(&mut store, sheet, (1, 1)));
            store.recompute(sheet);
            assert_eq!(
                store.get_cell(sheet, 1, 1).string().as_deref(),
                Some("#SPILL!")
            );
            assert_eq!(store.get_cell(sheet, 2, 2).num(), 5.0);

            store.clear_cell(sheet, 2, 2, 0);
            store.recompute(sheet);
            assert_eq!(store.get_cell(sheet, 1, 1).string().as_deref(), Some(LABEL));
            assert_eq!(store.get_cell(sheet, 2, 2).num(), 30.0);
        }

        #[test]
        fn saved_output_moves_with_a_row_insert() {
            let (mut store, sheet) = store_with_sheet();
            assert!(install(&mut store, sheet, (1, 1)));
            store.recompute(sheet);
            store.add_rows(sheet, 0, 1);
            store.recompute(sheet);
            assert_eq!(store.get_cell(sheet, 2, 1).string().as_deref(), Some(LABEL));
            assert_eq!(store.get_cell(sheet, 3, 2).num(), 30.0);
        }

        #[test]
        fn removing_saved_output_clears_cells_and_frees_the_registry() {
            let (mut store, sheet) = store_with_sheet();
            assert!(store.set_saved_pivots(sheet, &[], &[], &[], String::new(), &[]));
            assert!(store.pivots.is_none(), "no saved output allocates nothing");

            assert!(install(&mut store, sheet, (1, 1)));
            store.recompute(sheet);
            assert!(store.set_saved_pivots(sheet, &[], &[], &[], String::new(), &[]));
            store.recompute(sheet);
            assert!(store.pivots.is_none());
            assert_eq!(store.get_cell(sheet, 1, 1).kind(), KIND_EMPTY);
            assert_eq!(store.get_cell(sheet, 2, 2).kind(), KIND_EMPTY);
        }

        #[test]
        fn malformed_saved_output_is_rejected() {
            let (mut store, sheet) = store_with_sheet();
            let lengths = [LABEL.len() as u32];
            let empty_axis = [1, 1, 0, 2];
            assert!(!store.set_saved_pivots(
                sheet,
                &empty_axis,
                &KINDS,
                &NUMBERS,
                LABEL.into(),
                &lengths
            ));
            let short = [1, 1, 2, 2];
            assert!(!store.set_saved_pivots(
                sheet,
                &short,
                &KINDS[..3],
                &NUMBERS[..3],
                LABEL.into(),
                &lengths
            ));
            assert!(store.pivots.is_none());
        }
    }
}
