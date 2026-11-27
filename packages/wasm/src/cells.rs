//! Physical source cells, calculated slots, paging and borrowed read runs.

use crate::derived::{decode_cell, encode_cell, ABSENT_TAG};
use crate::memory::{StoreMemoryStats, DENSE_KINDS, DENSE_PAYLOADS, DENSE_STYLES};
use crate::types::{
    CellKey, FormulaError, KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};

use paged::{all_bits, bit, DirtyView, PagedStorage};

mod paged;

mod transfer;

// One u64 per cell keeps the numeric bits and string-pool id in one cache
// stream. `kind` stays the discriminator; the payload holds canonical f64 bits
// for numbers and `STR_TAG | id` for string-pool ids.
// Numeric writes canonicalize NaN to `CANON_NAN`, so no number has the tag's
// high bits (a negative quiet NaN pattern).

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
// The CALCULATED bit of a dense kind byte marks a slot whose payload holds a
// calculated value (see `encode_cell`). It is independent of the source kind
// in the low bits: a calculated spill child keeps an empty source, and a
// formula cell keeps a formula source. The source payload of such a slot
// reads as zero.
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

/// How an unrevisioned column write treats a paged row that holds an
/// unacknowledged edit.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum DirtyRowWrite {
    /// A page load leaves the edit alone.
    Keep,
    /// Any other write replaces the edit's value in place, as one cell write does.
    Update,
}

pub(crate) const DEFAULT_MAX_PAGED_DIRTY_CELLS: usize = 1_000_000;

/// The largest chunk a paged sheet accepts: the rows of a whole sheet.
pub(crate) const MAX_PAGE_CHUNK_ROWS: usize = crate::calc::SHEET_ROWS as usize;

/// The engine's ceiling on dense cells across a workbook, mirrored by
/// `DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxDenseCells`. A host may set a lower
/// limit per store.
pub(crate) const MAX_DENSE_CELLS: usize = 5_000_000;

/// The engine's ceiling on the logical cells (rows times columns) that local
/// sheets hold across a workbook, mirrored by
/// `DEFAULT_SNAPSHOT_RESOURCE_LIMITS.maxLocalPagedCells`. A full local sheet
/// costs about as much as a dense one, 13 bytes a cell, so this bounds them at
/// about 260 MB. A host may set a lower limit per store.
pub(crate) const MAX_LOCAL_PAGED_CELLS: usize = 20_000_000;

/// Rows per page of a local sheet: a sheet that does not fit the store's
/// dense-cell limit, which is at most [`MAX_DENSE_CELLS`].
const LOCAL_PAGE_CHUNK_ROWS: usize = DEFAULT_PAGE_CHUNK_ROWS;

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
        .map_err(|_| "dense sheet allocation failed for cell kinds".to_owned())?;
    kind.resize(len, KIND_EMPTY);
    let mut payload = Vec::new();
    payload
        .try_reserve_exact(len)
        .map_err(|_| "dense sheet allocation failed for cell payloads".to_owned())?;
    payload.resize(len, 0);
    let mut style = Vec::new();
    style
        .try_reserve_exact(len)
        .map_err(|_| "dense sheet allocation failed for cell styles".to_owned())?;
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

/// One sheet's physical cells: column-major dense vectors or paged storage with
/// a revisioned dirty overlay. Dense calculated values use the payload slot with
/// the CALCULATED presence bit in kind; paged ones live in calculated pages.
/// Source projections mask both back out.
pub(crate) struct CellStorage {
    n_cols: usize,
    row_count: usize,
    /// `kind[col * row_count + row]`
    kind: Vec<u8>,
    /// NaN-boxed value payload; `0` when empty.
    payload: Vec<u64>,
    /// Host style-dictionary id; `0` means "no explicit style".
    style: Vec<u32>,
    /// Boxed so a dense sheet carries one pointer for it.
    paged: Option<Box<PagedStorage>>,
    /// Dense slots with the CALCULATED bit. At zero, `invalidate_derived`
    /// skips its scan, so a literal-only sheet invalidates in constant time.
    dense_calculated_cells: usize,
}

impl CellStorage {
    /// Visits every string id a payload holds. Paged storage visits whole
    /// clean pages, including rows that a dirty edit shadows, because
    /// [`Self::remap_string_ids`] rewrites every clean payload and needs each
    /// id in its table.
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
        if let Some(paged) = &self.paged {
            paged.visit_payloads(visit_payload);
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
        if let Some(paged) = &mut self.paged {
            paged.remap_payloads(remap_payload);
        }
    }

    /// A dense sheet, or an error when the grid passes [`MAX_DENSE_CELLS`].
    /// Whether a sheet goes dense or local is the store's choice, against its
    /// workbook-wide limits.
    pub(crate) fn try_new(n_cols: usize, row_count: usize) -> Result<Self, String> {
        let (kind, payload, style) = try_dense_buffers(n_cols, row_count)?;

        Ok(Self {
            n_cols,
            row_count,
            kind,
            payload,
            style,
            paged: None,
            dense_calculated_cells: 0,
        })
    }

