//! Resident storage only: an unloaded clean datasource cell stays unloaded.

use super::*;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};

/// Admits one transferred source kind. Dense and paged imports both call it, so
/// a kind the store cannot hold is refused whatever width carried it.
#[cfg(any(target_arch = "wasm32", test))]
pub(super) fn admit_source_kind(raw: u32) -> TransferResult<u8> {
    u8::try_from(raw)
        .ok()
        .filter(|kind| *kind <= KIND_FORMULA)
        .ok_or_else(|| "invalid transferred source kind".into())
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
            } else {
                admit_source_kind(kind.into())?;
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
