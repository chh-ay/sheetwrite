//! The engine's shared sorts.
//!
//! Each `sort_unstable_by` or `sort_by` call compiles its own copy of Rust's
//! sort for its element type and comparator, 3 to 25 KB of WASM each. Engine
//! sorts go through the instances here instead: packed integer keys for any
//! order that fits in 64 or 128 bits, and one stable index sort with a `dyn`
//! comparator for orders that need a real comparison.

use std::cmp::Ordering;

use crate::formula_slots::FormulaId;
use crate::types::{AbsCellKey, CellRange};

/// Sorts packed keys ascending.
#[inline(never)]
pub(crate) fn sort_u64(keys: &mut [u64]) {
    keys.sort_unstable();
}

/// Sorts packed keys ascending.
#[inline(never)]
pub(crate) fn sort_u128(keys: &mut [u128]) {
    keys.sort_unstable();
}

/// Sorts `indices` by `compare`, stably.
#[inline(never)]
pub(crate) fn sort_indices_by(indices: &mut [u32], compare: &mut dyn FnMut(u32, u32) -> Ordering) {
    indices.sort_by(|&left, &right| compare(left, right));
}

/// The index a packed key carries in its low 32 bits.
pub(crate) const fn key_index(key: u128) -> u32 {
    key as u32
}

/// Three 32-bit fields packed into one key, `high` first.
pub(crate) const fn key96(high: u32, middle: u32, low: u32) -> u128 {
    (high as u128) << 64 | (middle as u128) << 32 | low as u128
}

/// Sorts `items` by a 96-bit key, stably: packs `key << 32 | position`,
/// sorts the packed keys and moves the items into that order.
pub(crate) fn sort_by_key96<T>(items: &mut [T], key: impl Fn(&T) -> u128) {
    if items.len() < 2 {
        return;
    }
    let mut packed: Vec<u128> = items
        .iter()
        .enumerate()
        .map(|(position, item)| key(item) << 32 | position as u128)
        .collect();
    sort_u128(&mut packed);
    let mut order: Vec<u32> = packed.into_iter().map(key_index).collect();
    permute(items, &mut order);
}

/// Moves `items[order[position]]` to `position` for every position, one
/// cycle of the permutation at a time. Marks each finished position in
/// `order`.
fn permute<T>(items: &mut [T], order: &mut [u32]) {
    for start in 0..items.len() {
        let mut current = start;
        loop {
            let source = order[current] as usize;
            order[current] = current as u32;
            if source == start || source == current {
                break;
            }
            items.swap(current, source);
            current = source;
        }
    }
}

/// Sorts cells in (sheet, row, col) order.
pub(crate) fn sort_cells_row_major(cells: &mut [AbsCellKey]) {
    let mut keys: Vec<u128> = cells
        .iter()
        .map(|cell| key96(cell.sheet, cell.row, cell.col))
        .collect();
    sort_u128(&mut keys);
    for (cell, key) in cells.iter_mut().zip(keys) {
        *cell = AbsCellKey {
            sheet: (key >> 64) as u32,
            row: (key >> 32) as u32,
            col: key as u32,
        };
    }
}

/// Sorts (cell, formula) pairs in (sheet, col, row, formula) order.
pub(crate) fn sort_cell_formulas_column_major(pairs: &mut [(AbsCellKey, FormulaId)]) {
    let mut keys: Vec<u128> = pairs
        .iter()
        .map(|&(cell, formula)| {
            key96(cell.sheet, cell.col, cell.row) << 32 | u128::from(formula.raw())
        })
        .collect();
    sort_u128(&mut keys);
    for (pair, key) in pairs.iter_mut().zip(keys) {
        let cell = AbsCellKey {
            sheet: (key >> 96) as u32,
            col: (key >> 64) as u32,
            row: (key >> 32) as u32,
        };
        *pair = (cell, FormulaId::from_raw(key as u32));
    }
}

/// Sorts pairs of `u32`s, first field first.
pub(crate) fn sort_u32_pairs(pairs: &mut [(u32, u32)]) {
    let mut keys: Vec<u64> = pairs
        .iter()
        .map(|&(first, second)| u64::from(first) << 32 | u64::from(second))
        .collect();
    sort_u64(&mut keys);
    for (pair, key) in pairs.iter_mut().zip(keys) {
        *pair = ((key >> 32) as u32, key as u32);
    }
}

/// Sorts pairs of `usize`s below 2^32, first field first.
pub(crate) fn sort_usize_pairs(pairs: &mut [(usize, usize)]) {
    let mut keys: Vec<u64> = pairs
        .iter()
        .map(|&(first, second)| (first as u64) << 32 | second as u64)
        .collect();
    sort_u64(&mut keys);
    for (pair, key) in pairs.iter_mut().zip(keys) {
        *pair = ((key >> 32) as usize, key as u32 as usize);
    }
}

