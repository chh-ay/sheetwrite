//! The engine's shared sorts.
//!
//! Each `sort_unstable_by` or `sort_by` call compiles its own copy of Rust's
//! sort for its element type and comparator, 3 to 25 KB of WASM each. Engine
//! sorts go through the instances here instead: packed integer keys for any
//! order that fits in 64 or 128 bits, and one stable index sort with a `dyn`
//! comparator for orders that need a real comparison.

use std::cmp::Ordering;

use crate::formula_slots::FormulaId;
use crate::types::AbsCellKey;

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

/// The sign bit of a 64-bit value.
const SIGN_BIT: u64 = 1 << 63;

/// Sorts `values` ascending through [`sort_u64`], reusing their allocation:
/// flipping the sign bit turns `i64` order into `u64` order.
pub(crate) fn sort_i64(values: Vec<i64>) -> Vec<i64> {
    let mut keys: Vec<u64> = values
        .into_iter()
        .map(|value| value as u64 ^ SIGN_BIT)
        .collect();
    sort_u64(&mut keys);
    keys.into_iter()
        .map(|key| (key ^ SIGN_BIT) as i64)
        .collect()
}

/// Sorts `numbers` ascending in [`f64::total_cmp`] order through
/// [`sort_u64`], on keys whose unsigned order is that order.
pub(crate) fn sort_f64(numbers: &mut [f64]) {
    let mut keys: Vec<u64> = numbers
        .iter()
        .map(|&number| total_order_key(number))
        .collect();
    sort_u64(&mut keys);
    for (number, key) in numbers.iter_mut().zip(keys) {
        *number = from_total_order_key(key);
    }
}

/// Positive numbers get the sign bit set, so they follow every negative
/// one; negative numbers get every bit flipped, so a larger magnitude sorts
/// first. This is the order of [`f64::total_cmp`].
const fn total_order_key(number: f64) -> u64 {
    let bits = number.to_bits();
    if bits & SIGN_BIT == 0 {
        bits | SIGN_BIT
    } else {
        !bits
    }
}

/// The number [`total_order_key`] made `key` from.
const fn from_total_order_key(key: u64) -> f64 {
    f64::from_bits(if key & SIGN_BIT == 0 {
        !key
    } else {
        key ^ SIGN_BIT
    })
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

/// Sorts (cell, formula) pairs in (sheet, col, row, formula) order, in
/// place: the dependency index sorts every edge of a workbook here, so a
/// packed copy would add 16 bytes per edge to its peak memory.
#[inline(never)]
pub(crate) fn sort_cell_formulas_column_major(pairs: &mut [(AbsCellKey, FormulaId)]) {
    pairs.sort_unstable_by_key(|&(cell, formula)| (cell.sheet, cell.col, cell.row, formula));
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
    fn cells_sort_row_major() {
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
    }

    #[test]
    fn numbers_sort_in_total_order() {
        let mut numbers = vec![
            1.5,
            -0.0,
            f64::INFINITY,
            0.0,
            -1.5,
            f64::MIN_POSITIVE / 2.0,
            f64::NEG_INFINITY,
            -f64::MIN_POSITIVE / 2.0,
            1.5,
            f64::MAX,
            -f64::MAX,
        ];
        let mut expected = numbers.clone();
        expected.sort_by(f64::total_cmp);
        sort_f64(&mut numbers);
        let bits = |values: &[f64]| {
            values
                .iter()
                .map(|value| value.to_bits())
                .collect::<Vec<_>>()
        };
        assert_eq!(bits(&numbers), bits(&expected));
    }

    #[test]
    fn signed_values_sort_ascending() {
        let values = vec![3, i64::MIN, -1, 0, i64::MAX, -1, 45_000, 1];
        let mut expected = values.clone();
        expected.sort_unstable();
        assert_eq!(sort_i64(values), expected);
    }
}
