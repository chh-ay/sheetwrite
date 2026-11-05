//! Paged source storage. Three directories map a column and a row block to a
//! slab id, so every cell lookup is a chain of array indexes:
//!
//! - Page records, one per (column, chunk), hold the clean page, the pins and
//!   the eviction links. Clean pages hold reloadable datasource values and are
//!   the only state the byte budget evicts.
//! - Dirty blocks of [`DIRTY_BLOCK_ROWS`] rows hold the unacknowledged edits:
//!   per-band dirty bits and the dirty rows in order, each naming a flat slot.
//!   Revision lists name the slots each write owns.
//! - Calculated blocks of at most 1,024 rows, and no more than a chunk, hold
//!   paged formula results.
//!
//! Dirty blocks have a fixed size and calculated blocks a bounded one, so
//! their memory follows the edits and results rather than the sheet extent.

use std::cell::Cell;

use super::{StorageEntry, MAX_PAGE_CHUNK_ROWS};
use crate::derived::{decode_cell, encode_cell, ABSENT_TAG};
use crate::memory::{
    MemoryOwnerStats, StoreMemoryStats, FORMULAS, PAGED_DIRTY_BITMAPS, PAGED_INDEXES, PAGED_KINDS,
    PAGED_LOADED_BITMAPS, PAGED_PAYLOADS, PAGED_STYLES,
};
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferResult};
#[cfg(any(target_arch = "wasm32", test))]
use crate::types::KIND_FORMULA;
use crate::types::{CellKey, KIND_EMPTY};

pub(super) const BITS_PER_WORD: usize = 64;

/// An absent page, block, slab entry or list link.
const NONE: u32 = u32::MAX;

/// The read window pins the page.
const READ_PIN: u8 = 1 << 0;
/// A rendered viewport band pins the page.
const VIEWPORT_PIN: u8 = 1 << 1;
const PINNED: u8 = READ_PIN | VIEWPORT_PIN;
/// Set-membership bit used while a pin replacement runs. Every operation that
/// sets it clears it before returning.
const MARK: u8 = 1 << 2;

/// The column of a free slab entry.
const FREE_ENTRY: u32 = u32::MAX;
/// The revision of a slot on the free list. Live writes never use revision 0.
const FREE_SLOT: u64 = 0;

const DIRTY_BLOCK_SHIFT: u32 = 12;
/// Rows per dirty block. Row offsets inside a block fit in a `u16`.
pub(super) const DIRTY_BLOCK_ROWS: usize = 1 << DIRTY_BLOCK_SHIFT;
/// Rows per dirty band bit: a block has one bit per band in a `u64`.
const DIRTY_BAND_SHIFT: u32 = DIRTY_BLOCK_SHIFT - u64::BITS.trailing_zeros();

/// log2 of the most rows a calculated block holds: 8 KiB of results.
const MAX_CALCULATED_BLOCK_SHIFT: u32 = 10;

#[inline]
pub(super) fn bit(bits: &[u64], offset: usize) -> bool {
    bits[offset / BITS_PER_WORD] & (1 << (offset % BITS_PER_WORD)) != 0
}

#[inline]
fn set_bit(bits: &mut [u64], offset: usize) {
    bits[offset / BITS_PER_WORD] |= 1 << (offset % BITS_PER_WORD);
}

/// Takes a free slab entry or appends `value`, returning its id.
fn allocate<T>(slab: &mut Vec<T>, free: &mut Vec<u32>, value: T) -> u32 {
    if let Some(id) = free.pop() {
        slab[id as usize] = value;
        return id;
    }

    slab.push(value);
    (slab.len() - 1) as u32
}

/// log2 of the block ids in one directory leaf.
const LEAF_SHIFT: u32 = 6;
/// Block ids per directory leaf: 256 B of ids.
const LEAF_IDS: usize = 1 << LEAF_SHIFT;

/// Maps (column, block) to a slab id or [`NONE`] through two levels:
/// `columns[col][block / LEAF_IDS]` names a leaf of [`LEAF_IDS`] ids in
/// `leaves`. A column's leaf list grows only to its highest touched block, and
/// a leaf is freed when its last id clears, so the directory follows the live
/// blocks rather than the extent a scroll has passed.
#[derive(Default)]
struct Directory {
    columns: Vec<Vec<u32>>,
    leaves: Vec<u32>,
    /// Live ids per leaf.
    leaf_ids: Vec<u32>,
    free_leaves: Vec<u32>,
}

impl Directory {
    #[inline]
    fn get(&self, col: usize, block: usize) -> u32 {
        let Some(leaves) = self.columns.get(col) else {
            return NONE;
        };

        match leaves.get(block >> LEAF_SHIFT) {
            None | Some(&NONE) => NONE,
            Some(&leaf) => self.leaves[leaf as usize * LEAF_IDS + (block & (LEAF_IDS - 1))],
        }
    }

    fn set(&mut self, col: usize, block: usize, id: u32) {
        if self.columns.len() <= col {
            self.columns.resize_with(col + 1, Vec::new);
        }

        let leaf_index = block >> LEAF_SHIFT;
        let leaves = &mut self.columns[col];
        if leaves.len() <= leaf_index {
            leaves.resize(leaf_index + 1, NONE);
        }

        if leaves[leaf_index] == NONE {
            let leaf = if let Some(reused) = self.free_leaves.pop() {
                reused
            } else {
                self.leaves.resize(self.leaves.len() + LEAF_IDS, NONE);
                self.leaf_ids.push(0);
                (self.leaf_ids.len() - 1) as u32
            };
            leaves[leaf_index] = leaf;
        }

        let leaf = leaves[leaf_index] as usize;
        let entry = &mut self.leaves[leaf * LEAF_IDS + (block & (LEAF_IDS - 1))];
        self.leaf_ids[leaf] += u32::from(*entry == NONE);
        *entry = id;
    }

    fn clear(&mut self, col: usize, block: usize) {
        let leaf_index = block >> LEAF_SHIFT;
        let leaf = self.columns[col][leaf_index] as usize;
        let entry = &mut self.leaves[leaf * LEAF_IDS + (block & (LEAF_IDS - 1))];
        if *entry == NONE {
            return;
        }

        *entry = NONE;
        self.leaf_ids[leaf] -= 1;

        if self.leaf_ids[leaf] == 0 {
            self.columns[col][leaf_index] = NONE;
            self.free_leaves.push(leaf as u32);
        }
    }

    fn add_memory_stats(&self, owner: &mut MemoryOwnerStats) {
        owner.add_vec::<Vec<u32>>(self.columns.len(), self.columns.capacity());
        for leaves in &self.columns {
            owner.add_vec::<u32>(leaves.len(), leaves.capacity());
        }
        owner.add_vec::<u32>(self.leaves.len(), self.leaves.capacity());
        owner.add_vec::<u32>(self.leaf_ids.len(), self.leaf_ids.capacity());
        owner.add_vec::<u32>(self.free_leaves.len(), self.free_leaves.capacity());
    }

    fn write_transfer(&self, out: &mut Writer) {
        out.usize(self.columns.len());
        for leaves in &self.columns {
            out.ints(leaves);
        }
        out.ints(&self.leaves);
        out.ints(&self.leaf_ids);
        out.ints(&self.free_leaves);
    }

    #[cfg(any(target_arch = "wasm32", test))]
    fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let columns = (0..input.count()?)
            .map(|_| input.ints())
            .collect::<TransferResult<_>>()?;
        let directory = Self {
            columns,
            leaves: input.ints()?,
            leaf_ids: input.ints()?,
            free_leaves: input.ints()?,
        };

        let leaf_count = directory.leaf_ids.len();
        let leaves_in_range = directory
            .columns
            .iter()
            .flatten()
            .chain(&directory.free_leaves)
            .all(|&leaf| leaf == NONE || (leaf as usize) < leaf_count);
        if directory.leaves.len() != leaf_count * LEAF_IDS || !leaves_in_range {
            return Err("invalid transferred directory".into());
        }

        Ok(directory)
    }

    #[cfg(any(target_arch = "wasm32", test))]
    fn ids_below(&self, len: usize) -> bool {
        self.leaves
            .iter()
            .all(|&id| id == NONE || (id as usize) < len)
    }
}

/// Clean, reloadable source values of one page. Eviction frees the entry and
/// the next loaded page reuses its arrays.
pub(super) struct CleanPage {
    pub(super) kind: Vec<u8>,
    pub(super) payload: Vec<u64>,
    pub(super) style: Vec<u32>,
    pub(super) loaded: Vec<u64>,
}

