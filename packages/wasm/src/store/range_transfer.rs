use super::*;
use crate::transfer::Writer;
#[cfg(any(target_arch = "wasm32", test))]
use crate::transfer::{Reader, TransferInput, TransferResult};

const RANGE_TAG: u32 = 0x32484d53;

#[wasm_bindgen]
impl RangeSnapshot {
    /// Transfer packed scalars and the local dictionary, never JS cell patches.
    #[wasm_bindgen(js_name = exportMemoryState)]
    pub fn export_memory_state(&self, sheet: u32) -> Vec<u8> {
        let mut out = Writer::new(RANGE_TAG);

        out.usize(self.rows);
        out.usize(self.cols);
        out.bytes(&self.kind);
        out.words(&self.payload);
        out.ints(&self.style);
        out.strings(&self.strings);
        out.usize(self.formulas.len());

        for (row, col, entry) in &self.formulas {
            out.u32(*row);
            out.u32(*col);
            // Captured entries hold written text, so no names are needed.
            super::transfer::write_formula(&mut out, entry, sheet, &WrittenNames::NONE);
        }

        out.0
    }
}

/// Check each cell's source kind, and that each string payload names a
/// string of the range's own pool, before any cell reaches the store.
#[cfg(any(target_arch = "wasm32", test))]
fn check_range_cells(kind: &[u8], payload: &[u64], strings: usize) -> TransferResult<()> {
    let kinds_valid = kind.iter().all(|&cell_kind| cell_kind <= KIND_FORMULA);
    let strings_valid = payload.iter().all(|&cell_payload| {
        let id = payload_str_id(cell_payload);
        id == NO_STRING || (id as usize) < strings
    });
    if !kinds_valid || !strings_valid {
        return Err("invalid transferred history cells".into());
    }

    Ok(())
}

#[cfg(any(target_arch = "wasm32", test))]
impl CellStore {
    fn read_range_memory(
        &self,
        bytes: TransferInput<'_>,
        sheet: u32,
        row_start: u32,
        col_start: u32,
    ) -> TransferResult<RangeSnapshot> {
        let mut input = Reader::new(bytes, RANGE_TAG)?;
        let rows = input.usize()?;
        let cols = input.usize()?;
        let kind = input.bytes()?;
        let payload = input.words()?;
        let style = input.ints()?;

        // `capture_range` never writes an empty range, and restoring one would
        // take its last row or column as one before its first.
        if rows == 0
            || cols == 0
            || rows.checked_mul(cols) != Some(kind.len())
            || kind.len() != payload.len()
            || kind.len() != style.len()
        {
            return Err("invalid transferred history dimensions".into());
        }

        let strings = input.strings()?;
        check_range_cells(&kind, &payload, strings.len())?;
        let mut formulas = Vec::new();

        for _ in 0..input.count()? {
            let row = input.u32()?;
            let col = input.u32()?;
            if row as usize >= rows || col as usize >= cols {
                return Err("invalid transferred history formula cell".into());
            }

            let entry = self.read_transfer_formula(
                &mut input,
                sheet,
                row_start.checked_add(row).ok_or("history row overflow")?,
                col_start
                    .checked_add(col)
                    .ok_or("history column overflow")?,
            )?;

            formulas.push((row, col, entry));
        }

        input.finish()?;

        Ok(RangeSnapshot {
            rows,
            cols,
            kind,
            payload,
            style,
            strings,
            formulas,
        })
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Rebuilds a range snapshot from the bytes `exportMemoryState` wrote, for
    /// the range that starts at row `row_start`, column `col_start` of `sheet`.
    /// Throws when the bytes are not a valid range transfer.
    #[cfg(target_arch = "wasm32")]
    #[wasm_bindgen(js_name = importRangeMemoryState)]
    pub fn import_range_memory_state(
        &self,
        bytes: js_sys::Uint8Array,
        sheet: u32,
        row_start: u32,
        col_start: u32,
    ) -> RangeSnapshot {
        self.read_range_memory(bytes, sheet, row_start, col_start)
            .unwrap_or_else(|error| wasm_bindgen::throw_str(&error))
    }
}

/// Compact serializable projection of persisted derived-cell sources and spill
/// identity in one range. Offsets are row-major and sorted; reference targets
/// are packed `[sheet_handle, row, col]` triples.
#[wasm_bindgen]
pub struct SourceSnapshot {
    formula_offsets: Vec<u32>,
    formula_sources: Vec<String>,
    reference_offsets: Vec<u32>,
    reference_targets: Vec<u32>,
    spill_derived: Vec<u8>,
}

#[wasm_bindgen]
impl SourceSnapshot {
    /// Row-major offset, among the captured cells, of each cell with formula
    /// text, ascending; [`Self::formula_sources`] holds the matching text.
    #[wasm_bindgen(js_name = formulaOffsets)]
    pub fn formula_offsets(&self) -> Vec<u32> {
        self.formula_offsets.clone()
    }

