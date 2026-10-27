//! Incremental cache of one pivot table (the full engine's pivot feature; the
//! `PIVOTBY` formula does not use it).
//!
//! For each source row the cache keeps the group it belongs to on the row
//! axis and on the column axis, and the values it contributed. For every pair
//! of row and column groups, at every level (leaf, subtotal and grand total),
//! it keeps one partial aggregate per value field. An edit of k source rows
//! removes the old contribution of each row and adds the new one, which is
//! O(k · fields) partial updates, independent of the source size.
//!
//! COUNT and COUNTA keep reversible counters; SUM and AVERAGE keep an exact
//! sum, so removals do not drift from a fresh build. MIN, MAX and
//! DISTINCTCOUNT keep a counted ordered multiset, so removing an extreme reads
//! the next one without a scan of the source rows.
//!
//! Group keys, their order and the numbers that aggregates count come from
//! [`crate::eval::analysis::grouping`], which `GROUPBY` and `PIVOTBY` share.

use std::collections::BTreeMap;
use std::hash::{Hash, Hasher};
use std::mem::size_of;
use std::rc::Rc;

use rustc_hash::{FxHashMap, FxHasher};

use crate::eval::analysis::grouping::{
    compare_group_values, key_part, range_number, KeyPart, TOTAL_LABEL,
};
use crate::store::pivot_output::MAX_PIVOT_OUTPUT_CELLS;
use crate::types::{FormulaError, Value};

/// Row and column groups one pivot may hold; more gives `#NUM!`.
pub(crate) const MAX_PIVOT_GROUPS: usize = 100_000;

/// A row outside the pivot: filtered out, or with an error in a key field.
const NO_GROUP: u32 = u32::MAX;
/// Group 0 of each axis is the grand total.
const ROOT: u32 = 0;

const KIND_BLANK: u8 = 0;
const KIND_NUMBER: u8 = 1;
const KIND_TEXT: u8 = 2;
const KIND_BOOL: u8 = 3;
const KIND_ERROR: u8 = 4;

/// Multiset key tags. MIN and MAX store only numbers, so their keys sort in
/// numeric order; DISTINCTCOUNT counts keys of every tag.
const TAG_NUMBER: u8 = 0;
const TAG_TEXT: u8 = 1;
const TAG_BOOL: u8 = 2;

/// Field types that [`source_fields`] reports.
pub(crate) const FIELD_BLANK: u8 = 0;
const FIELD_NUMBER: u8 = 1;
const FIELD_TEXT: u8 = 2;
const FIELD_BOOL: u8 = 3;
const FIELD_MIXED: u8 = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Aggregation {
    Sum,
    Count,
    Average,
    Min,
    Max,
    CountA,
    DistinctCount,
}

impl Aggregation {
    /// The wire code: SUM 0, COUNT 1, AVERAGE 2, MIN 3, MAX 4, COUNTA 5,
    /// DISTINCTCOUNT 6.
    pub(crate) fn from_code(code: u32) -> Option<Self> {
        Some(match code {
            0 => Self::Sum,
            1 => Self::Count,
            2 => Self::Average,
            3 => Self::Min,
            4 => Self::Max,
            5 => Self::CountA,
            6 => Self::DistinctCount,
            _ => return None,
        })
    }

    fn caption(self) -> &'static str {
        match self {
            Self::Sum => "Sum",
            Self::Count | Self::CountA => "Count",
            Self::Average => "Average",
            Self::Min => "Min",
            Self::Max => "Max",
            Self::DistinctCount => "Distinct Count",
        }
    }

    /// COUNT skips errors and COUNTA counts them, as the worksheet functions
    /// do; every other aggregate shows the first error of its rows.
    fn shows_errors(self) -> bool {
        !matches!(self, Self::Count | Self::CountA)
    }

    fn keeps_multiset(self) -> bool {
        matches!(self, Self::Min | Self::Max | Self::DistinctCount)
    }

    fn keeps_sum(self) -> bool {
        matches!(self, Self::Sum | Self::Average)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PivotValue {
    pub(crate) field: usize,
    pub(crate) aggregation: Aggregation,
    pub(crate) name: Option<String>,
}

/// A keep-list: a row stays when its value equals one of `keep`.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PivotFilter {
    pub(crate) field: usize,
    pub(crate) keep: Vec<Value>,
}

