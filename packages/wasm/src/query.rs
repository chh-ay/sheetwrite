//! Whole-column queries: sort, filter, search, aggregate — cache-local scans.

use std::cell::{Cell, OnceCell};
use std::cmp::Ordering;
use std::ops::Range;

use rustc_hash::{FxHashMap, FxHashSet};

use wasm_bindgen::prelude::*;

use crate::cells::{
    dense_resolved, payload_is_str, payload_num, payload_str_id, source_kind, CellRun,
};
use crate::eval::{excel_date_parts, Criterion, Wildcard};
use crate::float_text::NumberText;
use crate::formula_slots::FormulaStore;
use crate::sheet::{formula_error_at, SheetData};
use crate::sort_text::push_collation_key;
use crate::sorting::{key_index, sort_indices_by, sort_u128, sort_u64};
use crate::store::CellStore;
use crate::types::{
    cell_key, string_from_pool_ref, CellKey, FormulaError, FormulaValueKind, StringStorage, Value,
    KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};

#[derive(Hash, Eq, PartialEq)]
enum DistinctKey<'a> {
    Blank,
    Number(u64),
    Bool(bool),
    Text(&'a str),
}

const STAMP_WORD_BITS: usize = 64;
const STAMP_WORDS_INITIAL: usize = 64;

/// One bit per string-pool id, so a scan that only lists values dedupes
/// dictionary-encoded text without hashing or comparing a single character,
/// in a 32nd of the memory [`PoolIdSlots`] zero-fills.
///
/// Words are zero-filled when the marks grow. Growth doubles the current word
/// count (with an initial floor) or reaches the requested id, whichever is larger.
struct PoolIdStamps {
    words: Vec<u64>,
}

impl PoolIdStamps {
    const fn new() -> Self {
        Self { words: Vec::new() }
    }

    /// Marks `id`; true when it was not marked yet.
    #[inline]
    fn insert(&mut self, id: u32) -> bool {
        let index = id as usize;
        let word = index / STAMP_WORD_BITS;
        if word >= self.words.len() {
            self.grow_to(word);
        }
        let Some(bits) = self.words.get_mut(word) else {
            return false;
        };
        let mask = 1u64 << (index % STAMP_WORD_BITS);
        let fresh = *bits & mask == 0;
        *bits |= mask;
        fresh
    }

    /// Whether `id` is marked.
    #[inline]
    fn contains(&self, id: u32) -> bool {
        let index = id as usize;
        self.words
            .get(index / STAMP_WORD_BITS)
            .is_some_and(|bits| bits & (1u64 << (index % STAMP_WORD_BITS)) != 0)
    }

    /// Grows the marks to hold `word`. Out of line, so the scan loops that
    /// call [`Self::insert`] stay small.
    #[cold]
    #[inline(never)]
    fn grow_to(&mut self, word: usize) {
        let doubled = self.words.len().max(STAMP_WORDS_INITIAL) * 2;
        self.words.resize(doubled.max(word + 1), 0);
    }
}

const SLOTS_INITIAL: usize = 4_096;

/// Each string-pool id's slot in a counted distinct scan's output, so text
/// that is already dictionary-encoded dedupes and counts without hashing or
/// comparing a single character. 0 marks an id the scan has not met; slot
/// `s` is stored as `s + 1`.
///
/// Slots are zero-filled when they grow. Growth doubles the current length
/// (with an initial floor) or reaches the requested id, whichever is larger.
struct PoolIdSlots {
    slots: Vec<u32>,
}

impl PoolIdSlots {
    const fn new() -> Self {
        Self { slots: Vec::new() }
    }

    /// The slot of `id`. A new id takes `next` unless `full`, when it has none.
    #[inline]
    fn slot(&mut self, id: u32, next: usize, full: bool) -> Option<usize> {
        let index = id as usize;
        if index >= self.slots.len() {
            self.grow_to(index);
        }
        let stored = self.slots.get_mut(index)?;
        if *stored != 0 {
            return Some(*stored as usize - 1);
        }
        if full {
            return None;
        }
        *stored = u32::try_from(next + 1).ok()?;
        Some(next)
    }

    /// Grows the slots to hold `index`. Out of line, so the scan loops that
    /// call [`Self::slot`] stay small.
    #[cold]
    #[inline(never)]
    fn grow_to(&mut self, index: usize) {
        let doubled = self.slots.len().max(SLOTS_INITIAL) * 2;
        self.slots.resize(doubled.max(index + 1), 0);
    }
}

thread_local! {
    static QUERY_STATS: Cell<[u64; 2]> = const { Cell::new([0, 0]) };
}

/// Longest picked-value list still scanned linearly: below this, building a
/// lookup costs more than the comparisons it saves.
const VALUE_SET_LINEAR_MAX: usize = 8;

/// Sentinel the view layer sends for a picked `TRUE`. The `\0` prefix keeps it
/// distinct from a cell that holds the text `TRUE`.
const VALUE_SET_TRUE: &str = "\0TRUE";

/// Sentinel for a picked `FALSE`; see [`VALUE_SET_TRUE`].
const VALUE_SET_FALSE: &str = "\0FALSE";
const VALUE_SET_FALSE_BIT: u8 = 1;
const VALUE_SET_TRUE_BIT: u8 = 2;

/// Picked values of one "values" filter column, prepared once per scan.
///
/// The row loop then answers membership without comparing the cell with every
/// picked value: numeric picks use binary search and text picks use a hash set.
/// A literal text cell is answered by its pool id alone: the pool holds each
/// text once, so the cell holds a picked text exactly when its id is one of
/// the picked texts' ids. `Linear` keeps the scan for lists short enough that
/// a lookup costs more than it saves.
enum ValueSet<'a> {
    Linear,
    Lookup {
        /// Picked numbers as bit patterns, sorted for binary search. `-0.0` is
        /// stored as `0.0` and NaN picks are dropped — exactly the values `f64`
        /// equality can match.
        numbers: Vec<u64>,
        /// The picked texts, built on the first cell that needs them: only
        /// formula results and paged cells are compared as text.
        texts: OnceCell<FxHashSet<&'a str>>,
        /// Pool ids of the picked texts that the string pool holds.
        ids: PoolIdStamps,
        /// Picked booleans, as the two bits above.
        bools: u8,
    },
}

impl<'a> ValueSet<'a> {
    fn build(picked_numbers: &[f64], picked_texts: &[String], strings: &StringStorage) -> Self {
        if picked_numbers.len() + picked_texts.len() <= VALUE_SET_LINEAR_MAX {
            return ValueSet::Linear;
        }

        let mut numbers: Vec<u64> = picked_numbers
            .iter()
            .filter(|value| !value.is_nan())
            .map(|value| (if *value == 0.0 { 0.0 } else { *value }).to_bits())
            .collect();

        numbers.sort_unstable();
        numbers.dedup();

        let mut ids = PoolIdStamps::new();
        let mut bools = 0u8;

        for picked in picked_texts {
            match picked.as_str() {
                VALUE_SET_TRUE => bools |= VALUE_SET_TRUE_BIT,
                VALUE_SET_FALSE => bools |= VALUE_SET_FALSE_BIT,
                _ => {}
            }

            if let Some(id) = strings.find(picked) {
                ids.insert(id);
            }
        }

        ValueSet::Lookup {
            numbers,
            texts: OnceCell::new(),
            ids,
            bools,
        }
    }

    /// Whether the cell at `index`, of resolved `kind` (1 number, 2 text,
    /// 3 logical), holds a picked value. `numbers` and `texts` are the picks
    /// the set was built from.
    fn holds(&self, cell: FilterCell<'_>, kind: u8, numbers: &[f64], texts: &'a [String]) -> bool {
        let FilterCell { data, store, index } = cell;
        let slots = &store.formula_slots;
        match self {
            ValueSet::Linear => match kind {
                1 => numeric_cell_value(data, index, slots)
                    .is_some_and(|value| numbers.contains(&value)),
                2 => resolved_text(data, &store.strings, index, slots)
                    .is_some_and(|text| texts.iter().any(|picked| picked == text)),
                3 => boolean_cell_value(data, index, slots).is_some_and(|value| {
                    let expected = if value {
                        VALUE_SET_TRUE
                    } else {
                        VALUE_SET_FALSE
                    };
                    texts.iter().any(|picked| picked == expected)
                }),
                _ => false,
            },
            ValueSet::Lookup {
                numbers: picked_numbers,
                texts: picked_texts,
                bools,
                ..
            } => match kind {
                1 => numeric_cell_value(data, index, slots).is_some_and(|value| {
                    let normalized = if value == 0.0 { 0.0 } else { value };
                    picked_numbers.binary_search(&normalized.to_bits()).is_ok()
                }),
                2 => resolved_text(data, &store.strings, index, slots).is_some_and(|text| {
                    picked_texts
                        .get_or_init(|| texts.iter().map(String::as_str).collect())
                        .contains(text)
                }),
                3 => boolean_cell_value(data, index, slots)
                    .is_some_and(|value| bools & boolean_bit(value) != 0),
                _ => false,
            },
        }
    }
}

/// The bit of a picked boolean in [`ValueSet::Lookup`].
const fn boolean_bit(value: bool) -> u8 {
    if value {
        VALUE_SET_TRUE_BIT
    } else {
        VALUE_SET_FALSE_BIT
    }
}

/// Filter kinds of [`CellStore::filter_rows_multi`]; its doc says what each keeps.
const FILTER_VALUES: u8 = 0;
const FILTER_CONTAINS: u8 = 1;
const FILTER_COMPARE: u8 = 2;
const FILTER_EMPTY: u8 = 3;
const FILTER_NON_EMPTY: u8 = 4;
const FILTER_CUSTOM: u8 = 5;
const FILTER_MONTHS: u8 = 6;

/// The flat filter arguments of [`CellStore::filter_rows_multi`], as
/// JavaScript passes them.
struct FilterInput<'a> {
    kinds: &'a [u8],
    flags: &'a [u8],
    nums: &'a [f64],
    num_counts: &'a [u32],
    text_counts: &'a [u32],
    value_nums: &'a [f64],
    value_texts: &'a [String],
}

impl<'a> FilterInput<'a> {
    /// One rule per filter, or `None` when a custom filter's criterion does
    /// not parse.
    fn rules(&self, strings: &StringStorage) -> Option<Vec<FilterRule<'a>>> {
        let mut rules = Vec::with_capacity(self.kinds.len());
        let (mut num_offset, mut text_offset) = (0usize, 0usize);
        for (i, &kind) in self.kinds.iter().enumerate() {
            let num_count = self.num_counts.get(i).copied().unwrap_or_default() as usize;
            let text_count = self.text_counts.get(i).copied().unwrap_or_default() as usize;
            let numbers = self
                .value_nums
                .get(num_offset..num_offset.saturating_add(num_count))
                .unwrap_or_default();
            let texts = self
                .value_texts
                .get(text_offset..text_offset.saturating_add(text_count))
                .unwrap_or_default();
            let flag = self.flags.get(i).copied().unwrap_or_default();
            rules.push(match kind {
                FILTER_VALUES => FilterRule::Values {
                    keeps_blank: flag & 1 != 0,
                    set: ValueSet::build(numbers, texts, strings),
                    numbers,
                    texts,
                },
                FILTER_CONTAINS => FilterRule::Contains {
                    needle: self
                        .value_texts
                        .get(text_offset)
                        .map(String::as_str)
                        .unwrap_or_default(),
                    case_insensitive: flag == 0,
                    cache: Box::new(MatchCache::new()),
                },
                FILTER_COMPARE => FilterRule::Compare {
                    op: flag,
                    value: self.nums.get(i).copied().unwrap_or_default(),
                },
                FILTER_EMPTY => FilterRule::Empty,
                FILTER_NON_EMPTY => FilterRule::NonEmpty,
                // Custom filters match as COUNTIF criteria do: one or two per filter.
                FILTER_CUSTOM => FilterRule::Custom {
                    any: flag & 1 != 0,
                    criteria: texts
                        .iter()
                        .map(|text| Criterion::parse(Value::text(text.as_str())).ok())
                        .collect::<Option<Vec<_>>>()?,
                },
                FILTER_MONTHS => FilterRule::Months(numbers),
                _ => FilterRule::Never,
            });
            num_offset = num_offset.saturating_add(num_count);
            text_offset = text_offset.saturating_add(text_count);
        }
        Some(rules)
    }
}

