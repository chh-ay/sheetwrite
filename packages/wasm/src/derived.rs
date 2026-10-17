//! Calculated payloads have their own lifetime, independent of source residency.
//! Dense chunks retain column-major indexing without allocating untouched chunks.
//! Paged sheets retain their sparse calculated-cell map.
//! Unlike source storage, calculated values need no separate kind buffer: reserved
//! NaN tags encode booleans, blanks and errors alongside the existing text tag.

use std::collections::HashMap;

use crate::memory::MemoryOwnerStats;
use crate::sheet::{encode_num, payload_num, STR_TAG_HI};
use crate::transfer::{Reader, TransferResult, Writer};
use crate::types::{FormulaError, KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING};

const ERROR_TAG_PREFIX: u64 = 0xFFFB;
const TEXT_TAG_PREFIX: u64 = STR_TAG_HI >> 16;
const BOOL_TAG_PREFIX: u64 = 0xFFFD;
const BLANK_TAG_PREFIX: u64 = 0xFFFE;
const ERROR_TAG: u64 = ERROR_TAG_PREFIX << 48;
const ERROR_SLOT_MASK: u64 = u16::MAX as u64;
const BOOL_TAG: u64 = BOOL_TAG_PREFIX << 48;
const BLANK_TAG: u64 = BLANK_TAG_PREFIX << 48;
const COMPACT_SLACK_CELLS: usize = 4096;
const ABSENT_TAG: u64 = 0xFFFA_0000_0000_0000;

// Power-of-two runs bound sparse payload slack to 4 KiB without division on reads.
pub(crate) const DERIVED_CHUNK_CELLS: usize = 512;

pub(crate) struct DerivedChunk {
    values: Box<[u64]>,

    // Counts live tags so removing the last value can immediately release the chunk.
    count: usize,
}

impl DerivedChunk {
    // Keep allocation and ABSENT fill out of the inlined per-cell write path.
    #[cold]
    #[inline(never)]
    fn new() -> Self {
        Self {
            values: vec![ABSENT_TAG; DERIVED_CHUNK_CELLS].into_boxed_slice(),
            count: 0,
        }
    }
}

pub(crate) enum DerivedOverlay {
    Dense {
        chunks: Vec<Option<DerivedChunk>>,

        // Source writes test emptiness often; they must not scan the directory.
        live_chunks: usize,
    },
    Paged(HashMap<usize, u64>),
}

#[inline]
fn encode_cell(kind: u8, payload: u64) -> u64 {
    match kind {
        KIND_NUMBER | KIND_STRING => payload,
        KIND_BOOL => BOOL_TAG | u64::from(payload_num(payload) != 0.0),
        KIND_EMPTY => BLANK_TAG,
        KIND_FORMULA => ERROR_TAG | payload,
        _ => unreachable!("unsupported calculated scalar kind: {kind}"),
    }
}

#[inline(always)]
fn decode_cell(payload: u64) -> (u8, u64) {
    match payload >> 48 {
        TEXT_TAG_PREFIX => (KIND_STRING, payload),
        BOOL_TAG_PREFIX => (KIND_BOOL, encode_num(f64::from(payload & 1 != 0))),
        BLANK_TAG_PREFIX => (KIND_EMPTY, 0),
        ERROR_TAG_PREFIX => (KIND_FORMULA, payload & ERROR_SLOT_MASK),
        _ => (KIND_NUMBER, payload),
    }
}

impl DerivedOverlay {
    pub(crate) fn dense() -> Self {
        Self::Dense {
            chunks: Vec::new(),
            live_chunks: 0,
        }
    }

    pub(crate) fn paged() -> Self {
        Self::Paged(HashMap::new())
    }

    #[inline]
    pub(crate) fn decode_present(value: u64) -> Option<(u8, u64)> {
        (value != ABSENT_TAG).then(|| decode_cell(value))
    }

    /// A missing dense chunk covers the whole run without per-cell directory reads.
    #[inline]
    pub(crate) fn chunk_at(&self, index: usize) -> Option<&[u64]> {
        match self {
            Self::Dense { chunks, .. } => chunks
                .get(index / DERIVED_CHUNK_CELLS)
                .and_then(Option::as_ref)
                .map(|chunk| chunk.values.as_ref()),
            Self::Paged(_) => None,
        }
    }

