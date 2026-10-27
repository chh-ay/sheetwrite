//! Formula dependency indexes, affected-set growth, and depth/cycle checks.

use std::cmp::Ordering;
use std::collections::VecDeque;

use rustc_hash::{FxHashMap, FxHashSet};

use crate::graph::{DirtyRect, DirtySeeds};
use crate::memory::MemoryOwnerStats;
use crate::sheet::SheetData;
use crate::types::{
    AbsCellKey, CellRange, EvalResult, FormulaEntry, FormulaError, ReadSet, Value,
    FORMULA_RECURSION_LIMIT,
};

/// Queued formula changes always patch the index below this count. Above it, a
/// batch changing more than `1 / PATCH_FORMULA_DIVISOR` of the workbook's
/// formulas rebuilds instead: its removals and additions then cost about what
/// one rebuild pass does, and the queue would retain that many old read sets.
const PATCH_FORMULA_FLOOR: usize = 256;
const PATCH_FORMULA_DIVISOR: usize = 4;
const READER_CAPACITY_SLACK: usize = 8;

/// Which formulas read each cell exactly and each range, workbook-wide.
///
/// Source replacements patch it through [`Self::queue_replacement`] and
/// [`Self::apply_pending`]; [`build_dep_index`] runs only for a missing index.
pub(crate) struct DepIndex {
    exact_dependents: FxHashMap<AbsCellKey, Vec<AbsCellKey>>,
    /// Sorted by range, so a group's position is its id and a patch finds a
    /// group by binary search instead of through a second range-keyed map.
    range_groups: Vec<RangeGroup>,
    range_sheets: Vec<RangeSheetIndex>,
    /// Formulas changed since the last [`Self::apply_pending`], each with the
    /// reads the index still records for it. Those reads move out of the
    /// replaced entry, so queueing a change copies no read set.
    pending: FxHashMap<AbsCellKey, ReadSet>,
    formulas: usize,
    dynamic_array_formulas: usize,
    /// A patch never clears this: a stale `true` only runs the depth check,
    /// while a wrong `false` would skip cycle detection.
    has_formula_dependencies: bool,
}

impl DepIndex {
    fn collect_matching_range_groups(
        &self,
        cell: AbsCellKey,
        matches: &mut Vec<usize>,
        row_matches: &mut Vec<usize>,
        marks: &mut [u32],
        stamp: &mut u32,
    ) {
        matches.clear();
        row_matches.clear();

        let Some(sheet) = self.range_sheets.get(cell.sheet as usize) else {
            return;
        };

        collect_interval_matches(&sheet.col_intervals, cell.col, matches);
        if matches.is_empty() {
            return;
        }

        collect_interval_matches(&sheet.row_intervals, cell.row, row_matches);
        if row_matches.is_empty() {
            matches.clear();
            return;
        }

        let current = next_match_stamp(marks, stamp);
        if matches.len() <= row_matches.len() {
            for &group in matches.iter() {
                marks[group] = current;
            }
            matches.clear();
            for &group in row_matches.iter() {
                if marks[group] == current {
                    matches.push(group);
                }
            }
        } else {
            for &group in row_matches.iter() {
                marks[group] = current;
            }
            matches.retain(|group| marks[*group] == current);
        }
    }

    pub(crate) fn memory_stats(&self) -> (MemoryOwnerStats, MemoryOwnerStats) {
        let mut nodes = MemoryOwnerStats::default();
        let mut edges = MemoryOwnerStats::default();
        nodes.add_hash_table::<AbsCellKey, Vec<AbsCellKey>>(
            self.exact_dependents.len(),
            self.exact_dependents.capacity(),
        );
        for dependents in self.exact_dependents.values() {
            edges.add_vec::<AbsCellKey>(dependents.len(), dependents.capacity());
        }

        nodes.add_vec::<RangeGroup>(self.range_groups.len(), self.range_groups.capacity());
        for group in &self.range_groups {
            edges.add_vec::<AbsCellKey>(group.dependents.len(), group.dependents.capacity());
        }
        nodes.add_vec::<RangeSheetIndex>(self.range_sheets.len(), self.range_sheets.capacity());
        for sheet in &self.range_sheets {
            nodes.add_vec::<RangeInterval>(
                sheet.row_intervals.len(),
                sheet.row_intervals.capacity(),
            );
            nodes.add_vec::<RangeInterval>(
                sheet.col_intervals.len(),
                sheet.col_intervals.capacity(),
            );
        }
        nodes.add_hash_table::<AbsCellKey, ReadSet>(self.pending.len(), self.pending.capacity());
        for reads in self.pending.values() {
            edges.add_vec::<AbsCellKey>(reads.cells.len(), reads.cells.capacity());
            edges.add_vec::<CellRange>(reads.ranges.len(), reads.ranges.capacity());
        }
        (nodes, edges)
    }

    pub(super) fn has_dynamic_arrays(&self) -> bool {
        self.dynamic_array_formulas > 0
    }

    /// Queues the replacement of `formula`'s `previous` entry by `next`, the
    /// entry now stored. Only the first change since the last
    /// [`Self::apply_pending`] keeps `previous`'s reads, because only those are
    /// in the index; the formula and array counts move with every change.
    pub(crate) fn queue_replacement(
        &mut self,
        formula: AbsCellKey,
        previous: Option<FormulaEntry>,
        next: Option<&FormulaEntry>,
    ) {
        if let Some(previous) = &previous {
            self.formulas -= 1;
            self.dynamic_array_formulas -= usize::from(previous.produces_array());
        }
        if let Some(next) = next {
            self.formulas += 1;
            self.dynamic_array_formulas += usize::from(next.produces_array());
        }

        self.pending
            .entry(formula)
            .or_insert_with(|| previous.map(|entry| entry.reads).unwrap_or_default());
    }

    /// Whether the queue covers enough formulas that a rebuild beats a patch.
    pub(crate) fn needs_rebuild(&self) -> bool {
        self.pending.len() > PATCH_FORMULA_FLOOR.max(self.formulas / PATCH_FORMULA_DIVISOR)
    }

