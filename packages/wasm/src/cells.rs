//! Physical source cells, calculated slots, paging and borrowed read runs.

use std::cell::{Cell, RefCell};
use std::collections::BTreeSet;

// Only bounded cell coordinates and internal integer IDs use Fx hashing.
// Document text keys retain randomized hashing in their owning modules.
use rustc_hash::{FxHashMap, FxHashSet};

use crate::derived::{decode_cell, encode_cell, DerivedOverlay};
use crate::memory::{
    StoreMemoryStats, DENSE_KINDS, DENSE_PAYLOADS, DENSE_STYLES, FORMULAS, PAGED_DIRTY_BITMAPS,
    PAGED_INDEXES, PAGED_KINDS, PAGED_LOADED_BITMAPS, PAGED_PAYLOADS, PAGED_STYLES,
};
use crate::types::{
    CellKey, FormulaError, KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};

mod transfer;

// One u64 per cell keeps the numeric bits and string-pool id in one cache
// stream. `kind` stays the discriminator; the payload holds canonical f64 bits
// for numbers and `STR_TAG | id` for string-pool ids.
// Numeric writes canonicalize NaN, so the tag surface (a negative signaling
// NaN pattern) can never be produced by a number.

pub(crate) const STR_TAG_HI: u64 = 0xFFFC_0000;
const STR_TAG: u64 = STR_TAG_HI << 32;
const CANON_NAN: u64 = 0x7FF8_0000_0000_0000;

#[inline]
pub(crate) fn encode_num(value: f64) -> u64 {
    if value.is_nan() {
        CANON_NAN
    } else {
        value.to_bits()
    }
}

#[inline]
pub(crate) fn encode_str_id(id: u32) -> u64 {
    debug_assert!(
        id != NO_STRING,
        "NO_STRING is expressed by a non-tagged payload"
    );
    STR_TAG | u64::from(id)
}

#[inline]
pub(crate) fn payload_is_str(bits: u64) -> bool {
    (bits >> 32) == STR_TAG_HI
}

/// Numeric view of a payload; string-tagged payloads read as `0.0`.
#[inline]
pub(crate) fn payload_num(bits: u64) -> f64 {
    if payload_is_str(bits) {
        0.0
    } else {
        f64::from_bits(bits)
    }
}

/// String-pool view of a payload; non-tagged payloads read as `NO_STRING`.
#[inline]
pub(crate) fn payload_str_id(bits: u64) -> u32 {
    if payload_is_str(bits) {
        bits as u32
    } else {
        NO_STRING
    }
}

/// Default allocation-lazy row granularity used when the host does not supply one.
pub(crate) const DEFAULT_PAGE_CHUNK_ROWS: usize = 4096;
// Presence is orthogonal to the source kind: calculated spill children keep
// an empty source, and formula cells keep a formula source with payload zero.
const CALCULATED: u8 = 0x80;
#[inline]
fn dense_source(kind: u8, payload: u64) -> (u8, u64) {
    if kind & CALCULATED != 0 {
        (kind & !CALCULATED, 0)
    } else {
        (kind, payload)
    }
}
/// The resolved kind and payload of a raw dense slot: a calculated slot
/// decodes its value, a literal is its own value.
#[inline]
pub(crate) fn dense_resolved(kind: u8, payload: u64) -> (u8, u64) {
    if kind & CALCULATED != 0 {
        decode_cell(payload)
    } else {
        (kind, payload)
    }
}
const BITS_PER_WORD: usize = 64;

struct CellChunk {
    kind: Vec<u8>,
    payload: Vec<u64>,
    style: Vec<u32>,
    loaded: Vec<u64>,
    last_access: Cell<u64>,
}

impl CellChunk {
    fn new(rows: usize, last_access: u64) -> Self {
        let words = rows.div_ceil(BITS_PER_WORD);
        Self {
            kind: vec![KIND_EMPTY; rows],
            payload: vec![0; rows],
            style: vec![0; rows],
            loaded: vec![0; words],
            last_access: Cell::new(last_access),
        }
    }

    fn bit(bits: &[u64], offset: usize) -> bool {
        bits[offset / BITS_PER_WORD] & (1 << (offset % BITS_PER_WORD)) != 0
    }

    fn set_bit(bits: &mut [u64], offset: usize, value: bool) {
        let mask = 1 << (offset % BITS_PER_WORD);
        let word = &mut bits[offset / BITS_PER_WORD];

        if value {
            *word |= mask;
        } else {
            *word &= !mask;
        }
    }

    fn byte_len(&self) -> usize {
        self.kind.len()
            + self.payload.len() * std::mem::size_of::<u64>()
            + self.style.len() * std::mem::size_of::<u32>()
            + self.loaded.len() * std::mem::size_of::<u64>()
    }
}

#[derive(Clone, Copy)]
struct DirtyCell {
    payload: u64,
    revision: u64,
    style: u32,
    revision_index: usize,
    kind: u8,
}

struct StorageEntry {
    row: usize,
    col: usize,
    kind: u8,
    payload: u64,
    style: u32,
    dirty_revision: Option<u64>,
}

pub(crate) const DEFAULT_MAX_PAGED_DIRTY_CELLS: usize = 1_000_000;

struct PagedStorage {
    chunk_rows: usize,
    byte_budget: usize,
    max_dirty_cells: usize,
    chunks: FxHashMap<(usize, usize), CellChunk>,
    dirty: FxHashMap<(usize, usize), DirtyCell>,
    dirty_by_revision: FxHashMap<u64, Vec<(usize, usize)>>,
    read_pinned: FxHashSet<(usize, usize)>,
    pin_scratch: FxHashSet<(usize, usize)>,
    viewport_pinned: FxHashSet<(usize, usize)>,
    viewport_pin_scratch: FxHashSet<(usize, usize)>,
    evictable: RefCell<BTreeSet<(u64, usize, usize)>>,
    clock: Cell<u64>,
    eviction_candidate_checks: u64,
    evictions: u64,
}

/// The largest chunk a paged sheet accepts: the rows of a whole sheet.
pub(crate) const MAX_PAGE_CHUNK_ROWS: usize = crate::calc::SHEET_ROWS as usize;

impl PagedStorage {
    /// A chunk holds a power of two of rows, so `chunk_rows` rounds up to
    /// one. A size above [`MAX_PAGE_CHUNK_ROWS`] is rejected before rounding,
    /// which could otherwise overflow to zero.
    fn new(chunk_rows: usize, byte_budget: usize, max_dirty_cells: usize) -> Result<Self, String> {
        let chunk_rows = Some(chunk_rows.max(1))
            .filter(|&rows| rows <= MAX_PAGE_CHUNK_ROWS)
            .map(usize::next_power_of_two)
            .ok_or_else(|| {
                format!("paged sheet chunk of {chunk_rows} rows exceeds {MAX_PAGE_CHUNK_ROWS} rows")
            })?;

        Ok(Self {
            chunk_rows,
            byte_budget,
            max_dirty_cells,
            chunks: FxHashMap::default(),
            dirty: FxHashMap::default(),
            dirty_by_revision: FxHashMap::default(),
            read_pinned: FxHashSet::default(),
            pin_scratch: FxHashSet::default(),
            viewport_pinned: FxHashSet::default(),
            viewport_pin_scratch: FxHashSet::default(),
            evictable: RefCell::new(BTreeSet::new()),
            clock: Cell::new(0),
            eviction_candidate_checks: 0,
            evictions: 0,
        })
    }

    fn key_offset(&self, row: usize, col: usize) -> ((usize, usize), usize) {
        ((col, row / self.chunk_rows), row % self.chunk_rows)
    }

