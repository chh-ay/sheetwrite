//! Formula dependency indexes, affected-set growth, and depth/cycle checks.

use std::cell::RefCell;
use std::cmp::Ordering;

use crate::formula_slots::{FormulaBits, FormulaId, FormulaResults, FormulaStore, FormulaWork};
use rustc_hash::FxHashSet;

use crate::graph::{offset_or_search, DirtyRect, DirtySeeds, FORMULA_INDEX_PAGE_ROWS};
use crate::memory::MemoryOwnerStats;
use crate::sheet::SheetData;
use crate::types::{
    AbsCellKey, CellRange, FormulaEntry, FormulaError, ReadSet, FORMULA_RECURSION_LIMIT,
};

/// Queued formula changes always patch the index below this count. Above it, a
/// batch changing more than `1 / PATCH_FORMULA_DIVISOR` of the workbook's
/// formulas rebuilds instead: its removals and additions then cost about what
/// one rebuild pass does, and the queue would retain that many old read sets.
const PATCH_FORMULA_FLOOR: usize = 256;
const PATCH_FORMULA_DIVISOR: usize = 4;

/// Which formulas read each cell exactly and each range, workbook-wide.
///
/// Readers are formula ids. Exact readers are stored per source column in
/// row bands, so a topology patch rewrites only the bands it touches. Range
/// readers are one flat array, cut by an end offset per group.
///
/// Source replacements patch it through [`Self::queue_replacement`] and
/// [`Self::apply_pending`]; [`build_dep_index`] runs only for a missing index.
pub(crate) struct DepIndex {
    /// Sorted by sheet, then column.
    exact: Vec<ExactColumn>,
    /// Distinct exact source cells, for the walk-or-scan choice of large edits.
    exact_sources: usize,
    /// Sorted by range, so a group's position is its id and a patch finds a
    /// group by binary search instead of through a second range-keyed map.
    range_groups: Vec<RangeGroup>,
    /// The readers of every group, in group order.
    range_readers: Vec<FormulaId>,
    range_sheets: Vec<RangeSheetIndex>,
    /// Formulas changed since the last [`Self::apply_pending`], each with the
    /// reads the index still records for it. Those reads move out of the
    /// replaced entry, so queueing a change copies no read set.
    pending: Vec<(FormulaId, ReadSet)>,
    /// The ids in `pending`, so only the first change of a formula is kept.
    /// Its cleared words stay allocated, so each small edit does not allocate
    /// and zero one bit per formula again.
    pending_ids: FormulaBits,
    /// Per-group scratch reused by every walk over range groups.
    group_marks: RefCell<GroupMarks>,
    formulas: usize,
    dynamic_array_formulas: usize,
    /// A patch never clears this: a stale `true` only runs the depth check,
    /// while a wrong `false` would skip cycle detection.
    has_formula_dependencies: bool,
}

/// The exact readers of one source column.
struct ExactColumn {
    sheet: u32,
    col: u32,
    /// Sorted by band; empty bands are removed.
    bands: Vec<ExactBand>,
}

/// The exact readers of the source cells in one row band of a column.
struct ExactBand {
    band: u32,
    /// Sorted source rows, each with the end of its readers in `readers`.
    sources: Vec<(u32, u32)>,
    readers: Vec<FormulaId>,
}

impl ExactBand {
    /// Store sorted `(row, reader)` edges with no spare capacity.
    fn from_edges(band: u32, edges: &[(u32, FormulaId)]) -> Self {
        let mut sources = Vec::with_capacity(edges.chunk_by(|a, b| a.0 == b.0).count());
        let mut readers = Vec::with_capacity(edges.len());
        for &(row, reader) in edges {
            readers.push(reader);
            let end = readers.len() as u32;
            match sources.last_mut() {
                Some((last, last_end)) if *last == row => *last_end = end,
                _ => sources.push((row, end)),
            }
        }
        Self {
            band,
            sources,
            readers,
        }
    }

    fn readers_at(&self, source: usize) -> &[FormulaId] {
        let start = source
            .checked_sub(1)
            .and_then(|previous| self.sources.get(previous))
            .map_or(0, |&(_, end)| end as usize);
        let end = self
            .sources
            .get(source)
            .map_or(start, |&(_, end)| end as usize);
        self.readers.get(start..end).unwrap_or(&[])
    }

    fn edges(&self) -> impl Iterator<Item = (u32, &[FormulaId])> + '_ {
        (0..self.sources.len()).map(|source| (self.sources[source].0, self.readers_at(source)))
    }

    /// Drops every `reader` edge of source `row` in place.
    fn remove_edge(&mut self, row: u32, reader: FormulaId) {
        let Ok(source) = self.sources.binary_search_by_key(&row, |&(row, _)| row) else {
            return;
        };
        let start = source
            .checked_sub(1)
            .map_or(0, |previous| self.sources[previous].1);
        let removed = remove_reader(&mut self.readers, start, self.sources[source].1, reader);
        if removed == 0 {
            return;
        }

        for (_, end) in &mut self.sources[source..] {
            *end -= removed;
        }
        if self.sources[source].1 == start {
            self.sources.remove(source);
        }
        trim_spare(&mut self.sources);
        trim_spare(&mut self.readers);
    }

    /// Adds one `reader` edge to source `row` in place.
    fn add_edge(&mut self, row: u32, reader: FormulaId) {
        let source = match self.sources.binary_search_by_key(&row, |&(row, _)| row) {
            Ok(source) => source,
            Err(source) => {
                let start = source
                    .checked_sub(1)
                    .map_or(0, |previous| self.sources[previous].1);
                reserve_one(&mut self.sources);
                self.sources.insert(source, (row, start));
                source
            }
        };
        reserve_one(&mut self.readers);
        self.readers.insert(self.sources[source].1 as usize, reader);
        for (_, end) in &mut self.sources[source..] {
            *end += 1;
        }
    }
}

/// Patches of at most this many edges per band or per range batch edit the
/// flat arrays in place; larger ones rebuild what they touch once.
const IN_PLACE_EDGES: usize = 16;

/// In-place edits keep at most `len / SPARE_DIVISOR + SPARE_FLOOR` unused
/// capacity, so a band or group array never doubles for one edit.
const SPARE_DIVISOR: usize = 64;
const SPARE_FLOOR: usize = 8;

fn reserve_one<T>(items: &mut Vec<T>) {
    if items.len() == items.capacity() {
        items.reserve_exact(items.len() / SPARE_DIVISOR + 1);
    }
}

fn trim_spare<T>(items: &mut Vec<T>) {
    let keep = items.len() + items.len() / SPARE_DIVISOR;
    if items.capacity() > keep + SPARE_FLOOR {
        items.shrink_to(keep);
    }
}

/// Removes every `reader` in `readers[start..end]` and returns how many.
fn remove_reader(readers: &mut Vec<FormulaId>, start: u32, end: u32, reader: FormulaId) -> u32 {
    let (start, end) = (start as usize, end as usize);
    let mut write = start;
    for read in start..end {
        if readers[read] != reader {
            readers[write] = readers[read];
            write += 1;
        }
    }
    readers.drain(write..end);
    (end - write) as u32
}