impl CleanPage {
    fn new(rows: usize) -> Self {
        Self {
            kind: vec![KIND_EMPTY; rows],
            payload: vec![0; rows],
            style: vec![0; rows],
            loaded: vec![0; rows.div_ceil(BITS_PER_WORD)],
        }
    }

    fn reset(&mut self) {
        self.kind.fill(KIND_EMPTY);
        self.payload.fill(0);
        self.style.fill(0);
        self.loaded.fill(0);
    }

    fn byte_len(&self) -> usize {
        self.kind.len()
            + self.payload.len() * std::mem::size_of::<u64>()
            + self.style.len() * std::mem::size_of::<u32>()
            + self.loaded.len() * std::mem::size_of::<u64>()
    }
}

/// One (column, chunk) of the page directory: its clean page, pins and
/// eviction links. A page is on the eviction list while it is clean-resident
/// and unpinned.
struct PageRecord {
    col: u32,
    page: u32,
    clean: u32,
    prev: Cell<u32>,
    next: Cell<u32>,
    last_access: Cell<u64>,
    flags: u8,
}

impl PageRecord {
    fn new(col: u32, page: u32) -> Self {
        Self {
            col,
            page,
            clean: NONE,
            prev: Cell::new(NONE),
            next: Cell::new(NONE),
            last_access: Cell::new(0),
            flags: 0,
        }
    }

    #[inline]
    fn is_evictable(&self) -> bool {
        self.clean != NONE && self.flags & PINNED == 0
    }

    /// Eviction order: oldest access first, then directory position.
    fn eviction_key(&self) -> (u64, u32, u32) {
        (self.last_access.get(), self.col, self.page)
    }
}

/// The unacknowledged edits of one dirty block: the dirty row offsets in
/// order, their slot ids, and one dirty bit per band of rows. A clear band bit
/// answers a clean read without searching; a dirty read binary-searches the
/// offsets.
pub(crate) struct DirtyBlock {
    bands: u64,
    col: u32,
    block: u32,
    offsets: Vec<u16>,
    slots: Vec<u32>,
}

impl DirtyBlock {
    fn new(col: u32, block: u32) -> Self {
        Self {
            bands: 0,
            col,
            block,
            offsets: Vec::new(),
            slots: Vec::new(),
        }
    }

    #[inline]
    fn band_bit(offset: usize) -> u64 {
        1 << (offset >> DIRTY_BAND_SHIFT)
    }

    #[inline]
    fn position(&self, offset: usize) -> Result<usize, usize> {
        self.offsets.binary_search(&(offset as u16))
    }

    #[inline]
    fn slot(&self, offset: usize) -> Option<u32> {
        if self.bands & Self::band_bit(offset) == 0 {
            return None;
        }

        self.position(offset).ok().map(|at| self.slots[at])
    }

    fn insert(&mut self, offset: usize, slot: u32) {
        match self.position(offset) {
            Ok(at) => self.slots[at] = slot,
            Err(at) => {
                self.offsets.insert(at, offset as u16);
                self.slots.insert(at, slot);
                self.bands |= Self::band_bit(offset);
            }
        }
    }

    fn remove(&mut self, offset: usize) {
        let Ok(at) = self.position(offset) else {
            return;
        };

        self.offsets.remove(at);
        self.slots.remove(at);

        // Offsets are sorted, so another row of the same band would be a neighbor.
        let band = offset >> DIRTY_BAND_SHIFT;
        let shares_band = |neighbor: Option<&u16>| {
            neighbor.is_some_and(|&row| usize::from(row) >> DIRTY_BAND_SHIFT == band)
        };
        let before = at.checked_sub(1).and_then(|index| self.offsets.get(index));

        if !shares_band(before) && !shares_band(self.offsets.get(at)) {
            self.bands &= !Self::band_bit(offset);
        }
    }

    /// Keeps the rows whose slot `keep` accepts, then recomputes the band bits.
    fn retain(&mut self, mut keep: impl FnMut(u32) -> bool) {
        let mut kept = 0;

        for at in 0..self.slots.len() {
            if keep(self.slots[at]) {
                self.offsets[kept] = self.offsets[at];
                self.slots[kept] = self.slots[at];
                kept += 1;
            }
        }

        self.offsets.truncate(kept);
        self.slots.truncate(kept);
        self.rebuild_bands();
    }

    fn rebuild_bands(&mut self) {
        self.bands = self.offsets.iter().fold(0, |bands, &offset| {
            bands | Self::band_bit(usize::from(offset))
        });
    }
}

/// One unacknowledged edit and the revision that owns it.
#[derive(Clone, Copy)]
pub(crate) struct DirtySlot {
    pub(super) payload: u64,
    revision: u64,
    pub(super) style: u32,
    /// The dirty block holding the edit.
    block: u32,
    /// Position of this slot in its revision's slot list.
    revision_index: u32,
    /// Row offset inside the block.
    offset: u16,
    pub(super) kind: u8,
}

/// A dirty block and the slot array it indexes.
#[derive(Clone, Copy)]
pub(crate) struct DirtyView<'a> {
    block: &'a DirtyBlock,
    slots: &'a [DirtySlot],
}

impl<'a> DirtyView<'a> {
    /// The edit at `offset` rows into the block.
    #[inline]
    pub(super) fn get(&self, offset: usize) -> Option<&'a DirtySlot> {
        let slots = self.slots;
        self.block.slot(offset).map(|id| &slots[id as usize])
    }
}

/// Paged formula results of one calculated block. [`ABSENT_TAG`] marks a row
/// without one.
struct CalculatedBlock {
    col: u32,
    block: u32,
    cells: u32,
    values: Vec<u64>,
}

/// The slot ids one revision owns, in write order.
struct RevisionSlots {
    revision: u64,
    slots: Vec<u32>,
}

/// What a borrowed run reads around one cell. Each part is bounded by its own
/// block: `*_first_row` is the block's first row in the column.
pub(super) struct RunView<'a> {
    pub(super) clean: Option<&'a CleanPage>,
    pub(super) clean_first_row: usize,
    pub(super) dirty: Option<DirtyView<'a>>,
    pub(super) dirty_first_row: usize,
    pub(super) calculated: &'a [u64],
    pub(super) calculated_first_row: usize,
    /// The first row after every part's block.
    pub(super) end_row: usize,
}

pub(super) struct PagedStorage {
    pub(super) chunk_rows: usize,
    page_shift: u32,
    /// log2 of the rows per calculated block.
    calculated_shift: u32,
    pub(super) byte_budget: usize,
    pub(super) max_dirty_cells: usize,
    pages: Directory,
    records: Vec<PageRecord>,
    free_records: Vec<u32>,
    clean: Vec<CleanPage>,
    free_clean: Vec<u32>,
    dirty: Directory,
    dirty_blocks: Vec<DirtyBlock>,
    free_dirty_blocks: Vec<u32>,
    slots: Vec<DirtySlot>,
    free_slots: Vec<u32>,
    /// Sorted by revision.
    revisions: Vec<RevisionSlots>,
    calculated: Directory,
    calculated_blocks: Vec<CalculatedBlock>,
    free_calculated_blocks: Vec<u32>,
    read_pins: Vec<u32>,
    viewport_pins: Vec<u32>,
    /// Pin replacement and acknowledgement scratch, empty between calls.
    scratch: Vec<u32>,
    lru_head: Cell<u32>,
    lru_tail: Cell<u32>,
    clock: Cell<u64>,
    eviction_candidate_checks: u64,
    evictions: u64,
}

