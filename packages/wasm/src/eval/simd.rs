//! Design-study fast path: one dense numeric COUNTIF column, without reordering sums.

use std::arch::wasm32::*;

use crate::calc::CmpOp;
use crate::store::CellStore;
use crate::types::{CellRange, Value, FORMULA_RECURSION_LIMIT, KIND_NUMBER, RANGE_CELL_LIMIT};
use super::criteria::Criterion;

const TAG_LANES: usize = 16;
const NUMBER_LANES: usize = 2;

impl CellStore {
    #[inline(never)]
    pub(super) fn dense_countif_family(&self, range: CellRange, criterion: &Criterion, depth: usize) -> Option<Value> {
        if depth + 1 >= FORMULA_RECURSION_LIMIT || range.col_start != range.col_end { return None; }
        let (op, threshold) = criterion.numeric_operand()?;
        let sheet = self.sheets.get(range.sheet as usize)?;
        let column = sheet.cells.dense_column(range.col_start as usize)?;
        let (kinds, payloads) = column.raw_slices();
        let start = range.row_start as usize;
        let end = (range.row_end as usize).checked_add(1)?.min(kinds.len());
        if start >= end || end - start > RANGE_CELL_LIMIT as usize { return None; }
        let kinds = &kinds[start..end];
        let payloads = &payloads[start..end];
        // SAFETY: current engine targets support simd128. Slice lengths are
        // equal; the kernel checks every tag before decoding numeric payloads.
        unsafe { count_numeric_family(kinds, payloads, op, threshold) }.map(|count| Value::Number(count as f64))
    }
}

#[inline(never)]
#[target_feature(enable = "simd128")]
unsafe fn count_numeric_family(kinds: &[u8], payloads: &[u64], op: CmpOp, threshold: f64) -> Option<u64> {
    let mut tag_chunks = kinds.chunks_exact(TAG_LANES);
    for chunk in &mut tag_chunks {
        // SAFETY: each complete chunk contains exactly one 128-bit vector.
        let tags = unsafe { v128_load(chunk.as_ptr().cast()) };
        if !i8x16_all_true(i8x16_eq(tags, i8x16_splat(KIND_NUMBER as i8))) { return None; }
    }
    if tag_chunks.remainder().iter().any(|&kind| kind != KIND_NUMBER) { return None; }

    let threshold_vector = f64x2_splat(threshold);
    let mut count = 0u64;
    let mut number_chunks = payloads.chunks_exact(NUMBER_LANES);
    for chunk in &mut number_chunks {
        // SAFETY: two adjacent u64 payloads form one unaligned 128-bit load.
        let numbers = unsafe { v128_load(chunk.as_ptr().cast()) };
        if !i64x2_all_true(f64x2_le(f64x2_abs(numbers), f64x2_splat(f64::MAX))) {
            return None;
        }
        let matches = match op {
            CmpOp::Eq => f64x2_eq(numbers, threshold_vector),
            CmpOp::Ne => f64x2_ne(numbers, threshold_vector),
            CmpOp::Lt => f64x2_lt(numbers, threshold_vector),
            CmpOp::Le => f64x2_le(numbers, threshold_vector),
            CmpOp::Gt => f64x2_gt(numbers, threshold_vector),
            CmpOp::Ge => f64x2_ge(numbers, threshold_vector),
        };
        count += u64::from(i64x2_bitmask(matches).count_ones());
    }
    for &payload in number_chunks.remainder() {
        let number = f64::from_bits(payload);
        if !number.is_finite() { return None; }
        let matches = match op {
            CmpOp::Eq => number == threshold,
            CmpOp::Ne => number != threshold,
            CmpOp::Lt => number < threshold,
            CmpOp::Le => number <= threshold,
            CmpOp::Gt => number > threshold,
            CmpOp::Ge => number >= threshold,
        };
        count += u64::from(matches);
    }
    Some(count)
}