    /// Moves the queued formulas' edges from their old reads to the reads of
    /// their current entries in `sheets`.
    ///
    /// Removals are grouped by target, so each touched reader list is filtered
    /// once however many of its readers changed: O(touched list lengths +
    /// changed reads · log changed reads), never one list scan per reader. All
    /// removals run before any addition, so a read kept across the change is
    /// removed and re-added without diffing old reads against new ones.
    pub(crate) fn apply_pending(&mut self, sheets: &[SheetData]) {
        if self.pending.is_empty() {
            return;
        }

        let pending = std::mem::take(&mut self.pending);
        if self.range_sheets.len() < sheets.len() {
            self.range_sheets
                .resize_with(sheets.len(), RangeSheetIndex::default);
        }

        let mut exact_removals = Vec::new();
        let mut range_edges = Vec::new();
        for (&formula, reads) in &pending {
            exact_removals.extend(reads.cells.iter().map(|&cell| (cell, formula)));
            range_edges.extend(reads.ranges.iter().map(|&range| (range, formula)));
        }
        self.remove_exact_readers(&mut exact_removals);
        let emptied_group = self.remove_range_readers(&mut range_edges);

        let removed_range_edges = range_edges.len();
        for &formula in pending.keys() {
            let Some(entry) = formula_entry(sheets, formula) else {
                continue;
            };

            self.has_formula_dependencies = self.has_formula_dependencies
                || !entry.reads.ranges.is_empty()
                || self.exact_dependents.contains_key(&formula);
            for &cell in &entry.reads.cells {
                self.has_formula_dependencies =
                    self.has_formula_dependencies || formula_exists(sheets, cell);
                self.exact_dependents.entry(cell).or_default().push(formula);
            }
            range_edges.extend(entry.reads.ranges.iter().map(|&range| (range, formula)));
        }

        let added_groups = self.add_range_readers(&mut range_edges[removed_range_edges..]);
        if emptied_group || !added_groups.is_empty() {
            self.regroup(added_groups);
        }

        // Compact only after additions: an unchanged edge is removed and
        // re-added by this patch, so shrinking earlier would cause churn.
        // Each touched list keeps O(live readers + fixed slack) capacity;
        // moving one reader group across targets cannot retain its history.
        for run in exact_removals.chunk_by(|left, right| left.0 == right.0) {
            if let Some(readers) = self.exact_dependents.get_mut(&run[0].0) {
                Self::compact_readers(readers);
            }
        }
        for run in range_edges[..removed_range_edges].chunk_by(|left, right| left.0 == right.0) {
            if let Ok(group) = self.find_range_group(run[0].0) {
                Self::compact_readers(&mut self.range_groups[group].dependents);
            }
        }
    }

    fn compact_readers(readers: &mut Vec<AbsCellKey>) {
        let capacity_limit = readers
            .len()
            .saturating_mul(2)
            .saturating_add(READER_CAPACITY_SLACK);
        if readers.capacity() > capacity_limit {
            readers.shrink_to(capacity_limit);
        }
    }

    /// Drops every `(target, reader)` edge, filtering each target's list once.
    fn remove_exact_readers(&mut self, removals: &mut [(AbsCellKey, AbsCellKey)]) {
        removals.sort_unstable();
        for run in removals.chunk_by(|a, b| a.0 == b.0) {
            let target = run[0].0;
            let Some(readers) = self.exact_dependents.get_mut(&target) else {
                continue;
            };

            readers.retain(|reader| !run_removes(run, reader));
            if readers.is_empty() {
                self.exact_dependents.remove(&target);
            }
        }
    }

    /// Range counterpart of [`Self::remove_exact_readers`]. Reports whether a
    /// group lost its last reader; [`Self::regroup`] drops such groups.
    fn remove_range_readers(&mut self, removals: &mut [(CellRange, AbsCellKey)]) -> bool {
        removals.sort_unstable();
        let mut emptied = false;
        for run in removals.chunk_by(|a, b| a.0 == b.0) {
            let Ok(group) = self.find_range_group(run[0].0) else {
                continue;
            };

            let readers = &mut self.range_groups[group].dependents;
            readers.retain(|reader| !run_removes(run, reader));
            emptied |= readers.is_empty();
        }
        emptied
    }

    /// Adds every `(range, reader)` edge to the group for its range and returns
    /// the ranges no group covers yet as new groups, sorted by range.
    fn add_range_readers(&mut self, additions: &mut [(CellRange, AbsCellKey)]) -> Vec<RangeGroup> {
        additions.sort_unstable();
        let mut added = Vec::new();
        for run in additions.chunk_by(|a, b| a.0 == b.0) {
            let range = run[0].0;
            let readers = run.iter().map(|&(_, reader)| reader);
            match self.find_range_group(range) {
                Ok(group) => self.range_groups[group].dependents.extend(readers),
                Err(_) => added.push(RangeGroup {
                    range,
                    dependents: readers.collect(),
                }),
            }
        }
        added
    }

    fn find_range_group(&self, range: CellRange) -> Result<usize, usize> {
        self.range_groups
            .binary_search_by(|group| group.range.cmp(&range))
    }

    /// Merges `added` into the sorted groups, drops groups left without
    /// readers, and renumbers the interval lists to match. Group ids are
    /// positions, so any insertion or removal shifts later ids; doing all of
    /// them in one merge keeps a batch at O(groups + intervals + k log k) for k
    /// new groups instead of one shift per changed range.
    fn regroup(&mut self, added: Vec<RangeGroup>) {
        let previous = std::mem::take(&mut self.range_groups);
        let emptied = previous
            .iter()
            .filter(|group| group.dependents.is_empty())
            .count();
        let mut remap = Vec::with_capacity(previous.len());
        let mut groups = Vec::with_capacity(previous.len() - emptied + added.len());
        let mut added_ids = Vec::with_capacity(added.len());
        let mut added = added.into_iter().peekable();
        for group in previous {
            while let Some(new) = added.next_if(|new| new.range < group.range) {
                added_ids.push(groups.len());
                groups.push(new);
            }
            if group.dependents.is_empty() {
                remap.push(None);
            } else {
                remap.push(Some(groups.len()));
                groups.push(group);
            }
        }
        for new in added {
            added_ids.push(groups.len());
            groups.push(new);
        }
        self.range_groups = groups;

        // Remapping is monotonic, so retained intervals stay sorted.
        for sheet in &mut self.range_sheets {
            for intervals in [&mut sheet.row_intervals, &mut sheet.col_intervals] {
                intervals.retain_mut(|interval| match remap[interval.group] {
                    Some(group) => {
                        interval.group = group;
                        true
                    }
                    None => false,
                });
            }
        }

        let groups = &self.range_groups;
        for ids in added_ids.chunk_by(|&a, &b| groups[a].range.sheet == groups[b].range.sheet) {
            let Some(sheet) = self
                .range_sheets
                .get_mut(groups[ids[0]].range.sheet as usize)
            else {
                continue;
            };

            let (rows, cols) = ids
                .iter()
                .map(|&group| {
                    let range = groups[group].range;
                    (
                        RangeInterval::new(range.row_start, range.row_end, group),
                        RangeInterval::new(range.col_start, range.col_end, group),
                    )
                })
                .unzip();
            merge_intervals(&mut sheet.row_intervals, rows);
            merge_intervals(&mut sheet.col_intervals, cols);
        }

        for sheet in &mut self.range_sheets {
            accumulate_max_end(&mut sheet.row_intervals);
            accumulate_max_end(&mut sheet.col_intervals);
        }
    }