/// Sorts (row, formula) pairs, row first.
pub(crate) fn sort_row_formulas(pairs: &mut [(u32, FormulaId)]) {
    let mut keys: Vec<u64> = pairs
        .iter()
        .map(|&(row, formula)| u64::from(row) << 32 | u64::from(formula.raw()))
        .collect();
    sort_u64(&mut keys);
    for (pair, key) in pairs.iter_mut().zip(keys) {
        *pair = ((key >> 32) as u32, FormulaId::from_raw(key as u32));
    }
}

/// Sorts (range, formula) pairs in their derived order, field by field: by
/// the last three fields, then stably by the first three.
pub(crate) fn sort_range_formulas(pairs: &mut [(CellRange, FormulaId)]) {
    sort_by_key96(pairs, |&(range, formula)| {
        key96(range.row_end, range.col_end, formula.raw())
    });
    sort_by_key96(pairs, |&(range, _)| {
        key96(range.sheet, range.row_start, range.col_start)
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const ITEMS: usize = 500;
    const SEED: u64 = 0x5eed;
    const LCG_MULTIPLIER: u64 = 6_364_136_223_846_793_005;
    /// Few distinct values per field, so many keys tie.
    const FIELD_VALUES: u32 = 4;

    struct Random(u64);

    impl Random {
        fn field(&mut self) -> u32 {
            self.0 = self.0.wrapping_mul(LCG_MULTIPLIER).wrapping_add(1);
            (self.0 >> 33) as u32 % FIELD_VALUES
        }
    }

    #[test]
    fn packed_sorts_match_the_derived_orders() {
        let mut random = Random(SEED);
        let mut cells: Vec<AbsCellKey> = (0..ITEMS)
            .map(|_| AbsCellKey {
                sheet: random.field(),
                row: random.field(),
                col: random.field(),
            })
            .collect();
        let mut expected = cells.clone();
        expected.sort_by_key(|cell| (cell.sheet, cell.row, cell.col));
        sort_cells_row_major(&mut cells);
        assert_eq!(cells, expected);

        let mut edges: Vec<(AbsCellKey, FormulaId)> = (0..ITEMS)
            .map(|_| {
                let cell = AbsCellKey {
                    sheet: random.field(),
                    row: random.field(),
                    col: random.field(),
                };
                (cell, FormulaId::from_raw(random.field()))
            })
            .collect();
        let mut expected = edges.clone();
        expected.sort_by_key(|&(cell, formula)| (cell.sheet, cell.col, cell.row, formula));
        sort_cell_formulas_column_major(&mut edges);
        assert_eq!(edges, expected);

        let mut ranges: Vec<(CellRange, FormulaId)> = (0..ITEMS)
            .map(|_| {
                let range = CellRange {
                    sheet: random.field(),
                    row_start: random.field(),
                    col_start: random.field(),
                    row_end: random.field(),
                    col_end: random.field(),
                };
                (range, FormulaId::from_raw(random.field()))
            })
            .collect();
        let mut expected = ranges.clone();
        expected.sort();
        sort_range_formulas(&mut ranges);
        assert_eq!(ranges, expected);

        let mut pairs: Vec<(u32, u32)> = (0..ITEMS)
            .map(|_| (random.field(), random.field()))
            .collect();
        let mut expected = pairs.clone();
        expected.sort();
        sort_u32_pairs(&mut pairs);
        assert_eq!(pairs, expected);

        let mut pairs: Vec<(usize, usize)> = (0..ITEMS)
            .map(|_| (random.field() as usize, random.field() as usize))
            .collect();
        let mut expected = pairs.clone();
        expected.sort();
        sort_usize_pairs(&mut pairs);
        assert_eq!(pairs, expected);

        let mut rows: Vec<(u32, FormulaId)> = (0..ITEMS)
            .map(|_| (random.field(), FormulaId::from_raw(random.field())))
            .collect();
        let mut expected = rows.clone();
        expected.sort();
        sort_row_formulas(&mut rows);
        assert_eq!(rows, expected);
    }

    #[test]
    fn sort_by_key96_is_stable_and_moves_whole_items() {
        let mut random = Random(SEED);
        let mut items: Vec<(u32, String)> = (0..ITEMS)
            .map(|position| (random.field(), format!("item {position}")))
            .collect();
        let mut expected = items.clone();
        expected.sort_by_key(|item| item.0);
        sort_by_key96(&mut items, |item| u128::from(item.0));
        assert_eq!(items, expected);
    }
}
