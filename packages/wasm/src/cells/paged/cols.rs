//! Structural column edits renumber records and blocks; no cell is copied.

use super::{Directory, PageState, PagedStorage, FREE_ENTRY, FREE_SLOT, NONE};

impl Directory {
    /// Opens `count` empty columns at `at`.
    fn insert_columns(&mut self, at: usize, count: usize) {
        if at < self.columns.len() {
            self.columns
                .splice(at..at, std::iter::repeat_with(Vec::new).take(count));
        }
    }

    /// Removes the columns `at..at + count`. Their ids are already cleared, so
    /// their leaves are back on the free list.
    fn remove_columns(&mut self, at: usize, count: usize) {
        let end = (at + count).min(self.columns.len());
        if at < end {
            debug_assert!(
                self.columns[at..end]
                    .iter()
                    .flatten()
                    .all(|&leaf| leaf == NONE),
                "removed directory columns still hold blocks"
            );
            self.columns.drain(at..end);
        }
    }
}

impl PagedStorage {
    /// Shifts columns `at..` right by `count`. Records, clean pages, dirty
    /// slots, pins and access order keep their ids.
    pub(in crate::cells) fn insert_cols(&mut self, at: usize, count: usize) {
        debug_assert!(
            !self.has_calculated(),
            "column edits drop calculated results first"
        );
        self.renumber_columns(|col| if col >= at { col + count } else { col });
        for directory in [&mut self.pages, &mut self.dirty, &mut self.calculated] {
            directory.insert_columns(at, count);
        }
    }

    /// Deletes columns `at..at + count`: their pages, pins and edits go, and
    /// later columns shift left. The eviction list stays in order, because
    /// renumbering keeps the order of the remaining columns.
    pub(in crate::cells) fn delete_cols(&mut self, at: usize, count: usize) {
        debug_assert!(
            !self.has_calculated(),
            "column edits drop calculated results first"
        );
        let deleted = at..at + count;
        self.drop_column_pages(&deleted);
        self.drop_column_edits(&deleted);
        self.renumber_columns(|col| if col >= deleted.end { col - count } else { col });
        for directory in [&mut self.pages, &mut self.dirty, &mut self.calculated] {
            directory.remove_columns(at, count);
        }
    }

    /// Frees the page records of `deleted` columns with their clean pages and pins.
    fn drop_column_pages(&mut self, deleted: &std::ops::Range<usize>) {
        let records = &self.records;
        let kept = |id: &u32| !deleted.contains(&(records[*id as usize].col as usize));
        self.read_pins.retain(kept);
        self.viewport_pins.retain(kept);

        for id in 0..self.records.len() as u32 {
            let record = &mut self.records[id as usize];
            if record.state == PageState::Free || !deleted.contains(&(record.col as usize)) {
                continue;
            }
            let (was_evictable, resident) =
                (record.is_evictable(), record.state == PageState::Resident);
            record.pins = 0;
            if was_evictable {
                self.lru_unlink(id);
            }
            if resident {
                self.drop_clean(id);
            } else {
                self.release_if_empty(id);
            }
        }
    }

    /// Frees the dirty slots and blocks of `deleted` columns.
    fn drop_column_edits(&mut self, deleted: &std::ops::Range<usize>) {
        for id in 0..self.slots.len() as u32 {
            let slot = self.slots[id as usize];
            // A free slot's block id may be stale: row moves rebuild the blocks.
            if slot.revision == FREE_SLOT {
                continue;
            }
            if deleted.contains(&(self.dirty_blocks[slot.block as usize].col as usize)) {
                self.remove_revision_slot(slot.revision, slot.revision_index);
                self.free_slot(id);
            }
        }
        for id in 0..self.dirty_blocks.len() as u32 {
            let block = &mut self.dirty_blocks[id as usize];
            if block.col != FREE_ENTRY && deleted.contains(&(block.col as usize)) {
                block.offsets.clear();
                block.slots.clear();
                self.release_dirty_block(id);
            }
        }
    }

    /// Renumbers the column of every live page record and dirty block.
    fn renumber_columns(&mut self, renumber: impl Fn(usize) -> usize) {
        for record in &mut self.records {
            if record.state != PageState::Free {
                record.col = renumber(record.col as usize) as u32;
            }
        }
        for block in &mut self.dirty_blocks {
            if block.col != FREE_ENTRY {
                block.col = renumber(block.col as usize) as u32;
            }
        }
    }
}