    /// Whether rewriting one formula entry leaves every field
    /// [`build_dep_index`] reads unchanged.
    ///
    /// When this holds, the index still describes the rewritten formula, so
    /// source replacement queues no patch for it. The formula cell itself is
    /// still marked dirty, so it is always re-evaluated.
    ///
    /// An entry with a parse or resolution error carries no reads and no AST,
    /// so both sides must be error-free for the comparison to be meaningful; a
    /// cell that gains its first formula changes the formula-cell set, so the
    /// caller only compares entries when one already existed.
    pub(crate) fn dependency_graph_unchanged(previous: &FormulaEntry, next: &FormulaEntry) -> bool {
        previous.source_error().is_none()
            && next.source_error().is_none()
            && previous.reads.cells == next.reads.cells
            && previous.reads.ranges == next.reads.ranges
            && previous.produces_array() == next.produces_array()
    }
}

struct RangeGroup {
    range: CellRange,
    dependents: Vec<AbsCellKey>,
}

#[derive(Default)]
struct RangeSheetIndex {
    row_intervals: Vec<RangeInterval>,
    col_intervals: Vec<RangeInterval>,
}

impl RangeSheetIndex {
    fn finish(&mut self) {
        prepare_interval_index(&mut self.row_intervals);
        prepare_interval_index(&mut self.col_intervals);
    }
}

#[derive(Clone, Copy)]
struct RangeInterval {
    start: u32,
    end: u32,
    group: usize,
    max_end: u32,
}

impl RangeInterval {
    fn new(start: u32, end: u32, group: usize) -> Self {
        Self {
            start,
            end,
            group,
            max_end: end,
        }
    }
}

/// Build the whole-workbook dependency index.
///
/// The fields this function reads from each formula entry -- the read cells,
/// the read ranges and whether the AST produces an array -- are also compared
/// by [`DepIndex::dependency_graph_unchanged`], which lets a formula rewrite
/// skip the patch when none of them changed, and are what
/// [`DepIndex::apply_pending`] and [`DepIndex::queue_replacement`] patch. A new
/// dependency-relevant field must be added to all three, or a replacement that
/// changes it will leave the index stale.
pub(crate) fn build_dep_index(sheets: &[SheetData]) -> DepIndex {
    let mut exact_dependents: FxHashMap<AbsCellKey, Vec<AbsCellKey>> = FxHashMap::default();
    let mut range_dependents: FxHashMap<CellRange, Vec<AbsCellKey>> = FxHashMap::default();
    let mut dynamic_array_formulas = 0;
    let formula_cells: FxHashSet<AbsCellKey> = sheets
        .iter()
        .enumerate()
        .flat_map(|(sheet, data)| {
            data.formulas
                .keys()
                .map(move |cell| AbsCellKey::from_local(sheet, cell))
        })
        .collect();
    let mut has_formula_dependencies = false;

    for (sheet_index, sheet) in sheets.iter().enumerate() {
        for (formula_cell, entry) in sheet.formulas.iter() {
            dynamic_array_formulas += usize::from(entry.produces_array());
            let formula_abs = AbsCellKey::from_local(sheet_index, formula_cell);
            for &cell in &entry.reads.cells {
                exact_dependents.entry(cell).or_default().push(formula_abs);
            }
            for &range in &entry.reads.ranges {
                range_dependents.entry(range).or_default().push(formula_abs);
            }
            has_formula_dependencies |= entry
                .reads
                .cells
                .iter()
                .any(|cell| formula_cells.contains(cell));
            has_formula_dependencies |= !entry.reads.ranges.is_empty();
        }
    }

    let mut range_groups: Vec<RangeGroup> = range_dependents
        .into_iter()
        .map(|(range, dependents)| RangeGroup { range, dependents })
        .collect();
    range_groups.sort_unstable_by_key(|group| group.range);
    let mut range_sheets: Vec<RangeSheetIndex> = (0..sheets.len())
        .map(|_| RangeSheetIndex::default())
        .collect();
    for (group, RangeGroup { range, .. }) in range_groups.iter().enumerate() {
        if let Some(sheet) = range_sheets.get_mut(range.sheet as usize) {
            sheet
                .row_intervals
                .push(RangeInterval::new(range.row_start, range.row_end, group));
            sheet
                .col_intervals
                .push(RangeInterval::new(range.col_start, range.col_end, group));
        }
    }
    for sheet in &mut range_sheets {
        sheet.finish();
    }

    DepIndex {
        exact_dependents,
        range_groups,
        range_sheets,
        pending: FxHashMap::default(),
        formulas: formula_cells.len(),
        dynamic_array_formulas,
        has_formula_dependencies,
    }
}

fn prepare_interval_index(intervals: &mut [RangeInterval]) {
    intervals.sort_unstable_by(interval_order);
    accumulate_max_end(intervals);
}

fn interval_order(a: &RangeInterval, b: &RangeInterval) -> Ordering {
    (a.start, a.end, a.group).cmp(&(b.start, b.end, b.group))
}

fn accumulate_max_end(intervals: &mut [RangeInterval]) {
    let mut max_end = 0;
    for interval in intervals {
        max_end = max_end.max(interval.end);
        interval.max_end = max_end;
    }
}

/// Inserts `added` into the sorted `intervals` by merging from the back, so
/// the vector grows in place and the existing intervals are never copied to
/// scratch space. `max_end` is left for [`accumulate_max_end`].
fn merge_intervals(intervals: &mut Vec<RangeInterval>, mut added: Vec<RangeInterval>) {
    let Some(&filler) = added.first() else {
        return;
    };

    added.sort_unstable_by(interval_order);
    let mut kept = intervals.len();
    intervals.resize(kept + added.len(), filler);
    for write in (0..intervals.len()).rev() {
        let Some(&next) = added.last() else {
            break;
        };

        if kept > 0 && interval_order(&intervals[kept - 1], &next).is_gt() {
            kept -= 1;
            intervals[write] = intervals[kept];
        } else {
            intervals[write] = next;
            added.pop();
        }
    }
}

/// Whether the sorted `(target, reader)` run lists `reader`.
fn run_removes<T>(run: &[(T, AbsCellKey)], reader: &AbsCellKey) -> bool {
    run.binary_search_by(|(_, removed)| removed.cmp(reader))
        .is_ok()
}

fn collect_interval_matches(intervals: &[RangeInterval], point: u32, out: &mut Vec<usize>) {
    out.clear();
    let mut cursor = intervals.partition_point(|interval| interval.start <= point);
    while cursor > 0 {
        cursor -= 1;
        let interval = intervals[cursor];
        if interval.max_end < point {
            break;
        }
        if interval.end >= point {
            out.push(interval.group);
        }
    }
}

fn next_match_stamp(marks: &mut [u32], stamp: &mut u32) -> u32 {
    if *stamp == u32::MAX {
        marks.fill(0);
        *stamp = 1;
    }
    let current = *stamp;
    *stamp += 1;
    current
}

