//! The engine's shared sorts.
//!
//! Each `sort_unstable_by` or `sort_by` call compiles its own copy of Rust's
//! sort for its element type and comparator, 3 to 25 KB of WASM each. Engine
//! sorts go through the instances here instead: packed integer keys for any
//! order that fits in 64 or 128 bits, and one stable index sort with a `dyn`
//! comparator for orders that need a real comparison.

use std::cmp::Ordering;

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
