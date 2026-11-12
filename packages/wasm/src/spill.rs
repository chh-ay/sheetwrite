//! Dynamic-array spill ownership for one sheet.
//!
//! [`SpillState`] records attempted spill ranges, the cells each installed
//! spill owns, and host-owned blockers. Spilled values themselves live in the
//! sheet's calculated slots, so every output write and removal goes through
//! [`CellStorage`]; this module decides which cells a spill may own.

use rustc_hash::FxHashMap;

#[cfg(any(target_arch = "wasm32", test))]
use crate::calc::SHEET_COLS;
use crate::cells::CellStorage;
use crate::graph::{DirtyRect, SheetFormulas};
use crate::memory::{StoreMemoryStats, SPILL_BLOCKERS, SPILL_OWNERS, SPILL_RANGES};
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};
use crate::types::{CellKey, FormulaError, KIND_EMPTY};

pub(crate) const MAX_SPILL_OWNER_CELLS: usize = 1_000_000;
const MAX_SPILL_OWNER_BYTES: usize = 64 * 1024 * 1024;
// Includes installed-owner metadata and its source-independent scalar overlay.
const SPILL_OWNER_ENTRY_BYTES: usize = 64;

pub(crate) fn spill_ownership_within_budget(owner_cells: usize) -> bool {
    owner_cells <= MAX_SPILL_OWNER_CELLS
        && owner_cells
            .checked_mul(SPILL_OWNER_ENTRY_BYTES)
            .is_some_and(|bytes| bytes <= MAX_SPILL_OWNER_BYTES)
}

/// What [`SpillState::vacate`] removed: the range a spill held and the value
/// each cell it owned held. The recalculation pass keeps one and reuses its
/// buffer for every anchor.
#[derive(Default)]
pub(crate) struct VacatedSpill {
    range: Option<SpillRange>,
    /// Row-major over `range`: a kept value, [`NOT_OWNED`] or [`NO_VALUE`].
    values: Vec<(u8, u64)>,
    owned_cells: usize,
}

/// A cell of the vacated range that the anchor did not own.
const NOT_OWNED: (u8, u64) = (u8::MAX, 0);
/// An owned cell that held no calculated value. Unlike [`NOT_OWNED`] it was
/// cleared, but like it, it never equals a written value.
const NO_VALUE: (u8, u64) = (u8::MAX, 1);

impl VacatedSpill {
    fn reset(&mut self, range: Option<SpillRange>) {
        self.range = range;
        self.owned_cells = 0;
        self.values.clear();
        if let Some(range) = range {
            self.values.resize(range.cells(), NOT_OWNED);
        }
    }

    fn offset(range: SpillRange, cell: CellKey) -> usize {
        (cell.0 - range.anchor.0) as usize * range.cols() + (cell.1 - range.anchor.1) as usize
    }

    fn keep(&mut self, cell: CellKey, value: Option<(u8, u64)>) {
        let Some(range) = self.range else {
            return;
        };
        if let Some(slot) = self.values.get_mut(Self::offset(range, cell)) {
            *slot = value.unwrap_or(NO_VALUE);
            self.owned_cells += 1;
        }
    }

    /// The value `cell` held as a reader saw it, or `None` (never equal to a
    /// stored value) when the vacated spill did not own it.
    fn value(&self, cell: CellKey) -> Option<(u8, u64)> {
        let range = self.range.filter(|range| range.contains(cell))?;
        let value = *self.values.get(Self::offset(range, cell))?;
        (value != NOT_OWNED && value != NO_VALUE).then_some(value)
    }

    /// The number of cells the vacated spill owned, its anchor excluded.
    pub(crate) const fn owned_cells(&self) -> usize {
        self.owned_cells
    }