pub(super) fn collect_affected_formulas(
    sheets: &[SheetData],
    seed_sheet: usize,
    index: &DepIndex,
) -> FxHashSet<AbsCellKey> {
    let mut affected: FxHashSet<AbsCellKey> = FxHashSet::default();
    let mut queue: VecDeque<AbsCellKey> = VecDeque::new();
    let mut range_matches: Vec<usize> = Vec::new();
    let mut row_matches: Vec<usize> = Vec::new();
    let mut range_marks = vec![0; index.range_groups.len()];
    let mut range_stamp = 1;
    let mut fired_groups = vec![false; index.range_groups.len()];
    if let Some(sheet) = sheets.get(seed_sheet) {
        match sheet.formulas.dirty_seeds() {
            DirtySeeds::Cells(cells) => {
                for &cell in cells {
                    let abs = AbsCellKey::from_local(seed_sheet, cell);
                    if formula_exists(sheets, abs) {
                        affected.insert(abs);
                    }
                    queue.push_back(abs);
                }
            }
            DirtySeeds::Ranges(rects) => {
                // Small rectangles are cheaper to walk than every formula/read key.
                const ENUMERATED_RECT_CELLS: u64 = 4096;
                let is_small = |rect: &DirtyRect| {
                    (u64::from(rect.row_end - rect.row_start) + 1)
                        .saturating_mul(u64::from(rect.col_end - rect.col_start) + 1)
                        <= ENUMERATED_RECT_CELLS
                };
                for rect in rects.iter().filter(|rect| is_small(rect)) {
                    for row in rect.row_start..=rect.row_end {
                        for col in rect.col_start..=rect.col_end {
                            let abs = AbsCellKey::from_local(seed_sheet, (row, col));
                            if formula_exists(sheets, abs) {
                                affected.insert(abs);
                            }
                            queue.push_back(abs);
                        }
                    }
                }

                if rects.iter().any(|rect| !is_small(rect)) {
                    // Large edits scan registered sources, never the rectangle area.
                    let contains = |cell| {
                        rects
                            .iter()
                            .filter(|rect| !is_small(rect))
                            .any(|rect| rect.contains(cell))
                    };
                    for cell in sheet.formulas.keys().filter(|&cell| contains(cell)) {
                        let abs = AbsCellKey::from_local(seed_sheet, cell);
                        if affected.insert(abs) {
                            queue.push_back(abs);
                        }
                    }

                    for (&cell, dependents) in &index.exact_dependents {
                        if cell.sheet == seed_sheet as u32 && contains(cell.local()) {
                            for &dependent in dependents {
                                if affected.insert(dependent) {
                                    queue.push_back(dependent);
                                }
                            }
                        }
                    }

                    for (group_index, group) in index.range_groups.iter().enumerate() {
                        let range = group.range;
                        if range.sheet == seed_sheet as u32
                            && rects.iter().filter(|rect| !is_small(rect)).any(|rect| {
                                rect.intersects(DirtyRect {
                                    row_start: range.row_start,
                                    col_start: range.col_start,
                                    row_end: range.row_end,
                                    col_end: range.col_end,
                                })
                            })
                        {
                            fired_groups[group_index] = true;
                            for &dependent in &group.dependents {
                                if affected.insert(dependent) {
                                    queue.push_back(dependent);
                                }
                            }
                        }
                    }
                }
            }
            DirtySeeds::All => {
                // Seed every formula on the sheet plus every formula registered as
                // reading any of its cells or ranges; the BFS below grows
                // transitive dependents as usual. This is bounded by
                // formula/read-set counts, never by row count.
                let seed = seed_sheet as u32;
                for cell in sheet.formulas.keys() {
                    let abs = AbsCellKey::from_local(seed_sheet, cell);
                    if affected.insert(abs) {
                        queue.push_back(abs);
                    }
                }
                for (&cell, dependents) in &index.exact_dependents {
                    if cell.sheet != seed {
                        continue;
                    }
                    for &dependent in dependents {
                        if affected.insert(dependent) {
                            queue.push_back(dependent);
                        }
                    }
                }
                for (group_index, group) in index.range_groups.iter().enumerate() {
                    if group.range.sheet != seed {
                        continue;
                    }
                    fired_groups[group_index] = true;
                    for &dependent in &group.dependents {
                        if affected.insert(dependent) {
                            queue.push_back(dependent);
                        }
                    }
                }
            }
        }

        // Volatile formulas recalculate on every pass, as in Excel. Seeding
        // them here instead of marking them dirty keeps the dirty state exact
        // and costs O(volatile cells); the BFS below adds their dependents.
        for cell in sheet.formulas.volatile_keys() {
            let abs = AbsCellKey::from_local(seed_sheet, cell);
            if affected.insert(abs) {
                queue.push_back(abs);
            }
        }
    }

    while let Some(cell) = queue.pop_front() {
        if formula_exists(sheets, cell) {
            affected.insert(cell);
        }

        if let Some(dependents) = index.exact_dependents.get(&cell) {
            for &dependent in dependents {
                if affected.insert(dependent) {
                    queue.push_back(dependent);
                }
            }
        }

        index.collect_matching_range_groups(
            cell,
            &mut range_matches,
            &mut row_matches,
            &mut range_marks,
            &mut range_stamp,
        );
        for &group in &range_matches {
            if std::mem::replace(&mut fired_groups[group], true) {
                continue;
            }
            let range_group = &index.range_groups[group];
            debug_assert!(range_group.range.contains(cell));
            for &dependent in &range_group.dependents {
                if affected.insert(dependent) {
                    queue.push_back(dependent);
                }
            }
        }
    }

    affected
}

/// Formulas that read any of `cells` directly, by cell or by range. Unlike
/// [`collect_affected_formulas`], this does not follow dependents further.
pub(super) fn direct_readers(
    index: &DepIndex,
    sheet: usize,
    cells: &[(u32, u32)],
) -> FxHashSet<AbsCellKey> {
    let mut readers = FxHashSet::default();
    let mut range_matches: Vec<usize> = Vec::new();
    let mut row_matches: Vec<usize> = Vec::new();
    let mut range_marks = vec![0; index.range_groups.len()];
    let mut range_stamp = 1;
    let mut fired_groups = vec![false; index.range_groups.len()];
    for &cell in cells {
        let cell = AbsCellKey::from_local(sheet, cell);
        if let Some(dependents) = index.exact_dependents.get(&cell) {
            readers.extend(dependents.iter().copied());
        }
        index.collect_matching_range_groups(
            cell,
            &mut range_matches,
            &mut row_matches,
            &mut range_marks,
            &mut range_stamp,
        );
        for &group in &range_matches {
            if std::mem::replace(&mut fired_groups[group], true) {
                continue;
            }
            readers.extend(index.range_groups[group].dependents.iter().copied());
        }
    }
    readers
}

fn formula_entry(sheets: &[SheetData], key: AbsCellKey) -> Option<&FormulaEntry> {
    sheets
        .get(key.sheet as usize)
        .and_then(|sheet| sheet.formulas.get(key.local()))
}

