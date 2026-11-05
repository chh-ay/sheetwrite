//! The row order of a `permuteRows` operation: one little-endian `u32` per
//! row, in standard base64 with padding, so that the operation stays
//! JSON-safe. The engine builds, checks, decodes and inverts it, so the
//! TypeScript side only carries the text.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const PADDING: u8 = b'=';
const BYTES_PER_ROW: usize = 4;
const BITS_PER_WORD: usize = 64;
/// Bytes in one base64 group, and the characters that encode them.
const GROUP_BYTES: usize = 3;
const GROUP_CHARACTERS: usize = 4;
const SEXTET_BITS: usize = 6;
const SEXTET_MASK: u32 = 0x3f;
const BYTE_MASK: u32 = 0xff;
const BYTE_BITS: usize = 8;
/// Shifts of the first byte and the first sextet in a 24-bit group.
const FIRST_BYTE_SHIFT: usize = 16;
const FIRST_SEXTET_SHIFT: usize = 18;

/// Base64 text of `order`.
pub(crate) fn encode_row_order(order: &[u32]) -> String {
    let mut bytes = Vec::with_capacity(order.len() * BYTES_PER_ROW);
    for &row in order {
        bytes.extend_from_slice(&row.to_le_bytes());
    }

    let mut text = String::with_capacity(bytes.len().div_ceil(GROUP_BYTES) * GROUP_CHARACTERS);
    for group in bytes.chunks(GROUP_BYTES) {
        let mut word = 0u32;
        for (index, &byte) in group.iter().enumerate() {
            word |= u32::from(byte) << (FIRST_BYTE_SHIFT - BYTE_BITS * index);
        }

        for index in 0..GROUP_CHARACTERS {
            if index > group.len() {
                text.push(PADDING as char);
                continue;
            }
            let value = (word >> (FIRST_SEXTET_SHIFT - SEXTET_BITS * index)) & SEXTET_MASK;
            text.push(ALPHABET[value as usize] as char);
        }
    }
    text
}

fn sextet(character: u8) -> Option<u32> {
    let value = match character {
        b'A'..=b'Z' => character - b'A',
        b'a'..=b'z' => character - b'a' + 26,
        b'0'..=b'9' => character - b'0' + 52,
        b'+' => 62,
        b'/' => 63,
        _ => return None,
    };
    Some(u32::from(value))
}

/// The order in `text`, when it is base64 of exactly `rows` values that name
/// each of `0..rows` once; otherwise `None`.
pub(crate) fn decode_row_order(text: &str, rows: usize) -> Option<Vec<u32>> {
    let encoded = text.as_bytes();
    let byte_count = rows.checked_mul(BYTES_PER_ROW)?;
    if encoded.len() != byte_count.div_ceil(GROUP_BYTES) * GROUP_CHARACTERS {
        return None;
    }

    let mut bytes = Vec::with_capacity(byte_count);
    for group in encoded.chunks(GROUP_CHARACTERS) {
        let mut word = 0u32;
        let mut present = 0;
        for (index, &character) in group.iter().enumerate() {
            if character == PADDING {
                continue;
            }
            word |= sextet(character)? << (FIRST_SEXTET_SHIFT - SEXTET_BITS * index);
            present += 1;
        }

        if present < 2 {
            return None;
        }
        for index in 0..present - 1 {
            bytes.push(((word >> (FIRST_BYTE_SHIFT - BYTE_BITS * index)) & BYTE_MASK) as u8);
        }
    }
    if bytes.len() != byte_count {
        return None;
    }

    let order: Vec<u32> = bytes
        .chunks_exact(BYTES_PER_ROW)
        .map(|chunk| u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();
    is_permutation(&order).then_some(order)
}

/// Whether `order` holds each of `0..order.len()` exactly once. One bit per
/// row marks the rows already seen.
pub(crate) fn is_permutation(order: &[u32]) -> bool {
    let mut seen = vec![0u64; order.len().div_ceil(BITS_PER_WORD)];
    for &row in order {
        let row = row as usize;
        if row >= order.len() {
            return false;
        }

        let word = row / BITS_PER_WORD;
        let bit = 1u64 << (row % BITS_PER_WORD);
        if seen[word] & bit != 0 {
            return false;
        }
        seen[word] |= bit;
    }
    true
}

/// The order that moves every row back: `inverse[order[i]] = i`.
pub(crate) fn invert_row_order(order: &[u32]) -> Vec<u32> {
    let mut inverse = vec![0u32; order.len()];
    for (target, &source) in order.iter().enumerate() {
        inverse[source as usize] = target as u32;
    }
    inverse
}