/// What one column filter of [`CellStore::filter_rows_multi`] keeps, parsed
/// once per scan.
enum FilterRule<'a> {
    /// The picked values, from `numbers` and `texts`; `keeps_blank` also
    /// keeps empty cells.
    Values {
        keeps_blank: bool,
        set: ValueSet<'a>,
        numbers: &'a [f64],
        texts: &'a [String],
    },
    /// Text that contains `needle`. The cache is boxed: it is large and the
    /// other rules are small.
    Contains {
        needle: &'a str,
        case_insensitive: bool,
        cache: Box<MatchCache>,
    },
    /// Numbers compared with `value`; `op` is 0 `>`, 1 `>=`, 2 `<`, 3 `<=`,
    /// 4 `=` and anything else `<>`.
    Compare {
        op: u8,
        value: f64,
    },
    Empty,
    NonEmpty,
    /// COUNTIF criteria; with `any` a row meets one of them, else all.
    Custom {
        any: bool,
        criteria: Vec<Criterion>,
    },
    /// Dates in these months (1 to 12) of any year.
    Months(&'a [f64]),
    /// An unknown kind keeps no row.
    Never,
}

/// One cell that a filter reads: the sheet, the store that owns it and the
/// cell's index in the sheet's column-major storage.
#[derive(Clone, Copy)]
struct FilterCell<'a> {
    data: &'a SheetData,
    store: &'a CellStore,
    index: usize,
}

impl FilterRule<'_> {
    /// Whether the cell passes, read through the general cell accessors, so
    /// formulas, errors and paged storage resolve as everywhere else.
    fn keeps(&mut self, cell: FilterCell<'_>) -> bool {
        let FilterCell { data, store, index } = cell;
        let slots = &store.formula_slots;
        match self {
            FilterRule::Values {
                keeps_blank,
                set,
                numbers,
                texts,
            } => {
                let kind = resolved_kind(data, index, slots);
                (kind == 0 && *keeps_blank) || set.holds(cell, kind, numbers, texts)
            }
            FilterRule::Contains {
                needle,
                case_insensitive,
                cache,
            } => cell_matches_text(data, store, index, needle, *case_insensitive, false, cache),
            FilterRule::Compare { op, value } => numeric_cell_value(data, index, slots)
                .is_some_and(|number| compare_number(*op, number, *value)),
            FilterRule::Empty => resolved_kind(data, index, slots) == 0,
            FilterRule::NonEmpty => resolved_kind(data, index, slots) != 0,
            FilterRule::Custom { any, criteria } => {
                let kind = resolved_kind(data, index, slots);
                let test = |criterion: &Criterion| {
                    criterion_matches_cell(data, store, index, kind, criterion)
                };
                if *any {
                    criteria.iter().any(test)
                } else {
                    criteria.iter().all(test)
                }
            }
            FilterRule::Months(months) => numeric_cell_value(data, index, slots)
                .and_then(excel_date_parts)
                .and_then(|(_, month, _)| i32::try_from(month).ok())
                .is_some_and(|month| months.contains(&f64::from(month))),
            FilterRule::Never => false,
        }
    }

    /// The answer for a literal cell of a dense column, from its raw kind byte
    /// and payload alone; the same answer [`Self::keeps`] gives. `None` for a
    /// formula or calculated cell, and for rules that always read the cell.
    #[inline]
    fn keeps_literal(&mut self, strings: &StringStorage, raw: u8, payload: u64) -> Option<bool> {
        match self {
            FilterRule::Contains {
                needle,
                case_insensitive,
                cache,
            } => match raw {
                KIND_STRING => Some(cache.matches(
                    strings,
                    payload_str_id(payload),
                    needle,
                    *case_insensitive,
                    false,
                )),
                KIND_NUMBER => Some(number_matches_text(
                    payload_num(payload),
                    needle,
                    *case_insensitive,
                    false,
                )),
                KIND_BOOL => Some(matches_needle(
                    boolean_text(payload_num(payload) != 0.0),
                    needle,
                    *case_insensitive,
                    false,
                )),
                KIND_EMPTY => Some(false),
                _ => None,
            },
            FilterRule::Values {
                keeps_blank,
                set:
                    ValueSet::Lookup {
                        numbers,
                        ids,
                        bools,
                        ..
                    },
                ..
            } => match raw {
                KIND_STRING => Some(ids.contains(payload_str_id(payload))),
                KIND_NUMBER => {
                    let value = payload_num(payload);
                    let normalized = if value == 0.0 { 0.0 } else { value };
                    Some(numbers.binary_search(&normalized.to_bits()).is_ok())
                }
                KIND_BOOL => Some(*bools & boolean_bit(payload_num(payload) != 0.0) != 0),
                KIND_EMPTY => Some(*keeps_blank),
                _ => None,
            },
            FilterRule::Values {
                set: ValueSet::Linear,
                ..
            }
            | FilterRule::Compare { .. }
            | FilterRule::Empty
            | FilterRule::NonEmpty
            | FilterRule::Custom { .. }
            | FilterRule::Months(_)
            | FilterRule::Never => None,
        }
    }
}

/// `cell op value` for the [`FilterRule::Compare`] op codes.
fn compare_number(op: u8, cell: f64, value: f64) -> bool {
    match op {
        0 => cell > value,
        1 => cell >= value,
        2 => cell < value,
        3 => cell <= value,
        4 => cell == value,
        _ => cell != value,
    }
}

/// The rows of `rows`, or of the whole sheet when `None`, whose cell in `col`
/// passes `rule`, in their order. A dense column answers literal cells from
/// their raw slots; every other cell goes through [`FilterRule::keeps`].
fn filter_column(
    store: &CellStore,
    data: &SheetData,
    col: usize,
    rule: &mut FilterRule<'_>,
    rows: Option<Vec<u32>>,
) -> Vec<u32> {
    let row_count = data.cells.row_count();
    let base = col * row_count;
    let cell = |row: usize| FilterCell {
        data,
        store,
        index: base + row,
    };
    let Some(column) = data.cells.dense_column(col) else {
        return keep_rows(row_count, rows, |row| rule.keeps(cell(row)));
    };

    let (kinds, payloads) = column.raw_slices();
    keep_rows(row_count, rows, |row| {
        let literal = match (kinds.get(row), payloads.get(row)) {
            (Some(&raw), Some(&payload)) => rule.keeps_literal(&store.strings, raw, payload),
            _ => None,
        };
        match literal {
            Some(kept) => kept,
            None => rule.keeps(cell(row)),
        }
    })
}

/// The rows that `keeps` accepts: of `0..row_count` when `rows` is `None`,
/// else of `rows`, in their order.
fn keep_rows(
    row_count: usize,
    rows: Option<Vec<u32>>,
    mut keeps: impl FnMut(usize) -> bool,
) -> Vec<u32> {
    let Some(mut kept) = rows else {
        return keep_all_rows(row_count, keeps);
    };
    kept.retain(|&row| keeps(row as usize));
    kept
}

/// Rows of one output mask in [`keep_all_rows`]: one bit of a `u64` each.
const MASK_ROWS: usize = 64;

/// The rows of `0..row_count` that `keeps` accepts, ascending. The answers of
/// each 64 rows go into a bit mask, and only then are the kept rows pushed: a
/// branch on each answer mispredicts on every kept row of a filter that keeps
/// rows scattered over the sheet. On 1,000,000 rows of seven cities this
/// halved a contains filter natively (4.9 to 2.6 ms).
fn keep_all_rows(row_count: usize, mut keeps: impl FnMut(usize) -> bool) -> Vec<u32> {
    let mut kept = Vec::new();
    for block_start in (0..row_count).step_by(MASK_ROWS) {
        let block_end = (block_start + MASK_ROWS).min(row_count);
        let mut mask = 0u64;
        for row in block_start..block_end {
            mask |= u64::from(keeps(row)) << (row - block_start);
        }
        while mask != 0 {
            kept.push((block_start + mask.trailing_zeros() as usize) as u32);
            mask &= mask - 1;
        }
    }
    kept
}

/// `filterRows` matches text in any letter case, anywhere in the cell.
const FILTER_CASE_INSENSITIVE: bool = true;
const FILTER_WHOLE_CELL: bool = false;

/// `aggregate` op codes. Every op except SUM also needs count and extrema.
const AGGREGATE_SUM: u8 = 0;
const AGGREGATE_AVERAGE: u8 = 1;
const AGGREGATE_MIN: u8 = 2;
const AGGREGATE_MAX: u8 = 3;

/// Running column aggregate. A sum skips the count and extrema updates.
struct NumericAccumulator {
    sum: f64,
    count: u32,
    min: f64,
    max: f64,
}

impl NumericAccumulator {
    const fn new() -> Self {
        Self {
            sum: 0.0,
            count: 0,
            min: f64::INFINITY,
            max: f64::NEG_INFINITY,
        }
    }

    #[inline]
    fn add(&mut self, value: f64, op: u8) {
        self.sum += value;
        if op != AGGREGATE_SUM {
            self.count += 1;
            self.min = self.min.min(value);
            self.max = self.max.max(value);
        }
    }
}

#[wasm_bindgen]
impl CellStore {
    /// `[contains cache constructions, owned distinct strings]`.
    /// @enginePublic Benchmarks check contains-cache construction and owned distinct strings.
    #[wasm_bindgen(js_name = queryResourceStats)]
    pub fn query_resource_stats(&self) -> Vec<f64> {
        QUERY_STATS.with(|stats| stats.get().into_iter().map(|value| value as f64).collect())
    }

    /// Zeroes the counters that `queryResourceStats` reports.
    ///
    /// @enginePublic Reset the resource counters before each benchmark probe.
    #[wasm_bindgen(js_name = resetQueryResourceStats)]
    pub fn reset_query_resource_stats(&self) {
        QUERY_STATS.with(|stats| stats.set([0, 0]));
    }

    /// Column aggregate over numeric cells. op: 0 sum, 1 avg, 2 min, 3 max, 4 count.
    #[wasm_bindgen(js_name = aggregate)]
    pub fn aggregate(&self, sheet: usize, col: usize, op: u8) -> f64 {
        let Some(s) = self.sheets.get(sheet) else {
            return 0.0;
        };
        if col >= s.cells.n_cols() {
            return 0.0;
        }

        let row_count = s.cells.row_count();
        let base = col * row_count;
        let mut acc = NumericAccumulator::new();

        // Dense columns scan their slices directly. A run read per cell adds a
        // dirty-overlay probe, a payload load and bounds checks for cells that
        // are not numbers, which made this scan 2.6-6x slower than 0.5.4.
        if let Some(column) = s.cells.dense_column(col) {
            let (kinds, payloads) = column.raw_slices();
            for (row, &raw) in kinds.iter().enumerate() {
                // The kind byte decides first, so text, booleans and blanks
                // never load their payload. A formula decodes its own slot and
                // builds its key from the loop's row and column, without the
                // style load and the divide that a general cell read costs.
                // Like paged storage and Excel, logical and blank results are
                // not numbers, and a spilled number counts.
                let value = match source_kind(raw) {
                    KIND_NUMBER => Some(f64::from_bits(payloads[row])),
                    KIND_FORMULA => {
                        let (kind, payload) = dense_resolved(raw, payloads[row]);
                        (!matches!(kind, KIND_STRING | KIND_BOOL | KIND_EMPTY)
                            && cell_key(row, col).is_some_and(|key| {
                                formula_error_at(s, key, &self.formula_slots).is_none()
                            }))
                        .then(|| payload_num(payload))
                    }
                    // A spilled value sits in a calculated slot with no source.
                    KIND_EMPTY if raw != KIND_EMPTY => {
                        let (kind, payload) = dense_resolved(raw, payloads[row]);
                        (kind == KIND_NUMBER).then(|| f64::from_bits(payload))
                    }
                    _ => None,
                };
                if let Some(found) = value {
                    acc.add(found, op);
                }
            }
        } else {
            // Paged runs touch each source page once, keeping eviction order
            // the same as a windowed read of this column.
            let end = base + row_count;
            let mut start = base;
            while start < end {
                let run = s.cells.run(start, end);
                for index in run.start..run.end {
                    if let Some(value) = numeric_cell_value(s, index, &self.formula_slots) {
                        acc.add(value, op);
                    }
                }
                start = run.end;
            }
        }

        let NumericAccumulator {
            sum,
            count,
            min,
            max,
        } = acc;

        match op {
            AGGREGATE_SUM => sum,
            AGGREGATE_AVERAGE => {
                if count > 0 {
                    sum / f64::from(count)
                } else {
                    0.0
                }
            }
            AGGREGATE_MIN => {
                if count > 0 {
                    min
                } else {
                    0.0
                }
            }
            AGGREGATE_MAX => {
                if count > 0 {
                    max
                } else {
                    0.0
                }
            }
            // COUNT is op 4; an unknown op also counts, as it always has.
            _ => f64::from(count),
        }
    }