    /// The vacated cells outside `installed`, the range the same anchor
    /// installed in their place: they were cleared and nothing was written
    /// back. All of them when nothing was installed.
    pub(crate) fn cleared_outside(&self, installed: Option<SpillRange>) -> Vec<CellKey> {
        let Some(range) = self.range else {
            return Vec::new();
        };
        debug_assert!(installed.is_none_or(|installed| installed.anchor == range.anchor));
        let mut cleared = Vec::new();
        let mut push_owned = |row: u32, first_col: u32| {
            for col in first_col..=range.col_end {
                let cell = (row, col);
                if self
                    .values
                    .get(Self::offset(range, cell))
                    .is_some_and(|&value| value != NOT_OWNED)
                {
                    cleared.push(cell);
                }
            }
        };
        // Both ranges start at the anchor, so the installed one covers the
        // leading rows and columns of the vacated one.
        let (kept_rows_end, kept_cols_end) = match installed {
            Some(installed) => (installed.row_end, installed.col_end),
            None => (range.anchor.0, range.anchor.1),
        };
        for row in range.anchor.0..=range.row_end {
            if installed.is_some() && row <= kept_rows_end {
                if kept_cols_end < range.col_end {
                    push_owned(row, kept_cols_end + 1);
                }
            } else {
                push_owned(row, range.anchor.1);
            }
        }
        cleared
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SpillRange {
    pub(crate) anchor: CellKey,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
}

impl SpillRange {
    pub(crate) fn new(anchor: CellKey, rows: usize, cols: usize) -> Option<Self> {
        if rows == 0 || cols == 0 {
            return None;
        }
        let row_end = anchor.0.checked_add(u32::try_from(rows - 1).ok()?)?;
        let col_end = anchor.1.checked_add(u32::try_from(cols - 1).ok()?)?;
        Some(Self {
            anchor,
            row_end,
            col_end,
        })
    }

    pub(crate) fn contains(self, cell: CellKey) -> bool {
        cell.0 >= self.anchor.0
            && cell.0 <= self.row_end
            && cell.1 >= self.anchor.1
            && cell.1 <= self.col_end
    }

    pub(crate) fn intersects(self, other: Self) -> bool {
        self.anchor.0 <= other.row_end
            && self.row_end >= other.anchor.0
            && self.anchor.1 <= other.col_end
            && self.col_end >= other.anchor.1
    }

    pub(crate) fn is_anchor_only(self) -> bool {
        self.row_end == self.anchor.0 && self.col_end == self.anchor.1
    }

    fn cols(self) -> usize {
        (self.col_end - self.anchor.1) as usize + 1
    }

    /// Cells the range covers, its anchor included.
    pub(crate) fn cells(self) -> usize {
        ((self.row_end - self.anchor.0) as usize + 1) * self.cols()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SpillBlocker {
    pub(crate) row_start: u32,
    pub(crate) col_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
}

impl SpillBlocker {
    /// A blocker that covers only the anchor leaves the formula's own cell free.
    fn obstructs(self, range: SpillRange) -> bool {
        let row_start = self.row_start.max(range.anchor.0);
        let col_start = self.col_start.max(range.anchor.1);
        let row_end = self.row_end.min(range.row_end);
        let col_end = self.col_end.min(range.col_end);

        row_start <= row_end
            && col_start <= col_end
            && !(row_start == range.anchor.0
                && row_end == range.anchor.0
                && col_start == range.anchor.1
                && col_end == range.anchor.1)
    }
}

/// One column's stretch of cells that one installed spill owns, or a vacated
/// stretch kept for reuse ([`OwnedRun::VACANT`]).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct OwnedRun {
    row_start: u32,
    row_end: u32,
    anchor: CellKey,
}

impl OwnedRun {
    /// The anchor of a run whose spill was cleared. A spill that comes back
    /// over the same rows takes the run again in place, so clearing and
    /// reinstalling a spill moves no other run.
    const VACANT: CellKey = (u32::MAX, u32::MAX);

    fn is_live(self) -> bool {
        self.anchor != Self::VACANT
    }

    const fn rows(self) -> usize {
        (self.row_end - self.row_start) as usize + 1
    }
}

/// The runs of one column that holds owned cells.
#[derive(Debug)]
struct ColumnRuns {
    col: u32,
    runs: Vec<OwnedRun>,
}

/// Vacated runs a sheet keeps beyond its live ones before
/// [`OwnerRuns::drop_vacant_runs`] drops them.
const VACANT_RUN_SLACK: usize = 64;

/// The cells installed spills own, by column (sorted, only columns that hold
/// runs): runs sorted by row that never overlap. A cell belongs to the live
/// run that covers it; a cell a source write detached is cut out of its run.
/// One run per column of a spill replaces one map entry per cell.
#[derive(Debug, Default)]
struct OwnerRuns {
    columns: Vec<ColumnRuns>,
    /// Cells the live runs cover, anchors included.
    owned_cells: usize,
    /// Vacated runs still in `columns`.
    vacant_runs: usize,
}

impl OwnerRuns {
    /// The anchor of the live run that covers `cell`.
    fn owner(&self, cell: CellKey) -> Option<CellKey> {
        let column = self.runs(cell.1)?;
        let after = column.partition_point(|run| run.row_start <= cell.0);
        let run = column.get(after.checked_sub(1)?)?;
        (run.is_live() && run.row_end >= cell.0).then_some(run.anchor)
    }

    /// Room for one more run in each column from `col_start` to `col_end`.
    fn reserve_runs(&mut self, col_start: u32, col_end: u32) -> bool {
        for col in col_start..=col_end {
            match self.columns.binary_search_by_key(&col, |column| column.col) {
                Ok(at) => {
                    let Some(column) = self.columns.get_mut(at) else {
                        return false;
                    };
                    if column.runs.try_reserve(1).is_err() {
                        return false;
                    }
                }
                Err(at) => {
                    let mut runs = Vec::new();
                    if runs.try_reserve(1).is_err() || self.columns.try_reserve(1).is_err() {
                        return false;
                    }
                    self.columns.insert(at, ColumnRuns { col, runs });
                }
            }
        }
        true
    }

    /// Gives `anchor` the rows from its own row to `row_end` in column `col`.
    /// A vacated run over exactly those rows is taken in place; otherwise the
    /// rows are cut from whatever covered them and a new run is inserted.
    fn own(&mut self, col: u32, anchor: CellKey, row_end: u32) {
        let row_start = anchor.0;
        let run = OwnedRun {
            row_start,
            row_end,
            anchor,
        };
        let Some(column) = runs_mut(&mut self.columns, col) else {
            return;
        };
        let at = column.partition_point(|other| other.row_start < row_start);
        if let Some(slot) = column.get_mut(at) {
            if !slot.is_live() && slot.row_start == row_start && slot.row_end == row_end {
                *slot = run;
                self.vacant_runs -= 1;
                self.owned_cells += run.rows();
                return;
            }
        }

        self.cut(col, row_start, row_end);
        let Some(column) = runs_mut(&mut self.columns, col) else {
            return;
        };
        let at = column.partition_point(|other| other.row_start < row_start);
        column.insert(at, run);
        self.owned_cells += run.rows();
    }

    /// Marks the runs of `anchor` in column `col` between `row_start` and
    /// `row_end` vacant.
    /// The runs of column `col` that meet rows `row_start..=row_end`.
    fn runs_meeting(&self, col: u32, row_start: u32, row_end: u32) -> &[OwnedRun] {
        let Some(column) = self.runs(col) else {
            return &[];
        };
        let first = column.partition_point(|run| run.row_end < row_start);
        let last = column.partition_point(|run| run.row_start <= row_end);
        column.get(first..last).unwrap_or_default()
    }

    /// Whether a live run owns any cell of `range`.
    fn owns_any_of(&self, range: SpillRange) -> bool {
        (range.anchor.1..=range.col_end).any(|col| {
            self.runs_meeting(col, range.anchor.0, range.row_end)
                .iter()
                .any(|run| run.is_live())
        })
    }

    fn vacate(&mut self, col: u32, anchor: CellKey, row_start: u32, row_end: u32) {
        let Some(column) = runs_mut(&mut self.columns, col) else {
            return;
        };
        let first = column.partition_point(|run| run.row_end < row_start);
        for run in column[first..]
            .iter_mut()
            .take_while(|run| run.row_start <= row_end)
        {
            if run.anchor == anchor {
                self.owned_cells -= run.rows();
                self.vacant_runs += 1;
                run.anchor = OwnedRun::VACANT;
            }
        }
    }

    /// Removes rows `row_start..=row_end` of column `col` from every run:
    /// live runs keep what lies outside them, vacated runs that meet them are
    /// dropped.
    fn cut(&mut self, col: u32, row_start: u32, row_end: u32) {
        let Some(column) = runs_mut(&mut self.columns, col) else {
            return;
        };
        let first = column.partition_point(|run| run.row_end < row_start);
        let last = column.partition_point(|run| run.row_start <= row_end);
        if first >= last {
            return;
        }

        let mut kept = Vec::new();
        for run in &column[first..last] {
            if !run.is_live() {
                self.vacant_runs -= 1;
                continue;
            }
            let cut_start = run.row_start.max(row_start);
            let cut_end = run.row_end.min(row_end);
            self.owned_cells -= (cut_end - cut_start) as usize + 1;
            if run.row_start < row_start {
                kept.push(OwnedRun {
                    row_end: row_start - 1,
                    ..*run
                });
            }
            if run.row_end > row_end {
                kept.push(OwnedRun {
                    row_start: row_end + 1,
                    ..*run
                });
            }
        }
        column.splice(first..last, kept);
    }

    /// Drops vacated runs once they outnumber the live ones by the slack.
    fn drop_vacant_runs(&mut self) {
        if self.vacant_runs > VACANT_RUN_SLACK && self.vacant_runs > self.live_runs() {
            for column in &mut self.columns {
                column.runs.retain(|run| run.is_live());
            }
            self.columns.retain(|column| !column.runs.is_empty());
            self.vacant_runs = 0;
        }
    }

    fn live_runs(&self) -> usize {
        self.columns
            .iter()
            .map(|column| column.runs.len())
            .sum::<usize>()
            - self.vacant_runs
    }

    fn runs(&self, col: u32) -> Option<&Vec<OwnedRun>> {
        let at = self
            .columns
            .binary_search_by_key(&col, |column| column.col)
            .ok()?;
        self.columns.get(at).map(|column| &column.runs)
    }
}

#[derive(Default)]
pub(crate) struct SpillState {
    /// Attempted spill bounds remain registered even while obstructed so clearing
    /// a blocker invalidates the owning anchor.
    ranges: FxHashMap<CellKey, SpillRange>,
    /// The cells installed spills own ([`OwnerRuns`]). Boxed and created by
    /// the first installed spill, so a sheet without spills keeps one
    /// pointer.
    owners: Option<Box<OwnerRuns>>,
    /// Host-owned merge/protection cells that a spill must never overwrite.
    blockers: Vec<SpillBlocker>,
}

impl SpillState {
    /// No attempted or installed spill, so a source write has nothing to
    /// detach and can skip every spill lookup.
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.ranges.is_empty() && self.owners.is_none()
    }

    pub(crate) fn owner_count(&self) -> usize {
        self.owners.as_ref().map_or(0, |owners| owners.owned_cells)
    }

    /// The anchor of the installed spill that owns `cell`.
    #[inline]
    pub(crate) fn owner(&self, cell: CellKey) -> Option<CellKey> {
        self.owners.as_deref()?.owner(cell)
    }

    /// The attempted range of `anchor`, installed or obstructed.
    pub(crate) fn attempt(&self, anchor: CellKey) -> Option<SpillRange> {
        self.ranges.get(&anchor).copied()
    }

    /// The range that `anchor` spills into. Attempts also keep blocked
    /// ranges; only an installed spill owns its anchor cell.
    pub(crate) fn installed(&self, anchor: CellKey) -> Option<SpillRange> {
        if self.owner(anchor) != Some(anchor) {
            return None;
        }
        self.attempt(anchor)
    }

    pub(crate) fn anchors(&self) -> impl Iterator<Item = CellKey> + '_ {
        self.ranges.keys().copied()
    }

    /// Visits each attempted anchor whose range contains any of `cells`, once.
    /// A changed cell inside a spill range invalidates that anchor, so the scan
    /// stops as soon as every range has been hit.
    pub(crate) fn for_each_anchor_covering<'a>(
        &self,
        cells: impl IntoIterator<Item = &'a CellKey>,
        mut visit: impl FnMut(CellKey),
    ) {
        if self.ranges.is_empty() {
            return;
        }

        let mut hit = vec![false; self.ranges.len()];
        let mut unhit_ranges = hit.len();

        for &cell in cells {
            for (range_index, range) in self.ranges.values().enumerate() {
                if !hit[range_index] && range.contains(cell) {
                    hit[range_index] = true;
                    unhit_ranges -= 1;
                }
            }

            if unhit_ranges == 0 {
                break;
            }
        }

        for (range_index, &anchor) in self.ranges.keys().enumerate() {
            if hit[range_index] {
                visit(anchor);
            }
        }
    }

