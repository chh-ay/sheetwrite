//! The scalar tag encoding of calculated values. Dense calculated values share
//! the source payload slot; paged ones live in calculated pages.

use crate::cells::{encode_num, payload_num, STR_TAG_HI};
use crate::types::{KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING};

const ERROR_TAG_PREFIX: u64 = 0xFFFB;
const TEXT_TAG_PREFIX: u64 = STR_TAG_HI >> 16;
const BOOL_TAG_PREFIX: u64 = 0xFFFD;
const BLANK_TAG_PREFIX: u64 = 0xFFFE;

const ERROR_TAG: u64 = ERROR_TAG_PREFIX << 48;
const ERROR_SLOT_MASK: u64 = u16::MAX as u64;
const BOOL_TAG: u64 = BOOL_TAG_PREFIX << 48;
const BLANK_TAG: u64 = BLANK_TAG_PREFIX << 48;

/// A calculated-page row without a result. [`encode_cell`] never produces it.
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