    /// Data-row indices whose column text contains `needle` (case-insensitive).
    #[wasm_bindgen(js_name = filterRows)]
    pub fn filter_rows(&self, sheet: usize, col: usize, needle: &str) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if col >= s.cells.n_cols() {
            return Vec::new();
        }

        let base = col * s.cells.row_count();
        let lower_needle = needle.to_lowercase();

        let mut cache = MatchCache::new();

        // Dense columns read their slices directly; see `aggregate`.
        if let Some(column) = s.cells.dense_column(col) {
            let (kinds, payloads) = column.raw_slices();
            return keep_all_rows(kinds.len(), |row| {
                let (Some(&raw), Some(&payload)) = (kinds.get(row), payloads.get(row)) else {
                    return false;
                };
                // Literals never carry the calculated bit, so the raw byte
                // classifies them and their payload is their value; a bare
                // empty byte has no calculated value. Only formula and
                // calculated slots need the general cell match.
                match raw {
                    KIND_STRING => cache.matches(
                        &self.strings,
                        payload_str_id(payload),
                        &lower_needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                    ),
                    KIND_NUMBER => number_matches_text(
                        payload_num(payload),
                        &lower_needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                    ),
                    KIND_BOOL => matches_needle(
                        boolean_text(payload_num(payload) != 0.0),
                        &lower_needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                    ),
                    KIND_EMPTY => false,
                    _ => cell_matches_text(
                        s,
                        self,
                        base + row,
                        &lower_needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                        &mut cache,
                    ),
                }
            });
        }

        let mut out: Vec<u32> = Vec::with_capacity(s.cells.row_count().min(1024));

        let mut start = base;
        let end = base + s.cells.row_count();
        while start < end {
            let run = s.cells.run(start, end);
            for index in run.start..run.end {
                let (kind, payload) = run.source(index);
                let matched = if kind == KIND_STRING {
                    cache.matches(
                        &self.strings,
                        payload_str_id(payload),
                        &lower_needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                    )
                } else if kind == KIND_EMPTY && run.resolved(index).0 == KIND_EMPTY {
                    false
                } else {
                    cell_matches_text(
                        s,
                        self,
                        index,
                        &lower_needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                        &mut cache,
                    )
                };
                if matched {
                    out.push((index - base) as u32);
                }
            }
            start = run.end;
        }
        out
    }

    /// Ctrl+Arrow destination: from `(row, col)` stepping by `(d_row, d_col)`
    /// (exactly one of them ±1), return the destination row (vertical moves) or
    /// column (horizontal moves), Google Sheets semantics:
    ///
    /// - current and adjacent cell non-empty → end of the contiguous non-empty
    ///   run;
    /// - otherwise → the next non-empty cell in that direction;
    /// - nothing ahead → the sheet edge.
    #[wasm_bindgen(js_name = dataEdge)]
    pub fn data_edge(&self, sheet: usize, row: usize, col: usize, d_row: i32, d_col: i32) -> u32 {
        let Some(s) = self.sheets.get(sheet) else {
            return 0;
        };
        if row >= s.cells.row_count()
            || col >= s.cells.n_cols()
            || s.cells.row_count() == 0
            || s.cells.n_cols() == 0
        {
            return 0;
        }

        let vertical = d_row != 0;
        let (pos, limit, step) = if vertical {
            (row, s.cells.row_count(), d_row.signum() as isize)
        } else {
            (col, s.cells.n_cols(), d_col.signum() as isize)
        };

        // Column-major layout: vertical scans walk a contiguous column slice,
        // horizontal scans stride by `row_count`.
        let index_of = |p: usize| -> usize {
            if vertical {
                col * s.cells.row_count() + p
            } else {
                p * s.cells.row_count() + row
            }
        };
        let occupied = |p: usize| -> bool { s.cells.kind_at(index_of(p)) != KIND_EMPTY };

        let last = limit - 1;
        let next = pos as isize + step;
        if next < 0 || next as usize > last {
            return if step < 0 { 0 } else { last as u32 };
        }
        let next_index = next as usize;

        if occupied(pos) && occupied(next_index) {
            let mut p = next_index;
            loop {
                let ahead = p as isize + step;
                if ahead < 0 || ahead as usize > last || !occupied(ahead as usize) {
                    return p as u32;
                }
                p = ahead as usize;
            }
        }

        let mut p = next_index as isize;
        while p >= 0 && p as usize <= last {
            if occupied(p as usize) {
                return p as u32;
            }
            p += step;
        }
        if step < 0 {
            0
        } else {
            last as u32
        }
    }

    /// Cell coordinates that Find's `query` matches, as a flat
    /// `[row, col, ...]` list. `query` takes Excel's wildcards: `*`, `?` and
    /// `~`. With `formulas`, a formula cell matches by its formula text, as in
    /// Excel's "Look in: Formulas"; otherwise every cell matches by its value.
    /// Scans the requested columns column-major (cache-local), then sorts
    /// row-major so search navigation runs top-to-bottom, left-to-right.
    #[wasm_bindgen(js_name = search)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars; separate flags keep older five-argument callers reading values"
    )]
    pub fn search(
        &self,
        sheet: usize,
        cols: &[u32],
        query: &str,
        case_insensitive: bool,
        whole_cell: bool,
        formulas: bool,
    ) -> Vec<u32> {
        let Some(find) = FindQuery::new(query, case_insensitive, whole_cell) else {
            return Vec::new();
        };

        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let mut pairs: Vec<(u32, u32)> = Vec::new();
        let mut cache = MatchCache::new();

        for &col_u in cols {
            let col = col_u as usize;
            if col >= s.cells.n_cols() {
                continue;
            }

            let base = col * s.cells.row_count();
            for row in 0..s.cells.row_count() {
                if find.cell_matches(s, self, base + row, formulas, &mut cache) {
                    pairs.push((row as u32, col_u));
                }
            }
        }

        pairs.sort_unstable();

        let mut out = Vec::with_capacity(pairs.len() * 2);
        for (row, col) in pairs {
            out.push(row);
            out.push(col);
        }
        out
    }
}

/// Single-key sort stays a crate helper: JS sorts through `sortRowsMulti`,
/// which delegates here for one key without a survivor list.
impl CellStore {
    /// Stable row order sorted by a column. Returns a data-row permutation.
    pub(crate) fn sort_rows(&self, sheet: usize, col: usize, ascending: bool) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if col >= s.cells.n_cols() {
            return Vec::new();
        }

        let base = col * s.cells.row_count();

        if let Some(order) = if s.cells.row_count() >= MIN_RADIX_SORT_ROWS {
            sort_finite_number_column_radix(s, col, ascending)
        } else {
            sort_finite_number_column_comparison(s, base, ascending)
        } {
            return order;
        }

        // Decorate-sort-undecorate: materialize each row's comparison key ONCE
        // (one pool deref per row) instead of rebuilding both operands inside
        // the comparator — a comparison sort would otherwise reconstruct keys
        // ~2·n·log2(n) times, each a scattered heap deref for text cells.
        let mut keys = SortKeyBuilder::with_capacity(s.cells.row_count());
        let mut start = base;
        let end = base + s.cells.row_count();
        while start < end {
            let run = s.cells.run(start, end);
            for index in run.start..run.end {
                keys.push(ComparableCell::from_run(
                    s,
                    &self.strings,
                    &run,
                    index,
                    &self.formula_slots,
                ));
            }
            start = run.end;
        }
        let ranked = keys.rank();

        // The row in the low bits breaks ties, so equal rows keep their order.
        let mut packed: Vec<u128> = (0..s.cells.row_count())
            .map(|row| ranked.packed(row, ascending) | row as u128)
            .collect();
        sort_u128(&mut packed);
        packed.into_iter().map(key_index).collect()
    }

    /// The ranked sort keys of `rows` in `cols`, key-major: key `k` of the
    /// row at position `p` is `k * rows.len() + p`.
    fn ranked_row_keys(&self, data: &SheetData, cols: &[u32], rows: &[u32]) -> SortKeys {
        let row_count = rows.len();
        // Decorate-sort-undecorate per key, the same way the one-key path does:
        // a comparison sort that rebuilt both operands would reconstruct each
        // key ~2·n·log2(n) times, and a text key costs a scattered pool deref
        // every time. Keys are stored key-major so the first key — the one that
        // decides nearly every comparison — stays contiguous.
        let mut keys = SortKeyBuilder::with_capacity(row_count * cols.len());
        for &col in cols {
            let base = col as usize * data.cells.row_count();

            let mut cached_run: Option<CellRun<'_>> = None;
            for &row in rows {
                let index = base + row as usize;
                let run = cached_run
                    .get_or_insert_with(|| data.cells.run(index, base + data.cells.row_count()));
                if index < run.start || index >= run.end {
                    *run = data.cells.run(index, base + data.cells.row_count());
                }
                keys.push(ComparableCell::from_run(
                    data,
                    &self.strings,
                    run,
                    index,
                    &self.formula_slots,
                ));
            }
        }
        keys.rank()
    }
}

/// Positions `0..rows.len()` sorted by `key_count` keys, then by row.
///
/// Starts in row order and sorts by the first key; then each run of
/// positions that tie on every key so far is sorted by the next key, with
/// the position's place in its run as the tie-break. That is the order of a
/// stable sort by all keys, and most rows never compare a second key.
fn sort_positions_by_keys(
    ranked: &SortKeys,
    rows: &[u32],
    key_count: usize,
    ascending: &[u8],
) -> Vec<u32> {
    let row_count = rows.len();
    let mut positions: Vec<u32> = if rows.is_sorted() {
        (0..row_count as u32).collect()
    } else {
        let mut by_row: Vec<u64> = rows
            .iter()
            .enumerate()
            .map(|(position, &row)| u64::from(row) << 32 | position as u64)
            .collect();
        sort_u64(&mut by_row);
        by_row.into_iter().map(|key| key as u32).collect()
    };

    let mut runs = vec![(0, row_count)];
    let mut next_runs = Vec::new();
    // A key with no number packs into 64 bits while the slot fits the bits
    // below it, and a 64-bit sort compares in one instruction instead of two.
    let fits_narrow = row_count <= 1 << NARROW_SLOT_BITS;
    for key in 0..key_count {
        let key_ascending = ascending.get(key).copied().unwrap_or(1) != 0;
        let first = key * row_count;
        next_runs.clear();
        let ties = (key + 1 < key_count).then_some(&mut next_runs);
        if fits_narrow && ranked.is_narrow(first..first + row_count) {
            sort_runs_by_key(&mut positions, &runs, ties, |position| {
                ranked.packed_narrow(first + position as usize, key_ascending)
            });
        } else {
            sort_runs_by_key(&mut positions, &runs, ties, |position| {
                ranked.packed(first + position as usize, key_ascending)
            });
        }
        std::mem::swap(&mut runs, &mut next_runs);
    }
    positions
}

/// Bits below a 64-bit packed sort key's order for its slot in the run: the
/// class and the 32-bit value of [`SortKeys::packed_narrow`] take the other 35.
const NARROW_SLOT_BITS: u32 = 29;

/// A packed sort key: an order whose unsigned order is the key's, above the
/// slot of its position in the run, which breaks ties.
trait PackedSortKey: Copy + Eq {
    fn sort(keys: &mut [Self]);
    fn with_slot(self, slot: usize) -> Self;
    fn slot(self) -> usize;
    /// The key without its slot.
    fn order(self) -> Self;
}

impl PackedSortKey for u64 {
    fn sort(keys: &mut [Self]) {
        sort_u64(keys);
    }

    fn with_slot(self, slot: usize) -> Self {
        self | slot as Self
    }

    fn slot(self) -> usize {
        (self & ((1 << NARROW_SLOT_BITS) - 1)) as usize
    }

    fn order(self) -> Self {
        self >> NARROW_SLOT_BITS
    }
}

impl PackedSortKey for u128 {
    fn sort(keys: &mut [Self]) {
        sort_u128(keys);
    }

    fn with_slot(self, slot: usize) -> Self {
        self | slot as Self
    }

    fn slot(self) -> usize {
        key_index(self) as usize
    }