    /// The formula text of each cell in [`Self::formula_offsets`], in order.
    #[wasm_bindgen(js_name = formulaSources)]
    pub fn formula_sources(&self) -> Vec<String> {
        self.formula_sources.clone()
    }

    /// Row-major offset of each cell that refers to one other cell by
    /// position instead of by formula text, ascending.
    #[wasm_bindgen(js_name = referenceOffsets)]
    pub fn reference_offsets(&self) -> Vec<u32> {
        self.reference_offsets.clone()
    }

    /// The cell each of [`Self::reference_offsets`] refers to, as packed
    /// `[sheet_handle, row, col]` triples in the same order.
    #[wasm_bindgen(js_name = referenceTargets)]
    pub fn reference_targets(&self) -> Vec<u32> {
        self.reference_targets.clone()
    }

    /// One byte per captured cell, row-major: 1 where another cell's spill
    /// fills it. Empty when no captured cell is spill-filled.
    #[wasm_bindgen(js_name = spillDerived)]
    pub fn spill_derived(&self) -> Vec<u8> {
        self.spill_derived.clone()
    }
}

/// Opaque, store-local history payload for one dense rectangular cell block.
///
/// The host may retain this object in undo history, but it is deliberately not
/// part of the serialized document protocol. A deduplicated local dictionary
/// owns captured text independently of the store's pool epoch. Formula text
/// is materialized at capture, so history needs no sheet-name registry.
#[wasm_bindgen]
pub struct RangeSnapshot {
    rows: usize,
    cols: usize,
    kind: Vec<u8>,
    pub(super) payload: Vec<u64>,
    style: Vec<u32>,
    formulas: Vec<(u32, u32, FormulaEntry)>,
    pub(super) strings: StringStorage,
}

#[wasm_bindgen]
impl RangeSnapshot {
    /// Packed `[row, col]` pairs, relative to the range's first cell, of the
    /// cells with formula text; [`Self::formula_sources`] holds the text.
    #[wasm_bindgen(js_name = formulaOffsets)]
    pub fn formula_offsets(&self) -> Vec<u32> {
        let mut offsets = Vec::new();

        for (row, col, entry) in &self.formulas {
            if entry.is_formula() {
                offsets.push(*row);
                offsets.push(*col);
            }
        }

        offsets
    }

    /// Packed `[row, col]` pairs, relative to the range's first cell, of the
    /// cells that refer to one other cell by position instead of by formula text.
    #[wasm_bindgen(js_name = referenceOffsets)]
    pub fn reference_offsets(&self) -> Vec<u32> {
        let mut offsets = Vec::new();

        for (row, col, entry) in &self.formulas {
            if entry.is_reference() {
                offsets.push(*row);
                offsets.push(*col);
            }
        }

        offsets
    }

    /// The cell each of [`Self::reference_offsets`] refers to, as packed
    /// `[sheet_handle, row, col]` triples in the same order.
    #[wasm_bindgen(js_name = referenceTargets)]
    pub fn reference_targets(&self) -> Vec<u32> {
        let mut targets = Vec::new();

        for (_, _, entry) in &self.formulas {
            if let Some(target) = entry.reference_target(0) {
                targets.push(target.sheet);
                targets.push(target.row);
                targets.push(target.col);
            }
        }

        targets
    }