    #[inline]
    pub(crate) fn is_empty(&self) -> bool {
        match self {
            Self::Dense { live_chunks, .. } => *live_chunks == 0,
            Self::Paged(cells) => cells.is_empty(),
        }
    }

    #[inline(always)]
    pub(crate) fn get(&self, index: usize) -> Option<(u8, u64)> {
        match self {
            Self::Dense { chunks, .. } => chunks
                .get(index / DERIVED_CHUNK_CELLS)
                .and_then(Option::as_ref)
                .and_then(|chunk| Self::decode_present(chunk.values[index % DERIVED_CHUNK_CELLS])),
            Self::Paged(cells) => cells.get(&index).copied().map(decode_cell),
        }
    }

    #[inline]
    pub(crate) fn error_at(&self, index: usize) -> Option<FormulaError> {
        let (kind, payload) = self.get(index)?;
        (kind == KIND_FORMULA)
            .then(|| FormulaError::from_slot(payload))
            .flatten()
    }

    pub(crate) fn reserve(&mut self, additional: usize, dense_cells: usize) -> bool {
        match self {
            Self::Dense { chunks, .. } => {
                let count = dense_cells.div_ceil(DERIVED_CHUNK_CELLS);

                if chunks
                    .try_reserve_exact(count.saturating_sub(chunks.len()))
                    .is_err()
                {
                    return false;
                }

                chunks.resize_with(count, || None);
                true
            }
            Self::Paged(cells) => cells.try_reserve(additional).is_ok(),
        }
    }

    #[inline]
    pub(crate) fn set(&mut self, index: usize, kind: u8, payload: u64) {
        let encoded = encode_cell(kind, payload);

        match self {
            Self::Dense {
                chunks,
                live_chunks,
            } => {
                let chunk = chunks[index / DERIVED_CHUNK_CELLS].get_or_insert_with(|| {
                    *live_chunks += 1;

                    DerivedChunk::new()
                });

                let value = &mut chunk.values[index % DERIVED_CHUNK_CELLS];
                chunk.count += usize::from(*value == ABSENT_TAG);
                *value = encoded;
            }
            Self::Paged(cells) => {
                cells.insert(index, encoded);
            }
        }
    }

    #[inline]
    pub(crate) fn remove(&mut self, index: usize) {
        match self {
            Self::Dense {
                chunks,
                live_chunks,
            } => {
                if let Some(slot) = chunks.get_mut(index / DERIVED_CHUNK_CELLS) {
                    if let Some(chunk) = slot {
                        let value = &mut chunk.values[index % DERIVED_CHUNK_CELLS];
                        chunk.count -= usize::from(*value != ABSENT_TAG);
                        *value = ABSENT_TAG;

                        if chunk.count == 0 {
                            *slot = None;
                            *live_chunks -= 1;
                        }
                    }
                }
            }
            Self::Paged(cells) => {
                cells.remove(&index);
            }
        }
    }

    pub(crate) fn clear(&mut self) {
        *self = match self {
            Self::Dense { .. } => Self::dense(),
            Self::Paged(_) => Self::paged(),
        };
    }

    pub(crate) fn compact(&mut self) {
        if let Self::Dense {
            chunks,
            live_chunks,
        } = self
        {
            if *live_chunks == 0 && !chunks.is_empty() {
                *chunks = Vec::new();
            }
        }

        if let Self::Paged(cells) = self {
            if cells.capacity() > cells.len().saturating_mul(2)
                && cells.capacity().saturating_sub(cells.len()) > COMPACT_SLACK_CELLS
            {
                cells.shrink_to_fit();
            }
        }
    }

    pub(crate) fn visit_payloads(&self, mut visit: impl FnMut(u64)) {
        match self {
            Self::Dense { chunks, .. } => {
                for chunk in chunks.iter().flatten() {
                    for &value in &chunk.values {
                        if value != ABSENT_TAG {
                            visit(value);
                        }
                    }
                }
            }
            Self::Paged(cells) => {
                for &value in cells.values() {
                    visit(value);
                }
            }
        }
    }

    pub(crate) fn remap_payloads(&mut self, mut remap: impl FnMut(&mut u64)) {
        match self {
            Self::Dense { chunks, .. } => {
                for chunk in chunks.iter_mut().flatten() {
                    for value in &mut chunk.values {
                        if *value != ABSENT_TAG {
                            remap(value);
                        }
                    }
                }
            }
            Self::Paged(cells) => {
                for value in cells.values_mut() {
                    remap(value);
                }
            }
        }
    }

