//! Block writes: sparse mixed blocks and packed row- or column-major blocks,
//! checked before any cell changes.

use super::*;

pub(crate) const BLOCK_OK: u32 = 0;
pub(crate) const BLOCK_INVALID: u32 = 1;
const BLOCK_SOURCE_INVALID: u32 = 2;
pub(crate) const BLOCK_RESOURCE_LIMIT: u32 = 3;

/// Entry indexes of a sparse block grouped by block column: column `c` owns
/// `entries[starts[c]..starts[c + 1]]`, in caller entry order.
struct SparseColumns {
    starts: Vec<u32>,
    entries: Vec<u32>,
}

/// Validated literal entries of a sparse block, in caller entry order.
struct SparseLiteralBlock<'a> {
    start: (usize, usize),
    dimensions: (usize, usize),
    offsets: &'a [u32],
    kinds: &'a [u8],
    numbers: &'a [f64],
    styles: &'a [u32],
    string_ids: Vec<u32>,
}

impl SparseLiteralBlock<'_> {
    /// Counting-sort entry indexes by column while rejecting invalid or
    /// repeated offsets. Repeats are found with an offset bitset when it has
    /// no more words than there are entries, else by sorting each column's
    /// offsets, so a sparse paged block never allocates by its cell count.
    fn column_entries(&self) -> Option<SparseColumns> {
        let (rows, cols) = self.dimensions;
        let cells = rows * cols;
        let words = cells.div_ceil(u64::BITS as usize);
        let bitset = words <= self.offsets.len();
        let mut starts = vec![0u32; cols + 1];
        // Two loops, so the bitset loop indexes a bitset of known length. A
        // shared loop needs a `get_mut` per offset, which adds about three
        // instructions per cell to a dense load.
        if bitset {
            let mut seen = vec![0u64; words];
            for &offset in self.offsets {
                let offset_index = offset as usize;
                if offset_index >= cells {
                    return None;
                }
                let word = &mut seen[offset_index / u64::BITS as usize];
                let bit = 1u64 << (offset_index % u64::BITS as usize);
                if *word & bit != 0 {
                    return None;
                }
                *word |= bit;
                starts[offset_index % cols + 1] += 1;
            }
        } else {
            for &offset in self.offsets {
                let offset_index = offset as usize;
                if offset_index >= cells {
                    return None;
                }
                starts[offset_index % cols + 1] += 1;
            }
        }
        for col in 0..cols {
            starts[col + 1] += starts[col];
        }
        let mut entries = vec![0u32; self.offsets.len()];
        for (index, &offset) in self.offsets.iter().enumerate() {
            let col = offset as usize % cols;
            entries[starts[col] as usize] = index as u32;
            starts[col] += 1;
        }
        starts.rotate_right(1);
        starts[0] = 0;
        let columns = SparseColumns { starts, entries };
        (bitset || self.columns_have_distinct_offsets(&columns)).then_some(columns)
    }

    /// Whether no column lists an offset twice, by sorting each column's offsets.
    fn columns_have_distinct_offsets(&self, columns: &SparseColumns) -> bool {
        let mut column_offsets = Vec::new();
        columns.starts.windows(2).all(|bounds| {
            column_offsets.clear();
            column_offsets.extend(
                columns.entries[bounds[0] as usize..bounds[1] as usize]
                    .iter()
                    .map(|&index| self.offsets[index as usize]),
            );
            column_offsets.sort_unstable();
            column_offsets.windows(2).all(|pair| pair[0] != pair[1])
        })
    }

    fn cell(&self, index: usize) -> (usize, u8, u64, u32) {
        let (kind, payload) = match self.kinds[index] {
            KIND_NUMBER | KIND_BOOL => (self.kinds[index], encode_num(self.numbers[index])),
            KIND_STRING => (KIND_STRING, encode_str_id(self.string_ids[index])),
            _ => (KIND_EMPTY, 0),
        };
        (
            self.start.0 + self.offsets[index] as usize / self.dimensions.1,
            kind,
            payload,
            self.styles[index],
        )
    }
}

/// Cell order of the flat input arrays of a packed block write.
///
/// The store itself is column-major; the two orders exist because a document
/// block arrives row-major while a columnar import arrives column-major straight
/// from its source columns.
#[derive(Clone, Copy, PartialEq, Eq)]
enum BlockInputOrder {
    /// Cell `(row, col)` sits at `row * cols + col`.
    RowMajor,
    /// Cell `(row, col)` sits at `col * rows + row`.
    ColumnMajor,
}

