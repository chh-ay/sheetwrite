//! Lookup argument validation and exact/approximate matching.
//!
//! A lookup range of literal sources is searched where it is stored: each
//! entry is read from its kind byte and payload, and text from the string
//! pool, so no copy of the range is built. Any other range is evaluated into
//! values for that one lookup. When several formulas read one range, its
//! search state lives in pass state, indexed by range group.

use std::cmp::Ordering;

use crate::cells::payload_num;
use crate::types::{
    string_from_pool_ref, FormulaError, StringStorage, Value, KIND_BOOL, KIND_EMPTY, KIND_NUMBER,
    KIND_STRING,
};

use super::criteria::WildcardPattern;
use super::value::{compare_text_case_insensitive, number_from_value};

/// A position or count argument. Excel truncates its fraction, so
/// `CHOOSE(1.5,…)` picks the first choice.
pub(super) fn integer_arg(value: &Value) -> Result<i32, FormulaError> {
    let number = number_from_value(value)?.trunc();
    if number < f64::from(i32::MIN) || number > f64::from(i32::MAX) {
        return Err(FormulaError::Value);
    }
    Ok(number as i32)
}

/// An argument that selects one of a few modes, such as a match type. Only
/// a whole number names a mode; an argument error is returned unchanged.
pub(super) fn option_code(value: &Value) -> Result<i32, FormulaError> {
    let number = number_from_value(value)?;
    if number.fract() != 0.0 || number < f64::from(i32::MIN) || number > f64::from(i32::MAX) {
        return Err(FormulaError::Value);
    }
    Ok(number as i32)
}

/// A 1-based position, truncated, as a 0-based index.
pub(super) fn positive_index(value: &Value) -> Result<usize, FormulaError> {
    let index = integer_arg(value)?;
    if index <= 0 {
        return Err(FormulaError::Value);
    }
    Ok(index as usize - 1)
}

/// Which part of a lookup range holds the search list.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ListPart {
    /// The whole range in row-major order (`MATCH`, `XMATCH`, `XLOOKUP`).
    Whole = 0,
    /// Column 0, top to bottom (`VLOOKUP`).
    FirstColumn = 1,
    /// Row 0, left to right (`HLOOKUP`).
    FirstRow = 2,
}

/// Search states per range group: one for each part.
const LIST_PARTS: usize = 3;

/// One list entry, borrowed from storage or from a value.
#[derive(Clone, Copy)]
pub(super) enum Entry<'a> {
    Blank,
    Number(f64),
    Text(&'a str),
    Bool(bool),
    Error(FormulaError),
}

impl<'a> Entry<'a> {
    pub(super) fn of(value: &'a Value) -> Self {
        match value {
            Value::Blank => Self::Blank,
            Value::Number(number) => Self::Number(*number),
            Value::Text(text) => Self::Text(text),
            Value::Bool(value) => Self::Bool(*value),
            Value::Error(error) => Self::Error(*error),
        }
    }

    /// A stored literal: the same value `literal_cell_value` builds.
    #[inline]
    fn literal(strings: &'a StringStorage, kind: u8, payload: u64) -> Self {
        match kind {
            KIND_NUMBER => {
                let number = payload_num(payload);
                if number.is_finite() {
                    Self::Number(number)
                } else {
                    Self::Error(FormulaError::Num)
                }
            }
            KIND_STRING => string_from_pool_ref(strings, crate::cells::payload_str_id(payload))
                .map_or(Self::Error(FormulaError::Ref), Self::Text),
            KIND_BOOL => Self::Bool(payload_num(payload) != 0.0),
            _ => Self::Blank,
        }
    }

    fn rank(self) -> u8 {
        match self {
            Self::Blank => 0,
            Self::Number(_) => 1,
            Self::Text(_) => 2,
            Self::Bool(_) => 3,
            Self::Error(_) => 4,
        }
    }

    /// The text a wildcard sees: numbers and logical values never match, and
    /// an error matches its sentinel such as `#N/A`.
    fn wildcard_text(self) -> Option<&'a str> {
        match self {
            Self::Text(text) => Some(text),
            Self::Blank => Some(""),
            Self::Error(error) => Some(error.sentinel()),
            Self::Number(_) | Self::Bool(_) => None,
        }
    }
}