impl PagedStorage {
    /// A chunk holds a power of two of rows, so `chunk_rows` rounds up to
    /// one. A size above [`MAX_PAGE_CHUNK_ROWS`] is rejected before rounding,
    /// which could otherwise overflow to zero.
    pub(super) fn new(
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> Result<Self, String> {
        let chunk_rows = Some(chunk_rows.max(1))
            .filter(|&rows| rows <= MAX_PAGE_CHUNK_ROWS)
            .map(usize::next_power_of_two)
            .ok_or_else(|| {
                format!("paged sheet chunk of {chunk_rows} rows exceeds {MAX_PAGE_CHUNK_ROWS} rows")
            })?;

        Ok(Self {
            chunk_rows,
            page_shift: chunk_rows.trailing_zeros(),
            calculated_shift: chunk_rows.trailing_zeros().min(MAX_CALCULATED_BLOCK_SHIFT),
            byte_budget,
            max_dirty_cells,
            pages: Directory::default(),
            records: Vec::new(),
            free_records: Vec::new(),
            clean: Vec::new(),
            free_clean: Vec::new(),
            dirty: Directory::default(),
            dirty_blocks: Vec::new(),
            free_dirty_blocks: Vec::new(),
            slots: Vec::new(),
            free_slots: Vec::new(),
            revisions: Vec::new(),
            calculated: Directory::default(),
            calculated_blocks: Vec::new(),
            free_calculated_blocks: Vec::new(),
            read_pins: Vec::new(),
            viewport_pins: Vec::new(),
            scratch: Vec::new(),
            lru_head: Cell::new(NONE),
            lru_tail: Cell::new(NONE),
            clock: Cell::new(0),
            eviction_candidate_checks: 0,
            evictions: 0,
        })
    }

    /// The page index and the row offset inside it.
    #[inline]
    pub(super) fn split(&self, row: usize) -> (usize, usize) {
        (row >> self.page_shift, row & (self.chunk_rows - 1))
    }

    #[inline]
    pub(super) fn page_id(&self, col: usize, page: usize) -> u32 {
        self.pages.get(col, page)
    }

    #[inline]
    fn clean_page(&self, row: usize, col: usize) -> (Option<&CleanPage>, usize) {
        let (page, offset) = self.split(row);
        let id = self.page_id(col, page);
        if id == NONE {
            return (None, offset);
        }

        let clean = self.records[id as usize].clean;
        ((clean != NONE).then(|| &self.clean[clean as usize]), offset)
    }

    fn record_or_insert(&mut self, col: usize, page: usize) -> u32 {
        let existing = self.page_id(col, page);
        if existing != NONE {
            return existing;
        }

        let record = PageRecord::new(col as u32, page as u32);
        let id = allocate(&mut self.records, &mut self.free_records, record);
        self.pages.set(col, page, id);
        id
    }

    /// Frees a record that holds no clean page and no pins.
    fn release_if_empty(&mut self, id: u32) {
        let record = &mut self.records[id as usize];
        if record.clean != NONE || record.flags != 0 {
            return;
        }

        self.pages.clear(record.col as usize, record.page as usize);
        record.col = FREE_ENTRY;
        self.free_records.push(id);
    }

    fn live_records(&self) -> impl Iterator<Item = &PageRecord> {
        self.records
            .iter()
            .filter(|record| record.col != FREE_ENTRY)
    }

    fn live_slots(&self) -> impl Iterator<Item = &DirtySlot> {
        self.slots.iter().filter(|slot| slot.revision != FREE_SLOT)
    }

    /// The (row, col) of a dirty slot.
    fn slot_cell(&self, slot: &DirtySlot) -> (usize, usize) {
        let block = &self.dirty_blocks[slot.block as usize];
        let row = ((block.block as usize) << DIRTY_BLOCK_SHIFT) + usize::from(slot.offset);
        (row, block.col as usize)
    }

    pub(super) fn chunk_bytes(&self) -> usize {
        let words = self.chunk_rows.div_ceil(BITS_PER_WORD);
        self.chunk_rows
            * (std::mem::size_of::<u8>() + std::mem::size_of::<u64>() + std::mem::size_of::<u32>())
            + words * std::mem::size_of::<u64>()
    }

    fn next_access(&self) -> u64 {
        let next = self.clock.get().wrapping_add(1);
        self.clock.set(next);
        next
    }

    fn lru_unlink(&self, id: u32) {
        let record = &self.records[id as usize];
        let (prev, next) = (record.prev.get(), record.next.get());

        if prev == NONE {
            self.lru_head.set(next);
        } else {
            self.records[prev as usize].next.set(next);
        }

        if next == NONE {
            self.lru_tail.set(prev);
        } else {
            self.records[next as usize].prev.set(prev);
        }

        record.prev.set(NONE);
        record.next.set(NONE);
    }

    /// Links `id` after `prev`, or at the head when `prev` is [`NONE`].
    fn lru_link_after(&self, id: u32, prev: u32) {
        let next = if prev == NONE {
            self.lru_head.get()
        } else {
            self.records[prev as usize].next.get()
        };
        let record = &self.records[id as usize];
        record.prev.set(prev);
        record.next.set(next);

        if prev == NONE {
            self.lru_head.set(id);
        } else {
            self.records[prev as usize].next.set(id);
        }

        if next == NONE {
            self.lru_tail.set(id);
        } else {
            self.records[next as usize].prev.set(id);
        }
    }

    /// Links a page that became evictable at its eviction-order position.
    /// Pinned pages keep recent access stamps, so the walk from the tail is short.
    fn lru_insert_ordered(&self, id: u32) {
        let key = self.records[id as usize].eviction_key();
        let mut prev = self.lru_tail.get();

        while prev != NONE && self.records[prev as usize].eviction_key() > key {
            prev = self.records[prev as usize].prev.get();
        }

        self.lru_link_after(id, prev);
    }

    /// Records an access to a clean-resident page and moves it to the newest
    /// eviction position.
    pub(super) fn touch(&self, id: u32) {
        if id == NONE {
            return;
        }

        let record = &self.records[id as usize];
        if record.clean == NONE {
            return;
        }

        record.last_access.set(self.next_access());

        if record.is_evictable() && self.lru_tail.get() != id {
            self.lru_unlink(id);
            self.lru_link_after(id, self.lru_tail.get());
        }
    }

    pub(super) fn resident_chunks(&self) -> usize {
        self.clean.len() - self.free_clean.len()
    }

    fn evict_for_chunk(&mut self) {
        if self.byte_budget == 0 {
            return;
        }

        let chunk_bytes = self.chunk_bytes();

        while (self.resident_chunks() + 1) * chunk_bytes > self.byte_budget {
            let candidate = self.lru_head.get();
            if candidate == NONE {
                break;
            }

            self.eviction_candidate_checks = self.eviction_candidate_checks.saturating_add(1);
            self.lru_unlink(candidate);

            let record = &mut self.records[candidate as usize];
            self.free_clean.push(record.clean);
            record.clean = NONE;
            self.release_if_empty(candidate);
            self.evictions = self.evictions.saturating_add(1);
        }
    }

    /// The clean page of (`col`, `page`), loading an empty one when absent.
    fn ensure_clean(&mut self, col: usize, page: usize) -> &mut CleanPage {
        let id = self.record_or_insert(col, page);
        let existing = self.records[id as usize].clean;

        if existing != NONE {
            self.touch(id);
            return &mut self.clean[existing as usize];
        }

        self.evict_for_chunk();

        let clean = if let Some(reused) = self.free_clean.pop() {
            self.clean[reused as usize].reset();
            reused
        } else {
            self.clean.push(CleanPage::new(self.chunk_rows));
            (self.clean.len() - 1) as u32
        };
        let access = self.next_access();
        let record = &mut self.records[id as usize];
        record.clean = clean;
        record.last_access.set(access);

        if record.is_evictable() {
            self.lru_link_after(id, self.lru_tail.get());
        }

        &mut self.clean[clean as usize]
    }

    pub(super) fn clean_loaded(&self, row: usize, col: usize) -> bool {
        let (clean, offset) = self.clean_page(row, col);
        clean.is_some_and(|clean| bit(&clean.loaded, offset))
    }

    #[inline]
    fn dirty_block_id(&self, row: usize, col: usize) -> u32 {
        self.dirty.get(col, row >> DIRTY_BLOCK_SHIFT)
    }

    #[inline]
    fn dirty_slot(&self, row: usize, col: usize) -> Option<u32> {
        let block = self.dirty_block_id(row, col);
        if block == NONE {
            return None;
        }

        self.dirty_blocks[block as usize].slot(row & (DIRTY_BLOCK_ROWS - 1))
    }

    fn is_dirty(&self, row: usize, col: usize) -> bool {
        self.dirty_slot(row, col).is_some()
    }

    /// `(kind, payload, style, loaded, dirty)` of one source cell.
    pub(super) fn read(&self, row: usize, col: usize) -> (u8, u64, u32, bool, bool) {
        if let Some(slot) = self.dirty_slot(row, col) {
            let cell = &self.slots[slot as usize];
            return (cell.kind, cell.payload, cell.style, true, true);
        }

        let (page, offset) = self.split(row);
        let id = self.page_id(col, page);
        if id == NONE {
            return (KIND_EMPTY, 0, 0, false, false);
        }

        let clean = self.records[id as usize].clean;
        if clean == NONE {
            return (KIND_EMPTY, 0, 0, false, false);
        }

        self.touch(id);
        let clean = &self.clean[clean as usize];

        if !bit(&clean.loaded, offset) {
            return (KIND_EMPTY, 0, 0, false, false);
        }

        (
            clean.kind[offset],
            clean.payload[offset],
            clean.style[offset],
            true,
            false,
        )
    }

    /// The clean page, dirty block and calculated block around (`row`, `col`).
    /// A run over it records one access to the clean page when `touch` is set.
    pub(super) fn run_view(&self, row: usize, col: usize, touch: bool) -> RunView<'_> {
        let (page, _) = self.split(row);
        let page_id = self.page_id(col, page);

        if touch {
            self.touch(page_id);
        }

        let clean = match page_id {
            NONE => NONE,
            id => self.records[id as usize].clean,
        };
        let dirty = self.dirty_block_id(row, col);
        let (calculated_index, calculated_offset) = self.calculated_split(row);
        let calculated = self.calculated.get(col, calculated_index);
        let clean_first_row = page << self.page_shift;
        let dirty_first_row = row & !(DIRTY_BLOCK_ROWS - 1);
        let calculated_first_row = row - calculated_offset;
        let end_row = (clean_first_row + self.chunk_rows)
            .min(dirty_first_row + DIRTY_BLOCK_ROWS)
            .min(calculated_first_row + self.calculated_rows());

        RunView {
            clean: (clean != NONE).then(|| &self.clean[clean as usize]),
            clean_first_row,
            dirty: (dirty != NONE).then(|| DirtyView {
                block: &self.dirty_blocks[dirty as usize],
                slots: &self.slots,
            }),
            dirty_first_row,
            calculated: match calculated {
                NONE => &[],
                id => &self.calculated_blocks[id as usize].values,
            },
            calculated_first_row,
            end_row,
        }
    }