/// Flat input arrays of one packed block write, as documented on
/// [`CellStore::set_block_packed`].
struct PackedBlock<'a> {
    order: BlockInputOrder,
    sheet: usize,
    start_row: usize,
    start_col: usize,
    rows: usize,
    cols: usize,
    kinds: &'a [u8],
    numbers: &'a [f64],
    text_buf: &'a [u8],
    text_offsets: &'a [u32],
    styles: &'a [u32],
    formula_offsets: &'a [u32],
    formula_sources: &'a [String],
    reference_offsets: &'a [u32],
    reference_targets: &'a [u32],
}

impl BlockInputOrder {
    #[inline]
    fn index(self, row_offset: usize, col_offset: usize, rows: usize, cols: usize) -> usize {
        match self {
            Self::RowMajor => row_offset * cols + col_offset,
            Self::ColumnMajor => col_offset * rows + row_offset,
        }
    }

    #[inline]
    fn coordinates(self, offset: usize, rows: usize, cols: usize) -> (usize, usize) {
        match self {
            Self::RowMajor => (offset / cols, offset % cols),
            Self::ColumnMajor => (offset % rows, offset / rows),
        }
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Write one sparse mixed transaction/page/snapshot block without
    /// allocating by logical rectangle size on paged sheets. A literal-only
    /// block finds repeated offsets with a compact bitset when the bitset is
    /// no larger than the entry list. Inside `beginPageLoad`, dirty paged
    /// cells are skipped; otherwise the whole sparse write is preflighted.
    /// The status codes are those of [`Self::set_block_packed`].
    ///
    /// Text arrives packed, as in [`Self::set_block_packed`]: `text_buf` holds
    /// the UTF-8 bytes of every `KIND_STRING` entry in entry order, and the
    /// n-th string entry owns `text_offsets[n]..text_offsets[n + 1]`. A block
    /// without strings passes an empty buffer and `&[0]`.
    #[wasm_bindgen(js_name = setSparseBlock)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn set_sparse_block(
        &mut self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        rows: usize,
        cols: usize,
        offsets: &[u32],
        kinds: &[u8],
        numbers: &[f64],
        text_buf: &[u8],
        text_offsets: &[u32],
        styles: &[u32],
        formula_offsets: &[u32],
        formula_sources: Vec<String>,
        reference_offsets: &[u32],
        reference_targets: &[u32],
    ) -> u32 {
        let hydrating = self.loading_page > 0;
        let dirty_revision = if hydrating {
            None
        } else {
            self.local_dirty_revision()
        };

        let Some(cell_count) = rows.checked_mul(cols) else {
            return BLOCK_INVALID;
        };

        let Some(existing) = self.sheets.get(sheet) else {
            return BLOCK_INVALID;
        };

        if rows == 0
            || cols == 0
            || cell_count > u32::MAX as usize
            || offsets.len() != kinds.len()
            || offsets.len() != numbers.len()
            || offsets.len() != styles.len()
            || text_offsets.first() != Some(&0)
            || text_offsets.last() != Some(&(text_buf.len() as u32))
            || text_offsets.windows(2).any(|bounds| bounds[0] > bounds[1])
            || formula_offsets.len() != formula_sources.len()
            || reference_targets.len() != reference_offsets.len().saturating_mul(3)
            || start_row
                .checked_add(rows)
                .is_none_or(|end| end > existing.cells.row_count())
            || start_row > u32::MAX as usize
            || rows - 1 > u32::MAX as usize - start_row
            || start_col
                .checked_add(cols)
                .is_none_or(|end| end > existing.cells.n_cols())
            || start_col > u32::MAX as usize
            || cols - 1 > u32::MAX as usize - start_col
        {
            return BLOCK_INVALID;
        }

        let Ok(text) = std::str::from_utf8(text_buf) else {
            return BLOCK_SOURCE_INVALID;
        };
        let string_entries = kinds
            .iter()
            .fold(0, |count, &kind| count + usize::from(kind == KIND_STRING));
        if text_offsets.len() != string_entries + 1
            || text_offsets
                .iter()
                .any(|&bound| !text.is_char_boundary(bound as usize))
        {
            return BLOCK_SOURCE_INVALID;
        }

        // Literal-only blocks take the column-by-column path. Formulas and
        // references need per-cell sources, spills need per-cell detachment,
        // and an edit of a datasource-paged sheet needs the dirty-overlay
        // preflight. A page load needs no preflight: it leaves edited cells
        // alone.
        if !offsets.is_empty()
            && formula_offsets.is_empty()
            && reference_offsets.is_empty()
            && (hydrating || !existing.cells.is_datasource_paged())
            && existing.spill.is_empty()
        {
            let mut block = SparseLiteralBlock {
                start: (start_row, start_col),
                dimensions: (rows, cols),
                offsets,
                kinds,
                numbers,
                styles,
                string_ids: Vec::new(),
            };
            let Some(columns) = block.column_entries() else {
                return BLOCK_INVALID;
            };
            if string_entries != 0 {
                block.string_ids = vec![NO_STRING; offsets.len()];
                let mut bounds = text_offsets.windows(2);
                for (index, &kind) in kinds.iter().enumerate() {
                    if kind == KIND_STRING {
                        let Some(&[start, end]) = bounds.next() else {
                            return BLOCK_SOURCE_INVALID;
                        };
                        block.string_ids[index] = self.intern(&text[start as usize..end as usize]);
                    }
                }
            }
            self.write_sparse_columns(sheet, &block, &columns, hydrating);
            return BLOCK_OK;
        }

        let mut destination_cells = Vec::with_capacity(offsets.len());
        let mut entry_offsets = FxHashSet::with_capacity_and_hasher(offsets.len(), FxBuildHasher);

        for &offset in offsets {
            if offset as usize >= cell_count || !entry_offsets.insert(offset) {
                return BLOCK_INVALID;
            }

            let cell_offset = offset as usize;
            destination_cells.push((
                start_row + cell_offset / cols,
                start_col + cell_offset % cols,
            ));
        }

        let mut source_offsets = FxHashSet::with_capacity_and_hasher(
            formula_offsets
                .len()
                .saturating_add(reference_offsets.len()),
            FxBuildHasher,
        );

        for &offset in formula_offsets {
            if !entry_offsets.contains(&offset) || !source_offsets.insert(offset) {
                return BLOCK_SOURCE_INVALID;
            }
        }

        for &offset in reference_offsets {
            if !entry_offsets.contains(&offset) || !source_offsets.insert(offset) {
                return BLOCK_SOURCE_INVALID;
            }
        }

        let mut prepared_sources =
            FxHashMap::with_capacity_and_hasher(source_offsets.len(), FxBuildHasher);

        for (&offset, source) in formula_offsets.iter().zip(formula_sources.iter()) {
            let offset_index = offset as usize;
            let row = start_row + offset_index / cols;
            let col = start_col + offset_index % cols;
            let Some(key) = cell_key(row, col) else {
                return BLOCK_SOURCE_INVALID;
            };

            prepared_sources.insert(
                offset,
                self.parse_formula_entry(source, sheet as u32, key.0, key.1),
            );
        }

        for (index, &offset) in reference_offsets.iter().enumerate() {
            let target_index = index * 3;
            let target = AbsCellKey {
                sheet: reference_targets[target_index],
                row: reference_targets[target_index + 1],
                col: reference_targets[target_index + 2],
            };
            let target_sheet = target.sheet as usize;

            if self.sheet_alive.get(target_sheet) != Some(&true)
                || !self.sheets[target_sheet]
                    .cells
                    .contains_cell(target.row as usize, target.col as usize)
            {
                return BLOCK_SOURCE_INVALID;
            }

            prepared_sources.insert(offset, FormulaEntry::reference(target));
        }

        if let Some(revision) = dirty_revision {
            if !self.sheets[sheet]
                .cells
                .prepare_dirty_cells(&destination_cells, revision)
            {
                return BLOCK_RESOURCE_LIMIT;
            }
        }

        let mut string_ids = vec![NO_STRING; offsets.len()];
        // Sourceless blocks (the common interactive edit) own no source offsets,
        // so the containment probe can be skipped for every edited cell.
        let has_sources = !source_offsets.is_empty();

        let mut text_bounds = text_offsets.windows(2);
        for (index, &kind) in kinds.iter().enumerate() {
            if kind != KIND_STRING {
                continue;
            }
            // The bounds were checked above: one per string entry, ascending,
            // on character boundaries.
            let Some(&[start, end]) = text_bounds.next() else {
                return BLOCK_SOURCE_INVALID;
            };
            if !(has_sources && source_offsets.contains(&offsets[index])) {
                string_ids[index] = self.intern(&text[start as usize..end as usize]);
            }
        }

        for (index, &offset) in offsets.iter().enumerate() {
            let offset_usize = offset as usize;
            let row = start_row + offset_usize / cols;
            let col = start_col + offset_usize % cols;
            let source = if prepared_sources.is_empty() {
                None
            } else {
                prepared_sources.remove(&offset)
            };

            let (kind, payload) = if source.is_some() {
                (KIND_FORMULA, 0)
            } else {
                match kinds[index] {
                    KIND_NUMBER | KIND_BOOL => (kinds[index], encode_num(numbers[index])),
                    KIND_STRING => (KIND_STRING, encode_str_id(string_ids[index])),
                    _ => (KIND_EMPTY, 0),
                }
            };

            let accepted = self.replace_cell_source(CellSourceWrite {
                sheet,
                row,
                col,
                kind,
                payload,
                style: styles[index],
                source,
                revision: dirty_revision,
                hydrating,
            });

            if !accepted {
                if hydrating {
                    continue;
                }

                return BLOCK_RESOURCE_LIMIT;
            }
        }

        BLOCK_OK
    }