    /// The kind of each cell's stored value (`KIND_*`), one byte per cell,
    /// column by column.
    #[wasm_bindgen(js_name = kinds)]
    pub fn kinds(&self) -> Vec<u8> {
        self.kind.clone()
    }

    /// The style id of each cell, column by column, as in [`Self::kinds`].
    #[wasm_bindgen(js_name = styleIds)]
    pub fn style_ids(&self) -> Vec<u32> {
        self.style.clone()
    }

    /// Bytes the snapshot holds: cell data, its text and formulas. History
    /// counts it against its memory budget.
    #[wasm_bindgen(js_name = byteLength)]
    pub fn byte_length(&self) -> usize {
        self.kind.len()
            + self.payload.len() * std::mem::size_of::<u64>()
            + self.style.len() * std::mem::size_of::<u32>()
            + self.strings.retained_bytes()
            + self.strings.index_memory_stats().logical_bytes
            + self
                .formulas
                .iter()
                .map(|(_, _, entry)| {
                    std::mem::size_of::<(u32, u32)>()
                        + if entry.is_formula() {
                            entry.captured_source().len()
                        } else {
                            std::mem::size_of::<AbsCellKey>()
                        }
                })
                .sum::<usize>()
    }

    /// The formula text of each cell in [`Self::formula_offsets`], in order.
    #[wasm_bindgen(js_name = formulaSources)]
    pub fn formula_sources(&self) -> Vec<String> {
        self.formulas
            .iter()
            .filter(|(_, _, entry)| entry.is_formula())
            .map(|(_, _, entry)| entry.captured_source().to_owned())
            .collect()
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Capture only persisted formula/reference sources in a rectangle. The
    /// returned opaque object is compact in source cardinality, not cell count.
    #[wasm_bindgen(js_name = captureSources)]
    pub fn capture_sources(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
    ) -> Option<SourceSnapshot> {
        let s = self.sheets.get(sheet)?;
        let cell_count = rows.checked_mul(cols)?;
        if rows == 0
            || cols == 0
            || cell_count > u32::MAX as usize
            || r0
                .checked_add(rows)
                .is_none_or(|end| end > s.cells.row_count())
            || c0
                .checked_add(cols)
                .is_none_or(|end| end > s.cells.n_cols())
        {
            return None;
        }

        let mut formulas = Vec::new();
        let mut references = Vec::new();
        for ((row, col), entry) in s.formulas.iter(&self.formula_slots) {
            let sheet_row = row as usize;
            let sheet_col = col as usize;
            if sheet_row < r0 || sheet_row >= r0 + rows || sheet_col < c0 || sheet_col >= c0 + cols
            {
                continue;
            }
            let offset = ((sheet_row - r0) * cols + sheet_col - c0) as u32;
            if entry.is_formula() {
                formulas.push((offset, entry.source(&self.written_names()).into_owned()));
            } else if let Some(target) = entry.reference_target(sheet as u32) {
                references.push((offset, target));
            }
        }
        sort_by_key96(&mut formulas, |(offset, _)| u128::from(*offset));
        sort_by_key96(&mut references, |(offset, _)| u128::from(*offset));

        let mut formula_offsets = Vec::with_capacity(formulas.len());
        let mut formula_sources = Vec::with_capacity(formulas.len());
        for (offset, source) in formulas {
            formula_offsets.push(offset);
            formula_sources.push(source);
        }
        let mut reference_offsets = Vec::with_capacity(references.len());
        let mut reference_targets = Vec::with_capacity(references.len() * 3);
        for (offset, target) in references {
            reference_offsets.push(offset);
            reference_targets.extend_from_slice(&[target.sheet, target.row, target.col]);
        }
        Some(SourceSnapshot {
            formula_offsets,
            formula_sources,
            reference_offsets,
            reference_targets,
            spill_derived: Vec::new(),
        })
    }

    /// Capture persisted formula/reference sources and derived-spill identity
    /// for arbitrary row/column coordinates in one boundary crossing. Offsets
    /// follow the caller's row-major coordinate order.
    #[wasm_bindgen(js_name = captureSourcesForRows)]
    pub fn capture_sources_for_rows(
        &self,
        sheet: usize,
        rows: &[u32],
        cols: &[u32],
    ) -> Option<SourceSnapshot> {
        let data = self.sheets.get(sheet)?;
        let cell_count = rows.len().checked_mul(cols.len())?;
        if rows.is_empty()
            || cols.is_empty()
            || cell_count > u32::MAX as usize
            || rows
                .iter()
                .any(|&row| row as usize >= data.cells.row_count())
            || cols.iter().any(|&col| col as usize >= data.cells.n_cols())
        {
            return None;
        }

        let mut formula_offsets = Vec::new();
        let mut formula_sources = Vec::new();
        let mut reference_offsets = Vec::new();
        let mut reference_targets = Vec::new();
        let mut spill_derived = Vec::new();
        for (row_index, &row) in rows.iter().enumerate() {
            for (col_index, &col) in cols.iter().enumerate() {
                let offset = row_index * cols.len() + col_index;
                let cell = (row, col);
                if data.spill.owner(cell).is_some_and(|anchor| anchor != cell) {
                    if spill_derived.is_empty() {
                        spill_derived.resize(cell_count, 0);
                    }
                    spill_derived[offset] = 1;
                }
                let Some(entry) = data.formulas.get(cell, &self.formula_slots) else {
                    continue;
                };
                if entry.is_formula() {
                    formula_offsets.push(offset as u32);
                    formula_sources.push(entry.source(&self.written_names()).into_owned());
                } else if let Some(target) = entry.reference_target(sheet as u32) {
                    reference_offsets.push(offset as u32);
                    reference_targets.extend_from_slice(&[target.sheet, target.row, target.col]);
                }
            }
        }
        if formula_offsets.is_empty() && reference_offsets.is_empty() && spill_derived.is_empty() {
            return None;
        }

        Some(SourceSnapshot {
            formula_offsets,
            formula_sources,
            reference_offsets,
            reference_targets,
            spill_derived,
        })
    }

    /// Capture only persisted references for one sheet. The explicit entry cap
    /// bounds allocation for host-side structural admission simulation.
    #[wasm_bindgen(js_name = captureReferences)]
    pub fn capture_references(&self, sheet: usize, max_entries: usize) -> Option<SourceSnapshot> {
        let data = self.sheets.get(sheet)?;
        let cell_count = data.cells.row_count().checked_mul(data.cells.n_cols())?;
        if cell_count > u32::MAX as usize {
            return None;
        }
        let mut references = Vec::new();
        for ((row, col), entry) in data.formulas.iter(&self.formula_slots) {
            let Some(target) = entry.reference_target(sheet as u32) else {
                continue;
            };
            if references.len() >= max_entries {
                return None;
            }
            let offset = (row as usize)
                .checked_mul(data.cells.n_cols())?
                .checked_add(col as usize)?;
            references.push((offset as u32, target));
        }
        sort_by_key96(&mut references, |(offset, _)| u128::from(*offset));
        let mut reference_offsets = Vec::with_capacity(references.len());
        let mut reference_targets = Vec::with_capacity(references.len().saturating_mul(3));
        for (offset, target) in references {
            reference_offsets.push(offset);
            reference_targets.extend_from_slice(&[target.sheet, target.row, target.col]);
        }
        Some(SourceSnapshot {
            formula_offsets: Vec::new(),
            formula_sources: Vec::new(),
            reference_offsets,
            reference_targets,
            spill_derived: Vec::new(),
        })
    }

    /// Sparse persisted-cell records. Each record starts with
    /// `[row, col, kind, number, style, string_id, source_kind, source_length]`.
    /// Formula UTF-8 is packed into little-endian u32 words; references append
    /// one `[sheet, row, col]` triple. The allocation scales with serialized
    /// cells and source bytes, never the logical sheet rectangle.
    #[wasm_bindgen(js_name = persistedCellData)]
    pub fn persisted_cell_data(&self, sheet: usize) -> Vec<f64> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let persisted = s.persisted_coordinates();
        let mut cells = Vec::with_capacity(persisted.len().saturating_mul(8));
        for &(row, col) in &persisted {
            let key = (row, col);
            let index = s.cells.idx(row as usize, col as usize);
            let kind = s.cells.source_kind_at(index);
            let source_payload = s.cells.source_payload_at(index);
            let source_string = payload_str_id(source_payload);
            let string_id = if source_string == NO_STRING {
                -1.0
            } else {
                f64::from(source_string)
            };
            let source = s.formulas.get(key, &self.formula_slots);
            let text = source
                .filter(|entry| entry.is_formula())
                .map(|entry| entry.source(&self.written_names()));
            let reference_target = source
                .filter(|entry| entry.is_reference())
                .and_then(|entry| entry.reference_target(sheet as u32));
            let source_kind = if text.is_some() {
                1
            } else if reference_target.is_some() {
                2
            } else {
                0
            };
            let source_length = if source_kind == 1 {
                text.as_ref().map_or(0, |formula_text| formula_text.len())
            } else if source_kind == 2 {
                3
            } else {
                0
            };
            cells.extend_from_slice(&[
                f64::from(row),
                f64::from(col),
                f64::from(kind),
                payload_num(source_payload),
                f64::from(s.cells.style_at(index)),
                string_id,
                f64::from(source_kind),
                source_length as f64,
            ]);
            if let Some(formula_text) = &text {
                for chunk in formula_text.as_bytes().chunks(4) {
                    let mut word = 0u32;
                    for (shift, byte) in chunk.iter().enumerate() {
                        word |= u32::from(*byte) << (shift * 8);
                    }
                    cells.push(f64::from(word));
                }
            } else if let Some(target) = reference_target {
                cells.extend_from_slice(&[
                    f64::from(target.sheet),
                    f64::from(target.row),
                    f64::from(target.col),
                ]);
            }
        }
        cells
    }

