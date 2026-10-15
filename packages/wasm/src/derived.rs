//! Calculated payloads have their own lifetime, independent of source residency.
//! Dense reads keep column-major indexing; paged sheets retain only derived cells.
//! Unlike source storage, calculated values need no separate kind buffer: reserved
//! NaN tags encode booleans, blanks and errors alongside the existing text tag.

use std::collections::HashMap;

use crate::memory::MemoryOwnerStats;
use crate::sheet::{encode_num, payload_num, STR_TAG_HI};
use crate::types::{FormulaError, KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING};

const ERROR_TAG_PREFIX: u64 = 0xFFFB;
const TEXT_TAG_PREFIX: u64 = STR_TAG_HI >> 16;
const BOOL_TAG_PREFIX: u64 = 0xFFFD;
const BLANK_TAG_PREFIX: u64 = 0xFFFE;
const ERROR_TAG: u64 = ERROR_TAG_PREFIX << 48;
const ERROR_SLOT_MASK: u64 = u16::MAX as u64;
const BOOL_TAG: u64 = BOOL_TAG_PREFIX << 48;
const BLANK_TAG: u64 = BLANK_TAG_PREFIX << 48;
const COMPACT_SLACK_CELLS: usize = 4096;
const ABSENT_TAG: u64 = 0xFFFA_0000_0000_0000;

pub(crate) enum DerivedOverlay {
    Dense(Vec<u64>),
    Paged(HashMap<usize, u64>),
}

#[inline]
fn encode_cell(kind: u8, payload: u64) -> u64 {
    match kind {
        KIND_NUMBER | KIND_STRING => payload,
        KIND_BOOL => BOOL_TAG | u64::from(payload_num(payload) != 0.0),
        KIND_EMPTY => BLANK_TAG,
        KIND_FORMULA => ERROR_TAG | payload,
        _ => unreachable!("unsupported calculated scalar kind: {kind}"),
    }
}

#[inline(always)]
fn decode_cell(payload: u64) -> (u8, u64) {
    match payload >> 48 {
        TEXT_TAG_PREFIX => (KIND_STRING, payload),
        BOOL_TAG_PREFIX => (KIND_BOOL, encode_num(f64::from(payload & 1 != 0))),
        BLANK_TAG_PREFIX => (KIND_EMPTY, 0),
        ERROR_TAG_PREFIX => (KIND_FORMULA, payload & ERROR_SLOT_MASK),
        _ => (KIND_NUMBER, payload),
    }
}

impl DerivedOverlay {
    pub(crate) fn dense() -> Self {
        Self::Dense(Vec::new())
    }

    pub(crate) fn paged() -> Self {
        Self::Paged(HashMap::new())
    }

    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        match self {
            Self::Dense(payload) => payload.is_empty(),
            Self::Paged(cells) => cells.is_empty(),
        }
    }

    #[inline(always)]
    pub(crate) fn get(&self, index: usize) -> Option<(u8, u64)> {
        match self {
            Self::Dense(payload) => {
                if payload.is_empty() {
                    None
                } else {
                    let value = payload[index];
                    (value != ABSENT_TAG).then(|| decode_cell(value))
                }
            }
            Self::Paged(cells) => cells.get(&index).copied().map(decode_cell),
        }
    }

    #[inline]
    pub(crate) fn error_at(&self, index: usize) -> Option<FormulaError> {
        let (kind, payload) = self.get(index)?;
        (kind == KIND_FORMULA)
            .then(|| FormulaError::from_slot(payload))
            .flatten()
    }

    pub(crate) fn reserve(&mut self, additional: usize, dense_cells: usize) -> bool {
        match self {
            Self::Dense(payload) => {
                if payload.len() == dense_cells {
                    return true;
                }

                if payload
                    .try_reserve_exact(dense_cells.saturating_sub(payload.len()))
                    .is_err()
                {
                    return false;
                }

                payload.resize(dense_cells, ABSENT_TAG);
                true
            }
            Self::Paged(cells) => cells.try_reserve(additional).is_ok(),
        }
    }

    #[inline]
    pub(crate) fn set(&mut self, index: usize, kind: u8, payload: u64) {
        let encoded = encode_cell(kind, payload);

        match self {
            Self::Dense(values) => values[index] = encoded,
            Self::Paged(cells) => {
                cells.insert(index, encoded);
            }
        }
    }

    #[inline]
    pub(crate) fn remove(&mut self, index: usize) {
        match self {
            Self::Dense(payload) => {
                if !payload.is_empty() {
                    payload[index] = ABSENT_TAG;
                }
            }
            Self::Paged(cells) => {
                cells.remove(&index);
            }
        }
    }

    pub(crate) fn clear(&mut self) {
        *self = match self {
            Self::Dense(_) => Self::dense(),
            Self::Paged(_) => Self::paged(),
        };
    }

    pub(crate) fn compact(&mut self) {
        if let Self::Paged(cells) = self {
            if cells.capacity() > cells.len().saturating_mul(2)
                && cells.capacity().saturating_sub(cells.len()) > COMPACT_SLACK_CELLS
            {
                cells.shrink_to_fit();
            }
        }
    }

    pub(crate) fn visit_payloads(&self, mut visit: impl FnMut(u64)) {
        match self {
            Self::Dense(payload) => {
                for &value in payload {
                    visit(value);
                }
            }
            Self::Paged(cells) => {
                for &value in cells.values() {
                    visit(value);
                }
            }
        }
    }

    pub(crate) fn remap_payloads(&mut self, mut remap: impl FnMut(&mut u64)) {
        match self {
            Self::Dense(payload) => {
                for value in payload {
                    remap(value);
                }
            }
            Self::Paged(cells) => {
                for value in cells.values_mut() {
                    remap(value);
                }
            }
        }
    }

    pub(crate) fn add_memory_stats(&self, owner: &mut MemoryOwnerStats) {
        match self {
            Self::Dense(payload) => owner.add_vec::<u64>(payload.len(), payload.capacity()),
            Self::Paged(cells) => owner.add_hash_table::<usize, u64>(cells.len(), cells.capacity()),
        }
    }
}