    /// Atomically write one row-major mixed literal/formula/reference block
    /// whose text payload arrives packed instead of once per cell.
    ///
    /// `text_buf` holds the UTF-8 bytes of every `KIND_STRING` cell of `kinds`
    /// in cell-offset order. `text_offsets` carries their byte boundaries: the
    /// n-th string cell owns `text_offsets[n]..text_offsets[n + 1]`, and the
    /// last entry equals the buffer length, so a block without strings passes an
    /// empty buffer and `&[0]`. Literal strings are interned in cell-offset order;
    /// source-owned text slots are consumed without interning. The compact
    /// status is `0` success, `1` invalid shape/bounds, `2` invalid or duplicate
    /// source metadata, and `3` paged dirty-capacity rejection.
    #[wasm_bindgen(js_name = setBlockPacked)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn set_block_packed(
        &mut self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        rows: usize,
        cols: usize,
        kinds: &[u8],
        numbers: &[f64],
        text_buf: &[u8],
        text_offsets: &[u32],
        styles: &[u32],
        formula_offsets: &[u32],
        formula_sources: Vec<String>,
        reference_offsets: &[u32],
        reference_targets: &[u32],
    ) -> u32 {
        self.write_packed_block(PackedBlock {
            order: BlockInputOrder::RowMajor,
            sheet,
            start_row,
            start_col,
            rows,
            cols,
            kinds,
            numbers,
            text_buf,
            text_offsets,
            styles,
            formula_offsets,
            formula_sources: &formula_sources,
            reference_offsets,
            reference_targets,
        })
    }

    /// Atomically write one column-major mixed literal/formula/reference block
    /// whose text payload arrives packed.
    ///
    /// This is [`Self::set_block_packed`] with the flat input arrays in the
    /// store's own column-major order: cell `(row, col)` sits at
    /// `col * rows + row`, so a columnar import can fill them column by column.
    /// Text packing, source metadata and every status code behave exactly as in
    /// [`Self::set_block_packed`].
    #[wasm_bindgen(js_name = setColumnBlockPacked)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn set_column_block_packed(
        &mut self,
        sheet: usize,
        start_row: usize,
        start_col: usize,
        rows: usize,
        cols: usize,
        kinds: &[u8],
        numbers: &[f64],
        text_buf: &[u8],
        text_offsets: &[u32],
        styles: &[u32],
        formula_offsets: &[u32],
        formula_sources: Vec<String>,
        reference_offsets: &[u32],
        reference_targets: &[u32],
    ) -> u32 {
        self.write_packed_block(PackedBlock {
            order: BlockInputOrder::ColumnMajor,
            sheet,
            start_row,
            start_col,
            rows,
            cols,
            kinds,
            numbers,
            text_buf,
            text_offsets,
            styles,
            formula_offsets,
            formula_sources: &formula_sources,
            reference_offsets,
            reference_targets,
        })
    }

    /// Shared body of the two packed writes. `block.order` says how the flat
    /// input arrays of a `rows` × `cols` block are laid out; the store itself is
    /// always written column-major.
    fn write_packed_block(&mut self, block: PackedBlock<'_>) -> u32 {
        let PackedBlock {
            order,
            sheet,
            start_row,
            start_col,
            rows,
            cols,
            kinds,
            numbers,
            text_buf,
            text_offsets,
            styles,
            formula_offsets,
            formula_sources,
            reference_offsets,
            reference_targets,
        } = block;
        let Some(cell_count) = rows.checked_mul(cols) else {
            return BLOCK_INVALID;
        };
        let dirty_revision = self.local_dirty_revision();
        let Some(existing) = self.sheets.get(sheet) else {
            return BLOCK_INVALID;
        };
        if rows == 0
            || cols == 0
            || cell_count > u32::MAX as usize
            || kinds.len() != cell_count
            || numbers.len() != cell_count
            || styles.len() != cell_count
            || text_offsets.is_empty()
            || text_offsets.first() != Some(&0)
            || text_offsets.last() != Some(&(text_buf.len() as u32))
            || text_offsets.windows(2).any(|bounds| bounds[0] > bounds[1])
            || formula_offsets.len() != formula_sources.len()
            || reference_targets.len() != reference_offsets.len().saturating_mul(3)
            || start_row
                .checked_add(rows)
                .is_none_or(|end| end > existing.cells.row_count())
            || start_row > u32::MAX as usize
            || rows - 1 > u32::MAX as usize - start_row
            || start_col
                .checked_add(cols)
                .is_none_or(|end| end > existing.cells.n_cols())
            || start_col > u32::MAX as usize
            || cols - 1 > u32::MAX as usize - start_col
        {
            return BLOCK_INVALID;
        }
        let source_text = match std::str::from_utf8(text_buf) {
            Ok(valid) => valid,
            Err(_) => return BLOCK_SOURCE_INVALID,
        };
        if dirty_revision.is_some()
            && !existing
                .cells
                .can_dirty_rect(start_row, start_col, rows, cols)
        {
            return BLOCK_RESOURCE_LIMIT;
        }

        // A block without formulas or references, such as a columnar import,
        // needs no per-cell source kinds; reads below treat a missing entry
        // as a literal.
        let mut source_kinds = if formula_offsets.is_empty() && reference_offsets.is_empty() {
            Vec::new()
        } else {
            vec![0u8; cell_count]
        };
        let mut seen_offsets = FxHashSet::with_capacity_and_hasher(
            formula_offsets
                .len()
                .saturating_add(reference_offsets.len()),
            FxBuildHasher,
        );
        for &offset in formula_offsets {
            let cell_offset = offset as usize;
            if cell_offset >= cell_count || !seen_offsets.insert(cell_offset as u32) {
                return BLOCK_SOURCE_INVALID;
            }
            source_kinds[cell_offset] = 1;
        }
        for &offset in reference_offsets {
            let cell_offset = offset as usize;
            if cell_offset >= cell_count || !seen_offsets.insert(cell_offset as u32) {
                return BLOCK_SOURCE_INVALID;
            }
            source_kinds[cell_offset] = 2;
        }

        let mut prepared = FxHashMap::with_capacity_and_hasher(seen_offsets.len(), FxBuildHasher);
        for (&offset, source) in formula_offsets.iter().zip(formula_sources.iter()) {
            let cell_offset = offset as usize;
            let (row_offset, col_offset) = order.coordinates(cell_offset, rows, cols);
            let row = start_row + row_offset;
            let col = start_col + col_offset;
            let Some(key) = cell_key(row, col) else {
                return BLOCK_SOURCE_INVALID;
            };
            prepared.insert(
                key,
                self.parse_formula_entry(source, sheet as u32, key.0, key.1),
            );
        }
        for (index, &offset) in reference_offsets.iter().enumerate() {
            let target_index = index * 3;
            let target = AbsCellKey {
                sheet: reference_targets[target_index],
                row: reference_targets[target_index + 1],
                col: reference_targets[target_index + 2],
            };
            let target_sheet = target.sheet as usize;
            if self.sheet_alive.get(target_sheet) != Some(&true)
                || !self.sheets[target_sheet]
                    .cells
                    .contains_cell(target.row as usize, target.col as usize)
            {
                return BLOCK_SOURCE_INVALID;
            }
            let cell_offset = offset as usize;
            let (row_offset, col_offset) = order.coordinates(cell_offset, rows, cols);
            let row = start_row + row_offset;
            let col = start_col + col_offset;
            let Some(key) = cell_key(row, col) else {
                return BLOCK_SOURCE_INVALID;
            };
            prepared.insert(key, FormulaEntry::reference(target));
        }

        // Check every text slice before reserving dirty capacity or interning,
        // so a rejected block adds no strings to the append-only pool.
        let text_count = text_offsets.len() - 1;
        let string_cells = kinds.iter().filter(|&&kind| kind == KIND_STRING).count();
        if string_cells != text_count
            || text_offsets
                .iter()
                .any(|&bound| !source_text.is_char_boundary(bound as usize))
        {
            return BLOCK_SOURCE_INVALID;
        }

        if let Some(revision) = dirty_revision {
            if !self.sheets[sheet]
                .cells
                .prepare_dirty_rect(start_row, start_col, rows, cols, revision)
            {
                return BLOCK_RESOURCE_LIMIT;
            }
        }

        // Only string cells read their pool ids, so a block without text,
        // such as an all-number import, allocates none.
        let mut string_ids = if text_count == 0 {
            Vec::new()
        } else {
            vec![NO_STRING; cell_count]
        };
        let mut text_bounds = text_offsets.windows(2);
        for (offset, &kind) in kinds.iter().enumerate() {
            if kind != KIND_STRING {
                continue;
            }
            // Bounds were validated above: ascending, on char boundaries, one per string cell.
            let Some(&[start, end]) = text_bounds.next() else {
                return BLOCK_SOURCE_INVALID;
            };
            if source_kinds.get(offset).is_some_and(|&source| source != 0) {
                continue;
            }
            string_ids[offset] = self.intern(&source_text[start as usize..end as usize]);
        }

        if self.replace_range_sources(
            sheet,
            (start_row, start_col),
            (rows, cols),
            dirty_revision,
            prepared,
            |row, col| {
                let offset = order.index(row, col, rows, cols);
                if source_kinds.get(offset).is_some_and(|&source| source != 0) {
                    return (KIND_FORMULA, 0, styles[offset]);
                }
                let (kind, payload) = match kinds[offset] {
                    KIND_NUMBER | KIND_BOOL => (kinds[offset], encode_num(numbers[offset])),
                    KIND_STRING => (KIND_STRING, encode_str_id(string_ids[offset])),
                    _ => (KIND_EMPTY, 0),
                };
                (kind, payload, styles[offset])
            },
        ) {
            BLOCK_OK
        } else {
            BLOCK_RESOURCE_LIMIT
        }
    }
}