impl PivotFilter {
    fn keeps(&self, value: &Value) -> bool {
        let Ok(part) = key_part(value) else {
            return false;
        };
        self.keep.iter().any(|kept| {
            key_part(kept).is_ok_and(|kept_part| kept_part == part)
                && compare_group_values(kept, value).is_eq()
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct PivotSpec {
    pub(crate) rows: Vec<usize>,
    pub(crate) columns: Vec<usize>,
    pub(crate) values: Vec<PivotValue>,
    pub(crate) filters: Vec<PivotFilter>,
    /// Sort direction of each row level; `true` is descending.
    pub(crate) row_descending: Vec<bool>,
    pub(crate) column_descending: Vec<bool>,
    pub(crate) row_totals: bool,
    pub(crate) column_totals: bool,
    pub(crate) subtotals: bool,
    pub(crate) tabular: bool,
}

impl PivotSpec {
    /// Every field the cache reads, so a source narrower than this is invalid.
    pub(crate) fn max_field(&self) -> Option<usize> {
        self.rows
            .iter()
            .chain(&self.columns)
            .chain(self.values.iter().map(|value| &value.field))
            .chain(self.filters.iter().map(|filter| &filter.field))
            .copied()
            .max()
    }

    /// Heap bytes the spec owns: field lists, value names and filter keeps.
    pub(crate) fn retained_bytes(&self) -> usize {
        (self.rows.capacity() + self.columns.capacity()) * size_of::<usize>()
            + self.values.capacity() * size_of::<PivotValue>()
            + self
                .values
                .iter()
                .filter_map(|value| value.name.as_ref())
                .map(String::capacity)
                .sum::<usize>()
            + self.filters.capacity() * size_of::<PivotFilter>()
            + self
                .filters
                .iter()
                .map(|filter| {
                    filter.keep.capacity() * size_of::<Value>() + text_bytes(&filter.keep)
                })
                .sum::<usize>()
            + self.row_descending.capacity()
            + self.column_descending.capacity()
    }
}

/// Text payload bytes of `values`.
fn text_bytes(values: &[Value]) -> usize {
    values
        .iter()
        .map(|value| match value {
            Value::Text(text) => text.len(),
            _ => 0,
        })
        .sum()
}

/// The data rows of a pivot source. Row 0 is the first row below the header.
pub(crate) trait PivotSource {
    fn rows(&self) -> usize;
    fn width(&self) -> usize;
    fn header(&self, field: usize) -> Value;
    fn value(&self, row: usize, field: usize) -> Value;
}

struct AxisGroup {
    /// The key of the group's first source row, as `PIVOTBY` shows it.
    label: Value,
    /// The source row `label` came from.
    donor: u32,
    parent: u32,
    depth: u32,
    /// Source rows in the group; a group with none is removed.
    rows: u32,
    /// Next group whose key has the same hash.
    next_same_hash: u32,
}

/// The groups of one axis: a tree whose level `n` groups rows by the first
/// `n` axis fields, with the grand total at the root.
struct Axis {
    width: usize,
    groups: Vec<AxisGroup>,
    by_hash: FxHashMap<u64, u32>,
    free: Vec<u32>,
    live: usize,
}

fn key_hash(parent: u32, part: &KeyPart) -> u64 {
    let mut hasher = FxHasher::default();
    parent.hash(&mut hasher);
    part.hash(&mut hasher);
    hasher.finish()
}

impl Axis {
    fn new(width: usize) -> Self {
        Self {
            width,
            groups: vec![AxisGroup {
                label: Value::Blank,
                donor: NO_GROUP,
                parent: NO_GROUP,
                depth: 0,
                rows: 0,
                next_same_hash: NO_GROUP,
            }],
            by_hash: FxHashMap::default(),
            free: Vec::new(),
            live: 0,
        }
    }

    /// Counts source `row` in its group at every level, creating missing
    /// groups. A row before a group's donor, or the donor itself, sets its
    /// label. The caller checked that no key is an error. Returns the leaf
    /// group and whether a group was created or relabeled.
    fn enter(&mut self, keys: &[Value], row: u32) -> (u32, bool) {
        self.groups[ROOT as usize].rows += 1;
        let mut parent = ROOT;
        let mut changed = false;
        for (level, value) in keys.iter().enumerate() {
            let part = key_part(value).expect("key errors are checked before grouping");
            let hash = key_hash(parent, &part);
            let group = match self.find(parent, hash, value) {
                Some(group) => {
                    let entry = &mut self.groups[group as usize];
                    if row <= entry.donor && entry.label != *value {
                        // Equal keys keep one hash, so relabeling keeps the
                        // group in its chain.
                        entry.label = value.clone();
                        changed = true;
                    }
                    entry.donor = entry.donor.min(row);
                    group
                }
                None => {
                    changed = true;
                    self.insert(parent, hash, value.clone(), level as u32 + 1, row)
                }
            };
            self.groups[group as usize].rows += 1;
            parent = group;
        }
        (parent, changed)
    }

    fn find(&self, parent: u32, hash: u64, value: &Value) -> Option<u32> {
        let mut group = *self.by_hash.get(&hash)?;
        while group != NO_GROUP {
            let candidate = &self.groups[group as usize];
            if candidate.parent == parent && compare_group_values(&candidate.label, value).is_eq() {
                return Some(group);
            }
            group = candidate.next_same_hash;
        }
        None
    }

    fn insert(&mut self, parent: u32, hash: u64, label: Value, depth: u32, donor: u32) -> u32 {
        let next_same_hash = self.by_hash.get(&hash).copied().unwrap_or(NO_GROUP);
        let group = AxisGroup {
            label,
            donor,
            parent,
            depth,
            rows: 0,
            next_same_hash,
        };
        let index = match self.free.pop() {
            Some(index) => {
                self.groups[index as usize] = group;
                index
            }
            None => {
                self.groups.push(group);
                (self.groups.len() - 1) as u32
            }
        };
        self.by_hash.insert(hash, index);
        self.live += 1;
        index
    }

    /// Uncounts source `row` from `leaf` up to the root. `kept` is the leaf
    /// the row entered again, if any; groups on its path still hold the row.
    /// Pushes each surviving group that lost its label row to `orphans`,
    /// with that row. Returns whether a group lost its last row and was
    /// removed.
    fn leave(&mut self, leaf: u32, row: u32, kept: u32, orphans: &mut Vec<(u32, u32)>) -> bool {
        let mut group = leaf;
        let mut removed = false;
        loop {
            let still_holds_row = kept != NO_GROUP
                && group != ROOT
                && self.ancestor(kept, self.groups[group as usize].depth) == group;
            let entry = &mut self.groups[group as usize];
            entry.rows -= 1;
            if group == ROOT {
                return removed;
            }
            let parent = entry.parent;
            if entry.rows == 0 {
                self.remove(group);
                removed = true;
            } else if entry.donor == row && !still_holds_row {
                orphans.push((group, row));
            }
            group = parent;
        }
    }

    /// Gives each orphaned group its first remaining member as label row, as
    /// `PIVOTBY` labels a group by its first row. Every row has its final
    /// group, so leaves and source values agree. All members follow the old
    /// label row, so the walk reads only the in-memory `leaves` up to the
    /// next member, and one source value per group. Returns whether a label
    /// changed.
    fn adopt_donors(
        &mut self,
        orphans: &[(u32, u32)],
        leaves: &[u32],
        fields: &[usize],
        source: &impl PivotSource,
    ) -> bool {
        let mut relabeled = false;
        for &(group, old_donor) in orphans {
            // A later leave emptied the group (its slot may since hold a new
            // group with another label row), or a lower row entered and
            // named it: nothing to find.
            let entry = &self.groups[group as usize];
            if entry.rows == 0 || entry.donor != old_donor {
                continue;
            }
            let depth = entry.depth;
            let donor = (old_donor as usize + 1..leaves.len())
                .find(|&row| leaves[row] != NO_GROUP && self.ancestor(leaves[row], depth) == group)
                .expect("a surviving group has a member after its old label row");

            // The donor is a member, so its key equals the group's and the
            // group keeps its hash chain.
            let label = source.value(donor, fields[depth as usize - 1]);
            let entry = &mut self.groups[group as usize];
            entry.donor = donor as u32;
            if entry.label != label {
                entry.label = label;
                relabeled = true;
            }
        }
        relabeled
    }

    fn remove(&mut self, group: u32) {
        let entry = &self.groups[group as usize];
        let part = key_part(&entry.label).expect("group labels are valid keys");
        let hash = key_hash(entry.parent, &part);
        let next = entry.next_same_hash;

        // Unlink the group from its hash chain.
        if self.by_hash.get(&hash) == Some(&group) {
            if next == NO_GROUP {
                self.by_hash.remove(&hash);
            } else {
                self.by_hash.insert(hash, next);
            }
        } else if let Some(&head) = self.by_hash.get(&hash) {
            let mut previous = head;
            while self.groups[previous as usize].next_same_hash != group {
                previous = self.groups[previous as usize].next_same_hash;
            }
            self.groups[previous as usize].next_same_hash = next;
        }

        let entry = &mut self.groups[group as usize];
        entry.label = Value::Blank;
        entry.parent = NO_GROUP;
        entry.next_same_hash = NO_GROUP;
        self.free.push(group);
        self.live -= 1;
    }

    /// `group` and its ancestors, the root last.
    fn path(&self, mut group: u32, path: &mut Vec<u32>) {
        path.clear();
        loop {
            path.push(group);
            if group == ROOT {
                return;
            }
            group = self.groups[group as usize].parent;
        }
    }

    fn ancestor(&self, mut group: u32, depth: u32) -> u32 {
        while self.groups[group as usize].depth > depth {
            group = self.groups[group as usize].parent;
        }
        group
    }

    /// The label of `group` in the header cell of axis level `level`: its own
    /// key or an ancestor's, `Total` just below a subtotal, or blank.
    fn level_label(&self, group: u32, level: usize) -> Value {
        let depth = self.groups[group as usize].depth as usize;
        if level < depth {
            self.groups[self.ancestor(group, level as u32 + 1) as usize]
                .label
                .clone()
        } else if level == depth {
            Value::text(TOTAL_LABEL)
        } else {
            Value::Blank
        }
    }

    /// The displayed groups in output order. Siblings sort by key in the
    /// level's direction. `subtotals_first` puts each subtotal before its
    /// children (compact rows), otherwise after them; the grand total is last.
    fn ordered(
        &self,
        descending: &[bool],
        include_subtotals: bool,
        subtotals_first: bool,
        include_root: bool,
    ) -> Vec<u32> {
        if self.width == 0 {
            return vec![ROOT];
        }

        let mut children: Vec<u32> = (1..self.groups.len() as u32)
            .filter(|&group| self.groups[group as usize].rows > 0)
            .collect();
        children.sort_unstable_by(|&left, &right| {
            let (left_group, right_group) =
                (&self.groups[left as usize], &self.groups[right as usize]);
            left_group.parent.cmp(&right_group.parent).then_with(|| {
                let order = compare_group_values(&left_group.label, &right_group.label);
                if descending
                    .get(left_group.depth as usize - 1)
                    .copied()
                    .unwrap_or(false)
                {
                    order.reverse()
                } else {
                    order
                }
            })
        });

        // Children of one parent are adjacent after the sort.
        let mut spans: FxHashMap<u32, (u32, u32)> = FxHashMap::default();
        for (position, &group) in children.iter().enumerate() {
            let parent = self.groups[group as usize].parent;
            spans
                .entry(parent)
                .and_modify(|span| span.1 = position as u32 + 1)
                .or_insert((position as u32, position as u32 + 1));
        }

        let mut order = Vec::with_capacity(children.len() + 1);
        let mut stack: Vec<(u32, u32)> = vec![(ROOT, spans.get(&ROOT).map_or(0, |span| span.0))];
        while let Some(&mut (group, ref mut cursor)) = stack.last_mut() {
            let end = spans.get(&group).map_or(0, |span| span.1);
            if *cursor < end {
                let child = children[*cursor as usize];
                *cursor += 1;
                let depth = self.groups[child as usize].depth as usize;
                if subtotals_first && (depth == self.width || include_subtotals) {
                    order.push(child);
                }
                stack.push((child, spans.get(&child).map_or(0, |span| span.0)));
                continue;
            }
            stack.pop();
            let depth = self.groups[group as usize].depth as usize;
            if group != ROOT && !subtotals_first && (depth == self.width || include_subtotals) {
                order.push(group);
            }
        }
        if include_root {
            order.push(ROOT);
        }
        order
    }

    fn retained_bytes(&self) -> usize {
        self.groups.capacity() * size_of::<AxisGroup>()
            + self.by_hash.capacity() * (size_of::<u64>() + size_of::<u32>() + 1)
            + self.free.capacity() * size_of::<u32>()
            + self
                .groups
                .iter()
                .map(|group| match &group.label {
                    Value::Text(text) => text.len(),
                    _ => 0,
                })
                .sum::<usize>()
    }
}

/// Distinct text keys of DISTINCTCOUNT fields, case-folded and counted, so a
/// row's contribution stores a small id instead of its text.
#[derive(Default)]
struct TextIds {
    ids: FxHashMap<Rc<str>, u32>,
    texts: Vec<Option<Rc<str>>>,
    uses: Vec<u32>,
    free: Vec<u32>,
}

impl TextIds {
    fn acquire(&mut self, text: &str) -> u32 {
        let folded: Rc<str> = text.to_lowercase().into();
        if let Some(&id) = self.ids.get(&folded) {
            self.uses[id as usize] += 1;
            return id;
        }
        let id = match self.free.pop() {
            Some(id) => {
                self.texts[id as usize] = Some(folded.clone());
                self.uses[id as usize] = 1;
                id
            }
            None => {
                self.texts.push(Some(folded.clone()));
                self.uses.push(1);
                (self.texts.len() - 1) as u32
            }
        };
        self.ids.insert(folded, id);
        id
    }

    fn release(&mut self, id: u32) {
        let uses = &mut self.uses[id as usize];
        *uses -= 1;
        if *uses == 0 {
            if let Some(text) = self.texts[id as usize].take() {
                self.ids.remove(&text);
            }
            self.free.push(id);
        }
    }

    fn retained_bytes(&self) -> usize {
        self.ids.capacity() * (size_of::<Rc<str>>() + size_of::<u32>() + 1)
            + self.texts.capacity() * size_of::<Option<Rc<str>>>()
            + self.uses.capacity() * size_of::<u32>()
            + self.ids.keys().map(|text| text.len()).sum::<usize>()
    }
}

/// One carry unit, 2^1022. Partials stay below it, so a two-sum of two
/// partials stays below 2^1024 and never overflows.
const CARRY_UNIT: f64 = f64::from_bits(0x7FD0_0000_0000_0000);
/// A sum of numbers past this many carry units is past the number range:
/// the partials add less than one unit, and 4 units are 2^1024.
const MAX_FINITE_CARRY: u64 = 4;
/// Sums of whole numbers keep one partial and short sums of decimal
/// fractions two, so they need no heap block; long fractional sums spill.
const INLINE_PARTIALS: usize = 2;

/// The exact sum of finite numbers, which adds and removes them in any order
/// and rounds once when read: Shewchuk's nonoverlapping partials, as in
/// Python's `math.fsum`. A removal subtracts exactly, so after any edits the
/// sum is bit for bit the sum of a fresh build.
///
/// `PIVOTBY` rounds after each row instead. That result depends on the row
/// order, which an incremental cache cannot replay once it removes a row,
/// so the two sums can differ; the pivot's is the correctly rounded one.
#[derive(Default)]
struct ExactSum {
    /// Nonzero partials in increasing magnitude, then zeros. Unused while
    /// `spilled` holds the sum.
    inline: [f64; INLINE_PARTIALS],
    spilled: Option<Box<SpilledSum>>,
}

/// A sum with more partials than fit inline, or past one carry unit.
struct SpilledSum {
    partials: Vec<f64>,
    /// Signed carry units that the partials do not hold.
    carry: i64,
}

/// `partials` as the inline form: padded with zeros.
fn inline_partials(partials: &[f64]) -> [f64; INLINE_PARTIALS] {
    let mut inline = [0.0; INLINE_PARTIALS];
    inline[..partials.len()].copy_from_slice(partials);
    inline
}

impl ExactSum {
    fn add(&mut self, number: f64) {
        // Sums of whole numbers keep one partial and add without a rounding
        // error, so they skip the general path.
        if self.spilled.is_none() && self.inline[1] == 0.0 {
            let (sum, error) = two_sum(self.inline[0], number);
            if error == 0.0 && sum.abs() < CARRY_UNIT {
                self.inline[0] = sum;
                return;
            }
        }

        if let Some(spilled) = &mut self.spilled {
            let SpilledSum { partials, carry } = &mut **spilled;
            let count = partials.len();
            partials.push(0.0);
            let count = grow_partials(partials, count, number, carry);
            partials.truncate(count);

            // Release the heap block once the sum fits inline again.
            if *carry == 0 && count <= INLINE_PARTIALS {
                self.inline = inline_partials(partials);
                self.spilled = None;
            }
            return;
        }

        // One spare slot for the partial that the addition may add.
        let mut partials = [0.0; INLINE_PARTIALS + 1];
        partials[..INLINE_PARTIALS].copy_from_slice(&self.inline);
        let mut carry = 0;
        let count = grow_partials(&mut partials, self.inline_count(), number, &mut carry);
        if carry == 0 && count <= INLINE_PARTIALS {
            self.inline = inline_partials(&partials[..count]);
        } else {
            self.spilled = Some(Box::new(SpilledSum {
                partials: partials[..count].to_vec(),
                carry,
            }));
        }
    }

    fn inline_count(&self) -> usize {
        self.inline
            .iter()
            .take_while(|&&partial| partial != 0.0)
            .count()
    }

    /// The sum rounded once to the nearest number, ties to even. A sum past
    /// the number range is infinite, which shows `#NUM!`, as a `PIVOTBY`
    /// sum that overflows does.
    fn value(&self) -> f64 {
        let Some(spilled) = &self.spilled else {
            return round_partials(&self.inline[..self.inline_count()]);
        };
        if spilled.carry == 0 {
            return round_partials(&spilled.partials);
        }
        if spilled.carry.unsigned_abs() > MAX_FINITE_CARRY {
            return f64::INFINITY.copysign(spilled.carry as f64);
        }

        // Add the carry back one unit at a time. The running sum moves
        // monotonically from the partials to the result, so no step
        // overflows unless the result does.
        let unit = CARRY_UNIT.copysign(spilled.carry as f64);
        let mut partials = spilled.partials.clone();
        for _ in 0..spilled.carry.unsigned_abs() {
            let count = partials.len();
            let (count, high) = two_sum_partials(&mut partials, count, unit);
            if !high.is_finite() {
                return f64::INFINITY.copysign(unit);
            }
            partials.truncate(count);
            if high != 0.0 {
                partials.push(high);
            }
        }
        round_partials(&partials)
    }

    fn retained_bytes(&self) -> usize {
        self.spilled.as_ref().map_or(0, |spilled| {
            size_of::<SpilledSum>() + spilled.partials.capacity() * size_of::<f64>()
        })
    }
}

/// Adds `number` exactly to the first `count` partials, and moves whole
/// carry units into `carry`. Returns the new partial count, at most
/// `count + 1`, so `partials` needs one spare slot.
fn grow_partials(partials: &mut [f64], count: usize, number: f64, carry: &mut i64) -> usize {
    let mut count = count;
    let mut addend = number;
    loop {
        *carry += take_carry_units(&mut addend);
        let (kept, high) = two_sum_partials(partials, count, addend);
        count = kept;
        if high.abs() < CARRY_UNIT {
            if high != 0.0 {
                partials[count] = high;
                count += 1;
            }
            return count;
        }

        // The top partial reached a carry unit. Move the units out and add
        // the rest to the lower partials again, so the partials stay
        // nonoverlapping and below one unit.
        addend = high;
    }
}

/// Moves the whole carry units out of `number` and returns their signed
/// count. Each subtraction is exact: the unit is a multiple of the ulp of
/// `number`, and the difference is smaller than `number`.
fn take_carry_units(number: &mut f64) -> i64 {
    let mut units = 0;
    while number.abs() >= CARRY_UNIT {
        let unit = CARRY_UNIT.copysign(*number);
        *number -= unit;
        units += if unit > 0.0 { 1 } else { -1 };
    }
    units
}

/// `a + b` rounded, and its exact rounding error (Knuth's two-sum, which
/// needs no magnitude order).
fn two_sum(a: f64, b: f64) -> (f64, f64) {
    let sum = a + b;
    let b_rounded = sum - a;
    let a_rounded = sum - b_rounded;
    (sum, (a - a_rounded) + (b - b_rounded))
}

/// Adds `addend` to the first `count` partials with error-free two-sums.
/// The nonzero rounding errors replace the partials in increasing
/// magnitude; returns their count and the rounded top, which is not stored.
fn two_sum_partials(partials: &mut [f64], count: usize, addend: f64) -> (usize, f64) {
    let mut high = addend;
    let mut kept = 0;
    for index in 0..count {
        let (sum, error) = two_sum(high, partials[index]);
        if error != 0.0 {
            partials[kept] = error;
            kept += 1;
        }
        high = sum;
    }
    (kept, high)
}

/// Rounds the exact sum of nonoverlapping `partials` in increasing
/// magnitude once, ties to even, as Python's `math.fsum` does.
fn round_partials(partials: &[f64]) -> f64 {
    let Some((&top, lower)) = partials.split_last() else {
        return 0.0;
    };
    let mut high = top;
    let mut low = 0.0;
    let mut remaining = lower.len();
    while remaining > 0 {
        remaining -= 1;
        let previous = high;
        high = previous + lower[remaining];
        low = lower[remaining] - (high - previous);
        if low != 0.0 {
            break;
        }
    }

    // `high + low` is exact, so `low` is half an ulp at most. When it is
    // exactly half an ulp and the next partial has the same sign, the
    // exact sum lies past the tie: round away from `high`.
    if remaining > 0
        && ((low < 0.0 && lower[remaining - 1] < 0.0) || (low > 0.0 && lower[remaining - 1] > 0.0))
    {
        let doubled = low * 2.0;
        let rounded = high + doubled;
        if doubled == rounded - high {
            high = rounded;
        }
    }
    high
}

/// The partial aggregate of one value field over one pair of groups.
#[derive(Default)]
struct Partial {
    /// The numbers' exact sum, for SUM and AVERAGE only.
    sum: ExactSum,
    numbers: u32,
    nonblank: u32,
    /// Error rows by source row: the first one is the aggregate's error.
    #[allow(
        clippy::box_collection,
        reason = "Error-free partials retain one pointer, not an inline tree header"
    )]
    errors: Option<Box<BTreeMap<u32, FormulaError>>>,
    /// `(tag, key) → rows` for MIN, MAX and DISTINCTCOUNT.
    #[allow(
        clippy::box_collection,
        reason = "SUM/COUNT/AVERAGE partials retain one pointer, not an unused tree header"
    )]
    multiset: Option<Box<BTreeMap<(u8, u64), u32>>>,
}