    fn chunk_bytes(&self) -> usize {
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

    fn touch(&self, key: (usize, usize)) {
        let Some(chunk) = self.chunks.get(&key) else {
            return;
        };

        let eligible = !self.read_pinned.contains(&key) && !self.viewport_pinned.contains(&key);
        let previous = chunk.last_access.get();
        let mut evictable = self.evictable.borrow_mut();

        if eligible {
            evictable.remove(&(previous, key.0, key.1));
        }

        let access = self.next_access();
        chunk.last_access.set(access);

        if eligible {
            evictable.insert((access, key.0, key.1));
        }
    }

    fn evict_for_chunk(&mut self) {
        if self.byte_budget == 0 {
            return;
        }

        let chunk_bytes = self.chunk_bytes();

        while (self.chunks.len() + 1) * chunk_bytes > self.byte_budget {
            let candidate = self.evictable.get_mut().pop_first();
            let Some((_, col, chunk_index)) = candidate else {
                break;
            };

            self.eviction_candidate_checks = self.eviction_candidate_checks.saturating_add(1);
            self.chunks.remove(&(col, chunk_index));
            self.evictions = self.evictions.saturating_add(1);
        }
    }

    fn ensure_chunk(&mut self, key: (usize, usize)) -> &mut CellChunk {
        if !self.chunks.contains_key(&key) {
            self.evict_for_chunk();

            let access = self.next_access();
            self.chunks
                .insert(key, CellChunk::new(self.chunk_rows, access));

            if !self.read_pinned.contains(&key) && !self.viewport_pinned.contains(&key) {
                self.evictable.get_mut().insert((access, key.0, key.1));
            }
        } else {
            self.touch(key);
        }

        self.chunks.get_mut(&key).expect("inserted paged chunk")
    }

    fn clean_loaded(&self, row: usize, col: usize) -> bool {
        let (key, offset) = self.key_offset(row, col);
        self.chunks
            .get(&key)
            .is_some_and(|chunk| CellChunk::bit(&chunk.loaded, offset))
    }

    fn read(&self, row: usize, col: usize) -> (u8, u64, u32, bool, bool) {
        if let Some(cell) = self.dirty.get(&(row, col)) {
            return (cell.kind, cell.payload, cell.style, true, true);
        }

        let (key, offset) = self.key_offset(row, col);
        let Some(chunk) = self.chunks.get(&key) else {
            return (KIND_EMPTY, 0, 0, false, false);
        };

        self.touch(key);

        if !CellChunk::bit(&chunk.loaded, offset) {
            return (KIND_EMPTY, 0, 0, false, false);
        }

        (
            chunk.kind[offset],
            chunk.payload[offset],
            chunk.style[offset],
            true,
            false,
        )
    }

    fn write_clean(&mut self, row: usize, col: usize, kind: u8, payload: u64, style: u32) {
        let (key, offset) = self.key_offset(row, col);
        let chunk = self.ensure_chunk(key);
        chunk.kind[offset] = kind;
        chunk.payload[offset] = payload;
        chunk.style[offset] = style;
        CellChunk::set_bit(&mut chunk.loaded, offset, true);
    }

    fn can_dirty_cell(&self, row: usize, col: usize) -> bool {
        self.dirty.contains_key(&(row, col)) || self.dirty.len() < self.max_dirty_cells
    }

    fn can_dirty_rect(&self, r0: usize, c0: usize, rows: usize, cols: usize) -> bool {
        let mut additional = 0usize;

        for col in c0..c0 + cols {
            for row in r0..r0 + rows {
                if !self.dirty.contains_key(&(row, col)) {
                    additional += 1;

                    if self.dirty.len() + additional > self.max_dirty_cells {
                        return false;
                    }
                }
            }
        }

        true
    }

    fn prepare_dirty_rect(
        &mut self,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
        revision: u64,
    ) -> bool {
        let additional = (c0..c0 + cols)
            .flat_map(|col| (r0..r0 + rows).map(move |row| (row, col)))
            .filter(|key| !self.dirty.contains_key(key))
            .count();

        if self.dirty.len().saturating_add(additional) > self.max_dirty_cells
            || self.dirty.try_reserve(additional).is_err()
        {
            return false;
        }

        if !self.dirty_by_revision.contains_key(&revision)
            && self.dirty_by_revision.try_reserve(1).is_err()
        {
            return false;
        }

        self.dirty_by_revision
            .entry(revision)
            .or_default()
            .try_reserve(rows.saturating_mul(cols))
            .is_ok()
    }

    fn prepare_dirty_cells(&mut self, cells: &[(usize, usize)], revision: u64) -> bool {
        let additional = cells
            .iter()
            .filter(|key| !self.dirty.contains_key(key))
            .count();
        if self.dirty.len().saturating_add(additional) > self.max_dirty_cells
            || self.dirty.try_reserve(additional).is_err()
        {
            return false;
        }
        if !self.dirty_by_revision.contains_key(&revision)
            && self.dirty_by_revision.try_reserve(1).is_err()
        {
            return false;
        }
        self.dirty_by_revision
            .entry(revision)
            .or_default()
            .try_reserve(cells.len())
            .is_ok()
    }

    fn reserve_revision_slot(&mut self, revision: u64, key: (usize, usize)) -> Option<usize> {
        if !self.dirty_by_revision.contains_key(&revision)
            && self.dirty_by_revision.try_reserve(1).is_err()
        {
            return None;
        }
        let slots = self.dirty_by_revision.entry(revision).or_default();
        if slots.try_reserve(1).is_err() {
            return None;
        }
        let index = slots.len();
        slots.push(key);
        Some(index)
    }

    fn remove_revision_slot(&mut self, revision: u64, index: usize) {
        let Some(slots) = self.dirty_by_revision.get_mut(&revision) else {
            return;
        };
        let moved = (index + 1 < slots.len()).then(|| slots[slots.len() - 1]);
        slots.swap_remove(index);
        let empty = slots.is_empty();
        if let Some(moved) = moved {
            if let Some(cell) = self.dirty.get_mut(&moved) {
                cell.revision_index = index;
            }
        }
        if empty {
            self.dirty_by_revision.remove(&revision);
        }
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
        debug_assert_ne!(revision, 0);
        let key = (row, col);
        if let Some(cell) = self.dirty.get(&key).copied() {
            if cell.revision == revision {
                self.dirty.insert(
                    key,
                    DirtyCell {
                        payload,
                        revision,
                        revision_index: cell.revision_index,
                        style,
                        kind,
                    },
                );
                return true;
            }
            let Some(revision_index) = self.reserve_revision_slot(revision, key) else {
                return false;
            };
            self.remove_revision_slot(cell.revision, cell.revision_index);
            self.dirty.insert(
                key,
                DirtyCell {
                    payload,
                    revision,
                    revision_index,
                    style,
                    kind,
                },
            );
            return true;
        }
        if self.dirty.len() >= self.max_dirty_cells || self.dirty.try_reserve(1).is_err() {
            return false;
        }
        let Some(revision_index) = self.reserve_revision_slot(revision, key) else {
            return false;
        };
        self.dirty.insert(
            key,
            DirtyCell {
                payload,
                revision,
                revision_index,
                style,
                kind,
            },
        );
        true
    }

    fn restore_dirty(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        revision: u64,
    ) -> bool {
        self.write_dirty(row, col, kind, payload, style, revision)
    }

    fn write(
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
        if let Some(cell) = self.dirty.get_mut(&(row, col)) {
            cell.kind = kind;
            cell.payload = payload;
            cell.style = style;
        } else {
            self.write_clean(row, col, kind, payload, style);
        }
        true
    }

    fn hydrate(&mut self, row: usize, col: usize, kind: u8, payload: u64, style: u32) -> bool {
        if self.dirty.contains_key(&(row, col)) {
            return false;
        }
        self.write_clean(row, col, kind, payload, style);
        true
    }

    fn mark_clean(&mut self, row: usize, col: usize) -> bool {
        let key = (row, col);
        let Some(cell) = self.dirty.get(&key).copied() else {
            return false;
        };
        self.remove_revision_slot(cell.revision, cell.revision_index);
        self.dirty.remove(&key);
        self.write_clean(row, col, cell.kind, cell.payload, cell.style);
        true
    }

    fn acknowledge_revision(&mut self, revision: u64) {
        let Some(matches) = self.dirty_by_revision.remove(&revision) else {
            return;
        };
        for (row, col) in matches {
            let key = (row, col);
            let Some(cell) = self.dirty.get(&key).copied() else {
                continue;
            };
            if cell.revision != revision {
                continue;
            }
            self.dirty.remove(&key);
            self.write_clean(row, col, cell.kind, cell.payload, cell.style);
        }
    }

    fn pin_read_window(&mut self, start: usize, end: usize, rows: &[u32], cols: &[u32]) {
        let mut next = std::mem::take(&mut self.pin_scratch);
        for &col in cols {
            if rows.is_empty() {
                if start < end {
                    for chunk in start / self.chunk_rows..=(end - 1) / self.chunk_rows {
                        next.insert((col as usize, chunk));
                    }
                }
            } else {
                for &row in rows {
                    next.insert((col as usize, row as usize / self.chunk_rows));
                }
            }
        }
        self.replace_read_pins(next);
    }

    fn pin_viewport_bands(&mut self, bands: &[u32]) {
        let mut next = std::mem::take(&mut self.viewport_pin_scratch);
        for &[r0, r1, c0, c1] in bands.as_chunks::<4>().0 {
            let [r0, r1, c0, c1] = [r0 as usize, r1 as usize, c0 as usize, c1 as usize];
            if r0 >= r1 {
                continue;
            }
            for col in c0..c1 {
                for chunk in r0 / self.chunk_rows..=(r1 - 1) / self.chunk_rows {
                    next.insert((col, chunk));
                }
            }
        }
        for key in self.viewport_pinned.difference(&next) {
            if self.read_pinned.contains(key) {
                continue;
            }
            if let Some(chunk) = self.chunks.get(key) {
                self.evictable
                    .get_mut()
                    .insert((chunk.last_access.get(), key.0, key.1));
            }
        }
        for key in next.difference(&self.viewport_pinned) {
            if let Some(chunk) = self.chunks.get(key) {
                self.evictable
                    .get_mut()
                    .remove(&(chunk.last_access.get(), key.0, key.1));
            }
        }
        let mut previous = std::mem::replace(&mut self.viewport_pinned, next);
        previous.clear();
        self.viewport_pin_scratch = previous;
    }

    fn replace_read_pins(&mut self, next: FxHashSet<(usize, usize)>) {
        let access = self.next_access();
        let current = &mut self.read_pinned;
        for key in current.difference(&next) {
            if self.viewport_pinned.contains(key) {
                continue;
            }
            if let Some(chunk) = self.chunks.get(key) {
                self.evictable
                    .get_mut()
                    .insert((chunk.last_access.get(), key.0, key.1));
            }
        }
        for key in next.difference(current) {
            if let Some(chunk) = self.chunks.get(key) {
                self.evictable
                    .get_mut()
                    .remove(&(chunk.last_access.get(), key.0, key.1));
            }
        }
        let mut previous = std::mem::replace(current, next);
        previous.clear();
        self.pin_scratch = previous;
        for &key in current.iter() {
            if let Some(chunk) = self.chunks.get(&key) {
                chunk.last_access.set(access);
            }
        }
    }

    fn persisted_coordinates(&self) -> Vec<CellKey> {
        let mut coordinates = Vec::new();
        for (&(col, chunk_index), chunk) in &self.chunks {
            for offset in 0..self.chunk_rows {
                if !CellChunk::bit(&chunk.loaded, offset) {
                    continue;
                }
                let row = chunk_index * self.chunk_rows + offset;
                if self.dirty.contains_key(&(row, col))
                    || (chunk.kind[offset] == KIND_EMPTY && chunk.style[offset] == 0)
                {
                    continue;
                }
                coordinates.push((row as u32, col as u32));
            }
        }
        coordinates.extend(self.dirty.iter().filter_map(|(&(row, col), cell)| {
            (cell.kind != KIND_EMPTY || cell.style != 0).then_some((row as u32, col as u32))
        }));
        coordinates
    }

    fn entries(&self) -> Vec<StorageEntry> {
        let mut entries = Vec::with_capacity(self.loaded_cells());
        for (&(col, chunk_index), chunk) in &self.chunks {
            for offset in 0..self.chunk_rows {
                if !CellChunk::bit(&chunk.loaded, offset) {
                    continue;
                }
                let row = chunk_index * self.chunk_rows + offset;
                if self.dirty.contains_key(&(row, col)) {
                    continue;
                }
                entries.push(StorageEntry {
                    row,
                    col,
                    kind: chunk.kind[offset],
                    payload: chunk.payload[offset],
                    style: chunk.style[offset],
                    dirty_revision: None,
                });
            }
        }
        entries.extend(self.dirty.iter().map(|(&(row, col), cell)| StorageEntry {
            row,
            col,
            kind: cell.kind,
            payload: cell.payload,
            style: cell.style,
            dirty_revision: Some(cell.revision),
        }));
        entries.sort_unstable_by_key(|entry| (entry.col, entry.row));
        entries
    }

    fn dirty_coordinates(&self) -> Vec<f64> {
        let mut coordinates = Vec::with_capacity(self.dirty.len().saturating_mul(2));
        let mut keys: Vec<_> = self.dirty.keys().copied().collect();
        keys.sort_unstable();
        for (row, col) in keys {
            coordinates.push(row as f64);
            coordinates.push(col as f64);
        }
        coordinates
    }

    fn byte_len(&self) -> usize {
        self.chunks.values().map(CellChunk::byte_len).sum()
    }

    fn dirty_byte_len(&self) -> usize {
        let dirty_cells = self.dirty.capacity()
            * (std::mem::size_of::<(usize, usize)>()
                + std::mem::size_of::<DirtyCell>()
                + std::mem::size_of::<u8>());
        let revision_map = self.dirty_by_revision.capacity()
            * (std::mem::size_of::<u64>()
                + std::mem::size_of::<Vec<(usize, usize)>>()
                + std::mem::size_of::<u8>());
        let revision_cells = self
            .dirty_by_revision
            .values()
            .map(|cells| cells.capacity() * std::mem::size_of::<(usize, usize)>())
            .sum::<usize>();
        dirty_cells + revision_map + revision_cells
    }

    fn loaded_cells(&self) -> usize {
        let clean = self
            .chunks
            .values()
            .map(|chunk| {
                chunk
                    .loaded
                    .iter()
                    .map(|word| word.count_ones() as usize)
                    .sum::<usize>()
            })
            .sum::<usize>();
        clean
            + self
                .dirty
                .keys()
                .filter(|&&(row, col)| !self.clean_loaded(row, col))
                .count()
    }

    fn dirty_cells(&self) -> usize {
        self.dirty.len()
    }

    fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let indexes = stats.owner_mut(PAGED_INDEXES);
        indexes
            .add_hash_table::<(usize, usize), CellChunk>(self.chunks.len(), self.chunks.capacity());
        indexes.add_hash_table::<(usize, usize), ()>(
            self.read_pinned.len(),
            self.read_pinned.capacity(),
        );
        indexes.add_hash_table::<(usize, usize), ()>(
            self.pin_scratch.len(),
            self.pin_scratch.capacity(),
        );
        indexes.add_hash_table::<(usize, usize), ()>(
            self.viewport_pinned.len(),
            self.viewport_pinned.capacity(),
        );
        indexes.add_hash_table::<(usize, usize), ()>(
            self.viewport_pin_scratch.len(),
            self.viewport_pin_scratch.capacity(),
        );
        // `std::collections::BTreeSet` exposes no node capacity. Report its
        // eviction entries without inventing allocator bytes from `size_of_val`.
        indexes.entries = indexes
            .entries
            .saturating_add(self.evictable.borrow().len());

        for chunk in self.chunks.values() {
            stats
                .owner_mut(PAGED_KINDS)
                .add_vec::<u8>(chunk.kind.len(), chunk.kind.capacity());
            stats
                .owner_mut(PAGED_PAYLOADS)
                .add_vec::<u64>(chunk.payload.len(), chunk.payload.capacity());
            stats
                .owner_mut(PAGED_STYLES)
                .add_vec::<u32>(chunk.style.len(), chunk.style.capacity());
            stats
                .owner_mut(PAGED_LOADED_BITMAPS)
                .add_vec::<u64>(chunk.loaded.len(), chunk.loaded.capacity());
        }
        let dirty = stats.owner_mut(PAGED_DIRTY_BITMAPS);
        dirty.add_hash_table::<(usize, usize), DirtyCell>(self.dirty.len(), self.dirty.capacity());
        dirty.add_hash_table::<u64, Vec<(usize, usize)>>(
            self.dirty_by_revision.len(),
            self.dirty_by_revision.capacity(),
        );
        for cells in self.dirty_by_revision.values() {
            dirty.add_vec::<(usize, usize)>(cells.len(), cells.capacity());
        }
    }
}

