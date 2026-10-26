//! One sheet's column-major scalar grid and its structural edits.

use crate::calc::Ast;
use crate::cells::CellStorage;
use crate::graph::SheetFormulas;
use crate::memory::{
    StoreMemoryStats, SHEET_INDEXES_METADATA, SPILL_BLOCKERS, SPILL_OWNERS, SPILL_RANGES,
};
use crate::types::{CellKey, FormulaEntry, FormulaError};
use rustc_hash::FxHashMap;

mod transfer;

/// One conditional-format predicate, mirroring the host's rule kinds. String
/// needles for case-insensitive `Contains` are pre-lowercased at rule-set time;
/// formula ASTs are parsed once and translated from their stored anchor per cell.
pub(crate) enum CondPred {
    GtNum(f64),
    LtNum(f64),
    EqNum(f64),
    EqStr(String),
    EqEmpty,
    Contains {
        needle: String,
        match_case: bool,
    },
    Formula {
        ast: Ast,
        anchor_row: u32,
        anchor_col: u32,
    },
}

/// One conditional-format rule: a normalized cell rectangle plus a predicate.
/// The window read reports per-cell matches as a bitmask (rule index = bit),
/// so the host merges styles only for matched cells; predicates evaluate here,
/// where the cell data lives.
pub(crate) struct CondRule {
    pub(crate) r0: u32,
    pub(crate) c0: u32,
    pub(crate) r1: u32,
    pub(crate) c1: u32,
    pub(crate) pred: CondPred,
    pub(crate) stop_if_true: bool,
}

pub(crate) const MAX_SPILL_OWNER_CELLS: usize = 1_000_000;
pub(crate) const MAX_SPILL_OWNER_BYTES: usize = 64 * 1024 * 1024;
// Includes installed-owner metadata and its source-independent scalar overlay.
const SPILL_OWNER_ENTRY_BYTES: usize = 64;

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
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SpillBlocker {
    pub(crate) row_start: u32,
    pub(crate) col_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
}

/// One sheet's column-major scalar grid.
pub(crate) struct SheetData {
    pub(crate) cells: CellStorage,
    /// Formula source and dependency metadata, independent of calculated payloads.
    pub(crate) formulas: SheetFormulas,
    /// Attempted spill bounds remain registered even while obstructed so clearing
    /// a blocker invalidates the owning anchor.
    pub(crate) spill_ranges: FxHashMap<CellKey, SpillRange>,
    /// Every currently materialized spill cell (including its anchor) to its owner.
    pub(crate) spill_owners: FxHashMap<CellKey, CellKey>,
    /// Host-owned merge/protection cells that a spill must never overwrite.
    pub(crate) spill_blockers: Vec<SpillBlocker>,
    /// Conditional-format rules, synced from the host; evaluated per window.
    pub(crate) cond_rules: Vec<CondRule>,
}

impl SheetData {
    pub(crate) fn new(n_cols: usize, row_count: usize) -> Self {
        Self::try_new(n_cols, row_count).expect("trusted dense sheet dimensions")
    }

    pub(crate) fn try_new(n_cols: usize, row_count: usize) -> Result<Self, String> {
        Ok(Self {
            cells: CellStorage::try_new(n_cols, row_count)?,
            formulas: SheetFormulas::default(),
            spill_ranges: FxHashMap::default(),
            spill_owners: FxHashMap::default(),
            spill_blockers: Vec::new(),
            cond_rules: Vec::new(),
        })
    }