    pub(crate) fn write_transfer(&self, out: &mut Writer) {
        match self {
            Self::Dense {
                chunks,
                live_chunks,
            } => {
                out.bool(false);
                out.usize(*live_chunks);

                for (index, chunk) in chunks.iter().enumerate() {
                    if let Some(chunk) = chunk {
                        out.usize(index);
                        out.word_runs(&chunk.values, ABSENT_TAG);
                    }
                }
            }
            Self::Paged(cells) => {
                out.bool(true);
                out.usize(cells.len());

                for (&index, &value) in cells {
                    out.usize(index);
                    out.u64(value);
                }
            }
        }
    }

    pub(crate) fn read_transfer(
        input: &mut Reader<'_>,
        maximum: usize,
        is_paged: bool,
    ) -> TransferResult<Self> {
        if input.bool()? != is_paged {
            return Err("transferred overlay storage mismatch".into());
        }

        if is_paged {
            let count = input.count()?;
            let mut cells = HashMap::with_capacity(count);

            for _ in 0..count {
                let index = input.usize()?;
                let value = input.u64()?;

                if index >= maximum || value == ABSENT_TAG || cells.insert(index, value).is_some() {
                    return Err("invalid transferred calculated cell".into());
                }
            }

            Ok(Self::Paged(cells))
        } else {
            let count = input.count()?;
            let mut chunks = Vec::with_capacity(if count == 0 {
                0
            } else {
                maximum.div_ceil(DERIVED_CHUNK_CELLS)
            });

            for _ in 0..count {
                let index = input.usize()?;
                if index >= maximum.div_ceil(DERIVED_CHUNK_CELLS) {
                    return Err("invalid transferred calculated chunk index".into());
                }

                let values = input.word_runs(ABSENT_TAG, DERIVED_CHUNK_CELLS)?;
                let present = values.iter().filter(|&&value| value != ABSENT_TAG).count();
                if values.len() != DERIVED_CHUNK_CELLS
                    || present == 0
                    || values.iter().enumerate().any(|(offset, &value)| {
                        index * DERIVED_CHUNK_CELLS + offset >= maximum && value != ABSENT_TAG
                    })
                {
                    return Err("invalid transferred calculated chunk".into());
                }

                chunks.resize_with(chunks.len().max(index + 1), || None);
                if chunks[index].is_some() {
                    return Err("duplicate transferred calculated chunk".into());
                }

                chunks[index] = Some(DerivedChunk {
                    values: values.into_boxed_slice(),
                    count: present,
                });
            }

            if !chunks.is_empty() {
                chunks.resize_with(maximum.div_ceil(DERIVED_CHUNK_CELLS), || None);
            }

            Ok(Self::Dense {
                chunks,
                live_chunks: count,
            })
        }
    }

