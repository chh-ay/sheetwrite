//! Structural row edits visit resident pages, never the logical sheet extent.

#[cfg(test)]
mod tests;

use crate::sorting::{key96, sort_by_key96, sort_usize_pairs};

use super::{CleanPage, Directory, PagedStorage, BITS_PER_WORD, FREE_SLOT, NONE};

/// An edit maps the retained suffix `from..old_rows` to `to..new_rows`.
#[derive(Clone, Copy)]
pub(super) struct RowMove {
    pub(super) from: usize,
    pub(super) to: usize,
    pub(super) old_rows: usize,
}

impl RowMove {
    fn start(self) -> usize {
        self.from.min(self.to)
    }

    const fn new_rows(self) -> usize {
        self.old_rows - self.from + self.to
    }

    fn source(self, row: usize) -> Option<usize> {
        if row < self.start() {
            Some(row)
        } else if row < self.to || row >= self.new_rows() {
            None
        } else {
            Some(row - self.to + self.from)
        }
    }

    fn destination(self, row: usize) -> Option<usize> {
        if row < self.start() {
            Some(row)
        } else if row < self.from {
            None
        } else {
            Some(row - self.from + self.to)
        }
    }
}

/// Low `len` bits, including the full-word case without shifting by 64.
const fn mask(len: usize) -> u64 {
    u64::MAX >> (BITS_PER_WORD - len)
}

/// Up to one word of loaded bits, possibly crossing a word boundary.
const fn read_bits(bits: &[u64], start: usize, len: usize) -> u64 {
    let word = start / BITS_PER_WORD;
    let shift = start % BITS_PER_WORD;
    let low = bits[word] >> shift;
    let high = if shift != 0 && shift + len > BITS_PER_WORD {
        bits[word + 1] << (BITS_PER_WORD - shift)
    } else {
        0
    };
    (low | high) & mask(len)
}

const fn write_bits(bits: &mut [u64], start: usize, value: u64, len: usize) {
    let word = start / BITS_PER_WORD;
    let shift = start % BITS_PER_WORD;
    let selected = mask(len);
    bits[word] = (bits[word] & !(selected << shift)) | (value << shift);
    if shift != 0 && shift + len > BITS_PER_WORD {
        let high = BITS_PER_WORD - shift;
        bits[word + 1] = (bits[word + 1] & !(selected >> high)) | (value >> high);
    }
}

fn copy_loaded(source: &[u64], from: usize, target: &mut [u64], to: usize, len: usize) {
    for done in (0..len).step_by(BITS_PER_WORD) {
        let take = (len - done).min(BITS_PER_WORD);
        write_bits(
            target,
            to + done,
            read_bits(source, from + done, take),
            take,
        );
    }
}

impl CleanPage {
    fn copy_rows(&mut self, source: &Self, from: usize, to: usize, len: usize) {
        let input = from..from + len;
        let output = to..to + len;
        self.kind[output.clone()].copy_from_slice(&source.kind[input.clone()]);
        self.payload[output.clone()].copy_from_slice(&source.payload[input.clone()]);
        self.style[output].copy_from_slice(&source.style[input]);
        copy_loaded(&source.loaded, from, &mut self.loaded, to, len);
    }
}

impl PagedStorage {
    fn clean_index(&self, col: usize, page: usize) -> Option<usize> {
        let id = self.page_id(col, page);
        if id == NONE {
            return None;
        }
        let clean = self.records[id as usize].clean;
        (clean != NONE).then_some(clean as usize)
    }

    /// Source pages and their mapped destinations are the only pages an edit
    /// can change. Including both also clears pages vacated by a large move.
    fn moved_pages(&self, movement: RowMove) -> Vec<(usize, usize)> {
        let mut pages = Vec::new();
        for record in self.live_records().filter(|record| record.clean != NONE) {
            let col = record.col as usize;
            let page = record.page as usize;
            let first = page * self.chunk_rows;
            let end = (first + self.chunk_rows).min(movement.old_rows);
            if end <= movement.start() {
                continue;
            }
            pages.push((col, page));
            let from = first.max(movement.from);
            if from < end {
                let to = from - movement.from + movement.to;
                let last = to + end - from - 1;
                pages.push((col, to / self.chunk_rows));
                pages.push((col, last / self.chunk_rows));
            }
        }
        sort_usize_pairs(&mut pages);
        pages.dedup();
        if movement.to > movement.from {
            pages.reverse();
        }
        pages
    }