    /// A sheet whose cells live in local pages: no datasource, every cell
    /// loaded. The store checks its workbook's local-cell limit first.
    pub(crate) fn try_new_local(n_cols: usize, row_count: usize) -> Result<Self, String> {
        Ok(Self {
            n_cols,
            row_count,
            kind: Vec::new(),
            payload: Vec::new(),
            style: Vec::new(),
            paged: Some(Box::new(PagedStorage::new_local(LOCAL_PAGE_CHUNK_ROWS)?)),
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
            paged: Some(Box::new(PagedStorage::new(
                chunk_rows,
                byte_budget,
                max_dirty_cells,
            )?)),
            dense_calculated_cells: 0,
        })
    }

    pub(crate) fn is_paged(&self) -> bool {
        self.paged.is_some()
    }

    /// Whether the sheet loads its cells from a datasource. A local sheet is
    /// paged but owns every cell, like a dense one.
    pub(crate) fn is_datasource_paged(&self) -> bool {
        self.paged.as_ref().is_some_and(|paged| !paged.local)
    }

    /// Whether the sheet keeps its cells in local pages, because it did not
    /// fit the store's dense-cell limit when it was added or grew.
    pub(crate) fn is_local_paged(&self) -> bool {
        self.paged.as_ref().is_some_and(|paged| paged.local)
    }

    /// Moves a dense sheet's cells into local pages, one column at a time:
    /// empty unstyled cells allocate nothing, and calculated values move to
    /// calculated blocks. On error the dense cells stay as they were.
    pub(crate) fn convert_to_local_paged(&mut self) -> Result<(), String> {
        if self.paged.is_some() {
            return Ok(());
        }

        let mut paged = PagedStorage::new_local(LOCAL_PAGE_CHUNK_ROWS)?;
        let rows = self.row_count;
        let mut live = Vec::new();
        for col in 0..self.n_cols {
            let base = col * rows;
            live.clear();
            live.extend(
                (0..rows).filter(|&row| {
                    self.kind[base + row] != KIND_EMPTY || self.style[base + row] != 0
                }),
            );
            let cell = |index: usize| {
                let row = live[index];
                let (kind, payload) = dense_source(self.kind[base + row], self.payload[base + row]);
                (row, kind, payload, self.style[base + row])
            };
            paged.write_column(col, live.len(), &cell, DirtyRowWrite::Update);
            for &row in &live {
                let raw = self.kind[base + row];
                if raw & CALCULATED == 0 {
                    continue;
                }
                let (kind, payload) = decode_cell(self.payload[base + row]);
                if !paged.set_calculated(row, col, kind, payload) {
                    return Err("local sheet allocation failed for calculated values".to_owned());
                }
            }
        }

        self.kind = Vec::new();
        self.payload = Vec::new();
        self.style = Vec::new();
        self.dense_calculated_cells = 0;
        self.paged = Some(Box::new(paged));
        Ok(())
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
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            let (source, _, _, loaded, _) = paged.read(row, col);
            if !loaded || source != KIND_EMPTY || !paged.has_calculated() {
                return source;
            }

            return paged
                .calculated_at(row, col)
                .map_or(source, |value| value.0);
        }

        // Literals and plain empties are decided by the kind byte alone, so
        // only calculated slots load (and bounds-check) their payload.
        let kind = self.kind[index];
        if kind & CALCULATED == 0 {
            return kind;
        }