/// Number bits that sort like the numbers: flip negatives, set the sign bit
/// of positives. Negative zero folds into zero.
fn ordered_bits(number: f64) -> u64 {
    let bits = (number + 0.0).to_bits();
    if bits >> 63 == 1 {
        !bits
    } else {
        bits | (1 << 63)
    }
}

fn number_from_ordered_bits(bits: u64) -> f64 {
    f64::from_bits(if bits >> 63 == 1 {
        bits & !(1 << 63)
    } else {
        !bits
    })
}

impl Partial {
    fn update(
        &mut self,
        aggregation: Aggregation,
        (kind, payload): (u8, u64),
        row: u32,
        adding: bool,
    ) {
        if kind != KIND_BLANK {
            if adding {
                self.nonblank += 1;
            } else {
                self.nonblank -= 1;
            }
        }

        let multiset_key = match kind {
            KIND_NUMBER => {
                let number = f64::from_bits(payload);
                if aggregation.keeps_sum() {
                    self.sum.add(if adding { number } else { -number });
                }
                if adding {
                    self.numbers += 1;
                } else {
                    self.numbers -= 1;
                }
                Some((TAG_NUMBER, ordered_bits(number)))
            }
            KIND_TEXT if aggregation == Aggregation::DistinctCount => Some((TAG_TEXT, payload)),
            KIND_BOOL if aggregation == Aggregation::DistinctCount => Some((TAG_BOOL, payload)),
            KIND_ERROR if aggregation.shows_errors() => {
                let error = FormulaError::from_slot(payload).unwrap_or(FormulaError::Value);
                if adding {
                    self.errors.get_or_insert_default().insert(row, error);
                } else if let Some(errors) = &mut self.errors {
                    errors.remove(&row);
                    if errors.is_empty() {
                        self.errors = None;
                    }
                }
                None
            }
            _ => None,
        };

        if let Some(key) = multiset_key.filter(|_| aggregation.keeps_multiset()) {
            let multiset = self.multiset.get_or_insert_default();
            if adding {
                *multiset.entry(key).or_insert(0) += 1;
            } else if let Some(count) = multiset.get_mut(&key) {
                *count -= 1;
                if *count == 0 {
                    multiset.remove(&key);
                    if multiset.is_empty() {
                        self.multiset = None;
                    }
                }
            }
        }
    }

