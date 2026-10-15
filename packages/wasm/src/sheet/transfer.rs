//! Resident storage only: an unloaded clean datasource cell stays unloaded.
use super::*;
use crate::transfer::{Reader, TransferResult, Writer};

fn write_keys(out: &mut Writer, keys: &HashSet<(usize, usize)>) {
    out.usize(keys.len());
    for &(a, b) in keys {
        out.usize(a);
        out.usize(b);
    }
}

fn read_keys(input: &mut Reader<'_>) -> TransferResult<HashSet<(usize, usize)>> {
    (0..input.count()?)
        .map(|_| Ok((input.usize()?, input.usize()?)))
        .collect()
}

impl SheetData {
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
                &paged.pinned,
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

        out.usize(self.spill_ranges.len());
        for (&(row, col), range) in &self.spill_ranges {
            out.u32(row);
            out.u32(col);
            out.u32(range.anchor.0);
            out.u32(range.anchor.1);
            out.u32(range.row_end);
            out.u32(range.col_end);
        }

        out.usize(self.spill_owners.len());
        for (&(row, col), &(anchor_row, anchor_col)) in &self.spill_owners {
            out.u32(row);
            out.u32(col);
            out.u32(anchor_row);
            out.u32(anchor_col);
        }

        out.usize(self.spill_errors.len());
        for (&(row, col), &error) in &self.spill_errors {
            out.u32(row);
            out.u32(col);
            out.error(Some(error));
        }

        out.usize(self.spill_blockers.len());
        for blocker in &self.spill_blockers {
            out.u32(blocker.row_start);
            out.u32(blocker.col_start);
            out.u32(blocker.row_end);
            out.u32(blocker.col_end);
        }

        out.usize(self.dirty_cells.len());
        for &(row, col) in &self.dirty_cells {
            out.u32(row);
            out.u32(col);
        }

        out.bool(self.all_dirty);
        // Conditional rules contain parsed ASTs and are lazily rebuilt by the host.
    }

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

            paged.pinned = read_keys(input)?;
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

        let mut sheet = Self {
            n_cols,
            row_count,
            kind,
            payload,
            style,
            paged,
            formulas: HashMap::new(),
            spill_ranges: HashMap::new(),
            spill_owners: HashMap::new(),
            spill_errors: HashMap::new(),
            spill_blockers: Vec::new(),
            dirty_cells: HashSet::new(),
            all_dirty: false,
            cond_rules: Vec::new(),
        };

        for _ in 0..input.count()? {
            let key = (input.u32()?, input.u32()?);
            let range = SpillRange {
                anchor: (input.u32()?, input.u32()?),
                row_end: input.u32()?,
                col_end: input.u32()?,
            };
            sheet.spill_ranges.insert(key, range);
        }

        for _ in 0..input.count()? {
            sheet
                .spill_owners
                .insert((input.u32()?, input.u32()?), (input.u32()?, input.u32()?));
        }

        for _ in 0..input.count()? {
            let key = (input.u32()?, input.u32()?);
            sheet.spill_errors.insert(
                key,
                input.error()?.ok_or("missing transferred spill error")?,
            );
        }

        for _ in 0..input.count()? {
            sheet.spill_blockers.push(SpillBlocker {
                row_start: input.u32()?,
                col_start: input.u32()?,
                row_end: input.u32()?,
                col_end: input.u32()?,
            });
        }

        for _ in 0..input.count()? {
            sheet.dirty_cells.insert((input.u32()?, input.u32()?));
        }

        sheet.all_dirty = input.bool()?;
        Ok(sheet)
    }
}