/// Aggregate eager-allocation ceiling mirrored by `DEFAULT_SNAPSHOT_RESOURCE_LIMITS`.
pub(crate) const MAX_DENSE_CELLS: usize = 5_000_000;

pub(crate) fn checked_dense_cell_count(n_cols: usize, row_count: usize) -> Option<usize> {
    n_cols
        .checked_mul(row_count)
        .filter(|&cells| cells <= MAX_DENSE_CELLS)
}

/// Kinds, payloads and styles of a dense grid.
type DenseBuffers = (Vec<u8>, Vec<u64>, Vec<u32>);

/// Empty dense buffers for a grid, or an error when the grid is over
/// [`MAX_DENSE_CELLS`] or memory runs out.
fn try_dense_buffers(n_cols: usize, row_count: usize) -> Result<DenseBuffers, String> {
    let len = checked_dense_cell_count(n_cols, row_count).ok_or_else(|| {
        format!(
            "dense sheet resource limit exceeded: {n_cols} columns by {row_count} rows exceeds {MAX_DENSE_CELLS} cells"
        )
    })?;
    let mut kind = Vec::new();
    kind.try_reserve_exact(len)
        .map_err(|_| "dense sheet allocation failed for cell kinds".to_string())?;
    kind.resize(len, KIND_EMPTY);
    let mut payload = Vec::new();
    payload
        .try_reserve_exact(len)
        .map_err(|_| "dense sheet allocation failed for cell payloads".to_string())?;
    payload.resize(len, 0);
    let mut style = Vec::new();
    style
        .try_reserve_exact(len)
        .map_err(|_| "dense sheet allocation failed for cell styles".to_string())?;
    style.resize(len, 0);
    Ok((kind, payload, style))
}

/// A run of `len` rows copied from `from` in the old grid to `to` in the new.
#[derive(Clone, Copy)]
struct RowRun {
    from: usize,
    to: usize,
    len: usize,
}

