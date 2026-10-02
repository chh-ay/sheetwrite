//! Lookup argument validation and exact/approximate matching algorithms.

use std::cell::{Cell, Ref, RefCell};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::rc::Rc;

use crate::types::{CellRange, FormulaError, Value};

use super::criteria::WildcardPattern;
use super::value::{compare_text_case_insensitive, compare_values, number_from_value};

pub(super) fn integer_arg(value: &Value) -> Result<i32, FormulaError> {
    let number = number_from_value(value)?;
    if !number.is_finite()
        || number.fract() != 0.0
        || number < i32::MIN as f64
        || number > i32::MAX as f64
    {
        return Err(FormulaError::Value);
    }
    Ok(number as i32)
}

pub(super) fn positive_index(value: &Value) -> Result<usize, FormulaError> {
    let index = integer_arg(value)?;
    if index <= 0 {
        return Err(FormulaError::Value);
    }
    Ok(index as usize - 1)
}

fn lookup_compare(left: &Value, right: &Value) -> Result<Ordering, FormulaError> {
    match (left, right) {
        (Value::Text(left), Value::Text(right)) => Ok(compare_text_case_insensitive(left, right)),
        (Value::Error(error), _) | (_, Value::Error(error)) => Err(*error),
        _ => compare_values(left, right),
    }
}

/// Which part of a table holds the search list.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(super) enum TablePart {
    /// Column 0, top to bottom (`VLOOKUP`).
    FirstColumn,
    /// Row 0, left to right (`HLOOKUP`).
    FirstRow,
}

/// The value domain a lookup list lives in. A list whose entries all fall in
/// one domain compares like a total order, so its exact classes and its
/// descending boundaries are well defined; a list that mixes domains, holds
/// an error, or holds NaN keeps the plain scan.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UniformKind {
    Numeric,
    Text,
    Logical,
}

/// Normalized class of one list entry. Two entries share a class exactly when
/// `lookup_compare` reports them equal, which folds in the special cases:
/// blank equals `0`, `""` and `FALSE`, and text compares case-insensitively.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
enum BucketKey {
    Blank,
    Zero,
    EmptyText,
    FalseBool,
    Number(u64),
    Text(String),
    TrueBool,
}

/// First and last position of one class in the list.
type Bucket = (usize, usize);

/// Monotonicity of the list for one search direction.
#[derive(Clone, Copy)]
enum Sortedness {
    Pending,
    Done(Result<bool, FormulaError>),
}

/// The value domain a list lives in, computed once on demand. `None` is a
/// list the index cannot answer for: one that mixes domains, holds an error,
/// or holds NaN.
enum KindCache {
    Pending,
    Ready(Option<UniformKind>),
}

enum BucketCache {
    Pending,
    Ready(Option<HashMap<BucketKey, Bucket>>),
}

/// Distinct classes the exact-match index keeps. A list with more distinct
/// values than this still searches, but it does not hold a hash entry per
/// value; the cap bounds what one decoded table can cost in memory.
const LOOKUP_INDEX_MAX_CLASSES: usize = 262_144;

/// One lookup list, decoded once per pass and searched any number of times.
///
/// The plain scan answers every input; the index only runs where it proves
/// the same answer. The first search runs the plain scan, so a range searched
/// once costs what it always did; later searches use the sorted flags, the
/// exact-match index and the boundary search. Unsorted, mixed-type, error and
/// NaN lists keep the plain scan.
pub(super) struct LookupIndex {
    values: Vec<Value>,
    /// Searches run against this list in the pass; index work starts at the
    /// second one.
    searches: Cell<u32>,
    ascending: RefCell<Sortedness>,
    descending: RefCell<Sortedness>,
    kind: RefCell<KindCache>,
    buckets: RefCell<BucketCache>,
}

impl LookupIndex {
    /// Takes ownership of a decoded list without computing anything.
    pub(super) fn new(values: Vec<Value>) -> Self {
        Self {
            values,
            searches: Cell::new(0),
            ascending: RefCell::new(Sortedness::Pending),
            descending: RefCell::new(Sortedness::Pending),
            kind: RefCell::new(KindCache::Pending),
            buckets: RefCell::new(BucketCache::Pending),
        }
    }