    fn order(self) -> Self {
        self >> 32
    }
}

/// The positions `start..end` of a run, as `(start, end)`.
type PositionRun = (usize, usize);

/// Sorts each run of `positions` by one key, `pack` giving a position's
/// key without its slot, and adds to `ties`, when given, the runs of
/// positions that still tie after it.
fn sort_runs_by_key<K: PackedSortKey>(
    positions: &mut [u32],
    runs: &[PositionRun],
    mut ties: Option<&mut Vec<PositionRun>>,
    pack: impl Fn(u32) -> K,
) {
    let mut packed: Vec<K> = Vec::new();
    let mut sorted: Vec<u32> = Vec::new();
    for &(start, end) in runs {
        packed.clear();
        packed.extend(
            positions[start..end]
                .iter()
                .enumerate()
                .map(|(slot, &position)| pack(position).with_slot(slot)),
        );
        K::sort(&mut packed);
        sorted.clear();
        sorted.extend(packed.iter().map(|&key| positions[start + key.slot()]));
        positions[start..end].copy_from_slice(&sorted);

        let Some(next_runs) = ties.as_deref_mut() else {
            continue;
        };
        // Runs of equal keys: the packed keys differ only in the slot.
        let mut run_start = 0;
        for slot in 1..=packed.len() {
            if slot == packed.len() || packed[slot].order() != packed[run_start].order() {
                if slot - run_start > 1 {
                    next_runs.push((start + run_start, start + slot));
                }
                run_start = slot;
            }
        }
    }
}

#[wasm_bindgen]
impl CellStore {
    /// The rows of `sheet` sorted by the columns `cols`, the first column
    /// deciding first. Key `i` sorts ascending unless `ascending[i]` is 0; a
    /// missing entry sorts ascending. When `candidates` is not empty, only
    /// those rows take part. Equal rows keep their order. Empty when the
    /// sheet or a column does not exist.
    #[wasm_bindgen(js_name = sortRowsMulti)]
    pub fn sort_rows_multi(
        &self,
        sheet: usize,
        cols: &[u32],
        ascending: &[u8],
        candidates: &[u32],
    ) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if cols.is_empty() {
            return candidates.to_vec();
        }
        if cols.len() == 1 && candidates.is_empty() {
            return self.sort_rows(
                sheet,
                cols[0] as usize,
                ascending.first().copied().unwrap_or(1) != 0,
            );
        }
        if cols.iter().any(|&col| col as usize >= data.cells.n_cols()) {
            return Vec::new();
        }
        let rows: Vec<u32> = if candidates.is_empty() {
            (0..data.cells.row_count() as u32).collect()
        } else {
            candidates
                .iter()
                .copied()
                .filter(|&row| (row as usize) < data.cells.row_count())
                .collect()
        };
        let ranked = self.ranked_row_keys(data, cols, &rows);

        sort_positions_by_keys(&ranked, &rows, cols.len(), ascending)
            .into_iter()
            .map(|position| rows[position as usize])
            .collect()
    }

    /// The rows of `sheet` that pass every column filter. Filter `i` reads
    /// column `cols[i]`, and `kinds[i]` says what it keeps:
    ///
    /// - 0, a value list: its next `num_counts[i]` numbers in `value_nums` and
    ///   next `text_counts[i]` texts in `value_texts` (booleans as `\0TRUE` and
    ///   `\0FALSE`); bit 1 of `flags[i]` also keeps empty cells.
    /// - 1, text that contains its one text in `value_texts`; `flags[i]` 1
    ///   matches case.
    /// - 2, numbers compared with `nums[i]`; `flags[i]` is 0 `>`, 1 `>=`, 2 `<`,
    ///   3 `<=`, 4 `=`, anything else `<>`.
    /// - 3, empty cells; 4, cells that are not empty.
    /// - 5, Excel's custom filter: its next `text_counts[i]` texts in
    ///   `value_texts` are COUNTIF criteria (`">5"`, `"=ab*"`); bit 1 of
    ///   `flags[i]` keeps a row that meets any of them, else it must meet all.
    /// - 6, dates in some months of any year, as Excel's "All Dates in the
    ///   Period": its next `num_counts[i]` numbers in `value_nums` are the
    ///   months it keeps, 1 to 12. Numbers that are not dates and other
    ///   cells do not match.
    ///
    /// Empty when the sheet or a column does not exist.
    #[wasm_bindgen(js_name = filterRowsMulti)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn filter_rows_multi(
        &self,
        sheet: usize,
        cols: &[u32],
        kinds: &[u8],
        flags: &[u8],
        nums: &[f64],
        num_counts: &[u32],
        text_counts: &[u32],
        value_nums: &[f64],
        value_texts: Vec<String>,
    ) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if cols.len() != kinds.len() || cols.iter().any(|&col| col as usize >= data.cells.n_cols())
        {
            return Vec::new();
        }
        QUERY_STATS.with(|stats| {
            let mut current = stats.get();
            let caches = kinds
                .iter()
                .filter(|&&kind| kind == FILTER_CONTAINS)
                .count();
            current[0] = current[0].saturating_add(caches as u64);
            stats.set(current);
        });
        let input = FilterInput {
            kinds,
            flags,
            nums,
            num_counts,
            text_counts,
            value_nums,
            value_texts: &value_texts,
        };
        let Some(mut rules) = input.rules(&self.strings) else {
            return Vec::new();
        };

        // Each filter reads its own column, down the rows that every earlier
        // filter kept: one column at a time, in the store's column-major order.
        let mut kept: Option<Vec<u32>> = None;
        for (rule, &col) in rules.iter_mut().zip(cols) {
            let rows = filter_column(self, data, col as usize, rule, kept.take());
            let is_done = rows.is_empty();
            kept = Some(rows);
            if is_done {
                break;
            }
        }
        kept.unwrap_or_else(|| (0..data.cells.row_count() as u32).collect())
    }

    /// Distinct resolved values of a whole column, in first-seen order.
    #[wasm_bindgen(js_name = distinctValues)]
    pub fn distinct_values(&self, sheet: usize, col: usize, limit: usize) -> DistinctColumn {
        self.distinct_values_in_rows(sheet, col, 0, usize::MAX, limit, None, false)
    }

    /// Distinct resolved values of one column over the canonical data rows
    /// `start_row..end_row`, in first-seen order. The range is clipped to the
    /// sheet. With `rows`, only those rows are read, in the order given, and
    /// those outside the range are skipped: an `AutoFilter` lists the rows the
    /// other column filters keep. A zero `limit` returns every value;
    /// otherwise the scan stops at `limit` values. With `counted` it reads on
    /// past them, so each listed value's count covers every row, and it gives
    /// each value's count and first style, as the `AutoFilter` dropdown shows
    /// them; without, those stay empty.
    #[wasm_bindgen(js_name = distinctValuesInRows)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars"
    )]
    pub fn distinct_values_in_rows(
        &self,
        sheet: usize,
        col: usize,
        start_row: usize,
        end_row: usize,
        limit: usize,
        rows: Option<Vec<u32>>,
        counted: bool,
    ) -> DistinctColumn {
        let Some(data) = self.sheets.get(sheet) else {
            return DistinctColumn::default();
        };
        if col >= data.cells.n_cols() {
            return DistinctColumn::default();
        }
        let row_count = data.cells.row_count();
        let range = start_row.min(row_count)..end_row.min(row_count);
        let reach = DistinctLimit {
            values: limit,
            counted,
        };
        let out = match rows {
            Some(listed) => {
                let in_range = listed
                    .iter()
                    .map(|&row| row as usize)
                    .filter(|row| range.contains(row));
                distinct_over(self, data, col, in_range, reach)
            }
            None => distinct_dense(self, data, col, range.clone(), reach)
                .unwrap_or_else(|| distinct_over(self, data, col, range, reach)),
        };
        QUERY_STATS.with(|stats| {
            let mut current = stats.get();
            current[1] = current[1].saturating_add(out.text_lengths.len() as u64);
            stats.set(current);
        });
        out
    }

    /// `dataEdge` in a view order, where `order[i]` is the data row shown at
    /// view position `i` and `row` is a view position. A vertical move scans
    /// view positions and returns one; a horizontal move returns a column, as
    /// `dataEdge` does on the data row at `row`. 0 when the sheet, the
    /// position or the column does not exist.
    #[wasm_bindgen(js_name = dataEdgeOrdered)]
    pub fn data_edge_ordered(
        &self,
        sheet: usize,
        order: &[u32],
        row: usize,
        col: usize,
        d_row: i32,
        d_col: i32,
    ) -> u32 {
        let Some(data) = self.sheets.get(sheet) else {
            return 0;
        };
        if row >= order.len() || col >= data.cells.n_cols() {
            return 0;
        }
        if d_row == 0 {
            return self.data_edge(sheet, order[row] as usize, col, 0, d_col);
        }
        // Literal kinds decide occupancy from the raw byte; only formula and
        // calculated cells need the resolved kind with its error lookup.
        let column = data.cells.dense_column(col);
        let occupied = |view: usize| {
            order.get(view).is_some_and(|&r| {
                let data_row = r as usize;
                let index = col * data.cells.row_count() + data_row;
                data_row < data.cells.row_count()
                    && match column.map(|dense| dense.raw_kind(data_row)) {
                        Some(KIND_NUMBER | KIND_STRING | KIND_BOOL) => true,
                        Some(KIND_EMPTY) => false,
                        _ => resolved_kind(data, index, &self.formula_slots) != 0,
                    }
            })
        };
        edge_scan(row, order.len(), d_row.signum() as isize, occupied) as u32
    }
}

/// A value a distinct scan meets: a pooled text by its id, or any other value
/// by its key.
enum Met<'a> {
    Id(u32),
    Key(DistinctKey<'a>),
}

/// How far a distinct scan reads: it lists at most `values` values (0 lists
/// them all), and with `counted` it reads on past them so each listed value's
/// count covers every row.
#[derive(Clone, Copy)]
struct DistinctLimit {
    values: usize,
    counted: bool,
}

/// The values a distinct scan has listed, and the marks that tell it which
/// values it met before: a slot per pool id when it counts, one bit per pool
/// id when it only lists, and a slot per key for every other value.
struct DistinctScan<'a> {
    store: &'a CellStore,
    data: &'a SheetData,
    reach: DistinctLimit,
    out: DistinctColumn,
    id_slots: PoolIdSlots,
    id_stamps: PoolIdStamps,
    key_slots: FxHashMap<DistinctKey<'a>, usize>,
}

impl<'a> DistinctScan<'a> {
    fn new(store: &'a CellStore, data: &'a SheetData, reach: DistinctLimit) -> Self {
        Self {
            store,
            data,
            reach,
            out: DistinctColumn::default(),
            id_slots: PoolIdSlots::new(),
            id_stamps: PoolIdStamps::new(),
            key_slots: FxHashMap::default(),
        }
    }

    /// Whether a scan that only lists holds `limit` values, so it is done.
    #[inline]
    const fn listed_all(&self) -> bool {
        !self.reach.counted && self.reach.values != 0 && self.out.kinds.len() >= self.reach.values
    }

    /// Meets the cell at `index`, of resolved `kind`, as `met`; true when it
    /// lists a new value. A counted scan counts a value it met before once
    /// more. A new value is listed unless the list is full; a value first met
    /// once the list is full is not listed.
    #[inline]
    fn meet(&mut self, index: usize, kind: u8, met: Met<'a>) -> bool {
        match met {
            Met::Id(id) => self.meet_id(index, kind, id),
            Met::Key(key) => self.meet_key(index, kind, key),
        }
    }

    /// [`Self::meet`] for text with the pool id `id`.
    #[inline]
    fn meet_id(&mut self, index: usize, kind: u8, id: u32) -> bool {
        if !self.reach.counted {
            if !self.id_stamps.insert(id) {
                return false;
            }
            self.list(index, kind);
            return true;
        }
        let next = self.out.kinds.len();
        let full = self.reach.values != 0 && next >= self.reach.values;
        match self.id_slots.slot(id, next, full) {
            Some(slot) if slot < next => {
                self.count_again(slot);
                false
            }
            Some(_) => {
                self.list(index, kind);
                true
            }
            None => false,
        }
    }