/// One sheet's physical cells: column-major dense vectors or paged chunks with a
/// revisioned dirty overlay, plus calculated slots keyed by the same indices.
pub(crate) struct CellStorage {
    n_cols: usize,
    row_count: usize,
    /// `kind[col * row_count + row]`
    kind: Vec<u8>,
    /// NaN-boxed value payload; `0` when empty.
    payload: Vec<u64>,
    /// Host style-dictionary id; `0` means "no explicit style".
    style: Vec<u32>,
    paged: Option<PagedStorage>,
    /// Paged calculated scalars; dense results use the payload slot with the
    /// CALCULATED presence bit in kind. Source projections mask both back out.
    derived: DerivedOverlay,
    /// Makes invalidation constant-time for literal-only sheets.
    dense_calculated_cells: usize,
}

impl CellStorage {
    /// Physical roots include shadowed clean pages: acknowledgement can expose them.
    pub(crate) fn visit_string_ids(&self, mut visit: impl FnMut(u32)) {
        let mut visit_payload = |payload: u64| {
            let id = payload_str_id(payload);
            if id != NO_STRING {
                visit(id);
            }
        };
        for &payload in &self.payload {
            visit_payload(payload);
        }
        self.derived.visit_payloads(&mut visit_payload);
        if let Some(paged) = &self.paged {
            for chunk in paged.chunks.values() {
                for &payload in &chunk.payload {
                    visit_payload(payload);
                }
            }
            for dirty in paged.dirty.values() {
                visit_payload(dirty.payload);
            }
        }
    }

    pub(crate) fn remap_string_ids(&mut self, remap: &[u32]) {
        let remap_payload = |payload: &mut u64| {
            let id = payload_str_id(*payload);
            if id != NO_STRING {
                *payload = encode_str_id(remap[id as usize]);
            }
        };
        for payload in &mut self.payload {
            remap_payload(payload);
        }
        self.derived.remap_payloads(&remap_payload);
        if let Some(paged) = &mut self.paged {
            for chunk in paged.chunks.values_mut() {
                for payload in &mut chunk.payload {
                    remap_payload(payload);
                }
            }
            for dirty in paged.dirty.values_mut() {
                remap_payload(&mut dirty.payload);
            }
        }
    }

    pub(crate) fn try_new(n_cols: usize, row_count: usize) -> Result<Self, String> {
        let (kind, payload, style) = try_dense_buffers(n_cols, row_count)?;

        Ok(Self {
            n_cols,
            row_count,
            kind,
            payload,
            style,
            paged: None,
            derived: DerivedOverlay::default(),
            dense_calculated_cells: 0,
        })
    }

    pub(crate) fn new_paged(
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> Result<Self, String> {
        Ok(Self {
            n_cols,
            row_count,
            kind: Vec::new(),
            payload: Vec::new(),
            style: Vec::new(),
            paged: Some(PagedStorage::new(chunk_rows, byte_budget, max_dirty_cells)?),
            derived: DerivedOverlay::default(),
            dense_calculated_cells: 0,
        })
    }

    pub(crate) fn is_paged(&self) -> bool {
        self.paged.is_some()
    }

    fn coordinates(&self, index: usize) -> (usize, usize) {
        (index % self.row_count, index / self.row_count)
    }

    /// Unordered source coordinates holding a value or explicit style. Calculated
    /// output has no source coordinate; explicit spill-child styles remain.
    pub(crate) fn persisted_coordinates(&self) -> Vec<CellKey> {
        if let Some(paged) = &self.paged {
            return paged.persisted_coordinates();
        }

        let mut coordinates = Vec::new();
        for index in 0..self.kind.len() {
            if self.kind[index] & !CALCULATED == KIND_EMPTY && self.style[index] == 0 {
                continue;
            }
            let (row, col) = self.coordinates(index);
            coordinates.push((row as u32, col as u32));
        }
        coordinates
    }

    #[inline(always)]
    pub(crate) fn kind_at(&self, index: usize) -> u8 {
        let source = if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            let (kind, _, _, loaded, _) = paged.read(row, col);
            if !loaded {
                return kind;
            }

            kind
        } else {
            // Literals and plain empties are decided by the kind byte alone, so
            // only calculated slots load (and bounds-check) their payload.
            let kind = self.kind[index];
            if kind & CALCULATED == 0 {
                return kind;
            }
            return if kind & !CALCULATED == KIND_FORMULA {
                KIND_FORMULA
            } else {
                decode_cell(self.payload[index]).0
            };
        };

        if source == KIND_EMPTY && !self.derived.is_empty() {
            self.derived.get(index).map_or(source, |value| value.0)
        } else {
            source
        }
    }