fn formula_exists(sheets: &[SheetData], key: AbsCellKey) -> bool {
    formula_entry(sheets, key).is_some()
}

/// Seeds `memo` with the depth and cycle errors of `affected`. Returns whether
/// any formula met a circular reference, so iterative calculation runs its
/// component pass only for workbooks that have one.
pub(super) fn seed_dependency_depth_errors(
    sheets: &[SheetData],
    affected: &FxHashSet<AbsCellKey>,
    index: &DepIndex,
    memo: &mut FxHashMap<AbsCellKey, EvalResult>,
) -> bool {
    seed_depth_errors(sheets, affected, index, memo, false)
}

/// Spill expansion may add formulas, but must not replace values of components
/// that iterative calculation has already settled before installing spills.
pub(super) fn seed_additional_depth_errors(
    sheets: &[SheetData],
    affected: &FxHashSet<AbsCellKey>,
    index: &DepIndex,
    memo: &mut FxHashMap<AbsCellKey, EvalResult>,
) -> bool {
    seed_depth_errors(sheets, affected, index, memo, true)
}

fn seed_depth_errors(
    sheets: &[SheetData],
    affected: &FxHashSet<AbsCellKey>,
    index: &DepIndex,
    memo: &mut FxHashMap<AbsCellKey, EvalResult>,
    preserve_results: bool,
) -> bool {
    if !index.has_formula_dependencies {
        return false;
    }

    let mut walk = DependencyDepthWalk::new(sheets, affected);
    let mut found_cycle = false;
    for &key in affected {
        if let Err(error) = walk.depth(key) {
            found_cycle |= error == FormulaError::Cycle;
            if preserve_results {
                memo.entry(key).or_insert(Value::Error(error));
            } else {
                memo.insert(key, Value::Error(error));
            }
        }
    }
    found_cycle
}

/// A node of the depth/cycle graph. A range read is one node shared by all of
/// its readers instead of an edge from every reader to every formula inside it,
/// so the graph grows with formulas plus distinct ranges, not with readers times
/// range members. A formula adds one level of depth; a range adds none.
#[derive(Clone, Copy, Eq, Hash, PartialEq)]
enum DependencyNode {
    Formula(AbsCellKey),
    Range(CellRange),
}

#[derive(Clone, Copy)]
enum NodeDepth {
    /// An affected formula the walk has not entered yet.
    Pending,
    /// On the walk stack: reaching it again closes a cycle.
    Visiting,
    Done(Result<usize, FormulaError>),
}

/// The outgoing edges of one graph node, read from the formula entry in place.
struct EdgeCursor<'a> {
    node: DependencyNode,
    /// The formula's direct reads; empty for a range node.
    cells: &'a [AbsCellKey],
    /// The formula's range reads; empty for a range node.
    ranges: &'a [CellRange],
    /// For a formula, the index into `cells` then `ranges`; for a range, the
    /// index into the walk's column-major formula list.
    next: usize,
}

impl<'a> EdgeCursor<'a> {
    fn new(sheets: &'a [SheetData], formulas: &[AbsCellKey], node: DependencyNode) -> Self {
        let (cells, ranges, next): (&'a [AbsCellKey], &'a [CellRange], usize) = match node {
            DependencyNode::Formula(key) => formula_entry(sheets, key)
                .map_or((&[], &[], 0), |entry| {
                    (&entry.reads.cells, &entry.reads.ranges, 0)
                }),
            DependencyNode::Range(range) => {
                let first = (range.sheet, range.col_start, range.row_start);
                let next = formulas.partition_point(|&key| column_major(key) < first);
                (&[], &[], next)
            }
        };
        Self {
            node,
            cells,
            ranges,
            next,
        }
    }

    /// The next dependency inside the walked graph: direct reads of formulas
    /// in `nodes`, every range read, and the members of a range in `formulas`.
    fn next_dependency<State>(
        &mut self,
        formulas: &[AbsCellKey],
        nodes: &FxHashMap<DependencyNode, State>,
    ) -> Option<DependencyNode> {
        match self.node {
            DependencyNode::Formula(_) => {
                // Only walked formulas can extend a path; other direct reads
                // are values.
                while let Some(&cell) = self.cells.get(self.next) {
                    self.next += 1;
                    let dependency = DependencyNode::Formula(cell);
                    if nodes.contains_key(&dependency) {
                        return Some(dependency);
                    }
                }
                let range = *self.ranges.get(self.next - self.cells.len())?;
                self.next += 1;
                Some(DependencyNode::Range(range))
            }
            DependencyNode::Range(range) => {
                // Members are contiguous per column, so rows outside the range
                // and the rest of a column are skipped by binary search rather
                // than scanned.
                while let Some(&key) = formulas.get(self.next) {
                    if key.sheet != range.sheet || key.col > range.col_end {
                        return None;
                    }
                    if key.row < range.row_start {
                        self.next += formulas[self.next..].partition_point(|&cell| {
                            column_major(cell) < (key.sheet, key.col, range.row_start)
                        });
                    } else if key.row > range.row_end {
                        self.next += formulas[self.next..]
                            .partition_point(|cell| (cell.sheet, cell.col) <= (key.sheet, key.col));
                    } else {
                        self.next += 1;
                        return Some(DependencyNode::Formula(key));
                    }
                }
                None
            }
        }
    }
}

/// One node on the explicit walk stack; formula chains can be far deeper than
/// the native stack allows.
struct DependencyFrame<'a> {
    edges: EdgeCursor<'a>,
    /// The deepest dependency so far, or the first error one reported.
    deepest: Result<usize, FormulaError>,
}

impl DependencyFrame<'_> {
    fn include(&mut self, dependency: Result<usize, FormulaError>) {
        self.deepest = self
            .deepest
            .and_then(|deepest| dependency.map(|depth| deepest.max(depth)));
    }

    fn finish(&self) -> Result<usize, FormulaError> {
        let own_depth = usize::from(matches!(self.edges.node, DependencyNode::Formula(_)));
        self.deepest.and_then(|deepest| {
            let depth = deepest + own_depth;
            if depth > FORMULA_RECURSION_LIMIT {
                Err(FormulaError::Num)
            } else {
                Ok(depth)
            }
        })
    }
}

fn column_major(key: AbsCellKey) -> (u32, u32, u32) {
    (key.sheet, key.col, key.row)
}

/// Affected formulas in column-major order, so a range finds its members
/// without probing each of its cells.
fn column_major_formulas(
    sheets: &[SheetData],
    keys: impl Iterator<Item = AbsCellKey>,
) -> Vec<AbsCellKey> {
    let mut formulas: Vec<AbsCellKey> = keys.filter(|&key| formula_exists(sheets, key)).collect();
    formulas.sort_unstable_by_key(|&key| column_major(key));
    formulas
}

