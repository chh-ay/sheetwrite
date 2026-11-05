//! Key resolution for one-to-many table relationships (#229).
//!
//! A [`KeyIndex`] holds the non-blank keys of the one side, sorted, with the
//! one-side row of each key. Building it also maps every many-side row to
//! its one-side row in one pass, so readers index a flat `Vec<u32>`. Keys
//! match as pivot group keys do: numbers by value and text
//! without case. Unlike a group key, a blank key matches nothing, so blank,
//! `0` and `FALSE` stay apart.
//!
//! The index is flat: number keys in one `Vec<f64>`, text keys case-folded
//! into one byte buffer with end offsets, and one parallel `Vec<u32>` of
//! rows. There is no hash map and no per-key allocation.

use std::cmp::Ordering;

use crate::types::Value;

/// A many-side row whose key matches no one-side row.
pub(crate) const NO_MATCH: u32 = u32::MAX;
/// A many-side row whose key is blank, which matches nothing.
pub(crate) const BLANK_KEY: u32 = u32::MAX - 1;
/// A many-side row whose key is an error; reading the key gives the error.
pub(crate) const KEY_ERROR: u32 = u32::MAX - 2;

/// Why a relationship cannot resolve keys. Rows are data-row offsets in
/// their table, header excluded.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum KeyProblem {
    /// The one-side key at `row` is not of the column's key kind: a boolean,
    /// an error, or a number among text keys (or text among numbers).
    OneSideType { row: u32 },
    /// The many-side key at `row` is a boolean, or not of the one side's kind.
    ManySideType { row: u32 },
    /// Two one-side rows hold equal keys; `first < second`.
    DuplicateKey { first: u32, second: u32 },
}

/// The kind of the non-blank keys of one column.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum KeyKind {
    /// Only blank keys so far; matches either kind.
    Empty,
    Number,
    Text,
}

/// A key value that can take part in matching.
enum Key<'a> {
    Blank,
    Number(f64),
    Text(&'a str),
    /// A boolean or an error.
    Other,
}

/// One key cell as the key reader returns it: literal text borrowed from the
/// string pool with its pool id, so mapping 100,000 text keys allocates
/// nothing, or any other cell as its settled value.
pub(crate) enum KeyCell<'a> {
    Text(&'a str, u32),
    Value(Value),
}

/// A pool id whose key has not been searched yet.
const UNSEARCHED: u32 = u32::MAX - 3;

fn key_of_cell<'a>(cell: &'a KeyCell<'_>) -> Key<'a> {
    match cell {
        KeyCell::Text("", _) | KeyCell::Value(Value::Blank) => Key::Blank,
        KeyCell::Text(text, _) => Key::Text(text),
        KeyCell::Value(Value::Text(text)) if text.is_empty() => Key::Blank,
        KeyCell::Value(Value::Text(text)) => Key::Text(text),
        // Negative zero equals zero, so both sort as zero.
        KeyCell::Value(Value::Number(number)) if *number == 0.0 => Key::Number(0.0),
        KeyCell::Value(Value::Number(number)) => Key::Number(*number),
        KeyCell::Value(Value::Bool(_) | Value::Error(_)) => Key::Other,
    }
}

/// Appends the case-folded bytes of `text` to `buffer`. ASCII folds in place
/// without allocating; other text uses `str::to_lowercase`, the rule pivot
/// group keys use, so both features put the same keys together.
fn fold_into(text: &str, buffer: &mut Vec<u8>) {
    if text.is_ascii() {
        buffer.extend(text.bytes().map(|byte| byte.to_ascii_lowercase()));
    } else {
        buffer.extend_from_slice(text.to_lowercase().as_bytes());
    }
}