    fn write_clean(&mut self, row: usize, col: usize, kind: u8, payload: u64, style: u32) {
        let (page, offset) = self.split(row);
        let clean = self.ensure_clean(col, page);
        clean.kind[offset] = kind;
        clean.payload[offset] = payload;
        clean.style[offset] = style;
        set_bit(&mut clean.loaded, offset);
    }

    pub(super) fn dirty_cells(&self) -> usize {
        self.slots.len() - self.free_slots.len()
    }

    pub(super) fn can_dirty_cell(&self, row: usize, col: usize) -> bool {
        self.is_dirty(row, col) || self.dirty_cells() < self.max_dirty_cells
    }

    pub(super) fn can_dirty_rect(&self, r0: usize, c0: usize, rows: usize, cols: usize) -> bool {
        let mut additional = 0usize;

        for col in c0..c0 + cols {
            for row in r0..r0 + rows {
                if self.is_dirty(row, col) {
                    continue;
                }

                additional += 1;

                if self.dirty_cells() + additional > self.max_dirty_cells {
                    return false;
                }
            }
        }

        true
    }

    /// Reserves slot and revision-list room for `additional` new dirty cells
    /// and `written` writes under `revision`.
    fn reserve_dirty(&mut self, additional: usize, written: usize, revision: u64) -> bool {
        if self.dirty_cells().saturating_add(additional) > self.max_dirty_cells
            || self.slots.try_reserve(additional).is_err()
        {
            return false;
        }

        let Some(list) = self.revision_list(revision) else {
            return false;
        };

        self.revisions[list].slots.try_reserve(written).is_ok()
    }

    pub(super) fn prepare_dirty_rect(
        &mut self,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
        revision: u64,
    ) -> bool {
        let additional = (c0..c0 + cols)
            .flat_map(|col| (r0..r0 + rows).map(move |row| (row, col)))
            .filter(|&(row, col)| !self.is_dirty(row, col))
            .count();
        self.reserve_dirty(additional, rows.saturating_mul(cols), revision)
    }

    pub(super) fn prepare_dirty_cells(&mut self, cells: &[(usize, usize)], revision: u64) -> bool {
        let additional = cells
            .iter()
            .filter(|&&(row, col)| !self.is_dirty(row, col))
            .count();
        self.reserve_dirty(additional, cells.len(), revision)
    }

    /// The index of `revision`'s slot list, inserting an empty one when absent.
    fn revision_list(&mut self, revision: u64) -> Option<usize> {
        match self
            .revisions
            .binary_search_by_key(&revision, |list| list.revision)
        {
            Ok(index) => Some(index),
            Err(index) => {
                self.revisions.try_reserve(1).ok()?;
                self.revisions.insert(
                    index,
                    RevisionSlots {
                        revision,
                        slots: Vec::new(),
                    },
                );
                Some(index)
            }
        }
    }

    fn reserve_revision_slot(&mut self, revision: u64, slot: u32) -> Option<u32> {
        let list = self.revision_list(revision)?;
        let slots = &mut self.revisions[list].slots;
        slots.try_reserve(1).ok()?;
        slots.push(slot);
        Some((slots.len() - 1) as u32)
    }

    fn remove_revision_slot(&mut self, revision: u64, index: u32) {
        let Ok(list) = self
            .revisions
            .binary_search_by_key(&revision, |list| list.revision)
        else {
            return;
        };

        let slots = &mut self.revisions[list].slots;
        slots.swap_remove(index as usize);

        if let Some(&moved) = slots.get(index as usize) {
            self.slots[moved as usize].revision_index = index;
        }

        if slots.is_empty() {
            self.revisions.remove(list);
        }
    }

    /// The dirty block holding (`row`, `col`), allocating it when absent.
    fn dirty_block_or_insert(&mut self, row: usize, col: usize) -> u32 {
        let existing = self.dirty_block_id(row, col);
        if existing != NONE {
            return existing;
        }

        let index = row >> DIRTY_BLOCK_SHIFT;
        let block = DirtyBlock::new(col as u32, index as u32);
        let id = allocate(&mut self.dirty_blocks, &mut self.free_dirty_blocks, block);
        self.dirty.set(col, index, id);
        id
    }

    /// Frees a dirty block that holds no edit.
    fn release_dirty_block(&mut self, id: u32) {
        let block = &mut self.dirty_blocks[id as usize];
        if !block.slots.is_empty() {
            return;
        }

        self.dirty.clear(block.col as usize, block.block as usize);
        *block = DirtyBlock::new(FREE_ENTRY, 0);
        self.free_dirty_blocks.push(id);
    }

    fn free_slot(&mut self, slot: u32) {
        self.slots[slot as usize].revision = FREE_SLOT;
        self.free_slots.push(slot);
    }

    fn write_dirty(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        revision: u64,
    ) -> bool {
        debug_assert_ne!(revision, FREE_SLOT);

        if let Some(slot) = self.dirty_slot(row, col) {
            let cell = self.slots[slot as usize];

            let revision_index = if cell.revision == revision {
                cell.revision_index
            } else {
                let Some(index) = self.reserve_revision_slot(revision, slot) else {
                    return false;
                };
                self.remove_revision_slot(cell.revision, cell.revision_index);
                index
            };

            self.slots[slot as usize] = DirtySlot {
                payload,
                revision,
                style,
                revision_index,
                kind,
                ..cell
            };
            return true;
        }

        if self.dirty_cells() >= self.max_dirty_cells || self.slots.try_reserve(1).is_err() {
            return false;
        }

        let block = self.dirty_block_or_insert(row, col);
        let offset = row & (DIRTY_BLOCK_ROWS - 1);
        let cell = DirtySlot {
            payload,
            revision,
            style,
            block,
            revision_index: 0,
            offset: offset as u16,
            kind,
        };
        let slot = allocate(&mut self.slots, &mut self.free_slots, cell);

        let Some(revision_index) = self.reserve_revision_slot(revision, slot) else {
            self.free_slot(slot);
            self.release_dirty_block(block);
            return false;
        };

        self.slots[slot as usize].revision_index = revision_index;
        self.dirty_blocks[block as usize].insert(offset, slot);
        true
    }

