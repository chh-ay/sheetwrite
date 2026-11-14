//! Resident storage only: an unloaded clean datasource cell stays unloaded.

use super::*;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};

/// The error of a transferred kind that [`source_kind`] refuses.
#[cfg(any(target_arch = "wasm32", test))]
pub(super) const INVALID_SOURCE_KIND: &str = "invalid transferred source kind";

/// The source kind a transferred value names, or `None` for a value the store
/// cannot hold. Dense and paged imports both admit kinds through it, so a kind
/// is refused whatever width carried it.
#[cfg(any(target_arch = "wasm32", test))]
#[inline]
pub(super) fn source_kind(raw: u32) -> Option<u8> {
    u8::try_from(raw).ok().filter(|kind| *kind <= KIND_FORMULA)
}

/// Whether every kind of a byte-wide slice passes [`source_kind`]. The same rule
/// as a fold over the slice, so the check of a clean page vectorizes.
#[cfg(any(target_arch = "wasm32", test))]
#[inline]
pub(super) fn all_source_kinds(kinds: &[u8]) -> bool {
    kinds.iter().fold(KIND_EMPTY, |max, &kind| max.max(kind)) <= KIND_FORMULA
}

impl CellStorage {
    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        out.usize(self.n_cols);
        out.usize(self.row_count);
        out.bytes(&self.kind);
        out.words(&self.payload);
        out.ints(&self.style);
        out.bool(self.paged.is_some());

        if let Some(paged) = &self.paged {
            paged.write_transfer(out);
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let n_cols = input.usize()?;
        let row_count = input.usize()?;
        let kind = input.bytes()?;
        let payload = input.words()?;
        let style = input.ints()?;

        if kind.len() != payload.len() || kind.len() != style.len() {
            return Err("invalid transferred cell arrays".into());
        }

        let paged = if input.bool()? {
            Some(Box::new(PagedStorage::read_transfer(input)?))
        } else {
            if n_cols.checked_mul(row_count) != Some(kind.len()) {
                return Err("invalid transferred dense dimensions".into());
            }

            None
        };

        let mut dense_calculated_cells = 0;
        for (&kind, &payload) in kind.iter().zip(&payload) {
            if kind & CALCULATED != 0 {
                if !matches!(kind & !CALCULATED, KIND_EMPTY | KIND_FORMULA) || payload == ABSENT_TAG
                {
                    return Err("invalid transferred dense calculated slot".into());
                }
                dense_calculated_cells += 1;
            } else if source_kind(kind.into()).is_none() {
                return Err(INVALID_SOURCE_KIND.into());
            }
        }

        Ok(Self {
            n_cols,
            row_count,
            kind,
            payload,
            style,
            paged,
            dense_calculated_cells,
        })
    }
}