        if kind & !CALCULATED == KIND_FORMULA {
            KIND_FORMULA
        } else {
            decode_cell(self.payload[index]).0
        }
    }

    /// A paged calculated value; `None` for dense storage.
    #[inline]
    fn paged_calculated(&self, index: usize) -> Option<(u8, u64)> {
        let paged = self.paged.as_ref()?;
        if !paged.has_calculated() {
            return None;
        }

        let (row, col) = self.coordinates(index);
        paged.calculated_at(row, col)
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

    /// A cell's source kind and payload with one paged lookup.
    #[inline]
    pub(crate) fn source_at(&self, index: usize) -> (u8, u64) {
        if let Some(paged) = &self.paged {
            let (row, col) = self.coordinates(index);
            let (kind, payload, _, _, _) = paged.read(row, col);
            (kind, payload)
        } else {
            dense_source(self.kind[index], self.payload[index])
        }
    }

    /// The source kind and payload with one paged lookup; `None` while unloaded.
    #[inline]
    pub(crate) fn loaded_source_at(&self, row: usize, col: usize) -> Option<(u8, u64)> {
        if let Some(paged) = &self.paged {
            let (kind, payload, _, loaded, _) = paged.read(row, col);
            loaded.then_some((kind, payload))
        } else {
            let index = self.idx(row, col);
            let kind = self.kind[index];
            Some((
                kind & !CALCULATED,
                dense_source(kind, self.payload[index]).1,
            ))
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
        let Some(paged) = &self.paged else {
            return dense_resolved(self.kind[index], self.payload[index]).1;
        };

        let (row, col) = self.coordinates(index);
        let (kind, payload, _, loaded, _) = paged.read(row, col);
        if !loaded || !paged.has_calculated() {
            return payload;
        }

        if kind == KIND_EMPTY || kind == KIND_FORMULA {
            paged.calculated_at(row, col).map_or(payload, |cell| cell.1)
        } else {
            payload
        }
    }

    #[inline]
    pub(crate) fn calculated_cell_at(&self, index: usize) -> Option<(u8, u64)> {
        if self.paged.is_none() {
            return (self.kind[index] & CALCULATED != 0).then(|| decode_cell(self.payload[index]));
        }

        self.paged_calculated(index)
    }

    #[inline]
    pub(crate) fn calculated_error_at(&self, index: usize) -> Option<FormulaError> {
        let (kind, payload) = self.calculated_cell_at(index)?;
        (kind == KIND_FORMULA)
            .then(|| FormulaError::from_slot(payload))
            .flatten()
    }

    pub(crate) fn set_derived(&mut self, index: usize, kind: u8, payload: u64) -> bool {
        let row_count = self.row_count;

        if let Some(paged) = &mut self.paged {
            return paged.set_calculated(index % row_count, index / row_count, kind, payload);
        }

        let source = self.kind[index] & !CALCULATED;
        debug_assert!(source == KIND_EMPTY || source == KIND_FORMULA);
        self.dense_calculated_cells += usize::from(self.kind[index] & CALCULATED == 0);
        self.kind[index] = source | CALCULATED;
        self.payload[index] = encode_cell(kind, payload);
        true
    }

    /// Allocates the calculated room the inclusive rectangle needs, so the
    /// results written into it cannot fail. Dense slots always have room.
    pub(crate) fn reserve_derived(&mut self, r0: usize, c0: usize, r1: usize, c1: usize) -> bool {
        self.paged
            .as_mut()
            .is_none_or(|paged| paged.reserve_calculated(r0, c0, r1, c1))
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
        if let Some(paged) = &mut self.paged {
            paged.clear_calculated();
        }
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

    /// Reserves room for the writes a range edit makes under `revision`: one
    /// for each cell from `start` to `end` that `writes` selects. Once it
    /// succeeds, none of those writes can fail, so the edit changes every
    /// selected cell or, when this fails, none.
    pub(crate) fn prepare_dirty_writes(
        &mut self,
        start: (usize, usize),
        end: (usize, usize),
        revision: u64,
        writes: impl Fn(&Self, usize, usize) -> bool,
    ) -> bool {
        let Some(paged) = self.paged.as_ref().filter(|paged| !paged.local) else {
            return true;
        };

        let (mut additional, mut written) = (0usize, 0usize);
        for col in start.1..=end.1 {
            for row in start.0..=end.0 {
                if writes(self, row, col) {
                    written += 1;
                    additional += usize::from(!paged.is_dirty(row, col));
                }
            }
        }

        self.paged
            .as_mut()
            .is_some_and(|paged| paged.reserve_dirty(additional, written, revision))
    }

    pub(crate) fn prepare_dirty_cells(&mut self, cells: &[(usize, usize)], revision: u64) -> bool {
        self.paged
            .as_mut()
            .is_none_or(|paged| paged.prepare_dirty_cells(cells, revision))
    }

    /// Replaces source storage and invalidates its calculated slot. A revisioned
    /// paged write must first reserve its overlay with `prepare_dirty_cells`
    /// or `prepare_dirty_writes`.
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

    /// Whether a paged cell holds an unacknowledged edit. A check, not a read:
    /// it records no page access.
    pub(crate) fn is_cell_dirty(&self, row: usize, col: usize) -> bool {
        self.paged
            .as_ref()
            .is_some_and(|paged| paged.is_dirty(row, col))
    }

    pub(crate) fn dirty_coordinates(&self) -> Vec<f64> {
        self.paged
            .as_ref()
            .map_or_else(Vec::new, |paged| paged.dirty_coordinates())
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
                paged.resident_chunks(),
                paged.loaded_cells(),
                paged.dirty_cells(),
                paged.byte_len(),
                paged.dirty_byte_len(),
            )
        })
    }

    pub(crate) fn is_fully_loaded(&self) -> bool {
        self.paged.as_ref().is_none_or(|paged| {
            paged.local
                || self
                    .row_count
                    .checked_mul(self.n_cols)
                    .is_some_and(|cells| paged.loaded_cells() >= cells)
        })
    }

    pub(crate) fn range_fully_loaded(&self, r0: usize, c0: usize, r1: usize, c1: usize) -> bool {
        self.paged
            .as_ref()
            .is_none_or(|paged| paged.range_loaded(r0, c0, r1, c1))
    }

    #[inline]
    pub(crate) fn num_at(&self, i: usize) -> f64 {
        payload_num(self.resolved_payload_at(i))
    }

    #[inline]
    pub(crate) fn str_id_at(&self, i: usize) -> u32 {
        payload_str_id(self.resolved_payload_at(i))
    }

    #[inline]
    pub(crate) fn contains_cell(&self, row: usize, col: usize) -> bool {
        row < self.row_count && col < self.n_cols
    }

    #[inline]
    pub(crate) fn idx(&self, row: usize, col: usize) -> usize {
        col * self.row_count + row
    }

    /// Shows the literal `kind` and `payload` in a dense cell for a trial
    /// read, leaving its formula, spill and dependents as they are, and
    /// returns what the slot held for [`Self::restore_dense_slot`]. A formula
    /// cell stays a formula whose stored result is the value, as formula
    /// reads expect; any other cell holds the value as its literal. `None`
    /// for paged storage or a cell outside the sheet, which stay unchanged.
    pub(crate) fn show_dense_trial(
        &mut self,
        row: usize,
        col: usize,
        kind: u8,
        payload: u64,
    ) -> Option<(u8, u64)> {
        if self.paged.is_some() || !self.contains_cell(row, col) {
            return None;
        }
        let index = self.idx(row, col);
        let slot_kind = self.kind.get_mut(index)?;
        let slot_payload = self.payload.get_mut(index)?;
        let saved = (*slot_kind, *slot_payload);
        if saved.0 & !CALCULATED == KIND_FORMULA {
            *slot_kind = KIND_FORMULA | CALCULATED;
            *slot_payload = encode_cell(kind, payload);
        } else {
            *slot_kind = kind;
            *slot_payload = payload;
        }
        Some(saved)
    }

    /// Puts back what [`Self::show_dense_trial`] returned.
    pub(crate) fn restore_dense_slot(&mut self, row: usize, col: usize, saved: (u8, u64)) {
        if self.paged.is_some() || !self.contains_cell(row, col) {
            return;
        }
        let index = self.idx(row, col);
        if let (Some(slot_kind), Some(slot_payload)) =
            (self.kind.get_mut(index), self.payload.get_mut(index))
        {
            (*slot_kind, *slot_payload) = saved;
        }
    }

    /// The logical cells this sheet counts toward the store's local-cell
    /// limit: all of them for a local sheet, none otherwise.
    pub(crate) fn local_paged_cells(&self) -> usize {
        if self.is_local_paged() {
            self.row_count.saturating_mul(self.n_cols)
        } else {
            0
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
            let Some(source_col) = old_col(new_col) else {
                continue;
            };
            let old = source_col * rows..(source_col + 1) * rows;
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

        let clamped_at = at.min(self.row_count);
        let old = self.row_count;
        let new_count = old
            .checked_add(count)
            .ok_or_else(|| format!("{old} rows plus {count} rows overflow the row count"))?;
        if self.is_paged() {
            self.invalidate_derived();
            if let Some(paged) = &mut self.paged {
                paged.move_rows(clamped_at, clamped_at + count, old);
            }
            self.row_count = new_count;
            return Ok(());
        }

        self.rebuild_rows(
            new_count,
            &[
                RowRun {
                    from: 0,
                    to: 0,
                    len: clamped_at,
                },
                RowRun {
                    from: clamped_at,
                    to: clamped_at + count,
                    len: old - clamped_at,
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

        let clamped_count = count.min(self.row_count - at);
        let old = self.row_count;
        if self.is_paged() {
            self.invalidate_derived();
            if let Some(paged) = &mut self.paged {
                paged.move_rows(at + clamped_count, at, old);
            }
            self.row_count = old - clamped_count;
            return Ok(());
        }

        self.rebuild_rows(
            old - clamped_count,
            &[
                RowRun {
                    from: 0,
                    to: 0,
                    len: at,
                },
                RowRun {
                    from: at + clamped_count,
                    to: at,
                    len: old - at - clamped_count,
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

        let clamped_at = at.min(self.n_cols);
        let old_cols = self.n_cols;
        let new_cols = old_cols
            .checked_add(count)
            .ok_or_else(|| format!("{old_cols} columns plus {count} columns overflow"))?;
        if self.is_paged() {
            self.invalidate_derived();
            if let Some(paged) = &mut self.paged {
                paged.insert_cols(clamped_at, count);
            }
            self.n_cols = new_cols;
            return Ok(());
        }

        self.rebuild_cols(new_cols, |col| {
            if col < clamped_at {
                Some(col)
            } else {
                (col >= clamped_at + count).then(|| col - count)
            }
        })
    }

    /// Delete `count` columns starting at `at`, closing the gap. On error
    /// nothing changes.
    pub(crate) fn delete_cols(&mut self, at: usize, count: usize) -> Result<(), String> {
        if count == 0 || at >= self.n_cols {
            return Ok(());
        }

        let clamped_count = count.min(self.n_cols - at);
        let new_cols = self.n_cols - clamped_count;
        if self.is_paged() {
            self.invalidate_derived();
            if let Some(paged) = &mut self.paged {
                paged.delete_cols(at, clamped_count);
            }
            self.n_cols = new_cols;
            return Ok(());
        }

        self.rebuild_cols(new_cols, |col| {
            Some(if col < at { col } else { col + clamped_count })
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
    }
}

/// Dense source slices spanning the whole grid. Literal reads never consult
/// calculated slots, so this view needs no chunk bounds or directory probes.
#[derive(Clone, Copy)]
pub(crate) struct DenseSourceRun<'a> {
    kinds: &'a [u8],
    payloads: &'a [u64],
}

impl<'a> DenseSourceRun<'a> {
    /// The raw kind bytes and payloads of the whole grid, of equal length. A
    /// literal's raw kind is its kind; a calculated slot carries the
    /// calculated bit, so a fold can classify a cell from its kind byte.
    #[inline]
    pub(crate) fn raw(&self) -> (&'a [u8], &'a [u64]) {
        (self.kinds, &self.payloads[..self.kinds.len()])
    }

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

impl<'a> DenseColumn<'a> {
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

    /// The raw kind bytes and payloads of the column, of equal length so a
    /// loop bounded by the kinds needs no bounds check on the payloads. A
    /// literal's raw kind is its kind; use [`source_kind`] for the others.
    #[inline]
    pub(crate) fn raw_slices(&self) -> (&'a [u8], &'a [u64]) {
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

/// A run's source kinds and payloads, one entry per cell.
pub(crate) type SourceSlices<'a> = (&'a [u8], &'a [u64]);

/// A borrowed column segment bounded by its source page or column, and for
/// paged storage also by its dirty and calculated blocks. Indices are absolute
/// and valid only inside `start..end`. Creating a run allocates nothing and
/// indexes each directory once; paged cells then read by row offset.
#[derive(Clone, Copy)]
pub(crate) struct CellRun<'a> {
    pub(crate) start: usize,
    pub(crate) end: usize,
    /// First cell index of the clean page, dirty block and calculated block.
    source_base: usize,
    dirty_base: usize,
    calculated_base: usize,
    kinds: &'a [u8],
    payloads: &'a [u64],
    styles: &'a [u32],
    /// Paged load bits; `None` with empty slices is a page without clean values.
    loaded: Option<&'a [u64]>,
    is_dense: bool,
    /// A local sheet's run: every cell is loaded, absent pages read empty.
    is_local: bool,
    dirty: Option<DirtyView<'a>>,
    /// The page's calculated values; empty when it has none.
    calculated: &'a [u64],
}

impl CellRun<'_> {
    #[inline]
    fn dirty_cell(&self, index: usize) -> Option<(u8, u64, u32)> {
        let cell = self.dirty?.get(index - self.dirty_base)?;
        Some((cell.kind, cell.payload, cell.style))
    }

    #[inline]
    fn calculated_cell(&self, index: usize) -> Option<(u8, u64)> {
        let value = *self.calculated.get(index - self.calculated_base)?;
        (value != ABSENT_TAG).then(|| decode_cell(value))
    }

    #[inline]
    pub(crate) fn contains(&self, index: usize) -> bool {
        index >= self.start && index < self.end
    }

    /// Clean resident state, after the dirty overlay has been ruled out.
    #[inline]
    fn clean_loaded(&self, index: usize) -> bool {
        self.is_dense
            || self.is_local
            || self
                .loaded
                .is_some_and(|bits| bit(bits, index - self.source_base))
    }

    #[inline]
    pub(crate) fn is_loaded(&self, index: usize) -> bool {
        debug_assert!(self.contains(index));
        self.clean_loaded(index) || self.dirty_cell(index).is_some()
    }

    /// A paged cell's source scalar and style, or `None` when unloaded.
    #[inline]
    fn paged_source(&self, index: usize) -> Option<(u8, u64, u32)> {
        debug_assert!(!self.is_dense && self.contains(index));
        if let Some(cell) = self.dirty_cell(index) {
            return Some(cell);
        }

        if !self.clean_loaded(index) {
            return None;
        }

        if self.kinds.is_empty() {
            return Some((KIND_EMPTY, 0, 0));
        }

        let offset = index - self.source_base;
        Some((
            self.kinds[offset],
            self.payloads[offset],
            self.styles[offset],
        ))
    }

    /// Reads a paged resolved scalar, style and residency.
    #[inline]
    fn paged_cell(&self, index: usize) -> Option<(u8, u64, u32)> {
        let (source_kind, source_payload, style) = self.paged_source(index)?;
        let (kind, payload) = self
            .calculated_cell(index)
            .unwrap_or((source_kind, source_payload));
        Some((kind, payload, style))
    }

    /// A paged run's clean kinds and payloads, when every cell is loaded and
    /// none holds an edit or a calculated value. A local sheet's run without
    /// a page is all empty cells: `Some` with empty slices.
    pub(crate) fn clean_sources(&self) -> Option<SourceSlices<'_>> {
        if self.is_dense {
            return None;
        }
        // A dirty or calculated block can cover rows outside this run, so
        // test each cell of the run, not only whether a block exists.
        let mut cells = self.start..self.end;
        if self.dirty.is_some() && cells.any(|index| self.dirty_cell(index).is_some()) {
            return None;
        }
        let mut cells = self.start..self.end;
        if !self.calculated.is_empty() && cells.any(|index| self.calculated_cell(index).is_some()) {
            return None;
        }
        if self.kinds.is_empty() {
            return self.is_local.then_some((&[], &[]));
        }
        let offset = self.start - self.source_base;
        let len = self.end - self.start;
        if !self.is_local && !self.loaded.is_some_and(|bits| all_bits(bits, offset, len)) {
            return None;
        }
        Some((
            &self.kinds[offset..offset + len],
            &self.payloads[offset..offset + len],
        ))
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
        if self.is_dense {
            return dense_source(self.kinds[index], self.payloads[index]);
        }

        self.paged_source(index)
            .map_or((KIND_EMPTY, 0), |(kind, payload, _)| (kind, payload))
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

        self.paged_cell(index)
            .map_or((KIND_EMPTY, 0), |(kind, payload, _)| (kind, payload))
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
        let row_count = self.row_count;

        if let Some(paged) = &mut self.paged {
            paged.remove_calculated(index % row_count, index / row_count);
        } else if self.kind[index] & CALCULATED != 0 {
            self.kind[index] &= !CALCULATED;
            self.payload[index] = 0;
            self.dense_calculated_cells -= 1;
        }
    }

    /// Writes a `rows x cols` block of literal sources at `start`, dropping any
    /// calculated value each cell held. A datasource-paged sheet takes it only
    /// without a `revision` (a page load); a local sheet, which keeps no dirty
    /// overlay, takes any write. Paged columns go through the paged column
    /// writer, and a row with an unacknowledged edit has the edit's value
    /// replaced, as one unrevisioned cell write does. Returns `false` without
    /// writing for a revisioned write to a datasource-paged sheet, which needs
    /// dirty slots per cell.
    ///
    /// Bulk ingest runs here once per column: one bounds check per column
    /// instead of per-cell sheet lookups, and the calculated-count update is
    /// skipped entirely while the sheet holds no calculated values.
    pub(crate) fn write_literal_block(
        &mut self,
        start: (usize, usize),
        dimensions: (usize, usize),
        revision: Option<u64>,
        cell: impl Fn(usize, usize) -> (u8, u64, u32),
    ) -> bool {
        let (rows, cols) = dimensions;
        if let Some(paged) = &mut self.paged {
            if revision.is_some() && !paged.local {
                return false;
            }
            for col_offset in 0..cols {
                let column_cell = |row_offset| {
                    let (kind, payload, style) = cell(row_offset, col_offset);
                    (start.0 + row_offset, kind, payload, style)
                };
                paged.write_column(
                    start.1 + col_offset,
                    rows,
                    &column_cell,
                    DirtyRowWrite::Update,
                );
            }
            return true;
        }

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

    /// Writes validated rows of one column, leaving unlisted cells alone.
    /// Like `write_literal_block`, replaces sources and discards calculated slots.
    /// `cell(entry)` gives `(row, kind, payload, style)` for each of
    /// `entries`. Paged rows are unrevisioned writes; `dirty` decides rows
    /// with an edit.
    ///
    /// The dense loop walks `entries` directly. Going through the paged
    /// writer's per-index callback adds about 14 instructions per cell.
    pub(crate) fn write_column_cells(
        &mut self,
        col: usize,
        entries: &[u32],
        cell: impl Fn(usize) -> (usize, u8, u64, u32),
        dirty: DirtyRowWrite,
    ) {
        debug_assert!(col < self.n_cols, "column writes need an in-bounds column");
        if let Some(paged) = &mut self.paged {
            paged.write_column(
                col,
                entries.len(),
                &|index| cell(entries[index] as usize),
                dirty,
            );
            return;
        }
        let column = col * self.row_count..(col + 1) * self.row_count;
        let kinds = &mut self.kind[column.clone()];
        let payloads = &mut self.payload[column.clone()];
        let styles = &mut self.style[column];
        let has_calculated = self.dense_calculated_cells != 0;
        for &entry in entries {
            let (row, kind, payload, style) = cell(entry as usize);
            if has_calculated && kinds[row] & CALCULATED != 0 {
                self.dense_calculated_cells -= 1;
            }
            kinds[row] = kind;
            payloads[row] = payload;
            styles[row] = style;
        }
    }

    /// Releases paged calculated pages that hold no result.
    pub(crate) fn compact_calculated(&mut self) {
        if let Some(paged) = &mut self.paged {
            paged.compact_calculated();
        }
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
            let sheet_row = row as usize;
            if sheet_row >= self.row_count {
                continue;
            }

            let index = base + sheet_row;
            let run = cached.get_or_insert_with(|| self.run(index, base + self.row_count));
            if !run.contains(index) {
                *run = self.run(index, base + self.row_count);
            }
            visit(view_row, sheet_row, run.paged_cell(index));
        }
    }

    /// The run from `start` to the first of `end`, the end of the column, or
    /// the end of a paged block. Reading a paged run counts as an access to
    /// its page.
    pub(crate) fn run(&self, start: usize, end: usize) -> CellRun<'_> {
        self.page_run(start, end, true)
    }

    /// Like [`Self::run`], but leaves the page's access order alone: a tile
    /// cursor records the access once per page with [`Self::touch_tile`].
    pub(crate) fn tile_run(&self, start: usize, end: usize) -> CellRun<'_> {
        self.page_run(start, end, false)
    }

    /// Records one access to each paged page holding `row` in `col_start..=col_end`.
    pub(crate) fn touch_tile(&self, row: usize, col_start: usize, col_end: usize) {
        let Some(paged) = &self.paged else {
            return;
        };

        let (page, _) = paged.split(row);
        for col in col_start..=col_end {
            paged.touch(paged.page_id(col, page));
        }
    }

    /// The first row of the next page after `row`; dense storage is one page.
    pub(crate) fn next_page_row(&self, row: usize) -> usize {
        self.paged.as_ref().map_or(usize::MAX, |paged| {
            let (page, _) = paged.split(row);
            (page + 1) * paged.chunk_rows
        })
    }

    fn page_run(&self, start: usize, end: usize, touch: bool) -> CellRun<'_> {
        debug_assert!(start < end && end <= self.row_count * self.n_cols);
        let row = start % self.row_count;
        let col = start / self.row_count;
        let run_end = end.min(start + self.row_count - row);

        let Some(paged) = &self.paged else {
            return CellRun {
                start,
                end: run_end,
                source_base: 0,
                dirty_base: 0,
                calculated_base: 0,
                kinds: &self.kind,
                payloads: &self.payload,
                styles: &self.style,
                loaded: None,
                is_dense: true,
                is_local: false,
                dirty: None,
                calculated: &[],
            };
        };

        let column_base = col * self.row_count;
        let view = paged.run_view(row, col, touch);
        CellRun {
            start,
            end: run_end.min(column_base + view.end_row),
            source_base: column_base + view.clean_first_row,
            dirty_base: column_base + view.dirty_first_row,
            calculated_base: column_base + view.calculated_first_row,
            kinds: view.clean.map_or(&[], |clean| clean.kind.as_slice()),
            payloads: view.clean.map_or(&[], |clean| clean.payload.as_slice()),
            styles: view.clean.map_or(&[], |clean| clean.style.as_slice()),
            loaded: view.clean.map(|clean| clean.loaded.as_slice()),
            is_dense: false,
            is_local: paged.local,
            dirty: view.dirty,
            calculated: view.calculated,
        }
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
            assert!(cells.reserve_derived(0, 0, 1535, 0));
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
mod lifecycle_tests {
    use crate::store::CellStore;

    #[test]
    fn string_pool_sweep_keeps_calculated_text_across_distant_rows() {
        let mut store = CellStore::new();
        let rows = 1536;
        let sheet = store.add_sheet(2, rows);
        store.set_string(sheet, 0, 1, "discarded pool entry", 0);
        store.set_number(sheet, 0, 1, 0.0, 0);
        let positions = [0, rows / 3, rows - 1];
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

#[cfg(test)]
mod local_paged_tests {
    use super::{CellStorage, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER};
    use crate::tests::support::xorshift as next;
    use crate::types::CellKey;

    fn assert_same(dense: &CellStorage, local: &CellStorage, context: &str) {
        assert_eq!(
            (dense.row_count(), dense.n_cols()),
            (local.row_count(), local.n_cols()),
            "{context}"
        );
        for col in 0..dense.n_cols() {
            for row in 0..dense.row_count() {
                let index = dense.idx(row, col);
                let at = |cells: &CellStorage| {
                    (
                        cells.is_loaded(row, col),
                        cells.kind_at(index),
                        cells.source_kind_at(index),
                        cells.source_payload_at(index),
                        cells.resolved_payload_at(index),
                        cells.style_at(index),
                        cells.calculated_cell_at(index),
                    )
                };
                assert_eq!(at(dense), at(local), "{context}: row {row}, col {col}");
            }
        }
        let sorted = |cells: &CellStorage| {
            let mut keys: Vec<CellKey> = cells.persisted_coordinates();
            keys.sort_unstable();
            keys
        };
        assert_eq!(sorted(dense), sorted(local), "{context}");
        assert!(local.is_fully_loaded(), "{context}");
        assert!(
            local.range_fully_loaded(0, 0, local.row_count() - 1, local.n_cols() - 1),
            "{context}"
        );
    }

    /// One random edit to apply to both sheets.
    #[derive(Clone, Copy)]
    enum Edit {
        Number(u64, u32),
        Style(u32),
        Calculated(u64),
        InsertRows(usize),
        DeleteRows(usize),
        InsertCol,
        DeleteCol,
        Clear,
    }

    /// One random cell write, style, calculated value or row or column edit,
    /// applied to both sheets.
    fn random_edit(seed: &mut u32, dense: &mut CellStorage, local: &mut CellStorage) {
        let (row_count, n_cols) = (dense.row_count(), dense.n_cols());
        let at = (next(seed, row_count), next(seed, n_cols));
        let revision = (next(seed, 2) == 0).then_some(7);
        let edit = match next(seed, 9) {
            0..=2 => Edit::Number(next(seed, 1000) as u64, next(seed, 3) as u32),
            3 => Edit::Style(next(seed, 3) as u32),
            4 => Edit::Calculated(next(seed, 1000) as u64),
            5 => Edit::InsertRows(1 + next(seed, 300)),
            6 if row_count > 1 => Edit::DeleteRows(1 + next(seed, row_count - 1)),
            7 => Edit::InsertCol,
            8 if n_cols > 1 => Edit::DeleteCol,
            _ => Edit::Clear,
        };
        for cells in [dense, local] {
            apply_edit(cells, at, revision, edit);
        }
    }

    fn apply_edit(
        cells: &mut CellStorage,
        (row, col): (usize, usize),
        revision: Option<u64>,
        edit: Edit,
    ) {
        match edit {
            Edit::Number(payload, style) => {
                let written = cells.write_cell(row, col, KIND_NUMBER, payload, style, revision);
                assert!(written, "number write");
            }
            Edit::Style(style) => {
                assert!(cells.write_style(row, col, style, revision), "style write")
            }
            Edit::Calculated(value) => {
                assert!(
                    cells.write_cell(row, col, KIND_FORMULA, 0, 0, None),
                    "formula write"
                );
                let index = cells.idx(row, col);
                assert!(
                    cells.set_derived(index, KIND_NUMBER, value),
                    "calculated value"
                );
            }
            Edit::InsertRows(count) => {
                cells.invalidate_derived();
                cells.insert_rows(row, count).unwrap();
            }
            Edit::DeleteRows(count) => {
                cells.invalidate_derived();
                cells.delete_rows(row, count).unwrap();
            }
            Edit::InsertCol => {
                cells.invalidate_derived();
                cells.insert_cols(col, 1).unwrap();
            }
            Edit::DeleteCol => {
                cells.invalidate_derived();
                cells.delete_cols(col, 1).unwrap();
            }
            Edit::Clear => assert!(
                cells.write_cell(row, col, KIND_EMPTY, 0, 0, revision),
                "clear"
            ),
        }
    }

    /// 400 random sheets: the same writes, styles, calculated values and row
    /// and column edits applied to a dense sheet and to a copy that converts
    /// to local pages part of the way through leave the same cells.
    #[test]
    fn local_sheets_hold_the_cells_of_the_dense_sheets_they_replace() {
        const SHEETS: u32 = 400;
        const STEPS: usize = 60;

        for sheet in 0..SHEETS {
            let mut seed = 0x51ed_270b ^ (sheet + 1).wrapping_mul(0x9e37_79b9);
            let cols = 1 + next(&mut seed, 4);
            let rows = 1 + next(&mut seed, 2 * 4096 + 10);
            let mut dense = CellStorage::try_new(cols, rows).unwrap();
            let mut local = CellStorage::try_new(cols, rows).unwrap();
            let convert_at = next(&mut seed, STEPS);

            for step in 0..STEPS {
                if step == convert_at {
                    local.convert_to_local_paged().unwrap();
                    assert!(local.is_local_paged() && !local.is_datasource_paged());
                    assert_same(&dense, &local, &format!("sheet {sheet} after conversion"));
                }
                random_edit(&mut seed, &mut dense, &mut local);
            }
            if convert_at < STEPS {
                assert_same(&dense, &local, &format!("sheet {sheet}"));
            }
            local.acknowledge_revision(7);
            assert_same(
                &dense,
                &local,
                &format!("sheet {sheet} after acknowledgement"),
            );
        }
    }
}