    /// Fill one destination through a scratch page. Traversal goes against the
    /// move direction so even overlapping source slices are still untouched.
    fn moved_page(&self, col: usize, page: usize, movement: RowMove, target: &mut CleanPage) {
        target.reset();
        let first = page * self.chunk_rows;
        let end = (first + self.chunk_rows).min(movement.new_rows());
        let mut row = first;
        while row < end {
            let Some(source_row) = movement.source(row) else {
                row = movement.to.min(end);
                continue;
            };
            let (source_page, offset) = self.split(source_row);
            let boundary = if row < movement.start() {
                movement.start()
            } else {
                end
            };
            let len = (boundary - row)
                .min(self.chunk_rows - offset)
                .min(end - row);
            if let Some(index) = self.clean_index(col, source_page) {
                target.copy_rows(&self.clean[index], offset, row - first, len);
            }
            row += len;
        }
    }

    /// Attach without eviction: an edit must not evict a source it has yet to
    /// move. The next datasource load applies the clean-page budget again.
    fn store_moved_page(&mut self, col: usize, page: usize, source: &CleanPage) {
        let loaded = source.loaded.iter().any(|&word| word != 0);
        let existing = self.clean_index(col, page);
        if !loaded {
            if let Some(clean) = existing {
                let id = self.page_id(col, page);
                if self.records[id as usize].is_evictable() {
                    self.lru_unlink(id);
                }
                self.records[id as usize].clean = NONE;
                self.free_clean.push(clean as u32);
                self.release_if_empty(id);
            }
            return;
        }
        let clean = existing.unwrap_or_else(|| {
            let id = self.record_or_insert(col, page);
            let allocated = if let Some(reused) = self.free_clean.pop() {
                reused
            } else {
                self.clean.push(CleanPage::new(self.chunk_rows));
                (self.clean.len() - 1) as u32
            };
            let access = self.next_access();
            let record = &mut self.records[id as usize];
            record.clean = allocated;
            record.last_access.set(access);
            if record.is_evictable() {
                self.lru_link_after(id, self.lru_tail.get());
            }
            allocated as usize
        });
        self.clean[clean].copy_rows(source, 0, 0, self.chunk_rows);
    }

    /// Keep slot ids and their revision-list positions; only the block index
    /// and row offset change. Deleted slots leave their revision lists too.
    fn move_dirty_rows(&mut self, movement: RowMove) {
        let mut positions: Vec<_> = self
            .slots
            .iter()
            .enumerate()
            .filter(|(_, slot)| slot.revision != FREE_SLOT)
            .map(|(id, slot)| {
                let (row, col) = self.slot_cell(slot);
                (col, row, id as u32)
            })
            .collect();
        sort_by_key96(&mut positions, |&(col, row, id)| {
            key96(col as u32, row as u32, id)
        });
        self.dirty = Directory::default();
        self.dirty_blocks.clear();
        self.free_dirty_blocks.clear();
        for (col, row, id) in positions {
            let Some(destination) = movement.destination(row) else {
                let slot = self.slots[id as usize];
                self.remove_revision_slot(slot.revision, slot.revision_index);
                self.free_slot(id);
                continue;
            };
            let block = self.dirty_block_or_insert(destination, col);
            let offset = destination & (super::DIRTY_BLOCK_ROWS - 1);
            let slot = &mut self.slots[id as usize];
            slot.block = block;
            slot.offset = offset as u16;
            self.dirty_blocks[block as usize].insert(offset, id);
        }
    }

    /// Retain the prefix and move the suffix of a structural row edit in place.
    pub(in crate::cells) fn move_rows(&mut self, from: usize, to: usize, old_rows: usize) {
        let movement = RowMove { from, to, old_rows };
        let pages = self.moved_pages(movement);
        let mut scratch = CleanPage::new(self.chunk_rows);
        for (col, page) in pages {
            self.moved_page(col, page, movement, &mut scratch);
            self.store_moved_page(col, page, &scratch);
        }
        self.move_dirty_rows(movement);
    }

    /// Inspect loaded bits without reading values or changing eviction order.
    /// Dirty edits count as loaded even when their clean source was evicted.
    pub(in crate::cells) fn range_loaded(
        &self,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
    ) -> bool {
        (c0..=c1).all(|col| self.column_loaded(col, r0, r1))
    }

    fn column_loaded(&self, col: usize, start: usize, end: usize) -> bool {
        let mut row = start;
        while row <= end {
            let (page, offset) = self.split(row);
            let len = (end - row).saturating_add(1).min(self.chunk_rows - offset);
            let clean = self.clean_index(col, page).map(|index| &self.clean[index]);
            for done in (0..len).step_by(BITS_PER_WORD) {
                let take = (len - done).min(BITS_PER_WORD);
                let loaded =
                    clean.map_or(0, |source| read_bits(&source.loaded, offset + done, take));
                let mut missing = !loaded & mask(take);
                while missing != 0 {
                    if !self.is_dirty(row + done + missing.trailing_zeros() as usize, col) {
                        return false;
                    }
                    missing &= missing - 1;
                }
            }
            let Some(next) = row.checked_add(len) else {
                break;
            };
            row = next;
        }
        true
    }
}