    /// [`Self::meet`] for any value but pooled text, by its key.
    #[inline(never)]
    fn meet_key(&mut self, index: usize, kind: u8, key: DistinctKey<'a>) -> bool {
        let next = self.out.kinds.len();
        let full = self.reach.values != 0 && next >= self.reach.values;
        let found = if full {
            self.key_slots.get(&key).copied()
        } else {
            Some(*self.key_slots.entry(key).or_insert(next))
        };
        match found {
            Some(slot) if slot < next => {
                self.count_again(slot);
                false
            }
            Some(_) => {
                self.list(index, kind);
                true
            }
            None => false,
        }
    }

    /// Whether the scan met the text with the pool id `id` before: a listing
    /// scan marked it, or a counted scan gave it a slot.
    #[inline]
    fn has_met(&self, id: u32) -> bool {
        if self.reach.counted {
            self.id_slots
                .slots
                .get(id as usize)
                .is_some_and(|&stored| stored != 0)
        } else {
            stamp_marked(&self.id_stamps.words, id)
        }
    }

    /// The number of leading rows of `kinds` and `payloads` that hold literal
    /// text the scan met before. A counted scan counts them as it passes.
    #[inline]
    fn pass_met_text(&mut self, kinds: &[u8], payloads: &[u64]) -> usize {
        if self.reach.counted {
            count_listed_text_run(kinds, payloads, &self.id_slots.slots, &mut self.out.counts)
        } else {
            marked_text_run(kinds, payloads, &self.id_stamps.words)
        }
    }

    /// [`Self::meet`] for the cell at `index`, resolved first. `None` for text
    /// without a pool id, which has to meet pooled text by content.
    #[inline(never)]
    fn meet_cell(&mut self, index: usize) -> Option<bool> {
        let (kind, met) = met_at(self.store, self.data, index, true)?;
        Some(self.meet(index, kind, met))
    }

    /// Counts one more row that holds the value listed at `slot`.
    #[inline]
    fn count_again(&mut self, slot: usize) {
        if let Some(rows_holding) = self.out.counts.get_mut(slot) {
            *rows_holding = rows_holding.saturating_add(1);
        }
    }

    /// Lists the value of the cell at `index`, of resolved `kind`; a counted
    /// scan also keeps its style and a count of one.
    #[inline(never)]
    fn list(&mut self, index: usize, kind: u8) {
        if self.reach.counted {
            self.out.styles.push(self.data.cells.style_at(index));
            self.out.counts.push(1);
        }
        push_entry(&mut self.out, self.store, self.data, index, kind);
    }
}

/// The resolved kind of the cell at `index` and the value it meets a distinct
/// scan as. While `pooled`, text meets it by pool id; `None` for text without
/// one, which has to meet pooled text by content.
#[inline]
fn met_at<'a>(
    store: &'a CellStore,
    data: &SheetData,
    index: usize,
    pooled: bool,
) -> Option<(u8, Met<'a>)> {
    let slots = &store.formula_slots;
    let kind = resolved_kind(data, index, slots);
    let met = match kind {
        1 => Met::Key(DistinctKey::Number(
            numeric_cell_value(data, index, slots)
                .unwrap_or_default()
                .to_bits(),
        )),
        2 if pooled => match data.cells.str_id_at(index) {
            NO_STRING => return None,
            id => Met::Id(id),
        },
        2 => Met::Key(DistinctKey::Text(
            resolved_text(data, &store.strings, index, slots).unwrap_or_default(),
        )),
        3 => Met::Key(DistinctKey::Bool(
            boolean_cell_value(data, index, slots).unwrap_or_default(),
        )),
        _ => Met::Key(DistinctKey::Blank),
    };
    Some((kind, met))
}

/// The distinct resolved values of `col` over `rows`, in first-seen order. A
/// `counted` scan also gives the style of each one's first cell and how many
/// of the rows read hold it, and keeps each pool id's slot to count it. A
/// scan that only lists stops at `limit` values and marks pool ids with one
/// bit, so it never zero-fills four bytes per id of the string pool.
/// [`distinct_dense`] does the same over a row range of a dense column.
fn distinct_over(
    store: &CellStore,
    data: &SheetData,
    col: usize,
    rows: impl Iterator<Item = usize> + Clone,
    reach: DistinctLimit,
) -> DistinctColumn {
    // Stored text carries a pool id that stands for its value, so the scan
    // dedupes it by id instead of hashing the characters.
    // Text without an id — the sentinel a formula error reports reads back as
    // plain text — still has to meet pooled text by content, so the first
    // such cell restarts the scan on content hashing. The restart is rare and
    // keeps equal text a single entry, in first-seen order, either way.
    let mut pooled = true;
    loop {
        let mut scan = DistinctScan::new(store, data, reach);
        let mut needs_content = false;
        for row in rows.clone() {
            let index = col * data.cells.row_count() + row;
            let Some((kind, met)) = met_at(store, data, index, pooled) else {
                needs_content = true;
                break;
            };
            if scan.meet(index, kind, met) && scan.listed_all() {
                break;
            }
        }
        if !needs_content {
            return scan.out;
        }
        pooled = false;
    }
}

/// [`distinct_over`] for the row range `rows` of a dense column. It reads the
/// raw kind and payload slices. Literal text, the common cell, meets the scan
/// by the pool id in its payload without resolving the cell, and the rows of
/// text the scan met before go through one small loop that only marks or
/// counts them ([`marked_text_run`], [`count_listed_text_run`]); every other
/// row resolves as in [`distinct_over`]. Listing and counting share this
/// function, so the `AutoFilter` dropdown's counted scan runs the code that
/// listing calls (the cell editor's completion, the pivot field list) keep
/// optimized. `None` for a paged column, or when a text cell has no pool id:
/// [`distinct_over`] then scans on content.
fn distinct_dense(
    store: &CellStore,
    data: &SheetData,
    col: usize,
    rows: Range<usize>,
    reach: DistinctLimit,
) -> Option<DistinctColumn> {
    let column = data.cells.dense_column(col)?;
    let (column_kinds, column_payloads) = column.raw_slices();
    let kinds = column_kinds.get(rows.clone())?;
    let payloads = column_payloads.get(rows.clone())?;
    let first = col * data.cells.row_count() + rows.start;
    let mut scan = DistinctScan::new(store, data, reach);
    let mut offset = 0;
    while let (Some(&kind), Some(&payload)) = (kinds.get(offset), payloads.get(offset)) {
        let index = first + offset;
        let listed = if kind == KIND_STRING && payload_is_str(payload) {
            let id = payload_str_id(payload);
            if scan.has_met(id) {
                let passed = scan.pass_met_text(
                    kinds.get(offset..).unwrap_or_default(),
                    payloads.get(offset..).unwrap_or_default(),
                );
                if passed > 0 {
                    offset += passed;
                    continue;
                }
            }
            scan.meet_id(index, KIND_STRING, id)
        } else {
            scan.meet_cell(index)?
        };
        if listed && scan.listed_all() {
            break;
        }
        offset += 1;
    }
    Some(scan.out)
}

/// The number of leading rows that hold literal text whose pool id `marks`
/// has marked: the rows a listing scan passes over. It is a small function on
/// its own, so the WebAssembly engines keep the slices in registers and
/// optimize it early.
#[inline(never)]
fn marked_text_run(kinds: &[u8], payloads: &[u64], marks: &[u64]) -> usize {
    let unmarked = |(&kind, &payload): (&u8, &u64)| {
        kind != KIND_STRING
            || !payload_is_str(payload)
            || !stamp_marked(marks, payload_str_id(payload))
    };
    // Every row is marked text when none stops the run.
    kinds
        .iter()
        .zip(payloads)
        .position(unmarked)
        .unwrap_or(kinds.len())
}

/// Whether the [`PoolIdStamps`] words `marks` hold the mark of `id`.
#[inline]
fn stamp_marked(marks: &[u64], id: u32) -> bool {
    let index = id as usize;
    marks
        .get(index / STAMP_WORD_BITS)
        .is_some_and(|&bits| (bits >> (index % STAMP_WORD_BITS)) & 1 != 0)
}

/// The number of leading rows that hold literal text a counted scan listed
/// before, each counted into `counts` at the slot `slots` holds for its pool
/// id (slot `s` stored as `s + 1`): the rows a counted scan only counts. Small
/// on its own for the same reason as [`marked_text_run`].
#[inline(never)]
fn count_listed_text_run(
    kinds: &[u8],
    payloads: &[u64],
    slots: &[u32],
    counts: &mut [u32],
) -> usize {
    for (offset, (&kind, &payload)) in kinds.iter().zip(payloads).enumerate() {
        if kind != KIND_STRING || !payload_is_str(payload) {
            return offset;
        }
        let stored = slots
            .get(payload_str_id(payload) as usize)
            .copied()
            .unwrap_or_default();
        let Some(rows_holding) = (stored as usize)
            .checked_sub(1)
            .and_then(|slot| counts.get_mut(slot))
        else {
            return offset;
        };
        *rows_holding = rows_holding.saturating_add(1);
    }
    kinds.len()
}

/// Lists the value of the cell at `index`, of resolved `kind`, as a new entry.
fn push_entry(
    out: &mut DistinctColumn,
    store: &CellStore,
    data: &SheetData,
    index: usize,
    kind: u8,
) {
    out.kinds.push(kind);
    match kind {
        1 => out
            .numbers
            .push(numeric_cell_value(data, index, &store.formula_slots).unwrap_or_default()),
        3 => out.numbers.push(
            if boolean_cell_value(data, index, &store.formula_slots).unwrap_or_default() {
                1.0
            } else {
                0.0
            },
        ),
        2 => out.push_text(
            resolved_text(data, &store.strings, index, &store.formula_slots).unwrap_or_default(),
        ),
        _ => {}
    }
}

/// Whether the cell at `index`, of resolved `kind`, meets a COUNTIF criterion.
/// Error cells meet it as their error value, as in COUNTIF.
fn criterion_matches_cell(
    sheet: &SheetData,
    store: &CellStore,
    index: usize,
    kind: u8,
    criterion: &Criterion,
) -> bool {
    let slots = &store.formula_slots;
    match kind {
        1 => numeric_cell_value(sheet, index, slots)
            .is_some_and(|value| criterion.matches_number(value)),
        3 => boolean_cell_value(sheet, index, slots)
            .is_some_and(|value| criterion.matches(&Value::Bool(value))),
        2 => {
            let formula_error = (sheet.cells.kind_at(index) == KIND_FORMULA)
                .then(|| key_for_index(sheet, index))
                .flatten()
                .and_then(|key| formula_error_at(sheet, key, slots));
            match formula_error {
                Some(error) => criterion.matches(&Value::Error(error)),
                None => resolved_text(sheet, &store.strings, index, slots)
                    .is_some_and(|text| criterion.matches_text(text)),
            }
        }
        _ => criterion.matches(&Value::Blank),
    }
}

fn resolved_kind(sheet: &SheetData, index: usize, slots: &FormulaStore) -> u8 {
    match sheet.cells.kind_at(index) {
        KIND_NUMBER => 1,
        KIND_STRING => 2,
        KIND_BOOL => 3,
        KIND_FORMULA => {
            let Some(key) = key_for_index(sheet, index) else {
                return 0;
            };
            if formula_error_at(sheet, key, slots).is_some() {
                return 2;
            }
            match sheet.cells.formula_value_kind(index) {
                FormulaValueKind::Number => 1,
                FormulaValueKind::Text => 2,
                FormulaValueKind::Bool => 3,
                FormulaValueKind::Blank => 0,
            }
        }
        _ => 0,
    }
}

const fn boolean_text(value: bool) -> &'static str {
    if value {
        "TRUE"
    } else {
        "FALSE"
    }
}

fn boolean_cell_value(sheet: &SheetData, index: usize, slots: &FormulaStore) -> Option<bool> {
    match sheet.cells.kind_at(index) {
        KIND_BOOL => Some(sheet.cells.num_at(index) != 0.0),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            (formula_error_at(sheet, key, slots).is_none()
                && sheet.cells.formula_value_kind(index) == FormulaValueKind::Bool)
                .then(|| sheet.cells.num_at(index) != 0.0)
        }
        _ => None,
    }
}

fn resolved_text<'a>(
    sheet: &SheetData,
    strings: &'a StringStorage,
    index: usize,
    slots: &FormulaStore,
) -> Option<&'a str> {
    if let Some(value) = boolean_cell_value(sheet, index, slots) {
        return Some(boolean_text(value));
    }
    match sheet.cells.kind_at(index) {
        KIND_STRING | KIND_FORMULA if sheet.cells.str_id_at(index) != NO_STRING => {
            string_from_pool_ref(strings, sheet.cells.str_id_at(index))
        }
        KIND_FORMULA => key_for_index(sheet, index)
            .and_then(|key| formula_error_at(sheet, key, slots))
            .map(FormulaError::sentinel),
        _ => None,
    }
}