impl CellStore {
    /// Writes a validated, spill-free literal block column by column: a block
    /// on a dense or local sheet, or a page load into a datasource-paged sheet.
    /// Formula retirement and dirty seeds still describe only listed cells,
    /// and a page load leaves cells with an unacknowledged edit, and their
    /// formulas, alone.
    #[inline(never)]
    fn write_sparse_columns(
        &mut self,
        sheet: usize,
        block: &SparseLiteralBlock<'_>,
        columns: &SparseColumns,
        hydrating: bool,
    ) {
        let sheet_data = &mut self.sheets[sheet];
        for (col, bounds) in columns.starts.windows(2).enumerate() {
            let column = &columns.entries[bounds[0] as usize..bounds[1] as usize];
            sheet_data.cells.write_column_cells(
                block.start.1 + col,
                column,
                |index| block.cell(index),
                DirtyRowWrite::Keep,
            );
        }
        let keys = || {
            block.offsets.iter().filter_map(|&offset| {
                let offset_index = offset as usize;
                cell_key(
                    block.start.0 + offset_index / block.dimensions.1,
                    block.start.1 + offset_index % block.dimensions.1,
                )
            })
        };
        if !sheet_data.formulas.is_empty() {
            let cells = &sheet_data.cells;
            for key in keys().filter(|&(row, col)| !cells.is_cell_dirty(row as usize, col as usize))
            {
                self.graph.replace_entry(
                    &mut sheet_data.formulas,
                    &mut self.formula_slots,
                    sheet,
                    key,
                    None,
                );
            }
        }
        // As in `replace_cell_source`: a snapshot or datasource page load
        // marks the whole sheet dirty. A remote edit seeds each of its cells,
        // never a rectangle, so a large batch of remote edits can fall back to
        // recalculating the sheet. A local edit seeds the block rectangle when
        // it lists every cell, else each listed cell.
        if hydrating && !self.remote_load {
            sheet_data.formulas.mark_all_dirty();
        } else if hydrating {
            sheet_data.formulas.mark_remote_cells_dirty(keys());
        } else if block.offsets.len() == block.dimensions.0 * block.dimensions.1 {
            if let Some(rect) = DirtyRect::new(
                block.start.0,
                block.start.1,
                block.start.0 + block.dimensions.0 - 1,
                block.start.1 + block.dimensions.1 - 1,
            ) {
                sheet_data.formulas.mark_dirty_rect(rect);
            }
        } else {
            sheet_data.formulas.mark_cells_dirty(keys());
        }
    }
}