    pub(crate) fn for_each_anchor_intersecting(
        &self,
        rects: &[DirtyRect],
        mut visit: impl FnMut(CellKey),
    ) {
        for (&anchor, range) in &self.ranges {
            let attempted = DirtyRect {
                row_start: anchor.0,
                col_start: anchor.1,
                row_end: range.row_end,
                col_end: range.col_end,
            };
            if rects.iter().any(|rect| rect.intersects(attempted)) {
                visit(anchor);
            }
        }
    }

    /// Detaching a rectangle in one pass keeps bulk writes independent of
    /// installed-spill count per destination cell.
    pub(crate) fn detach_rect(&mut self, rect: DirtyRect, cells: &mut CellStorage) -> Vec<CellKey> {
        let mut dirty = Vec::new();
        self.for_each_anchor_intersecting(&[rect], |anchor| dirty.push(anchor));

        // Every owned cell lies inside its anchor's attempted range, so no
        // matching attempt means no run has a cell in `rect` to detach.
        if dirty.is_empty() {
            return dirty;
        }

        let anchors_inside: Vec<_> = dirty
            .iter()
            .copied()
            .filter(|&anchor| rect.contains(anchor))
            .collect();
        for anchor in anchors_inside {
            dirty.extend(self.clear(anchor, cells));
            self.ranges.remove(&anchor);
        }
        if let Some(owners) = self.owners.as_deref_mut() {
            for col in rect.col_start..=rect.col_end {
                owners.cut(col, rect.row_start, rect.row_end);
            }
        }
        self.compact(cells);

        dirty
    }