    fn result(&self, aggregation: Aggregation) -> Value {
        if aggregation.shows_errors() {
            if let Some((_, &error)) = self
                .errors
                .as_ref()
                .and_then(|errors| errors.first_key_value())
            {
                return Value::Error(error);
            }
        }
        let numbers = || {
            self.multiset
                .as_ref()
                .map(|multiset| multiset.range((TAG_NUMBER, 0)..=(TAG_NUMBER, u64::MAX)))
        };
        match aggregation {
            Aggregation::Sum => Value::number(self.sum.value()),
            Aggregation::Count => Value::number(f64::from(self.numbers)),
            Aggregation::Average if self.numbers == 0 => Value::Error(FormulaError::DivZero),
            Aggregation::Average => Value::number(self.sum.value() / f64::from(self.numbers)),
            Aggregation::Min => Value::number(
                numbers()
                    .and_then(|mut keys| keys.next())
                    .map_or(0.0, |(&(_, bits), _)| number_from_ordered_bits(bits)),
            ),
            Aggregation::Max => Value::number(
                numbers()
                    .and_then(|mut keys| keys.next_back())
                    .map_or(0.0, |(&(_, bits), _)| number_from_ordered_bits(bits)),
            ),
            Aggregation::CountA => Value::number(f64::from(self.nonblank)),
            Aggregation::DistinctCount => {
                Value::number(self.multiset.as_ref().map_or(0, |multiset| multiset.len()) as f64)
            }
        }
    }