/// The lookup order of two entries: text without case, an error on either
/// side fails, and otherwise the order of `compare_values`.
fn compare(left: Entry<'_>, right: Entry<'_>) -> Result<Ordering, FormulaError> {
    match (left, right) {
        (Entry::Text(left), Entry::Text(right)) => Ok(compare_text_case_insensitive(left, right)),
        (Entry::Error(error), _) | (_, Entry::Error(error)) => Err(error),
        (Entry::Blank, Entry::Blank) => Ok(Ordering::Equal),
        (Entry::Blank, Entry::Number(right)) => 0.0f64.partial_cmp(&right).ok_or(FormulaError::Num),
        (Entry::Number(left), Entry::Blank) => left.partial_cmp(&0.0).ok_or(FormulaError::Num),
        (Entry::Blank, Entry::Text(right)) => Ok("".cmp(right)),
        (Entry::Text(left), Entry::Blank) => Ok(left.cmp("")),
        (Entry::Blank, Entry::Bool(right)) => Ok(false.cmp(&right)),
        (Entry::Bool(left), Entry::Blank) => Ok(left.cmp(&false)),
        (Entry::Number(left), Entry::Number(right)) => {
            left.partial_cmp(&right).ok_or(FormulaError::Num)
        }
        (Entry::Bool(left), Entry::Bool(right)) => Ok(left.cmp(&right)),
        _ => Ok(left.rank().cmp(&right.rank())),
    }
}

/// A search list: a range's literal sources read in place, or values.
/// Matching on the list kind per entry keeps one copy of every search.
pub(super) enum ListView<'a> {
    /// Entry `i` is the slot `first + i * step` of a dense sheet's sources.
    Storage {
        kinds: &'a [u8],
        payloads: &'a [u64],
        strings: &'a StringStorage,
        first: usize,
        step: usize,
        len: usize,
    },
    Values(&'a [Value]),
}

impl ListView<'_> {
    fn len(&self) -> usize {
        match self {
            Self::Storage { len, .. } => *len,
            Self::Values(values) => values.len(),
        }
    }

    #[inline]
    fn entry(&self, position: usize) -> Entry<'_> {
        match self {
            Self::Storage {
                kinds,
                payloads,
                strings,
                first,
                step,
                ..
            } => {
                let index = first + position * step;
                Entry::literal(strings, kinds[index], payloads[index])
            }
            Self::Values(values) => Entry::of(&values[position]),
        }
    }
}

/// The value domain a list lives in. A list whose entries all fall in one
/// domain compares like a total order, so its boundaries are well defined.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UniformKind {
    Numeric,
    Text,
    Logical,
}

/// What one pass knows about a search list that several formulas read: the
/// sorted flags, the value domain and the exact-match index, each built on
/// first use.
#[derive(Default)]
pub(crate) struct SearchState {
    ascending: Option<Result<bool, FormulaError>>,
    descending: Option<Result<bool, FormulaError>>,
    kind: Option<Option<UniformKind>>,
    exact: Option<Option<ExactIndex>>,
}

impl SearchState {
    fn sorted_ok(&mut self, list: &ListView<'_>, search_mode: i32) -> Result<bool, FormulaError> {
        let requires_ascending = search_mode == 2;
        let slot = if requires_ascending {
            &mut self.ascending
        } else {
            &mut self.descending
        };
        *slot.get_or_insert_with(|| monotonicity_walk(list, requires_ascending))
    }

    fn uniform_kind(&mut self, list: &ListView<'_>) -> Option<UniformKind> {
        *self.kind.get_or_insert_with(|| classify(list))
    }

    /// Whether the boundary search can answer for `key`: the list is one
    /// comparison domain, ascending, and the key belongs to that domain.
    fn boundary_gate(&mut self, list: &ListView<'_>, key: Entry<'_>) -> bool {
        let Some(kind) = self.uniform_kind(list) else {
            return false;
        };
        key_fits_domain(key, kind) && matches!(self.sorted_ok(list, 2), Ok(true))
    }

    fn exact_index(&mut self, list: &ListView<'_>) -> Option<&ExactIndex> {
        self.exact
            .get_or_insert_with(|| ExactIndex::build(list))
            .as_ref()
    }
}

/// Searches `list` with the plain scan's rules. With `state`, the second and
/// later searches of the pass use the index where it proves the same answer.
pub(super) fn find_match(
    list: &ListView<'_>,
    key: &Value,
    match_mode: i32,
    search_mode: i32,
    state: Option<&mut SearchState>,
) -> Result<Option<usize>, FormulaError> {
    if list.len() == 0 {
        return Ok(None);
    }

    // Only a list several formulas read has a state, so its index pays off
    // from the first search; a list read once keeps the plain scan.
    let use_index = state.is_some();
    let mut single = SearchState::default();
    let state = state.unwrap_or(&mut single);
    if search_mode.abs() == 2 && !state.sorted_ok(list, search_mode)? {
        return Ok(None);
    }

    let key = Entry::of(key);
    let search_reverse = search_mode < 0;
    if match_mode == 2 {
        return wildcard_scan(list, key, search_reverse);
    }
    if let Some(found) = exact_match(list, key, search_reverse, use_index, state)? {
        return Ok(Some(found));
    }
    if !matches!(match_mode, -1 | 1) {
        return Ok(None);
    }
    if use_index && state.boundary_gate(list, key) {
        return approximate_boundary(list, key, match_mode);
    }
    approximate_scan(list, key, match_mode)
}