    /// Other anchors whose attempted range intersects `vacated`, the range
    /// `anchor` just released: they may now be able to spill.
    pub(crate) fn anchors_colliding_with(
        &self,
        anchor: CellKey,
        vacated: SpillRange,
    ) -> Vec<CellKey> {
        self.ranges
            .iter()
            .filter(|&(&other, &attempt)| other != anchor && attempt.intersects(vacated))
            .map(|(&other, _)| other)
            .collect()
    }

    /// Whether a source rectangle can replace its spill cells without cutting
    /// an installed spill away from its anchor.
    pub(crate) fn admits_source_range(&self, r0: usize, c0: usize, r1: usize, c1: usize) -> bool {
        if self.owners.is_none() {
            return true;
        }

        for col in c0..=c1 {
            for row in r0..=r1 {
                if let Some((owner_row, owner_col)) = self.owner((row as u32, col as u32)) {
                    if (owner_row as usize) < r0
                        || (owner_row as usize) > r1
                        || (owner_col as usize) < c0
                        || (owner_col as usize) > c1
                    {
                        return false;
                    }
                }
            }
        }

        true
    }

    /// Replaces the host blockers, reporting whether they changed.
    pub(crate) fn set_blockers(&mut self, blockers: Vec<SpillBlocker>) -> bool {
        if self.blockers == blockers {
            return false;
        }
        self.blockers = blockers;
        true
    }

    /// Removes only cells still owned by `anchor`; a user-written obstruction
    /// that detached from the spill remains untouched. Returns the non-anchor
    /// cells whose calculated value was removed.
    pub(crate) fn clear(&mut self, anchor: CellKey, cells: &mut CellStorage) -> Vec<CellKey> {
        let mut changed = Vec::new();
        self.clear_each::<false>(anchor, cells, |cell, _| changed.push(cell));
        changed
    }

    /// [`Self::clear`] of the spill `anchor` has installed, keeping in
    /// `vacated` the range and the value each removed cell held, so that
    /// [`Self::reinstall`] reports only the cells whose value changes. Returns
    /// the vacated range: `None` when `anchor` had no spill installed, which
    /// also empties `vacated`.
    pub(crate) fn vacate(
        &mut self,
        anchor: CellKey,
        cells: &mut CellStorage,
        vacated: &mut VacatedSpill,
    ) -> Option<SpillRange> {
        let range = self.installed(anchor);
        vacated.reset(range);
        if range.is_some() {
            self.clear_each::<true>(anchor, cells, |cell, value| vacated.keep(cell, value));
        }
        range
    }