    pub(super) fn write(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        dirty_revision: Option<u64>,
    ) -> bool {
        if let Some(revision) = dirty_revision {
            return self.write_dirty(row, col, kind, payload, style, revision);
        }

        if let Some(slot) = self.dirty_slot(row, col) {
            let cell = &mut self.slots[slot as usize];
            cell.kind = kind;
            cell.payload = payload;
            cell.style = style;
        } else {
            self.write_clean(row, col, kind, payload, style);
        }

        true
    }

    pub(super) fn hydrate(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
    ) -> bool {
        if self.is_dirty(row, col) {
            return false;
        }

        self.write_clean(row, col, kind, payload, style);
        true
    }

    pub(super) fn mark_clean(&mut self, row: usize, col: usize) -> bool {
        let Some(slot) = self.dirty_slot(row, col) else {
            return false;
        };

        let cell = self.slots[slot as usize];
        self.remove_revision_slot(cell.revision, cell.revision_index);
        self.dirty_blocks[cell.block as usize].remove(usize::from(cell.offset));
        self.release_dirty_block(cell.block);
        self.free_slot(slot);
        self.write_clean(row, col, cell.kind, cell.payload, cell.style);
        true
    }

    /// Cleans every cell `revision` still owns. Its slots are released first and
    /// each touched block compacts its rows once; then the values become clean.
    pub(super) fn acknowledge_revision(&mut self, revision: u64) {
        let Ok(list) = self
            .revisions
            .binary_search_by_key(&revision, |list| list.revision)
        else {
            return;
        };

        let owned = self.revisions.remove(list).slots;
        let mut touched = std::mem::take(&mut self.scratch);

        for &slot in &owned {
            touched.push(self.slots[slot as usize].block);
            self.free_slot(slot);
        }

        touched.sort_unstable();
        touched.dedup();

        for &block in &touched {
            let slots = &self.slots;
            self.dirty_blocks[block as usize]
                .retain(|slot| slots[slot as usize].revision != FREE_SLOT);
        }

        // Freed slots keep their values, and writing clean values allocates
        // no slot, so the owned slots still describe their cells here. Blocks
        // are released afterwards because the slots name them.
        for slot in owned {
            let cell = self.slots[slot as usize];
            let (row, col) = self.slot_cell(&cell);
            self.write_clean(row, col, cell.kind, cell.payload, cell.style);
        }

        for &block in &touched {
            self.release_dirty_block(block);
        }

        touched.clear();
        self.scratch = touched;
    }

    /// Marks the page record of (`col`, `page`) once, appending a newly marked
    /// id to `next`.
    fn collect_pin(&mut self, col: usize, page: usize, next: &mut Vec<u32>) {
        let id = self.record_or_insert(col, page);
        let record = &mut self.records[id as usize];

        if record.flags & MARK == 0 {
            record.flags |= MARK;
            next.push(id);
        }
    }

    pub(super) fn pin_read_window(&mut self, start: usize, end: usize, rows: &[u32], cols: &[u32]) {
        let mut next = std::mem::take(&mut self.scratch);

        for &col in cols {
            if rows.is_empty() {
                if start < end {
                    for page in start >> self.page_shift..=(end - 1) >> self.page_shift {
                        self.collect_pin(col as usize, page, &mut next);
                    }
                }
            } else {
                for &row in rows {
                    self.collect_pin(col as usize, row as usize >> self.page_shift, &mut next);
                }
            }
        }

        let access = self.next_access();
        let previous = std::mem::replace(&mut self.read_pins, next);
        self.replace_pins(previous, READ_PIN);

        for &id in &self.read_pins {
            let record = &self.records[id as usize];
            if record.clean != NONE {
                record.last_access.set(access);
            }
        }
    }

    pub(super) fn pin_viewport_bands(&mut self, bands: &[u32]) {
        let mut next = std::mem::take(&mut self.scratch);

        for &[r0, r1, c0, c1] in bands.as_chunks::<4>().0 {
            let [r0, r1, c0, c1] = [r0 as usize, r1 as usize, c0 as usize, c1 as usize];
            if r0 >= r1 {
                continue;
            }

            for col in c0..c1 {
                for page in r0 >> self.page_shift..=(r1 - 1) >> self.page_shift {
                    self.collect_pin(col, page, &mut next);
                }
            }
        }

        let previous = std::mem::replace(&mut self.viewport_pins, next);
        self.replace_pins(previous, VIEWPORT_PIN);
    }

    /// Moves `pin` from `previous` to the marked pages of the current list for
    /// `pin`. Unpinned resident pages return to eviction order; newly pinned
    /// ones leave it.
    fn replace_pins(&mut self, mut previous: Vec<u32>, pin: u8) {
        for &id in &previous {
            let record = &mut self.records[id as usize];
            if record.flags & MARK != 0 {
                continue;
            }

            record.flags &= !pin;

            if record.is_evictable() {
                self.lru_insert_ordered(id);
            }

            self.release_if_empty(id);
        }

        let current = if pin == READ_PIN {
            std::mem::take(&mut self.read_pins)
        } else {
            std::mem::take(&mut self.viewport_pins)
        };

        for &id in &current {
            let was_evictable = self.records[id as usize].is_evictable();
            let record = &mut self.records[id as usize];
            record.flags = (record.flags & !MARK) | pin;

            if was_evictable {
                self.lru_unlink(id);
            }
        }

        if pin == READ_PIN {
            self.read_pins = current;
        } else {
            self.viewport_pins = current;
        }

        previous.clear();
        self.scratch = previous;
    }

    pub(super) fn has_calculated(&self) -> bool {
        self.calculated_blocks.len() > self.free_calculated_blocks.len()
    }

    /// The calculated block index of `row` and the row offset inside it.
    #[inline]
    fn calculated_split(&self, row: usize) -> (usize, usize) {
        let rows = self.calculated_rows();
        (row >> self.calculated_shift, row & (rows - 1))
    }

    #[inline]
    pub(super) fn calculated_rows(&self) -> usize {
        1 << self.calculated_shift
    }

    pub(super) fn calculated_at(&self, row: usize, col: usize) -> Option<(u8, u64)> {
        let (index, offset) = self.calculated_split(row);
        let block = self.calculated.get(col, index);
        if block == NONE {
            return None;
        }

        let value = self.calculated_blocks[block as usize].values[offset];
        (value != ABSENT_TAG).then(|| decode_cell(value))
    }

    /// The calculated block of (`col`, `index`), allocating it when absent.
    /// `None` when memory runs out.
    fn calculated_block_or_insert(&mut self, col: usize, index: usize) -> Option<u32> {
        let existing = self.calculated.get(col, index);
        if existing != NONE {
            return Some(existing);
        }

        let rows = self.calculated_rows();
        let mut values = Vec::new();
        if values.try_reserve_exact(rows).is_err() || self.calculated_blocks.try_reserve(1).is_err()
        {
            return None;
        }

        values.resize(rows, ABSENT_TAG);
        let block = CalculatedBlock {
            col: col as u32,
            block: index as u32,
            cells: 0,
            values,
        };
        let id = allocate(
            &mut self.calculated_blocks,
            &mut self.free_calculated_blocks,
            block,
        );
        self.calculated.set(col, index, id);
        Some(id)
    }

    pub(super) fn set_calculated(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
    ) -> bool {
        let (index, offset) = self.calculated_split(row);
        let Some(id) = self.calculated_block_or_insert(col, index) else {
            return false;
        };

        let block = &mut self.calculated_blocks[id as usize];
        let value = &mut block.values[offset];
        block.cells += u32::from(*value == ABSENT_TAG);
        *value = encode_cell(kind, payload);
        true
    }

    /// Allocates the calculated blocks an inclusive rectangle of results needs,
    /// so writing them cannot fail. Unused blocks are released by
    /// [`Self::compact_calculated`].
    pub(super) fn reserve_calculated(
        &mut self,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
    ) -> bool {
        for col in c0..=c1 {
            for index in r0 >> self.calculated_shift..=r1 >> self.calculated_shift {
                if self.calculated_block_or_insert(col, index).is_none() {
                    return false;
                }
            }
        }

        true
    }

    pub(super) fn remove_calculated(&mut self, row: usize, col: usize) {
        let (index, offset) = self.calculated_split(row);
        let id = self.calculated.get(col, index);
        if id == NONE {
            return;
        }

        let block = &mut self.calculated_blocks[id as usize];
        let value = &mut block.values[offset];
        if *value == ABSENT_TAG {
            return;
        }

        *value = ABSENT_TAG;
        block.cells -= 1;

        if block.cells == 0 {
            self.free_calculated_block(id);
        }
    }