/// Distinct-value scan result for one column: parallel kind/number/text
/// arrays, and from a counted scan the style of each value's first cell and
/// its count, whose buffers are surrendered once through the `take*` accessors.
///
/// The texts are kept end to end in one string with their UTF-16 lengths, so
/// JavaScript decodes them in one call and slices them. Decoding one string
/// per value took about 40% of the cell editor's completion read of 100,000 entries.
#[derive(Debug, Default)]
#[wasm_bindgen]
pub struct DistinctColumn {
    kinds: Vec<u8>,
    numbers: Vec<f64>,
    text: String,
    text_lengths: Vec<u32>,
    styles: Vec<u32>,
    counts: Vec<u32>,
}

impl DistinctColumn {
    /// Lists `text` after the texts already listed.
    fn push_text(&mut self, text: &str) {
        let units = if text.is_ascii() {
            text.len()
        } else {
            text.encode_utf16().count()
        };
        self.text.push_str(text);
        self.text_lengths
            .push(u32::try_from(units).unwrap_or(u32::MAX));
    }
}

#[wasm_bindgen]
impl DistinctColumn {
    /// Surrenders the per-value kind tags (number/string/boolean codes); the
    /// column keeps an empty buffer afterwards.
    #[wasm_bindgen(js_name = takeKinds)]
    pub fn take_kinds(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.kinds)
    }

    /// Surrenders the numeric values aligned with the `takeKinds` tags.
    #[wasm_bindgen(js_name = takeNumbers)]
    pub fn take_numbers(&mut self) -> Vec<f64> {
        std::mem::take(&mut self.numbers)
    }

    /// Surrenders the distinct strings aligned with the `takeKinds` tags, one
    /// string each. [`Self::take_text_joined`] with
    /// [`Self::take_text_lengths`] gives the same texts in one string.
    #[wasm_bindgen(js_name = takeTexts)]
    pub fn take_texts(&mut self) -> Vec<String> {
        let text = std::mem::take(&mut self.text);
        let lengths = std::mem::take(&mut self.text_lengths);
        let mut chars = text.chars();
        lengths
            .iter()
            .map(|&units| {
                let mut piece = String::new();
                let mut left = units as usize;
                while left > 0 {
                    let Some(next) = chars.next() else { break };
                    left = left.saturating_sub(next.len_utf16());
                    piece.push(next);
                }
                piece
            })
            .collect()
    }

    /// Surrenders the distinct strings aligned with the `takeKinds` tags, end
    /// to end in one string; [`Self::take_text_lengths`] splits it.
    #[wasm_bindgen(js_name = takeTextJoined)]
    pub fn take_text_joined(&mut self) -> String {
        std::mem::take(&mut self.text)
    }

    /// Surrenders the length of each string in [`Self::take_text_joined`], in
    /// UTF-16 code units, as JavaScript's `String.prototype.slice` counts them.
    #[wasm_bindgen(js_name = takeTextLengths)]
    pub fn take_text_lengths(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.text_lengths)
    }

    /// Surrenders the style id of each value's first cell, one per kind tag,
    /// which gives the number format the value shows with. Empty unless the
    /// scan was counted.
    #[wasm_bindgen(js_name = takeStyles)]
    pub fn take_styles(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.styles)
    }

    /// Surrenders how many of the scanned rows hold each value, one per kind
    /// tag. Empty unless the scan was counted.
    #[wasm_bindgen(js_name = takeCounts)]
    pub fn take_counts(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.counts)
    }
}

pub(crate) fn numeric_cell_value(
    sheet: &SheetData,
    index: usize,
    slots: &FormulaStore,
) -> Option<f64> {
    match sheet.cells.kind_at(index) {
        KIND_NUMBER => Some(sheet.cells.num_at(index)),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            if formula_error_at(sheet, key, slots).is_none()
                && sheet.cells.formula_value_kind(index) == FormulaValueKind::Number
            {
                Some(sheet.cells.num_at(index))
            } else {
                None
            }
        }
        _ => None,
    }
}

pub(crate) fn key_for_index(sheet: &SheetData, index: usize) -> Option<CellKey> {
    if sheet.cells.row_count() == 0 {
        return None;
    }
    let row = index % sheet.cells.row_count();
    let col = index / sheet.cells.row_count();
    cell_key(row, col)
}

/// Substring/whole-cell match. `needle` is already lowercased by callers when
/// `case_insensitive`.
///
/// The case-insensitive path is allocation-free for ASCII haystacks — the
/// overwhelmingly common case for sheet text and formatted numbers — folding
/// case byte-by-byte in place. It falls back to a heap `to_lowercase` only for
/// non-ASCII Unicode, where the lowercase mapping can change length and a byte
/// comparison would be unsound.
pub(crate) fn matches_needle(
    hay: &str,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
) -> bool {
    if !case_insensitive {
        return if whole_cell {
            hay == needle
        } else {
            hay.contains(needle)
        };
    }

    if hay.is_ascii() && needle.is_ascii() {
        let hay_bytes = hay.as_bytes();
        let needle_bytes = needle.as_bytes();
        return if whole_cell {
            hay_bytes.eq_ignore_ascii_case(needle_bytes)
        } else {
            ascii_contains_ignore_case(hay_bytes, needle_bytes)
        };
    }

    let lower = hay.to_lowercase();
    if whole_cell {
        lower == needle
    } else {
        lower.contains(needle)
    }
}

/// Case-insensitive ASCII substring test that never allocates. Anchors on the
/// first needle byte so most positions are rejected with a single comparison.
pub(crate) fn ascii_contains_ignore_case(hay: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
        return true;
    }
    if needle.len() > hay.len() {
        return false;
    }

    let first = needle[0].to_ascii_lowercase();
    let last_start = hay.len() - needle.len();
    (0..=last_start).any(|i| {
        hay[i].to_ascii_lowercase() == first
            && hay[i..i + needle.len()].eq_ignore_ascii_case(needle)
    })
}

/// Match a numeric cell's textual form against `needle`. The text is the
/// one `f64::to_string` gives, written on the stack so a cell does not
/// allocate.
pub(crate) fn number_matches_text(
    value: f64,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
) -> bool {
    // A finite number's text has only digits, `-` and `.`, none of which
    // has a case: a needle with any other character cannot match it, so the
    // number is not written out.
    if value.is_finite() && !needle.bytes().all(is_number_text_byte) {
        return false;
    }

    matches_needle(
        NumberText::of(value).as_str(),
        needle,
        case_insensitive,
        whole_cell,
    )
}

const fn is_number_text_byte(byte: u8) -> bool {
    byte.is_ascii_digit() || byte == b'-' || byte == b'.'
}

/// Number of direct-mapped slots in [`MatchCache`]. A power of two so the slot
/// index is a mask; sized to stay L1-resident while covering common categorical columns.
pub(crate) const MATCH_CACHE_SLOTS: usize = 1024;

/// Direct-mapped cache of string-pool match results for one scan.
///
/// Cells are dictionary-encoded (`str_id` into a shared pool), so a
/// low-cardinality column can reuse matches for cached distinct values.
/// The table is fixed-size and L1-resident: high-cardinality columns simply
/// keep missing and fall through to a direct match, paying only a tag check,
/// so it never allocates per scan or builds an O(pool) table.
pub(crate) struct MatchCache {
    tag: [u32; MATCH_CACHE_SLOTS],
    hit: [bool; MATCH_CACHE_SLOTS],
}

impl MatchCache {
    pub(crate) const fn new() -> Self {
        // `NO_STRING` (u32::MAX) is the empty sentinel: a real pool id never
        // reaches it, so an untouched slot never spuriously reports a hit.
        Self {
            tag: [NO_STRING; MATCH_CACHE_SLOTS],
            hit: [false; MATCH_CACHE_SLOTS],
        }
    }

    /// Match the interned string `id`, reusing a cached result when the slot
    /// still holds this id. `needle`/flags are constant for a given scan.
    /// Inlined so a scan pays only the tag check for a cached id; the text
    /// match stays out of line.
    #[inline]
    pub(crate) fn matches(
        &mut self,
        strings: &StringStorage,
        id: u32,
        needle: &str,
        case_insensitive: bool,
        whole_cell: bool,
    ) -> bool {
        let slot = (id as usize) & (MATCH_CACHE_SLOTS - 1);
        if self.tag[slot] == id {
            return self.hit[slot];
        }
        let matched = pool_text_matches(strings, id, needle, case_insensitive, whole_cell);
        self.tag[slot] = id;
        self.hit[slot] = matched;
        matched
    }
}

/// Whether the pool text `id` matches `needle`, as [`matches_needle`] decides.
#[inline(never)]
fn pool_text_matches(
    strings: &StringStorage,
    id: u32,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
) -> bool {
    string_from_pool_ref(strings, id)
        .is_some_and(|text| matches_needle(text, needle, case_insensitive, whole_cell))
}

/// What a Find query compares: plain text, or an Excel wildcard pattern.
enum FindText {
    /// Text without wildcards, lowercased when the search ignores case.
    Plain(String),
    /// A pattern with `*`, `?` or a `~` escape. A search within cell text
    /// has extended it with `*` at both ends.
    Pattern(Wildcard),
}

/// A Find query, parsed once per scan.
struct FindQuery {
    text: FindText,
    case_insensitive: bool,
    whole_cell: bool,
}

impl FindQuery {
    /// `None` for an empty query, or a pattern that cannot be allocated.
    fn new(query: &str, case_insensitive: bool, whole_cell: bool) -> Option<Self> {
        if query.is_empty() {
            return None;
        }
        let pattern = Wildcard::parse(query).ok()?;
        let text = if !pattern.has_wildcards() {
            FindText::Plain(if case_insensitive {
                query.to_lowercase()
            } else {
                query.to_owned()
            })
        } else if whole_cell {
            FindText::Pattern(pattern)
        } else {
            FindText::Pattern(pattern.within_text()?)
        };
        Some(Self {
            text,
            case_insensitive,
            whole_cell,
        })
    }

    fn matches_text(&self, text: &str) -> bool {
        match &self.text {
            FindText::Plain(needle) => {
                matches_needle(text, needle, self.case_insensitive, self.whole_cell)
            }
            FindText::Pattern(pattern) => pattern.matches_with_case(text, !self.case_insensitive),
        }
    }

    /// Whether the cell at `index` matches: by its formula text when
    /// `formulas` is set and it holds a formula, otherwise by its value.
    fn cell_matches(
        &self,
        sheet: &SheetData,
        store: &CellStore,
        index: usize,
        formulas: bool,
        cache: &mut MatchCache,
    ) -> bool {
        if formulas {
            if let Some(matched) =
                with_formula_source(sheet, store, index, |source| self.matches_text(source))
            {
                return matched;
            }
        }
        match &self.text {
            FindText::Plain(needle) => cell_matches_text(
                sheet,
                store,
                index,
                needle,
                self.case_insensitive,
                self.whole_cell,
                cache,
            ),
            FindText::Pattern(_) => {
                with_value_text(sheet, store, index, |text| self.matches_text(text))
                    .unwrap_or_default()
            }
        }
    }
}

/// Calls `visit` with the formula text of the cell at `index`, or returns
/// `None` when the cell holds no formula (a value, a reference or a spill).
fn with_formula_source<R>(
    sheet: &SheetData,
    store: &CellStore,
    index: usize,
    visit: impl FnOnce(&str) -> R,
) -> Option<R> {
    if sheet.cells.kind_at(index) != KIND_FORMULA {
        return None;
    }
    let key = key_for_index(sheet, index)?;
    let entry = sheet.formulas.get(key, &store.formula_slots)?;
    entry
        .is_formula()
        .then(|| visit(&entry.source(&store.written_names())))
}

/// Calls `visit` with the text a value search compares for the cell at
/// `index`, the same text [`cell_matches_text`] reads, or returns `None`
/// when the cell is empty.
fn with_value_text<R>(
    sheet: &SheetData,
    store: &CellStore,
    index: usize,
    visit: impl FnOnce(&str) -> R,
) -> Option<R> {
    let slots = &store.formula_slots;
    if let Some(value) = boolean_cell_value(sheet, index, slots) {
        return Some(visit(boolean_text(value)));
    }
    match sheet.cells.kind_at(index) {
        KIND_NUMBER => Some(visit(NumberText::of(sheet.cells.num_at(index)).as_str())),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            if let Some(error) = formula_error_at(sheet, key, slots) {
                Some(visit(error.sentinel()))
            } else if sheet.cells.str_id_at(index) != NO_STRING {
                string_from_pool_ref(&store.strings, sheet.cells.str_id_at(index)).map(visit)
            } else {
                Some(visit(NumberText::of(sheet.cells.num_at(index)).as_str()))
            }
        }
        KIND_STRING => {
            string_from_pool_ref(&store.strings, sheet.cells.str_id_at(index)).map(visit)
        }
        _ => None,
    }
}