    /// `KEEP_VALUES` reads each value before removing it; other clears skip
    /// that lookup, which costs a hash probe per cell on paged sheets.
    fn clear_each<const KEEP_VALUES: bool>(
        &mut self,
        anchor: CellKey,
        cells: &mut CellStorage,
        mut removed: impl FnMut(CellKey, Option<(u8, u64)>),
    ) {
        if self.owner(anchor) != Some(anchor) {
            return;
        }
        let Some(range) = self.attempt(anchor) else {
            return;
        };

        let mut remove = |cell: CellKey| {
            if cell == anchor || !cells.contains_cell(cell.0 as usize, cell.1 as usize) {
                return;
            }
            let index = cells.idx(cell.0 as usize, cell.1 as usize);
            let value = if KEEP_VALUES {
                cells.calculated_cell_at(index)
            } else {
                None
            };
            cells.remove_calculated(index);
            removed(cell, value);
        };
        match self.owners.as_deref() {
            // A one-column spill reads its own runs in row order, which is
            // also the row-major order its cells were written in.
            Some(owners) if range.anchor.1 == range.col_end => {
                let col = range.anchor.1;
                for run in owners.runs_meeting(col, range.anchor.0, range.row_end) {
                    if run.anchor != anchor {
                        continue;
                    }
                    for row in run.row_start.max(range.anchor.0)..=run.row_end.min(range.row_end) {
                        remove((row, col));
                    }
                }
            }
            _ => {
                for row in range.anchor.0..=range.row_end {
                    for col in range.anchor.1..=range.col_end {
                        if self.owner((row, col)) == Some(anchor) {
                            remove((row, col));
                        }
                    }
                }
            }
        }
        if let Some(owners) = self.owners.as_deref_mut() {
            for col in range.anchor.1..=range.col_end {
                owners.vacate(col, anchor, range.anchor.0, range.row_end);
            }
        }
    }

    /// Clears every spill and forgets every attempt. Returns the cleared cells.
    pub(crate) fn clear_all(&mut self, cells: &mut CellStorage) -> Vec<CellKey> {
        let anchors: Vec<CellKey> = self.anchors().collect();
        let mut changed = Vec::new();
        for anchor in anchors {
            changed.extend(self.clear(anchor, cells));
        }
        self.ranges.clear();
        self.compact(cells);
        changed
    }

    /// Detaches a direct source write at `cell` from any spill. Returns the
    /// cells that must recompute: output cleared from a spill anchored at
    /// `cell`, then every anchor whose attempted range includes `cell`.
    pub(crate) fn detach_source(&mut self, cell: CellKey, cells: &mut CellStorage) -> Vec<CellKey> {
        if self.is_empty() {
            return Vec::new();
        }

        let affected: Vec<CellKey> = self
            .ranges
            .iter()
            .filter_map(|(&anchor, &range)| range.contains(cell).then_some(anchor))
            .collect();

        let mut dirty = if self.ranges.contains_key(&cell) {
            let changed = self.clear(cell, cells);
            self.ranges.remove(&cell);
            changed
        } else {
            if let Some(owners) = self.owners.as_deref_mut() {
                owners.cut(cell.1, cell.0, cell.0);
            }
            Vec::new()
        };

        self.compact(cells);
        dirty.extend(affected);
        dirty
    }

    /// Forgets the attempt of an anchor whose formula no longer spills.
    pub(crate) fn forget(&mut self, anchor: CellKey, cells: &mut CellStorage) {
        self.ranges.remove(&anchor);
        self.compact(cells);
    }

    /// Registers `range` as `anchor`'s attempt without filling it. A pivot
    /// whose anchor shows an error keeps its anchor cell registered, so the
    /// error is spill state that a write there detaches.
    pub(crate) fn register_attempt(&mut self, range: SpillRange) {
        self.ranges.insert(range.anchor, range);
    }

    /// Registers `range` as `anchor`'s attempt and checks that every
    /// destination is inside the sheet, unblocked, loaded and empty. An
    /// obstructed attempt stays registered so clearing the obstruction
    /// invalidates the anchor.
    pub(crate) fn admit(
        &mut self,
        range: SpillRange,
        cells: &mut CellStorage,
        formulas: &SheetFormulas,
    ) -> Result<(), FormulaError> {
        self.ranges.insert(range.anchor, range);
        let admitted = self.collision(range, cells, formulas);
        if admitted.is_err() {
            self.compact(cells);
        }
        admitted
    }

    fn collision(
        &self,
        range: SpillRange,
        cells: &CellStorage,
        formulas: &SheetFormulas,
    ) -> Result<(), FormulaError> {
        if range.row_end as usize >= cells.row_count() || range.col_end as usize >= cells.n_cols() {
            return Err(FormulaError::Spill);
        }

        if self.blockers.iter().any(|blocker| blocker.obstructs(range)) {
            return Err(FormulaError::Spill);
        }

        // Most destinations meet no installed spill; only then is each cell's
        // owner looked up.
        let owned = self
            .owners
            .as_deref()
            .is_some_and(|owners| owners.owns_any_of(range));
        for row in range.anchor.0..=range.row_end {
            for col in range.anchor.1..=range.col_end {
                let cell = (row, col);

                if cell == range.anchor {
                    continue;
                }

                if !cells.is_loaded(row as usize, col as usize) {
                    return Err(FormulaError::Loading);
                }

                let index = cells.idx(row as usize, col as usize);
                if (owned && self.owner(cell).is_some())
                    || formulas.contains(cell)
                    || cells.source_kind_at(index) != KIND_EMPTY
                {
                    return Err(FormulaError::Spill);
                }
            }
        }
        Ok(())
    }

