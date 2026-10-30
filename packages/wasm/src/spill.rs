//! Dynamic-array spill ownership for one sheet.
//!
//! [`SpillState`] records attempted spill ranges, the cells each installed
//! spill owns, and host-owned blockers. Spilled values themselves live in the
//! sheet's calculated slots, so every output write and removal goes through
//! [`CellStorage`]; this module decides which cells a spill may own.

use rustc_hash::FxHashMap;

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
/// Owner maps keep this much slack before shrinking, so a spill that grows and
/// shrinks by a few rows does not reallocate on every pass.
const OWNER_SLACK_CELLS: usize = 4096;

pub(crate) fn spill_ownership_within_budget(owner_cells: usize) -> bool {
    owner_cells <= MAX_SPILL_OWNER_CELLS
        && owner_cells
            .checked_mul(SPILL_OWNER_ENTRY_BYTES)
            .is_some_and(|bytes| bytes <= MAX_SPILL_OWNER_BYTES)
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

    fn cols(self) -> usize {
        (self.col_end - self.anchor.1) as usize + 1
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

#[derive(Default)]
pub(crate) struct SpillState {
    /// Attempted spill bounds remain registered even while obstructed so clearing
    /// a blocker invalidates the owning anchor.
    ranges: FxHashMap<CellKey, SpillRange>,
    /// Every currently materialized spill cell (including its anchor) to its owner.
    owners: FxHashMap<CellKey, CellKey>,
    /// Host-owned merge/protection cells that a spill must never overwrite.
    blockers: Vec<SpillBlocker>,
}

impl SpillState {
    /// No attempted or installed spill, so a source write has nothing to
    /// detach and can skip every spill hash probe.
    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        self.ranges.is_empty() && self.owners.is_empty()
    }

    #[inline]
    pub(crate) fn has_owners(&self) -> bool {
        !self.owners.is_empty()
    }

    pub(crate) fn owner_count(&self) -> usize {
        self.owners.len()
    }

    #[inline]
    pub(crate) fn owner(&self, cell: CellKey) -> Option<CellKey> {
        self.owners.get(&cell).copied()
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

        // Every owner lies inside its anchor's attempted range, so no matching
        // attempt means the owner map has nothing in `rect` to detach.
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
        self.owners.retain(|&cell, _| !rect.contains(cell));
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
        if self.owners.is_empty() {
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
        if self.owner(anchor) != Some(anchor) {
            return Vec::new();
        }
        let Some(range) = self.attempt(anchor) else {
            return Vec::new();
        };

        let mut changed = Vec::new();
        for row in range.anchor.0..=range.row_end {
            for col in range.anchor.1..=range.col_end {
                let cell = (row, col);
                if self.owner(cell) != Some(anchor) {
                    continue;
                }
                self.owners.remove(&cell);
                if cell == anchor || !cells.contains_cell(row as usize, col as usize) {
                    continue;
                }
                cells.remove_calculated(cells.idx(row as usize, col as usize));
                changed.push(cell);
            }
        }
        changed
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
            self.owners.remove(&cell);
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
                if self.owners.contains_key(&cell)
                    || formulas.contains(cell)
                    || cells.source_kind_at(index) != KIND_EMPTY
                {
                    return Err(FormulaError::Spill);
                }
            }
        }
        Ok(())
    }

    /// Reserves owner and calculated-slot room for `cells_needed` outputs.
    /// Failure leaves the attempt registered and compacts what was reserved.
    pub(crate) fn reserve(&mut self, cells_needed: usize, cells: &mut CellStorage) -> bool {
        if self.owners.try_reserve(cells_needed).is_err() || !cells.reserve_derived(cells_needed) {
            self.compact(cells);
            return false;
        }
        true
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

        for row_offset in 0..rows {
            for col_offset in 0..cols {
                let cell = (anchor.0 + row_offset as u32, anchor.1 + col_offset as u32);
                self.owners.insert(cell, anchor);
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

    /// Releases owner-map slack and empty calculated chunks after spills shrink.
    pub(crate) fn compact(&mut self, cells: &mut CellStorage) {
        if self.owners.is_empty() {
            self.owners = FxHashMap::default();
        } else if self.owners.capacity() > self.owners.len().saturating_mul(2)
            && self.owners.capacity().saturating_sub(self.owners.len()) > OWNER_SLACK_CELLS
        {
            self.owners.shrink_to_fit();
        }
        cells.compact_calculated();
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        stats
            .owner_mut(SPILL_RANGES)
            .add_hash_table::<CellKey, SpillRange>(self.ranges.len(), self.ranges.capacity());
        stats
            .owner_mut(SPILL_OWNERS)
            .add_hash_table::<CellKey, CellKey>(self.owners.len(), self.owners.capacity());
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

        out.usize(self.owners.len());
        for (&(row, col), &(anchor_row, anchor_col)) in &self.owners {
            out.u32(row);
            out.u32(col);
            out.u32(anchor_row);
            out.u32(anchor_col);
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
            state
                .owners
                .insert((input.u32()?, input.u32()?), (input.u32()?, input.u32()?));
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