/// First (or last) exactly equal position. The boundary search answers on an
/// ascending single-domain list, the class index on any other list without
/// an error, and the plain scan decides everything else, including its error
/// order.
fn exact_match(
    list: &ListView<'_>,
    key: Entry<'_>,
    search_reverse: bool,
    use_index: bool,
    state: &mut SearchState,
) -> Result<Option<usize>, FormulaError> {
    if use_index {
        if state.boundary_gate(list, key) {
            let lower = first_not_below(list, key)?;
            let upper = first_above(list, key)?;
            if lower < upper {
                return Ok(Some(if search_reverse { upper - 1 } else { lower }));
            }
            return Ok(None);
        }
        if let Some(found) = state
            .exact_index(list)
            .and_then(|index| index.find(list, key, search_reverse))
        {
            return Ok(found);
        }
    }

    let equal = |position: usize| -> Result<bool, FormulaError> {
        Ok(compare(list.entry(position), key)? == Ordering::Equal)
    };
    if search_reverse {
        for position in (0..list.len()).rev() {
            if equal(position)? {
                return Ok(Some(position));
            }
        }
    } else {
        for position in 0..list.len() {
            if equal(position)? {
                return Ok(Some(position));
            }
        }
    }
    Ok(None)
}

/// Nearest value across the key, on the side `match_mode` asks for, at the
/// first position of the nearest value.
fn approximate_scan(
    list: &ListView<'_>,
    key: Entry<'_>,
    match_mode: i32,
) -> Result<Option<usize>, FormulaError> {
    let mut best: Option<usize> = None;
    for position in 0..list.len() {
        let candidate = list.entry(position);
        let ordering = compare(candidate, key)?;
        let is_eligible = if match_mode == -1 {
            ordering == Ordering::Less
        } else {
            ordering == Ordering::Greater
        };
        if !is_eligible {
            continue;
        }

        let replaces = match best {
            None => true,
            Some(current) => {
                let versus = compare(candidate, list.entry(current))?;
                if match_mode == -1 {
                    versus == Ordering::Greater
                } else {
                    versus == Ordering::Less
                }
            }
        };
        if replaces {
            best = Some(position);
        }
    }
    Ok(best)
}

/// The plain scan's pair walk: the first non-monotone pair is `Ok(false)`,
/// the first failed comparison is its error, and a clean walk is `Ok(true)`.
fn monotonicity_walk(list: &ListView<'_>, requires_ascending: bool) -> Result<bool, FormulaError> {
    let violation = if requires_ascending {
        Ordering::Greater
    } else {
        Ordering::Less
    };
    for position in 1..list.len() {
        if compare(list.entry(position - 1), list.entry(position))? == violation {
            return Ok(false);
        }
    }
    Ok(true)
}

/// First (or last) wildcard match. A non-text key matches nothing.
fn wildcard_scan(
    list: &ListView<'_>,
    key: Entry<'_>,
    search_reverse: bool,
) -> Result<Option<usize>, FormulaError> {
    let Entry::Text(pattern) = key else {
        return Ok(None);
    };
    let pattern = WildcardPattern::new(pattern)?;
    let matches = |position: usize| {
        list.entry(position)
            .wildcard_text()
            .is_some_and(|text| pattern.matches_text(text))
    };
    Ok(if search_reverse {
        (0..list.len()).rev().find(|&position| matches(position))
    } else {
        (0..list.len()).find(|&position| matches(position))
    })
}

/// Nearest value across the key on an ascending, single-domain list. Equal
/// neighbours are contiguous there, so the first position not below the key
/// and the first position above it bound the equal run; without an equal
/// entry the answer is the first position of the nearest value.
fn approximate_boundary(
    list: &ListView<'_>,
    key: Entry<'_>,
    match_mode: i32,
) -> Result<Option<usize>, FormulaError> {
    let lower = first_not_below(list, key)?;
    let upper = first_above(list, key)?;
    if match_mode == -1 {
        if lower == 0 {
            return Ok(None);
        }
        return Ok(Some(first_not_below(list, list.entry(lower - 1))?));
    }
    if upper == list.len() {
        return Ok(None);
    }
    Ok(Some(upper))
}