    pub(crate) fn new_paged(
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> Self {
        Self {
            cells: CellStorage::new_paged(
                n_cols,
                row_count,
                chunk_rows,
                byte_budget,
                max_dirty_cells,
            ),
            formulas: SheetFormulas::default(),
            spill_ranges: FxHashMap::default(),
            spill_owners: FxHashMap::default(),
            spill_blockers: Vec::new(),
            cond_rules: Vec::new(),
        }
    }

    pub(crate) fn persisted_coordinates(&self) -> Vec<CellKey> {
        let mut coordinates = self.cells.persisted_coordinates();
        coordinates.extend(self.formulas.keys());
        coordinates.sort_unstable();
        coordinates.dedup();
        coordinates
    }

    pub(crate) fn invalidate_calculations(&mut self) {
        // Whole-sheet recalculation makes per-output teardown unnecessary.
        self.spill_ranges.clear();
        self.spill_owners = FxHashMap::default();
        self.cells.invalidate_derived();
        self.formulas.mark_all_dirty();
    }

    #[inline]
    pub(crate) fn write_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        dirty_revision: Option<u64>,
    ) -> bool {
        if let Some(revision) = dirty_revision {
            if !self.cells.prepare_dirty_cells(&[(row, col)], revision) {
                return false;
            }
        }
        self.prepare_cell_write(row, col);
        self.cells
            .write_cell(row, col, kind, payload, style, dirty_revision)
    }