    fn retained_bytes(&self) -> usize {
        // A B-tree entry costs its key and value plus a share of the node.
        const BTREE_ENTRY_OVERHEAD: usize = 8;
        self.sum.retained_bytes()
            + self.errors.as_ref().map_or(0, |errors| {
                size_of::<BTreeMap<u32, FormulaError>>()
                    + errors.len()
                        * (size_of::<u32>() + size_of::<FormulaError>() + BTREE_ENTRY_OVERHEAD)
            })
            + self.multiset.as_ref().map_or(0, |multiset| {
                size_of::<BTreeMap<(u8, u64), u32>>()
                    + multiset.len()
                        * (size_of::<(u8, u64)>() + size_of::<u32>() + BTREE_ENTRY_OVERHEAD)
            })
    }
}

/// The output shape of a pivot and the group shown in each data row and
/// value column.
pub(crate) struct PivotLayout {
    pub(crate) rows: usize,
    pub(crate) cols: usize,
    pub(crate) header_rows: usize,
    pub(crate) label_cols: usize,
    /// Value columns per column group: the value fields, or one blank column
    /// so a pivot without values still shows its column labels.
    value_slots: usize,
    row_groups: Vec<u32>,
    col_groups: Vec<u32>,
    row_positions: FxHashMap<u32, u32>,
    col_positions: FxHashMap<u32, u32>,
}

impl PivotLayout {
    pub(crate) fn retained_bytes(&self) -> usize {
        (self.row_groups.capacity() + self.col_groups.capacity()) * size_of::<u32>()
            + (self.row_positions.capacity() + self.col_positions.capacity())
                * (2 * size_of::<u32>() + 1)
    }
}

/// The name of a source field: its header, or `ColumnN` for a blank header.
pub(crate) fn field_name(header: &Value, field: usize) -> String {
    match header {
        Value::Text(text) if !text.is_empty() => text.to_string(),
        Value::Number(number) => number.to_string(),
        Value::Bool(true) => "TRUE".into(),
        Value::Bool(false) => "FALSE".into(),
        _ => format!("Column{}", field + 1),
    }
}

/// The name and type of every source field, for the field list.
pub(crate) fn source_fields(source: &impl PivotSource) -> (Vec<String>, Vec<u8>) {
    let width = source.width();
    let names = (0..width)
        .map(|field| field_name(&source.header(field), field))
        .collect();
    let types = (0..width)
        .map(|field| {
            let mut seen = FIELD_BLANK;
            for row in 0..source.rows() {
                let kind = match source.value(row, field) {
                    Value::Number(_) => FIELD_NUMBER,
                    Value::Text(text) if !text.is_empty() => FIELD_TEXT,
                    Value::Bool(_) => FIELD_BOOL,
                    _ => continue,
                };
                if seen == FIELD_BLANK {
                    seen = kind;
                } else if seen != kind {
                    return FIELD_MIXED;
                }
            }
            seen
        })
        .collect();
    (names, types)
}

