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