    /// Capture a dense rectangle into an opaque store-local history resource.
    #[wasm_bindgen(js_name = captureRange)]
    pub fn capture_range(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        rows: usize,
        cols: usize,
    ) -> Option<RangeSnapshot> {
        let s = self.sheets.get(sheet)?;
        if rows == 0
            || cols == 0
            || r0
                .checked_add(rows)
                .is_none_or(|end| end > s.cells.row_count())
            || c0
                .checked_add(cols)
                .is_none_or(|end| end > s.cells.n_cols())
        {
            return None;
        }
        let cell_count = rows.checked_mul(cols)?;
        let mut kind = Vec::with_capacity(cell_count);
        let mut payload = Vec::with_capacity(cell_count);
        let mut style = Vec::with_capacity(cell_count);
        let mut strings = StringStorage::new();
        for col_offset in 0..cols {
            let col = c0 + col_offset;
            for row_offset in 0..rows {
                let row = r0 + row_offset;
                let index = s.cells.idx(row, col);
                kind.push(s.cells.source_kind_at(index));
                let source_payload = s.cells.source_payload_at(index);
                let source_string = payload_str_id(source_payload);
                payload.push(if source_string == NO_STRING {
                    source_payload
                } else {
                    encode_str_id(strings.intern(self.strings.get(source_string)?))
                });
                style.push(s.cells.style_at(index));
            }
        }
        let formulas = s
            .formulas
            .iter(&self.formula_slots)
            .filter_map(|((row, col), entry)| {
                let sheet_row = row as usize;
                let sheet_col = col as usize;
                (sheet_row >= r0
                    && sheet_row < r0 + rows
                    && sheet_col >= c0
                    && sheet_col < c0 + cols)
                    .then(|| {
                        (
                            (sheet_row - r0) as u32,
                            (sheet_col - c0) as u32,
                            entry.captured(&self.written_names()),
                        )
                    })
            })
            .collect();
        Some(RangeSnapshot {
            rows,
            cols,
            kind,
            payload,
            style,
            formulas,
            strings,
        })
    }