    /// Reserves run and calculated-slot room for every output of `range`.
    /// Failure leaves the attempt registered and compacts what was reserved.
    pub(crate) fn reserve(&mut self, range: SpillRange, cells: &mut CellStorage) -> bool {
        let reserved = self
            .owners
            .get_or_insert_with(Box::default)
            .reserve_runs(range.anchor.1, range.col_end)
            && cells.reserve_derived(
                range.anchor.0 as usize,
                range.anchor.1 as usize,
                range.row_end as usize,
                range.col_end as usize,
            );

        if !reserved {
            self.compact(cells);
        }

        reserved
    }

    /// Installs an admitted, reserved `range`: every cell becomes owned by the
    /// anchor, and each non-anchor cell receives `value_at(offset)`, where
    /// `offset` is its row-major position in the range. The anchor's own value
    /// is the formula result and is stored by the caller. Returns the
    /// non-anchor cells written.
    pub(crate) fn install(
        &mut self,
        range: SpillRange,
        cells: &mut CellStorage,
        mut value_at: impl FnMut(usize) -> (u8, u64),
    ) -> Vec<CellKey> {
        let anchor = range.anchor;
        let cols = range.cols();
        let rows = (range.row_end - anchor.0) as usize + 1;
        let mut changed = Vec::with_capacity((rows * cols).saturating_sub(1));

        let owners = self.owners.get_or_insert_with(Box::default);
        for col in anchor.1..=range.col_end {
            owners.own(col, anchor, range.row_end);
        }
        for row_offset in 0..rows {
            for col_offset in 0..cols {
                let cell = (anchor.0 + row_offset as u32, anchor.1 + col_offset as u32);
                if cell == anchor {
                    continue;
                }

                let (kind, payload) = value_at(row_offset * cols + col_offset);
                let index = cells.idx(cell.0 as usize, cell.1 as usize);
                cells.set_derived(index, kind, payload);
                changed.push(cell);
            }
        }

        self.compact(cells);
        changed
    }

    /// [`Self::install`] for an anchor whose previous spill [`Self::vacate`]
    /// kept in `vacated`. Returns only the non-anchor cells whose value
    /// differs from what they held in `vacated`: cells outside its range, and
    /// cells it did not own, always count as changed. A first install keeps
    /// [`Self::install`]'s loop, which compares nothing.
    pub(crate) fn reinstall(
        &mut self,
        range: SpillRange,
        cells: &mut CellStorage,
        vacated: &VacatedSpill,
        mut value_at: impl FnMut(usize) -> (u8, u64),
    ) -> Vec<CellKey> {
        let anchor = range.anchor;
        let cols = range.cols();
        let rows = (range.row_end - anchor.0) as usize + 1;
        let mut changed = Vec::new();

        let owners = self.owners.get_or_insert_with(Box::default);
        for col in anchor.1..=range.col_end {
            owners.own(col, anchor, range.row_end);
        }
        for row_offset in 0..rows {
            for col_offset in 0..cols {
                let cell = (anchor.0 + row_offset as u32, anchor.1 + col_offset as u32);
                if cell == anchor {
                    continue;
                }

                let (kind, payload) = value_at(row_offset * cols + col_offset);
                let index = cells.idx(cell.0 as usize, cell.1 as usize);
                cells.set_derived(index, kind, payload);
                // Compared as stored, as a reader sees the cell.
                if vacated.value(cell) != cells.calculated_cell_at(index) {
                    changed.push(cell);
                }
            }
        }

        self.compact(cells);
        changed
    }

    /// Releases run storage after spills shrink, and empty calculated chunks.
    pub(crate) fn compact(&mut self, cells: &mut CellStorage) {
        if self
            .owners
            .as_ref()
            .is_some_and(|owners| owners.owned_cells == 0)
        {
            self.owners = None;
        } else if let Some(owners) = self.owners.as_deref_mut() {
            owners.drop_vacant_runs();
        }
        cells.compact_calculated();
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        stats
            .owner_mut(SPILL_RANGES)
            .add_hash_table::<CellKey, SpillRange>(self.ranges.len(), self.ranges.capacity());
        if let Some(runs) = self.owners.as_deref() {
            let owners = stats.owner_mut(SPILL_OWNERS);
            owners.add_vec::<OwnerRuns>(1, 1);
            owners.add_vec::<ColumnRuns>(runs.columns.len(), runs.columns.capacity());
            for column in &runs.columns {
                owners.add_vec::<OwnedRun>(column.runs.len(), column.runs.capacity());
            }
        }
        stats
            .owner_mut(SPILL_BLOCKERS)
            .add_vec::<SpillBlocker>(self.blockers.len(), self.blockers.capacity());
    }

    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        out.usize(self.ranges.len());
        for (&(row, col), range) in &self.ranges {
            out.u32(row);
            out.u32(col);
            out.u32(range.anchor.0);
            out.u32(range.anchor.1);
            out.u32(range.row_end);
            out.u32(range.col_end);
        }