    pub(crate) fn add_memory_stats(&self, owner: &mut MemoryOwnerStats) {
        match self {
            Self::Dense { chunks, .. } => {
                owner.add_vec::<Option<DerivedChunk>>(chunks.len(), chunks.capacity());
                for chunk in chunks.iter().flatten() {
                    owner.add_vec::<u64>(chunk.count, chunk.values.len());
                }
            }
            Self::Paged(cells) => owner.add_hash_table::<usize, u64>(cells.len(), cells.capacity()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allocated(overlay: &DerivedOverlay) -> usize {
        let mut owner = MemoryOwnerStats::default();
        overlay.add_memory_stats(&mut owner);
        owner.allocated_bytes
    }

    #[test]
    fn dense_chunks_resolve_boundaries_and_release_empty_storage() {
        let mut overlay = DerivedOverlay::dense();
        let cells = DERIVED_CHUNK_CELLS * 5;
        assert!(overlay.reserve(4, cells));
        assert!(overlay.is_empty());
        let directory_bytes = allocated(&overlay);
        assert!(directory_bytes < DERIVED_CHUNK_CELLS);

        let positions = [
            0,
            DERIVED_CHUNK_CELLS,
            DERIVED_CHUNK_CELLS * 2 + 7,
            cells - 1,
        ];
        for (ordinal, index) in positions.into_iter().enumerate() {
            overlay.set(index, KIND_NUMBER, encode_num(ordinal as f64));
        }

        assert!(!overlay.is_empty());

        for (ordinal, index) in positions.into_iter().enumerate() {
            assert_eq!(
                overlay.get(index),
                Some((KIND_NUMBER, encode_num(ordinal as f64)))
            );
            if index + 1 < cells {
                assert_eq!(overlay.get(index + 1), None);
            }
        }

        for index in positions {
            overlay.remove(index);
        }

        assert_eq!(allocated(&overlay), directory_bytes);
        assert!(overlay.is_empty());
        overlay.compact();
        assert_eq!(allocated(&overlay), 0);

        assert!(overlay.reserve(1, cells));
        overlay.set(cells - 1, KIND_BOOL, encode_num(1.0));
        overlay.clear();
        assert_eq!(allocated(&overlay), 0);
        assert_eq!(overlay.get(cells - 1), None);
    }

    #[test]
    fn dense_transfer_preserves_absent_chunks_and_remaps_live_payloads() {
        let cells = DERIVED_CHUNK_CELLS * 5;
        let mut overlay = DerivedOverlay::dense();
        assert!(overlay.reserve(3, cells));
        overlay.set(0, KIND_STRING, crate::sheet::encode_str_id(3));
        overlay.set(cells - 1, KIND_STRING, crate::sheet::encode_str_id(9));
        overlay.set(
            DERIVED_CHUNK_CELLS,
            KIND_FORMULA,
            FormulaError::Ref.slot() as u64,
        );

        let mut visited = Vec::new();
        overlay.visit_payloads(|value| visited.push(value));
        assert_eq!(visited.len(), 3);
        overlay.remap_payloads(|value| {
            if *value >> 48 == TEXT_TAG_PREFIX {
                *value = crate::sheet::encode_str_id(crate::sheet::payload_str_id(*value) + 1);
            }
        });

        let mut output = Writer::new(1);
        overlay.write_transfer(&mut output);
        let mut input = Reader::new(&output.0, 1).unwrap();
        let mut restored = DerivedOverlay::read_transfer(&mut input, cells, false).unwrap();
        input.finish().unwrap();

        assert_eq!(
            restored.get(0),
            Some((KIND_STRING, crate::sheet::encode_str_id(4)))
        );
        assert_eq!(
            restored.get(cells - 1),
            Some((KIND_STRING, crate::sheet::encode_str_id(10)))
        );
        assert_eq!(
            restored.error_at(DERIVED_CHUNK_CELLS),
            Some(FormulaError::Ref)
        );
        assert_eq!(restored.get(DERIVED_CHUNK_CELLS * 3), None);
        assert_eq!(allocated(&restored), allocated(&overlay));
        restored.set(DERIVED_CHUNK_CELLS * 3, KIND_NUMBER, encode_num(42.0));
        assert_eq!(
            restored.get(DERIVED_CHUNK_CELLS * 3),
            Some((KIND_NUMBER, encode_num(42.0)))
        );
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::DERIVED_CHUNK_CELLS;
    use crate::memory::FORMULAS;
    use crate::store::CellStore;

    #[test]
    fn shrinking_spill_releases_calculated_chunks() {
        let mut store = CellStore::new();
        let rows = DERIVED_CHUNK_CELLS * 3;
        let sheet = store.add_sheet(2, rows);
        store.set_number(sheet, 0, 1, rows as f64, 0);
        store.set_formula(sheet, 0, 0, "=SEQUENCE(B1)", 0);
        store.recompute(sheet);
        let before = store.memory_stats()[3 + FORMULAS * 3 + 1];
        assert_eq!(store.get_cell(sheet, rows - 1, 0).num(), rows as f64);

        store.set_number(sheet, 0, 1, 1.0, 0);
        store.recompute(sheet);
        let after = store.memory_stats()[3 + FORMULAS * 3 + 1];
        assert!(before - after >= (2 * DERIVED_CHUNK_CELLS * size_of::<u64>()) as f64);
        assert_eq!(store.get_cell(sheet, 0, 0).num(), 1.0);
        assert_eq!(store.sheets[sheet].calculated_cell_at(rows - 1), None);
    }

    #[test]
    fn string_pool_sweep_keeps_calculated_text_across_chunks() {
        let mut store = CellStore::new();
        let rows = DERIVED_CHUNK_CELLS * 3;
        let sheet = store.add_sheet(2, rows);
        store.set_string(sheet, 0, 1, "discarded pool entry", 0);
        store.set_number(sheet, 0, 1, 0.0, 0);
        let positions = [0, DERIVED_CHUNK_CELLS, rows - 1];
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