    /// Restore a captured block at a destination of the same dimensions.
    #[wasm_bindgen(js_name = restoreRange)]
    pub fn restore_range(
        &mut self,
        sheet: usize,
        r0: usize,
        c0: usize,
        snapshot: &RangeSnapshot,
    ) -> bool {
        let Some(existing) = self.sheets.get(sheet) else {
            return false;
        };
        if r0
            .checked_add(snapshot.rows)
            .is_none_or(|end| end > existing.cells.row_count())
            || c0
                .checked_add(snapshot.cols)
                .is_none_or(|end| end > existing.cells.n_cols())
        {
            return false;
        }

        let mut sources =
            FxHashMap::with_capacity_and_hasher(snapshot.formulas.len(), FxBuildHasher);
        for (row, col, entry) in &snapshot.formulas {
            let Some(key) = cell_key(r0 + *row as usize, c0 + *col as usize) else {
                return false;
            };
            let source = if entry.is_formula() {
                self.parse_formula_entry(entry.captured_source(), sheet as u32, key.0, key.1)
            } else {
                let Some(target) = entry.reference_target(sheet as u32) else {
                    return false;
                };
                let target_sheet = target.sheet as usize;
                if self.sheet_alive.get(target_sheet) != Some(&true)
                    || !self.sheets[target_sheet]
                        .cells
                        .contains_cell(target.row as usize, target.col as usize)
                {
                    return false;
                }
                FormulaEntry::reference(target)
            };
            sources.insert(key, source);
        }

        let revision = self.local_dirty_revision();
        if let Some(dirty_revision) = revision {
            if !self.sheets[sheet].cells.prepare_dirty_rect(
                r0,
                c0,
                snapshot.rows,
                snapshot.cols,
                dirty_revision,
            ) {
                return false;
            }
        }

        let string_ids: Vec<u32> = (0..snapshot.strings.len())
            .map(|id| {
                self.strings
                    .intern(snapshot.strings.get(id as u32).expect("snapshot text ID"))
            })
            .collect();

        self.replace_range_sources(
            sheet,
            (r0, c0),
            (snapshot.rows, snapshot.cols),
            revision,
            sources,
            |row, col| {
                let offset = col * snapshot.rows + row;
                let payload = snapshot.payload[offset];
                let id = payload_str_id(payload);
                (
                    snapshot.kind[offset],
                    if id == NO_STRING {
                        payload
                    } else {
                        encode_str_id(string_ids[id as usize])
                    },
                    snapshot.style[offset],
                )
            },
        )
    }