    #[inline]
    pub(crate) fn source_kind_at(&self, index: usize) -> u8 {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            paged.read(row, col).0
        } else {
            self.kind[index] & !CALCULATED
        }
    }

    #[inline]
    pub(crate) fn source_payload_at(&self, index: usize) -> u64 {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            paged.read(row, col).1
        } else {
            dense_source(self.kind[index], self.payload[index]).1
        }
    }

    #[inline]
    pub(crate) fn resolved_payload_at(&self, index: usize) -> u64 {
        if self.paged.is_none() {
            return dense_resolved(self.kind[index], self.payload[index]).1;
        }
        if self.derived.is_empty() {
            return self.source_payload_at(index);
        }

        let (kind, payload) = if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            let (kind, payload, _, loaded, _) = paged.read(row, col);
            if !loaded {
                return payload;
            }

            (kind, payload)
        } else {
            (self.kind[index], self.payload[index])
        };

        if kind == KIND_EMPTY || kind == KIND_FORMULA {
            self.derived.get(index).map_or(payload, |cell| cell.1)
        } else {
            payload
        }
    }

    #[inline]
    pub(crate) fn calculated_cell_at(&self, index: usize) -> Option<(u8, u64)> {
        if self.paged.is_none() {
            return (self.kind[index] & CALCULATED != 0).then(|| decode_cell(self.payload[index]));
        }
        self.derived.get(index)
    }

    #[inline]
    pub(crate) fn calculated_error_at(&self, index: usize) -> Option<FormulaError> {
        let (kind, payload) = self.calculated_cell_at(index)?;
        (kind == KIND_FORMULA)
            .then(|| FormulaError::from_slot(payload))
            .flatten()
    }

    pub(crate) fn set_derived(&mut self, index: usize, kind: u8, payload: u64) -> bool {
        if self.paged.is_none() {
            let source = self.kind[index] & !CALCULATED;
            debug_assert!(source == KIND_EMPTY || source == KIND_FORMULA);
            self.dense_calculated_cells += usize::from(self.kind[index] & CALCULATED == 0);
            self.kind[index] = source | CALCULATED;
            self.payload[index] = encode_cell(kind, payload);
            return true;
        }
        if self.derived.is_empty() && !self.reserve_derived(1) {
            return false;
        }

        self.derived.set(index, kind, payload);
        true
    }

    pub(crate) fn reserve_derived(&mut self, additional: usize) -> bool {
        self.paged.is_none() || self.derived.reserve(additional)
    }

    pub(crate) fn formula_value_kind(&self, index: usize) -> crate::types::FormulaValueKind {
        use crate::types::{FormulaValueKind, KIND_BOOL, KIND_STRING};

        match self.calculated_cell_at(index).map(|cell| cell.0) {
            Some(KIND_STRING) => FormulaValueKind::Text,
            Some(KIND_BOOL) => FormulaValueKind::Bool,
            Some(KIND_EMPTY) => FormulaValueKind::Blank,
            _ => FormulaValueKind::Number,
        }
    }

    pub(crate) fn invalidate_derived(&mut self) {
        if self.dense_calculated_cells != 0 {
            for (kind, payload) in self.kind.iter_mut().zip(&mut self.payload) {
                if *kind & CALCULATED != 0 {
                    *kind &= !CALCULATED;
                    *payload = 0;
                }
            }
            self.dense_calculated_cells = 0;
        }
        self.derived.clear();
    }

    #[inline]
    pub(crate) fn style_at(&self, index: usize) -> u32 {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            paged.read(row, col).2
        } else {
            self.style[index]
        }
    }

    pub(crate) fn can_dirty_cell(&self, row: usize, col: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| paged.can_dirty_cell(row, col))
    }

    pub(crate) fn can_dirty_rect(&self, r0: usize, c0: usize, rows: usize, cols: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| paged.can_dirty_rect(r0, c0, rows, cols))
    }

    pub(crate) fn prepare_dirty_rect(
        &mut self,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
        revision: u64,
    ) -> bool {
        self.paged
            .as_mut()
            .is_none_or(|paged| paged.prepare_dirty_rect(r0, c0, rows, cols, revision))
    }

    pub(crate) fn prepare_dirty_cells(&mut self, cells: &[(usize, usize)], revision: u64) -> bool {
        self.paged
            .as_mut()
            .is_none_or(|paged| paged.prepare_dirty_cells(cells, revision))
    }

    /// Replaces source storage and invalidates its calculated slot. A revisioned
    /// paged write must first reserve its overlay with `prepare_dirty_cells`.
    #[inline]
    pub(crate) fn write_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
        dirty_revision: Option<u64>,
    ) -> bool {
        self.remove_source_calculation(row, col);

        if let Some(paged) = &mut self.paged {
            return paged.write(row, col, kind, payload, style, dirty_revision);
        }

        let index = self.idx(row, col);
        self.kind[index] = kind;
        self.payload[index] = payload;
        self.style[index] = style;
        true
    }

    /// A style edit changes source formatting, not calculated cell identity.
    pub(crate) fn write_style(
        &mut self,
        row: usize,
        col: usize,
        style: u32,
        revision: Option<u64>,
    ) -> bool {
        let index = self.idx(row, col);
        let kind = self.source_kind_at(index);
        let payload = self.source_payload_at(index);

        if let Some(paged) = &mut self.paged {
            return paged.write(row, col, kind, payload, style, revision);
        }

        self.style[index] = style;
        true
    }

    pub(crate) fn hydrate_cell(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
        style: u32,
    ) -> bool {
        if let Some(paged) = &mut self.paged {
            if !paged.hydrate(row, col, kind, payload, style) {
                return false;
            }
            self.remove_source_calculation(row, col);
        } else {
            self.remove_source_calculation(row, col);
            let index = self.idx(row, col);
            self.kind[index] = kind;
            self.payload[index] = payload;
            self.style[index] = style;
        }

        true
    }

    /// A calculated slot may exist only over an empty or formula source, so every
    /// source replacement removes it.
    #[inline]
    fn remove_source_calculation(&mut self, row: usize, col: usize) {
        self.remove_calculated(self.idx(row, col));
    }

    pub(crate) fn is_loaded(&self, row: usize, col: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| paged.read(row, col).3)
    }

    pub(crate) fn is_cell_dirty(&self, row: usize, col: usize) -> bool {
        self.paged
            .as_ref()
            .is_some_and(|paged| paged.read(row, col).4)
    }

    pub(crate) fn dirty_coordinates(&self) -> Vec<f64> {
        self.paged
            .as_ref()
            .map_or_else(Vec::new, PagedStorage::dirty_coordinates)
    }

    pub(crate) fn mark_range_clean(
        &mut self,
        start_row: usize,
        end_row: usize,
        start_col: usize,
        end_col: usize,
    ) {
        if let Some(paged) = &mut self.paged {
            for col in start_col..end_col {
                for row in start_row..end_row {
                    paged.mark_clean(row, col);
                }
            }
        }
    }

    pub(crate) fn acknowledge_revision(&mut self, revision: u64) {
        if let Some(paged) = &mut self.paged {
            paged.acknowledge_revision(revision);
        }
    }

    pub(crate) fn pin_read_window(&mut self, start: usize, end: usize, rows: &[u32], cols: &[u32]) {
        if let Some(paged) = &mut self.paged {
            paged.pin_read_window(start, end, rows, cols);
        }
    }

    pub(crate) fn pin_viewport_bands(&mut self, bands: &[u32]) {
        if let Some(paged) = &mut self.paged {
            paged.pin_viewport_bands(bands);
        }
    }

    pub(crate) fn paged_stats(&self) -> Option<(usize, usize, usize, usize, usize)> {
        self.paged.as_ref().map(|paged| {
            (
                paged.chunks.len(),
                paged.loaded_cells(),
                paged.dirty_cells(),
                paged.byte_len(),
                paged.dirty_byte_len(),
            )
        })
    }

    pub(crate) fn is_fully_loaded(&self) -> bool {
        self.paged.as_ref().is_none_or(|paged| {
            self.row_count
                .checked_mul(self.n_cols)
                .is_some_and(|cells| paged.loaded_cells() >= cells)
        })
    }

    pub(crate) fn range_fully_loaded(&self, r0: usize, c0: usize, r1: usize, c1: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| (c0..=c1).all(|col| (r0..=r1).all(|row| paged.read(row, col).3)))
    }

    #[inline]
    pub(crate) fn num_at(&self, i: usize) -> f64 {
        payload_num(self.resolved_payload_at(i))
    }

    #[inline]
    pub(crate) fn str_id_at(&self, i: usize) -> u32 {
        payload_str_id(self.resolved_payload_at(i))
    }

    /// Reads the source payload without checking calculated values.
    /// Literal kinds cannot have a calculated value; formulas must resolve it.
    ///
    /// # Safety
    /// `i` must be in-bounds for the dense cell vectors.
    #[inline]
    pub(crate) unsafe fn payload_unchecked(&self, i: usize) -> u64 {
        unsafe { *self.payload.get_unchecked(i) }
    }

    #[inline]
    pub(crate) fn contains_cell(&self, row: usize, col: usize) -> bool {
        row < self.row_count && col < self.n_cols
    }

    #[inline]
    pub(crate) fn idx(&self, row: usize, col: usize) -> usize {
        col * self.row_count + row
    }

    fn remap_paged<F>(&mut self, new_rows: usize, new_cols: usize, mut remap: F)
    where
        F: FnMut(usize, usize) -> Option<(usize, usize)>,
    {
        let Some(current) = self.paged.take() else {
            return;
        };

        let entries = current.entries();
        let mut next = PagedStorage::new(
            current.chunk_rows,
            current.byte_budget,
            current.max_dirty_cells,
        )
        .expect("a live paged sheet already has a valid chunk size");

        for entry in entries {
            if let Some((new_row, new_col)) = remap(entry.row, entry.col) {
                if new_row < new_rows && new_col < new_cols {
                    if let Some(revision) = entry.dirty_revision {
                        let _ = next.restore_dirty(
                            new_row,
                            new_col,
                            entry.kind,
                            entry.payload,
                            entry.style,
                            revision,
                        );
                    } else {
                        let _ = next.write(
                            new_row,
                            new_col,
                            entry.kind,
                            entry.payload,
                            entry.style,
                            None,
                        );
                    }
                }
            }
        }

        self.row_count = new_rows;
        self.n_cols = new_cols;
        self.paged = Some(next);
    }

    /// Whether the grid can take `rows` rows of `cols` columns. A dense grid
    /// must stay within [`MAX_DENSE_CELLS`]; a paged grid allocates per chunk
    /// and has no such bound.
    pub(crate) fn check_dimensions(&self, rows: usize, cols: usize) -> Result<(), String> {
        if self.is_paged() || checked_dense_cell_count(cols, rows).is_some() {
            Ok(())
        } else {
            Err(format!(
                "dense sheet resource limit exceeded: {cols} columns by {rows} rows exceeds {MAX_DENSE_CELLS} cells"
            ))
        }
    }

    /// Rebuilds the dense buffers with `new_rows` rows, copying each run of
    /// old rows in every column. On error nothing changes.
    fn rebuild_rows(&mut self, new_rows: usize, runs: &[RowRun]) -> Result<(), String> {
        let (mut kind, mut payload, mut style) = try_dense_buffers(self.n_cols, new_rows)?;
        self.invalidate_derived();

        for col in 0..self.n_cols {
            let old_base = col * self.row_count;
            let new_base = col * new_rows;
            for run in runs {
                let old = old_base + run.from..old_base + run.from + run.len;
                let new = new_base + run.to..new_base + run.to + run.len;
                kind[new.clone()].copy_from_slice(&self.kind[old.clone()]);
                payload[new.clone()].copy_from_slice(&self.payload[old.clone()]);
                style[new].copy_from_slice(&self.style[old]);
            }
        }

        self.kind = kind;
        self.payload = payload;
        self.style = style;
        self.row_count = new_rows;
        Ok(())
    }

    /// Rebuilds the dense buffers with `new_cols` columns. `old_col` names the
    /// old column each new column copies, or `None` for a blank column. On
    /// error nothing changes.
    fn rebuild_cols(
        &mut self,
        new_cols: usize,
        old_col: impl Fn(usize) -> Option<usize>,
    ) -> Result<(), String> {
        let (mut kind, mut payload, mut style) = try_dense_buffers(new_cols, self.row_count)?;
        self.invalidate_derived();

        let rows = self.row_count;
        for new_col in 0..new_cols {
            let Some(old_col) = old_col(new_col) else {
                continue;
            };
            let old = old_col * rows..(old_col + 1) * rows;
            let new = new_col * rows..(new_col + 1) * rows;
            kind[new.clone()].copy_from_slice(&self.kind[old.clone()]);
            payload[new.clone()].copy_from_slice(&self.payload[old.clone()]);
            style[new].copy_from_slice(&self.style[old]);
        }

        self.kind = kind;
        self.payload = payload;
        self.style = style;
        self.n_cols = new_cols;
        Ok(())
    }

    /// Shift rows `[at, row_count)` down by `count`, opening a blank gap. On
    /// error nothing changes.
    pub(crate) fn insert_rows(&mut self, at: usize, count: usize) -> Result<(), String> {
        if count == 0 {
            return Ok(());
        }

        let at = at.min(self.row_count);
        let old = self.row_count;
        let new_count = old
            .checked_add(count)
            .ok_or_else(|| format!("{old} rows plus {count} rows overflow the row count"))?;
        if self.is_paged() {
            self.invalidate_derived();
            self.remap_paged(new_count, self.n_cols, |row, col| {
                Some((if row >= at { row + count } else { row }, col))
            });
            return Ok(());
        }

        self.rebuild_rows(
            new_count,
            &[
                RowRun {
                    from: 0,
                    to: 0,
                    len: at,
                },
                RowRun {
                    from: at,
                    to: at + count,
                    len: old - at,
                },
            ],
        )
    }

    /// Delete `count` rows starting at `at`, closing the gap. On error
    /// nothing changes.
    pub(crate) fn delete_rows(&mut self, at: usize, count: usize) -> Result<(), String> {
        if count == 0 || at >= self.row_count {
            return Ok(());
        }

        let count = count.min(self.row_count - at);
        let old = self.row_count;
        if self.is_paged() {
            self.invalidate_derived();
            self.remap_paged(old - count, self.n_cols, |row, col| {
                if row >= at && row < at + count {
                    None
                } else {
                    Some((if row >= at + count { row - count } else { row }, col))
                }
            });
            return Ok(());
        }

        self.rebuild_rows(
            old - count,
            &[
                RowRun {
                    from: 0,
                    to: 0,
                    len: at,
                },
                RowRun {
                    from: at + count,
                    to: at,
                    len: old - at - count,
                },
            ],
        )
    }

    /// Shift columns `[at, n_cols)` right by `count`, opening blank columns.
    /// On error nothing changes.
    pub(crate) fn insert_cols(&mut self, at: usize, count: usize) -> Result<(), String> {
        if count == 0 {
            return Ok(());
        }

        let at = at.min(self.n_cols);
        let old_cols = self.n_cols;
        let new_cols = old_cols
            .checked_add(count)
            .ok_or_else(|| format!("{old_cols} columns plus {count} columns overflow"))?;
        if self.is_paged() {
            self.invalidate_derived();
            self.remap_paged(self.row_count, new_cols, |row, col| {
                Some((row, if col >= at { col + count } else { col }))
            });
            return Ok(());
        }

        self.rebuild_cols(new_cols, |col| {
            if col < at {
                Some(col)
            } else {
                (col >= at + count).then(|| col - count)
            }
        })
    }

    /// Delete `count` columns starting at `at`, closing the gap. On error
    /// nothing changes.
    pub(crate) fn delete_cols(&mut self, at: usize, count: usize) -> Result<(), String> {
        if count == 0 || at >= self.n_cols {
            return Ok(());
        }

        let count = count.min(self.n_cols - at);
        let new_cols = self.n_cols - count;
        if self.is_paged() {
            self.invalidate_derived();
            self.remap_paged(self.row_count, new_cols, |row, col| {
                if col >= at && col < at + count {
                    None
                } else {
                    Some((row, if col >= at + count { col - count } else { col }))
                }
            });
            return Ok(());
        }

        self.rebuild_cols(new_cols, |col| {
            Some(if col < at { col } else { col + count })
        })
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        stats
            .owner_mut(DENSE_KINDS)
            .add_vec::<u8>(self.kind.len(), self.kind.capacity());
        stats
            .owner_mut(DENSE_PAYLOADS)
            .add_vec::<u64>(self.payload.len(), self.payload.capacity());
        stats
            .owner_mut(DENSE_STYLES)
            .add_vec::<u32>(self.style.len(), self.style.capacity());
        if let Some(paged) = &self.paged {
            paged.add_memory_stats(stats);
        }
        self.derived.add_memory_stats(stats.owner_mut(FORMULAS));
    }
}