    pub(crate) fn hydrate_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
    ) -> bool {
        if !self.cells.hydrate_cell(row, col, kind, payload, style) {
            return false;
        }
        self.prepare_cell_write(row, col);
        true
    }

    pub(crate) fn spill_owner(&self, cell: CellKey) -> Option<CellKey> {
        self.spill_owners.get(&cell).copied()
    }

    /// The range that `anchor` spills into. `spill_ranges` also keeps
    /// blocked attempts; only an installed spill owns its anchor cell.
    pub(crate) fn installed_spill(&self, anchor: CellKey) -> Option<SpillRange> {
        if self.spill_owner(anchor) != Some(anchor) {
            return None;
        }
        self.spill_ranges.get(&anchor).copied()
    }

    pub(crate) fn compact_spill_metadata(&mut self) {
        if self.spill_owners.is_empty() {
            self.spill_owners = FxHashMap::default();
        } else if self.spill_owners.capacity() > self.spill_owners.len().saturating_mul(2)
            && self
                .spill_owners
                .capacity()
                .saturating_sub(self.spill_owners.len())
                > 4096
        {
            self.spill_owners.shrink_to_fit();
        }
        self.cells.compact_calculated();
    }

    /// Remove only cells still owned by `anchor`; a user-written obstruction that
    /// detached from the spill remains untouched.
    pub(crate) fn clear_spill(&mut self, anchor: CellKey) -> Vec<CellKey> {
        if self.spill_owner(anchor) != Some(anchor) {
            return Vec::new();
        }
        let Some(range) = self.spill_ranges.get(&anchor).copied() else {
            return Vec::new();
        };
        let mut changed = Vec::new();
        for row in range.anchor.0..=range.row_end {
            for col in range.anchor.1..=range.col_end {
                let cell = (row, col);
                if self.spill_owner(cell) != Some(anchor) {
                    continue;
                }
                self.spill_owners.remove(&cell);
                if cell == anchor || !self.cells.contains_cell(row as usize, col as usize) {
                    continue;
                }
                let index = self.cells.idx(row as usize, col as usize);
                self.cells.remove_calculated(index);
                changed.push(cell);
            }
        }
        changed
    }

    pub(crate) fn clear_all_spills(&mut self) -> Vec<CellKey> {
        let anchors: Vec<CellKey> = self.spill_ranges.keys().copied().collect();
        let mut changed = Vec::new();
        for anchor in anchors {
            changed.extend(self.clear_spill(anchor));
        }
        self.spill_ranges.clear();
        self.compact_spill_metadata();
        changed
    }

    /// Detach a direct write from any spill and invalidate every attempted spill
    /// whose destination includes this cell.
    #[inline]
    fn prepare_cell_write(&mut self, row: usize, col: usize) {
        // No spill metadata means nothing to detach, invalidate or enqueue; the
        // hash probes below would only pay for empty-map lookups on every write.
        if self.spill_ranges.is_empty() && self.spill_owners.is_empty() {
            return;
        }

        if let (Ok(row), Ok(col)) = (u32::try_from(row), u32::try_from(col)) {
            self.detach_spill_source((row, col));
        }
    }

    fn detach_spill_source(&mut self, cell: CellKey) {
        let affected: Vec<CellKey> = self
            .spill_ranges
            .iter()
            .filter_map(|(&anchor, &range)| range.contains(cell).then_some(anchor))
            .collect();

        if self.spill_ranges.contains_key(&cell) {
            let changed = self.clear_spill(cell);
            self.formulas.mark_cells_dirty(changed);
            self.spill_ranges.remove(&cell);
        } else {
            self.spill_owners.remove(&cell);
        }

        self.compact_spill_metadata();
        self.formulas.mark_cells_dirty(affected);
    }

    pub(crate) fn finish_recompute(&mut self) {
        if self.formulas.is_empty() {
            self.cells.invalidate_derived();
        }

        self.formulas.clear_dirty();
    }

    /// Shift rows `[at, row_count)` down by `count`, opening a blank gap.
    pub(crate) fn insert_rows(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.row_count();
        if count == 0 || extent.checked_add(count).is_none() {
            return;
        }

        let at = at.min(extent);
        self.cells.insert_rows(at, count);
        self.formulas.insert_rows(sheet, at as u32, count as u32);
    }

    /// Delete `count` rows starting at `at`, closing the gap.
    pub(crate) fn delete_rows(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.row_count();
        if count == 0 || at >= extent {
            return;
        }

        let count = count.min(extent - at);
        self.cells.delete_rows(at, count);
        self.formulas.delete_rows(sheet, at as u32, count as u32);
    }

    /// Shift columns `[at, n_cols)` right by `count`, opening blank columns.
    pub(crate) fn insert_cols(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.n_cols();
        if count == 0 || extent.checked_add(count).is_none() {
            return;
        }

        let at = at.min(extent);
        self.cells.insert_cols(at, count);
        self.formulas.insert_cols(sheet, at as u32, count as u32);
    }

    /// Delete `count` columns starting at `at`, closing the gap.
    pub(crate) fn delete_cols(&mut self, sheet: u32, at: usize, count: usize) {
        let extent = self.cells.n_cols();
        if count == 0 || at >= extent {
            return;
        }

        let count = count.min(extent - at);
        self.cells.delete_cols(at, count);
        self.formulas.delete_cols(sheet, at as u32, count as u32);
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        self.cells.add_memory_stats(stats);
        self.formulas.add_memory_stats(stats);
        stats
            .owner_mut(SPILL_RANGES)
            .add_hash_table::<CellKey, SpillRange>(
                self.spill_ranges.len(),
                self.spill_ranges.capacity(),
            );
        stats
            .owner_mut(SPILL_OWNERS)
            .add_hash_table::<CellKey, CellKey>(
                self.spill_owners.len(),
                self.spill_owners.capacity(),
            );
        stats
            .owner_mut(SPILL_BLOCKERS)
            .add_vec::<SpillBlocker>(self.spill_blockers.len(), self.spill_blockers.capacity());

        let metadata = stats.owner_mut(SHEET_INDEXES_METADATA);
        metadata.add_vec::<CondRule>(self.cond_rules.len(), self.cond_rules.capacity());
        for rule in &self.cond_rules {
            let text = match &rule.pred {
                CondPred::EqStr(value) => Some(value),
                CondPred::Contains { needle, .. } => Some(needle),
                _ => None,
            };
            if let Some(text) = text {
                metadata.add_payload(text.len(), text.capacity());
            }
        }
    }
}

pub(crate) fn formula_error_with_entry(
    sheet: &SheetData,
    key: CellKey,
    entry: Option<&FormulaEntry>,
) -> Option<FormulaError> {
    let (row, col) = (key.0 as usize, key.1 as usize);
    sheet
        .cells
        .contains_cell(row, col)
        .then(|| sheet.cells.calculated_error_at(sheet.cells.idx(row, col)))
        .flatten()
        .or_else(|| entry.and_then(|entry| entry.error))
}

pub(crate) fn formula_error_at(sheet: &SheetData, key: CellKey) -> Option<FormulaError> {
    formula_error_with_entry(sheet, key, sheet.formulas.get(key))
}