/// Merges the kind of one more key into the column's kind. Returns `None`
/// when the key does not fit the kind.
fn merge_kind(kind: KeyKind, key: &Key<'_>) -> Option<KeyKind> {
    match (kind, key) {
        (_, Key::Blank) => Some(kind),
        (KeyKind::Empty | KeyKind::Number, Key::Number(_)) => Some(KeyKind::Number),
        (KeyKind::Empty | KeyKind::Text, Key::Text(_)) => Some(KeyKind::Text),
        _ => None,
    }
}

/// Sorted one-side keys of a relationship.
#[derive(Debug, Default)]
pub(crate) struct KeyIndex {
    /// Sorted number keys; empty for text keys.
    numbers: Vec<f64>,
    /// Sorted case-folded text keys, concatenated; empty for number keys.
    text: Vec<u8>,
    /// End offset of each text key in `text`.
    text_ends: Vec<u32>,
    /// One-side row of each sorted key.
    rows: Vec<u32>,
    /// For integer keys in a compact span: the sorted position of key
    /// `numbers[0] + i` at `i`, or [`NO_MATCH`]. Empty otherwise. IDs are
    /// usually such keys, and a direct read replaces the binary search.
    dense: Vec<u32>,
}

impl KeyIndex {
    /// Builds the index of the one-side keys `one(0..one_rows)`, and the
    /// row map of the many-side keys `many(0..many_rows)` against it.
    pub(crate) fn build<'s>(
        one_rows: u32,
        one: impl Fn(u32) -> KeyCell<'s>,
        many_rows: u32,
        many: impl Fn(u32) -> KeyCell<'s>,
    ) -> Result<(Self, Vec<u32>), KeyProblem> {
        let mut kind = KeyKind::Empty;
        let mut numbers = Vec::new();
        let mut text = Vec::new();
        let mut text_ends = Vec::new();
        let mut rows = Vec::new();
        for row in 0..one_rows {
            let cell = one(row);
            let key = key_of_cell(&cell);
            kind = merge_kind(kind, &key).ok_or(KeyProblem::OneSideType { row })?;
            match key {
                Key::Number(number) => numbers.push(number),
                Key::Text(key) => {
                    fold_into(key, &mut text);
                    text_ends.push(text.len() as u32);
                }
                Key::Blank | Key::Other => continue,
            }
            rows.push(row);
        }

        let index = match kind {
            KeyKind::Number => Self::sorted_numbers(numbers, rows),
            KeyKind::Text => Self::sorted_text(&text, &text_ends, rows),
            KeyKind::Empty => Self::default(),
        };
        let map = index.map_rows(kind, many_rows, many)?;
        index.check_unique()?;
        Ok((index, map))
    }

    /// The one-side row of each many-side key `values(0..rows)`, in row
    /// order, or [`NO_MATCH`], [`BLANK_KEY`] or [`KEY_ERROR`]. Checks that
    /// the keys fit `kind`. Errors are allowed: the flattened row then
    /// carries the error, as a lookup would.
    fn map_rows<'s>(
        &self,
        kind: KeyKind,
        rows: u32,
        values: impl Fn(u32) -> KeyCell<'s>,
    ) -> Result<Vec<u32>, KeyProblem> {
        let mut kind = kind;
        let mut scratch = Vec::new();
        // The one-side row of each string pool id seen so far, indexed by
        // id: many-side keys repeat, and equal text shares one id, so each
        // distinct key is searched once.
        let mut by_pool_id: Vec<u32> = Vec::new();
        let mut map = Vec::with_capacity(rows as usize);
        for row in 0..rows {
            let cell = values(row);
            if matches!(cell, KeyCell::Value(Value::Error(_))) {
                map.push(KEY_ERROR);
                continue;
            }

            let key = key_of_cell(&cell);
            kind = merge_kind(kind, &key).ok_or(KeyProblem::ManySideType { row })?;
            let target = match (&key, &cell) {
                (Key::Blank, _) => BLANK_KEY,
                (_, KeyCell::Text(_, id)) => {
                    let slot = *id as usize;
                    if slot >= by_pool_id.len() {
                        by_pool_id.resize(slot + 1, UNSEARCHED);
                    }
                    if by_pool_id[slot] == UNSEARCHED {
                        by_pool_id[slot] = self.find_key(&key, &mut scratch);
                    }
                    by_pool_id[slot]
                }
                _ => self.find_key(&key, &mut scratch),
            };
            map.push(target);
        }
        Ok(map)
    }

    /// Sorts number keys with their rows; equal keys keep row order.
    fn sorted_numbers(numbers: Vec<f64>, rows: Vec<u32>) -> Self {
        let order = sorted_entries(numbers.len(), &|left, right| {
            numbers[left as usize].total_cmp(&numbers[right as usize])
        });
        let numbers: Vec<f64> = order.iter().map(|&entry| numbers[entry as usize]).collect();
        let rows = order.iter().map(|&entry| rows[entry as usize]).collect();
        let dense = dense_positions(&numbers);
        Self {
            numbers,
            rows,
            dense,
            ..Self::default()
        }
    }

    /// Sorts text keys, given in row order as `text` split at `ends`, with
    /// their rows; equal keys keep row order.
    fn sorted_text(text: &[u8], ends: &[u32], rows: Vec<u32>) -> Self {
        let key = |entry: u32| {
            let start = if entry == 0 {
                0
            } else {
                ends[entry as usize - 1]
            };
            &text[start as usize..ends[entry as usize] as usize]
        };
        let order = sorted_entries(ends.len(), &|left, right| key(left).cmp(key(right)));

        let mut sorted = Vec::with_capacity(text.len());
        let mut sorted_ends = Vec::with_capacity(ends.len());
        for &entry in &order {
            sorted.extend_from_slice(key(entry));
            sorted_ends.push(sorted.len() as u32);
        }
        Self {
            text: sorted,
            text_ends: sorted_ends,
            rows: order.iter().map(|&entry| rows[entry as usize]).collect(),
            ..Self::default()
        }
    }

    /// The sorted text key at `position`.
    fn text_key(&self, position: usize) -> &[u8] {
        let start = if position == 0 {
            0
        } else {
            self.text_ends[position - 1]
        };
        &self.text[start as usize..self.text_ends[position] as usize]
    }

    /// Equal keys are adjacent after the sort, so one pass finds the first
    /// duplicate.
    fn check_unique(&self) -> Result<(), KeyProblem> {
        for position in 1..self.rows.len() {
            let equal = if self.numbers.is_empty() {
                self.text_key(position - 1) == self.text_key(position)
            } else {
                self.numbers[position - 1] == self.numbers[position]
            };
            if equal {
                return Err(KeyProblem::DuplicateKey {
                    first: self.rows[position - 1],
                    second: self.rows[position],
                });
            }
        }
        Ok(())
    }

    /// The one-side row whose key equals `value`, or [`NO_MATCH`] for a
    /// blank key or a key no row holds. `scratch` holds the folded text of
    /// the key, so a lookup does not allocate for ASCII text.
    #[cfg(test)]
    pub(crate) fn find(&self, value: &Value, scratch: &mut Vec<u8>) -> u32 {
        self.find_key(&key_of_cell(&KeyCell::Value(value.clone())), scratch)
    }

    fn find_key(&self, key: &Key<'_>, scratch: &mut Vec<u8>) -> u32 {
        let position = match *key {
            Key::Number(number) => self.search_number(number),
            Key::Text(text) if !self.text_ends.is_empty() => {
                scratch.clear();
                fold_into(text, scratch);
                self.search_text(scratch)
            }
            Key::Text(_) | Key::Blank | Key::Other => None,
        };
        position.map_or(NO_MATCH, |position| self.rows[position])
    }

    /// Branch-free lower bound: the loop has a fixed trip count and a
    /// conditional move, so lookups in key order do not stall on
    /// mispredicted branches. Keys are finite and sorted ascending.
    fn search_number(&self, number: f64) -> Option<usize> {
        let keys = &self.numbers;
        if keys.is_empty() {
            return None;
        }

        if !self.dense.is_empty() {
            let offset = number - keys[0];
            let in_range = offset >= 0.0 && offset < self.dense.len() as f64;
            if !in_range || offset.fract() != 0.0 {
                return None;
            }
            let position = self.dense[offset as usize];
            return (position != NO_MATCH).then_some(position as usize);
        }
        let mut base = 0;
        let mut len = keys.len();
        while len > 1 {
            let half = len / 2;
            if keys[base + half] <= number {
                base += half;
            }
            len -= half;
        }
        (keys[base] == number).then_some(base)
    }

    fn search_text(&self, key: &[u8]) -> Option<usize> {
        let (mut low, mut high) = (0, self.text_ends.len());
        while low < high {
            let middle = low + (high - low) / 2;
            match self.text_key(middle).cmp(key) {
                Ordering::Less => low = middle + 1,
                Ordering::Greater => high = middle,
                Ordering::Equal => return Some(middle),
            }
        }
        None
    }

    /// Heap bytes the index holds.
    #[cfg(test)]
    fn heap_bytes(&self) -> usize {
        (self.numbers.capacity() * size_of::<f64>())
            + self.text.capacity()
            + (self.text_ends.capacity() + self.rows.capacity() + self.dense.capacity())
                * size_of::<u32>()
    }
}