/// Dense source slices spanning the whole grid. Literal reads never consult
/// calculated slots, so this view needs no chunk bounds or directory probes.
#[derive(Clone, Copy)]
pub(crate) struct DenseSourceRun<'a> {
    kinds: &'a [u8],
    payloads: &'a [u64],
}

impl DenseSourceRun<'_> {
    /// The literal source at `index`, or `None` for empty and formula cells.
    /// Only empty and formula sources carry the calculated bit, so a literal
    /// kind is recognised from the raw byte without masking it first.
    #[inline]
    pub(crate) fn literal(&self, index: usize) -> Option<(u8, u64)> {
        let kind = self.kinds[index];
        matches!(kind, KIND_NUMBER | KIND_STRING | KIND_BOOL).then(|| (kind, self.payloads[index]))
    }
}

/// One dense column, indexed by row. A calculated value lives in its cell's
/// own slot, so the resolved view needs no second lookup.
#[derive(Clone, Copy)]
pub(crate) struct DenseColumn<'a> {
    kinds: &'a [u8],
    payloads: &'a [u64],
    styles: &'a [u32],
}

impl DenseColumn<'_> {
    /// Resolved kind, payload and style of `row`.
    #[inline]
    pub(crate) fn cell(&self, row: usize) -> (u8, u64, u32) {
        let (kind, payload) = dense_resolved(self.kinds[row], self.payloads[row]);
        (kind, payload, self.styles[row])
    }

    /// Every row's source kind and literal payload, in order. A calculated slot
    /// reads as its formula or empty source, so scans can skip non-numeric
    /// literals before decoding a calculated value. Zipping the slices lets
    /// whole-column scans run without a bounds check per cell.
    #[inline]
    pub(crate) fn sources(&self) -> impl Iterator<Item = (u8, u64)> + '_ {
        self.kinds
            .iter()
            .zip(self.payloads)
            .map(|(&kind, &payload)| dense_source(kind, payload))
    }

    /// The raw kind byte of `row`: a literal kind, empty, or a formula/empty
    /// source carrying the calculated bit. Scans use it to classify literals
    /// without loading the payload.
    #[inline]
    pub(crate) fn raw_kind(&self, row: usize) -> u8 {
        self.kinds[row]
    }

    /// The raw kind bytes and payloads of the column, of equal length so a
    /// loop bounded by the kinds needs no bounds check on the payloads. A
    /// literal's raw kind is its kind; use [`source_kind`] for the others.
    #[inline]
    pub(crate) fn raw_slices(&self) -> (&[u8], &[u64]) {
        (self.kinds, &self.payloads[..self.kinds.len()])
    }

    /// Style ids of `rows`, as one slice so scans hoist the bounds check.
    #[inline]
    pub(crate) fn styles(&self, rows: std::ops::RangeInclusive<usize>) -> &[u32] {
        &self.styles[rows]
    }
}

/// The source kind of a raw dense kind byte: drops the calculated bit that
/// formula and empty sources carry, without loading the payload.
#[inline]
pub(crate) fn source_kind(raw: u8) -> u8 {
    raw & !CALCULATED
}

/// A borrowed column segment bounded by its source page or column.
/// Indices are absolute and valid only inside `start..end`. Creating a run
/// allocates nothing and probes the source page directory once; paged runs still
/// consult the sparse dirty and calculated maps per cell.
#[derive(Clone, Copy)]
pub(crate) struct CellRun<'a> {
    pub(crate) start: usize,
    pub(crate) end: usize,
    source_base: usize,
    kinds: &'a [u8],
    payloads: &'a [u64],
    styles: &'a [u32],
    /// Paged load bits; `None` with empty slices is an absent page.
    loaded: Option<&'a [u64]>,
    is_dense: bool,
    dirty: Option<&'a FxHashMap<(usize, usize), DirtyCell>>,
    row_count: usize,
    paged_calculated: Option<&'a DerivedOverlay>,
}

impl CellRun<'_> {
    #[inline]
    fn dirty_cell(&self, index: usize) -> Option<&DirtyCell> {
        self.dirty?
            .get(&(index % self.row_count, index / self.row_count))
    }

    #[inline]
    pub(crate) fn contains(&self, index: usize) -> bool {
        index >= self.start && index < self.end
    }

    /// Clean resident state, after the dirty overlay has been ruled out.
    #[inline]
    fn clean_loaded(&self, index: usize) -> bool {
        self.is_dense
            || self
                .loaded
                .is_some_and(|bits| CellChunk::bit(bits, index - self.source_base))
    }

    #[inline]
    pub(crate) fn is_loaded(&self, index: usize) -> bool {
        debug_assert!(self.contains(index));
        self.clean_loaded(index) || self.dirty_cell(index).is_some()
    }

    /// Reads a paged scalar, style and residency with one dirty-map probe.
    #[inline]
    fn paged_cell(&self, index: usize) -> Option<(u8, u64, u32)> {
        debug_assert!(!self.is_dense && self.contains(index));
        let (kind, payload, style) = match self.dirty_cell(index) {
            Some(cell) => (cell.kind, cell.payload, cell.style),
            None if self.clean_loaded(index) => {
                let offset = index - self.source_base;
                (
                    self.kinds[offset],
                    self.payloads[offset],
                    self.styles[offset],
                )
            }
            None => return None,
        };
        let (kind, payload) = self
            .paged_calculated
            .and_then(|overlay| overlay.get(index))
            .unwrap_or((kind, payload));
        Some((kind, payload, style))
    }

    /// Visits every cell of a paged run; `None` marks an unloaded cell. Dense
    /// render loops use [`CellStorage::dense_column`] instead.
    pub(crate) fn visit_paged(&self, mut visit: impl FnMut(usize, Option<(u8, u64, u32)>)) {
        debug_assert!(!self.is_dense);
        for index in self.start..self.end {
            visit(index, self.paged_cell(index));
        }
    }

    #[inline]
    pub(crate) fn source(&self, index: usize) -> (u8, u64) {
        debug_assert!(self.contains(index));
        if let Some(cell) = self.dirty_cell(index) {
            return (cell.kind, cell.payload);
        }
        if !self.clean_loaded(index) {
            return (KIND_EMPTY, 0);
        }
        let offset = index - self.source_base;
        if self.is_dense {
            dense_source(self.kinds[offset], self.payloads[offset])
        } else {
            (self.kinds[offset], self.payloads[offset])
        }
    }

    /// Literal sources win; a calculated slot exists only over empty or formula
    /// sources, so it needs no source discriminator check. Unloaded cells
    /// resolve as empty and callers must report loading before reading them.
    #[inline]
    pub(crate) fn resolved(&self, index: usize) -> (u8, u64) {
        debug_assert!(self.contains(index));
        if self.is_dense {
            return dense_resolved(self.kinds[index], self.payloads[index]);
        }
        let source = match self.dirty_cell(index) {
            Some(cell) => (cell.kind, cell.payload),
            None if self.clean_loaded(index) => {
                let offset = index - self.source_base;
                (self.kinds[offset], self.payloads[offset])
            }
            None => return (KIND_EMPTY, 0),
        };
        let calculated = match self.paged_calculated {
            Some(overlay) => overlay.get(index),
            None => None,
        };
        calculated.unwrap_or(source)
    }
}