pub(crate) struct PivotCache {
    spec: PivotSpec,
    headers: Vec<Value>,
    row_axis: Axis,
    col_axis: Axis,
    /// Leaf group of each source row on each axis, or `NO_GROUP`.
    row_leaf: Vec<u32>,
    col_leaf: Vec<u32>,
    /// What each source row contributed to each value field, row-major.
    contribution_kinds: Vec<u8>,
    contribution_payloads: Vec<u64>,
    /// Rows whose key field holds an error; the first one is the pivot's error.
    key_errors: BTreeMap<u32, FormulaError>,
    texts: TextIds,
    /// `(row group, col group) → slot`; slot `s` owns partials
    /// `s * values .. (s + 1) * values`.
    pairs: FxHashMap<u64, u32>,
    pair_rows: Vec<u32>,
    free_pairs: Vec<u32>,
    partials: Vec<Partial>,
    /// Pairs whose aggregates changed since the last [`Self::take_changes`].
    changed_pairs: Vec<(u32, u32)>,
    /// A group appeared or disappeared, or a header changed: the output needs
    /// a new layout.
    relayout: bool,
    keys: Vec<Value>,
    row_path: Vec<u32>,
    col_path: Vec<u32>,
    #[cfg(test)]
    pub(crate) aggregate_updates: usize,
    #[cfg(test)]
    pub(crate) output_reads: std::cell::Cell<usize>,
}

fn pair_key(row_group: u32, col_group: u32) -> u64 {
    (u64::from(row_group) << 32) | u64::from(col_group)
}

impl PivotCache {
    /// Groups and aggregates every source row. Fails with `#NUM!` as soon as
    /// the groups pass [`MAX_PIVOT_GROUPS`], before memory grows further.
    pub(crate) fn build(spec: &PivotSpec, source: &impl PivotSource) -> Result<Self, FormulaError> {
        if spec
            .max_field()
            .is_some_and(|field| field >= source.width())
        {
            return Err(FormulaError::Ref);
        }
        let rows = source.rows();
        let values = spec.values.len();
        let mut cache = Self {
            headers: (0..source.width())
                .map(|field| source.header(field))
                .collect(),
            row_axis: Axis::new(spec.rows.len()),
            col_axis: Axis::new(spec.columns.len()),
            row_leaf: vec![NO_GROUP; rows],
            col_leaf: vec![NO_GROUP; rows],
            contribution_kinds: vec![KIND_BLANK; rows * values],
            contribution_payloads: vec![0; rows * values],
            key_errors: BTreeMap::new(),
            texts: TextIds::default(),
            pairs: FxHashMap::default(),
            pair_rows: Vec::new(),
            free_pairs: Vec::new(),
            partials: Vec::new(),
            changed_pairs: Vec::new(),
            relayout: true,
            keys: Vec::with_capacity(spec.rows.len().max(spec.columns.len())),
            row_path: Vec::new(),
            col_path: Vec::new(),
            spec: spec.clone(),
            #[cfg(test)]
            aggregate_updates: 0,
            #[cfg(test)]
            output_reads: std::cell::Cell::new(0),
        };
        for row in 0..rows {
            cache.add_row(row, source);
            if cache.group_count() > MAX_PIVOT_GROUPS {
                return Err(FormulaError::Num);
            }
        }
        cache.changed_pairs.clear();
        cache.relayout = true;
        Ok(cache)
    }

    fn group_count(&self) -> usize {
        self.row_axis.live + self.col_axis.live
    }

    /// The pivot's error: a key error in the source, or too many groups.
    pub(crate) fn error(&self) -> Option<FormulaError> {
        if let Some((_, &error)) = self.key_errors.first_key_value() {
            return Some(error);
        }
        (self.group_count() > MAX_PIVOT_GROUPS).then_some(FormulaError::Num)
    }

    /// Replaces the contribution of each row in `rows` (ascending, no
    /// repeats, inside the source the cache was built from) with its current
    /// values.
    pub(crate) fn update_rows(&mut self, rows: &[usize], source: &impl PivotSource) {
        let mut row_orphans = Vec::new();
        let mut col_orphans = Vec::new();
        for &row in rows {
            let row_leaf = self.row_leaf[row];
            let col_leaf = self.col_leaf[row];
            self.remove_row(row);
            self.add_row(row, source);

            // Keep the old axis membership until the replacement enters:
            // changing a singleton's value must not destroy its layout.
            if row_leaf == NO_GROUP {
                continue;
            }
            let kept_row = self.row_leaf[row];
            let kept_col = self.col_leaf[row];
            let row = row as u32;
            self.relayout |= self
                .row_axis
                .leave(row_leaf, row, kept_row, &mut row_orphans);
            self.relayout |= self
                .col_axis
                .leave(col_leaf, row, kept_col, &mut col_orphans);
        }

        // Later rows of the batch still had their old groups while earlier
        // rows left, so find new label rows only now.
        self.relayout |=
            self.row_axis
                .adopt_donors(&row_orphans, &self.row_leaf, &self.spec.rows, source);
        self.relayout |=
            self.col_axis
                .adopt_donors(&col_orphans, &self.col_leaf, &self.spec.columns, source);
    }

    /// Reads the headers again; a changed header changes the output labels.
    pub(crate) fn update_headers(&mut self, source: &impl PivotSource) {
        for (field, header) in self.headers.iter_mut().enumerate() {
            let current = source.header(field);
            if *header != current {
                *header = current;
                self.relayout = true;
            }
        }
    }

    fn add_row(&mut self, row: usize, source: &impl PivotSource) {
        if !self
            .spec
            .filters
            .iter()
            .all(|filter| filter.keeps(&source.value(row, filter.field)))
        {
            return;
        }

        // Read and check every key first, so a key error leaves both axes as
        // they were.
        let mut keys = std::mem::take(&mut self.keys);
        keys.clear();
        let mut key_error = None;
        for &field in self.spec.rows.iter().chain(&self.spec.columns) {
            let value = source.value(row, field);
            if let Err(error) = key_part(&value) {
                key_error = Some(error);
                break;
            }
            keys.push(value);
        }
        if let Some(error) = key_error {
            self.keys = keys;
            self.key_errors.insert(row as u32, error);
            return;
        }
        let (row_keys, col_keys) = keys.split_at(self.spec.rows.len());
        let (row_leaf, row_changed) = self.row_axis.enter(row_keys, row as u32);
        let (col_leaf, col_changed) = self.col_axis.enter(col_keys, row as u32);
        self.keys = keys;
        self.relayout |= row_changed || col_changed;
        self.row_leaf[row] = row_leaf;
        self.col_leaf[row] = col_leaf;

        let values = self.spec.values.len();
        for (index, value) in self.spec.values.iter().enumerate() {
            let (kind, payload) = match source.value(row, value.field) {
                Value::Blank => (KIND_BLANK, 0),
                number @ Value::Number(_) => match range_number(&number) {
                    Ok(Some(number)) => (KIND_NUMBER, number.to_bits()),
                    Ok(None) => (KIND_BLANK, 0),
                    Err(error) => (KIND_ERROR, error.slot() as u64),
                },
                Value::Text(text) => (
                    KIND_TEXT,
                    if value.aggregation == Aggregation::DistinctCount {
                        u64::from(self.texts.acquire(&text))
                    } else {
                        0
                    },
                ),
                Value::Bool(boolean) => (KIND_BOOL, u64::from(boolean)),
                Value::Error(error) => (KIND_ERROR, error.slot() as u64),
            };
            self.contribution_kinds[row * values + index] = kind;
            self.contribution_payloads[row * values + index] = payload;
        }
        self.apply_row(row, true);
    }