    /// Packed writes and history restores share source replacement so a local
    /// native undo has the same result as its serialized replay on another peer.
    /// `cell(row_offset, col_offset)` gives each cell's kind, payload and
    /// style, so the reader that already chose formula or literal for a cell
    /// is not asked again. The literal-only loop is chosen once per range, so
    /// a numeric or text import does not test the source map for every cell.
    ///
    /// The rectangle is dirtied and its spills detached once, so readers
    /// outside it keep their calculated values and the per-cell writes skip
    /// both the spill scan and the dirty mark.
    pub(crate) fn replace_range_sources(
        &mut self,
        sheet: usize,
        start: (usize, usize),
        dimensions: (usize, usize),
        revision: Option<u64>,
        sources: FxHashMap<(u32, u32), FormulaEntry>,
        cell: impl Fn(usize, usize) -> (u8, u64, u32),
    ) -> bool {
        if let Some(rect) = DirtyRect::new(
            start.0,
            start.1,
            start.0 + dimensions.0 - 1,
            start.1 + dimensions.1 - 1,
        ) {
            prepare_rect_write(&mut self.sheets[sheet], rect);
        }

        if sources.is_empty() {
            self.write_range_sources::<false>(sheet, start, dimensions, revision, sources, cell)
        } else {
            self.write_range_sources::<true>(sheet, start, dimensions, revision, sources, cell)
        }
    }