impl CellStorage {
    #[inline]
    pub(crate) fn n_cols(&self) -> usize {
        self.n_cols
    }

    #[inline]
    pub(crate) fn row_count(&self) -> usize {
        self.row_count
    }

    pub(crate) fn remove_calculated(&mut self, index: usize) {
        if self.paged.is_none() {
            if self.kind[index] & CALCULATED != 0 {
                self.kind[index] &= !CALCULATED;
                self.payload[index] = 0;
                self.dense_calculated_cells -= 1;
            }
        } else if !self.derived.is_empty() {
            self.derived.remove(index);
        }
    }

    /// Writes a `rows x cols` block of dense sources at `start`, dropping any
    /// calculated value each cell held. Returns `false` without writing for
    /// paged storage, whose writes need per-cell residency and dirty overlays.
    ///
    /// Bulk ingest runs here once per column: one bounds check per column
    /// instead of per-cell sheet lookups, and the calculated-count update is
    /// skipped entirely while the sheet holds no calculated values.
    pub(crate) fn write_dense_block(
        &mut self,
        start: (usize, usize),
        dimensions: (usize, usize),
        cell: impl Fn(usize, usize) -> (u8, u64, u32),
    ) -> bool {
        if self.paged.is_some() {
            return false;
        }

        let (rows, cols) = dimensions;
        let has_calculated = self.dense_calculated_cells != 0;
        for col_offset in 0..cols {
            let base = self.idx(start.0, start.1 + col_offset);
            let kinds = &mut self.kind[base..base + rows];
            let payloads = &mut self.payload[base..base + rows];
            let styles = &mut self.style[base..base + rows];
            for row_offset in 0..rows {
                if has_calculated && kinds[row_offset] & CALCULATED != 0 {
                    self.dense_calculated_cells -= 1;
                }

                let (kind, payload, style) = cell(row_offset, col_offset);
                kinds[row_offset] = kind;
                payloads[row_offset] = payload;
                styles[row_offset] = style;
            }
        }
        true
    }

    pub(crate) fn compact_calculated(&mut self) {
        self.derived.compact();
    }

    /// The whole dense source grid; `None` for paged storage.
    pub(crate) fn dense_sources(&self) -> Option<DenseSourceRun<'_>> {
        self.paged.is_none().then_some(DenseSourceRun {
            kinds: &self.kind,
            payloads: &self.payload,
        })
    }

    /// One dense column's slices; `None` for paged storage or a missing column.
    /// Render loops index rows directly: a callback per cell measured ~25%
    /// slower on wasm32 than a plain loop over these slices.
    pub(crate) fn dense_column(&self, col: usize) -> Option<DenseColumn<'_>> {
        if self.paged.is_some() || col >= self.n_cols {
            return None;
        }

        let cells = col * self.row_count..(col + 1) * self.row_count;
        Some(DenseColumn {
            kinds: &self.kind[cells.clone()],
            payloads: &self.payload[cells.clone()],
            styles: &self.style[cells],
        })
    }

    /// Visits an explicit view-row list on paged storage, retaining a run until
    /// view order leaves its source page. Dense storage uses [`Self::dense_column`].
    pub(crate) fn visit_paged_rows(
        &self,
        rows: &[u32],
        col: usize,
        mut visit: impl FnMut(usize, usize, Option<(u8, u64, u32)>),
    ) {
        debug_assert!(self.paged.is_some());
        let base = col * self.row_count;
        let mut cached: Option<CellRun<'_>> = None;

        for (view_row, &row) in rows.iter().enumerate() {
            let row = row as usize;
            if row >= self.row_count {
                continue;
            }

            let index = base + row;
            let run = cached.get_or_insert_with(|| self.run(index, base + self.row_count));
            if !run.contains(index) {
                *run = self.run(index, base + self.row_count);
            }
            visit(view_row, row, run.paged_cell(index));
        }
    }

    /// The run containing `start`, ending no later than `end` or the column,
    /// source page boundary.
    pub(crate) fn run(&self, start: usize, end: usize) -> CellRun<'_> {
        debug_assert!(start < end && end <= self.row_count * self.n_cols);
        let row = start % self.row_count;
        let col = start / self.row_count;
        let end = end.min(start + self.row_count - row);

        if let Some(paged) = &self.paged {
            let (key, _) = paged.key_offset(row, col);
            let source_base = col * self.row_count + key.1 * paged.chunk_rows;
            let end = end.min(source_base + paged.chunk_rows);
            let chunk = paged.chunks.get(&key);
            paged.touch(key);

            CellRun {
                start,
                end,
                source_base,
                kinds: chunk.map_or(&[], |chunk| chunk.kind.as_slice()),
                payloads: chunk.map_or(&[], |chunk| chunk.payload.as_slice()),
                styles: chunk.map_or(&[], |chunk| chunk.style.as_slice()),
                loaded: chunk.map(|chunk| chunk.loaded.as_slice()),
                is_dense: false,
                dirty: (!paged.dirty.is_empty()).then_some(&paged.dirty),
                row_count: self.row_count,
                paged_calculated: (!self.derived.is_empty()).then_some(&self.derived),
            }
        } else {
            CellRun {
                start,
                end,
                source_base: 0,
                kinds: &self.kind,
                payloads: &self.payload,
                styles: &self.style,
                loaded: None,
                is_dense: true,
                dirty: None,
                row_count: self.row_count,
                paged_calculated: None,
            }
        }
    }
}

#[cfg(test)]
mod paged_storage_tests {
    use super::{PagedStorage, KIND_EMPTY};
    use crate::sheet::SheetData;