    /// The decoded entries in lookup order.
    pub(super) fn values(&self) -> &[Value] {
        &self.values
    }

    /// True when the list is monotone in the direction `search_mode` asks
    /// for. The error is the first failed pair comparison, exactly where the
    /// plain walk stops.
    fn sorted_ok(&self, search_mode: i32) -> Result<bool, FormulaError> {
        let requires_ascending = search_mode == 2;
        let cached = {
            let slot = if requires_ascending {
                self.ascending.borrow()
            } else {
                self.descending.borrow()
            };
            *slot
        };
        let outcome = match cached {
            Sortedness::Done(outcome) => outcome,
            Sortedness::Pending => {
                let outcome = monotonicity_walk(&self.values, requires_ascending);
                let mut slot = if requires_ascending {
                    self.ascending.borrow_mut()
                } else {
                    self.descending.borrow_mut()
                };
                *slot = Sortedness::Done(outcome);
                outcome
            }
        };
        outcome
    }

    /// The list's single comparison domain, computed on first use.
    fn uniform_kind(&self) -> Option<UniformKind> {
        let is_pending = matches!(&*self.kind.borrow(), KindCache::Pending);
        if is_pending {
            let built = classify(&self.values);
            *self.kind.borrow_mut() = KindCache::Ready(built);
        }
        match &*self.kind.borrow() {
            KindCache::Ready(kind) => *kind,
            KindCache::Pending => None,
        }
    }

    /// The class index, built on first use and kept for the pass.
    fn buckets(&self) -> Ref<'_, BucketCache> {
        let is_pending = matches!(&*self.buckets.borrow(), BucketCache::Pending);
        if is_pending {
            let built = build_buckets(&self.values);
            *self.buckets.borrow_mut() = BucketCache::Ready(built);
        }
        self.buckets.borrow()
    }

    /// Whether the boundary search can answer for the key: the list is one
    /// comparison domain, ascending, and the key belongs to that domain.
    fn boundary_gate(&self, key: &Value) -> bool {
        let Some(kind) = self.uniform_kind() else {
            return false;
        };
        key_fits_domain(key, kind) && matches!(self.sorted_ok(2), Ok(true))
    }

    /// First (or last) exactly equal position. The boundary search answers on
    /// an ascending single-domain list, the class index on any other
    /// single-domain list, and the plain scan decides everything else,
    /// including its error order.
    fn exact_match(
        &self,
        key: &Value,
        search_reverse: bool,
        use_index: bool,
    ) -> Result<Option<usize>, FormulaError> {
        if use_index {
            if self.boundary_gate(key) {
                let values = self.values();
                let lower = first_not_below(values, key)?;
                let upper = first_above(values, key)?;
                if lower < upper {
                    return Ok(Some(if search_reverse { upper - 1 } else { lower }));
                }
                return Ok(None);
            }
            let buckets = self.buckets();
            if let BucketCache::Ready(Some(classes)) = &*buckets {
                if let Some(position) = indexed_exact_match(classes, key, search_reverse) {
                    return Ok(position);
                }
            }
            drop(buckets);
        }
        let values = self.values();
        if search_reverse {
            for position in (0..values.len()).rev() {
                if lookup_compare(&values[position], key)? == Ordering::Equal {
                    return Ok(Some(position));
                }
            }
        } else {
            for position in 0..values.len() {
                if lookup_compare(&values[position], key)? == Ordering::Equal {
                    return Ok(Some(position));
                }
            }
        }
        Ok(None)
    }

    /// Nearest value across the key, on the side `match_mode` asks for, at the
    /// position the plain scan reports: the first position of the nearest
    /// class.
    fn approximate_match(
        &self,
        key: &Value,
        match_mode: i32,
        use_index: bool,
    ) -> Result<Option<usize>, FormulaError> {
        if use_index && self.boundary_gate(key) {
            return approximate_boundary(self.values(), key, match_mode);
        }
        let values = self.values();
        let mut best: Option<(usize, Value)> = None;
        for (position, candidate) in values.iter().enumerate() {
            let ordering = lookup_compare(candidate, key)?;
            let is_eligible = if match_mode == -1 {
                ordering == Ordering::Less
            } else {
                ordering == Ordering::Greater
            };
            if !is_eligible {
                continue;
            }
            let replaces = match &best {
                None => true,
                Some((_, current)) => {
                    let versus = lookup_compare(candidate, current)?;
                    if match_mode == -1 {
                        versus == Ordering::Greater
                    } else {
                        versus == Ordering::Less
                    }
                }
            };
            if replaces {
                best = Some((position, candidate.clone()));
            }
        }
        Ok(best.map(|(position, _)| position))
    }
}