    fn write_range_sources<const HAS_SOURCES: bool>(
        &mut self,
        sheet: usize,
        start: (usize, usize),
        dimensions: (usize, usize),
        revision: Option<u64>,
        mut sources: FxHashMap<(u32, u32), FormulaEntry>,
        cell: impl Fn(usize, usize) -> (u8, u64, u32),
    ) -> bool {
        // A literal-only block needs no per-cell source decision when the
        // storage takes it whole: write storage column by column, then retire
        // any formulas the block covered. A cell past `u32` coordinates has no
        // key and holds no formula, so skipping it retires nothing.
        if !HAS_SOURCES {
            let sheet_data = &mut self.sheets[sheet];
            if sheet_data
                .cells
                .write_literal_block(start, dimensions, revision, &cell)
            {
                if !sheet_data.formulas.is_empty() {
                    for col in start.1..start.1 + dimensions.1 {
                        for row in start.0..start.0 + dimensions.0 {
                            if let Some(key) = cell_key(row, col) {
                                self.graph.replace_entry(
                                    &mut sheet_data.formulas,
                                    &mut self.formula_slots,
                                    sheet,
                                    key,
                                    None,
                                );
                            }
                        }
                    }
                }
                return true;
            }
        }

        for col_offset in 0..dimensions.1 {
            let col = start.1 + col_offset;
            for row_offset in 0..dimensions.0 {
                let row = start.0 + row_offset;
                let Some(key) = cell_key(row, col) else {
                    return false;
                };
                let source = if HAS_SOURCES && !sources.is_empty() {
                    sources.remove(&key)
                } else {
                    None
                };
                let (kind, payload, style) = cell(row_offset, col_offset);
                if !self.replace_prepared_cell_source(CellSourceWrite {
                    sheet,
                    row,
                    col,
                    kind,
                    payload,
                    style,
                    source,
                    revision,
                    hydrating: false,
                }) {
                    return false;
                }
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A one-cell range transfer with no formulas.
    fn one_cell_range(kind: u8, payload: u64) -> Vec<u8> {
        let mut out = Writer::new(RANGE_TAG);
        out.usize(1);
        out.usize(1);
        out.bytes(&[kind]);
        out.words(&[payload]);
        out.ints(&[0]);
        out.strings(&StringStorage::new());
        out.usize(0);
        out.0
    }

    #[test]
    fn range_transfer_rejects_string_ids_outside_its_pool_and_unknown_kinds() {
        let mut store = CellStore::new();
        store.add_sheet(1, 1);

        let empty = one_cell_range(KIND_EMPTY, 0);
        assert!(store.read_range_memory(&empty, 0, 0, 0).is_ok());

        let missing_string = one_cell_range(KIND_STRING, encode_str_id(5));
        assert!(store.read_range_memory(&missing_string, 0, 0, 0).is_err());

        let unknown_kind = one_cell_range(KIND_FORMULA + 1, 0);
        assert!(store.read_range_memory(&unknown_kind, 0, 0, 0).is_err());
    }

    #[test]
    fn range_transfer_rejects_formulas_outside_the_range() {
        let mut store = CellStore::new();
        store.add_sheet(2, 2);
        store.set_formula(0, 0, 0, "=1+1", 0);
        let snapshot = store.capture_range(0, 0, 0, 1, 1).expect("captured range");
        let mut bytes = snapshot.export_memory_state(0);
        assert!(store.read_range_memory(&bytes, 0, 0, 0).is_ok());

        // The formula's row follows the cells, the strings and the formula count.
        let mut prefix = Writer::new(RANGE_TAG);
        prefix.usize(snapshot.rows);
        prefix.usize(snapshot.cols);
        prefix.bytes(&snapshot.kind);
        prefix.words(&snapshot.payload);
        prefix.ints(&snapshot.style);
        prefix.strings(&snapshot.strings);
        prefix.usize(snapshot.formulas.len());
        let row = prefix.0.len();
        bytes[row..row + 4].copy_from_slice(&1u32.to_le_bytes());

        assert!(store.read_range_memory(&bytes, 0, 0, 0).is_err());
    }

    /// A range of no cells has nothing to restore, and restoring one would
    /// compute its last row or column as one before its first.
    #[test]
    fn range_transfer_rejects_a_range_without_rows_or_columns() {
        let mut store = CellStore::new();
        store.add_sheet(2, 2);

        for (rows, cols) in [(0, 2), (2, 0), (0, 0)] {
            let mut out = Writer::new(RANGE_TAG);
            out.usize(rows);
            out.usize(cols);
            out.bytes(&[]);
            out.words(&[]);
            out.ints(&[]);
            out.strings(&StringStorage::new());
            out.usize(0);
            assert!(
                store.read_range_memory(&out.0, 0, 0, 0).is_err(),
                "{rows} by {cols}"
            );
        }
    }
}