    fn free_calculated_block(&mut self, id: u32) {
        let block = &mut self.calculated_blocks[id as usize];
        self.calculated
            .clear(block.col as usize, block.block as usize);
        block.col = FREE_ENTRY;
        block.values = Vec::new();
        self.free_calculated_blocks.push(id);
    }

    /// Releases calculated blocks that hold no result.
    pub(super) fn compact_calculated(&mut self) {
        for id in 0..self.calculated_blocks.len() as u32 {
            let block = &self.calculated_blocks[id as usize];
            if block.col != FREE_ENTRY && block.cells == 0 {
                self.free_calculated_block(id);
            }
        }
    }

    pub(super) fn clear_calculated(&mut self) {
        if self.has_calculated() {
            self.calculated = Directory::default();
            self.calculated_blocks = Vec::new();
            self.free_calculated_blocks = Vec::new();
        }
    }

    fn live_calculated(&self) -> impl Iterator<Item = &CalculatedBlock> {
        self.calculated_blocks
            .iter()
            .filter(|block| block.col != FREE_ENTRY)
    }

    /// Visits every physical payload: clean pages, including rows a dirty
    /// slot shadows, dirty slots and calculated results.
    pub(super) fn visit_payloads(&self, mut visit: impl FnMut(u64)) {
        for record in self.live_records() {
            if record.clean != NONE {
                for &payload in &self.clean[record.clean as usize].payload {
                    visit(payload);
                }
            }
        }

        for block in self.live_calculated() {
            for &value in &block.values {
                if value != ABSENT_TAG {
                    visit(value);
                }
            }
        }

        for slot in self.live_slots() {
            visit(slot.payload);
        }
    }

    pub(super) fn remap_payloads(&mut self, mut remap: impl FnMut(&mut u64)) {
        for record in self
            .records
            .iter()
            .filter(|record| record.col != FREE_ENTRY && record.clean != NONE)
        {
            for payload in &mut self.clean[record.clean as usize].payload {
                remap(payload);
            }
        }

        for block in self
            .calculated_blocks
            .iter_mut()
            .filter(|block| block.col != FREE_ENTRY)
        {
            for value in &mut block.values {
                if *value != ABSENT_TAG {
                    remap(value);
                }
            }
        }

        for slot in self
            .slots
            .iter_mut()
            .filter(|slot| slot.revision != FREE_SLOT)
        {
            remap(&mut slot.payload);
        }
    }

    /// Clean loaded cells a dirty slot does not shadow, as `(row, col, page, offset)`.
    fn visible_clean_cells(&self) -> impl Iterator<Item = (usize, usize, &CleanPage, usize)> {
        self.live_records()
            .filter(|record| record.clean != NONE)
            .flat_map(move |record| {
                let clean = &self.clean[record.clean as usize];
                let col = record.col as usize;
                let first_row = (record.page as usize) << self.page_shift;
                (0..self.chunk_rows).filter_map(move |offset| {
                    let row = first_row + offset;
                    let visible = bit(&clean.loaded, offset) && !self.is_dirty(row, col);
                    visible.then_some((row, col, clean, offset))
                })
            })
    }

    pub(super) fn persisted_coordinates(&self) -> Vec<CellKey> {
        let mut coordinates: Vec<CellKey> = self
            .visible_clean_cells()
            .filter(|&(_, _, clean, offset)| {
                clean.kind[offset] != KIND_EMPTY || clean.style[offset] != 0
            })
            .map(|(row, col, _, _)| (row as u32, col as u32))
            .collect();

        coordinates.extend(
            self.live_slots()
                .filter(|slot| slot.kind != KIND_EMPTY || slot.style != 0)
                .map(|slot| {
                    let (row, col) = self.slot_cell(slot);
                    (row as u32, col as u32)
                }),
        );
        coordinates
    }

    pub(super) fn entries(&self) -> Vec<StorageEntry> {
        let mut entries = Vec::with_capacity(self.loaded_cells());

        entries.extend(
            self.visible_clean_cells()
                .map(|(row, col, clean, offset)| StorageEntry {
                    row,
                    col,
                    kind: clean.kind[offset],
                    payload: clean.payload[offset],
                    style: clean.style[offset],
                    dirty_revision: None,
                }),
        );
        entries.extend(self.live_slots().map(|slot| {
            let (row, col) = self.slot_cell(slot);
            StorageEntry {
                row,
                col,
                kind: slot.kind,
                payload: slot.payload,
                style: slot.style,
                dirty_revision: Some(slot.revision),
            }
        }));
        entries.sort_unstable_by_key(|entry| (entry.col, entry.row));
        entries
    }

    pub(super) fn dirty_coordinates(&self) -> Vec<f64> {
        let mut keys: Vec<(usize, usize)> =
            self.live_slots().map(|slot| self.slot_cell(slot)).collect();
        keys.sort_unstable();

        let mut coordinates = Vec::with_capacity(keys.len().saturating_mul(2));
        for (row, col) in keys {
            coordinates.push(row as f64);
            coordinates.push(col as f64);
        }

        coordinates
    }

    /// Clean page bytes, the quantity the byte budget limits.
    pub(super) fn byte_len(&self) -> usize {
        self.live_records()
            .filter(|record| record.clean != NONE)
            .map(|record| self.clean[record.clean as usize].byte_len())
            .sum()
    }

    /// Bytes the dirty overlay holds for live edits: slots, the rows of dirty
    /// blocks, and revision lists. Counted from lengths so the figure is the
    /// same after a transfer.
    pub(super) fn dirty_byte_len(&self) -> usize {
        let blocks = self
            .dirty_blocks
            .iter()
            .filter(|block| !block.slots.is_empty())
            .map(|block| {
                std::mem::size_of::<DirtyBlock>()
                    + block.offsets.len() * std::mem::size_of::<u16>()
                    + block.slots.len() * std::mem::size_of::<u32>()
            })
            .sum::<usize>();
        let revisions = self
            .revisions
            .iter()
            .map(|list| {
                std::mem::size_of::<RevisionSlots>() + list.slots.len() * std::mem::size_of::<u32>()
            })
            .sum::<usize>();

        blocks + revisions + self.dirty_cells() * std::mem::size_of::<DirtySlot>()
    }

    pub(super) fn loaded_cells(&self) -> usize {
        let clean = self
            .live_records()
            .filter(|record| record.clean != NONE)
            .map(|record| {
                self.clean[record.clean as usize]
                    .loaded
                    .iter()
                    .map(|word| word.count_ones() as usize)
                    .sum::<usize>()
            })
            .sum::<usize>();
        let dirty_only = self
            .live_slots()
            .filter(|slot| {
                let (row, col) = self.slot_cell(slot);
                !self.clean_loaded(row, col)
            })
            .count();

        clean + dirty_only
    }

    pub(super) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let indexes = stats.owner_mut(PAGED_INDEXES);
        self.pages.add_memory_stats(indexes);
        indexes.add_vec::<PageRecord>(self.records.len(), self.records.capacity());
        indexes.add_vec::<CleanPage>(self.clean.len(), self.clean.capacity());
        for list in [
            &self.free_records,
            &self.free_clean,
            &self.read_pins,
            &self.viewport_pins,
            &self.scratch,
        ] {
            indexes.add_vec::<u32>(list.len(), list.capacity());
        }

        for clean in &self.clean {
            stats
                .owner_mut(PAGED_KINDS)
                .add_vec::<u8>(clean.kind.len(), clean.kind.capacity());
            stats
                .owner_mut(PAGED_PAYLOADS)
                .add_vec::<u64>(clean.payload.len(), clean.payload.capacity());
            stats
                .owner_mut(PAGED_STYLES)
                .add_vec::<u32>(clean.style.len(), clean.style.capacity());
            stats
                .owner_mut(PAGED_LOADED_BITMAPS)
                .add_vec::<u64>(clean.loaded.len(), clean.loaded.capacity());
        }

