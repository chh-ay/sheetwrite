//! Whole-column queries: sort, filter, search, aggregate — cache-local scans.

use std::cell::Cell;
use std::cmp::Ordering;
use std::collections::HashSet;

use wasm_bindgen::prelude::*;

use crate::cells::{dense_resolved, payload_num, payload_str_id, source_kind, CellRun};
use crate::float_text::NumberText;
use crate::formula_slots::FormulaStore;
use crate::sheet::{formula_error_at, SheetData};
use crate::sort_text::push_collation_key;
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
        let needle = needle.to_lowercase();
        let mut out: Vec<u32> = Vec::with_capacity(s.cells.row_count().min(1024));
        let mut cache = MatchCache::new();

        // Dense columns read their slices directly; see `aggregate`.
        if let Some(column) = s.cells.dense_column(col) {
            let (kinds, payloads) = column.raw_slices();
            for (row, &raw) in kinds.iter().enumerate() {
                // Literals never carry the calculated bit, so the raw byte
                // classifies them and their payload is their value; a bare
                // empty byte has no calculated value. Only formula and
                // calculated slots need the general cell match.
                let matched = match raw {
                    KIND_STRING => cache.matches(
                        &self.strings,
                        payload_str_id(payloads[row]),
                        &needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                    ),
                    KIND_NUMBER => number_matches_text(
                        payload_num(payloads[row]),
                        &needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                    ),
                    KIND_BOOL => matches_needle(
                        boolean_text(payload_num(payloads[row]) != 0.0),
                        &needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
                    ),
                    KIND_EMPTY => false,
                    _ => cell_matches_text(
                        s,
                        self,
                        base + row,
                        &needle,
                        FILTER_CASE_INSENSITIVE,
                        FILTER_WHOLE_CELL,
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
                    cache.matches(
                        &self.strings,
                        payload_str_id(payload),
                        &needle,
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
                        &needle,
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
                    self,
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
        let keys = keys.rank();

        let mut order: Vec<u32> = (0..s.cells.row_count() as u32).collect();
        order.sort_unstable_by(|&a, &b| {
            let ord = keys.compare(a as usize, b as usize, ascending);
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
        let mut keys = SortKeyBuilder::with_capacity(row_count * cols.len());
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
                keys.push(ComparableCell::from_run(
                    data,
                    &self.strings,
                    run,
                    index,
                    &self.formula_slots,
                ));
            }
        }
        let keys = keys.rank();

        let mut positions: Vec<u32> = (0..row_count as u32).collect();
        // NaN keys compare equal to other numeric keys; a stable sort preserves ties.
        positions.sort_by(|&left, &right| {
            for key in 0..cols.len() {
                let order = keys.compare(
                    key * row_count + left as usize,
                    key * row_count + right as usize,
                    ascending.get(key).copied().unwrap_or(1) != 0,
                );
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
                let kind = resolved_kind(data, index, &self.formula_slots);
                let matches = match kinds[i] {
                    0 => {
                        let mut hit = kind == 0 && flags.get(i).copied().unwrap_or(0) & 1 != 0;
                        let nc = num_counts.get(i).copied().unwrap_or(0) as usize;
                        let tc = text_counts.get(i).copied().unwrap_or(0) as usize;
                        match &value_sets[i] {
                            ValueSet::Linear => {
                                if kind == 1 {
                                    if let Some(value) =
                                        numeric_cell_value(data, index, &self.formula_slots)
                                    {
                                        hit |= value_nums
                                            .get(num_offsets[i]..num_offsets[i] + nc)
                                            .unwrap_or(&[])
                                            .contains(&value);
                                    }
                                } else if kind == 2 {
                                    if let Some(text) = resolved_text(
                                        data,
                                        &self.strings,
                                        index,
                                        &self.formula_slots,
                                    ) {
                                        hit |= value_texts
                                            .get(text_offsets[i]..text_offsets[i] + tc)
                                            .unwrap_or(&[])
                                            .iter()
                                            .any(|picked| picked == text);
                                    }
                                } else if kind == 3 {
                                    if let Some(value) =
                                        boolean_cell_value(data, index, &self.formula_slots)
                                    {
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
                                    if let Some(value) =
                                        numeric_cell_value(data, index, &self.formula_slots)
                                    {
                                        let normalized = if value == 0.0 { 0.0 } else { value };
                                        hit |= numbers.binary_search(&normalized.to_bits()).is_ok();
                                    }
                                } else if kind == 2 {
                                    if let Some(text) = resolved_text(
                                        data,
                                        &self.strings,
                                        index,
                                        &self.formula_slots,
                                    ) {
                                        hit |= texts.contains(text);
                                    }
                                } else if kind == 3 {
                                    if let Some(value) =
                                        boolean_cell_value(data, index, &self.formula_slots)
                                    {
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
                            self,
                            index,
                            needle,
                            flags.get(i).copied().unwrap_or(0) == 0,
                            false,
                            &mut match_caches[cache_index[i]],
                        )
                    }
                    2 => {
                        numeric_cell_value(data, index, &self.formula_slots).is_some_and(|value| {
                            match flags.get(i).copied().unwrap_or(0) {
                                0 => value > nums.get(i).copied().unwrap_or(0.0),
                                1 => value >= nums.get(i).copied().unwrap_or(0.0),
                                2 => value < nums.get(i).copied().unwrap_or(0.0),
                                3 => value <= nums.get(i).copied().unwrap_or(0.0),
                                4 => value == nums.get(i).copied().unwrap_or(0.0),
                                _ => value != nums.get(i).copied().unwrap_or(0.0),
                            }
                        })
                    }
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

    /// Distinct resolved values of a whole column, in first-seen order.
    #[wasm_bindgen(js_name = distinctValues)]
    pub fn distinct_values(&self, sheet: usize, col: usize, limit: usize) -> DistinctColumn {
        self.distinct_values_in_rows(sheet, col, 0, usize::MAX, limit)
    }

    /// Distinct resolved values of one column over the canonical data rows
    /// `start_row..end_row`, in first-seen order. The range is clipped to the
    /// sheet. A zero `limit` returns every value; otherwise the scan stops at
    /// `limit` values.
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
    ) -> DistinctColumn {
        let mut out = DistinctColumn::default();
        let Some(data) = self.sheets.get(sheet) else {
            return out;
        };
        if col >= data.cells.n_cols() {
            return out;
        }
        let row_count = data.cells.row_count();
        let rows = start_row.min(row_count)..end_row.min(row_count);
        let text_at = |index: usize| {
            resolved_text(data, &self.strings, index, &self.formula_slots).unwrap_or("")
        };
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
            for row in rows.clone() {
                let index = col * data.cells.row_count() + row;
                let kind = resolved_kind(data, index, &self.formula_slots);
                let fresh = match kind {
                    1 => seen.insert(DistinctKey::Number(
                        numeric_cell_value(data, index, &self.formula_slots)
                            .unwrap_or(0.0)
                            .to_bits(),
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
                        boolean_cell_value(data, index, &self.formula_slots).unwrap_or(false),
                    )),
                    _ => seen.insert(DistinctKey::Blank),
                };
                if !fresh {
                    continue;
                }
                out.kinds.push(kind);
                if kind == 1 {
                    out.numbers
                        .push(numeric_cell_value(data, index, &self.formula_slots).unwrap_or(0.0));
                } else if kind == 3 {
                    out.numbers.push(
                        if boolean_cell_value(data, index, &self.formula_slots).unwrap_or(false) {
                            1.0
                        } else {
                            0.0
                        },
                    );
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
                        _ => resolved_kind(data, index, &self.formula_slots) != 0,
                    }
            })
        };
        edge_scan(row, order.len(), d_row.signum() as isize, occupied) as u32
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

fn boolean_text(value: bool) -> &'static str {
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

fn is_number_text_byte(byte: u8) -> bool {
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

    // Paged storage keeps no dense payloads; its rows go through `num_at`.
    let dense_payloads = if sheet.cells.is_paged() {
        None
    } else {
        sheet.cells.dense_payloads(base..end)
    };
    let value_at_row = |row: u32| {
        let index = row as usize;
        dense_payloads
            .and_then(|payloads| payloads.get(index))
            .map_or_else(
                || sheet.cells.num_at(base + index),
                |&bits| f64::from_bits(bits),
            )
    };
    order.sort_unstable_by(|&a, &b| {
        let (left, right) = (value_at_row(a), value_at_row(b));
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
        let (kind, payload) = run.source(index);
        // Spill owners install calculated output in these same dense slots.
        // Read the bounded run directly; ownership needs no per-row hash probe.
        let (kind, payload) = if kind == KIND_EMPTY {
            run.resolved(index)
        } else {
            (kind, payload)
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

    /// Bytes allocated for collation: the arena, the distinct-text spans and
    /// the pool-id table.
    #[cfg(test)]
    pub(crate) fn collation_bytes(&self) -> usize {
        self.arena.capacity()
            + self.texts.capacity() * std::mem::size_of::<CollatedText>()
            + self.text_by_pool_id.capacity() * std::mem::size_of::<u32>()
    }

    /// Bytes of collation keys in the arena.
    #[cfg(test)]
    pub(crate) fn arena_len(&self) -> usize {
        self.arena.len()
    }

    /// Sort the distinct strings once and give each its rank in collation
    /// order; equal keys get equal ranks. Rows then compare text by rank, so
    /// the row sort makes no byte comparison. The arena is dropped here.
    pub(crate) fn rank(mut self) -> SortKeys {
        let mut order: Vec<u32> = (0..self.texts.len() as u32).collect();
        order.sort_unstable_by(|&a, &b| self.collation_cmp(a, b));

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
        let a = self.texts[a as usize];
        let b = self.texts[b as usize];
        let a_key = &self.arena[a.start as usize..a.end as usize];
        let b_key = &self.arena[b.start as usize..b.end as usize];
        a_key.cmp(b_key).then(a.has_hyphen.cmp(&b.has_hyphen))
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
    /// Excel's sort order of keys `left` and `right`: numbers, text, `FALSE`
    /// before `TRUE`, then errors, which are all equal. A descending sort
    /// reverses this order, but blank cells are last in both directions.
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