pub(crate) fn cell_matches_text(
    sheet: &SheetData,
    store: &CellStore,
    index: usize,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
    cache: &mut MatchCache,
) -> bool {
    let strings = &store.strings;
    let slots = &store.formula_slots;
    if let Some(value) = boolean_cell_value(sheet, index, slots) {
        return matches_needle(boolean_text(value), needle, case_insensitive, whole_cell);
    }
    match sheet.cells.kind_at(index) {
        KIND_NUMBER => number_matches_text(
            sheet.cells.num_at(index),
            needle,
            case_insensitive,
            whole_cell,
        ),
        KIND_FORMULA => {
            let Some(key) = key_for_index(sheet, index) else {
                return false;
            };
            if let Some(error) = formula_error_at(sheet, key, slots) {
                matches_needle(error.sentinel(), needle, case_insensitive, whole_cell)
            } else if sheet.cells.str_id_at(index) != NO_STRING {
                cache.matches(
                    strings,
                    sheet.cells.str_id_at(index),
                    needle,
                    case_insensitive,
                    whole_cell,
                )
            } else {
                number_matches_text(
                    sheet.cells.num_at(index),
                    needle,
                    case_insensitive,
                    whole_cell,
                )
            }
        }
        KIND_STRING => cache.matches(
            strings,
            sheet.cells.str_id_at(index),
            needle,
            case_insensitive,
            whole_cell,
        ),
        _ => false,
    }
}

const MIN_RADIX_SORT_ROWS: usize = 4096;

type NumericSortPair = (u64, u32);

#[inline]
fn source_number_in_run(run: &CellRun<'_>, index: usize, paged: bool) -> Option<f64> {
    let source = run.source(index);
    let (kind, payload) = if paged && source.0 == KIND_EMPTY {
        run.resolved(index)
    } else {
        source
    };
    (kind == KIND_NUMBER).then(|| f64::from_bits(payload))
}

fn sort_finite_number_column_comparison(
    sheet: &SheetData,
    base: usize,
    ascending: bool,
) -> Option<Vec<u32>> {
    // Each row's key holds its value's order above the row, so the sort reads
    // no cells and equal values keep their row order in both directions.
    let mut packed: Vec<u128> = Vec::with_capacity(sheet.cells.row_count());
    let end = base + sheet.cells.row_count();
    let mut start = base;
    while start < end {
        let run = sheet.cells.run(start, end);
        for index in run.start..run.end {
            let value = source_number_in_run(&run, index, sheet.cells.is_paged())?;
            let key = finite_number_sort_key(value)?;
            let directed = if ascending { key } else { !key };
            packed.push(u128::from(directed) << 32 | (index - base) as u128);
        }
        start = run.end;
    }
    sort_u128(&mut packed);
    Some(packed.into_iter().map(key_index).collect())
}

fn sort_finite_number_column_radix(
    sheet: &SheetData,
    col: usize,
    ascending: bool,
) -> Option<Vec<u32>> {
    let mut pairs = Vec::with_capacity(sheet.cells.row_count());
    let direction = |key: u64| if ascending { key } else { !key };

    // A dense column gathers keys from its slices; only literal numbers sort
    // here, so a formula or any other source ends the numeric path early.
    if let Some(column) = sheet.cells.dense_column(col) {
        for (row, (kind, payload)) in column.sources().enumerate() {
            if kind != KIND_NUMBER {
                return None;
            }
            pairs.push((
                direction(finite_number_sort_key(f64::from_bits(payload))?),
                row as u32,
            ));
        }
    } else {
        // Only paged storage has no dense column, and a paged blank source
        // resolves through the run's overlays before it counts as blank.
        let paged = sheet.cells.is_paged();
        let base = col * sheet.cells.row_count();
        let end = base + sheet.cells.row_count();
        let mut start = base;
        while start < end {
            let run = sheet.cells.run(start, end);
            for index in run.start..run.end {
                let value = source_number_in_run(&run, index, paged)?;
                let key = finite_number_sort_key(value)?;
                pairs.push((direction(key), (index - base) as u32));
            }
            start = run.end;
        }
    }

    radix_sort_numeric_pairs(&mut pairs);
    Some(pairs.into_iter().map(|(_, row)| row).collect())
}

fn finite_number_sort_key(value: f64) -> Option<u64> {
    value.is_finite().then(|| number_order_bits(value))
}

/// Bits whose unsigned order is the order of `value`s, with -0 equal to 0.
fn number_order_bits(value: f64) -> u64 {
    const SIGN: u64 = 1 << 63;
    let normalized = if value == 0.0 { 0.0 } else { value };
    let bits = normalized.to_bits();
    if bits & SIGN == 0 {
        bits ^ SIGN
    } else {
        !bits
    }
}

fn radix_sort_numeric_pairs(pairs: &mut [NumericSortPair]) {
    const BUCKETS: usize = 256;
    const PASSES: usize = 8;
    let n = pairs.len();
    if n <= 1 {
        return;
    }

    // One read pass builds all eight histograms, so skippable passes are known
    // up front and keys are scanned once instead of once per pass.
    let mut counts = [[0usize; BUCKETS]; PASSES];
    for &(key, _) in pairs.iter() {
        for (pass, histogram) in counts.iter_mut().enumerate() {
            histogram[((key >> (pass * 8)) & 0xff) as usize] += 1;
        }
    }

    let mut scratch = vec![(0, 0); n];
    let mut src_is_pairs = true;

    for (pass, histogram) in counts.iter().enumerate() {
        // Every key shares this byte (sheet data is rarely full-range f64:
        // money/ids/dates leave most high bytes constant) — nothing to move.
        if histogram.contains(&n) {
            continue;
        }

        let mut offsets = [0usize; BUCKETS];
        let mut running = 0usize;
        for (offset, &count) in offsets.iter_mut().zip(histogram.iter()) {
            *offset = running;
            running += count;
        }

        // Ping-pong between the two buffers instead of copying back per pass.
        let (src, dst): (&[NumericSortPair], &mut [NumericSortPair]) = if src_is_pairs {
            (&*pairs, &mut scratch)
        } else {
            (&scratch, pairs)
        };
        let shift = pass * 8;
        for &pair in src {
            let bucket = ((pair.0 >> shift) & 0xff) as usize;
            dst[offsets[bucket]] = pair;
            offsets[bucket] += 1;
        }
        src_is_pairs = !src_is_pairs;
    }

    if !src_is_pairs {
        pairs.copy_from_slice(&scratch);
    }
}

fn edge_scan(mut pos: usize, limit: usize, step: isize, occupied: impl Fn(usize) -> bool) -> usize {
    if limit == 0 || step == 0 {
        return pos.min(limit.saturating_sub(1));
    }
    let last = limit - 1;
    let next = pos as isize + step;
    if next < 0 || next as usize > last {
        return if step < 0 { 0 } else { last };
    }
    let next_index = next as usize;
    if occupied(pos) && occupied(next_index) {
        pos = next_index;
        loop {
            let ahead = pos as isize + step;
            if ahead < 0 || ahead as usize > last || !occupied(ahead as usize) {
                return pos;
            }
            pos = ahead as usize;
        }
    }
    let mut candidate = next_index as isize;
    while candidate >= 0 && candidate as usize <= last {
        if occupied(candidate as usize) {
            return candidate as usize;
        }
        candidate += step;
    }
    if step < 0 {
        0
    } else {
        last
    }
}

/// The value of a sort key cell, as Excel's sort compares it.
#[derive(Debug, Eq, PartialEq)]
pub(crate) enum ComparableCell<'a> {
    Number(OrderedNumber),
    Bool(bool),
    /// A string of the pool and its id.
    Text {
        id: u32,
        text: &'a str,
    },
    Error,
    Empty,
}

impl<'a> ComparableCell<'a> {
    pub(crate) fn from_cell(
        sheet: &'a SheetData,
        strings: &'a StringStorage,
        index: usize,
        slots: &FormulaStore,
    ) -> Self {
        match sheet.cells.kind_at(index) {
            KIND_NUMBER => ComparableCell::Number(OrderedNumber(sheet.cells.num_at(index))),
            KIND_BOOL => ComparableCell::Bool(sheet.cells.num_at(index) != 0.0),
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return ComparableCell::Empty;
                };
                if formula_error_at(sheet, key, slots).is_some() {
                    ComparableCell::Error
                } else if sheet.cells.formula_value_kind(index) == FormulaValueKind::Blank {
                    ComparableCell::Empty
                } else if sheet.cells.formula_value_kind(index) == FormulaValueKind::Bool {
                    ComparableCell::Bool(sheet.cells.num_at(index) != 0.0)
                } else if let Some(text) = Self::pool_text(strings, sheet.cells.str_id_at(index)) {
                    text
                } else {
                    ComparableCell::Number(OrderedNumber(sheet.cells.num_at(index)))
                }
            }
            KIND_STRING => Self::pool_text(strings, sheet.cells.str_id_at(index))
                .unwrap_or(ComparableCell::Empty),
            _ => ComparableCell::Empty,
        }
    }

    /// Text of pool string `id`, which keeps its id so that a sort collates
    /// each distinct string once.
    fn pool_text(strings: &'a StringStorage, id: u32) -> Option<Self> {
        string_from_pool_ref(strings, id).map(|text| Self::Text { id, text })
    }

    fn from_run(
        sheet: &'a SheetData,
        strings: &'a StringStorage,
        run: &CellRun<'_>,
        index: usize,
        slots: &FormulaStore,
    ) -> Self {
        if sheet.cells.is_paged() {
            return Self::from_cell(sheet, strings, index, slots);
        }
        let (source_kind, source_payload) = run.source(index);
        // Spill owners install calculated output in these same dense slots.
        // Read the bounded run directly; ownership needs no per-row hash probe.
        let (kind, payload) = if source_kind == KIND_EMPTY {
            run.resolved(index)
        } else {
            (source_kind, source_payload)
        };
        match kind {
            KIND_NUMBER => Self::Number(OrderedNumber(f64::from_bits(payload))),
            KIND_BOOL => Self::Bool(payload_num(payload) != 0.0),
            KIND_STRING => Self::pool_text(strings, payload_str_id(payload)).unwrap_or(Self::Empty),
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return Self::Empty;
                };
                if formula_error_at(sheet, key, slots).is_some() {
                    return Self::Error;
                }
                let (kind, payload) = run.resolved(index);
                match kind {
                    KIND_EMPTY => Self::Empty,
                    KIND_BOOL => Self::Bool(payload_num(payload) != 0.0),
                    KIND_STRING => Self::pool_text(strings, payload_str_id(payload))
                        .unwrap_or(Self::Number(OrderedNumber(payload_num(payload)))),
                    _ => Self::Number(OrderedNumber(payload_num(payload))),
                }
            }
            _ => Self::Empty,
        }
    }
}

/// Classes of sort keys, in Excel's ascending order of value types. Blank
/// cells have the highest class because they sort last in both directions.
const CLASS_NUMBER: u8 = 0;
const CLASS_TEXT: u8 = 1;
const CLASS_BOOL: u8 = 2;
const CLASS_ERROR: u8 = 3;
const CLASS_EMPTY: u8 = 4;

/// The collation key of one distinct string: its span in the arena, and
/// whether the string holds a hyphen, which decides a tie.
#[derive(Clone, Copy)]
struct CollatedText {
    start: u32,
    end: u32,
    has_hyphen: bool,
}

/// Marks a pool id whose string is not collated yet.
const NOT_COLLATED: u32 = u32::MAX;

/// Sort keys of one sort call while its rows are read. Each key is a class
/// and a 64-bit value in flat arrays. Each distinct pool string is collated
/// once into one byte arena; a flat table indexed by pool id finds the key
/// of a string seen before. A text value holds the index of its string
/// until [`Self::rank`] replaces it by the string's rank.
pub(crate) struct SortKeyBuilder {
    classes: Vec<u8>,
    values: Vec<u64>,
    texts: Vec<CollatedText>,
    text_by_pool_id: Vec<u32>,
    arena: Vec<u8>,
}

