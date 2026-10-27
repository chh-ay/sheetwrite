//! Whole-column queries: sort, filter, search, aggregate — cache-local scans.

use std::cell::Cell;
use std::cmp::Ordering;
use std::collections::HashSet;

use wasm_bindgen::prelude::*;

use crate::cells::{payload_is_str, payload_num, payload_str_id, source_kind, CellRun};
use crate::sheet::{formula_error_at, SheetData};
use crate::store::CellStore;
use crate::types::{
    cell_key, string_from_pool_ref, CellKey, FormulaError, FormulaValueKind, StringStorage,
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

/// One bit per string-pool id, so text that is already dictionary-encoded
/// dedupes without hashing or comparing a single character.
///
/// Words are zero-filled when the marks grow. Growth doubles the current word
/// count (with an initial floor) or reaches the requested id, whichever is larger.
struct PoolIdStamps {
    words: Vec<u64>,
}

impl PoolIdStamps {
    fn new() -> Self {
        Self { words: Vec::new() }
    }

    fn insert(&mut self, id: u32) -> bool {
        let index = id as usize;
        let word = index / STAMP_WORD_BITS;

        if word >= self.words.len() {
            let doubled = self.words.len().max(STAMP_WORDS_INITIAL) * 2;
            self.words.resize(doubled.max(word + 1), 0);
        }

        let mask = 1u64 << (index % STAMP_WORD_BITS);
        let fresh = self.words[word] & mask == 0;
        self.words[word] |= mask;

        fresh
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
/// `Linear` keeps the scan for lists short enough that a lookup costs more than it saves.
enum ValueSet<'a> {
    Linear,
    Lookup {
        /// Picked numbers as bit patterns, sorted for binary search. `-0.0` is
        /// stored as `0.0` and NaN picks are dropped — exactly the values `f64`
        /// equality can match.
        numbers: Vec<u64>,
        texts: HashSet<&'a str>,
        /// Picked booleans, as the two bits above.
        bools: u8,
    },
}

impl<'a> ValueSet<'a> {
    fn build(picked_numbers: &[f64], picked_texts: &'a [String]) -> Self {
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

        let mut texts = HashSet::with_capacity(picked_texts.len());
        let mut bools = 0u8;

        for picked in picked_texts {
            match picked.as_str() {
                VALUE_SET_TRUE => bools |= VALUE_SET_TRUE_BIT,
                VALUE_SET_FALSE => bools |= VALUE_SET_FALSE_BIT,
                _ => {}
            }

            texts.insert(picked.as_str());
        }

        ValueSet::Lookup {
            numbers,
            texts,
            bools,
        }
    }
}

/// The `aggregate` op code for SUM; every other op also needs count and extrema.
const AGGREGATE_SUM: u8 = 0;

/// Running column aggregate. A sum skips the count and extrema updates.
struct NumericAccumulator {
    sum: f64,
    count: u32,
    min: f64,
    max: f64,
}

impl NumericAccumulator {
    fn new() -> Self {
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
    #[wasm_bindgen(js_name = queryResourceStats)]
    pub fn query_resource_stats(&self) -> Vec<f64> {
        QUERY_STATS.with(|stats| stats.get().into_iter().map(|value| value as f64).collect())
    }

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
        // are not numbers, which made this scan 2.6-6x slower than 0.5.0.
        if let Some(column) = s.cells.dense_column(col) {
            let (kinds, payloads) = column.raw_slices();
            for (row, &raw) in kinds.iter().enumerate() {
                // The kind byte decides first, so text, booleans and blanks
                // never load their payload.
                let value = match source_kind(raw) {
                    KIND_NUMBER => Some(f64::from_bits(payloads[row])),
                    KIND_FORMULA => {
                        let (_, payload, _) = column.cell(row);
                        (!payload_is_str(payload)
                            && key_for_index(s, base + row)
                                .is_some_and(|key| formula_error_at(s, key).is_none()))
                        .then(|| payload_num(payload))
                    }
                    _ => None,
                };
                if let Some(value) = value {
                    acc.add(value, op);
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
                    if let Some(value) = numeric_cell_value(s, index) {
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
            0 => sum,
            1 => {
                if count > 0 {
                    sum / f64::from(count)
                } else {
                    0.0
                }
            }
            2 => {
                if count > 0 {
                    min
                } else {
                    0.0
                }
            }
            3 => {
                if count > 0 {
                    max
                } else {
                    0.0
                }
            }
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
        let needle = needle.to_lowercase();
        let mut out: Vec<u32> = Vec::with_capacity(s.cells.row_count().min(1024));
        let mut cache = MatchCache::new();

        // Dense columns read their slices directly; see `aggregate`.
        if let Some(column) = s.cells.dense_column(col) {
            let (kinds, payloads) = column.raw_slices();
            for (row, &raw) in kinds.iter().enumerate() {
                // Literals never carry the calculated bit, so the raw byte
                // classifies them; a bare empty byte has no calculated value.
                let matched = match raw {
                    KIND_STRING => cache.matches(
                        &self.strings,
                        payload_str_id(payloads[row]),
                        &needle,
                        true,
                        false,
                    ),
                    KIND_EMPTY => false,
                    _ => cell_matches_text(
                        s,
                        &self.strings,
                        base + row,
                        &needle,
                        true,
                        false,
                        &mut cache,
                    ),
                };
                if matched {
                    out.push(row as u32);
                }
            }
            return out;
        }

        let mut start = base;
        let end = base + s.cells.row_count();
        while start < end {
            let run = s.cells.run(start, end);
            for index in run.start..run.end {
                let (kind, payload) = run.source(index);
                let matched = if kind == KIND_STRING {
                    cache.matches(&self.strings, payload_str_id(payload), &needle, true, false)
                } else if kind == KIND_EMPTY && run.resolved(index).0 == KIND_EMPTY {
                    false
                } else {
                    cell_matches_text(s, &self.strings, index, &needle, true, false, &mut cache)
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
        let next = next as usize;

        if occupied(pos) && occupied(next) {
            let mut p = next;
            loop {
                let ahead = p as isize + step;
                if ahead < 0 || ahead as usize > last || !occupied(ahead as usize) {
                    return p as u32;
                }
                p = ahead as usize;
            }
        }

        let mut p = next as isize;
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

    /// Cell coordinates whose text matches `query`, as a flat `[row, col, ...]`
    /// list. Scans the requested columns column-major (cache-local), then sorts
    /// row-major so search navigation runs top-to-bottom, left-to-right.
    #[wasm_bindgen(js_name = search)]
    pub fn search(
        &self,
        sheet: usize,
        cols: &[u32],
        query: &str,
        case_insensitive: bool,
        whole_cell: bool,
    ) -> Vec<u32> {
        let needle = if case_insensitive {
            query.to_lowercase()
        } else {
            query.to_string()
        };
        if needle.is_empty() {
            return Vec::new();
        }

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
                let i = base + row;
                if cell_matches_text(
                    s,
                    &self.strings,
                    i,
                    &needle,
                    case_insensitive,
                    whole_cell,
                    &mut cache,
                ) {
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
            sort_finite_number_column_radix(s, base, ascending)
        } else {
            sort_finite_number_column_comparison(s, base, ascending)
        } {
            return order;
        }

        // Decorate-sort-undecorate: materialize each row's comparison key ONCE
        // (one pool deref per row) instead of rebuilding both operands inside
        // the comparator — a comparison sort would otherwise reconstruct keys
        // ~2·n·log2(n) times, each a scattered heap deref for text cells.
        let mut keys: Vec<ComparableCell> = Vec::with_capacity(s.cells.row_count());
        let mut start = base;
        let end = base + s.cells.row_count();
        while start < end {
            let run = s.cells.run(start, end);
            for index in run.start..run.end {
                keys.push(ComparableCell::from_run(s, &self.strings, &run, index));
            }
            start = run.end;
        }

        let mut order: Vec<u32> = (0..s.cells.row_count() as u32).collect();
        order.sort_unstable_by(|&a, &b| {
            // SAFETY: `order` holds only rows from `0..row_count` and `keys`
            // has exactly `row_count` entries.
            let ka = unsafe { keys.get_unchecked(a as usize) };
            // SAFETY: as above.
            let kb = unsafe { keys.get_unchecked(b as usize) };
            let ord = ka.cmp(kb);
            let ord = if ascending { ord } else { ord.reverse() };
            if ord == Ordering::Equal {
                a.cmp(&b)
            } else {
                ord
            }
        });
        order
    }
}

#[wasm_bindgen]
impl CellStore {
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
        let row_count = rows.len();
        // Decorate-sort-undecorate per key, the same way the one-key path does:
        // a comparison sort that rebuilt both operands would reconstruct each
        // key ~2·n·log2(n) times, and a text key costs a scattered pool deref
        // every time. Keys are stored key-major so the first key — the one that
        // decides nearly every comparison — stays contiguous.
        let mut keys: Vec<ComparableCell<'_>> = Vec::with_capacity(row_count * cols.len());
        for &col in cols {
            let base = col as usize * data.cells.row_count();
            let mut cached_run: Option<CellRun<'_>> = None;
            for &row in &rows {
                let index = base + row as usize;
                let run = cached_run
                    .get_or_insert_with(|| data.cells.run(index, base + data.cells.row_count()));
                if index < run.start || index >= run.end {
                    *run = data.cells.run(index, base + data.cells.row_count());
                }
                keys.push(ComparableCell::from_run(data, &self.strings, run, index));
            }
        }
        let mut positions: Vec<u32> = (0..row_count as u32).collect();
        // NaN keys compare equal to other numeric keys; a stable sort preserves ties.
        positions.sort_by(|&left, &right| {
            for key in 0..cols.len() {
                let a = &keys[key * row_count + left as usize];
                let b = &keys[key * row_count + right as usize];
                let order = if ascending.get(key).copied().unwrap_or(1) != 0 {
                    a.cmp(b)
                } else {
                    b.cmp(a)
                };
                if order != Ordering::Equal {
                    return order;
                }
            }
            rows[left as usize].cmp(&rows[right as usize])
        });
        positions
            .into_iter()
            .map(|position| rows[position as usize])
            .collect()
    }

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
        let mut num_offsets = Vec::with_capacity(cols.len());
        let mut text_offsets = Vec::with_capacity(cols.len());
        let (mut no, mut to) = (0usize, 0usize);
        for i in 0..cols.len() {
            num_offsets.push(no);
            text_offsets.push(to);
            no = no.saturating_add(num_counts.get(i).copied().unwrap_or(0) as usize);
            to = to.saturating_add(text_counts.get(i).copied().unwrap_or(0) as usize);
        }
        let mut cache_index = vec![usize::MAX; kinds.len()];
        let mut match_caches = Vec::with_capacity(kinds.iter().filter(|&&kind| kind == 1).count());
        for (index, &kind) in kinds.iter().enumerate() {
            if kind != 1 {
                continue;
            }
            cache_index[index] = match_caches.len();
            match_caches.push(MatchCache::new());
        }
        QUERY_STATS.with(|stats| {
            let mut current = stats.get();
            current[0] = current[0].saturating_add(match_caches.len() as u64);
            stats.set(current);
        });
        let mut value_sets: Vec<ValueSet<'_>> = Vec::with_capacity(kinds.len());
        for (i, &kind) in kinds.iter().enumerate() {
            if kind != 0 {
                value_sets.push(ValueSet::Linear);
                continue;
            }
            let num_count = num_counts.get(i).copied().unwrap_or(0) as usize;
            let text_count = text_counts.get(i).copied().unwrap_or(0) as usize;
            let picked_numbers = value_nums
                .get(num_offsets[i]..num_offsets[i] + num_count)
                .unwrap_or_default();
            let picked_texts = value_texts
                .get(text_offsets[i]..text_offsets[i] + text_count)
                .unwrap_or_default();
            value_sets.push(ValueSet::build(picked_numbers, picked_texts));
        }
        let mut out = Vec::new();
        'rows: for row in 0..data.cells.row_count() {
            for i in 0..cols.len() {
                let index = cols[i] as usize * data.cells.row_count() + row;
                let kind = resolved_kind(data, index);
                let matches = match kinds[i] {
                    0 => {
                        let mut hit = kind == 0 && flags.get(i).copied().unwrap_or(0) & 1 != 0;
                        let nc = num_counts.get(i).copied().unwrap_or(0) as usize;
                        let tc = text_counts.get(i).copied().unwrap_or(0) as usize;
                        match &value_sets[i] {
                            ValueSet::Linear => {
                                if kind == 1 {
                                    if let Some(value) = numeric_cell_value(data, index) {
                                        hit |= value_nums
                                            .get(num_offsets[i]..num_offsets[i] + nc)
                                            .unwrap_or(&[])
                                            .contains(&value);
                                    }
                                } else if kind == 2 {
                                    if let Some(text) = resolved_text(data, &self.strings, index) {
                                        hit |= value_texts
                                            .get(text_offsets[i]..text_offsets[i] + tc)
                                            .unwrap_or(&[])
                                            .iter()
                                            .any(|picked| picked == text);
                                    }
                                } else if kind == 3 {
                                    if let Some(value) = boolean_cell_value(data, index) {
                                        let expected = if value {
                                            VALUE_SET_TRUE
                                        } else {
                                            VALUE_SET_FALSE
                                        };
                                        hit |= value_texts
                                            .get(text_offsets[i]..text_offsets[i] + tc)
                                            .unwrap_or(&[])
                                            .iter()
                                            .any(|picked| picked == expected);
                                    }
                                }
                            }
                            ValueSet::Lookup {
                                numbers,
                                texts,
                                bools,
                            } => {
                                if kind == 1 {
                                    if let Some(value) = numeric_cell_value(data, index) {
                                        let normalized = if value == 0.0 { 0.0 } else { value };
                                        hit |= numbers.binary_search(&normalized.to_bits()).is_ok();
                                    }
                                } else if kind == 2 {
                                    if let Some(text) = resolved_text(data, &self.strings, index) {
                                        hit |= texts.contains(text);
                                    }
                                } else if kind == 3 {
                                    if let Some(value) = boolean_cell_value(data, index) {
                                        let picked_bit = if value {
                                            VALUE_SET_TRUE_BIT
                                        } else {
                                            VALUE_SET_FALSE_BIT
                                        };
                                        hit |= bools & picked_bit != 0;
                                    }
                                }
                            }
                        }
                        hit
                    }
                    1 => {
                        let needle = value_texts
                            .get(text_offsets[i])
                            .map(String::as_str)
                            .unwrap_or("");
                        cell_matches_text(
                            data,
                            &self.strings,
                            index,
                            needle,
                            flags.get(i).copied().unwrap_or(0) == 0,
                            false,
                            &mut match_caches[cache_index[i]],
                        )
                    }
                    2 => numeric_cell_value(data, index).is_some_and(|value| {
                        match flags.get(i).copied().unwrap_or(0) {
                            0 => value > nums.get(i).copied().unwrap_or(0.0),
                            1 => value >= nums.get(i).copied().unwrap_or(0.0),
                            2 => value < nums.get(i).copied().unwrap_or(0.0),
                            3 => value <= nums.get(i).copied().unwrap_or(0.0),
                            4 => value == nums.get(i).copied().unwrap_or(0.0),
                            _ => value != nums.get(i).copied().unwrap_or(0.0),
                        }
                    }),
                    3 => kind == 0,
                    4 => kind != 0,
                    _ => false,
                };
                if !matches {
                    continue 'rows;
                }
            }
            out.push(row as u32);
        }
        out
    }

    #[wasm_bindgen(js_name = distinctValues)]
    pub fn distinct_values(&self, sheet: usize, col: usize, limit: usize) -> DistinctColumn {
        let mut out = DistinctColumn::default();
        let Some(data) = self.sheets.get(sheet) else {
            return out;
        };
        if col >= data.cells.n_cols() {
            return out;
        }
        let text_at = |index: usize| resolved_text(data, &self.strings, index).unwrap_or("");
        // Stored text carries a pool id that stands for its value, so the scan
        // dedupes it through one bit per id instead of hashing the characters.
        // Text without an id — the sentinel a formula error reports reads back as
        // plain text — still has to meet pooled text by content, so the first
        // such cell restarts the scan on content hashing. The restart is rare and
        // keeps equal text a single entry, in first-seen order, either way.
        let mut pooled = true;
        loop {
            out = DistinctColumn::default();
            let mut stamps = PoolIdStamps::new();
            let mut seen: HashSet<DistinctKey<'_>> = HashSet::new();
            let mut needs_content = false;
            for row in 0..data.cells.row_count() {
                let index = col * data.cells.row_count() + row;
                let kind = resolved_kind(data, index);
                let fresh = match kind {
                    1 => seen.insert(DistinctKey::Number(
                        numeric_cell_value(data, index).unwrap_or(0.0).to_bits(),
                    )),
                    2 if pooled => match data.cells.str_id_at(index) {
                        NO_STRING => {
                            needs_content = true;
                            break;
                        }
                        id => stamps.insert(id),
                    },
                    2 => seen.insert(DistinctKey::Text(text_at(index))),
                    3 => seen.insert(DistinctKey::Bool(
                        boolean_cell_value(data, index).unwrap_or(false),
                    )),
                    _ => seen.insert(DistinctKey::Blank),
                };
                if !fresh {
                    continue;
                }
                out.kinds.push(kind);
                if kind == 1 {
                    out.numbers
                        .push(numeric_cell_value(data, index).unwrap_or(0.0));
                } else if kind == 3 {
                    out.numbers
                        .push(if boolean_cell_value(data, index).unwrap_or(false) {
                            1.0
                        } else {
                            0.0
                        });
                } else if kind == 2 {
                    out.texts.push(text_at(index).to_owned());
                }
                if limit != 0 && out.kinds.len() >= limit {
                    break;
                }
            }
            if !needs_content {
                break;
            }
            pooled = false;
        }
        QUERY_STATS.with(|stats| {
            let mut current = stats.get();
            current[1] = current[1].saturating_add(out.texts.len() as u64);
            stats.set(current);
        });
        out
    }

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
                let r = r as usize;
                let index = col * data.cells.row_count() + r;
                r < data.cells.row_count()
                    && match column.map(|column| column.raw_kind(r)) {
                        Some(KIND_NUMBER | KIND_STRING | KIND_BOOL) => true,
                        Some(KIND_EMPTY) => false,
                        _ => resolved_kind(data, index) != 0,
                    }
            })
        };
        edge_scan(row, order.len(), d_row.signum() as isize, occupied) as u32
    }
}

fn resolved_kind(sheet: &SheetData, index: usize) -> u8 {
    match sheet.cells.kind_at(index) {
        KIND_NUMBER => 1,
        KIND_STRING => 2,
        KIND_BOOL => 3,
        KIND_FORMULA => {
            let Some(key) = key_for_index(sheet, index) else {
                return 0;
            };
            if formula_error_at(sheet, key).is_some() {
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

fn boolean_text(value: bool) -> &'static str {
    if value {
        "TRUE"
    } else {
        "FALSE"
    }
}

fn boolean_cell_value(sheet: &SheetData, index: usize) -> Option<bool> {
    match sheet.cells.kind_at(index) {
        KIND_BOOL => Some(sheet.cells.num_at(index) != 0.0),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            (formula_error_at(sheet, key).is_none()
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
) -> Option<&'a str> {
    if let Some(value) = boolean_cell_value(sheet, index) {
        return Some(boolean_text(value));
    }
    match sheet.cells.kind_at(index) {
        KIND_STRING | KIND_FORMULA if sheet.cells.str_id_at(index) != NO_STRING => {
            string_from_pool_ref(strings, sheet.cells.str_id_at(index))
        }
        KIND_FORMULA => key_for_index(sheet, index)
            .and_then(|key| formula_error_at(sheet, key))
            .map(FormulaError::sentinel),
        _ => None,
    }
}

/// Distinct-value scan result for one column: parallel kind/number/text
/// arrays whose buffers are surrendered once through the `take*` accessors.
#[derive(Default)]
#[wasm_bindgen]
pub struct DistinctColumn {
    kinds: Vec<u8>,
    numbers: Vec<f64>,
    texts: Vec<String>,
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

    /// Surrenders the distinct strings aligned with the `takeKinds` tags.
    #[wasm_bindgen(js_name = takeTexts)]
    pub fn take_texts(&mut self) -> Vec<String> {
        std::mem::take(&mut self.texts)
    }
}

pub(crate) fn numeric_cell_value(sheet: &SheetData, index: usize) -> Option<f64> {
    match sheet.cells.kind_at(index) {
        KIND_NUMBER => Some(sheet.cells.num_at(index)),
        KIND_FORMULA => {
            let key = key_for_index(sheet, index)?;
            if formula_error_at(sheet, key).is_none()
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
        let hay = hay.as_bytes();
        let needle = needle.as_bytes();
        return if whole_cell {
            hay.eq_ignore_ascii_case(needle)
        } else {
            ascii_contains_ignore_case(hay, needle)
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

/// Match a numeric cell's textual form against `needle` without the per-cell
/// `f64::to_string` heap allocation. Formatting uses a stack buffer and falls
/// back to an owned string on overflow so results stay correct.
pub(crate) fn number_matches_text(
    value: f64,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
) -> bool {
    use std::fmt::Write as _;

    let mut buf = NumBuf::new();
    if write!(buf, "{value}").is_ok() {
        matches_needle(buf.as_str(), needle, case_insensitive, whole_cell)
    } else {
        matches_needle(&value.to_string(), needle, case_insensitive, whole_cell)
    }
}

/// Fixed stack buffer implementing [`std::fmt::Write`], used to format an `f64`
/// off the heap. Overflow reports an error so the caller can fall back to an owned string.
pub(crate) struct NumBuf {
    buf: [u8; 32],
    len: usize,
}

impl NumBuf {
    pub(crate) fn new() -> Self {
        Self {
            buf: [0; 32],
            len: 0,
        }
    }

    pub(crate) fn as_str(&self) -> &str {
        // `write_str` only appends ASCII float text, so the bytes are valid UTF-8.
        std::str::from_utf8(&self.buf[..self.len]).unwrap_or("")
    }
}

impl std::fmt::Write for NumBuf {
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        let bytes = s.as_bytes();
        let end = self.len + bytes.len();
        if end > self.buf.len() {
            return Err(std::fmt::Error);
        }
        self.buf[self.len..end].copy_from_slice(bytes);
        self.len = end;
        Ok(())
    }
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
    pub(crate) fn new() -> Self {
        // `NO_STRING` (u32::MAX) is the empty sentinel: a real pool id never
        // reaches it, so an untouched slot never spuriously reports a hit.
        Self {
            tag: [NO_STRING; MATCH_CACHE_SLOTS],
            hit: [false; MATCH_CACHE_SLOTS],
        }
    }

    /// Match the interned string `id`, reusing a cached result when the slot
    /// still holds this id. `needle`/flags are constant for a given scan.
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
        let matched = string_from_pool_ref(strings, id)
            .is_some_and(|text| matches_needle(text, needle, case_insensitive, whole_cell));
        self.tag[slot] = id;
        self.hit[slot] = matched;
        matched
    }
}

pub(crate) fn cell_matches_text(
    sheet: &SheetData,
    strings: &StringStorage,
    index: usize,
    needle: &str,
    case_insensitive: bool,
    whole_cell: bool,
    cache: &mut MatchCache,
) -> bool {
    if let Some(value) = boolean_cell_value(sheet, index) {
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
            if let Some(error) = formula_error_at(sheet, key) {
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
    let mut order = Vec::with_capacity(sheet.cells.row_count());
    let end = base + sheet.cells.row_count();
    let mut start = base;
    while start < end {
        let run = sheet.cells.run(start, end);
        for index in run.start..run.end {
            let value = source_number_in_run(&run, index, sheet.cells.is_paged())?;
            if !value.is_finite() {
                return None;
            }
            order.push((index - base) as u32);
        }
        start = run.end;
    }

    order.sort_unstable_by(|&a, &b| {
        // SAFETY: `order` holds only rows from `0..row_count`, and the scan
        // above proved every value in this column is a finite number.
        let (left, right) = if sheet.cells.is_paged() {
            (
                sheet.cells.num_at(base + a as usize),
                sheet.cells.num_at(base + b as usize),
            )
        } else {
            unsafe {
                (
                    f64::from_bits(sheet.cells.payload_unchecked(base + a as usize)),
                    f64::from_bits(sheet.cells.payload_unchecked(base + b as usize)),
                )
            }
        };
        let ord = left.partial_cmp(&right).unwrap_or(Ordering::Equal);
        let ord = if ascending { ord } else { ord.reverse() };
        if ord == Ordering::Equal {
            a.cmp(&b)
        } else {
            ord
        }
    });
    Some(order)
}

fn sort_finite_number_column_radix(
    sheet: &SheetData,
    base: usize,
    ascending: bool,
) -> Option<Vec<u32>> {
    let mut pairs = Vec::with_capacity(sheet.cells.row_count());
    let direction = |key: u64| if ascending { key } else { !key };

    // A dense column gathers keys from its slices; only literal numbers sort
    // here, so a formula or any other source ends the numeric path early.
    let dense = (sheet.cells.row_count() > 0)
        .then(|| sheet.cells.dense_column(base / sheet.cells.row_count()))
        .flatten();
    if let Some(column) = dense {
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
        let end = base + sheet.cells.row_count();
        let mut start = base;
        while start < end {
            let run = sheet.cells.run(start, end);
            for index in run.start..run.end {
                let value = source_number_in_run(&run, index, true)?;
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
    if !value.is_finite() {
        return None;
    }

    let normalized = if value == 0.0 { 0.0 } else { value };
    let bits = normalized.to_bits();
    const SIGN: u64 = 1 << 63;
    Some(if bits & SIGN == 0 { bits ^ SIGN } else { !bits })
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
    let next = next as usize;
    if occupied(pos) && occupied(next) {
        pos = next;
        loop {
            let ahead = pos as isize + step;
            if ahead < 0 || ahead as usize > last || !occupied(ahead as usize) {
                return pos;
            }
            pos = ahead as usize;
        }
    }
    let mut candidate = next as isize;
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

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum ComparableCell<'a> {
    Number(OrderedNumber),
    Bool(bool),
    Text(&'a str),
    Empty,
}

impl<'a> ComparableCell<'a> {
    pub(crate) fn from_cell(
        sheet: &'a SheetData,
        strings: &'a StringStorage,
        index: usize,
    ) -> Self {
        match sheet.cells.kind_at(index) {
            KIND_NUMBER => ComparableCell::Number(OrderedNumber(sheet.cells.num_at(index))),
            KIND_BOOL => ComparableCell::Bool(sheet.cells.num_at(index) != 0.0),
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return ComparableCell::Empty;
                };
                if let Some(error) = formula_error_at(sheet, key) {
                    ComparableCell::Text(error.sentinel())
                } else if sheet.cells.formula_value_kind(index) == FormulaValueKind::Blank {
                    ComparableCell::Empty
                } else if sheet.cells.formula_value_kind(index) == FormulaValueKind::Bool {
                    ComparableCell::Bool(sheet.cells.num_at(index) != 0.0)
                } else if let Some(text) =
                    string_from_pool_ref(strings, sheet.cells.str_id_at(index))
                {
                    ComparableCell::Text(text)
                } else {
                    ComparableCell::Number(OrderedNumber(sheet.cells.num_at(index)))
                }
            }
            KIND_STRING => string_from_pool_ref(strings, sheet.cells.str_id_at(index))
                .map_or(ComparableCell::Empty, ComparableCell::Text),
            _ => ComparableCell::Empty,
        }
    }

    fn from_run(
        sheet: &'a SheetData,
        strings: &'a StringStorage,
        run: &CellRun<'_>,
        index: usize,
    ) -> Self {
        if sheet.cells.is_paged() {
            return Self::from_cell(sheet, strings, index);
        }
        let (kind, payload) = run.source(index);
        match kind {
            KIND_NUMBER => Self::Number(OrderedNumber(f64::from_bits(payload))),
            KIND_BOOL => Self::Bool(payload_num(payload) != 0.0),
            KIND_STRING => string_from_pool_ref(strings, payload_str_id(payload))
                .map_or(Self::Empty, Self::Text),
            KIND_FORMULA => {
                let Some(key) = key_for_index(sheet, index) else {
                    return Self::Empty;
                };
                if let Some(error) = formula_error_at(sheet, key) {
                    return Self::Text(error.sentinel());
                }
                let (kind, payload) = run.resolved(index);
                match kind {
                    KIND_EMPTY => Self::Empty,
                    KIND_BOOL => Self::Bool(payload_num(payload) != 0.0),
                    KIND_STRING => string_from_pool_ref(strings, payload_str_id(payload)).map_or(
                        Self::Number(OrderedNumber(payload_num(payload))),
                        Self::Text,
                    ),
                    _ => Self::Number(OrderedNumber(payload_num(payload))),
                }
            }
            _ => Self::Empty,
        }
    }
}

impl Ord for ComparableCell<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            (ComparableCell::Empty, ComparableCell::Empty) => Ordering::Equal,
            (ComparableCell::Empty, _) => Ordering::Greater,
            (_, ComparableCell::Empty) => Ordering::Less,
            (ComparableCell::Number(a), ComparableCell::Number(b)) => a.cmp(b),
            (ComparableCell::Text(a), ComparableCell::Text(b)) => a.cmp(b),
            (ComparableCell::Bool(a), ComparableCell::Bool(b)) => a.cmp(b),
            (ComparableCell::Number(_), _) => Ordering::Less,
            (_, ComparableCell::Number(_)) => Ordering::Greater,
            (ComparableCell::Text(_), ComparableCell::Bool(_)) => Ordering::Less,
            (ComparableCell::Bool(_), ComparableCell::Text(_)) => Ordering::Greater,
        }
    }
}

impl PartialOrd for ComparableCell<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
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