/// Searches a decoded list with the same rules as the plain scan, using the
/// list's index where it proves the same answer from the second search on.
pub(super) fn find_match_index_indexed(
    list: &LookupIndex,
    key: &Value,
    match_mode: i32,
    search_mode: i32,
) -> Result<Option<usize>, FormulaError> {
    let values = list.values();
    if values.is_empty() {
        return Ok(None);
    }
    let use_index = list.searches.get() > 0;
    list.searches.set(list.searches.get().saturating_add(1));
    if search_mode.abs() == 2 && !list.sorted_ok(search_mode)? {
        return Ok(None);
    }
    let search_reverse = search_mode < 0;
    if match_mode == 2 {
        return Ok(wildcard_scan(values, key, search_reverse));
    }
    if let Some(found) = list.exact_match(key, search_reverse, use_index)? {
        return Ok(Some(found));
    }
    if !matches!(match_mode, -1 | 1) {
        return Ok(None);
    }
    list.approximate_match(key, match_mode, use_index)
}

/// The plain scan's pair walk: the first non-monotone pair is `Ok(false)`,
/// the first failed comparison is its error, and a clean walk is `Ok(true)`.
fn monotonicity_walk(values: &[Value], requires_ascending: bool) -> Result<bool, FormulaError> {
    let violation = if requires_ascending {
        Ordering::Greater
    } else {
        Ordering::Less
    };
    for pair in values.windows(2) {
        match lookup_compare(&pair[0], &pair[1]) {
            Ok(ordering) if ordering == violation => return Ok(false),
            Ok(_) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(true)
}

/// First (or last) wildcard match. A non-text key matches nothing, exactly
/// like the pattern check the plain scan runs per candidate.
fn wildcard_scan(values: &[Value], key: &Value, search_reverse: bool) -> Option<usize> {
    let Value::Text(pattern) = key else {
        return None;
    };
    let pattern = WildcardPattern::new(pattern);
    let matches = |candidate: &Value| pattern.matches(candidate);
    if search_reverse {
        (0..values.len())
            .rev()
            .find(|&position| matches(&values[position]))
    } else {
        (0..values.len()).find(|&position| matches(&values[position]))
    }
}

/// Exact-match positions from the class index. `None` keeps the plain scan:
/// either the list is not indexable or the key is one the index does not
/// classify (an error or NaN). A classified key with no class in the list is
/// a real miss, because an indexable list only matches through its classes.
fn indexed_exact_match(
    classes: &HashMap<BucketKey, Bucket>,
    key: &Value,
    search_reverse: bool,
) -> Option<Option<usize>> {
    let mut found: Option<usize> = None;
    let mut consider = |class: BucketKey| {
        let Some(&(first, last)) = classes.get(&class) else {
            return;
        };
        let position = if search_reverse { last } else { first };
        found = Some(match found {
            None => position,
            Some(current) if search_reverse => current.max(position),
            Some(current) => current.min(position),
        });
    };
    match key {
        Value::Blank => {
            consider(BucketKey::Blank);
            consider(BucketKey::Zero);
            consider(BucketKey::EmptyText);
            consider(BucketKey::FalseBool);
        }
        Value::Bool(false) => {
            consider(BucketKey::FalseBool);
            consider(BucketKey::Blank);
        }
        Value::Bool(true) => consider(BucketKey::TrueBool),
        Value::Text(text) => {
            let folded = text.to_lowercase();
            if folded.is_empty() {
                consider(BucketKey::EmptyText);
                consider(BucketKey::Blank);
            } else {
                consider(BucketKey::Text(folded));
            }
        }
        Value::Number(number) if !number.is_nan() => {
            if *number == 0.0 {
                consider(BucketKey::Zero);
                consider(BucketKey::Blank);
            } else {
                consider(BucketKey::Number(number.to_bits()));
            }
        }
        _ => return None,
    }
    Some(found)
}

/// Nearest value across the key on an ascending, single-domain list. Equal
/// neighbours are contiguous there, so the first position not below the key
/// and the first position above it bound the equal class; without an equal
/// entry the answer is the first position of the nearest class.
fn approximate_boundary(
    values: &[Value],
    key: &Value,
    match_mode: i32,
) -> Result<Option<usize>, FormulaError> {
    let lower = first_not_below(values, key)?;
    let upper = first_above(values, key)?;
    if match_mode == -1 {
        if lower == 0 {
            return Ok(None);
        }
        let nearest = &values[lower - 1];
        return Ok(Some(first_not_below(values, nearest)?));
    }
    if upper == values.len() {
        return Ok(None);
    }
    Ok(Some(upper))
}

/// First position whose value is not below `probe`.
fn first_not_below(values: &[Value], probe: &Value) -> Result<usize, FormulaError> {
    let (mut low, mut high) = (0, values.len());
    while low < high {
        let middle = low + (high - low) / 2;
        if lookup_compare(&values[middle], probe)? == Ordering::Less {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    Ok(low)
}

/// First position whose value is above `probe`.
fn first_above(values: &[Value], probe: &Value) -> Result<usize, FormulaError> {
    let (mut low, mut high) = (0, values.len());
    while low < high {
        let middle = low + (high - low) / 2;
        if lookup_compare(&values[middle], probe)? == Ordering::Greater {
            high = middle;
        } else {
            low = middle + 1;
        }
    }
    Ok(low)
}

/// Whether the key belongs to the list's value domain. A key from another
/// domain can compare below one entry and above its neighbour, which breaks
/// the boundary search, so those keys use the plain scan.
fn key_fits_domain(key: &Value, kind: UniformKind) -> bool {
    match key {
        Value::Blank => true,
        Value::Number(number) => kind == UniformKind::Numeric && !number.is_nan(),
        Value::Text(_) => kind == UniformKind::Text,
        Value::Bool(_) => kind == UniformKind::Logical,
        Value::Error(_) => false,
    }
}

/// The comparison domain of one value: `None` for NaN and errors, and an
/// inner `None` for blanks, which belong to every domain.
fn domain_of(value: &Value) -> Option<Option<UniformKind>> {
    match value {
        Value::Blank => Some(None),
        Value::Number(number) if !number.is_nan() => Some(Some(UniformKind::Numeric)),
        Value::Text(_) => Some(Some(UniformKind::Text)),
        Value::Bool(_) => Some(Some(UniformKind::Logical)),
        _ => None,
    }
}

/// The domain every entry shares, or `None` when the list mixes domains or
/// holds an error or NaN.
fn classify(values: &[Value]) -> Option<UniformKind> {
    let mut found: Option<UniformKind> = None;
    for value in values {
        if let Some(entry_kind) = domain_of(value)? {
            match found {
                None => found = Some(entry_kind),
                Some(existing) if existing == entry_kind => {}
                Some(_) => return None,
            }
        }
    }
    found
}

/// Classifies every entry once. `None` marks a list the index cannot answer
/// for: one that mixes domains, holds an error, holds NaN, or holds more
/// distinct classes than the index keeps.
fn build_buckets(values: &[Value]) -> Option<HashMap<BucketKey, Bucket>> {
    let mut classes: HashMap<BucketKey, Bucket> =
        HashMap::with_capacity(values.len().min(LOOKUP_INDEX_MAX_CLASSES));
    for (position, value) in values.iter().enumerate() {
        let class = class_of(value)?;
        classes
            .entry(class)
            .and_modify(|(_, last)| *last = position)
            .or_insert((position, position));
        if classes.len() > LOOKUP_INDEX_MAX_CLASSES {
            return None;
        }
    }
    Some(classes)
}

/// The exact-match class of one value, or `None` for NaN and errors.
fn class_of(value: &Value) -> Option<BucketKey> {
    Some(match value {
        Value::Blank => BucketKey::Blank,
        Value::Bool(false) => BucketKey::FalseBool,
        Value::Bool(true) => BucketKey::TrueBool,
        Value::Text(text) => {
            let folded = text.to_lowercase();
            if folded.is_empty() {
                BucketKey::EmptyText
            } else {
                BucketKey::Text(folded)
            }
        }
        Value::Number(number) if !number.is_nan() => {
            if *number == 0.0 {
                BucketKey::Zero
            } else {
                BucketKey::Number(number.to_bits())
            }
        }
        _ => return None,
    })
}

/// A table materialized once for the pass, with the searched column or row
/// copied out into a reusable search list (`VLOOKUP`, `HLOOKUP`).
pub(super) struct CachedTable {
    rows: usize,
    cols: usize,
    values: Vec<Value>,
    list: LookupIndex,
}

impl CachedTable {
    /// Keeps `values` for result cells and searches their first column.
    pub(super) fn from_column(rows: usize, cols: usize, values: Vec<Value>) -> Self {
        let list = LookupIndex::new(first_column(rows, cols, &values));
        Self {
            rows,
            cols,
            values,
            list,
        }
    }

    /// Keeps `values` for result cells and searches their first row.
    pub(super) fn from_row(rows: usize, cols: usize, values: Vec<Value>) -> Self {
        let list = LookupIndex::new(values.iter().take(cols).cloned().collect());
        Self {
            rows,
            cols,
            values,
            list,
        }
    }

    /// The reusable search list.
    pub(super) fn search(&self) -> &LookupIndex {
        &self.list
    }

    /// The value at a row-major position, with `EvalMatrix::get`'s bounds.
    pub(super) fn cell(&self, row: usize, col: usize) -> Option<&Value> {
        (row < self.rows && col < self.cols)
            .then(|| self.values.get(row * self.cols + col))
            .flatten()
    }
}

fn first_column(rows: usize, cols: usize, values: &[Value]) -> Vec<Value> {
    (0..rows)
        .filter_map(|row| values.get(row * cols))
        .cloned()
        .collect()
}

/// A range that is its own search list (`MATCH`, `XMATCH`, `XLOOKUP`).
pub(super) struct CachedList {
    rows: usize,
    cols: usize,
    index: LookupIndex,
}

impl CachedList {
    /// Takes the row-major values of a range as the search list.
    pub(super) fn new(rows: usize, cols: usize, values: Vec<Value>) -> Self {
        Self {
            rows,
            cols,
            index: LookupIndex::new(values),
        }
    }

    /// The range's clamped shape, for the argument checks.
    pub(super) fn shape(&self) -> (usize, usize) {
        (self.rows, self.cols)
    }

    /// The reusable search list.
    pub(super) fn search(&self) -> &LookupIndex {
        &self.index
    }
}

/// A range materialized once for the result cells of a lookup (`XLOOKUP`).
pub(super) struct CachedResult {
    values: Vec<Value>,
}

impl CachedResult {
    /// Keeps the row-major values of a range.
    pub(super) fn new(values: Vec<Value>) -> Self {
        Self { values }
    }

    /// The number of values, for `XLOOKUP`'s length check.
    pub(super) fn len(&self) -> usize {
        self.values.len()
    }

    /// The value at a row-major position.
    pub(super) fn value(&self, position: usize) -> Option<&Value> {
        self.values.get(position)
    }
}

/// What one recalculation pass knows about a range a lookup read.
pub(super) enum ReuseEntry<Materialized> {
    /// Materialized once in this pass; the next lookup decides whether the
    /// range can be kept.
    Seen,
    /// The range cannot change within the pass, so every later lookup reuses
    /// this entry.
    Reusable(Rc<Materialized>),
    /// The range holds cells that can change mid-pass; always materialize.
    Blocked,
}

impl<Materialized> Clone for ReuseEntry<Materialized> {
    fn clone(&self) -> Self {
        match self {
            Self::Seen => Self::Seen,
            Self::Reusable(entry) => Self::Reusable(Rc::clone(entry)),
            Self::Blocked => Self::Blocked,
        }
    }
}

thread_local! {
    /// What one recalculation pass knows about the ranges its lookups read,
    /// keyed by the range and the part read from it. Cleared where the
    /// range-sum cache is cleared, so none of it outlives its pass.
    static CACHED_TABLES: RefCell<HashMap<(CellRange, TablePart), ReuseEntry<CachedTable>>> =
        RefCell::new(HashMap::new());
    static CACHED_LISTS: RefCell<HashMap<CellRange, ReuseEntry<CachedList>>> =
        RefCell::new(HashMap::new());
    static CACHED_RESULTS: RefCell<HashMap<CellRange, ReuseEntry<CachedResult>>> =
        RefCell::new(HashMap::new());
    /// Whether a recalculation pass is running. Setters can change a cell
    /// between passes without clearing anything, so a range is only reused
    /// while the pass that recorded it holds the values it read.
    static LOOKUP_PASS_ACTIVE: Cell<bool> = const { Cell::new(false) };
}

/// Keeps reused ranges alive for one recalculation pass. Dropping the guard
/// ends the pass, after which every lookup decodes its own range again.
pub(super) struct LookupPassGuard;

impl LookupPassGuard {
    /// Starts a pass: later lookups may reuse decoded ranges.
    pub(super) fn begin() -> Self {
        LOOKUP_PASS_ACTIVE.with(|active| active.set(true));
        Self
    }
}

impl Drop for LookupPassGuard {
    fn drop(&mut self) {
        LOOKUP_PASS_ACTIVE.with(|active| active.set(false));
    }
}

fn pass_is_active() -> bool {
    LOOKUP_PASS_ACTIVE.with(Cell::get)
}

/// Drops every reuse state. A recalculation pass clears it first thing.
pub(super) fn clear_cached_lookups() {
    CACHED_TABLES.with(|tables| tables.borrow_mut().clear());
    CACHED_LISTS.with(|lists| lists.borrow_mut().clear());
    CACHED_RESULTS.with(|results| results.borrow_mut().clear());
}

/// What this pass knows about `range` and `part`.
pub(super) fn table_reuse(range: CellRange, part: TablePart) -> Option<ReuseEntry<CachedTable>> {
    if !pass_is_active() {
        return None;
    }
    CACHED_TABLES.with(|tables| tables.borrow().get(&(range, part)).cloned())
}

/// Records what this pass knows about `range` and `part`.
pub(super) fn remember_table(range: CellRange, part: TablePart, state: ReuseEntry<CachedTable>) {
    if !pass_is_active() {
        return;
    }
    CACHED_TABLES.with(|tables| {
        tables.borrow_mut().insert((range, part), state);
    });
}

/// What this pass knows about `range` as a search list.
pub(super) fn list_reuse(range: CellRange) -> Option<ReuseEntry<CachedList>> {
    if !pass_is_active() {
        return None;
    }
    CACHED_LISTS.with(|lists| lists.borrow().get(&range).cloned())
}

/// Records what this pass knows about `range` as a search list.
pub(super) fn remember_list(range: CellRange, state: ReuseEntry<CachedList>) {
    if !pass_is_active() {
        return;
    }
    CACHED_LISTS.with(|lists| {
        lists.borrow_mut().insert(range, state);
    });
}

/// What this pass knows about `range` as a result range.
pub(super) fn result_reuse(range: CellRange) -> Option<ReuseEntry<CachedResult>> {
    if !pass_is_active() {
        return None;
    }
    CACHED_RESULTS.with(|results| results.borrow().get(&range).cloned())
}

/// Records what this pass knows about `range` as a result range.
pub(super) fn remember_result(range: CellRange, state: ReuseEntry<CachedResult>) {
    if !pass_is_active() {
        return;
    }
    CACHED_RESULTS.with(|results| {
        results.borrow_mut().insert(range, state);
    });
}