    fn remove_row(&mut self, row: usize) {
        if self.key_errors.remove(&(row as u32)).is_some() {
            return;
        }
        if self.row_leaf[row] == NO_GROUP {
            return;
        }
        self.apply_row(row, false);

        let values = self.spec.values.len();
        for (index, value) in self.spec.values.iter().enumerate() {
            let offset = row * values + index;
            if value.aggregation == Aggregation::DistinctCount
                && self.contribution_kinds[offset] == KIND_TEXT
            {
                self.texts
                    .release(self.contribution_payloads[offset] as u32);
            }
            self.contribution_kinds[offset] = KIND_BLANK;
            self.contribution_payloads[offset] = 0;
        }

        self.row_leaf[row] = NO_GROUP;
        self.col_leaf[row] = NO_GROUP;
    }

    /// Adds or removes `row`'s contribution in every pair of its row and
    /// column groups, at every level.
    fn apply_row(&mut self, row: usize, adding: bool) {
        let mut row_path = std::mem::take(&mut self.row_path);
        let mut col_path = std::mem::take(&mut self.col_path);
        self.row_axis.path(self.row_leaf[row], &mut row_path);
        self.col_axis.path(self.col_leaf[row], &mut col_path);

        let values = self.spec.values.len();
        for &row_group in &row_path {
            for &col_group in &col_path {
                let slot = self.pair_slot(row_group, col_group, adding);
                for (index, value) in self.spec.values.iter().enumerate() {
                    let contribution = (
                        self.contribution_kinds[row * values + index],
                        self.contribution_payloads[row * values + index],
                    );
                    self.partials[slot as usize * values + index].update(
                        value.aggregation,
                        contribution,
                        row as u32,
                        adding,
                    );
                    #[cfg(test)]
                    {
                        self.aggregate_updates += 1;
                    }
                }
                if !adding {
                    self.release_pair(row_group, col_group, slot);
                }
                // A relayout writes every group; retaining per-row changes
                // during a build would otherwise grow with the source.
                if !self.relayout {
                    self.changed_pairs.push((row_group, col_group));
                }
            }
        }

        self.row_path = row_path;
        self.col_path = col_path;
    }

    fn pair_slot(&mut self, row_group: u32, col_group: u32, adding: bool) -> u32 {
        let key = pair_key(row_group, col_group);
        if let Some(&slot) = self.pairs.get(&key) {
            if adding {
                self.pair_rows[slot as usize] += 1;
            }
            return slot;
        }
        debug_assert!(adding, "a removed row's pairs exist");
        let values = self.spec.values.len();
        let slot = match self.free_pairs.pop() {
            Some(slot) => {
                self.pair_rows[slot as usize] = 1;
                slot
            }
            None => {
                self.pair_rows.push(1);
                self.partials
                    .resize_with(self.partials.len() + values, Partial::default);
                (self.pair_rows.len() - 1) as u32
            }
        };
        self.pairs.insert(key, slot);
        slot
    }

    fn release_pair(&mut self, row_group: u32, col_group: u32, slot: u32) {
        let rows = &mut self.pair_rows[slot as usize];
        *rows -= 1;
        if *rows == 0 {
            self.pairs.remove(&pair_key(row_group, col_group));
            let values = self.spec.values.len();
            for partial in &mut self.partials[slot as usize * values..(slot as usize + 1) * values]
            {
                *partial = Partial::default();
            }
            self.free_pairs.push(slot);
        }
    }

    /// The output shape and order. Fails with `#NUM!` past
    /// [`MAX_PIVOT_OUTPUT_CELLS`].
    pub(crate) fn layout(&self) -> Result<PivotLayout, FormulaError> {
        let spec = &self.spec;
        let row_width = spec.rows.len();
        let col_width = spec.columns.len();
        let row_groups = self.row_axis.ordered(
            &spec.row_descending,
            !spec.tabular || (spec.subtotals && row_width > 1),
            !spec.tabular,
            spec.row_totals,
        );
        let col_groups = self.col_axis.ordered(
            &spec.column_descending,
            spec.subtotals && col_width > 1,
            false,
            spec.column_totals,
        );

        let value_slots = if spec.values.is_empty() && col_width > 0 {
            1
        } else {
            spec.values.len()
        };
        let label_cols = if spec.tabular {
            row_width
        } else {
            row_width.min(1)
        };
        let value_cols = col_groups
            .len()
            .checked_mul(value_slots)
            .ok_or(FormulaError::Num)?;
        let cols = label_cols + value_cols;
        let header_rows = col_width + 1;
        let rows = header_rows + row_groups.len();
        let cells = rows.checked_mul(cols).ok_or(FormulaError::Num)?;
        if cells > MAX_PIVOT_OUTPUT_CELLS {
            return Err(FormulaError::Num);
        }

        let positions = |groups: &[u32]| -> FxHashMap<u32, u32> {
            groups
                .iter()
                .enumerate()
                .map(|(position, &group)| (group, position as u32))
                .collect()
        };
        let (rows, cols, header_rows) = if cols == 0 {
            // Nothing to show: one blank cell keeps the anchor visible.
            (1, 1, 0)
        } else {
            (rows, cols, header_rows)
        };
        Ok(PivotLayout {
            rows,
            cols,
            header_rows,
            label_cols,
            value_slots,
            row_positions: positions(&row_groups),
            col_positions: positions(&col_groups),
            row_groups,
            col_groups,
        })
    }