/// Spans up to this many slots per key get a direct position table: at most
/// 16 bytes per key, beside the 12 bytes the sorted index takes.
const DENSE_SLOTS_PER_KEY: usize = 4;

/// The direct position table of sorted `numbers`, or empty when the keys are
/// not integers or their span is too sparse.
fn dense_positions(numbers: &[f64]) -> Vec<u32> {
    let (Some(&first), Some(&last)) = (numbers.first(), numbers.last()) else {
        return Vec::new();
    };

    let span = last - first;
    let compact = span < (numbers.len() * DENSE_SLOTS_PER_KEY) as f64;
    if !compact || numbers.iter().any(|number| number.fract() != 0.0) {
        return Vec::new();
    }

    let mut dense = vec![NO_MATCH; span as usize + 1];
    for (position, &number) in numbers.iter().enumerate() {
        dense[(number - first) as usize] = position as u32;
    }
    dense
}

/// Entries `0..count` sorted by `compare`, then by entry, so equal keys keep
/// row order.
///
/// This is a heapsort over `dyn` comparisons: O(n log n) in time with no
/// extra memory, and about 0.5 KB of code for both key kinds. A slice sort
/// instance (`sort_unstable_by`) adds about 9 KB to the engine.
fn sorted_entries(count: usize, compare: &dyn Fn(u32, u32) -> Ordering) -> Vec<u32> {
    let mut order: Vec<u32> = (0..count as u32).collect();
    let less = |left: u32, right: u32| compare(left, right).then(left.cmp(&right)).is_lt();

    for start in (0..count / 2).rev() {
        sift_down(&mut order, start, count, &less);
    }

    for end in (1..count).rev() {
        order.swap(0, end);
        sift_down(&mut order, 0, end, &less);
    }
    order
}