        let live = self
            .owners
            .iter()
            .flat_map(|owners| owners.columns.iter())
            .flat_map(|column| column.runs.iter().map(move |run| (column.col, run)))
            .filter(|(_, run)| run.is_live());
        out.usize(live.clone().count());
        for (col, run) in live {
            out.u32(col);
            out.u32(run.row_start);
            out.u32(run.row_end);
            out.u32(run.anchor.0);
            out.u32(run.anchor.1);
        }

        out.usize(self.blockers.len());
        for blocker in &self.blockers {
            out.u32(blocker.row_start);
            out.u32(blocker.col_start);
            out.u32(blocker.row_end);
            out.u32(blocker.col_end);
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let mut state = Self::default();

        for _ in 0..input.count()? {
            let key = (input.u32()?, input.u32()?);
            let range = SpillRange {
                anchor: (input.u32()?, input.u32()?),
                row_end: input.u32()?,
                col_end: input.u32()?,
            };
            state.ranges.insert(key, range);
        }

        for _ in 0..input.count()? {
            let col = input.u32()?;
            let run = OwnedRun {
                row_start: input.u32()?,
                row_end: input.u32()?,
                anchor: (input.u32()?, input.u32()?),
            };
            // Columns and their runs were written in order; anything else
            // would break the binary searches.
            let owners = state.owners.get_or_insert_with(Box::default);
            let in_order = match owners.columns.last() {
                Some(last) if last.col == col => last
                    .runs
                    .last()
                    .is_none_or(|previous| previous.row_end < run.row_start),
                Some(last) => last.col < col,
                None => true,
            };
            if !in_order || run.row_end < run.row_start || !run.is_live() || col >= SHEET_COLS {
                return Err("invalid spill ownership transfer".into());
            }
            match owners.columns.last_mut() {
                Some(last) if last.col == col => last.runs.push(run),
                _ => owners.columns.push(ColumnRuns {
                    col,
                    runs: vec![run],
                }),
            }
            owners.owned_cells += run.rows();
        }

        for _ in 0..input.count()? {
            state.blockers.push(SpillBlocker {
                row_start: input.u32()?,
                col_start: input.u32()?,
                row_end: input.u32()?,
                col_end: input.u32()?,
            });
        }

        Ok(state)
    }
}

/// The runs of column `col`, if it has any.
fn runs_mut(columns: &mut [ColumnRuns], col: u32) -> Option<&mut Vec<OwnedRun>> {
    let at = columns
        .binary_search_by_key(&col, |column| column.col)
        .ok()?;
    columns.get_mut(at).map(|column| &mut column.runs)
}

#[cfg(test)]
mod tests {
    use crate::store::CellStore;

    fn anchor(store: &CellStore, sheet: usize, row: usize, col: usize) -> (u32, u32) {
        (
            store.spill_anchor_row(sheet, row, col),
            store.spill_anchor_col(sheet, row, col),
        )
    }

    const NONE: (u32, u32) = (u32::MAX, u32::MAX);

    /// Each of the stacked spills owns exactly its first `height` rows.
    fn assert_stacked_heights(store: &CellStore, sheet: usize, height: u32) {
        for anchor_row in [0u32, 5, 10, 15] {
            for row in anchor_row..anchor_row + 4 {
                let expected = if row < anchor_row + height {
                    (anchor_row, 0)
                } else {
                    NONE
                };
                assert_eq!(anchor(store, sheet, row as usize, 0), expected);
            }
        }
    }

    /// Spills stacked in one column own disjoint runs. One that shrinks and
    /// grows back takes its vacated run again, and its neighbours keep theirs;
    /// one that grows into a neighbour is obstructed and owns nothing.
    #[test]
    fn stacked_spills_in_one_column_own_their_own_runs() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(5, 40);
        store.set_number(sheet, 0, 2, 3.0, 0);
        for row in 0..20 {
            store.set_number(sheet, row, 4, (row + 1) as f64, 0);
        }
        // TAKE over a bounded range has a known largest shape, so every
        // anchor can spill in the same pass.
        for anchor_row in [0, 5, 10, 15] {
            store.set_formula(sheet, anchor_row, 0, "=TAKE($E$1:$E$20,$C$1)", 0);
        }
        store.recompute(sheet);
        assert_stacked_heights(&store, sheet, 3);

        for height in [2, 3, 2, 3] {
            store.set_number(sheet, 0, 2, f64::from(height), 0);
            store.recompute(sheet);
            assert_stacked_heights(&store, sheet, height);
        }

