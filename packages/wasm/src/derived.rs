//! Sparse calculated values for paged storage. Dense calculated values share
//! the source payload slot; both layouts use the same scalar tag encoding.
use crate::cells::{encode_num, payload_num, STR_TAG_HI};
use crate::memory::MemoryOwnerStats;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};
use crate::types::{KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING};
use std::collections::HashMap;
const ERROR_TAG_PREFIX: u64 = 0xFFFB;
const TEXT_TAG_PREFIX: u64 = STR_TAG_HI >> 16;
const BOOL_TAG_PREFIX: u64 = 0xFFFD;
const BLANK_TAG_PREFIX: u64 = 0xFFFE;
const ERROR_TAG: u64 = ERROR_TAG_PREFIX << 48;
const ERROR_SLOT_MASK: u64 = u16::MAX as u64;
const BOOL_TAG: u64 = BOOL_TAG_PREFIX << 48;
const BLANK_TAG: u64 = BLANK_TAG_PREFIX << 48;
const COMPACT_SLACK_CELLS: usize = 4096;
#[cfg(any(target_arch = "wasm32", test))]
pub(crate) const ABSENT_TAG: u64 = 0xFFFA_0000_0000_0000;

#[inline]
pub(crate) fn encode_cell(kind: u8, payload: u64) -> u64 {
    match kind {
        KIND_NUMBER | KIND_STRING => payload,
        KIND_BOOL => BOOL_TAG | u64::from(payload_num(payload) != 0.0),
        KIND_EMPTY => BLANK_TAG,
        KIND_FORMULA => ERROR_TAG | payload,
        _ => unreachable!("unsupported calculated scalar kind: {kind}"),
    }
}

#[inline(always)]
pub(crate) fn decode_cell(payload: u64) -> (u8, u64) {
    match payload >> 48 {
        TEXT_TAG_PREFIX => (KIND_STRING, payload),
        BOOL_TAG_PREFIX => (KIND_BOOL, encode_num(f64::from(payload & 1 != 0))),
        BLANK_TAG_PREFIX => (KIND_EMPTY, 0),
        ERROR_TAG_PREFIX => (KIND_FORMULA, payload & ERROR_SLOT_MASK),
        _ => (KIND_NUMBER, payload),
    }
}

#[derive(Default)]
pub(crate) struct DerivedOverlay {
    cells: HashMap<usize, u64>,
}
impl DerivedOverlay {
    pub(crate) fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }
    pub(crate) fn get(&self, index: usize) -> Option<(u8, u64)> {
        self.cells.get(&index).copied().map(decode_cell)
    }
    pub(crate) fn reserve(&mut self, additional: usize) -> bool {
        self.cells.try_reserve(additional).is_ok()
    }
    pub(crate) fn set(&mut self, index: usize, kind: u8, payload: u64) {
        self.cells.insert(index, encode_cell(kind, payload));
    }
    pub(crate) fn remove(&mut self, index: usize) {
        self.cells.remove(&index);
    }
    pub(crate) fn clear(&mut self) {
        *self = Self::default();
    }
    pub(crate) fn compact(&mut self) {
        if self.cells.capacity() > self.cells.len().saturating_mul(2)
            && self.cells.capacity().saturating_sub(self.cells.len()) > COMPACT_SLACK_CELLS
        {
            self.cells.shrink_to_fit();
        }
    }
    pub(crate) fn visit_payloads(&self, mut visit: impl FnMut(u64)) {
        for &value in self.cells.values() {
            visit(value);
        }
    }
    pub(crate) fn remap_payloads(&mut self, mut remap: impl FnMut(&mut u64)) {
        for value in self.cells.values_mut() {
            remap(value);
        }
    }
    pub(crate) fn add_memory_stats(&self, owner: &mut MemoryOwnerStats) {
        owner.add_hash_table::<usize, u64>(self.cells.len(), self.cells.capacity());
    }
    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        out.usize(self.cells.len());
        for (&index, &value) in &self.cells {
            out.usize(index);
            out.u64(value);
        }
    }
    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>, maximum: usize) -> TransferResult<Self> {
        let count = input.count()?;
        let mut cells = HashMap::with_capacity(count);
        for _ in 0..count {
            let index = input.usize()?;
            let value = input.u64()?;
            if index >= maximum || value == ABSENT_TAG || cells.insert(index, value).is_some() {
                return Err("invalid transferred calculated cell".into());
            }
        }
        Ok(Self { cells })
    }
}