/// Moves `order[root]` down the max-heap held in `order[..end]`.
fn sift_down(order: &mut [u32], root: usize, end: usize, less: &dyn Fn(u32, u32) -> bool) {
    let mut parent = root;
    loop {
        let mut child = 2 * parent + 1;
        if child >= end {
            return;
        }

        if child + 1 < end && less(order[child], order[child + 1]) {
            child += 1;
        }

        if !less(order[parent], order[child]) {
            return;
        }
        order.swap(parent, child);
        parent = child;
    }
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::*;
    use crate::types::FormulaError;

    fn text(value: &str) -> Value {
        Value::Text(Rc::from(value))
    }

    fn blank(_: u32) -> KeyCell<'static> {
        KeyCell::Value(Value::Blank)
    }

    fn build(one: &[Value], many: &[Value]) -> Result<KeyIndex, KeyProblem> {
        build_map(one, many).map(|(index, _)| index)
    }

    fn build_map(one: &[Value], many: &[Value]) -> Result<(KeyIndex, Vec<u32>), KeyProblem> {
        KeyIndex::build(
            one.len() as u32,
            |row| KeyCell::Value(one[row as usize].clone()),
            many.len() as u32,
            |row| KeyCell::Value(many[row as usize].clone()),
        )
    }

    #[test]
    fn many_side_rows_map_to_one_side_rows_or_markers() {
        let one = [text("A"), text("b"), Value::Blank, text("C")];
        let many = [
            text("c"),
            Value::Blank,
            text("z"),
            Value::Error(FormulaError::Na),
            text(""),
            text("B"),
        ];
        let (_, map) = build_map(&one, &many).unwrap();
        assert_eq!(map, [3, BLANK_KEY, NO_MATCH, KEY_ERROR, BLANK_KEY, 1]);

        // Pooled text keys give the same rows, including repeated ids and
        // ids whose text differs only in case from a one-side key.
        let pooled = [("c", 7), ("", 2), ("z", 9), ("C", 8), ("c", 7), ("B", 4)];
        let (_, map) = KeyIndex::build(
            one.len() as u32,
            |row| KeyCell::Value(one[row as usize].clone()),
            pooled.len() as u32,
            |row| {
                let (text, id) = pooled[row as usize];
                KeyCell::Text(text, id)
            },
        )
        .unwrap();
        assert_eq!(map, [3, BLANK_KEY, NO_MATCH, 3, 3, 1]);

        let numbers: Vec<_> = (0..1_000)
            .map(|row| Value::Number(f64::from(row * 3)))
            .collect();
        let probes: Vec<_> = (0..3_000)
            .map(|row| Value::Number(f64::from(row)))
            .collect();
        let (_, map) = build_map(&numbers, &probes).unwrap();
        for (row, &target) in map.iter().enumerate() {
            let expected = if row % 3 == 0 {
                row as u32 / 3
            } else {
                NO_MATCH
            };
            assert_eq!(target, expected, "row {row}");
        }
    }

    fn find(index: &KeyIndex, value: Value) -> u32 {
        index.find(&value, &mut Vec::new())
    }

    #[test]
    fn number_keys_match_by_value_and_blank_matches_nothing() {
        let one = [
            Value::Number(3.0),
            Value::Blank,
            Value::Number(-0.0),
            text(""),
        ];
        let index = build(&one, &[]).unwrap();

        assert_eq!(find(&index, Value::Number(3.0)), 0);
        assert_eq!(find(&index, Value::Number(0.0)), 2);
        assert_eq!(find(&index, Value::Number(-0.0)), 2);
        assert_eq!(find(&index, Value::Number(4.0)), NO_MATCH);
        assert_eq!(find(&index, Value::Blank), NO_MATCH);
        assert_eq!(find(&index, text("")), NO_MATCH);
        assert_eq!(find(&index, Value::Bool(false)), NO_MATCH);
        assert_eq!(find(&index, text("3")), NO_MATCH);
    }

    #[test]
    fn text_keys_match_without_case_including_non_ascii() {
        let one = [text("North"), text("ÉTÉ"), text("south")];
        let index = build(&one, &[]).unwrap();

        assert_eq!(find(&index, text("NORTH")), 0);
        assert_eq!(find(&index, text("été")), 1);
        assert_eq!(find(&index, text("South")), 2);
        assert_eq!(find(&index, text("West")), NO_MATCH);
        assert_eq!(find(&index, Value::Number(1.0)), NO_MATCH);
    }

    #[test]
    fn duplicate_one_side_keys_report_the_first_pair() {
        let one = [text("a"), text("B"), text("b"), text("A")];
        assert_eq!(
            build(&one, &[]).unwrap_err(),
            KeyProblem::DuplicateKey {
                first: 0,
                second: 3
            }
        );
        let numbers = [Value::Number(1.0), Value::Number(2.0), Value::Number(2.0)];
        assert_eq!(
            build(&numbers, &[]).unwrap_err(),
            KeyProblem::DuplicateKey {
                first: 1,
                second: 2
            }
        );
    }

    #[test]
    fn key_kinds_must_match_on_both_sides() {
        let numbers = [Value::Number(1.0), Value::Blank];
        let mixed = [Value::Number(1.0), text("a")];
        let one_side_error = [Value::Error(FormulaError::Na)];

        assert_eq!(
            build(&mixed, &[]).unwrap_err(),
            KeyProblem::OneSideType { row: 1 }
        );
        assert_eq!(
            build(&[Value::Bool(true)], &[]).unwrap_err(),
            KeyProblem::OneSideType { row: 0 }
        );
        assert_eq!(
            build(&one_side_error, &[]).unwrap_err(),
            KeyProblem::OneSideType { row: 0 }
        );
        assert_eq!(
            build(&numbers, &[Value::Number(1.0), text("1")]).unwrap_err(),
            KeyProblem::ManySideType { row: 1 }
        );

        // Many-side errors and blanks fit any kind, and a blank column fits either kind.
        let many = [
            Value::Error(FormulaError::Na),
            Value::Blank,
            Value::Number(1.0),
        ];
        assert!(build(&numbers, &many).is_ok());
        assert!(build(&[Value::Blank], &[text("a")]).is_ok());
    }

    #[test]
    fn index_holds_twelve_bytes_per_sparse_key_and_four_more_per_dense_id() {
        const ROWS: u32 = 100_000;
        let build = |step: u32| {
            KeyIndex::build(
                ROWS,
                |row| KeyCell::Value(Value::Number(f64::from(row * step))),
                0,
                blank,
            )
            .unwrap()
            .0
        };
        assert_eq!(build(10).heap_bytes(), ROWS as usize * 12);
        assert_eq!(build(1).heap_bytes(), ROWS as usize * 16);

        // Dense and sparse keys find the same rows, and gaps match nothing.
        for step in [2, 10] {
            let index = build(step);
            assert_eq!(find(&index, Value::Number(f64::from(42 * step))), 42);
            assert_eq!(
                find(&index, Value::Number(f64::from(42 * step + 1))),
                NO_MATCH
            );
            assert_eq!(find(&index, Value::Number(-1.0)), NO_MATCH);
            assert_eq!(
                find(&index, Value::Number(f64::from(42 * step) + 0.5)),
                NO_MATCH
            );
        }
    }

    #[test]
    fn scrambled_keys_all_resolve_and_a_late_duplicate_is_found() {
        const ROWS: u32 = 1_000;
        // 7919 is prime to ROWS, so this visits every key once in scrambled order.
        let key = |row: u32| Value::Number(f64::from(row * 7_919 % ROWS));
        let (index, _) = KeyIndex::build(ROWS, |row| KeyCell::Value(key(row)), 0, blank).unwrap();
        for row in 0..ROWS {
            assert_eq!(find(&index, key(row)), row);
        }

        let words = |row: u32| text(&format!("k{}", row * 7_919 % ROWS));
        let (index, _) = KeyIndex::build(ROWS, |row| KeyCell::Value(words(row)), 0, blank).unwrap();
        for row in 0..ROWS {
            assert_eq!(find(&index, words(row)), row);
        }

        let late_duplicate =
            |row: u32| Value::Number(f64::from(if row == ROWS - 1 { 5 } else { row }));
        assert_eq!(
            KeyIndex::build(ROWS, |row| KeyCell::Value(late_duplicate(row)), 0, blank).unwrap_err(),
            KeyProblem::DuplicateKey {
                first: 5,
                second: ROWS - 1
            }
        );
    }
}