/// First position whose entry is not below `probe`.
fn first_not_below(list: &ListView<'_>, probe: Entry<'_>) -> Result<usize, FormulaError> {
    let (mut low, mut high) = (0, list.len());
    while low < high {
        let middle = low + (high - low) / 2;
        if compare(list.entry(middle), probe)? == Ordering::Less {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    Ok(low)
}

/// First position whose entry is above `probe`.
fn first_above(list: &ListView<'_>, probe: Entry<'_>) -> Result<usize, FormulaError> {
    let (mut low, mut high) = (0, list.len());
    while low < high {
        let middle = low + (high - low) / 2;
        if compare(list.entry(middle), probe)? == Ordering::Greater {
            high = middle;
        } else {
            low = middle + 1;
        }
    }
    Ok(low)
}

/// Whether the key belongs to the list's value domain. A key from another
/// domain can compare below one entry and above its neighbour, which breaks
/// the boundary search, so those keys use another path.
fn key_fits_domain(key: Entry<'_>, kind: UniformKind) -> bool {
    match key {
        Entry::Blank => true,
        Entry::Number(number) => kind == UniformKind::Numeric && !number.is_nan(),
        Entry::Text(_) => kind == UniformKind::Text,
        Entry::Bool(_) => kind == UniformKind::Logical,
        Entry::Error(_) => false,
    }
}

/// The domain every entry shares, or `None` when the list mixes domains or
/// holds an error or NaN. Blanks belong to every domain.
fn classify(list: &ListView<'_>) -> Option<UniformKind> {
    let mut found: Option<UniformKind> = None;
    for position in 0..list.len() {
        let kind = match list.entry(position) {
            Entry::Blank => continue,
            Entry::Number(number) if !number.is_nan() => UniformKind::Numeric,
            Entry::Text(_) => UniformKind::Text,
            Entry::Bool(_) => UniformKind::Logical,
            _ => return None,
        };
        match found {
            None => found = Some(kind),
            Some(existing) if existing == kind => {}
            Some(_) => return None,
        }
    }
    found
}

/// Exact-match classes. Two entries share a class and value exactly when
/// the lookup order calls them equal within one type; blank equals `0`,
/// `""` and `FALSE` across types, so a key looks in each class it can equal.
const CLASS_BLANK: u8 = 0;
const CLASS_EMPTY_TEXT: u8 = 1;
const CLASS_NUMBER: u8 = 2;
const CLASS_TEXT: u8 = 3;
const CLASS_BOOL: u8 = 4;

/// One list position under its class and value. A number value is its bits
/// with `-0` as `0`, text its case-folded rank, and a logical 0 or 1.
#[derive(Clone, Copy)]
struct IndexEntry {
    class: u8,
    value: u64,
    position: u32,
}

/// Every position sorted by class, value and position, so an equal run is
/// contiguous and its ends are its first and last position. Text is ranked
/// once by its case-folded order, so the main sort compares integers only.
struct ExactIndex {
    entries: Vec<IndexEntry>,
    /// One position per distinct case-folded text, in rank order.
    texts: Vec<u32>,
}

impl ExactIndex {
    /// The index of `list`, or `None` for a list with an error or NaN, whose
    /// scan order must decide.
    fn build(list: &ListView<'_>) -> Option<Self> {
        let mut entries = Vec::with_capacity(list.len());
        let mut text_positions = Vec::new();
        for position in 0..list.len() {
            let (class, value) = match list.entry(position) {
                Entry::Error(_) => return None,
                Entry::Number(number) if number.is_nan() => return None,
                Entry::Blank => (CLASS_BLANK, 0),
                Entry::Number(number) => (CLASS_NUMBER, number_value(number)),
                Entry::Text("") => (CLASS_EMPTY_TEXT, 0),
                Entry::Text(_) => {
                    text_positions.push(position as u32);
                    (CLASS_TEXT, 0)
                }
                Entry::Bool(value) => (CLASS_BOOL, u64::from(value)),
            };
            entries.push(IndexEntry {
                class,
                value,
                position: position as u32,
            });
        }

        let text_of = |position: u32| match list.entry(position as usize) {
            Entry::Text(text) => text,
            _ => "",
        };
        merge_sort(&mut text_positions, &mut |left, right| {
            compare_text_case_insensitive(text_of(left), text_of(right))
        });
        let mut texts: Vec<u32> = Vec::new();
        for &position in &text_positions {
            let distinct = texts.last().is_none_or(|&last| {
                compare_text_case_insensitive(text_of(last), text_of(position)) != Ordering::Equal
            });
            if distinct {
                texts.push(position);
            }
            entries[position as usize].value = (texts.len() - 1) as u64;
        }
        drop(text_positions);

        let mut order: Vec<u32> = (0..entries.len() as u32).collect();
        merge_sort(&mut order, &mut |left, right| {
            let (left, right) = (entries[left as usize], entries[right as usize]);
            (left.class, left.value).cmp(&(right.class, right.value))
        });
        let entries = order.iter().map(|&index| entries[index as usize]).collect();
        Some(Self { entries, texts })
    }

    /// The first (or last) position equal to `key`, or `None` for a key the
    /// index does not classify (an error or NaN), which keeps the plain scan.
    fn find(
        &self,
        list: &ListView<'_>,
        key: Entry<'_>,
        search_reverse: bool,
    ) -> Option<Option<usize>> {
        let mut found: Option<usize> = None;
        let mut consider = |class: u8, value: u64| {
            let start = self
                .entries
                .partition_point(|entry| (entry.class, entry.value) < (class, value));
            let end = start
                + self.entries[start..]
                    .partition_point(|entry| (entry.class, entry.value) == (class, value));
            if start == end {
                return;
            }
            let position = if search_reverse {
                self.entries[end - 1].position
            } else {
                self.entries[start].position
            } as usize;
            found = Some(match found {
                None => position,
                Some(current) if search_reverse => current.max(position),
                Some(current) => current.min(position),
            });
        };

        match key {
            Entry::Blank => {
                consider(CLASS_BLANK, 0);
                consider(CLASS_NUMBER, 0);
                consider(CLASS_EMPTY_TEXT, 0);
                consider(CLASS_BOOL, 0);
            }
            Entry::Bool(false) => {
                consider(CLASS_BOOL, 0);
                consider(CLASS_BLANK, 0);
            }
            Entry::Bool(true) => consider(CLASS_BOOL, 1),
            Entry::Text("") => {
                consider(CLASS_EMPTY_TEXT, 0);
                consider(CLASS_BLANK, 0);
            }
            Entry::Text(text) => {
                let rank =
                    self.texts
                        .binary_search_by(|&position| match list.entry(position as usize) {
                            Entry::Text(stored) => compare_text_case_insensitive(stored, text),
                            _ => Ordering::Less,
                        });
                if let Ok(rank) = rank {
                    consider(CLASS_TEXT, rank as u64);
                }
            }
            Entry::Number(number) if !number.is_nan() => {
                consider(CLASS_NUMBER, number_value(number));
                if number == 0.0 {
                    consider(CLASS_BLANK, 0);
                }
            }
            _ => return None,
        }
        Some(found)
    }

    fn add_memory_stats(&self, stats: &mut crate::memory::MemoryOwnerStats) {
        stats.add_vec::<IndexEntry>(self.entries.len(), self.entries.capacity());
        stats.add_vec::<u32>(self.texts.len(), self.texts.capacity());
    }
}

/// A number's index value: its bits, with `-0` folded into `0`.
fn number_value(number: f64) -> u64 {
    if number == 0.0 {
        0
    } else {
        number.to_bits()
    }
}

/// A stable bottom-up merge sort. One copy serves every comparator, so the
/// index adds no generic sort to the module.
fn merge_sort(items: &mut [u32], compare: &mut dyn FnMut(u32, u32) -> Ordering) {
    let len = items.len();
    let mut scratch = vec![0u32; len];
    let mut width = 1;
    while width < len {
        let mut start = 0;
        while start < len {
            let middle = (start + width).min(len);
            let end = (start + 2 * width).min(len);
            let (mut left, mut right, mut write) = (start, middle, start);
            while left < middle && right < end {
                if compare(items[right], items[left]).is_lt() {
                    scratch[write] = items[right];
                    right += 1;
                } else {
                    scratch[write] = items[left];
                    left += 1;
                }
                write += 1;
            }
            scratch[write..write + middle - left].copy_from_slice(&items[left..middle]);
            write += middle - left;
            scratch[write..write + end - right].copy_from_slice(&items[right..end]);
            start = end;
        }
        items.copy_from_slice(&scratch);
        width *= 2;
    }
}

/// The search states of one pass, by range group and list part. `slots` maps
/// a key to its state and is valid only where `states` holds that key, so a
/// pass clears only `states`.
#[derive(Default)]
pub(crate) struct LookupStates {
    slots: Vec<u32>,
    states: Vec<(u32, LookupRangeState)>,
}

/// What one pass knows about a lookup range: its storage check and the
/// search state of its list.
#[derive(Default)]
pub(crate) struct LookupRangeState {
    pub(super) source: Option<Result<Option<StorageRange>, FormulaError>>,
    pub(super) search: SearchState,
}

impl LookupStates {
    /// The state of `group` and `part`, created on first use. `groups` is
    /// the index's group count.
    pub(super) fn get(
        &mut self,
        group: usize,
        groups: usize,
        part: ListPart,
    ) -> &mut LookupRangeState {
        let key = group * LIST_PARTS + part as usize;
        let slots = groups * LIST_PARTS;
        if self.slots.len() != slots {
            self.slots.resize(slots, 0);
            self.slots.shrink_to_fit();
        }

        let slot = self.slots[key] as usize;
        if self
            .states
            .get(slot)
            .is_none_or(|(stored, _)| *stored as usize != key)
        {
            self.slots[key] = self.states.len() as u32;
            self.states.push((key as u32, LookupRangeState::default()));
        }
        let slot = self.slots[key] as usize;
        &mut self.states[slot].1
    }

    /// Drops this pass's states; the slot array stays for the next pass.
    pub(crate) fn clear(&mut self) {
        self.states.clear();
    }

    /// Releases a wide pass's state list.
    pub(crate) fn release(&mut self) {
        self.states = Vec::new();
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut crate::memory::MemoryOwnerStats) {
        stats.add_vec::<u32>(self.slots.len(), self.slots.capacity());
        stats.add_vec::<(u32, LookupRangeState)>(self.states.len(), self.states.capacity());
        for (_, state) in &self.states {
            if let Some(Some(index)) = &state.search.exact {
                index.add_memory_stats(stats);
            }
        }
    }
}

/// A clamped range of literal sources on a dense sheet, which lookups read
/// in place. `first` is the slot of its top-left cell.
#[derive(Clone, Copy)]
pub(crate) struct StorageRange {
    pub(super) sheet: usize,
    pub(super) first: usize,
    pub(super) rows: usize,
    pub(super) cols: usize,
    pub(super) row_count: usize,
}

use super::matrix::{optional_ast, range_from_ast, EvalMatrix, SPILL_MAX_BYTES};
use super::{bool_from_value, lookup_modes, EvalPass};
use crate::calc::{Ast, Func};
use crate::store::CellStore;
use crate::types::{CellRange, EvalResult, FORMULA_RECURSION_LIMIT};

/// A lookup argument: a range read in place, or the values of anything else.
enum LookupArg {
    Storage {
        range: StorageRange,
        /// The pass state of a range several formulas read.
        shared: Option<(usize, usize)>,
    },
    Values {
        rows: usize,
        cols: usize,
        values: Vec<Value>,
    },
}

impl LookupArg {
    fn shape(&self) -> (usize, usize) {
        match self {
            Self::Storage { range, .. } => (range.rows, range.cols),
            Self::Values { rows, cols, .. } => (*rows, *cols),
        }
    }

    /// The number of cells, for `XLOOKUP`'s length check.
    fn len(&self) -> usize {
        let (rows, cols) = self.shape();
        rows * cols
    }

    /// The value at row-major `row` and `col`, with `EvalMatrix::get`'s bounds.
    fn cell(&self, store: &CellStore, row: usize, col: usize) -> Option<Value> {
        let (rows, cols) = self.shape();
        if row >= rows || col >= cols {
            return None;
        }
        match self {
            Self::Storage { range, .. } => {
                let sources = store.sheets[range.sheet].cells.dense_sources()?;
                let (kinds, payloads) = sources.raw();
                let index = range.first + col * range.row_count + row;
                Some(super::literal_cell_value(
                    &store.strings,
                    kinds[index],
                    payloads[index],
                ))
            }
            Self::Values { values, .. } => values.get(row * cols + col).cloned(),
        }
    }

    /// The value at a row-major position.
    fn value(&self, store: &CellStore, position: usize) -> Option<Value> {
        let (_, cols) = self.shape();
        self.cell(store, position / cols, position % cols)
    }
}

impl CellStore {
    /// `INDEX`, `MATCH`, `XMATCH`, `VLOOKUP`, `HLOOKUP` and `XLOOKUP`. See
    /// `eval_func` for why families live in out-of-line `*_family` handlers.
    #[inline(never)]
    pub(super) fn eval_lookup_family(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> EvalResult {
        self.eval_lookup(func, args, sheet, pass, depth)
            .unwrap_or_else(Value::Error)
    }

    fn eval_lookup(
        &self,
        func: Func,
        args: &[Ast],
        sheet: usize,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<Value, FormulaError> {
        let scalar =
            |ast: &Ast, pass: &mut EvalPass<'_>| self.eval_ast(ast, sheet, pass, depth + 1);
        match func {
            Func::Index => Ok(self.eval_index(args, sheet, pass, depth)),
            Func::Match => {
                if !(2..=3).contains(&args.len()) {
                    return Err(FormulaError::Value);
                }
                let key = scalar(&args[0], pass);
                if let Value::Error(error) = key {
                    return Err(error);
                }
                let lookup = self.lookup_arg(&args[1], sheet, ListPart::Whole, pass, depth + 1)?;
                let (lookup_rows, lookup_cols) = lookup.shape();
                if lookup_rows != 1 && lookup_cols != 1 {
                    return Err(FormulaError::Na);
                }
                let mode = optional_ast(args, 2)
                    .map(|arg| scalar(arg, pass))
                    .map_or(Ok(1), |value| option_code(&value));
                let (match_mode, search_mode) = match mode? {
                    1 => (-1, 2),
                    -1 => (1, -2),
                    0 => (0, 1),
                    _ => return Err(FormulaError::Value),
                };
                self.search_lookup_arg(
                    &lookup,
                    ListPart::Whole,
                    &key,
                    match_mode,
                    search_mode,
                    pass,
                )
                .map(|found| {
                    found.map_or(Value::Error(FormulaError::Na), |index| {
                        Value::number((index + 1) as f64)
                    })
                })
            }
            Func::XMatch => {
                if !(2..=4).contains(&args.len()) {
                    return Err(FormulaError::Value);
                }
                let key = scalar(&args[0], pass);
                if let Value::Error(error) = key {
                    return Err(error);
                }
                let lookup = self.lookup_arg(&args[1], sheet, ListPart::Whole, pass, depth + 1)?;
                let (lookup_rows, lookup_cols) = lookup.shape();
                if lookup_rows != 1 && lookup_cols != 1 {
                    return Err(FormulaError::Value);
                }
                let (match_mode, search_mode) = lookup_modes(
                    optional_ast(args, 2).map(|arg| scalar(arg, pass)),
                    optional_ast(args, 3).map(|arg| scalar(arg, pass)),
                )?;
                self.search_lookup_arg(
                    &lookup,
                    ListPart::Whole,
                    &key,
                    match_mode,
                    search_mode,
                    pass,
                )
                .map(|found| {
                    found.map_or(Value::Error(FormulaError::Na), |index| {
                        Value::number((index + 1) as f64)
                    })
                })
            }
            Func::VLookup | Func::HLookup => {
                if !(3..=4).contains(&args.len()) {
                    return Err(FormulaError::Value);
                }
                let key = scalar(&args[0], pass);
                if let Value::Error(error) = key {
                    return Err(error);
                }
                let part = if func == Func::VLookup {
                    ListPart::FirstColumn
                } else {
                    ListPart::FirstRow
                };
                let table = self.lookup_arg(&args[1], sheet, part, pass, depth + 1)?;
                let result_index = positive_index(&scalar(&args[2], pass))?;
                let sorted = match optional_ast(args, 3) {
                    Some(arg) => bool_from_value(&scalar(arg, pass))?,
                    None => true,
                };
                let (match_mode, search_mode) = if sorted { (-1, 2) } else { (0, 1) };
                self.search_lookup_arg(&table, part, &key, match_mode, search_mode, pass)
                    .map(|found| {
                        let Some(found) = found else {
                            return Value::Error(FormulaError::Na);
                        };
                        let cell = if func == Func::VLookup {
                            table.cell(self, found, result_index)
                        } else {
                            table.cell(self, result_index, found)
                        };
                        cell.unwrap_or(Value::Error(FormulaError::Ref))
                    })
            }
            Func::XLookup => {
                if !(3..=6).contains(&args.len()) {
                    return Err(FormulaError::Value);
                }
                let key = scalar(&args[0], pass);
                if let Value::Error(error) = key {
                    return Err(error);
                }
                let lookup = self.lookup_arg(&args[1], sheet, ListPart::Whole, pass, depth + 1)?;
                let result = self.lookup_arg(&args[2], sheet, ListPart::Whole, pass, depth + 1)?;
                let (lookup_rows, lookup_cols) = lookup.shape();
                if lookup.len() != result.len() || (lookup_rows != 1 && lookup_cols != 1) {
                    return Err(FormulaError::Value);
                }
                let (match_mode, search_mode) = lookup_modes(
                    optional_ast(args, 4).map(|arg| scalar(arg, pass)),
                    optional_ast(args, 5).map(|arg| scalar(arg, pass)),
                )?;
                match self.search_lookup_arg(
                    &lookup,
                    ListPart::Whole,
                    &key,
                    match_mode,
                    search_mode,
                    pass,
                ) {
                    Ok(Some(index)) => Ok(result
                        .value(self, index)
                        .unwrap_or(Value::Error(FormulaError::Ref))),
                    Ok(None) => Ok(optional_ast(args, 3)
                        .map_or(Value::Error(FormulaError::Na), |arg| scalar(arg, pass))),
                    Err(error) => Err(error),
                }
            }
            _ => Err(FormulaError::Value),
        }
    }

    /// Searches the `part` list of `arg`: in place for a stored range, with
    /// its pass state when several formulas read it.
    fn search_lookup_arg(
        &self,
        arg: &LookupArg,
        part: ListPart,
        key: &Value,
        match_mode: i32,
        search_mode: i32,
        pass: &mut EvalPass<'_>,
    ) -> Result<Option<usize>, FormulaError> {
        match arg {
            LookupArg::Storage { range, shared } => {
                let Some(sources) = self.sheets[range.sheet].cells.dense_sources() else {
                    return Err(FormulaError::Value);
                };
                let (kinds, payloads) = sources.raw();
                let (step, len) = match part {
                    ListPart::FirstColumn => (1, range.rows),
                    ListPart::FirstRow => (range.row_count, range.cols),
                    ListPart::Whole if range.rows == 1 => (range.row_count, range.cols),
                    ListPart::Whole => (1, range.rows * range.cols),
                };
                let list = ListView::Storage {
                    kinds,
                    payloads,
                    strings: &self.strings,
                    first: range.first,
                    step,
                    len,
                };
                let state = shared.map(|(group, groups)| {
                    &mut pass.results.lookup_states().get(group, groups, part).search
                });
                find_match(&list, key, match_mode, search_mode, state)
            }
            LookupArg::Values { rows, cols, values } => {
                let first_column;
                let list: &[Value] = match part {
                    ListPart::Whole => values,
                    ListPart::FirstColumn => {
                        first_column = (0..*rows)
                            .filter_map(|row| values.get(row * cols))
                            .cloned()
                            .collect::<Vec<_>>();
                        &first_column
                    }
                    ListPart::FirstRow => &values[..(*cols).min(values.len())],
                };
                find_match(&ListView::Values(list), key, match_mode, search_mode, None)
            }
        }
    }

    /// Reads a lookup argument. A range of literal sources on a dense sheet
    /// is kept in place, after the checks `eval_range_matrix` makes; anything
    /// else is evaluated into values for this lookup.
    fn lookup_arg(
        &self,
        ast: &Ast,
        sheet: usize,
        part: ListPart,
        pass: &mut EvalPass<'_>,
        depth: usize,
    ) -> Result<LookupArg, FormulaError> {
        if let Some(range) = range_from_ast(ast, sheet) {
            let shared = self
                .graph
                .index()
                .and_then(|index| index.shared_range_group(range));
            let source = match shared {
                Some((group, groups)) => {
                    let state = pass.results.lookup_states().get(group, groups, part);
                    *state
                        .source
                        .get_or_insert_with(|| self.storage_range(range, depth))
                }
                None => self.storage_range(range, depth),
            };
            if let Some(range) = source? {
                return Ok(LookupArg::Storage { range, shared });
            }
        }

        let matrix: EvalMatrix = self.eval_matrix_arg(ast, sheet, pass, depth)?;
        let rows = matrix.rows;
        let cols = matrix.cols;
        let mut matrix = matrix;
        let values = std::mem::take(&mut matrix.values);
        Ok(LookupArg::Values { rows, cols, values })
    }

    /// `range` clamped to the sheet, when every cell is a literal source of a
    /// dense sheet. The structural, shape and byte checks and their errors
    /// are those of `eval_range_matrix`. `Ok(None)` is a range with a formula
    /// or spill cell, paged storage, or a depth past the literal fast path.
    fn storage_range(
        &self,
        range: CellRange,
        depth: usize,
    ) -> Result<Option<StorageRange>, FormulaError> {
        let sheet = range.sheet as usize;
        let Some(data) = self.sheets.get(sheet) else {
            return Err(FormulaError::Ref);
        };
        if data.cells.row_count() == 0
            || data.cells.n_cols() == 0
            || range.row_start as usize >= data.cells.row_count()
            || range.col_start as usize >= data.cells.n_cols()
        {
            return Err(FormulaError::Ref);
        }

        let row_start = range.row_start as usize;
        let col_start = range.col_start as usize;
        let row_end = (range.row_end as usize).min(data.cells.row_count() - 1);
        let col_end = (range.col_end as usize).min(data.cells.n_cols() - 1);
        let rows = row_end - row_start + 1;
        let cols = col_end - col_start + 1;
        let total = EvalMatrix::validate_shape(rows, cols, 1, 0)?;
        let (Some(sources), true) = (data.cells.dense_sources(), depth < FORMULA_RECURSION_LIMIT)
        else {
            return Ok(None);
        };

        let (kinds, payloads) = sources.raw();
        let mut payload_bytes = total
            .checked_mul(std::mem::size_of::<Value>())
            .ok_or(FormulaError::Num)?;
        for col in col_start..=col_end {
            let column = data.cells.idx(row_start, col);
            for index in column..column + rows {
                match kinds[index] {
                    KIND_EMPTY | KIND_NUMBER | KIND_BOOL => {}
                    KIND_STRING => {
                        let id = crate::cells::payload_str_id(payloads[index]);
                        if let Some(text) = string_from_pool_ref(&self.strings, id) {
                            payload_bytes = payload_bytes
                                .checked_add(text.len())
                                .ok_or(FormulaError::Num)?;
                        }
                    }
                    _ => return Ok(None),
                }
            }
        }
        if payload_bytes > SPILL_MAX_BYTES {
            return Err(FormulaError::Num);
        }

        Ok(Some(StorageRange {
            sheet,
            first: data.cells.idx(row_start, col_start),
            rows,
            cols,
            row_count: data.cells.row_count(),
        }))
    }
}