struct RangeGroup {
    range: CellRange,
    /// The end of this group's readers in [`DepIndex::range_readers`].
    end: u32,
}

impl DepIndex {
    /// The groups whose ranges contain `cell`, in `matches`. Column and row
    /// interval matches are intersected by sorting the row matches, so no
    /// per-group scratch is needed.
    fn collect_matching_range_groups(
        &self,
        cell: AbsCellKey,
        matches: &mut Vec<usize>,
        row_matches: &mut Vec<usize>,
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
        row_matches.sort_unstable();
        matches.retain(|group| row_matches.binary_search(group).is_ok());
    }

    /// The id of the group for `range` and the number of groups, when more
    /// than one formula reads the range.
    pub(crate) fn shared_range_group(&self, range: CellRange) -> Option<(usize, usize)> {
        let group = self.find_range_group(range).ok()?;
        (self.group_readers(group).len() > 1).then_some((group, self.range_groups.len()))
    }

    fn find_range_group(&self, range: CellRange) -> Result<usize, usize> {
        self.range_groups
            .binary_search_by(|group| group.range.cmp(&range))
    }

    /// The formulas that read `cell` exactly.
    fn exact_readers(&self, cell: AbsCellKey) -> &[FormulaId] {
        let Ok(column) = self
            .exact
            .binary_search_by_key(&(cell.sheet, cell.col), |column| (column.sheet, column.col))
        else {
            return &[];
        };
        let bands = &self.exact[column].bands;
        let band = cell.row / FORMULA_INDEX_PAGE_ROWS;
        let Some(first) = bands.first() else {
            return &[];
        };
        let Some(band) =
            offset_or_search(bands, band, band.wrapping_sub(first.band), |band| band.band)
                .and_then(|band| bands.get(band))
        else {
            return &[];
        };
        offset_or_search(
            &band.sources,
            cell.row,
            cell.row % FORMULA_INDEX_PAGE_ROWS,
            |&(row, _)| row,
        )
        .map_or(&[], |source| band.readers_at(source))
    }

