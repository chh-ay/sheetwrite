//! Checked flat buffers shared by typed columns and the WASM transfer format.

use std::num::TryFromIntError;
use std::str::Utf8Error;
use std::string::FromUtf8Error;

use crate::plan::Diagnostic;

const BITS_PER_BYTE: usize = 8;
const MAX_TEXT_BYTES: usize = 64 * 1024 * 1024;

/// The UTF-8 bytes and row end offsets of a [`Texts`] lane, in transfer order.
pub(crate) type TextParts = (Vec<u8>, Vec<u32>);

impl From<TryFromIntError> for Diagnostic {
    /// An index that does not fit its target integer is past a resource limit.
    fn from(_: TryFromIntError) -> Self {
        Self::limit()
    }
}

impl From<FromUtf8Error> for Diagnostic {
    /// Host text that is not valid UTF-8 is rejected as a whole.
    fn from(_: FromUtf8Error) -> Self {
        Self::new("utf8")
    }
}

impl From<Utf8Error> for Diagnostic {
    /// Host text that is not valid UTF-8 is rejected as a whole.
    fn from(_: Utf8Error) -> Self {
        Self::new("utf8")
    }
}

/// Bounds failures stay diagnostics rather than compiler-generated panic paths.
pub(crate) fn at<T>(values: &[T], index: usize) -> Result<&T, Diagnostic> {
    values.get(index).ok_or_else(|| Diagnostic::new("shape"))
}

/// Mutable indexing uses the same checked contract as immutable indexing.
pub(crate) fn at_mut<T>(values: &mut [T], index: usize) -> Result<&mut T, Diagnostic> {
    values
        .get_mut(index)
        .ok_or_else(|| Diagnostic::new("shape"))
}

/// Host u32 indexes are checked before becoming native pointer-sized indexes.
pub(crate) fn row_index(row: u32) -> Result<usize, Diagnostic> {
    Ok(usize::try_from(row)?)
}

/// All persisted row, lane, and UTF-8 positions fit the same flat u32 format.
pub(crate) fn flat_index(index: usize) -> Result<u32, Diagnostic> {
    Ok(u32::try_from(index)?)
}

/// Lengths written for the host saturate at `u32::MAX`, which every decoder rejects.
pub(crate) fn saturating_u32(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// A packed row mask: bit i is row i, with low bits first in each byte.
#[derive(Debug, Default)]
pub(crate) struct Bits {
    bytes: Vec<u8>,
    len: usize,
}

impl Bits {
    /// Adopts a host mask only when its length and unused high bits are canonical.
    pub(crate) fn from_bytes(bytes: Vec<u8>, len: usize) -> Result<Self, Diagnostic> {
        if bytes.len() != len.div_ceil(BITS_PER_BYTE) {
            return Err(Diagnostic::new("shape"));
        }

        let remainder = len % BITS_PER_BYTE;
        if remainder > 0 && bytes.last().is_some_and(|last| last >> remainder != 0) {
            return Err(Diagnostic::new("shape"));
        }

        Ok(Self { bytes, len })
    }

    /// A new byte starts cleared so unused high bits never become valid rows.
    pub(crate) fn push(&mut self, value: bool) -> Result<(), Diagnostic> {
        if self.len.is_multiple_of(BITS_PER_BYTE) {
            self.bytes.push(0);
        }

        if value {
            let byte = at_mut(&mut self.bytes, self.len / BITS_PER_BYTE)?;
            *byte |= 1 << (self.len % BITS_PER_BYTE);
        }

        self.len += 1;
        Ok(())
    }

    /// Reads only existing rows; padding bits are not rows.
    pub(crate) fn get(&self, row: usize) -> Result<bool, Diagnostic> {
        if row >= self.len {
            return Err(Diagnostic::new("shape"));
        }

        let byte = at(&self.bytes, row / BITS_PER_BYTE)?;
        Ok(byte & (1 << (row % BITS_PER_BYTE)) != 0)
    }

    /// Physical bit count does not include padding in the last byte.
    pub(crate) const fn len(&self) -> usize {
        self.len
    }

    /// Ownership crosses the WASM seam once, without cloning the packed mask.
    pub(crate) fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}

/// UTF-8 values: offsets[i]..offsets[i+1] is row i's complete string.
#[derive(Debug)]
pub(crate) struct Texts {
    bytes: String,
    offsets: Vec<u32>,
}

impl Default for Texts {
    fn default() -> Self {
        Self {
            bytes: String::new(),
            offsets: vec![0],
        }
    }
}

impl Texts {
    /// Valid UTF-8 and monotonic character boundaries let reads avoid re-decoding strings.
    pub(crate) fn from_parts(bytes: Vec<u8>, offsets: Vec<u32>) -> Result<Self, Diagnostic> {
        if bytes.len() > MAX_TEXT_BYTES {
            return Err(Diagnostic::limit());
        }

        let text = String::from_utf8(bytes)?;
        if offsets.first() != Some(&0)
            || offsets.last().copied().map(row_index).transpose()? != Some(text.len())
        {
            return Err(Diagnostic::new("shape"));
        }

        let mut previous = 0;
        for &host_offset in &offsets {
            let offset = row_index(host_offset)?;
            if offset < previous || !text.is_char_boundary(offset) {
                return Err(Diagnostic::new("shape"));
            }

            previous = offset;
        }

        Ok(Self {
            bytes: text,
            offsets,
        })
    }

    /// Every appended string ends on UTF-8 boundaries and within the u32 byte limit.
    pub(crate) fn push(&mut self, value: &str) -> Result<(), Diagnostic> {
        let end = self
            .bytes
            .len()
            .checked_add(value.len())
            .ok_or_else(Diagnostic::limit)?;
        if end > MAX_TEXT_BYTES {
            return Err(Diagnostic::limit());
        }

        let end_offset = flat_index(end)?;
        self.bytes.push_str(value);
        self.offsets.push(end_offset);
        Ok(())
    }

    /// Invalid offsets or UTF-8 become diagnostics instead of an indexing panic.
    pub(crate) fn get(&self, row: usize) -> Result<&str, Diagnostic> {
        let start = row_index(*at(&self.offsets, row)?)?;
        let end = row_index(*at(&self.offsets, row + 1)?)?;
        self.bytes
            .get(start..end)
            .ok_or_else(|| Diagnostic::new("shape"))
    }

    /// The final offset is a sentinel, not an additional string.
    pub(crate) const fn len(&self) -> usize {
        self.offsets.len().saturating_sub(1)
    }

    /// Moves both lanes together so the byte ranges cannot drift from the offsets.
    pub(crate) fn into_parts(self) -> TextParts {
        (self.bytes.into_bytes(), self.offsets)
    }
}
