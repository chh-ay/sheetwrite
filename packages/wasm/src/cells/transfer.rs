//! Resident storage only: an unloaded clean datasource cell stays unloaded.

use super::*;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};

fn write_keys(out: &mut Writer, keys: &FxHashSet<(usize, usize)>) {
    out.usize(keys.len());
    for &(a, b) in keys {
        out.usize(a);
        out.usize(b);
    }
}

#[cfg(any(target_arch = "wasm32", test))]
fn read_keys(input: &mut Reader<'_>) -> TransferResult<FxHashSet<(usize, usize)>> {
    (0..input.count()?)
        .map(|_| Ok((input.usize()?, input.usize()?)))
        .collect()
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
            out.usize(paged.chunk_rows);
            out.usize(paged.byte_budget);
            out.usize(paged.max_dirty_cells);
            out.usize(paged.chunks.len());

            for (&(col, chunk), value) in &paged.chunks {
                out.usize(col);
                out.usize(chunk);
                out.bytes(&value.kind);
                out.words(&value.payload);
                out.ints(&value.style);
                out.words(&value.loaded);
                out.u64(value.last_access.get());
            }

            out.usize(paged.dirty.len());

            for (&(row, col), value) in &paged.dirty {
                out.usize(row);
                out.usize(col);
                out.u64(value.payload);
                out.u64(value.revision);
                out.u32(value.style);
                out.usize(value.revision_index);
                out.u32(value.kind as u32);
            }

            out.usize(paged.dirty_by_revision.len());

            for (&revision, keys) in &paged.dirty_by_revision {
                out.u64(revision);
                out.usize(keys.len());

                for &(row, col) in keys {
                    out.usize(row);
                    out.usize(col);
                }
            }

            for keys in [
                &paged.read_pinned,
                &paged.pin_scratch,
                &paged.viewport_pinned,
                &paged.viewport_pin_scratch,
            ] {
                write_keys(out, keys);
            }

            let evictable = paged.evictable.borrow();
            out.usize(evictable.len());

            for &(access, col, chunk) in evictable.iter() {
                out.u64(access);
                out.usize(col);
                out.usize(chunk);
            }

            out.u64(paged.clock.get());
            out.u64(paged.eviction_candidate_checks);
            out.u64(paged.evictions);
        }

        if self.paged.is_some() {
            self.derived.write_transfer(out);
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
            let mut paged = PagedStorage::new(input.usize()?, input.usize()?, input.usize()?);

            for _ in 0..input.count()? {
                let key = (input.usize()?, input.usize()?);
                let chunk = CellChunk {
                    kind: input.bytes()?,
                    payload: input.words()?,
                    style: input.ints()?,
                    loaded: input.words()?,
                    last_access: Cell::new(input.u64()?),
                };

                if chunk.kind.len() != paged.chunk_rows
                    || chunk.payload.len() != paged.chunk_rows
                    || chunk.style.len() != paged.chunk_rows
                    || chunk.loaded.len() != paged.chunk_rows.div_ceil(BITS_PER_WORD)
                {
                    return Err("invalid transferred page chunk".into());
                }

                paged.chunks.insert(key, chunk);
            }

            for _ in 0..input.count()? {
                let key = (input.usize()?, input.usize()?);
                let value = DirtyCell {
                    payload: input.u64()?,
                    revision: input.u64()?,
                    style: input.u32()?,
                    revision_index: input.usize()?,
                    kind: input.u32()? as u8,
                };

                paged.dirty.insert(key, value);
            }

            for _ in 0..input.count()? {
                let revision = input.u64()?;
                let keys = (0..input.count()?)
                    .map(|_| Ok((input.usize()?, input.usize()?)))
                    .collect::<TransferResult<Vec<_>>>()?;
                paged.dirty_by_revision.insert(revision, keys);
            }

            paged.read_pinned = read_keys(input)?;
            paged.pin_scratch = read_keys(input)?;
            paged.viewport_pinned = read_keys(input)?;
            paged.viewport_pin_scratch = read_keys(input)?;

            for _ in 0..input.count()? {
                paged
                    .evictable
                    .get_mut()
                    .insert((input.u64()?, input.usize()?, input.usize()?));
            }

            paged.clock.set(input.u64()?);
            paged.eviction_candidate_checks = input.u64()?;
            paged.evictions = input.u64()?;
            Some(paged)
        } else {
            if n_cols.checked_mul(row_count) != Some(kind.len()) {
                return Err("invalid transferred dense dimensions".into());
            }

            None
        };

        let cells = n_cols
            .checked_mul(row_count)
            .ok_or("transferred dimensions overflow")?;
        let derived = if paged.is_some() {
            DerivedOverlay::read_transfer(input, cells)?
        } else {
            DerivedOverlay::default()
        };
        let dense_calculated_cells = if paged.is_none() {
            let mut count = 0;
            for (&kind, &payload) in kind.iter().zip(&payload) {
                if kind & CALCULATED != 0 {
                    if !matches!(kind & !CALCULATED, KIND_EMPTY | KIND_FORMULA)
                        || payload == crate::derived::ABSENT_TAG
                    {
                        return Err("invalid transferred dense calculated slot".into());
                    }
                    count += 1;
                } else if kind > KIND_FORMULA {
                    return Err("invalid transferred dense source kind".into());
                }
            }
            count
        } else {
            0
        };
        Ok(Self {
            n_cols,
            row_count,
            kind,
            payload,
            style,
            paged,
            derived,
            dense_calculated_cells,
        })
    }
}