        let dirty = stats.owner_mut(PAGED_DIRTY_BITMAPS);
        self.dirty.add_memory_stats(dirty);
        dirty.add_vec::<DirtyBlock>(self.dirty_blocks.len(), self.dirty_blocks.capacity());
        for block in &self.dirty_blocks {
            dirty.add_vec::<u16>(block.offsets.len(), block.offsets.capacity());
            dirty.add_vec::<u32>(block.slots.len(), block.slots.capacity());
        }
        dirty.add_vec::<DirtySlot>(self.dirty_cells(), self.slots.capacity());
        dirty.add_vec::<u32>(self.free_slots.len(), self.free_slots.capacity());
        dirty.add_vec::<u32>(
            self.free_dirty_blocks.len(),
            self.free_dirty_blocks.capacity(),
        );
        dirty.add_vec::<RevisionSlots>(self.revisions.len(), self.revisions.capacity());
        for list in &self.revisions {
            dirty.add_vec::<u32>(list.slots.len(), list.slots.capacity());
        }

        let formulas = stats.owner_mut(FORMULAS);
        self.calculated.add_memory_stats(formulas);
        formulas.add_vec::<CalculatedBlock>(
            self.calculated_blocks.len(),
            self.calculated_blocks.capacity(),
        );
        formulas.add_vec::<u32>(
            self.free_calculated_blocks.len(),
            self.free_calculated_blocks.capacity(),
        );
        for block in &self.calculated_blocks {
            formulas.add_vec::<u64>(block.values.len(), block.values.capacity());
        }
    }

    pub(super) fn write_transfer(&self, out: &mut Writer) {
        out.usize(self.chunk_rows);
        out.usize(self.byte_budget);
        out.usize(self.max_dirty_cells);

        self.pages.write_transfer(out);
        out.usize(self.records.len());
        for record in &self.records {
            for value in [
                record.col,
                record.page,
                record.clean,
                record.prev.get(),
                record.next.get(),
                u32::from(record.flags),
            ] {
                out.u32(value);
            }
            out.u64(record.last_access.get());
        }
        out.ints(&self.free_records);

        out.usize(self.clean.len());
        for clean in &self.clean {
            out.bytes(&clean.kind);
            out.words(&clean.payload);
            out.ints(&clean.style);
            out.words(&clean.loaded);
        }
        out.ints(&self.free_clean);

        self.dirty.write_transfer(out);
        out.usize(self.dirty_blocks.len());
        for block in &self.dirty_blocks {
            out.u32(block.col);
            out.u32(block.block);
            let offsets: Vec<u32> = block.offsets.iter().map(|&offset| offset.into()).collect();
            out.ints(&offsets);
            out.ints(&block.slots);
        }
        out.ints(&self.free_dirty_blocks);

        out.usize(self.slots.len());
        for slot in &self.slots {
            out.u64(slot.payload);
            out.u64(slot.revision);
            for value in [
                slot.style,
                slot.block,
                slot.revision_index,
                u32::from(slot.offset),
                u32::from(slot.kind),
            ] {
                out.u32(value);
            }
        }
        out.ints(&self.free_slots);

        out.usize(self.revisions.len());
        for list in &self.revisions {
            out.u64(list.revision);
            out.ints(&list.slots);
        }

        self.calculated.write_transfer(out);
        out.usize(self.calculated_blocks.len());
        for block in &self.calculated_blocks {
            out.u32(block.col);
            out.u32(block.block);
            out.u32(block.cells);
            out.words(&block.values);
        }
        out.ints(&self.free_calculated_blocks);

        out.ints(&self.read_pins);
        out.ints(&self.viewport_pins);
        out.u32(self.lru_head.get());
        out.u32(self.lru_tail.get());
        out.u64(self.clock.get());
        out.u64(self.eviction_candidate_checks);
        out.u64(self.evictions);
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(super) fn read_transfer(input: &mut Reader<'_>) -> TransferResult<Self> {
        let mut paged = Self::new(input.usize()?, input.usize()?, input.usize()?)?;
        let rows = paged.chunk_rows;

        paged.pages = Directory::read_transfer(input)?;
        for _ in 0..input.count()? {
            let mut fields = [0u32; 6];
            for field in &mut fields {
                *field = input.u32()?;
            }
            let [col, page, clean, prev, next, flags] = fields;
            paged.records.push(PageRecord {
                col,
                page,
                clean,
                prev: Cell::new(prev),
                next: Cell::new(next),
                last_access: Cell::new(input.u64()?),
                flags: u8::try_from(flags).map_err(|_| "invalid transferred page flags")?,
            });
        }
        paged.free_records = input.ints()?;

        for _ in 0..input.count()? {
            let clean = CleanPage {
                kind: input.bytes()?,
                payload: input.words()?,
                style: input.ints()?,
                loaded: input.words()?,
            };
            if clean.kind.len() != rows
                || clean.payload.len() != rows
                || clean.style.len() != rows
                || clean.loaded.len() != rows.div_ceil(BITS_PER_WORD)
            {
                return Err("invalid transferred page chunk".into());
            }
            paged.clean.push(clean);
        }
        paged.free_clean = input.ints()?;

        paged.dirty = Directory::read_transfer(input)?;
        for _ in 0..input.count()? {
            let mut block = DirtyBlock::new(input.u32()?, input.u32()?);
            block.offsets = input
                .ints()?
                .into_iter()
                .map(|offset| u16::try_from(offset).map_err(|_| "invalid transferred dirty row"))
                .collect::<Result<_, _>>()?;
            block.slots = input.ints()?;

            let ordered = block.offsets.windows(2).all(|pair| pair[0] < pair[1]);
            let in_block = block
                .offsets
                .last()
                .is_none_or(|&last| usize::from(last) < DIRTY_BLOCK_ROWS);
            if block.offsets.len() != block.slots.len() || !ordered || !in_block {
                return Err("invalid transferred dirty block".into());
            }

            block.rebuild_bands();
            paged.dirty_blocks.push(block);
        }
        paged.free_dirty_blocks = input.ints()?;

        for _ in 0..input.count()? {
            let payload = input.u64()?;
            let revision = input.u64()?;
            let mut fields = [0u32; 5];
            for field in &mut fields {
                *field = input.u32()?;
            }
            let [style, block, revision_index, offset, kind] = fields;
            paged.slots.push(DirtySlot {
                payload,
                revision,
                style,
                block,
                revision_index,
                offset: u16::try_from(offset).map_err(|_| "invalid transferred dirty row")?,
                kind: u8::try_from(kind).map_err(|_| "invalid transferred dirty kind")?,
            });
        }
        paged.free_slots = input.ints()?;

        for _ in 0..input.count()? {
            paged.revisions.push(RevisionSlots {
                revision: input.u64()?,
                slots: input.ints()?,
            });
        }

        paged.calculated = Directory::read_transfer(input)?;
        for _ in 0..input.count()? {
            let block = CalculatedBlock {
                col: input.u32()?,
                block: input.u32()?,
                cells: input.u32()?,
                values: input.words()?,
            };
            let is_live = block.col != FREE_ENTRY;
            if is_live && block.values.len() != paged.calculated_rows() {
                return Err("invalid transferred calculated block".into());
            }
            paged.calculated_blocks.push(block);
        }
        paged.free_calculated_blocks = input.ints()?;

        paged.read_pins = input.ints()?;
        paged.viewport_pins = input.ints()?;
        paged.lru_head.set(input.u32()?);
        paged.lru_tail.set(input.u32()?);
        paged.clock.set(input.u64()?);
        paged.eviction_candidate_checks = input.u64()?;
        paged.evictions = input.u64()?;

        if !paged.references_are_valid() {
            return Err("invalid transferred page directory".into());
        }

        Ok(paged)
    }

    /// Every id names an entry of its slab, so a transferred store cannot
    /// index out of bounds.
    #[cfg(any(target_arch = "wasm32", test))]
    fn references_are_valid(&self) -> bool {
        let in_slab = |id: u32, len: usize| id == NONE || (id as usize) < len;
        let ids_in = |ids: &[u32], len: usize| ids.iter().all(|&id| (id as usize) < len);
        let records = self.records.len();
        let slots = self.slots.len();

        let directories = self.pages.ids_below(records)
            && self.dirty.ids_below(self.dirty_blocks.len())
            && self.calculated.ids_below(self.calculated_blocks.len());
        let pages = self.records.iter().all(|record| {
            in_slab(record.clean, self.clean.len())
                && in_slab(record.prev.get(), records)
                && in_slab(record.next.get(), records)
        });
        let dirty = self
            .dirty_blocks
            .iter()
            .all(|block| ids_in(&block.slots, slots));
        let revisions = self
            .revisions
            .iter()
            .all(|list| list.revision != FREE_SLOT && ids_in(&list.slots, slots));
        let edits = self.live_slots().all(|slot| {
            slot.kind <= KIND_FORMULA && (slot.block as usize) < self.dirty_blocks.len()
        });
        let lists = ids_in(&self.free_records, records)
            && ids_in(&self.free_clean, self.clean.len())
            && ids_in(&self.free_dirty_blocks, self.dirty_blocks.len())
            && ids_in(&self.free_slots, slots)
            && ids_in(&self.free_calculated_blocks, self.calculated_blocks.len())
            && ids_in(&self.read_pins, records)
            && ids_in(&self.viewport_pins, records)
            && in_slab(self.lru_head.get(), records)
            && in_slab(self.lru_tail.get(), records);

        directories && pages && dirty && revisions && edits && lists
    }
}