/// Depth and cycle checks over the affected formulas. Scratch memory is one
/// entry per affected formula and per distinct range read, plus a stack no
/// deeper than the longest dependency path; edges are read from the formula
/// entries in place.
struct DependencyDepthWalk<'a> {
    sheets: &'a [SheetData],
    formulas: Vec<AbsCellKey>,
    nodes: FxHashMap<DependencyNode, NodeDepth>,
    stack: Vec<DependencyFrame<'a>>,
}

impl<'a> DependencyDepthWalk<'a> {
    fn new(sheets: &'a [SheetData], affected: &FxHashSet<AbsCellKey>) -> Self {
        let formulas = column_major_formulas(sheets, affected.iter().copied());
        let mut nodes = FxHashMap::with_capacity_and_hasher(formulas.len(), Default::default());
        nodes.extend(
            formulas
                .iter()
                .map(|&key| (DependencyNode::Formula(key), NodeDepth::Pending)),
        );
        Self {
            sheets,
            formulas,
            nodes,
            stack: Vec::new(),
        }
    }

    /// Depth of `key` counted in formulas, or the first error a dependency
    /// reports: `Cycle` when a path returns to a node still on the stack, `Num`
    /// past [`FORMULA_RECURSION_LIMIT`]. A path is not cut at the limit, so a
    /// cycle beyond it still reports `Cycle`.
    fn depth(&mut self, key: AbsCellKey) -> Result<usize, FormulaError> {
        let root = DependencyNode::Formula(key);
        match self.nodes.get(&root) {
            None => return Ok(1),
            Some(NodeDepth::Done(result)) => return *result,
            Some(NodeDepth::Pending | NodeDepth::Visiting) => self.enter(root),
        }

        // The root is the last node to finish.
        let mut finished = Ok(0);
        while let Some(frame) = self.stack.last_mut() {
            let dependency = if frame.deepest.is_ok() {
                frame.edges.next_dependency(&self.formulas, &self.nodes)
            } else {
                None
            };
            if let Some(dependency) = dependency {
                match self.nodes.get(&dependency).copied() {
                    Some(NodeDepth::Done(result)) => frame.include(result),
                    Some(NodeDepth::Visiting) => frame.deepest = Err(FormulaError::Cycle),
                    Some(NodeDepth::Pending) | None => self.enter(dependency),
                }
                continue;
            }

            finished = frame.finish();
            let node = frame.edges.node;
            self.stack.pop();
            self.nodes.insert(node, NodeDepth::Done(finished));
            if let Some(parent) = self.stack.last_mut() {
                parent.include(finished);
            }
        }
        finished
    }

    fn enter(&mut self, node: DependencyNode) {
        self.nodes.insert(node, NodeDepth::Visiting);
        self.stack.push(DependencyFrame {
            edges: EdgeCursor::new(self.sheets, &self.formulas, node),
            deepest: Ok(0),
        });
    }
}

/// Strongly connected components of the formulas in `cyclic`, the formulas the
/// depth walk reported as `Cycle`: the members of circular references and the
/// formulas reading them. Components come in evaluation order, each after
/// every component it reads.
pub(super) struct CircularComponents {
    /// Every formula of `cyclic`, grouped by component.
    formulas: Vec<AbsCellKey>,
    /// Per component: where its formulas end in `formulas`, and whether it is
    /// circular (more than one node, or a formula that reads itself).
    ends: Vec<(usize, bool)>,
}

impl CircularComponents {
    /// Each component's formulas and whether they form a circular reference.
    pub(super) fn iter(&self) -> impl Iterator<Item = (&[AbsCellKey], bool)> {
        let mut start = 0;
        self.ends.iter().map(move |&(end, circular)| {
            let members = &self.formulas[start..end];
            start = end;
            (members, circular)
        })
    }
}

#[derive(Clone, Copy)]
enum ComponentState {
    Unvisited,
    /// On the component stack, with its discovery index.
    Open(u32),
    Closed,
}

struct ComponentFrame<'a> {
    edges: EdgeCursor<'a>,
    index: u32,
    low_link: u32,
    reads_itself: bool,
}

/// Tarjan's algorithm over the walk graph, restricted to `cyclic` and the
/// ranges they read, with an explicit stack for the same reason as the depth
/// walk. One pass: O(formulas + ranges + edges) time and one entry per node.
struct ComponentWalk<'a> {
    sheets: &'a [SheetData],
    formulas: Vec<AbsCellKey>,
    nodes: FxHashMap<DependencyNode, ComponentState>,
    /// Entered nodes not yet assigned to a component.
    open: Vec<DependencyNode>,
    stack: Vec<ComponentFrame<'a>>,
    discovered: u32,
}

impl<'a> ComponentWalk<'a> {
    fn enter(&mut self, node: DependencyNode) {
        let index = self.discovered;
        self.discovered += 1;
        self.nodes.insert(node, ComponentState::Open(index));
        self.open.push(node);
        self.stack.push(ComponentFrame {
            edges: EdgeCursor::new(self.sheets, &self.formulas, node),
            index,
            low_link: index,
            reads_itself: false,
        });
    }

    /// Walks from `root` until its frame finishes, appending every component
    /// it completes to `output`.
    fn walk(&mut self, root: DependencyNode, output: &mut CircularComponents) {
        self.enter(root);
        while let Some(frame) = self.stack.last_mut() {
            if let Some(dependency) = frame.edges.next_dependency(&self.formulas, &self.nodes) {
                if dependency == frame.edges.node {
                    frame.reads_itself = true;
                    continue;
                }
                match self.nodes.get(&dependency).copied() {
                    Some(ComponentState::Open(index)) => {
                        frame.low_link = frame.low_link.min(index);
                    }
                    Some(ComponentState::Closed) => {}
                    Some(ComponentState::Unvisited) | None => self.enter(dependency),
                }
                continue;
            }

            let Some(frame) = self.stack.pop() else {
                break;
            };
            if let Some(parent) = self.stack.last_mut() {
                parent.low_link = parent.low_link.min(frame.low_link);
            }
            if frame.low_link == frame.index {
                self.close_component(&frame, output);
            }
        }
    }

    /// Moves the open nodes down to `frame`'s node, which roots them, into
    /// one component.
    fn close_component(&mut self, frame: &ComponentFrame<'_>, output: &mut CircularComponents) {
        let start = output.formulas.len();
        let mut size = 0usize;
        while let Some(node) = self.open.pop() {
            self.nodes.insert(node, ComponentState::Closed);
            size += 1;
            if let DependencyNode::Formula(key) = node {
                output.formulas.push(key);
            }
            if node == frame.edges.node {
                break;
            }
        }

        // A range read by no circular formula forms a component of its own.
        if output.formulas.len() == start {
            return;
        }

        // Row-major member order is the order Excel calculates a sheet in.
        output.formulas[start..].sort_unstable_by_key(|key| (key.sheet, key.row, key.col));
        output
            .ends
            .push((output.formulas.len(), size > 1 || frame.reads_itself));
    }
}