    /// The value of the output cell at row-major `offset` of `layout`.
    pub(crate) fn cell(&self, layout: &PivotLayout, offset: usize) -> Value {
        #[cfg(test)]
        self.output_reads.set(self.output_reads.get() + 1);
        if layout.header_rows == 0 {
            return Value::Blank;
        }
        let (row, col) = (offset / layout.cols, offset % layout.cols);
        let spec = &self.spec;

        if row < layout.header_rows {
            if col < layout.label_cols {
                return if row == 0 {
                    let field = spec.rows[if spec.tabular { col } else { 0 }];
                    match &self.headers[field] {
                        Value::Blank => Value::text(field_name(&Value::Blank, field)),
                        header => header.clone(),
                    }
                } else {
                    Value::Blank
                };
            }
            let position = (col - layout.label_cols) / layout.value_slots;
            let slot = (col - layout.label_cols) % layout.value_slots;
            let group = layout.col_groups[position];
            if row < spec.columns.len() {
                return self.col_axis.level_label(group, row);
            }
            return spec.values.get(slot).map_or(Value::Blank, |value| {
                Value::text(value.name.clone().unwrap_or_else(|| {
                    format!(
                        "{} of {}",
                        value.aggregation.caption(),
                        field_name(&self.headers[value.field], value.field)
                    )
                }))
            });
        }

        let row_group = layout.row_groups[row - layout.header_rows];
        if col < layout.label_cols {
            if spec.tabular {
                return self.row_axis.level_label(row_group, col);
            }
            return match self.row_axis.groups[row_group as usize].depth {
                0 => Value::text(TOTAL_LABEL),
                _ => self.row_axis.groups[row_group as usize].label.clone(),
            };
        }

        let depth = self.row_axis.groups[row_group as usize].depth as usize;
        if !spec.tabular && !spec.subtotals && depth > 0 && depth < spec.rows.len() {
            return Value::Blank;
        }
        let position = (col - layout.label_cols) / layout.value_slots;
        let slot = (col - layout.label_cols) % layout.value_slots;
        let Some(value) = spec.values.get(slot) else {
            return Value::Blank;
        };
        let col_group = layout.col_groups[position];
        self.pairs
            .get(&pair_key(row_group, col_group))
            .map_or(Value::Blank, |&pair| {
                self.partials[pair as usize * spec.values.len() + slot].result(value.aggregation)
            })
    }
    /// Forgets the changes since the last call, for a caller that lays the
    /// whole output out again anyway.
    pub(crate) fn clear_changes(&mut self) {
        self.changed_pairs.clear();
        self.relayout = false;
    }

    /// Takes the changes since the last call: `None` when the output needs a
    /// new layout, otherwise the row-major offsets in `layout` whose values
    /// may have changed.
    pub(crate) fn take_changes(&mut self, layout: &PivotLayout) -> Option<Vec<usize>> {
        let mut pairs = std::mem::take(&mut self.changed_pairs);
        if std::mem::replace(&mut self.relayout, false) || layout.header_rows == 0 {
            return None;
        }
        pairs.sort_unstable();
        pairs.dedup();
        let values = self.spec.values.len();
        let mut offsets = Vec::with_capacity(pairs.len() * values);
        for (row_group, col_group) in pairs {
            let (Some(&row), Some(&col)) = (
                layout.row_positions.get(&row_group),
                layout.col_positions.get(&col_group),
            ) else {
                continue;
            };
            let start = (layout.header_rows + row as usize) * layout.cols
                + layout.label_cols
                + col as usize * layout.value_slots;
            offsets.extend(start..start + values);
        }
        Some(offsets)
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        size_of::<Self>()
            + self.row_axis.retained_bytes()
            + self.col_axis.retained_bytes()
            + (self.row_leaf.capacity() + self.col_leaf.capacity()) * size_of::<u32>()
            + self.contribution_kinds.capacity()
            + self.contribution_payloads.capacity() * size_of::<u64>()
            + self.key_errors.len() * (size_of::<u32>() + size_of::<FormulaError>())
            + self.texts.retained_bytes()
            + self.pairs.capacity() * (size_of::<u64>() + size_of::<u32>() + 1)
            + (self.pair_rows.capacity() + self.free_pairs.capacity()) * size_of::<u32>()
            + self.partials.capacity() * size_of::<Partial>()
            + self
                .partials
                .iter()
                .map(Partial::retained_bytes)
                .sum::<usize>()
            + self.changed_pairs.capacity() * size_of::<(u32, u32)>()
            + self.headers.capacity() * size_of::<Value>()
            + text_bytes(&self.headers)
            + self.spec.retained_bytes()
            + self.keys.capacity() * size_of::<Value>()
            + (self.row_path.capacity() + self.col_path.capacity()) * size_of::<u32>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct Source {
        rows: usize,
        reads: Cell<usize>,
        changed: bool,
    }

    impl PivotSource for Source {
        fn rows(&self) -> usize {
            self.rows
        }
        fn width(&self) -> usize {
            3
        }
        fn header(&self, field: usize) -> Value {
            Value::text(format!("Field{field}"))
        }
        fn value(&self, row: usize, field: usize) -> Value {
            self.reads.set(self.reads.get() + 1);
            Value::number(match field {
                0 => row as f64,
                1 => (row % 10) as f64,
                _ => {
                    if self.changed && row == 0 {
                        99.0
                    } else {
                        1.0
                    }
                }
            })
        }
    }

    fn spec() -> PivotSpec {
        PivotSpec {
            rows: vec![0],
            columns: vec![1],
            values: vec![PivotValue {
                field: 2,
                aggregation: Aggregation::Sum,
                name: None,
            }],
            filters: Vec::new(),
            row_descending: vec![false],
            column_descending: vec![false],
            row_totals: true,
            column_totals: true,
            subtotals: false,
            tabular: true,
        }
    }

    #[test]
    fn singleton_value_edit_reads_one_row_and_rewrites_only_affected_groups() {
        let mut source = Source {
            rows: 1000,
            reads: Cell::new(0),
            changed: false,
        };
        let mut cache = PivotCache::build(&spec(), &source).expect("valid pivot");
        let layout = cache.layout().expect("bounded layout");
        cache.clear_changes();
        let before = cache.aggregate_updates;
        source.reads.set(0);
        source.changed = true;
        cache.update_rows(&[0], &source);
        assert_eq!(source.reads.get(), 3);
        assert_eq!(cache.aggregate_updates - before, 8);
        let offsets = cache
            .take_changes(&layout)
            .expect("unchanged axes retain layout");
        assert_eq!(offsets.len(), 4);
        assert!(offsets
            .iter()
            .any(|&offset| cache.cell(&layout, offset) == Value::number(99.0)));
    }

    #[test]
    fn pivot_bounds_reject_groups_and_output_before_installation() {
        let source = Source {
            rows: MAX_PIVOT_GROUPS,
            reads: Cell::new(0),
            changed: false,
        };
        assert!(matches!(
            PivotCache::build(&spec(), &source),
            Err(FormulaError::Num)
        ));
        let source = Source {
            rows: 1000,
            reads: Cell::new(0),
            changed: false,
        };
        let mut definition = spec();
        definition.columns = vec![0];
        let cache = PivotCache::build(&definition, &source).expect("groups fit");
        assert!(matches!(cache.layout(), Err(FormulaError::Num)));
    }
}