#[cfg(test)]
mod tests {
    use super::{Directory, PagedStorage, DIRTY_BLOCK_ROWS, NONE};
    use crate::transfer::{Reader, Writer};
    use crate::types::{KIND_EMPTY, KIND_NUMBER};

    const ROWS: usize = 4;
    const TRANSFER_TAG: u32 = 1;

    fn budget_for(pages: usize) -> usize {
        PagedStorage::new(ROWS, 0, 0).unwrap().chunk_bytes() * pages
    }

    fn load(storage: &mut PagedStorage, page: usize, col: usize, payload: u64) {
        assert!(storage.hydrate(page * ROWS, col, KIND_NUMBER, payload, 0));
    }

    fn is_resident(storage: &PagedStorage, page: usize, col: usize) -> bool {
        storage.clean_loaded(page * ROWS, col)
    }

    #[test]
    fn directory_frees_a_leaf_when_its_last_block_clears_and_reuses_it() {
        let mut directory = Directory::default();
        directory.set(2, 1000, 7);
        directory.set(2, 1001, 8);
        assert_eq!(directory.get(2, 1000), 7);
        assert_eq!(directory.get(2, 999), NONE);
        assert_eq!(directory.get(1, 1000), NONE);

        directory.clear(2, 1000);
        assert_eq!(directory.get(2, 1001), 8);
        directory.clear(2, 1001);
        assert_eq!(directory.get(2, 1001), NONE);
        assert_eq!(directory.free_leaves, vec![0]);

        directory.set(0, 5, 9);
        assert_eq!(directory.get(0, 5), 9);
        assert_eq!(directory.leaf_ids, vec![1]);
        assert!(directory.free_leaves.is_empty());
    }

    #[test]
    fn dirty_rows_find_slots_written_out_of_order_and_keep_shared_bands() {
        // A band covers 64 rows: 2 and 3 share one, 70 and 71 another.
        let mut storage = PagedStorage::new(DIRTY_BLOCK_ROWS * 2, 0, 16).unwrap();
        let order = [
            DIRTY_BLOCK_ROWS + 5,
            0,
            64,
            3,
            2,
            70,
            71,
            DIRTY_BLOCK_ROWS - 1,
        ];
        let revision_of = |index: usize| 1 + index as u64 % 2;

        for (index, &row) in order.iter().enumerate() {
            let payload = row as u64;
            assert!(storage.write(row, 0, KIND_NUMBER, payload, 0, Some(revision_of(index))));
        }

        for &row in &order {
            assert_eq!(
                storage.read(row, 0),
                (KIND_NUMBER, row as u64, 0, true, true)
            );
        }

        assert_eq!(storage.read(1, 0), (KIND_EMPTY, 0, 0, false, false));
        assert!(storage.mark_clean(2, 0));
        assert_eq!(storage.read(3, 0), (KIND_NUMBER, 3, 0, true, true));
        assert!(storage.mark_clean(71, 0));
        assert_eq!(storage.read(70, 0), (KIND_NUMBER, 70, 0, true, true));

        storage.acknowledge_revision(1);
        for (index, &row) in order.iter().enumerate() {
            let dirty = revision_of(index) == 2 && row != 2 && row != 71;
            assert_eq!(
                storage.read(row, 0),
                (KIND_NUMBER, row as u64, 0, true, dirty)
            );
        }

        storage.acknowledge_revision(2);
        assert_eq!(storage.dirty_cells(), 0);
        assert_eq!(storage.dirty_byte_len(), 0);
        assert_eq!(storage.dirty_coordinates(), Vec::<f64>::new());
    }

    #[test]
    fn eviction_takes_the_least_recent_unpinned_page_and_pins_hold_pages() {
        let mut storage = PagedStorage::new(ROWS, budget_for(2), 1).unwrap();
        load(&mut storage, 0, 0, 1);
        load(&mut storage, 1, 0, 2);
        assert_eq!(storage.read(0, 0).1, 1);

        load(&mut storage, 2, 0, 3);
        assert!(is_resident(&storage, 0, 0));
        assert!(!is_resident(&storage, 1, 0));

        storage.pin_viewport_bands(&[0, ROWS as u32, 0, 1]);
        load(&mut storage, 3, 0, 4);
        assert!(is_resident(&storage, 0, 0));
        assert!(!is_resident(&storage, 2, 0));

        // Unpinning returns page 0 to its access-order position, older than page 3.
        storage.pin_viewport_bands(&[]);
        load(&mut storage, 4, 0, 5);
        assert!(!is_resident(&storage, 0, 0));
        assert!(is_resident(&storage, 3, 0));
        assert_eq!(storage.resident_chunks(), 2);
        assert_eq!(storage.evictions, 3);
    }

    #[test]
    fn read_pins_refresh_access_order_when_released() {
        let mut storage = PagedStorage::new(ROWS, budget_for(2), 1).unwrap();
        load(&mut storage, 0, 0, 1);
        load(&mut storage, 1, 0, 2);

        storage.pin_read_window(0, ROWS, &[], &[0]);
        storage.pin_read_window(0, 0, &[], &[]);
        load(&mut storage, 2, 0, 3);
        assert!(is_resident(&storage, 0, 0));
        assert!(!is_resident(&storage, 1, 0));
    }

    #[test]
    fn dirty_cells_and_calculated_blocks_survive_eviction_and_release_when_empty() {
        let mut storage = PagedStorage::new(ROWS, budget_for(1), 4).unwrap();
        assert!(storage.write(1, 0, KIND_NUMBER, 10, 0, Some(5)));
        load(&mut storage, 0, 0, 1);
        assert!(storage.set_calculated(2, 0, KIND_NUMBER, 20));
        load(&mut storage, 1, 0, 2);

        assert!(!is_resident(&storage, 0, 0));
        assert_eq!(storage.read(1, 0), (KIND_NUMBER, 10, 0, true, true));
        assert_eq!(storage.calculated_at(2, 0), Some((KIND_NUMBER, 20)));

        storage.remove_calculated(2, 0);
        assert!(!storage.has_calculated());
        storage.acknowledge_revision(5);
        assert_eq!(storage.read(1, 0), (KIND_NUMBER, 10, 0, true, false));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 0, 0, false, false));
        assert_eq!(storage.dirty_byte_len(), 0);
    }

    #[test]
    fn transfer_keeps_pages_dirty_slots_pins_and_eviction_order() {
        let mut storage = PagedStorage::new(ROWS, budget_for(2), 4).unwrap();
        load(&mut storage, 0, 0, 1);
        load(&mut storage, 1, 0, 2);
        assert!(storage.write(5, 1, KIND_NUMBER, 30, 7, Some(9)));
        assert!(storage.set_calculated(3, 1, KIND_NUMBER, 40));
        storage.pin_viewport_bands(&[0, ROWS as u32, 1, 2]);

        let mut out = Writer::new(TRANSFER_TAG);
        storage.write_transfer(&mut out);
        let mut input = Reader::new(&out.0, TRANSFER_TAG).unwrap();
        let mut restored = PagedStorage::read_transfer(&mut input).unwrap();
        input.finish().unwrap();

        assert_eq!(restored.read(5, 1), (KIND_NUMBER, 30, 7, true, true));
        assert_eq!(restored.calculated_at(3, 1), Some((KIND_NUMBER, 40)));
        assert_eq!(restored.dirty_coordinates(), vec![5.0, 1.0]);
        assert_eq!(restored.dirty_byte_len(), storage.dirty_byte_len());

        load(&mut restored, 2, 0, 3);
        assert!(!is_resident(&restored, 0, 0));
        assert!(is_resident(&restored, 1, 0));

        restored.acknowledge_revision(9);
        assert_eq!(restored.dirty_cells(), 0);
    }
}