        store.set_number(sheet, 0, 2, 7.0, 0);
        store.recompute(sheet);
        for anchor_row in [0usize, 5, 10] {
            let cell = store.get_cell(sheet, anchor_row, 0);
            assert_eq!(cell.string().as_deref(), Some("#SPILL!"));
            assert_eq!(anchor(&store, sheet, anchor_row + 1, 0), NONE);
        }
        assert_eq!(anchor(&store, sheet, 21, 0), (15, 0));
    }

    /// A rectangle written over part of a wide spill detaches those cells and
    /// obstructs the spill; clearing them lets it spill again over every
    /// column.
    #[test]
    fn writes_over_part_of_a_wide_spill_detach_and_clear_restores_it() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 20);
        store.set_formula(sheet, 0, 0, "=SEQUENCE(10,4)", 0);
        store.recompute(sheet);
        assert_eq!(anchor(&store, sheet, 9, 3), (0, 0));

        store.set_number(sheet, 4, 2, 1.0, 0);
        store.recompute(sheet);
        assert_eq!(
            store.get_cell(sheet, 0, 0).string().as_deref(),
            Some("#SPILL!")
        );
        for (row, col) in [(0, 1), (3, 2), (5, 2), (9, 3)] {
            assert_eq!(anchor(&store, sheet, row, col), NONE);
        }

        store.clear_cell(sheet, 4, 2, 0);
        store.recompute(sheet);
        for row in 0..10 {
            for col in 0..4 {
                assert_eq!(anchor(&store, sheet, row, col), (0, 0), "{row},{col}");
            }
        }
        assert_eq!(store.get_cell(sheet, 9, 3).num(), 40.0);
    }

    /// Formula evaluations that `recalculate` runs.
    fn evaluations(recalculate: impl FnOnce()) -> usize {
        crate::eval::FORMULA_EVALUATIONS.with(|count| count.set(0));
        recalculate();
        crate::eval::FORMULA_EVALUATIONS.with(std::cell::Cell::get)
    }

    /// A spill that grows or shrinks by a row keeps the values of the rows it
    /// still covers, so only the anchor, its readers and the readers of the
    /// gained or released cell recalculate; the others keep their results.
    #[test]
    fn a_resized_spill_wakes_only_readers_of_changed_cells() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 8);
        for row in 0..6 {
            store.set_number(sheet, row, 0, (row + 1) as f64, 0);
            store.set_bool(sheet, row, 1, row < 5, 0);
            store.set_formula(sheet, row, 3, &format!("=C{}*2", row + 1), 0);
        }
        store.set_formula(sheet, 0, 2, "=FILTER(A1:A6,B1:B6)", 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 5, 3).num(), 0.0);

        // The anchor and D1, which reads it, then D6, which reads the gained cell.
        store.set_bool(sheet, 5, 1, true, 0);
        assert_eq!(evaluations(|| store.recompute(sheet)), 3);
        assert_eq!(anchor(&store, sheet, 5, 2), (0, 2));
        assert_eq!(store.get_cell(sheet, 5, 3).num(), 12.0);
        assert_eq!(store.get_cell(sheet, 4, 3).num(), 10.0);

        store.set_bool(sheet, 5, 1, false, 0);
        assert_eq!(evaluations(|| store.recompute(sheet)), 3);
        assert_eq!(anchor(&store, sheet, 5, 2), NONE);
        assert_eq!(store.get_cell(sheet, 5, 3).num(), 0.0);
        assert_eq!(store.get_cell(sheet, 4, 3).num(), 10.0);
    }

    const ORACLE_ROWS: usize = 12;

    /// A sheet whose spills read `values` and `kept`, with readers of every
    /// spilled cell and of each whole spill.
    fn oracle_sheet(values: &[f64], kept: &[bool]) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(8, ORACLE_ROWS + 2);
        for row in 0..ORACLE_ROWS {
            store.set_number(sheet, row, 0, values[row], 0);
            store.set_bool(sheet, row, 1, kept[row], 0);
            store.set_formula(sheet, row, 3, &format!("=C{}*2", row + 1), 0);
            store.set_formula(sheet, row, 7, &format!("=F{}+1", row + 1), 0);
        }
        store.set_formula(sheet, 0, 2, "=FILTER(A1:A12,B1:B12,0)", 0);
        store.set_formula(sheet, 0, 4, "=SUM(C1#)", 0);
        store.set_formula(sheet, 0, 5, "=SORT(FILTER(A1:B12,B1:B12,0),1,-1)", 0);
        store.recompute(sheet);
        (store, sheet)
    }

    /// After each edit, an incrementally recalculated sheet shows exactly
    /// what a sheet built from the same inputs and calculated once shows: a
    /// spill reinstalled over the same, a larger or a smaller range wakes
    /// every formula whose input changed.
    #[test]
    fn incremental_spill_changes_match_a_fresh_calculation() {
        let mut values: Vec<f64> = (0..ORACLE_ROWS).map(|row| (row % 4) as f64).collect();
        let mut kept: Vec<bool> = (0..ORACLE_ROWS).map(|row| row % 3 != 0).collect();
        let (mut store, sheet) = oracle_sheet(&values, &kept);
        let mut seed = 0x2545_f491_u32;
        for step in 0..300 {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            let row = seed as usize % ORACLE_ROWS;
            if seed & 0x100 == 0 {
                kept[row] = !kept[row];
                store.set_bool(sheet, row, 1, kept[row], 0);
            } else {
                values[row] = ((seed >> 9) % 5) as f64;
                store.set_number(sheet, row, 0, values[row], 0);
            }
            store.recompute(sheet);

            let (fresh, fresh_sheet) = oracle_sheet(&values, &kept);
            for row in 0..ORACLE_ROWS + 2 {
                for col in 2..8 {
                    let incremental = store.get_cell(sheet, row, col);
                    let expected = fresh.get_cell(fresh_sheet, row, col);
                    assert_eq!(
                        (incremental.kind(), incremental.num(), incremental.string()),
                        (expected.kind(), expected.num(), expected.string()),
                        "step {step}, cell {row},{col}"
                    );
                }
            }
        }
    }
}