    #[test]
    fn revision_index_cleans_only_cells_still_owned_by_the_acknowledged_write() {
        let mut storage = PagedStorage::new(4, 0, 4).unwrap();
        assert!(storage.write(0, 0, KIND_EMPTY, 10, 0, Some(7)));
        assert!(storage.write(4, 0, KIND_EMPTY, 20, 0, Some(7)));
        assert!(storage.write(0, 0, KIND_EMPTY, 30, 0, Some(8)));

        storage.acknowledge_revision(7);
        assert_eq!(storage.read(4, 0), (KIND_EMPTY, 20, 0, true, false));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 30, 0, true, true));
        assert_eq!(storage.dirty_cells(), 1);

        storage.acknowledge_revision(8);
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 30, 0, true, false));
        assert_eq!(storage.dirty_cells(), 0);
    }

    #[test]
    fn structural_rebase_preserves_revision_ownership_at_the_moved_cell() {
        let mut sheet = SheetData::new_paged(2, 8, 4, 0, 4).unwrap();
        assert!(sheet.write_cell(1, 0, KIND_EMPTY, 10, 0, Some(11)));
        assert!(sheet.write_cell(3, 1, KIND_EMPTY, 20, 0, Some(12)));

        assert!(sheet.insert_rows(0, 0, 2).is_ok());
        assert!(sheet.insert_cols(0, 0, 1).is_ok());
        assert_eq!(
            sheet.cells.paged.as_ref().unwrap().read(3, 1),
            (KIND_EMPTY, 10, 0, true, true)
        );
        assert_eq!(
            sheet.cells.paged.as_ref().unwrap().read(5, 2),
            (KIND_EMPTY, 20, 0, true, true)
        );

        sheet.cells.acknowledge_revision(11);
        assert_eq!(
            sheet.cells.paged.as_ref().unwrap().read(3, 1),
            (KIND_EMPTY, 10, 0, true, false)
        );
        assert_eq!(
            sheet.cells.paged.as_ref().unwrap().read(5, 2),
            (KIND_EMPTY, 20, 0, true, true)
        );
        sheet.cells.acknowledge_revision(12);
        assert_eq!(sheet.cells.paged.as_ref().unwrap().dirty_cells(), 0);
    }

    #[test]
    fn dirty_overlay_precedes_hydration_survives_eviction_and_cleans_by_revision() {
        let chunk_bytes = PagedStorage::new(4, 0, 2).unwrap().chunk_bytes();
        let mut storage = PagedStorage::new(4, chunk_bytes, 2).unwrap();
        assert!(storage.hydrate(0, 0, KIND_EMPTY, 10, 1));
        assert!(storage.write(0, 0, KIND_EMPTY, 20, 2, Some(7)));
        assert!(!storage.hydrate(0, 0, KIND_EMPTY, 30, 3));
        assert!(storage.write(4, 0, KIND_EMPTY, 40, 4, None));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 20, 2, true, true));
        assert_eq!(storage.chunks.len(), 1);
        storage.acknowledge_revision(6);
        assert_eq!(storage.dirty_cells(), 1);
        storage.acknowledge_revision(7);
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 20, 2, true, false));
        assert_eq!(storage.dirty_cells(), 0);
    }

    #[test]
    fn dirty_overlay_limit_fails_closed_without_changing_existing_cells() {
        let mut storage = PagedStorage::new(4, 0, 2).unwrap();
        assert!(storage.write(0, 0, KIND_EMPTY, 1, 0, Some(1)));
        assert!(storage.write(4, 0, KIND_EMPTY, 2, 0, Some(1)));
        assert!(!storage.write(8, 0, KIND_EMPTY, 3, 0, Some(1)));
        assert_eq!(storage.dirty_cells(), 2);
        assert_eq!(storage.read(8, 0), (KIND_EMPTY, 0, 0, false, false));
        assert!(storage.write(0, 0, KIND_EMPTY, 4, 0, Some(2)));
        assert_eq!(storage.read(0, 0), (KIND_EMPTY, 4, 0, true, true));
    }
}

#[cfg(test)]
mod calculated_slot_tests {
    use super::*;
    use crate::transfer::{Reader, Writer};
    use crate::types::{KIND_BOOL, KIND_NUMBER, KIND_STRING};

    // Presence must distinguish a calculated zero/blank from an absent slot,
    // and every source projection must hide calculated text from persistence.
    #[test]
    fn source_views_hide_calculated_slots_across_transfer_and_replacement() {
        for paged in [false, true] {
            let mut cells = if paged {
                CellStorage::new_paged(1, 1536, 512, 0, 100).unwrap()
            } else {
                CellStorage::try_new(1, 1536).unwrap()
            };
            for index in [0, 512, 1535] {
                assert!(cells.hydrate_cell(index, 0, KIND_FORMULA, 0, 7));
            }
            // The last slot is a spill child with an empty source and a style.
            assert!(cells.hydrate_cell(1535, 0, KIND_EMPTY, 0, 9));
            let mut before = StoreMemoryStats::default();
            cells.add_memory_stats(&mut before);
            assert!(cells.reserve_derived(3));
            assert!(cells.set_derived(0, KIND_STRING, encode_str_id(3)));
            assert!(cells.set_derived(512, KIND_FORMULA, FormulaError::Ref.slot() as u64));
            assert!(cells.set_derived(1535, KIND_BOOL, encode_num(1.0)));
            if !paged {
                let mut after = StoreMemoryStats::default();
                cells.add_memory_stats(&mut after);
                assert_eq!(before.allocated_bytes(), after.allocated_bytes());
            }
            for (index, kind) in [(0, KIND_FORMULA), (512, KIND_FORMULA), (1535, KIND_EMPTY)] {
                assert_eq!(cells.source_kind_at(index), kind);
                assert_eq!(cells.source_payload_at(index), 0);
                let run = cells.run(index, index + 1);
                assert_eq!(run.source(index), (kind, 0));
                if let Some(sources) = cells.dense_sources() {
                    assert_eq!(sources.literal(index), None);
                }
            }
            let mut visited = Vec::new();
            cells.visit_string_ids(|id| visited.push(id));
            assert_eq!(visited, vec![3]);
            cells.remap_string_ids(&[0, 1, 2, 4]);
            let mut out = Writer::new(1);
            cells.write_transfer(&mut out);
            let mut input = Reader::new(&out.0, 1).unwrap();
            let mut restored = CellStorage::read_transfer(&mut input).unwrap();
            input.finish().unwrap();
            assert_eq!(
                restored.calculated_cell_at(0),
                Some((KIND_STRING, encode_str_id(4)))
            );
            assert_eq!(restored.calculated_error_at(512), Some(FormulaError::Ref));
            assert_eq!(
                restored.calculated_cell_at(1535),
                Some((KIND_BOOL, encode_num(1.0)))
            );
            assert_eq!(restored.run(0, 1).source(0), (KIND_FORMULA, 0));
            assert_eq!(restored.run(1535, 1536).source(1535), (KIND_EMPTY, 0));
            assert!(restored.write_style(0, 0, 12, None));
            assert_eq!(
                restored.calculated_cell_at(0),
                Some((KIND_STRING, encode_str_id(4)))
            );
            assert!(restored.write_cell(0, 0, KIND_NUMBER, encode_num(8.0), 0, None));
            assert_eq!(restored.calculated_cell_at(0), None);
            assert_eq!(restored.num_at(0), 8.0);
            restored.remove_calculated(1535);
            assert_eq!(restored.calculated_cell_at(1535), None);
            assert_eq!(restored.source_kind_at(1535), KIND_EMPTY);
            assert!(restored.set_derived(1535, KIND_NUMBER, encode_num(0.0)));
            assert_eq!(
                restored.calculated_cell_at(1535),
                Some((KIND_NUMBER, encode_num(0.0)))
            );
            restored.invalidate_derived();
            assert_eq!(restored.calculated_cell_at(512), None);
            assert_eq!(restored.calculated_cell_at(1535), None);
            assert_eq!(restored.source_payload_at(512), 0);
        }
    }
}

#[cfg(test)]
mod source_history_tests {
    use crate::store::CellStore;
    use crate::types::KIND_FORMULA;

    #[test]
    fn history_capture_does_not_persist_calculated_text_or_numbers() {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(1, 2);
        store.set_formula(sheet, 0, 0, "=\"computed text\"", 0);
        store.set_formula(sheet, 1, 0, "=42", 0);
        store.recompute(sheet);
        let snapshot = store.capture_range(sheet, 0, 0, 2, 1).unwrap();
        assert_eq!(snapshot.kinds(), vec![KIND_FORMULA, KIND_FORMULA]);
        assert_eq!(store.snapshot_numbers(&snapshot), vec![0.0, 0.0]);
        assert_eq!(store.snapshot_texts(&snapshot), vec!["", ""]);
        assert!(store.clear_range(sheet, 0, 0, 1, 0, true, false));
        assert!(store.restore_range(sheet, 0, 0, &snapshot));
        store.recompute(sheet);
        assert_eq!(
            store.get_cell(sheet, 0, 0).string().as_deref(),
            Some("computed text")
        );
        assert_eq!(store.get_cell(sheet, 1, 0).num(), 42.0);
    }
}
#[cfg(test)]
mod lifecycle_tests {
    const TEST_ROWS: usize = 1536;
    use crate::store::CellStore;

    #[test]
    fn shrinking_spill_clears_vacated_outputs() {
        let mut store = CellStore::new();
        let rows = TEST_ROWS;
        let sheet = store.add_sheet(2, rows);
        store.set_number(sheet, 0, 1, rows as f64, 0);
        store.set_formula(sheet, 0, 0, "=SEQUENCE(B1)", 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, rows - 1, 0).num(), rows as f64);

        store.set_number(sheet, 0, 1, 1.0, 0);
        store.recompute(sheet);
        assert_eq!(store.get_cell(sheet, 0, 0).num(), 1.0);
        assert_eq!(store.sheets[sheet].cells.calculated_cell_at(rows - 1), None);
    }

    #[test]
    fn string_pool_sweep_keeps_calculated_text_across_distant_rows() {
        let mut store = CellStore::new();
        let rows = TEST_ROWS;
        let sheet = store.add_sheet(2, rows);
        store.set_string(sheet, 0, 1, "discarded pool entry", 0);
        store.set_number(sheet, 0, 1, 0.0, 0);
        let positions = [0, TEST_ROWS / 3, rows - 1];
        for row in positions {
            store.set_formula(sheet, row, 0, "=\"retained\"&\" text\"", 0);
        }
        store.recompute(sheet);
        store.compact_string_storage();

        for row in positions {
            assert_eq!(
                store.get_cell(sheet, row, 0).string().as_deref(),
                Some("retained text")
            );
        }
    }
}