pub(super) fn circular_components(
    sheets: &[SheetData],
    cyclic: &[AbsCellKey],
) -> CircularComponents {
    let formulas = column_major_formulas(sheets, cyclic.iter().copied());
    let mut nodes = FxHashMap::with_capacity_and_hasher(formulas.len(), Default::default());
    nodes.extend(
        formulas
            .iter()
            .map(|&key| (DependencyNode::Formula(key), ComponentState::Unvisited)),
    );

    let mut output = CircularComponents {
        formulas: Vec::with_capacity(formulas.len()),
        ends: Vec::new(),
    };
    let mut walk = ComponentWalk {
        sheets,
        formulas,
        nodes,
        open: Vec::new(),
        stack: Vec::new(),
        discovered: 0,
    };
    for position in 0..walk.formulas.len() {
        let root = DependencyNode::Formula(walk.formulas[position]);
        if matches!(walk.nodes.get(&root), Some(ComponentState::Unvisited)) {
            walk.walk(root, &mut output);
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::CellStore;

    #[test]
    fn duplicate_direct_and_range_edges_preserve_cycle_error_propagation() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(4, 4);
        store.set_formula(sheet, 0, 0, "=B1+B1+SUM(B1:B1)", 0);
        store.set_formula(sheet, 0, 1, "=A1+SUM(A1:A1)", 0);
        let left = AbsCellKey::new(sheet, 0, 0);
        let right = AbsCellKey::new(sheet, 0, 1);
        let affected = FxHashSet::from_iter([left, right]);
        let index = build_dep_index(&store.sheets);

        let mut memo = FxHashMap::default();
        seed_dependency_depth_errors(&store.sheets, &affected, &index, &mut memo);
        assert!(matches!(
            memo.get(&left),
            Some(Value::Error(FormulaError::Cycle))
        ));
        assert!(matches!(
            memo.get(&right),
            Some(Value::Error(FormulaError::Cycle))
        ));
    }

    type IntervalRow = (u32, u32, usize, u32);

    /// Everything a rebuild derives from the entries. Reader order carries no
    /// meaning, so reader lists are compared sorted.
    #[derive(Debug, PartialEq)]
    struct IndexContents {
        exact: Vec<(AbsCellKey, Vec<AbsCellKey>)>,
        ranges: Vec<(CellRange, Vec<AbsCellKey>)>,
        intervals: Vec<[Vec<IntervalRow>; 2]>,
        formulas: usize,
        dynamic_array_formulas: usize,
    }

    fn sorted_readers(readers: &[AbsCellKey]) -> Vec<AbsCellKey> {
        let mut readers = readers.to_vec();
        readers.sort_unstable();
        readers
    }

    fn interval_rows(intervals: &[RangeInterval]) -> Vec<IntervalRow> {
        intervals
            .iter()
            .map(|interval| {
                (
                    interval.start,
                    interval.end,
                    interval.group,
                    interval.max_end,
                )
            })
            .collect()
    }

    fn index_contents(index: &DepIndex) -> IndexContents {
        let mut exact: Vec<_> = index
            .exact_dependents
            .iter()
            .map(|(&cell, readers)| (cell, sorted_readers(readers)))
            .collect();
        exact.sort_unstable();

        IndexContents {
            exact,
            ranges: index
                .range_groups
                .iter()
                .map(|group| (group.range, sorted_readers(&group.dependents)))
                .collect(),
            intervals: index
                .range_sheets
                .iter()
                .map(|sheet| {
                    [
                        interval_rows(&sheet.row_intervals),
                        interval_rows(&sheet.col_intervals),
                    ]
                })
                .collect(),
            formulas: index.formulas,
            dynamic_array_formulas: index.dynamic_array_formulas,
        }
    }

    /// Applies the queued patch and checks it against a rebuild of the same
    /// entries. The dependency flag may stay set after a delete, never unset.
    fn assert_patch_matches_rebuild(store: &mut CellStore) {
        let rebuilt = build_dep_index(&store.sheets);
        let patched = store.graph.ensure_index(&store.sheets);

        assert!(patched.pending.is_empty());
        assert_eq!(index_contents(patched), index_contents(&rebuilt));
        assert!(patched.has_formula_dependencies || !rebuilt.has_formula_dependencies);
    }

    #[test]
    fn one_transaction_of_mixed_rewrites_patches_the_index_to_a_rebuild() {
        let mut store = CellStore::new();
        let data = store.add_sheet(1, 4);
        let report = store.add_sheet(5, 3);
        store.set_sheet_name(data, "data", "Data");
        for row in 0..4 {
            store.set_number(data, row, 0, row as f64 + 1.0, 0);
        }
        store.set_formula(report, 0, 0, "=SUM(Data!A1:A4)", 0);
        store.set_formula(report, 1, 0, "=SUM(Data!A1:A4)*2", 0);
        store.set_formula(report, 2, 0, "=Data!A1", 0);
        store.set_formula(report, 0, 2, "=Data!A1:A2", 0);
        store.set_formula(report, 0, 3, "=MAX(Data!A3:A4)", 0);
        store.set_formula(report, 0, 4, "=E2", 0);
        store.recompute(report);
        assert_patch_matches_rebuild(&mut store);
        let epoch = store.graph.epoch();

        // A2 leaves the shared Data!A1:A4 group for a new range; A3 swaps its
        // exact read for that group plus another cell; clearing C1:D1 removes
        // the only array formula and empties the Data!A3:A4 group; E2 becomes
        // a formula at a cell E1 already read as a literal, closing a cycle.
        store.set_formula(report, 1, 0, "=SUM(Data!A2:A4)", 0);
        store.set_formula(report, 2, 0, "=SUM(Data!A1:A4)+Data!A2", 0);
        assert!(store.clear_range(report, 0, 2, 0, 3, true, false));
        store.set_formula(report, 1, 4, "=E1", 0);
        store.recompute(report);

        assert_eq!(
            store.graph.epoch(),
            epoch,
            "a local rewrite must not rebuild"
        );
        assert_patch_matches_rebuild(&mut store);
        assert!(store
            .graph
            .index()
            .is_some_and(|index| !index.has_dynamic_arrays()));
        assert_eq!(store.get_cell(report, 1, 0).num(), 9.0);
        assert_eq!(store.get_cell(report, 2, 0).num(), 12.0);
        assert_eq!(
            store.get_cell(report, 0, 4).string().as_deref(),
            Some("#CYCLE!")
        );

        store.set_number(data, 1, 0, 20.0, 0);
        store.recompute(data);
        assert_eq!(store.get_cell(report, 0, 0).num(), 28.0);
        assert_eq!(store.get_cell(report, 1, 0).num(), 27.0);
        assert_eq!(store.get_cell(report, 2, 0).num(), 48.0);
    }

    #[test]
    fn batch_clears_patch_a_shared_group_until_a_rebuild_is_cheaper() {
        const READERS: usize = 1_200;
        // Within both the floor and a quarter of the formulas left after it.
        const PATCHED_CLEAR: usize = 200;

        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, READERS);
        store.set_number(sheet, 0, 0, 1.0, 0);
        for row in 0..READERS {
            store.set_formula(sheet, row, 1, "=SUM($A$1:$A$1200)", 0);
        }
        store.recompute(sheet);
        let epoch = store.graph.epoch();

        assert!(store.clear_range(sheet, 0, 1, PATCHED_CLEAR - 1, 1, true, false));
        store.recompute(sheet);
        assert_eq!(store.graph.epoch(), epoch, "a small clear must patch");
        assert_patch_matches_rebuild(&mut store);

        assert!(store.clear_range(sheet, PATCHED_CLEAR, 1, READERS - 2, 1, true, false));
        assert!(
            store.graph.index().is_none(),
            "clearing most formulas must drop the index for one rebuild"
        );
        store.set_number(sheet, 0, 0, 5.0, 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, READERS - 1, 1).num(), 5.0);
        assert_patch_matches_rebuild(&mut store);
    }

    #[test]
    fn moving_reader_groups_release_historical_edge_capacity() {
        const TARGETS: usize = 32;
        const MOVING_READERS: usize = 64;
        const RETAINED_SLACK_PER_TARGET: usize = 16;
        for range_reads in [false, true] {
            let mut store = CellStore::new();
            let sheet = store.add_sheet(3, MOVING_READERS);
            let source = |row: usize| {
                if range_reads {
                    format!("=SUM(A{row}:A{row})")
                } else {
                    format!("=A{row}")
                }
            };
            for row in 0..TARGETS {
                store.set_formula(sheet, row, 1, &source(row + 1), 0);
            }
            for row in 0..MOVING_READERS {
                store.set_formula(sheet, row, 2, &source(1), 0);
            }
            store.recompute(sheet);

            for target in 1..TARGETS {
                let formula = source(target + 1);
                for row in 0..MOVING_READERS {
                    store.set_formula(sheet, row, 2, &formula, 0);
                }
                store.recompute(sheet);
            }
            let (_, edges) = store.graph.index().expect("built index").memory_stats();
            let live_edges = TARGETS + MOVING_READERS;
            let maximum_slots = live_edges * 2 + TARGETS * RETAINED_SLACK_PER_TARGET;
            assert!(
                edges.allocated_bytes <= maximum_slots * std::mem::size_of::<AbsCellKey>(),
                "historical reader locations retained {} bytes for {live_edges} live edges",
                edges.allocated_bytes
            );
            assert_eq!(store.get_cell(sheet, MOVING_READERS - 1, 2).num(), 0.0);
        }
    }

    #[test]
    fn dense_overlapping_ranges_share_one_node_per_range() {
        const ROWS: usize = 256;
        let mut store = CellStore::new();
        let sheet = store.add_sheet(2, ROWS);
        let reader = format!("=SUM(A1:A{ROWS})+SUM(A2:A{ROWS})");
        let mut affected = FxHashSet::default();
        for row in 0..ROWS {
            store.set_formula(sheet, row, 0, "=1", 0);
            store.set_formula(sheet, row, 1, &reader, 0);
            affected.insert(AbsCellKey::new(sheet, row as u32, 0));
            affected.insert(AbsCellKey::new(sheet, row as u32, 1));
        }

        let mut walk = DependencyDepthWalk::new(&store.sheets, &affected);
        for row in 0..ROWS {
            assert_eq!(walk.depth(AbsCellKey::new(sheet, row as u32, 1)), Ok(2));
        }
        // Every formula plus the two distinct ranges. Expanding the ranges into
        // reader-to-member edges would instead retain ROWS * (2 * ROWS - 1).
        assert_eq!(walk.nodes.len(), 2 * ROWS + 2);

        store.set_formula(sheet, 0, 0, "=B1", 0);
        let index = build_dep_index(&store.sheets);
        let mut memo = FxHashMap::default();
        seed_dependency_depth_errors(&store.sheets, &affected, &index, &mut memo);
        assert_eq!(memo.len(), ROWS + 1);
        assert!(matches!(
            memo.get(&AbsCellKey::new(sheet, 0, 0)),
            Some(Value::Error(FormulaError::Cycle))
        ));
        for row in 0..ROWS {
            assert!(matches!(
                memo.get(&AbsCellKey::new(sheet, row as u32, 1)),
                Some(Value::Error(FormulaError::Cycle))
            ));
        }
    }

    #[test]
    fn long_dependency_chains_preserve_depth_boundary_and_distant_cycles() {
        const CHAIN_ROWS: usize = 16_384;
        // Far below what a native recursion over CHAIN_ROWS formulas needs.
        const NATIVE_STACK_BYTES: usize = 512 * 1024;
        std::thread::Builder::new()
            .stack_size(NATIVE_STACK_BYTES)
            .spawn(|| {
                for reads_range in [false, true] {
                    let mut store = CellStore::new();
                    let sheet = store.add_sheet(1, CHAIN_ROWS);
                    let mut affected = FxHashSet::default();
                    store.set_formula(sheet, 0, 0, "=1", 0);
                    for row in 0..CHAIN_ROWS {
                        if row > 0 {
                            let source = if reads_range {
                                format!("=SUM(A{row}:A{row})")
                            } else {
                                format!("=A{row}")
                            };
                            store.set_formula(sheet, row, 0, &source, 0);
                        }
                        affected.insert(AbsCellKey::new(sheet, row as u32, 0));
                    }

                    let index = build_dep_index(&store.sheets);
                    let mut memo = FxHashMap::default();
                    seed_dependency_depth_errors(&store.sheets, &affected, &index, &mut memo);
                    assert_eq!(memo.len(), CHAIN_ROWS - FORMULA_RECURSION_LIMIT);
                    for row in 0..CHAIN_ROWS {
                        let key = AbsCellKey::new(sheet, row as u32, 0);
                        if row < FORMULA_RECURSION_LIMIT {
                            assert!(!memo.contains_key(&key));
                        } else {
                            assert!(matches!(
                                memo.get(&key),
                                Some(Value::Error(FormulaError::Num))
                            ));
                        }
                    }

                    store.set_formula(sheet, 0, 0, &format!("=A{CHAIN_ROWS}"), 0);
                    let index = build_dep_index(&store.sheets);
                    memo.clear();
                    seed_dependency_depth_errors(&store.sheets, &affected, &index, &mut memo);
                    assert_eq!(memo.len(), CHAIN_ROWS);
                    assert!(memo
                        .values()
                        .all(|value| matches!(value, Value::Error(FormulaError::Cycle))));
                }
            })
            .expect("create bounded-stack dependency test thread")
            .join()
            .expect("bounded-stack dependency walk must finish");
    }
}