    /// Every exact source cell of `sheet` with its readers.
    fn exact_sources_of(
        &self,
        sheet: u32,
    ) -> impl Iterator<Item = (AbsCellKey, &[FormulaId])> + '_ {
        let first = self.exact.partition_point(|column| column.sheet < sheet);
        self.exact[first..]
            .iter()
            .take_while(move |column| column.sheet == sheet)
            .flat_map(move |column| {
                column.bands.iter().flat_map(move |band| {
                    band.edges().map(move |(row, readers)| {
                        (AbsCellKey::new(sheet as usize, row, column.col), readers)
                    })
                })
            })
    }

    fn group_readers(&self, group: usize) -> &[FormulaId] {
        let start = group
            .checked_sub(1)
            .and_then(|previous| self.range_groups.get(previous))
            .map_or(0, |group| group.end as usize);
        let end = self
            .range_groups
            .get(group)
            .map_or(start, |group| group.end as usize);
        self.range_readers.get(start..end).unwrap_or(&[])
    }

    pub(crate) fn memory_stats(&self) -> (MemoryOwnerStats, MemoryOwnerStats) {
        let mut nodes = MemoryOwnerStats::default();
        let mut edges = MemoryOwnerStats::default();
        nodes.add_vec::<ExactColumn>(self.exact.len(), self.exact.capacity());
        for column in &self.exact {
            nodes.add_vec::<ExactBand>(column.bands.len(), column.bands.capacity());
            for band in &column.bands {
                nodes.add_vec::<(u32, u32)>(band.sources.len(), band.sources.capacity());
                edges.add_vec::<FormulaId>(band.readers.len(), band.readers.capacity());
            }
        }

        nodes.add_vec::<RangeGroup>(self.range_groups.len(), self.range_groups.capacity());
        edges.add_vec::<FormulaId>(self.range_readers.len(), self.range_readers.capacity());
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
        nodes.add_vec::<(FormulaId, ReadSet)>(self.pending.len(), self.pending.capacity());
        self.pending_ids.add_memory_stats(&mut nodes);
        if let Ok(marks) = self.group_marks.try_borrow() {
            marks.add_memory_stats(&mut nodes);
        }
        for (_, reads) in &self.pending {
            edges.add_vec::<AbsCellKey>(reads.cells.len(), reads.cells.capacity());
            edges.add_vec::<CellRange>(reads.ranges.len(), reads.ranges.capacity());
        }
        (nodes, edges)
    }

    /// Whether any formula reads another formula through its static reads.
    pub(super) fn has_formula_dependencies(&self) -> bool {
        self.has_formula_dependencies
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
        formula: FormulaId,
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

        if self.pending_ids.insert(formula) {
            self.pending.push((
                formula,
                previous.map(|entry| entry.reads).unwrap_or_default(),
            ));
        }
    }

    /// Whether the queue covers enough formulas that a rebuild beats a patch.
    pub(crate) fn needs_rebuild(&self) -> bool {
        self.pending.len() > PATCH_FORMULA_FLOOR.max(self.formulas / PATCH_FORMULA_DIVISOR)
    }

    /// Moves the queued formulas' edges from their old reads to the reads of
    /// their current entries.
    ///
    /// Each touched band and the range readers are rewritten once per batch,
    /// however many of their readers changed. All removals of a band apply
    /// before its additions, so a read kept across the change is removed and
    /// re-added without diffing old reads against new ones.
    pub(crate) fn apply_pending(&mut self, sheets: &[SheetData], slots: &FormulaStore) {
        if self.pending.is_empty() {
            return;
        }

        let pending = std::mem::take(&mut self.pending);
        if self.range_sheets.len() < sheets.len() {
            self.range_sheets
                .resize_with(sheets.len(), RangeSheetIndex::default);
        }

        let mut exact_changes = Vec::new();
        let mut range_removals = Vec::new();
        let mut range_additions = Vec::new();
        for (formula, reads) in &pending {
            self.pending_ids.remove(*formula);
            exact_changes.extend(reads.cells.iter().map(|&cell| (cell, *formula, false)));
            range_removals.extend(reads.ranges.iter().map(|&range| (range, *formula)));

            let Some(entry) = slots.get(*formula) else {
                continue;
            };
            self.has_formula_dependencies = self.has_formula_dependencies
                || !entry.reads.ranges.is_empty()
                || slots
                    .location(*formula)
                    .is_some_and(|key| !self.exact_readers(key).is_empty())
                || entry
                    .reads
                    .cells
                    .iter()
                    .any(|&cell| formula_exists(sheets, cell));
            exact_changes.extend(entry.reads.cells.iter().map(|&cell| (cell, *formula, true)));
            range_additions.extend(entry.reads.ranges.iter().map(|&range| (range, *formula)));
        }

        self.patch_exact(&mut exact_changes);
        self.patch_ranges(&mut range_removals, &mut range_additions);
    }

    /// Rewrites each band touched by `changes` once: `(source, reader, added)`.
    fn patch_exact(&mut self, changes: &mut [(AbsCellKey, FormulaId, bool)]) {
        changes.sort_unstable_by_key(|&(cell, reader, added)| {
            (cell.sheet, cell.col, cell.row, added, reader)
        });
        let mut edges = Vec::new();
        for run in changes.chunk_by(|a, b| {
            (a.0.sheet, a.0.col, a.0.row / FORMULA_INDEX_PAGE_ROWS)
                == (b.0.sheet, b.0.col, b.0.row / FORMULA_INDEX_PAGE_ROWS)
        }) {
            let first = run[0].0;
            let band = first.row / FORMULA_INDEX_PAGE_ROWS;
            let column = match self
                .exact
                .binary_search_by_key(&(first.sheet, first.col), |column| {
                    (column.sheet, column.col)
                }) {
                Ok(column) => column,
                Err(column) => {
                    self.exact.insert(
                        column,
                        ExactColumn {
                            sheet: first.sheet,
                            col: first.col,
                            bands: Vec::new(),
                        },
                    );
                    column
                }
            };
            let bands = &mut self.exact[column].bands;
            let position = bands.binary_search_by_key(&band, |band| band.band);
            if let (Ok(position), true) = (position, run.len() <= IN_PLACE_EDGES) {
                let stored = &mut bands[position];
                self.exact_sources -= stored.sources.len();

                // The removals of a run sort before its additions.
                for &(cell, reader, added) in run {
                    if added {
                        stored.add_edge(cell.row, reader);
                    } else {
                        stored.remove_edge(cell.row, reader);
                    }
                }
                self.exact_sources += stored.sources.len();
                if stored.readers.is_empty() {
                    bands.remove(position);
                }
                if bands.is_empty() {
                    self.exact.remove(column);
                }
                continue;
            }

            // The removals of a run sort before its additions.
            let removed = |row: u32, reader: FormulaId| {
                run.binary_search_by(|&(cell, removed, added)| {
                    (added, cell.row, removed).cmp(&(false, row, reader))
                })
                .is_ok()
            };
            edges.clear();
            if let Ok(position) = position {
                for (row, readers) in bands[position].edges() {
                    edges.extend(
                        readers
                            .iter()
                            .filter(|&&reader| !removed(row, reader))
                            .map(|&reader| (row, reader)),
                    );
                }
                self.exact_sources -= bands[position].sources.len();
            }
            edges.extend(
                run.iter()
                    .filter(|change| change.2)
                    .map(|&(cell, reader, _)| (cell.row, reader)),
            );
            edges.sort_unstable();

            match (position, edges.is_empty()) {
                (Ok(position), true) => {
                    bands.remove(position);
                }
                (Ok(position), false) => bands[position] = ExactBand::from_edges(band, &edges),
                (Err(_), true) => {}
                (Err(position), false) => {
                    bands.insert(position, ExactBand::from_edges(band, &edges));
                }
            }
            let (Ok(position) | Err(position)) = position;
            if let Some(stored) = bands.get(position).filter(|stored| stored.band == band) {
                self.exact_sources += stored.sources.len();
            }
            if bands.is_empty() {
                self.exact.remove(column);
            }
        }
    }

    /// Rewrites the range readers once for a batch: drops removed edges, adds
    /// new ones, adds groups for new ranges and drops groups left without
    /// readers. Group ids are positions, so the interval lists are renumbered
    /// in the same pass: O(range edges + groups + intervals + k log k) for k
    /// new groups.
    fn patch_ranges(
        &mut self,
        removals: &mut [(CellRange, FormulaId)],
        additions: &mut [(CellRange, FormulaId)],
    ) {
        if removals.is_empty() && additions.is_empty() {
            return;
        }
        removals.sort_unstable();
        additions.sort_unstable();
        if removals.len() + additions.len() <= IN_PLACE_EDGES {
            let mut regrouped = false;
            for &(range, reader) in removals.iter() {
                regrouped |= self.remove_range_reader(range, reader);
            }
            for &(range, reader) in additions.iter() {
                regrouped |= self.add_range_reader(range, reader);
            }
            if regrouped {
                for sheet in &mut self.range_sheets {
                    accumulate_max_end(&mut sheet.row_intervals);
                    accumulate_max_end(&mut sheet.col_intervals);
                }
            }
            trim_spare(&mut self.range_groups);
            trim_spare(&mut self.range_readers);
            return;
        }

        let previous = std::mem::take(&mut self.range_groups);
        let previous_readers = std::mem::take(&mut self.range_readers);
        let mut groups = Vec::with_capacity(previous.len() + additions.len());
        let mut readers = Vec::with_capacity(previous_readers.len() + additions.len());
        let mut remap = Vec::with_capacity(previous.len());
        let mut added_ids = Vec::new();
        let mut removed = removals.chunk_by(|a, b| a.0 == b.0).peekable();
        let mut added = additions.chunk_by(|a, b| a.0 == b.0).peekable();
        let mut start = 0;
        for group in &previous {
            while let Some(run) = added.next_if(|run| run[0].0 < group.range) {
                added_ids.push(groups.len());
                readers.extend(run.iter().map(|&(_, reader)| reader));
                groups.push(RangeGroup {
                    range: run[0].0,
                    end: readers.len() as u32,
                });
            }
            while removed.next_if(|run| run[0].0 < group.range).is_some() {}
            let removed_run = removed
                .next_if(|run| run[0].0 == group.range)
                .unwrap_or(&[]);
            let added_run = added.next_if(|run| run[0].0 == group.range).unwrap_or(&[]);

            let end = group.end as usize;
            let kept = readers.len();
            readers.extend(
                previous_readers[start..end]
                    .iter()
                    .filter(|reader| !run_removes(removed_run, reader)),
            );
            readers.extend(added_run.iter().map(|&(_, reader)| reader));
            start = end;
            if readers.len() == kept {
                remap.push(None);
            } else {
                remap.push(Some(groups.len()));
                groups.push(RangeGroup {
                    range: group.range,
                    end: readers.len() as u32,
                });
            }
        }
        for run in added {
            added_ids.push(groups.len());
            readers.extend(run.iter().map(|&(_, reader)| reader));
            groups.push(RangeGroup {
                range: run[0].0,
                end: readers.len() as u32,
            });
        }
        groups.shrink_to_fit();
        readers.shrink_to_fit();
        let regrouped = !added_ids.is_empty() || remap.iter().any(Option::is_none);
        self.range_groups = groups;
        self.range_readers = readers;
        if !regrouped {
            return;
        }

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

    /// Drops every `reader` edge of `range` in place, and the group when it
    /// loses its last reader. Returns whether a group was dropped.
    fn remove_range_reader(&mut self, range: CellRange, reader: FormulaId) -> bool {
        let Ok(group) = self.find_range_group(range) else {
            return false;
        };
        let start = group
            .checked_sub(1)
            .map_or(0, |previous| self.range_groups[previous].end);
        let removed = remove_reader(
            &mut self.range_readers,
            start,
            self.range_groups[group].end,
            reader,
        );
        if removed == 0 {
            return false;
        }

        for later in &mut self.range_groups[group..] {
            later.end -= removed;
        }
        if self.range_groups[group].end != start {
            return false;
        }

        // Group ids are positions: drop this group's intervals and renumber
        // the later ones, which keeps every interval list sorted.
        self.range_groups.remove(group);
        for sheet in &mut self.range_sheets {
            for intervals in [&mut sheet.row_intervals, &mut sheet.col_intervals] {
                intervals.retain_mut(|interval| {
                    if interval.group == group {
                        return false;
                    }
                    if interval.group > group {
                        interval.group -= 1;
                    }
                    true
                });
            }
        }
        true
    }

    /// Adds one `reader` edge to `range` in place, with a new group when no
    /// group covers the range. Returns whether a group was added.
    fn add_range_reader(&mut self, range: CellRange, reader: FormulaId) -> bool {
        let group = match self.find_range_group(range) {
            Ok(group) => {
                reserve_one(&mut self.range_readers);
                self.range_readers
                    .insert(self.range_groups[group].end as usize, reader);
                for later in &mut self.range_groups[group..] {
                    later.end += 1;
                }
                return false;
            }
            Err(group) => group,
        };

        let start = group
            .checked_sub(1)
            .map_or(0, |previous| self.range_groups[previous].end);
        reserve_one(&mut self.range_readers);
        self.range_readers.insert(start as usize, reader);
        reserve_one(&mut self.range_groups);
        self.range_groups.insert(
            group,
            RangeGroup {
                range,
                end: start + 1,
            },
        );
        for later in &mut self.range_groups[group + 1..] {
            later.end += 1;
        }

        for sheet in &mut self.range_sheets {
            for intervals in [&mut sheet.row_intervals, &mut sheet.col_intervals] {
                for interval in intervals
                    .iter_mut()
                    .filter(|interval| interval.group >= group)
                {
                    interval.group += 1;
                }
            }
        }
        if let Some(sheet) = self.range_sheets.get_mut(range.sheet as usize) {
            reserve_one(&mut sheet.row_intervals);
            reserve_one(&mut sheet.col_intervals);
            merge_intervals(
                &mut sheet.row_intervals,
                vec![RangeInterval::new(range.row_start, range.row_end, group)],
            );
            merge_intervals(
                &mut sheet.col_intervals,
                vec![RangeInterval::new(range.col_start, range.col_end, group)],
            );
        }
        true
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
pub(crate) fn build_dep_index(sheets: &[SheetData], slots: &FormulaStore) -> DepIndex {
    let mut exact_edges: Vec<(AbsCellKey, FormulaId)> = Vec::new();
    let mut range_edges: Vec<(CellRange, FormulaId)> = Vec::new();
    let mut formulas = 0;
    let mut dynamic_array_formulas = 0;
    let mut has_formula_dependencies = false;

    for sheet in sheets {
        for id in sheet.formulas.ids() {
            let Some(entry) = slots.get(id) else {
                continue;
            };
            formulas += 1;
            dynamic_array_formulas += usize::from(entry.produces_array());
            exact_edges.extend(entry.reads.cells.iter().map(|&cell| (cell, id)));
            range_edges.extend(entry.reads.ranges.iter().map(|&range| (range, id)));
            has_formula_dependencies = has_formula_dependencies
                || !entry.reads.ranges.is_empty()
                || entry
                    .reads
                    .cells
                    .iter()
                    .any(|&cell| formula_exists(sheets, cell));
        }
    }

    exact_edges.sort_unstable_by_key(|&(cell, reader)| (cell.sheet, cell.col, cell.row, reader));
    let mut exact = Vec::new();
    let mut exact_sources = 0;
    let mut band_edges = Vec::new();
    for column in exact_edges.chunk_by(|a, b| (a.0.sheet, a.0.col) == (b.0.sheet, b.0.col)) {
        let bands = column
            .chunk_by(|a, b| a.0.row / FORMULA_INDEX_PAGE_ROWS == b.0.row / FORMULA_INDEX_PAGE_ROWS)
            .map(|run| {
                band_edges.clear();
                band_edges.extend(run.iter().map(|&(cell, reader)| (cell.row, reader)));
                let band =
                    ExactBand::from_edges(run[0].0.row / FORMULA_INDEX_PAGE_ROWS, &band_edges);
                exact_sources += band.sources.len();
                band
            })
            .collect();
        exact.push(ExactColumn {
            sheet: column[0].0.sheet,
            col: column[0].0.col,
            bands,
        });
    }
    drop(exact_edges);

    range_edges.sort_unstable();
    let mut range_groups = Vec::with_capacity(range_edges.chunk_by(|a, b| a.0 == b.0).count());
    let range_readers: Vec<FormulaId> = range_edges.iter().map(|&(_, reader)| reader).collect();
    let mut end = 0;
    for run in range_edges.chunk_by(|a, b| a.0 == b.0) {
        end += run.len() as u32;
        range_groups.push(RangeGroup {
            range: run[0].0,
            end,
        });
    }
    drop(range_edges);

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
        exact,
        exact_sources,
        range_groups,
        range_readers,
        range_sheets,
        pending: Vec::new(),
        pending_ids: FormulaBits::default(),
        group_marks: RefCell::default(),
        formulas,
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
fn run_removes<T>(run: &[(T, FormulaId)], reader: &FormulaId) -> bool {
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

/// A set of range-group ids that never needs clearing: `slots` maps a group
/// to its position in `members`, and that entry is valid only while `members`
/// holds the group there. A walk keeps per-group state in a vector parallel to
/// `members`, so it touches only the groups it reaches. Kept in the index, it
/// retains one `u32` per group instead of allocating group-sized arrays for
/// every pass.
#[derive(Default)]
struct GroupMarks {
    slots: Vec<u32>,
    members: Vec<u32>,
}

impl GroupMarks {
    fn reset(&mut self, groups: usize) {
        self.members.clear();
        self.slots.resize(groups, 0);
        if self.slots.capacity() > groups.saturating_mul(2) {
            self.slots.shrink_to_fit();
        }
    }

    fn position(&self, group: usize) -> Option<usize> {
        let slot = *self.slots.get(group)? as usize;
        (self.members.get(slot) == Some(&(group as u32))).then_some(slot)
    }

    /// Adds `group` and returns its position, or `None` when it is present.
    fn insert(&mut self, group: usize) -> Option<usize> {
        if self.position(group).is_some() {
            return None;
        }
        let slot = self.members.len();
        *self.slots.get_mut(group)? = slot as u32;
        self.members.push(group as u32);
        Some(slot)
    }

    fn add_memory_stats(&self, stats: &mut MemoryOwnerStats) {
        stats.add_vec::<u32>(self.slots.len(), self.slots.capacity());
        stats.add_vec::<u32>(self.members.len(), self.members.capacity());
    }
}

/// A walk that reached at most this many groups keeps its cleared member list.
const RETAINED_GROUP_MEMBERS: usize = 64;

/// Runs `walk` with the index's group marks, reset for its groups. A nested
/// use gets its own marks instead of failing.
fn with_group_marks<R>(index: &DepIndex, walk: impl FnOnce(&mut GroupMarks) -> R) -> R {
    let mut retained = index.group_marks.try_borrow_mut().ok();
    let mut nested = GroupMarks::default();
    let marks = match retained.as_deref_mut() {
        Some(marks) => marks,
        None => &mut nested,
    };
    marks.reset(index.range_groups.len());
    let result = walk(marks);

    // Group state belongs to one walk; a wide walk must not pin its members.
    marks.members.clear();
    if marks.members.capacity() > RETAINED_GROUP_MEMBERS {
        marks.members = Vec::new();
    }
    result
}

/// Collect every seed into one id worklist so shared readers enter it once.
pub(super) fn collect_affected_formulas(
    sheets: &[SheetData],
    slots: &FormulaStore,
    seeds: &[usize],
    index: &DepIndex,
    affected: FormulaWork,
) -> FormulaWork {
    with_group_marks(index, |fired| {
        let mut walk = DirtyWalk {
            sheets,
            slots,
            index,
            affected,
            range_matches: Vec::new(),
            row_matches: Vec::new(),
            fired,
        };
        for &seed in seeds {
            walk.seed_sheet(seed);
        }

        let mut cursor = 0;
        while let Some(id) = walk.affected.id_at(cursor) {
            cursor += 1;
            if let Some(key) = slots.location(id) {
                walk.readers(key);
            }
        }
        walk.affected
    })
}

struct DirtyWalk<'a> {
    sheets: &'a [SheetData],
    slots: &'a FormulaStore,
    index: &'a DepIndex,
    affected: FormulaWork,
    range_matches: Vec<usize>,
    row_matches: Vec<usize>,
    /// Range groups whose readers are already selected.
    fired: &'a mut GroupMarks,
}

impl DirtyWalk<'_> {
    fn select_cell(&mut self, cell: AbsCellKey) {
        if let Some(id) = self
            .sheets
            .get(cell.sheet as usize)
            .and_then(|sheet| sheet.formulas.id(cell.local()))
        {
            self.affected.insert(id);
        }
    }

    fn select_readers(&mut self, readers: &[FormulaId]) {
        for &reader in readers {
            self.affected.insert(reader);
        }
    }

    fn fire_group(&mut self, group: usize) {
        if self.fired.insert(group).is_some() {
            let index = self.index;
            self.select_readers(index.group_readers(group));
        }
    }

    fn readers(&mut self, cell: AbsCellKey) {
        let index = self.index;
        self.select_readers(index.exact_readers(cell));
        index.collect_matching_range_groups(cell, &mut self.range_matches, &mut self.row_matches);
        let mut offset = 0;
        while let Some(&group) = self.range_matches.get(offset) {
            offset += 1;
            debug_assert!(index
                .range_groups
                .get(group)
                .is_some_and(|group| group.range.contains(cell)));
            self.fire_group(group);
        }
    }

    fn seed_cell(&mut self, cell: AbsCellKey) {
        if let Some(id) = self
            .sheets
            .get(cell.sheet as usize)
            .and_then(|sheet| sheet.formulas.id(cell.local()))
        {
            self.affected.insert(id);
        } else {
            // A literal has no formula id but still seeds its address's readers.
            self.readers(cell);
        }
    }

    fn seed_sheet(&mut self, seed: usize) {
        let Some(sheet) = self.sheets.get(seed) else {
            return;
        };
        let index = self.index;
        match sheet.formulas.dirty_seeds() {
            DirtySeeds::Cells(cells) => {
                for &cell in cells {
                    self.seed_cell(AbsCellKey::from_local(seed, cell));
                }
            }
            DirtySeeds::Ranges(rects) => self.seed_rectangles(seed, rects),
            DirtySeeds::All => {
                for id in sheet.formulas.ids() {
                    self.affected.insert(id);
                }
                for (_, readers) in index.exact_sources_of(seed as u32) {
                    self.select_readers(readers);
                }
                for (group, entry) in index.range_groups.iter().enumerate() {
                    if entry.range.sheet == seed as u32 {
                        self.fire_group(group);
                    }
                }
            }
        }
        if sheet.formulas.has_volatile() {
            for cell in sheet.formulas.volatile_keys(self.slots) {
                self.select_cell(AbsCellKey::from_local(seed, cell));
            }
        }
    }

    fn seed_rectangles(&mut self, seed: usize, rects: &[DirtyRect]) {
        const ENUMERATED_RECT_CELLS: u64 = 4096;
        let Some(sheet) = self.sheets.get(seed) else {
            return;
        };
        let index = self.index;
        let area = |rect: &DirtyRect| {
            (u64::from(rect.row_end - rect.row_start) + 1)
                .saturating_mul(u64::from(rect.col_end - rect.col_start) + 1)
        };
        let registered_sources = (sheet.formulas.len() as u64)
            .saturating_add(index.exact_sources as u64)
            .saturating_add(index.range_groups.len() as u64);
        let walked_cells = rects
            .iter()
            .map(area)
            .filter(|&cells| cells <= ENUMERATED_RECT_CELLS)
            .fold(0u64, u64::saturating_add);
        let walks_cells = walked_cells <= registered_sources;
        let is_small = |rect: &DirtyRect| walks_cells && area(rect) <= ENUMERATED_RECT_CELLS;
        for rect in rects.iter().filter(|rect| is_small(rect)) {
            for row in rect.row_start..=rect.row_end {
                for col in rect.col_start..=rect.col_end {
                    self.seed_cell(AbsCellKey::from_local(seed, (row, col)));
                }
            }
        }
        if !rects.iter().any(|rect| !is_small(rect)) {
            return;
        }

        // Large edits scan registered sources, never the logical rectangle area.
        let contains = |cell| {
            rects
                .iter()
                .filter(|rect| !is_small(rect))
                .any(|rect| rect.contains(cell))
        };
        for cell in sheet.formulas.keys().filter(|&cell| contains(cell)) {
            self.select_cell(AbsCellKey::from_local(seed, cell));
        }
        for (cell, readers) in index.exact_sources_of(seed as u32) {
            if contains(cell.local()) {
                self.select_readers(readers);
            }
        }
        for (group, entry) in index.range_groups.iter().enumerate() {
            let range = entry.range;
            if range.sheet == seed as u32
                && rects.iter().filter(|rect| !is_small(rect)).any(|rect| {
                    rect.intersects(DirtyRect {
                        row_start: range.row_start,
                        col_start: range.col_start,
                        row_end: range.row_end,
                        col_end: range.col_end,
                    })
                })
            {
                self.fire_group(group);
            }
        }
    }
}

/// Formulas that read any of `cells` directly, by cell or by range. Unlike
/// [`collect_affected_formulas`], this does not follow dependents further.
pub(super) fn direct_readers(
    index: &DepIndex,
    slots: &FormulaStore,
    sheet: usize,
    cells: &[(u32, u32)],
) -> FxHashSet<AbsCellKey> {
    with_group_marks(index, |fired| {
        let mut readers = FxHashSet::default();
        let mut range_matches: Vec<usize> = Vec::new();
        let mut row_matches: Vec<usize> = Vec::new();
        let mut add = |ids: &[FormulaId]| {
            readers.extend(ids.iter().filter_map(|&id| slots.location(id)));
        };
        for &cell in cells {
            let cell = AbsCellKey::from_local(sheet, cell);
            add(index.exact_readers(cell));
            index.collect_matching_range_groups(cell, &mut range_matches, &mut row_matches);
            for &group in &range_matches {
                if fired.insert(group).is_some() {
                    add(index.group_readers(group));
                }
            }
        }
        readers
    })
}

fn formula_exists(sheets: &[SheetData], key: AbsCellKey) -> bool {
    sheets
        .get(key.sheet as usize)
        .is_some_and(|sheet| sheet.formulas.contains(key.local()))
}

/// Seeds indexed results with the depth and cycle errors of `affected`. Returns whether
/// any formula met a circular reference, so iterative calculation runs its
/// component pass only for workbooks that have one.
pub(super) fn seed_dependency_depth_errors(
    sheets: &[SheetData],
    slots: &FormulaStore,
    affected: &FormulaWork,
    index: &DepIndex,
    results: &mut FormulaResults,
) -> bool {
    seed_depth_errors(sheets, slots, affected, index, results, false)
}

/// Spill expansion may add formulas, but must not replace values of components
/// that iterative calculation has already settled before installing spills.
pub(super) fn seed_additional_depth_errors(
    sheets: &[SheetData],
    slots: &FormulaStore,
    affected: &FormulaWork,
    index: &DepIndex,
    results: &mut FormulaResults,
) -> bool {
    seed_depth_errors(sheets, slots, affected, index, results, true)
}

fn seed_depth_errors(
    sheets: &[SheetData],
    slots: &FormulaStore,
    affected: &FormulaWork,
    index: &DepIndex,
    results: &mut FormulaResults,
    preserve_results: bool,
) -> bool {
    if !index.has_formula_dependencies {
        return false;
    }

    with_group_marks(index, |ranges| {
        let mut walk = DependencyDepthWalk::new(sheets, slots, index, affected, ranges);
        // The pass evaluates formulas as the walk finishes them, after
        // every formula they read.
        walk.order = std::mem::take(&mut results.order);
        walk.order.clear();
        let mut found_cycle = false;
        // Roots in column-major order: the walk finishes each formula after
        // the formulas it reads, which is the order the pass evaluates.
        for node in 0..walk.formulas.len() {
            let id = walk.formulas[node].1;
            if let Err(error) = walk.depth(node) {
                found_cycle |= error == FormulaError::Cycle;
                if !preserve_results || !results.has(id) {
                    results.seeded.push((id, error));
                }
            }
        }
        results.order = std::mem::take(&mut walk.order);
        results.ordered = true;
        found_cycle
    })
}

/// A node of the depth/cycle graph. A range read is one node shared by all of
/// its readers instead of an edge from every reader to every formula inside it,
/// so the graph grows with formulas plus distinct ranges, not with readers times
/// range members. A formula adds one level of depth; a range adds none.
///
/// A formula node is its position in the walk's column-major formula list; a
/// range node is its group id. Both index plain state vectors.
#[derive(Clone, Copy, Eq, PartialEq)]
enum DependencyNode {
    Formula(usize),
    Range(usize),
}

#[derive(Clone, Copy)]
enum NodeDepth {
    /// An affected formula the walk has not entered yet.
    Pending,
    /// On the walk stack: reaching it again closes a cycle.
    Visiting,
    Done(Result<usize, FormulaError>),
}

/// The walked formulas in column-major order with their ids, so a range finds
/// its members by binary search and a formula address finds its node.
struct WalkFormulas(Vec<(AbsCellKey, FormulaId)>);

impl WalkFormulas {
    fn new(mut formulas: Vec<(AbsCellKey, FormulaId)>) -> Self {
        formulas.sort_unstable_by_key(|&(key, _)| column_major(key));
        Self(formulas)
    }

    fn len(&self) -> usize {
        self.0.len()
    }

    fn node(&self, key: AbsCellKey) -> Option<usize> {
        self.0
            .binary_search_by_key(&column_major(key), |&(key, _)| column_major(key))
            .ok()
    }
}

impl std::ops::Index<usize> for WalkFormulas {
    type Output = (AbsCellKey, FormulaId);

    fn index(&self, node: usize) -> &Self::Output {
        &self.0[node]
    }
}

/// The outgoing edges of one graph node, read from the formula entry in place.
struct EdgeCursor<'a> {
    node: DependencyNode,
    /// The formula's direct reads; empty for a range node.
    cells: &'a [AbsCellKey],
    /// The formula's range reads; empty for a range node.
    ranges: &'a [CellRange],
    /// For a range node, the range it covers.
    range: Option<CellRange>,
    /// For a formula, the index into `cells` then `ranges`; for a range, the
    /// index into the walk's column-major formula list.
    next: usize,
}

impl<'a> EdgeCursor<'a> {
    fn new(
        slots: &'a FormulaStore,
        index: &DepIndex,
        formulas: &WalkFormulas,
        node: DependencyNode,
    ) -> Self {
        match node {
            DependencyNode::Formula(position) => {
                let (cells, ranges): (&'a [AbsCellKey], &'a [CellRange]) =
                    slots.get(formulas[position].1).map_or((&[], &[]), |entry| {
                        (&entry.reads.cells, &entry.reads.ranges)
                    });
                Self {
                    node,
                    cells,
                    ranges,
                    range: None,
                    next: 0,
                }
            }
            DependencyNode::Range(group) => {
                let range = index.range_groups.get(group).map(|group| group.range);
                let next = range.map_or(formulas.len(), |range| {
                    let first = (range.sheet, range.col_start, range.row_start);
                    formulas
                        .0
                        .partition_point(|&(key, _)| column_major(key) < first)
                });
                Self {
                    node,
                    cells: &[],
                    ranges: &[],
                    range,
                    next,
                }
            }
        }
    }

    /// The next dependency inside the walked graph: direct reads of walked
    /// formulas, every indexed range read, and the members of a range.
    fn next_dependency(
        &mut self,
        index: &DepIndex,
        formulas: &WalkFormulas,
    ) -> Option<DependencyNode> {
        let Some(range) = self.range else {
            // Only walked formulas can extend a path; other direct reads are
            // values.
            while let Some(&cell) = self.cells.get(self.next) {
                self.next += 1;
                if let Some(node) = formulas.node(cell) {
                    return Some(DependencyNode::Formula(node));
                }
            }
            while let Some(&range) = self.ranges.get(self.next - self.cells.len()) {
                self.next += 1;
                if let Ok(group) = index.find_range_group(range) {
                    return Some(DependencyNode::Range(group));
                }
            }
            return None;
        };

        // Members are contiguous per column, so rows outside the range and the
        // rest of a column are skipped by binary search rather than scanned.
        let members = &formulas.0;
        while let Some(&(key, _)) = members.get(self.next) {
            if key.sheet != range.sheet || key.col > range.col_end {
                return None;
            }
            if key.row < range.row_start {
                self.next += members[self.next..].partition_point(|&(cell, _)| {
                    column_major(cell) < (key.sheet, key.col, range.row_start)
                });
            } else if key.row > range.row_end {
                self.next += members[self.next..]
                    .partition_point(|&(cell, _)| (cell.sheet, cell.col) <= (key.sheet, key.col));
            } else {
                let node = self.next;
                self.next += 1;
                return Some(DependencyNode::Formula(node));
            }
        }
        None
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

/// Depth and cycle checks over the affected formulas. Scratch memory is one
/// state per affected formula and per range read reached, plus a stack no
/// deeper than the longest dependency path; edges are read from the formula
/// entries in place.
struct DependencyDepthWalk<'a> {
    slots: &'a FormulaStore,
    index: &'a DepIndex,
    formulas: WalkFormulas,
    formula_states: Vec<NodeDepth>,
    ranges: &'a mut GroupMarks,
    /// Parallel to `ranges.members`.
    range_states: Vec<NodeDepth>,
    stack: Vec<DependencyFrame<'a>>,
    /// Formulas that finished without an error, each after the formulas it reads.
    order: Vec<FormulaId>,
}

impl<'a> DependencyDepthWalk<'a> {
    fn new(
        sheets: &[SheetData],
        slots: &'a FormulaStore,
        index: &'a DepIndex,
        affected: &FormulaWork,
        ranges: &'a mut GroupMarks,
    ) -> Self {
        // Selected ids are indexed at their locations: every path that fills a
        // formula slot indexes it there or retires it (`SheetFormulas`), so the
        // walk does not search the addresses again.
        let formulas = WalkFormulas::new(
            affected
                .ids()
                .filter_map(|id| {
                    slots.get(id)?;
                    let key = slots.location(id)?;
                    debug_assert_eq!(
                        sheets
                            .get(key.sheet as usize)
                            .and_then(|sheet| sheet.formulas.id(key.local())),
                        Some(id),
                        "an occupied formula slot is indexed at its location"
                    );
                    Some((key, id))
                })
                .collect(),
        );
        let formula_states = vec![NodeDepth::Pending; formulas.len()];
        Self {
            slots,
            index,
            formulas,
            formula_states,
            ranges,
            range_states: Vec::new(),
            stack: Vec::new(),
            order: Vec::new(),
        }
    }

    fn state(&self, node: DependencyNode) -> Option<NodeDepth> {
        match node {
            DependencyNode::Formula(position) => self.formula_states.get(position).copied(),
            DependencyNode::Range(group) => self
                .ranges
                .position(group)
                .and_then(|slot| self.range_states.get(slot).copied()),
        }
    }

    fn set_state(&mut self, node: DependencyNode, state: NodeDepth) {
        match node {
            DependencyNode::Formula(position) => {
                if let Some(stored) = self.formula_states.get_mut(position) {
                    *stored = state;
                }
            }
            DependencyNode::Range(group) => match self.ranges.position(group) {
                Some(slot) => self.range_states[slot] = state,
                None => {
                    if self.ranges.insert(group).is_some() {
                        self.range_states.push(state);
                    }
                }
            },
        }
    }

    /// Depth of formula `node` counted in formulas, or the first error a
    /// dependency reports: `Cycle` when a path returns to a node still on the
    /// stack, `Num` past [`FORMULA_RECURSION_LIMIT`]. A path is not cut at the
    /// limit, so a cycle beyond it still reports `Cycle`.
    fn depth(&mut self, node: usize) -> Result<usize, FormulaError> {
        let root = DependencyNode::Formula(node);
        match self.state(root) {
            None => return Ok(1),
            Some(NodeDepth::Done(result)) => return result,
            Some(NodeDepth::Pending | NodeDepth::Visiting) => self.enter(root),
        }

        // The root is the last node to finish.
        let mut finished = Ok(0);
        while let Some(frame) = self.stack.last_mut() {
            let dependency = if frame.deepest.is_ok() {
                frame.edges.next_dependency(self.index, &self.formulas)
            } else {
                None
            };
            if let Some(dependency) = dependency {
                match self.state(dependency) {
                    Some(NodeDepth::Done(result)) => {
                        if let Some(frame) = self.stack.last_mut() {
                            frame.include(result);
                        }
                    }
                    Some(NodeDepth::Visiting) => {
                        if let Some(frame) = self.stack.last_mut() {
                            frame.deepest = Err(FormulaError::Cycle);
                        }
                    }
                    Some(NodeDepth::Pending) | None => self.enter(dependency),
                }
                continue;
            }

            finished = frame.finish();
            let node = frame.edges.node;
            self.stack.pop();
            if let (DependencyNode::Formula(position), Ok(_)) = (node, finished) {
                self.order.push(self.formulas[position].1);
            }
            self.set_state(node, NodeDepth::Done(finished));
            if let Some(parent) = self.stack.last_mut() {
                parent.include(finished);
            }
        }
        finished
    }

    fn enter(&mut self, node: DependencyNode) {
        self.set_state(node, NodeDepth::Visiting);
        self.stack.push(DependencyFrame {
            edges: EdgeCursor::new(self.slots, self.index, &self.formulas, node),
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
    slots: &'a FormulaStore,
    index: &'a DepIndex,
    formulas: WalkFormulas,
    formula_states: Vec<ComponentState>,
    ranges: &'a mut GroupMarks,
    /// Parallel to `ranges.members`.
    range_states: Vec<ComponentState>,
    /// Entered nodes not yet assigned to a component.
    open: Vec<DependencyNode>,
    stack: Vec<ComponentFrame<'a>>,
    discovered: u32,
}

impl<'a> ComponentWalk<'a> {
    fn state(&self, node: DependencyNode) -> Option<ComponentState> {
        match node {
            DependencyNode::Formula(position) => self.formula_states.get(position).copied(),
            DependencyNode::Range(group) => self
                .ranges
                .position(group)
                .and_then(|slot| self.range_states.get(slot).copied()),
        }
    }

    fn set_state(&mut self, node: DependencyNode, state: ComponentState) {
        match node {
            DependencyNode::Formula(position) => {
                if let Some(stored) = self.formula_states.get_mut(position) {
                    *stored = state;
                }
            }
            DependencyNode::Range(group) => match self.ranges.position(group) {
                Some(slot) => self.range_states[slot] = state,
                None => {
                    if self.ranges.insert(group).is_some() {
                        self.range_states.push(state);
                    }
                }
            },
        }
    }

    fn enter(&mut self, node: DependencyNode) {
        let index = self.discovered;
        self.discovered += 1;
        self.set_state(node, ComponentState::Open(index));
        self.open.push(node);
        self.stack.push(ComponentFrame {
            edges: EdgeCursor::new(self.slots, self.index, &self.formulas, node),
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
            if let Some(dependency) = frame.edges.next_dependency(self.index, &self.formulas) {
                if dependency == frame.edges.node {
                    frame.reads_itself = true;
                    continue;
                }
                match self.state(dependency) {
                    Some(ComponentState::Open(index)) => {
                        if let Some(frame) = self.stack.last_mut() {
                            frame.low_link = frame.low_link.min(index);
                        }
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
            self.set_state(node, ComponentState::Closed);
            size += 1;
            if let DependencyNode::Formula(position) = node {
                output.formulas.push(self.formulas[position].0);
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
    slots: &FormulaStore,
    index: &DepIndex,
    cyclic: &[AbsCellKey],
) -> CircularComponents {
    let formulas = WalkFormulas::new(
        cyclic
            .iter()
            .filter_map(|&key| {
                Some((
                    key,
                    sheets.get(key.sheet as usize)?.formulas.id(key.local())?,
                ))
            })
            .collect(),
    );
    let mut output = CircularComponents {
        formulas: Vec::with_capacity(formulas.len()),
        ends: Vec::new(),
    };
    with_group_marks(index, |ranges| {
        let mut walk = ComponentWalk {
            slots,
            index,
            formula_states: vec![ComponentState::Unvisited; formulas.len()],
            formulas,
            ranges,
            range_states: Vec::new(),
            open: Vec::new(),
            stack: Vec::new(),
            discovered: 0,
        };
        for position in 0..walk.formulas.len() {
            let root = DependencyNode::Formula(position);
            if matches!(walk.state(root), Some(ComponentState::Unvisited)) {
                walk.walk(root, &mut output);
            }
        }
    });
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::CellStore;
    use crate::types::Value;

    type IntervalRow = (u32, u32, usize, u32);

    /// Everything a rebuild derives from the entries. Reader order carries no
    /// meaning, so reader lists are compared sorted.
    #[derive(Debug, PartialEq)]
    struct IndexContents {
        exact: Vec<(AbsCellKey, Vec<FormulaId>)>,
        exact_sources: usize,
        ranges: Vec<(CellRange, Vec<FormulaId>)>,
        intervals: Vec<[Vec<IntervalRow>; 2]>,
        formulas: usize,
        dynamic_array_formulas: usize,
    }

    fn sorted_readers(readers: &[FormulaId]) -> Vec<FormulaId> {
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
        let exact: Vec<_> = index
            .exact
            .iter()
            .flat_map(|column| {
                column.bands.iter().flat_map(move |band| {
                    band.edges().map(move |(row, readers)| {
                        (
                            AbsCellKey::new(column.sheet as usize, row, column.col),
                            sorted_readers(readers),
                        )
                    })
                })
            })
            .collect();

        IndexContents {
            exact,
            exact_sources: index.exact_sources,
            ranges: (0..index.range_groups.len())
                .map(|group| {
                    (
                        index.range_groups[group].range,
                        sorted_readers(index.group_readers(group)),
                    )
                })
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
        let rebuilt = build_dep_index(&store.sheets, &store.formula_slots);
        let patched = store
            .graph
            .ensure_index(&store.sheets, &store.formula_slots);

        assert!(patched.pending.is_empty());
        assert_eq!(index_contents(patched), index_contents(&rebuilt));
        assert!(patched.has_formula_dependencies || !rebuilt.has_formula_dependencies);
    }

    #[test]
    fn a_reused_formula_id_moves_its_edges_before_the_next_pass() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(3, 4);
        store.set_number(sheet, 0, 0, 1.0, 0);
        store.set_number(sheet, 1, 0, 10.0, 0);
        store.set_formula(sheet, 0, 1, "=A1*2", 0);
        store.set_formula(sheet, 1, 1, "=SUM(A1:A2)", 0);
        store.recompute(sheet);
        let removed = store
            .formula_id(AbsCellKey::new(sheet, 0, 1))
            .expect("formula");

        // The removed slot is free for the next formula, at another address
        // and with other reads, before any pass applies the removal.
        store.clear_cell(sheet, 0, 1, 0);
        store.set_formula(sheet, 2, 2, "=A2+B2", 0);
        assert_eq!(
            store.formula_id(AbsCellKey::new(sheet, 2, 2)),
            Some(removed)
        );
        store.recompute(sheet);
        assert_patch_matches_rebuild(&mut store);
        assert_eq!(store.get_cell(sheet, 2, 2).num(), 21.0);

        store.set_number(sheet, 0, 0, 5.0, 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 0, 1).num(), 0.0);
        assert_eq!(store.get_cell(sheet, 2, 2).num(), 25.0);
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
                    let mut affected = FormulaWork::default();
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
                        affected.select(&store.sheets, AbsCellKey::new(sheet, row as u32, 0));
                    }

                    let index = build_dep_index(&store.sheets, &store.formula_slots);
                    let mut memo = FormulaResults::default();
                    seed_dependency_depth_errors(
                        &store.sheets,
                        &store.formula_slots,
                        &affected,
                        &index,
                        &mut memo,
                    );
                    assert_eq!(memo.seeded.len(), CHAIN_ROWS - FORMULA_RECURSION_LIMIT);
                    for row in 0..CHAIN_ROWS {
                        let key = AbsCellKey::new(sheet, row as u32, 0);
                        if row < FORMULA_RECURSION_LIMIT {
                            assert!(memo
                                .seeded_result(store.formula_id(key).expect("formula"))
                                .is_none());
                        } else {
                            assert!(matches!(
                                memo.seeded_result(store.formula_id(key).expect("formula"))
                                    .as_ref(),
                                Some(Value::Error(FormulaError::Num))
                            ));
                        }
                    }

                    store.set_formula(sheet, 0, 0, &format!("=A{CHAIN_ROWS}"), 0);
                    let index = build_dep_index(&store.sheets, &store.formula_slots);
                    memo.clear();
                    seed_dependency_depth_errors(
                        &store.sheets,
                        &store.formula_slots,
                        &affected,
                        &index,
                        &mut memo,
                    );
                    assert_eq!(memo.seeded.len(), CHAIN_ROWS);
                    assert!(affected.keys(&store.formula_slots).all(|key| matches!(
                        memo.seeded_result(store.formula_id(key).expect("formula"))
                            .as_ref(),
                        Some(Value::Error(FormulaError::Cycle))
                    )));
                }
            })
            .expect("create bounded-stack dependency test thread")
            .join()
            .expect("bounded-stack dependency walk must finish");
    }
}