impl SortKeyBuilder {
    pub(crate) fn with_capacity(rows: usize) -> Self {
        Self {
            classes: Vec::with_capacity(rows),
            values: Vec::with_capacity(rows),
            texts: Vec::new(),
            text_by_pool_id: Vec::new(),
            arena: Vec::new(),
        }
    }

    pub(crate) fn push(&mut self, cell: ComparableCell<'_>) {
        let (class, value) = match cell {
            ComparableCell::Number(number) => (CLASS_NUMBER, number.0.to_bits()),
            ComparableCell::Text { id, text } => (CLASS_TEXT, u64::from(self.collate(id, text))),
            ComparableCell::Bool(value) => (CLASS_BOOL, u64::from(value)),
            ComparableCell::Error => (CLASS_ERROR, 0),
            ComparableCell::Empty => (CLASS_EMPTY, 0),
        };

        self.classes.push(class);
        self.values.push(value);
    }

    /// The index of the collation key of pool string `id`, collated on its
    /// first use.
    fn collate(&mut self, id: u32, text: &str) -> u32 {
        let slot = id as usize;
        if slot >= self.text_by_pool_id.len() {
            self.text_by_pool_id.resize(slot + 1, NOT_COLLATED);
        }

        let known = self.text_by_pool_id[slot];
        if known != NOT_COLLATED {
            return known;
        }

        let start = self.arena.len() as u32;
        let has_hyphen = push_collation_key(text, &mut self.arena);
        let index = self.texts.len() as u32;
        self.texts.push(CollatedText {
            start,
            end: self.arena.len() as u32,
            has_hyphen,
        });
        self.text_by_pool_id[slot] = index;
        index
    }

    /// Sort the distinct strings once and give each its rank in collation
    /// order; equal keys get equal ranks. Rows then compare text by rank, so
    /// the row sort makes no byte comparison. The arena is dropped here.
    pub(crate) fn rank(mut self) -> SortKeys {
        let mut order: Vec<u32> = (0..self.texts.len() as u32).collect();
        sort_indices_by(&mut order, &mut |a, b| self.collation_cmp(a, b));

        let mut ranks = vec![0u32; self.texts.len()];
        let mut rank = 0u32;
        for (position, &text) in order.iter().enumerate() {
            if position > 0 && self.collation_cmp(order[position - 1], text) != Ordering::Equal {
                rank += 1;
            }
            ranks[text as usize] = rank;
        }

        for (class, value) in self.classes.iter().zip(self.values.iter_mut()) {
            if *class == CLASS_TEXT {
                *value = u64::from(ranks[*value as usize]);
            }
        }

        SortKeys {
            classes: self.classes,
            values: self.values,
        }
    }

    fn collation_cmp(&self, a: u32, b: u32) -> Ordering {
        let a_text = self.texts[a as usize];
        let b_text = self.texts[b as usize];
        let a_key = &self.arena[a_text.start as usize..a_text.end as usize];
        let b_key = &self.arena[b_text.start as usize..b_text.end as usize];
        a_key
            .cmp(b_key)
            .then(a_text.has_hyphen.cmp(&b_text.has_hyphen))
    }
}

/// Ranked sort keys of one sort call: a class and a value per key. A number
/// value holds its `f64` bits, text its collation rank, and a logical value
/// 0 or 1.
pub(crate) struct SortKeys {
    classes: Vec<u8>,
    values: Vec<u64>,
}

impl SortKeys {
    /// Key `key` as an integer whose unsigned order is [`Self::compare`]'s
    /// order, shifted left 32 bits to leave room for a tie-break: the class
    /// above a value (a number's order-preserving bits, a text rank, 0 or 1
    /// for a logical value, 0 for an error). Descending flips both, except
    /// for blank cells, which stay last. A NaN number (only `setNumber` can
    /// store one) sorts after every other number, where `compare` calls it
    /// equal to all of them.
    pub(crate) fn packed(&self, key: usize, ascending: bool) -> u128 {
        let class = self.classes[key];
        let value = match class {
            CLASS_NUMBER => number_order_bits(f64::from_bits(self.values[key])),
            CLASS_ERROR | CLASS_EMPTY => 0,
            _ => self.values[key],
        };
        let (directed_class, directed_value) = if ascending || class == CLASS_EMPTY {
            (class, value)
        } else {
            (CLASS_ERROR - class, !value)
        };
        (u128::from(directed_class) << 64 | u128::from(directed_value)) << 32
    }

    /// Whether none of `keys` is a number, so [`Self::packed_narrow`] can
    /// pack each of them: only a number's order needs all 64 bits of its
    /// value.
    fn is_narrow(&self, keys: Range<usize>) -> bool {
        self.classes
            .get(keys)
            .is_some_and(|classes| !classes.contains(&CLASS_NUMBER))
    }

    /// [`Self::packed`] in 64 bits for a key that is not a number: the class
    /// above a 32-bit value (a text rank, 0 or 1 for a logical value, 0 for
    /// an error or a blank cell), shifted left [`NARROW_SLOT_BITS`] to leave
    /// room for the tie-break. Its unsigned order is that of [`Self::packed`].
    fn packed_narrow(&self, key: usize, ascending: bool) -> u64 {
        let class = self.classes[key];
        // A text rank counts the distinct strings of one sort call, so it fits.
        let value = match class {
            CLASS_ERROR | CLASS_EMPTY => 0,
            _ => self.values[key] as u32,
        };
        let (directed_class, directed_value) = if ascending || class == CLASS_EMPTY {
            (class, value)
        } else {
            (CLASS_ERROR - class, !value)
        };
        (u64::from(directed_class) << 32 | u64::from(directed_value)) << NARROW_SLOT_BITS
    }

    /// Excel's sort order of keys `left` and `right`: numbers, text, `FALSE`
    /// before `TRUE`, then errors, which are all equal. A descending sort
    /// reverses this order, but blank cells are last in both directions.
    /// The sorts use [`Self::packed`]; tests check it against this.
    #[cfg(test)]
    pub(crate) fn compare(&self, left: usize, right: usize, ascending: bool) -> Ordering {
        let class_left = self.classes[left];
        let class_right = self.classes[right];
        if class_left == CLASS_EMPTY || class_right == CLASS_EMPTY {
            return class_left.cmp(&class_right);
        }

        let order = if class_left != class_right {
            class_left.cmp(&class_right)
        } else if class_left == CLASS_NUMBER {
            let a = f64::from_bits(self.values[left]);
            let b = f64::from_bits(self.values[right]);
            a.partial_cmp(&b).unwrap_or(Ordering::Equal)
        } else {
            self.values[left].cmp(&self.values[right])
        };

        if ascending {
            order
        } else {
            order.reverse()
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct OrderedNumber(f64);

impl Eq for OrderedNumber {}

impl Ord for OrderedNumber {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(Ordering::Equal)
    }
}

impl PartialOrd for OrderedNumber {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod packed_order_tests {
    use super::*;

    const ROWS: usize = 600;
    const COLUMNS: usize = 3;
    const CASES: usize = 40;
    const TEXTS: [&str; 9] = ["a", "A", "b", "co-op", "coop", "Co-op", "", "ß", "item-2"];
    const NUMBERS: [f64; 8] = [0.0, -0.0, 1.5, -1.5, 1e300, -1e-300, 2.0, 1.5];
    const FORMULAS: [&str; 4] = ["=1/0", "=NA()", "=-0", "=\"A\""];
    const KINDS: usize = 6;
    const SEED: u64 = 0x5eed;
    const LCG_MULTIPLIER: u64 = 6_364_136_223_846_793_005;

    struct Random(u64);

    impl Random {
        fn below(&mut self, bound: usize) -> usize {
            self.0 = self.0.wrapping_mul(LCG_MULTIPLIER).wrapping_add(1);
            ((self.0 >> 33) as usize) % bound
        }
    }

    /// Numbers, text, logical values, formula results (errors among them)
    /// and blanks, from few distinct values, so many rows tie on a key.
    fn mixed_store(random: &mut Random) -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(COLUMNS, ROWS);
        for col in 0..COLUMNS {
            for row in 0..ROWS {
                match random.below(KINDS) {
                    0 | 1 => {
                        let number = NUMBERS[random.below(NUMBERS.len())];
                        store.set_number(sheet, row, col, number, 0);
                    }
                    2 => store.set_string(sheet, row, col, TEXTS[random.below(TEXTS.len())], 0),
                    3 => store.set_bool(sheet, row, col, random.below(2) == 0, 0),
                    4 => {
                        let formula = FORMULAS[random.below(FORMULAS.len())];
                        store.set_formula(sheet, row, col, formula, 0);
                    }
                    _ => {}
                }
            }
        }
        store.recompute(sheet);
        (store, sheet)
    }

    /// A stable sort by [`SortKeys::compare`], key by key, then by row: the
    /// order the row sorts gave before they packed their keys.
    fn compared_order(
        store: &CellStore,
        sheet: usize,
        cols: &[u32],
        ascending: &[u8],
        rows: &[u32],
    ) -> Vec<u32> {
        let ranked = store.ranked_row_keys(&store.sheets[sheet], cols, rows);
        let mut positions: Vec<usize> = (0..rows.len()).collect();
        positions.sort_by(|&left, &right| {
            (0..cols.len())
                .map(|key| {
                    ranked.compare(
                        key * rows.len() + left,
                        key * rows.len() + right,
                        ascending[key] != 0,
                    )
                })
                .find(|order| order.is_ne())
                .unwrap_or_else(|| rows[left].cmp(&rows[right]))
        });
        positions
            .into_iter()
            .map(|position| rows[position])
            .collect()
    }

    #[test]
    fn packed_keys_sort_rows_in_the_compared_order() {
        let mut random = Random(SEED);
        for _ in 0..CASES {
            let (store, sheet) = mixed_store(&mut random);
            let key_count = 1 + random.below(COLUMNS);
            let cols: Vec<u32> = (0..key_count)
                .map(|_| random.below(COLUMNS) as u32)
                .collect();
            let ascending: Vec<u8> = (0..key_count).map(|_| random.below(2) as u8).collect();
            let all_rows: Vec<u32> = (0..ROWS as u32).collect();
            let mut candidates: Vec<u32> = all_rows
                .iter()
                .copied()
                .filter(|_| random.below(3) > 0)
                .collect();
            for index in (1..candidates.len()).rev() {
                candidates.swap(index, random.below(index + 1));
            }

            assert_eq!(
                store.sort_rows_multi(sheet, &cols, &ascending, &candidates),
                compared_order(&store, sheet, &cols, &ascending, &candidates),
                "keys {cols:?}, ascending {ascending:?}, shuffled candidates"
            );
            assert_eq!(
                store.sort_rows_multi(sheet, &cols, &ascending, &[]),
                compared_order(&store, sheet, &cols, &ascending, &all_rows),
                "keys {cols:?}, ascending {ascending:?}, all rows"
            );
            assert_eq!(
                store.sort_rows(sheet, cols[0] as usize, ascending[0] != 0),
                compared_order(&store, sheet, &cols[..1], &ascending[..1], &all_rows),
                "one key {}, ascending {}",
                cols[0],
                ascending[0]
            );
        }
    }

    #[test]
    fn a_stored_nan_sorts_after_every_other_number() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, 4);
        for (row, value) in [f64::NAN, f64::INFINITY, 1.0, f64::NEG_INFINITY]
            .into_iter()
            .enumerate()
        {
            store.set_number(sheet, row, 0, value, 0);
        }
        store.set_string(sheet, 3, 0, "text", 0);
        assert_eq!(store.sort_rows(sheet, 0, true), vec![2, 1, 0, 3]);
        assert_eq!(store.sort_rows(sheet, 0, false), vec![3, 0, 1, 2]);
    }

    #[test]
    fn number_columns_sort_by_value_then_row_in_both_directions() {
        // Below the radix threshold, so the comparison path sorts.
        let values = [2.0, -0.0, 0.0, -3.5, 2.0, 1e-300];
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, values.len());
        for (row, &value) in values.iter().enumerate() {
            store.set_number(sheet, row, 0, value, 0);
        }
        assert_eq!(store.sort_rows(sheet, 0, true), vec![3, 1, 2, 5, 0, 4]);
        assert_eq!(store.sort_rows(sheet, 0, false), vec![0, 4, 5, 1, 2, 3]);
    }
}
