//! The workbook-wide store: sheet management, cell reads/writes, bulk loads.
//! Missing sheet references retain their tree and are indexed by stable formula
//! identity, so naming a sheet binds only its waiting users without reparsing.

use std::borrow::Cow;

use rustc_hash::{FxBuildHasher, FxHashMap, FxHashSet};
use wasm_bindgen::prelude::*;

use crate::calc::{
    ast_contains_sheet_span, bind_sheet_refs, external_name_key, has_unresolved_local_sheets,
    moved_index, moved_span, parse, parse_bound_with_features, place_span, sheet_name_key,
    shift_range, Ast, NamedRangeRef, ParseFeatures, StructuredRef, UnresolvedStructuredRef,
    WrittenNames,
};
use crate::cells::{
    encode_num, encode_str_id, payload_num, payload_str_id, DEFAULT_MAX_PAGED_DIRTY_CELLS,
    DEFAULT_PAGE_CHUNK_ROWS,
};
use crate::eval::{IterationLimits, RandomSource};
use crate::formula_slots::{FormulaId, FormulaResults, FormulaStore};
use crate::graph::{DirtyRect, FormulaGraph};
use crate::memory::{
    StoreMemoryStats, SHEET_INDEXES_METADATA, STRING_INDEX, STRING_POOL_SPANS, STRING_POOL_UTF8,
};
use crate::sheet::{formula_error_at, SheetData};
use crate::spill::{SpillBlocker, MAX_SPILL_OWNER_CELLS};
use crate::tables::{Table, TableColumn, TableSlots};
use crate::types::{
    cell_key, string_from_pool, AbsCellKey, FormulaEntry, FormulaError, StringStorage, KIND_BOOL,
    KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};
use crate::window::ConditionalRules;

mod external_links;
mod hidden_rows;
#[cfg(all(test, feature = "analysis"))]
mod measure_tests;
#[cfg(feature = "analysis")]
mod measures;
#[cfg(feature = "analysis")]
mod model_source;
mod names;
pub(crate) mod pivot_output;
#[cfg(feature = "analysis")]
mod pivots;
mod range_transfer;
mod recalculation;
#[cfg(all(test, feature = "analysis"))]
mod related_measure_tests;
#[cfg(feature = "analysis")]
mod relationships;
#[cfg(test)]
mod sparse_tests;
#[cfg(all(test, feature = "analysis"))]
mod tests;
mod transfer;

#[cfg(not(feature = "analysis"))]
fn utf16_slices<'a>(buf: &'a str, utf16_lens: &[u32], limit: usize) -> Vec<&'a str> {
    let mut slices = Vec::with_capacity(limit);

    if buf.is_ascii() {
        let mut start = 0usize;

        for &len in utf16_lens.iter().take(limit) {
            let end = (start + len as usize).min(buf.len());
            slices.push(&buf[start..end]);
            start = end;
        }

        return slices;
    }

    let mut chars = buf.char_indices().peekable();

    for &len in utf16_lens.iter().take(limit) {
        let start = chars.peek().map_or(buf.len(), |&(idx, _)| idx);
        let mut units = 0u32;

        while units < len {
            let Some((_, ch)) = chars.next() else {
                break;
            };

            units += ch.len_utf16() as u32;
        }

        let end = chars.peek().map_or(buf.len(), |&(idx, _)| idx);
        slices.push(&buf[start..end]);
    }

    slices
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
    #[wasm_bindgen(js_name = formulaOffsets)]
    pub fn formula_offsets(&self) -> Vec<u32> {
        self.formula_offsets.clone()
    }

    #[wasm_bindgen(js_name = formulaSources)]
    pub fn formula_sources(&self) -> Vec<String> {
        self.formula_sources.clone()
    }

    #[wasm_bindgen(js_name = referenceOffsets)]
    pub fn reference_offsets(&self) -> Vec<u32> {
        self.reference_offsets.clone()
    }

    #[wasm_bindgen(js_name = referenceTargets)]
    pub fn reference_targets(&self) -> Vec<u32> {
        self.reference_targets.clone()
    }

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
    payload: Vec<u64>,
    style: Vec<u32>,
    formulas: Vec<(u32, u32, FormulaEntry)>,
    strings: StringStorage,
}

#[wasm_bindgen]
impl RangeSnapshot {
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

    #[wasm_bindgen(js_name = kinds)]
    pub fn kinds(&self) -> Vec<u8> {
        self.kind.clone()
    }

    #[wasm_bindgen(js_name = styleIds)]
    pub fn style_ids(&self) -> Vec<u32> {
        self.style.clone()
    }

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

    #[wasm_bindgen(js_name = formulaSources)]
    pub fn formula_sources(&self) -> Vec<String> {
        self.formulas
            .iter()
            .filter(|(_, _, entry)| entry.is_formula())
            .map(|(_, _, entry)| entry.captured_source().to_owned())
            .collect()
    }
}

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
    /// Counting-sort entry indexes by column while rejecting invalid offsets.
    fn column_entries(&self) -> Option<SparseColumns> {
        let (rows, cols) = self.dimensions;
        let mut seen = vec![0u64; (rows * cols).div_ceil(u64::BITS as usize)];
        let mut starts = vec![0u32; cols + 1];
        for &offset in self.offsets {
            let offset_index = offset as usize;
            if offset_index >= rows * cols {
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
        Some(SparseColumns { starts, entries })
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

const MAX_TABLES: usize = 1_024;
const MAX_TABLE_COLUMNS: usize = 16_384;
const MAX_TABLE_NAME_BYTES: usize = 255;
const MAX_TABLE_ID_BYTES: usize = 128;

/// The lookup key of a defined name: the name without case. A name of a
/// linked workbook, such as `Budget.xlsx!Total`, has the key of
/// `external_name_key`, so every spelling of it finds the same name.
pub(crate) fn workbook_name_key(value: &str) -> String {
    external_name_key(value).unwrap_or_else(|| value.to_uppercase())
}

/// The workbook-wide store: every sheet, one string pool.
#[wasm_bindgen]
pub struct CellStore {
    pub(crate) sheets: Vec<SheetData>,
    pub(crate) sheet_names: Vec<String>,
    pub(crate) sheet_alive: Vec<bool>,
    /// Live sheet handles in workbook tab order, which 3-D references span.
    /// `None` means ascending handle order: tabs that were only ever appended
    /// cost one pointer and no heap. The list exists once the host reorders.
    #[allow(
        clippy::box_collection,
        reason = "boxed so the field stays one pointer: a bare `Vec` header would grow every store, and most workbooks never reorder tabs"
    )]
    sheet_order: Option<Box<Vec<u32>>>,
    pub(crate) sheet_lookup: FxHashMap<String, usize>,
    pub(crate) sheet_ids: FxHashMap<String, usize>,
    pub(crate) strings: StringStorage,
    /// Stable ids keep formula passes independent of address-index allocation.
    pub(crate) formula_slots: FormulaStore,
    /// Moving one pointer keeps pass setup independent of scratch-header size.
    pub(crate) formula_results: Option<Box<FormulaResults>>,
    /// Optional bounded commit output; absent until a chart tracker subscribes.
    pub(crate) recalculation: Option<Box<recalculation::Recalculation>>,
    pub(crate) graph: FormulaGraph,
    pub(crate) conditional_rules: ConditionalRules,
    /// Host functions of this store. `None` until the host registers one, so
    /// stores without host functions pay one pointer. Only the full engine
    /// has the field, so the default engine store does not grow.
    #[cfg(feature = "host-functions")]
    pub(crate) custom_functions: Option<Box<crate::eval::custom::CustomFunctions>>,
    /// Weak index of the literal REGEX patterns this store's formulas share.
    /// `None` until a formula uses one, and only the full engine has it. A
    /// `Cell` adds one pointer to the store, so readers take the index out
    /// and put it back.
    #[cfg(feature = "analysis")]
    regex_patterns: std::cell::Cell<Option<Box<crate::eval::regex_patterns::PatternIndex>>>,
    loading_page: usize,
    defined_names: FxHashMap<(Option<u32>, String), names::DefinedName>,
    tables: TableSlots,
    mutation_revision: u64,
    active_mutation_revision: Option<u64>,
    pub(crate) volatile_serial: f64,
    pub(crate) random: RandomSource,
    pub(crate) spill_owner_cell_limit: usize,
    /// Iterative calculation limits; `None` while iteration is off, as in a
    /// new Excel workbook, so circular references show `#CYCLE!`. Boxed so
    /// workbooks that never turn iteration on pay one pointer.
    pub(crate) iteration: Option<Box<IterationLimits>>,
    /// Pivot tables: the full engine's definitions and caches, or the
    /// default engine's saved output. `None` until a sheet gets a pivot (on
    /// the default engine, one with saved output), so a workbook without
    /// pivots pays one pointer and no pivot work.
    #[cfg(feature = "analysis")]
    pub(crate) pivots: Option<Box<pivots::PivotRegistry>>,
    #[cfg(not(feature = "analysis"))]
    pub(crate) pivots: Option<Box<pivot_output::SavedPivots>>,
    /// Table relationships of the full engine (#229). `None` until the host
    /// sends one, so a workbook without relationships pays one pointer.
    #[cfg(feature = "analysis")]
    #[allow(
        clippy::box_collection,
        reason = "boxed so the field stays one pointer: most workbooks have no model"
    )]
    pub(crate) relationships: Option<Box<Vec<relationships::Relationship>>>,
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
    /// An empty workbook with no sheets.
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new() -> Self {
        Self {
            sheets: Vec::new(),
            sheet_names: Vec::new(),
            sheet_alive: Vec::new(),
            sheet_order: None,
            sheet_lookup: FxHashMap::default(),
            sheet_ids: FxHashMap::default(),
            strings: StringStorage::new(),
            formula_slots: FormulaStore::default(),
            formula_results: None,
            recalculation: None,
            graph: FormulaGraph::default(),
            conditional_rules: ConditionalRules::default(),
            #[cfg(feature = "host-functions")]
            custom_functions: None,
            #[cfg(feature = "analysis")]
            regex_patterns: std::cell::Cell::new(None),
            loading_page: 0,
            mutation_revision: 0,
            active_mutation_revision: None,
            defined_names: FxHashMap::default(),
            volatile_serial: 0.0,
            random: RandomSource::from_host(),
            spill_owner_cell_limit: MAX_SPILL_OWNER_CELLS,
            iteration: None,
            pivots: None,
            #[cfg(feature = "analysis")]
            relationships: None,
            tables: TableSlots::default(),
        }
    }

    fn next_mutation_revision(&mut self) -> u64 {
        self.mutation_revision = self.mutation_revision.wrapping_add(1);
        if self.mutation_revision == 0 {
            self.mutation_revision = 1;
        }
        self.mutation_revision
    }

    pub(crate) fn local_dirty_revision(&mut self) -> Option<u64> {
        if self.loading_page > 0 {
            return None;
        }

        Some(
            self.active_mutation_revision
                .unwrap_or_else(|| self.next_mutation_revision()),
        )
    }

    /// Each cell payload of `snapshot` read as a number, row-major. Only
    /// number and boolean cells give meaningful values.
    #[wasm_bindgen(js_name = snapshotNumbers)]
    pub fn snapshot_numbers(&self, snapshot: &RangeSnapshot) -> Vec<f64> {
        snapshot.payload.iter().copied().map(payload_num).collect()
    }

    /// The text of each cell of `snapshot`, row-major; an empty string for a
    /// cell without text.
    #[wasm_bindgen(js_name = snapshotTexts)]
    pub fn snapshot_texts(&self, snapshot: &RangeSnapshot) -> Vec<String> {
        snapshot
            .payload
            .iter()
            .copied()
            .map(|payload| {
                let id = payload_str_id(payload);
                if id == NO_STRING {
                    String::new()
                } else {
                    string_from_pool(&snapshot.strings, id).unwrap_or_default()
                }
            })
            .collect()
    }

    /// Allocate a sheet grid and return its numeric handle.
    #[wasm_bindgen(js_name = addSheet)]
    pub fn add_sheet(&mut self, n_cols: usize, row_count: usize) -> usize {
        match self.try_add_sheet(n_cols, row_count) {
            Ok(index) => {
                // SHEET and SHEETS count the tabs, so volatile formulas
                // recompute when one is added.
                self.recompute_with_volatile_sheets(Vec::new());
                index
            }
            Err(error) => wasm_bindgen::throw_str(&error),
        }
    }

    /// Allocate a logical sheet whose cell chunks materialize on page load or edit.
    #[wasm_bindgen(js_name = addPagedSheet)]
    pub fn add_paged_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> usize {
        match self.try_add_paged_sheet(n_cols, row_count, chunk_rows, byte_budget, max_dirty_cells)
        {
            Ok(index) => {
                self.recompute_with_volatile_sheets(Vec::new());
                index
            }
            Err(error) => wasm_bindgen::throw_str(&error),
        }
    }

    /// Like [`Self::add_paged_sheet`], with an unsupported chunk size as an
    /// error instead of a JavaScript exception.
    pub(crate) fn try_add_paged_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
        chunk_rows: usize,
        byte_budget: usize,
        max_dirty_cells: usize,
    ) -> Result<usize, String> {
        let index = self.sheets.len();
        self.sheets.push(SheetData::new_paged(
            n_cols,
            row_count,
            if chunk_rows == 0 {
                DEFAULT_PAGE_CHUNK_ROWS
            } else {
                chunk_rows
            },
            byte_budget,
            if max_dirty_cells == 0 {
                DEFAULT_MAX_PAGED_DIRTY_CELLS
            } else {
                max_dirty_cells
            },
        )?);
        self.sheet_names.push(String::new());
        self.sheet_alive.push(true);
        if let Some(order) = &mut self.sheet_order {
            order.push(index as u32);
        }

        Ok(index)
    }

    /// Whether `sheet` keeps its cells in paged storage, loaded from the host
    /// on demand.
    #[wasm_bindgen(js_name = isPaged)]
    pub fn is_paged(&self, sheet: usize) -> bool {
        self.sheets
            .get(sheet)
            .is_some_and(|data| data.cells.is_paged())
    }

    /// `[chunks, loaded cells, dirty cells, clean chunk bytes, fully loaded, dirty bytes]`.
    #[wasm_bindgen(js_name = pagedStats)]
    pub fn paged_stats(&self, sheet: usize) -> Vec<f64> {
        let Some(data) = self.sheets.get(sheet) else {
            return vec![0.0; 6];
        };

        let Some((chunks, loaded, dirty, clean_bytes, dirty_bytes)) = data.cells.paged_stats()
        else {
            return vec![0.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        };

        vec![
            chunks as f64,
            loaded as f64,
            dirty as f64,
            clean_bytes as f64,
            if data.cells.is_fully_loaded() {
                1.0
            } else {
                0.0
            },
            dirty_bytes as f64,
        ]
    }

    /// Bytes held by each part of the store, in the flat layout that
    /// `packages/core/src/resource-accounting.ts` reads: `[schema, owner count,
    /// hash estimate version, (logical, allocated, entries) per owner, totals]`.
    #[wasm_bindgen(js_name = memoryStats)]
    pub fn memory_stats(&self) -> Vec<f64> {
        self.store_memory_stats().encode()
    }

    /// Benchmark diagnostic: `[current matrix bytes, peak matrix bytes, allocations]`.
    #[wasm_bindgen(js_name = formulaMatrixResourceStats)]
    pub fn formula_matrix_resource_stats(&self) -> Vec<f64> {
        crate::eval::matrix_resource_stats()
            .into_iter()
            .map(|value| value as f64)
            .collect()
    }

    /// Zeroes the counters that `formulaMatrixResourceStats` reports.
    #[wasm_bindgen(js_name = resetFormulaMatrixResourceStats)]
    pub fn reset_formula_matrix_resource_stats(&self) {
        crate::eval::reset_matrix_resource_stats();
    }

    /// Reclaim unreachable text and release growth slack at a transaction barrier.
    /// Raw pool IDs must be discarded when `stringPoolEpoch` changes.
    #[wasm_bindgen(js_name = compactStringStorage)]
    pub fn compact_string_storage(&mut self) {
        if self.active_mutation_revision.is_none() && self.loading_page == 0 {
            self.collect_strings(true);
        }
    }

    /// Raw string IDs are valid only within this epoch, including window IDs.
    #[wasm_bindgen(js_name = stringPoolEpoch)]
    pub fn string_pool_epoch(&self) -> u32 {
        self.strings.epoch
    }

    /// Bytes of WebAssembly memory committed so far; 0 in a native build.
    #[wasm_bindgen(js_name = wasmCommittedBytes)]
    pub fn wasm_committed_bytes(&self) -> usize {
        #[cfg(target_arch = "wasm32")]
        {
            core::arch::wasm32::memory_size::<0>().saturating_mul(65_536)
        }

        #[cfg(not(target_arch = "wasm32"))]
        {
            0
        }
    }

    /// 0 unloaded, 1 loaded-empty, 2 loaded-value, 3 dirty local edit.
    #[wasm_bindgen(js_name = cellState)]
    pub fn cell_state(&self, sheet: usize, row: usize, col: usize) -> u8 {
        let Some(data) = self.sheets.get(sheet) else {
            return 0;
        };

        if !data.cells.contains_cell(row, col) || !data.cells.is_loaded(row, col) {
            return 0;
        }

        if data.cells.is_cell_dirty(row, col) {
            3
        } else if data.cells.kind_at(data.cells.idx(row, col)) == KIND_EMPTY {
            1
        } else {
            2
        }
    }

    /// The cells of a paged `sheet` that changed locally and are not clean yet,
    /// as flattened `[row, col]` pairs sorted by row, then column. Empty for a
    /// sheet that is not paged.
    #[wasm_bindgen(js_name = pagedDirtyCoordinates)]
    pub fn paged_dirty_coordinates(&self, sheet: usize) -> Vec<f64> {
        self.sheets
            .get(sheet)
            .map_or_else(Vec::new, |data| data.cells.dirty_coordinates())
    }

    /// Whether every cell of `sheet` is loaded. True for a sheet that is not
    /// paged; false when the sheet does not exist.
    #[wasm_bindgen(js_name = isFullyLoaded)]
    pub fn is_fully_loaded(&self, sheet: usize) -> bool {
        self.sheets
            .get(sheet)
            .is_some_and(|data| data.cells.is_fully_loaded())
    }

    /// Whether every cell from (`r0`, `c0`) to (`r1`, `c1`), both inclusive, of
    /// `sheet` is loaded. True for a sheet that is not paged; false when the
    /// sheet does not exist.
    #[wasm_bindgen(js_name = rangeFullyLoaded)]
    pub fn range_fully_loaded(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
    ) -> bool {
        self.sheets
            .get(sheet)
            .is_some_and(|data| data.cells.range_fully_loaded(r0, c0, r1, c1))
    }

    /// Whether rows `start_row..end_row` of each column in `cols` lie inside
    /// `sheet` and are loaded. True for an empty row range or no columns.
    #[wasm_bindgen(js_name = columnsFullyLoaded)]
    pub fn columns_fully_loaded(
        &self,
        sheet: usize,
        start_row: usize,
        end_row: usize,
        cols: &[u32],
    ) -> bool {
        if start_row >= end_row || cols.is_empty() {
            return true;
        }

        self.sheets.get(sheet).is_some_and(|data| {
            cols.iter().all(|&col| {
                let col_index = col as usize;

                data.cells.contains_cell(start_row, col_index)
                    && data.cells.contains_cell(end_row - 1, col_index)
                    && data
                        .cells
                        .range_fully_loaded(start_row, col_index, end_row - 1, col_index)
            })
        })
    }

    /// Marks the cells in rows `start_row..end_row` and columns
    /// `start_col..end_col` of a paged `sheet` clean, keeping their values.
    #[wasm_bindgen(js_name = markRangeClean)]
    pub fn mark_range_clean(
        &mut self,
        sheet: usize,
        start_row: usize,
        end_row: usize,
        start_col: usize,
        end_col: usize,
    ) {
        if let Some(data) = self.sheets.get_mut(sheet) {
            data.cells
                .mark_range_clean(start_row, end_row, start_col, end_col);
        }
    }

    /// Marks every cell that `revision` still owns clean, once the host has
    /// stored that revision. Revision 0 does nothing.
    #[wasm_bindgen(js_name = acknowledgeRevision)]
    pub fn acknowledge_revision(&mut self, revision: u64) {
        if revision == 0 {
            return;
        }

        for sheet in &mut self.sheets {
            sheet.cells.acknowledge_revision(revision);
        }
    }

    /// Replaces transient read protection without changing viewport pins.
    /// Nonempty `rows` are backing row IDs; otherwise `[start_row, end_row)` is used.
    #[wasm_bindgen(js_name = pinReadWindow)]
    pub fn pin_read_window(
        &mut self,
        sheet: usize,
        start_row: usize,
        end_row: usize,
        rows: &[u32],
        cols: &[u32],
    ) {
        if let Some(data) = self.sheets.get_mut(sheet) {
            data.cells.pin_read_window(start_row, end_row, rows, cols);
        }
    }

    /// Replaces viewport-owned protection independently of transient read pins.
    #[wasm_bindgen(js_name = pinViewportBands)]
    pub fn pin_viewport_bands(&mut self, sheet: usize, bands: &[u32]) {
        if let Some(data) = self.sheets.get_mut(sheet) {
            data.cells.pin_viewport_bands(bands);
        }
    }

    /// Starts a local edit and returns its revision. Cells it changes stay
    /// dirty under that revision until `acknowledgeRevision`; `commitSources`
    /// ends the edit.
    #[wasm_bindgen(js_name = beginMutation)]
    pub fn begin_mutation(&mut self) -> u64 {
        self.reset_recalculation();
        let revision = self.next_mutation_revision();
        self.active_mutation_revision = Some(revision);
        revision
    }

    /// Starts loading a page from the host. Until `commitSources`, writes are
    /// stored values, not local edits, so they don't become dirty.
    #[wasm_bindgen(js_name = beginPageLoad)]
    pub fn begin_page_load(&mut self) {
        self.loading_page = self.loading_page.saturating_add(1);
    }

    /// Gives the live `sheet` its stable `id` and display `name`, replacing
    /// earlier ones. A missing or removed sheet is ignored.
    #[wasm_bindgen(js_name = setSheetName)]
    pub fn set_sheet_name(&mut self, sheet: usize, id: &str, name: &str) {
        if sheet >= self.sheets.len() {
            return;
        }
        if !self.sheet_alive[sheet] {
            return;
        }

        self.sheet_ids.retain(|_, handle| *handle != sheet);
        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet] = name.to_owned();
        self.sheet_ids.insert(id.to_owned(), sheet);
        self.sheet_lookup.insert(sheet_name_key(name), sheet);
        let affected = self.bind_pending_sheet_formulas(id, name);
        if !affected.is_empty() {
            self.recompute_seed_sheets(&affected);
        }
    }

    /// Rename a live stable sheet handle and rewrite every resolved formula AST reference.
    #[wasm_bindgen(js_name = renameSheet)]
    pub fn rename_sheet(&mut self, sheet: usize, id: &str, name: &str) -> bool {
        let name_key = sheet_name_key(name);

        if name.is_empty()
            || self.sheet_alive.get(sheet) != Some(&true)
            || self.sheet_ids.get(id) != Some(&sheet)
            || self
                .sheet_lookup
                .get(&name_key)
                .is_some_and(|existing| *existing != sheet)
        {
            return false;
        }

        let mut affected = Vec::new();

        for (formula_sheet, data) in self.sheets.iter_mut().enumerate() {
            if !self.sheet_alive[formula_sheet] {
                continue;
            }

            let mut changed = false;
            data.formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    changed |= entry.rename_sheet(sheet as u32, name, formula_sheet as u32);
                });

            if changed {
                data.formulas.mark_all_dirty();
                affected.push(formula_sheet);
            }
        }

        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet] = name.to_owned();
        self.sheet_lookup.insert(name_key, sheet);
        self.rename_sheet_in_named_formulas(sheet as u32, name);
        for pending_sheet in self.bind_pending_sheet_formulas(id, name) {
            if !affected.contains(&pending_sheet) {
                affected.push(pending_sheet);
            }
        }
        self.graph.invalidate();

        self.recompute_with_volatile_sheets(affected);

        true
    }

    /// Tombstone a stable sheet handle and invalidate every formula reference to it.
    #[wasm_bindgen(js_name = removeSheet)]
    pub fn remove_sheet(&mut self, sheet: usize) -> bool {
        if self.sheet_alive.get(sheet) != Some(&true) {
            return false;
        }

        let mut affected = Vec::new();

        for (formula_sheet, data) in self.sheets.iter_mut().enumerate() {
            if formula_sheet == sheet || !self.sheet_alive[formula_sheet] {
                continue;
            }

            let mut changed = false;
            data.formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    changed |= entry.invalidate_sheet(sheet as u32, formula_sheet as u32);
                });

            if changed {
                data.formulas.mark_all_dirty();
                affected.push(formula_sheet);
            }
        }

        let mut changed_names = Vec::new();
        self.defined_names.retain(|(scope, name), definition| {
            let removed = *scope == Some(sheet as u32)
                || matches!(definition, names::DefinedName::Range(range) if range.sheet == sheet as u32);
            if removed {
                changed_names.push(name.clone());
            }
            !removed
        });
        self.remove_sheet_from_named_formulas(sheet as u32, &mut changed_names);

        // The references to these tables are on the removed sheet, so the
        // walk above already made them `#REF!`.
        let tables_before = self.tables.len();
        self.tables.retain_mut(|table| table.sheet != sheet as u32);
        if self.tables.len() != tables_before {
            self.add_names_over_tables(&mut changed_names);
        }

        self.sheet_ids.retain(|_, handle| *handle != sheet);
        self.sheet_lookup.retain(|_, handle| *handle != sheet);
        self.sheet_names[sheet].clear();
        for id in self.sheets[sheet].formulas.ids() {
            let _ = self.formula_slots.retire(id);
        }
        self.sheets[sheet] = SheetData::new(0, 0);
        self.conditional_rules.remove_sheet(sheet);
        self.sheet_alive[sheet] = false;
        self.forget_pivot_sheet(sheet);
        if let Some(order) = &mut self.sheet_order {
            order.retain(|&tab| tab != sheet as u32);
        }
        for span_sheet in self.refresh_sheet_spans() {
            if !affected.contains(&span_sheet) {
                affected.push(span_sheet);
            }
        }
        self.graph.invalidate();

        if changed_names.is_empty() {
            self.recompute_with_volatile_sheets(affected);
        } else {
            self.rebind_name_users(changed_names);
            self.recompute_all_sheets();
        }

        self.strings.request_collection();

        true
    }

    /// Set the workbook tab order: every live sheet handle exactly once.
    /// 3-D references such as `Sheet1:Sheet3!A1` span the tabs between their
    /// endpoints, so formulas whose span changed are re-placed, their
    /// dependencies patched, and their results recomputed. Rejects an order
    /// that omits, repeats or adds a handle.
    #[wasm_bindgen(js_name = setSheetOrder)]
    pub fn set_sheet_order(&mut self, order: &[u32]) -> bool {
        let mut seen = vec![false; self.sheet_alive.len()];
        let current = self.tab_order();
        let valid = order.len() == current.len()
            && order.iter().all(|&handle| {
                let index = handle as usize;
                let fresh =
                    self.sheet_alive.get(index).copied().unwrap_or_default() && !seen[index];
                if fresh {
                    seen[index] = true;
                }
                fresh
            });
        if !valid {
            return false;
        }
        if order == current.as_ref() {
            return true;
        }

        self.sheet_order = Some(Box::new(order.to_vec()));
        let affected = self.refresh_sheet_spans();
        // SHEET and SHEETS read the tab order, so volatile formulas
        // recompute too.
        self.recompute_with_volatile_sheets(affected);
        true
    }

    /// Row and column pairs of the formulas on `sheet` that hold a 3-D
    /// reference. A tab move can rewrite their text, so the host records
    /// their sources before the move to undo it exactly.
    #[wasm_bindgen(js_name = sheetSpanFormulaCells)]
    pub fn sheet_span_formula_cells(&self, sheet: usize) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        data.formulas
            .iter(&self.formula_slots)
            .filter(|(_, entry)| entry.ast.as_ref().is_some_and(ast_contains_sheet_span))
            .flat_map(|((row, col), _)| [row, col])
            .collect()
    }

    /// @enginePublic Engine hosts can read sheet dimensions without core metadata.
    #[wasm_bindgen(js_name = rowCount)]
    pub fn row_count(&self, sheet: usize) -> usize {
        self.sheets.get(sheet).map_or(0, |s| s.cells.row_count())
    }

    /// @enginePublic Engine hosts can read sheet dimensions without core metadata.
    #[wasm_bindgen(js_name = colCount)]
    pub fn col_count(&self, sheet: usize) -> usize {
        self.sheets.get(sheet).map_or(0, |s| s.cells.n_cols())
    }

    /// Writes the number `value` with style `style` to the cell at `row`,
    /// `col` of `sheet`.
    #[wasm_bindgen(js_name = setNumber)]
    pub fn set_number(&mut self, sheet: usize, row: usize, col: usize, value: f64, style: u32) {
        let revision = self.local_dirty_revision();

        self.replace_cell_source(CellSourceWrite {
            sheet,
            row,
            col,
            kind: KIND_NUMBER,
            payload: encode_num(value),
            style,
            source: None,
            revision,
            hydrating: false,
        });
    }

    /// Writes the boolean `value` with style `style` to the cell at `row`,
    /// `col` of `sheet`.
    #[wasm_bindgen(js_name = setBool)]
    pub fn set_bool(&mut self, sheet: usize, row: usize, col: usize, value: bool, style: u32) {
        let revision = self.local_dirty_revision();

        self.replace_cell_source(CellSourceWrite {
            sheet,
            row,
            col,
            kind: KIND_BOOL,
            payload: encode_num(f64::from(value)),
            style,
            source: None,
            revision,
            hydrating: false,
        });
    }

    /// Writes the text `value` with style `style` to the cell at `row`, `col`
    /// of `sheet`.
    #[wasm_bindgen(js_name = setString)]
    pub fn set_string(&mut self, sheet: usize, row: usize, col: usize, value: &str, style: u32) {
        if cell_key(row, col).is_none() {
            return;
        }

        let dirty_revision = self.local_dirty_revision();
        let Some(existing) = self.sheets.get(sheet) else {
            return;
        };

        if !existing.cells.contains_cell(row, col)
            || (dirty_revision.is_some() && !existing.cells.can_dirty_cell(row, col))
        {
            return;
        }

        let id = self.intern(value);

        self.replace_cell_source(CellSourceWrite {
            sheet,
            row,
            col,
            kind: KIND_STRING,
            payload: encode_str_id(id),
            style,
            source: None,
            revision: dirty_revision,
            hydrating: false,
        });
    }

    /// @enginePublic Scalar clearing complements the public scalar value setters.
    #[wasm_bindgen(js_name = clearCell)]
    pub fn clear_cell(&mut self, sheet: usize, row: usize, col: usize, style: u32) {
        let revision = self.local_dirty_revision();

        self.replace_cell_source(CellSourceWrite {
            sheet,
            row,
            col,
            kind: KIND_EMPTY,
            payload: 0,
            style,
            source: None,
            revision,
            hydrating: false,
        });
    }

    /// Write one sparse mixed transaction/page/snapshot block without
    /// allocating by logical rectangle size on paged sheets. Dense sheets use
    /// a compact offset bitset. Inside `beginPageLoad`, dirty paged cells are
    /// skipped; otherwise the whole sparse write is preflighted.
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

        // Paged cells need dirty-overlay preflight and residency checks; spills
        // need per-cell detachment. Neither can use the dense column writer.
        if !offsets.is_empty()
            && formula_offsets.is_empty()
            && reference_offsets.is_empty()
            && !existing.cells.is_paged()
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

            prepared_sources.insert(offset, FormulaEntry::reference(target, sheet as u32));
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

    /// Clear a rectangle while independently controlling contents and style.
    #[wasm_bindgen(js_name = clearRange)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn clear_range(
        &mut self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
        contents: bool,
        style: bool,
    ) -> bool {
        let dirty_revision = self.local_dirty_revision();
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };

        if r0 > r1
            || c0 > c1
            || r1 >= s.cells.row_count()
            || c1 >= s.cells.n_cols()
            || (dirty_revision.is_some()
                && !s.cells.can_dirty_rect(r0, c0, r1 - r0 + 1, c1 - c0 + 1))
        {
            return false;
        }

        if contents {
            if let Some(rect) = DirtyRect::new(r0, c0, r1, c1) {
                prepare_rect_write(s, rect);
            }
        }

        for col in c0..=c1 {
            for row in r0..=r1 {
                if s.cells.is_paged() && !s.cells.is_loaded(row, col) {
                    continue;
                }

                let index = s.cells.idx(row, col);
                let kind = if contents {
                    KIND_EMPTY
                } else {
                    s.cells.source_kind_at(index)
                };
                let payload = if contents {
                    0
                } else {
                    s.cells.source_payload_at(index)
                };

                let next_style = if style { 0 } else { s.cells.style_at(index) };
                let written = if contents {
                    // Unloaded paged cells are skipped, so reserve per written
                    // cell instead of over-reserving the whole rectangle.
                    dirty_revision
                        .is_none_or(|revision| s.cells.prepare_dirty_cells(&[(row, col)], revision))
                        && s.cells
                            .write_cell(row, col, kind, payload, next_style, dirty_revision)
                } else {
                    s.cells.write_style(row, col, next_style, dirty_revision)
                };

                if !written {
                    return false;
                }
                if contents {
                    if let Some(key) = cell_key(row, col) {
                        self.graph.replace_entry(
                            &mut s.formulas,
                            &mut self.formula_slots,
                            sheet,
                            key,
                            None,
                        );
                    }
                }
            }
        }
        if contents && (r1 - r0 + 1).saturating_mul(c1 - c0 + 1) > 1 {
            self.strings.request_collection();
        }
        true
    }

    /// Unique style ids present in a rectangle; cost stays inside WASM.
    #[wasm_bindgen(js_name = rangeStyleIds)]
    pub fn range_style_ids(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
    ) -> Vec<u32> {
        let Some(s) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        if r0 > r1 || c0 > c1 || r1 >= s.cells.row_count() || c1 >= s.cells.n_cols() {
            return Vec::new();
        }

        // Neighbouring cells usually share a style, so a run of equal ids costs
        // one compare instead of one hash insert per cell.
        let mut ids = FxHashSet::<u32>::default();
        for col in c0..=c1 {
            if let Some(column) = s.cells.dense_column(col) {
                let mut previous = None;
                for &style in column.styles(r0..=r1) {
                    if previous != Some(style) {
                        ids.insert(style);
                        previous = Some(style);
                    }
                }
                continue;
            }

            let base = col * s.cells.row_count();
            for row in r0..=r1 {
                if s.cells.is_loaded(row, col) {
                    ids.insert(s.cells.style_at(base + row));
                }
            }
        }

        let mut out: Vec<u32> = ids.into_iter().collect();
        out.sort_unstable();
        out
    }

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
        formulas.sort_unstable_by_key(|(offset, _)| *offset);
        references.sort_unstable_by_key(|(offset, _)| *offset);

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
        references.sort_unstable_by_key(|(offset, _)| *offset);
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

    /// Return packed `[source_sheet, source_row, source_col, ...]` references
    /// targeting one sheet, bounded before crossing into the host.
    #[wasm_bindgen(js_name = referencesTargeting)]
    pub fn references_targeting(
        &self,
        target_sheet: usize,
        max_entries: usize,
    ) -> Option<Vec<u32>> {
        if self.sheet_alive.get(target_sheet) != Some(&true) {
            return Some(Vec::new());
        }
        let mut sources = Vec::new();
        for (source_sheet, data) in self.sheets.iter().enumerate() {
            if self.sheet_alive.get(source_sheet) != Some(&true) {
                continue;
            }
            for ((row, col), entry) in data.formulas.iter(&self.formula_slots) {
                if entry
                    .reference_target(source_sheet as u32)
                    .is_none_or(|target| target.sheet as usize != target_sheet)
                {
                    continue;
                }
                if sources.len() / 3 >= max_entries {
                    return None;
                }
                sources.extend_from_slice(&[source_sheet as u32, row, col]);
            }
        }
        Some(sources)
    }

    /// Remap styles over a rectangle using parallel old/new id tables.
    #[wasm_bindgen(js_name = remapRangeStyles)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn remap_range_styles(
        &mut self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
        old_ids: &[u32],
        new_ids: &[u32],
    ) -> bool {
        let dirty_revision = self.local_dirty_revision();
        let Some(s) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if r0 > r1
            || c0 > c1
            || r1 >= s.cells.row_count()
            || c1 >= s.cells.n_cols()
            || old_ids.len() != new_ids.len()
            || (dirty_revision.is_some()
                && !s.cells.can_dirty_rect(r0, c0, r1 - r0 + 1, c1 - c0 + 1))
        {
            return false;
        }
        let mapping: FxHashMap<u32, u32> = old_ids
            .iter()
            .copied()
            .zip(new_ids.iter().copied())
            .collect();
        for col in c0..=c1 {
            for row in r0..=r1 {
                if !s.cells.is_loaded(row, col) {
                    continue;
                }
                let index = s.cells.idx(row, col);
                let old_style = s.cells.style_at(index);
                let Some(&new_style) = mapping.get(&old_style) else {
                    continue;
                };
                if !s.cells.write_style(row, col, new_style, dirty_revision) {
                    return false;
                }
            }
        }
        true
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
                FormulaEntry::reference(target, sheet as u32)
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

    /// Insert `count` rows at `at`. Returns `false` and changes nothing when
    /// the sheet is missing or cannot hold the rows.
    #[wasm_bindgen(js_name = addRows)]
    pub fn add_rows(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let rows = data.cells.row_count();
        let cols = data.cells.n_cols();
        let Some(new_rows) = rows.checked_add(count) else {
            return false;
        };
        if count == 0 {
            return true;
        }
        let clamped_at = at.min(rows);
        if !self.begin_structural_edit(sheet, new_rows, cols)
            || !self.finish_cell_edit(sheet, |data, slots| {
                data.insert_rows(sheet as u32, clamped_at, count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_rows(sheet as u32, clamped_at as u32, count as i64);
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Rows,
            clamped_at as u32,
            count as i64,
        );
        true
    }

    /// Remove `count` rows from `at`, as many as the sheet has. Returns
    /// `false` and changes nothing when the sheet is missing or the edit is
    /// refused.
    #[wasm_bindgen(js_name = removeRows)]
    pub fn remove_rows(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let (rows, cols) = (data.cells.row_count(), data.cells.n_cols());
        if count == 0 || at >= rows {
            return true;
        }
        let clamped_count = count.min(rows - at);
        if !self.begin_structural_edit(sheet, rows - clamped_count, cols)
            || !self.finish_cell_edit(sheet, |data, slots| {
                data.delete_rows(sheet as u32, at, clamped_count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_rows(sheet as u32, at as u32, -(clamped_count as i64));
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Rows,
            at as u32,
            -(clamped_count as i64),
        );
        true
    }

    /// Insert `count` columns at `at`. Returns `false` and changes nothing
    /// when the sheet is missing or cannot hold the columns.
    #[wasm_bindgen(js_name = insertCols)]
    pub fn insert_cols(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let (rows, cols) = (data.cells.row_count(), data.cells.n_cols());
        let Some(new_cols) = cols.checked_add(count) else {
            return false;
        };
        if count == 0 {
            return true;
        }
        let clamped_at = at.min(cols);
        if !self.begin_structural_edit(sheet, rows, new_cols)
            || !self.finish_cell_edit(sheet, |data, slots| {
                data.insert_cols(sheet as u32, clamped_at, count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_cols(sheet as u32, clamped_at as u32, count as i64);
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Cols,
            clamped_at as u32,
            count as i64,
        );
        true
    }

    /// Remove `count` columns from `at`, as many as the sheet has. Returns
    /// `false` and changes nothing when the sheet is missing or the edit is
    /// refused.
    #[wasm_bindgen(js_name = removeCols)]
    pub fn remove_cols(&mut self, sheet: usize, at: usize, count: usize) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let (rows, cols) = (data.cells.row_count(), data.cells.n_cols());
        if count == 0 || at >= cols {
            return true;
        }
        let clamped_count = count.min(cols - at);
        if !self.begin_structural_edit(sheet, rows, cols - clamped_count)
            || !self.finish_cell_edit(sheet, |data, slots| {
                data.delete_cols(sheet as u32, at, clamped_count, slots)
            })
        {
            return false;
        }
        self.rewrite_formula_cols(sheet as u32, at as u32, -(clamped_count as i64));
        self.graph.invalidate();
        self.shift_pivots(
            sheet,
            pivot_output::ShiftAxis::Cols,
            at as u32,
            -(clamped_count as i64),
        );
        true
    }

    /// Checks that the sheet can take its new size, then detaches spills and
    /// drops calculated values, which the edit moves. Changes nothing when the
    /// size is over the sheet's limit.
    fn begin_structural_edit(&mut self, sheet: usize, rows: usize, cols: usize) -> bool {
        let data = &mut self.sheets[sheet];
        if data.cells.check_dimensions(rows, cols).is_err() {
            return false;
        }
        data.spill.clear_all(&mut data.cells);
        data.cells.invalidate_derived();
        true
    }

    /// Applies the cell move. When memory runs out the cells and formulas stay
    /// where they were, and every formula of the sheet recalculates, since the
    /// spills it showed were already detached.
    fn finish_cell_edit(
        &mut self,
        sheet: usize,
        edit: impl FnOnce(&mut SheetData, &mut FormulaStore) -> Result<(), String>,
    ) -> bool {
        let data = &mut self.sheets[sheet];
        if edit(data, &mut self.formula_slots).is_err() {
            data.formulas.mark_all_dirty();
            return false;
        }
        true
    }

    /// Single-cell read for interactions/tests — never the render hot path.
    #[wasm_bindgen(js_name = getCell)]
    pub fn get_cell(&self, sheet: usize, row: usize, col: usize) -> CellOut {
        let Some(s) = self.sheets.get(sheet) else {
            return CellOut::empty();
        };
        if !s.cells.contains_cell(row, col) {
            return CellOut::empty();
        }
        if !s.cells.is_loaded(row, col) {
            return CellOut {
                kind: KIND_STRING,
                num: 0.0,
                string: Some(FormulaError::Loading.sentinel().to_owned()),
                style: 0,
            };
        }

        let index = s.cells.idx(row, col);
        let source_kind = s.cells.source_kind_at(index);

        // Separate kind and payload accessors would each walk the chunk directory.
        let (kind, payload) = if source_kind == KIND_EMPTY || source_kind == KIND_FORMULA {
            s.cells
                .calculated_cell_at(index)
                .unwrap_or_else(|| (source_kind, s.cells.source_payload_at(index)))
        } else {
            (source_kind, s.cells.source_payload_at(index))
        };
        let key = cell_key(row, col);

        if source_kind == KIND_FORMULA || kind == KIND_FORMULA {
            if let Some(error) = key.and_then(|cell| formula_error_at(s, cell, &self.formula_slots))
            {
                return CellOut {
                    kind: KIND_STRING,
                    num: 0.0,
                    string: Some(error.sentinel().to_owned()),
                    style: s.cells.style_at(index),
                };
            }
        }

        let has_formula =
            source_kind == KIND_FORMULA && key.is_some_and(|cell| s.formulas.contains(cell));

        // The scalar read contract keeps the formula kind for numeric anchors.
        let output_kind = if source_kind == KIND_FORMULA && (!has_formula || kind == KIND_NUMBER) {
            KIND_FORMULA
        } else {
            kind
        };

        CellOut {
            kind: output_kind,
            num: if has_formula && matches!(kind, KIND_STRING | KIND_EMPTY) {
                0.0
            } else {
                payload_num(payload)
            },
            string: if output_kind == KIND_STRING {
                string_from_pool(&self.strings, payload_str_id(payload))
            } else {
                None
            },
            style: s.cells.style_at(index),
        }
    }

    /// Define `name` in `scope` (a sheet handle, or -1 for the workbook) as
    /// the cells `row_start..=row_end`, `col_start..=col_end` of `sheet`.
    /// It replaces a range or formula of the same name and scope, and the
    /// formulas that use the name are bound again. Rejects a name that is
    /// not formula-safe or that a table has, a removed sheet, and a range
    /// outside the sheet.
    #[wasm_bindgen(js_name = setNamedRange)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn set_named_range(
        &mut self,
        name: &str,
        scope: i32,
        sheet: usize,
        row_start: usize,
        col_start: usize,
        row_end: usize,
        col_end: usize,
    ) -> bool {
        let Some(name_scope) = self.defined_name_scope(name, scope) else {
            return false;
        };
        if self.sheet_alive.get(sheet) != Some(&true)
            || row_start > row_end
            || col_start > col_end
            || row_end >= self.sheets[sheet].cells.row_count()
            || col_end >= self.sheets[sheet].cells.n_cols()
        {
            return false;
        }
        let key = (name_scope, workbook_name_key(name));
        let definition = NamedRangeRef {
            name: name.to_owned(),
            scope: name_scope,
            sheet: sheet as u32,
            row_start: row_start as u32,
            col_start: col_start as u32,
            row_end: row_end as u32,
            col_end: col_end as u32,
        };
        let changed = vec![key.1.clone()];
        self.defined_names
            .insert(key, names::DefinedName::Range(definition));
        self.rebind_name_users(changed);
        self.recompute_all_sheets();
        true
    }

    /// Remove the defined name `name` in `scope` (-1 for the workbook),
    /// whether it refers to a range or holds a formula.
    #[wasm_bindgen(js_name = removeNamedRange)]
    pub fn remove_named_range(&mut self, name: &str, scope: i32) -> bool {
        let key = (u32::try_from(scope).ok(), workbook_name_key(name));
        if self.defined_names.remove(&key).is_none() {
            return false;
        }
        self.rebind_name_users(vec![key.1]);
        self.recompute_all_sheets();
        true
    }

    /// Turns iterative calculation on or off with Excel's limits: at most
    /// `max_iterations` (1 to 32,767) passes over each circular reference,
    /// stopping once no member changes by more than `max_change` (finite, not
    /// negative). Rejects limits outside those ranges. Recalculates every
    /// formula when the setting changes.
    #[wasm_bindgen(js_name = setIterativeCalculation)]
    pub fn set_iterative_calculation(
        &mut self,
        enabled: bool,
        max_iterations: u32,
        max_change: f64,
    ) -> bool {
        let Some(limits) = IterationLimits::new(max_iterations, max_change) else {
            return false;
        };

        let next = enabled.then(|| Box::new(limits));
        if self.iteration == next {
            return true;
        }

        // Which formulas sit on a circular reference is known only to a
        // pass, so every formula recalculates, as in Excel.
        self.iteration = next;
        for sheet in &mut self.sheets {
            sheet.formulas.mark_all_dirty();
        }
        self.recompute_all_sheets();
        true
    }

    /// Add the table `id`, or replace it, over the cells
    /// `row_start..=row_end`, `col_start..=col_end` of `sheet`: one column
    /// per entry of `column_ids`, named by `column_names`, with an optional
    /// header row and totals row. The formulas that use the table, or that
    /// waited for a table of this name, are bound again. Rejects an empty
    /// or over-long id or name, a name that is not formula-safe or that a
    /// defined name or another table has, a removed sheet, a range outside
    /// the sheet or whose width differs from the column count, repeated
    /// column ids or names, and a range that overlaps another table.
    #[wasm_bindgen(js_name = setTable)]
    #[expect(
        clippy::too_many_arguments,
        reason = "wasm-bindgen export: JS passes flat scalars and typed arrays"
    )]
    pub fn set_table(
        &mut self,
        id: &str,
        name: &str,
        sheet: usize,
        row_start: usize,
        col_start: usize,
        row_end: usize,
        col_end: usize,
        header_row: bool,
        totals_row: bool,
        column_ids: Vec<String>,
        column_names: Vec<String>,
    ) -> bool {
        let existing = self.tables.with_id(id).map(|(slot, _)| slot);
        if (existing.is_none() && self.tables.len() >= MAX_TABLES)
            || id.is_empty()
            || id.encode_utf16().count() > MAX_TABLE_ID_BYTES
            || name.is_empty()
            || name.encode_utf16().count() > MAX_TABLE_NAME_BYTES
            || column_ids.is_empty()
            || column_ids.len() > MAX_TABLE_COLUMNS
            || column_ids.len() != column_names.len()
            || self.sheet_alive.get(sheet) != Some(&true)
            || row_start > row_end
            || col_start > col_end
            || row_end >= self.sheets[sheet].cells.row_count()
            || col_end >= self.sheets[sheet].cells.n_cols()
            || col_end - col_start + 1 != column_ids.len()
            || (header_row && totals_row && row_start == row_end)
            || !matches!(parse(name), Ok(crate::calc::Ast::Name(_)))
        {
            return false;
        }
        let name_key = workbook_name_key(name);
        if self
            .defined_names
            .keys()
            .any(|(_, existing_name)| existing_name == &name_key)
        {
            return false;
        }
        if self
            .tables
            .named(name)
            .is_some_and(|(_, table)| table.id != id)
        {
            return false;
        }
        let mut ids = FxHashSet::with_capacity_and_hasher(column_ids.len(), FxBuildHasher);
        let mut names = FxHashSet::with_capacity_and_hasher(column_names.len(), FxBuildHasher);
        let mut columns = Vec::with_capacity(column_ids.len());
        for (column_index, (column_id, column_name)) in
            column_ids.into_iter().zip(column_names).enumerate()
        {
            let column_key = workbook_name_key(&column_name);
            if column_id.is_empty()
                || column_id.encode_utf16().count() > MAX_TABLE_ID_BYTES
                || column_name.is_empty()
                || column_name.encode_utf16().count() > MAX_TABLE_NAME_BYTES
                || column_name.contains(['[', ']', ','])
                || column_name.starts_with(['@', '#'])
                || !ids.insert(workbook_name_key(&column_id))
                || !names.insert(column_key)
            {
                return false;
            }
            columns.push(TableColumn {
                id: column_id,
                name: column_name,
                col: col_start as u32 + column_index as u32,
            });
        }
        let definition = Table {
            id: id.to_owned(),
            name: name.to_owned(),
            sheet: sheet as u32,
            row_start: row_start as u32,
            col_start: col_start as u32,
            row_end: row_end as u32,
            col_end: col_end as u32,
            header_row,
            totals_row,
            columns,
        };
        if self.tables.iter().any(|(_, other)| {
            other.id != id
                && other.sheet == definition.sheet
                && definition.row_start <= other.row_end
                && definition.row_end >= other.row_start
                && definition.col_start <= other.col_end
                && definition.col_end >= other.col_start
        }) {
            return false;
        }
        let (slot, previous) = match existing {
            Some(slot) => (slot, self.tables.replace(slot, definition)),
            None => (self.tables.insert(definition), None),
        };
        self.after_table_edit(slot, previous.as_ref());
        #[cfg(feature = "analysis")]
        self.invalidate_table_pivots();
        self.recompute_all_sheets();
        true
    }

    /// Remove the table `id`. Its references in formulas become `#REF!`.
    /// Returns whether the table existed.
    #[wasm_bindgen(js_name = removeTable)]
    pub fn remove_table(&mut self, id: &str) -> bool {
        let Some(slot) = self.tables.with_id(id).map(|(slot, _)| slot) else {
            return false;
        };
        let removed = self.tables.remove(slot);
        self.after_table_edit(slot, removed.as_ref());
        #[cfg(feature = "analysis")]
        self.invalidate_table_pivots();
        self.recompute_all_sheets();
        true
    }

    /// Explicit volatile barrier. `serial` is a UTC spreadsheet serial using
    /// the 1899-12-30 epoch; only volatile formulas (TODAY, NOW, RAND,
    /// RANDBETWEEN, OFFSET, INDIRECT) and their dependents recalculate, and TODAY and NOW use
    /// `serial` instead of the clock. Later recalculations read the clock.
    #[wasm_bindgen(js_name = recomputeVolatile)]
    pub fn recompute_volatile(&mut self, serial: f64) -> bool {
        if !serial.is_finite() {
            return false;
        }
        self.reset_recalculation();
        self.volatile_serial = serial;
        self.recompute_volatile_formulas();
        true
    }

    /// Parse and store a formula at `(row, col)`.
    ///
    /// Setters only mark cells dirty; they do not recompute formulas. The host
    /// calls `recompute(sheet)` once at the transaction barrier so a multi-cell
    /// edit performs one dependency-scoped pass instead of one full-sheet pass
    /// per setter. A successful parse returns the pre-write cached scalar; a
    /// parse rejection returns `0.0`, and a rejected write returns `NaN`.
    ///
    /// The dependency index is invalidated only when the rewrite changes what
    /// the formula reads or whether it produces an array. A constant-only edit
    /// keeps the cached index, so its next recompute visits just the edited
    /// formula and its dependents instead of every formula in the workbook.
    #[wasm_bindgen(js_name = setFormula)]
    pub fn set_formula(
        &mut self,
        sheet: usize,
        row: usize,
        col: usize,
        src: &str,
        style: u32,
    ) -> f64 {
        let Some(key) = cell_key(row, col) else {
            return f64::NAN;
        };
        let dirty_revision = self.local_dirty_revision();
        let Some(s) = self.sheets.get(sheet) else {
            return f64::NAN;
        };
        if !s.cells.contains_cell(row, col)
            || (dirty_revision.is_some() && !s.cells.can_dirty_cell(row, col))
        {
            return f64::NAN;
        }

        let entry = self.parse_formula_entry(src, sheet as u32, key.0, key.1);
        let carried = if entry.source_error().is_some() {
            0.0
        } else {
            let sheet_data = &self.sheets[sheet];
            sheet_data.cells.num_at(sheet_data.cells.idx(row, col))
        };
        if self.replace_cell_source(CellSourceWrite {
            sheet,
            row,
            col,
            kind: KIND_FORMULA,
            payload: 0,
            style,
            source: Some(entry),
            revision: dirty_revision,
            hydrating: false,
        }) {
            carried
        } else {
            f64::NAN
        }
    }

    /// The formula of the cell at `row`, `col` of `sheet` as written, with its
    /// leading `=`; `None` when the cell holds no formula.
    #[wasm_bindgen(js_name = formulaSource)]
    pub fn formula_source(&self, sheet: usize, row: usize, col: usize) -> Option<String> {
        let key = cell_key(row, col)?;
        let entry = self
            .sheets
            .get(sheet)?
            .formulas
            .get(key, &self.formula_slots)?;
        entry
            .is_formula()
            .then(|| entry.source(&self.written_names()).into_owned())
    }

    /// `[sheet, row, col]` of the cell that the formula at `row`, `col` of
    /// `sheet` refers to, when the formula is only a reference to one cell;
    /// `None` otherwise.
    #[wasm_bindgen(js_name = referenceTarget)]
    pub fn reference_target(&self, sheet: usize, row: usize, col: usize) -> Option<Vec<u32>> {
        let key = cell_key(row, col)?;
        let target = self
            .sheets
            .get(sheet)?
            .formulas
            .get(key, &self.formula_slots)?
            .reference_target(sheet as u32)?;
        Some(vec![target.sheet, target.row, target.col])
    }

    /// Replace the host-owned merge/protection collision ranges. Packed as
    /// `[row_start, col_start, row_end, col_end, ...]`; invalid input fails
    /// without weakening the old gate.
    #[wasm_bindgen(js_name = setSpillBlockers)]
    pub fn set_spill_blockers(&mut self, sheet: usize, bounds: &[u32]) -> bool {
        if !bounds.len().is_multiple_of(4) || bounds.len() / 4 > 100_000 {
            return false;
        }
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };
        let mut blockers = Vec::with_capacity(bounds.len() / 4);
        for range in bounds.as_chunks::<4>().0 {
            if range[0] > range[2]
                || range[1] > range[3]
                || !data
                    .cells
                    .contains_cell(range[2] as usize, range[3] as usize)
            {
                return false;
            }
            blockers.push(SpillBlocker {
                row_start: range[0],
                col_start: range[1],
                row_end: range[2],
                col_end: range[3],
            });
        }
        let data = &mut self.sheets[sheet];
        if data.spill.set_blockers(blockers) {
            data.formulas.mark_all_dirty();
        }
        true
    }

    /// Stable spill owner coordinate, or `u32::MAX` when `cell` is not part of
    /// a materialized spill.
    #[wasm_bindgen(js_name = spillAnchorRow)]
    pub fn spill_anchor_row(&self, sheet: usize, row: usize, col: usize) -> u32 {
        cell_key(row, col)
            .and_then(|cell| self.sheets.get(sheet)?.spill.owner(cell))
            .map_or(u32::MAX, |anchor| anchor.0)
    }

    /// Stable spill owner column, or `u32::MAX` when the cell is not part of
    /// a materialized spill; the row comes from `spillAnchorRow`.
    #[wasm_bindgen(js_name = spillAnchorCol)]
    pub fn spill_anchor_col(&self, sheet: usize, row: usize, col: usize) -> u32 {
        cell_key(row, col)
            .and_then(|cell| self.sheets.get(sheet)?.spill.owner(cell))
            .map_or(u32::MAX, |anchor| anchor.1)
    }

    /// Row-major mask aligned with render-window layout; `1` marks a derived
    /// spill cell and deliberately excludes the anchor.
    #[wasm_bindgen(js_name = spillDerivedMask)]
    pub fn spill_derived_mask(
        &self,
        sheet: usize,
        row_start: usize,
        row_end: usize,
        cols: &[u32],
    ) -> Vec<u8> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let clamped_row_start = row_start.min(data.cells.row_count());
        let clamped_row_end = row_end.min(data.cells.row_count());
        let Some(len) = clamped_row_end
            .saturating_sub(clamped_row_start)
            .checked_mul(cols.len())
        else {
            return Vec::new();
        };
        let mut mask = vec![0; len];
        for (col_index, &col) in cols.iter().enumerate() {
            if col as usize >= data.cells.n_cols() {
                continue;
            }
            for row_index in 0..clamped_row_end.saturating_sub(clamped_row_start) {
                let cell = ((clamped_row_start + row_index) as u32, col);
                if data.spill.owner(cell).is_some_and(|anchor| anchor != cell) {
                    mask[row_index * cols.len() + col_index] = 1;
                }
            }
        }
        mask
    }

    /// The pool strings for `ids`, in order; an empty string for `NO_STRING`
    /// or an id the pool no longer holds.
    #[wasm_bindgen(js_name = poolStrings)]
    pub fn pool_strings(&self, ids: &[u32]) -> Vec<String> {
        ids.iter()
            .map(|&id| {
                if id == NO_STRING {
                    String::new()
                } else {
                    self.strings.get(id).map(str::to_owned).unwrap_or_default()
                }
            })
            .collect()
    }

    /// Recompute formulas affected by cells changed since the last call.
    ///
    /// The pass first grows the dirty cell set through formula read-sets to find
    /// all dependent formulas. It then evaluates only those formulas, using a
    /// per-pass memo table to reuse formula results across dependent reads.
    #[wasm_bindgen(js_name = recompute)]
    pub fn recompute(&mut self, sheet: usize) {
        if self.active_mutation_revision.is_none() {
            self.reset_recalculation();
        }
        self.recompute_sheet(sheet);
    }

    /// Commit staged user or host sources. Admission metadata must be staged
    /// before this barrier; derived values and string roots are complete on return.
    /// Beginning a page load suppresses local dirty tracking until this commit.
    ///
    /// Returns [`Self::recalculated_rect_count`] for the commit, so a chart
    /// tracker learns whether there is a report without another call.
    #[wasm_bindgen(js_name = commitSources)]
    pub fn commit_sources(&mut self) -> i32 {
        let was_page_load = self.loading_page > 0;
        self.loading_page = self.loading_page.saturating_sub(1);

        self.recompute_changed();
        self.active_mutation_revision = None;

        if !was_page_load {
            self.maybe_collect_strings();
        }
        self.recalculated_rect_count()
    }

    /// Whether a source rectangle can replace its spill cells without cutting
    /// an installed spill away from its anchor. No owner window crosses WASM.
    #[wasm_bindgen(js_name = admitSourceRange)]
    pub fn admit_source_range(
        &self,
        sheet: usize,
        r0: usize,
        c0: usize,
        r1: usize,
        c1: usize,
    ) -> bool {
        let Some(data) = self.sheets.get(sheet) else {
            return false;
        };

        if r0 > r1 || c0 > c1 || !data.cells.contains_cell(r1, c1) {
            return false;
        }

        data.spill.admits_source_range(r0, c0, r1, c1)
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

        let mut source_kinds = vec![0u8; cell_count];
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
            prepared.insert(key, FormulaEntry::reference(target, sheet as u32));
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

        let mut string_ids = vec![NO_STRING; cell_count];
        let mut text_bounds = text_offsets.windows(2);
        for (offset, &kind) in kinds.iter().enumerate() {
            if kind != KIND_STRING {
                continue;
            }
            // Bounds were validated above: ascending, on char boundaries, one per string cell.
            let Some(&[start, end]) = text_bounds.next() else {
                return BLOCK_SOURCE_INVALID;
            };
            if source_kinds[offset] != 0 {
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
                if source_kinds[offset] != 0 {
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

    /// Packed writes and history restores share source replacement so a local
    /// native undo has the same result as its serialized replay on another peer.
    /// Readers supply source kinds directly, avoiding a second per-cell source
    /// test after the packed reader has already selected formula or literal.
    /// Choose the literal-only loop once per range; a numeric/text import must
    /// not test the source map for every cell.
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
        // A literal-only dense block needs no per-cell source decision: write
        // storage column by column, then retire any formulas the block covered.
        // Dense sheets are capped below u32 coordinates, so keys always exist.
        if !HAS_SOURCES {
            let sheet_data = &mut self.sheets[sheet];
            if sheet_data.cells.write_dense_block(start, dimensions, &cell) {
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

    /// Loaded row runs of one column inside `start_row..end_row`, as flat
    /// `[start, end)` pairs in ascending, disjoint order.
    ///
    /// A row belongs to a run only when [`Self::columns_fully_loaded`] would
    /// report it loaded, so a caller can reconcile a whole column with one call
    /// instead of probing the band row by row. Rows outside the sheet and empty
    /// requests produce no pairs.
    #[wasm_bindgen(js_name = loadedSpans)]
    pub fn loaded_spans(
        &self,
        sheet: usize,
        start_row: usize,
        end_row: usize,
        col: u32,
    ) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        let col_index = col as usize;
        if start_row >= end_row || !data.cells.contains_cell(start_row, col_index) {
            return Vec::new();
        }
        let clamped_end_row = end_row.min(data.cells.row_count());
        let mut spans = Vec::new();
        let mut run_start: Option<usize> = None;
        for row in start_row..clamped_end_row {
            if data.cells.is_loaded(row, col_index) {
                run_start = run_start.or(Some(row));
            } else if let Some(start) = run_start.take() {
                spans.push(start as u32);
                spans.push(row as u32);
            }
        }
        if let Some(start) = run_start {
            spans.push(start as u32);
            spans.push(clamped_end_row as u32);
        }
        spans
    }

    /// Resolved values of a sparse coordinate list in one batched read.
    ///
    /// `rows` and `cols` are absolute coordinates and must have the same length;
    /// otherwise the result carries no cells. Every entry reads exactly like
    /// [`Self::get_cell`], so a batched capture reports the values a per-cell
    /// read would.
    #[wasm_bindgen(js_name = cellSnapshots)]
    pub fn cell_snapshots(&self, sheet: usize, rows: &[u32], cols: &[u32]) -> Option<CellSnapshot> {
        if rows.len() != cols.len() {
            return None;
        }
        let mut kinds = Vec::with_capacity(rows.len());
        let mut numbers = Vec::with_capacity(rows.len());
        let mut styles = Vec::with_capacity(rows.len());
        let mut text_index = Vec::with_capacity(rows.len());
        let mut strings: Vec<String> = Vec::new();
        for (&row, &col) in rows.iter().zip(cols.iter()) {
            let cell = self.get_cell(sheet, row as usize, col as usize);
            kinds.push(cell.kind);
            numbers.push(cell.num);
            styles.push(cell.style);
            match cell.string {
                Some(text) => {
                    strings.push(text);
                    text_index.push(strings.len() as i32 - 1);
                }
                None => text_index.push(-1),
            }
        }
        Some(CellSnapshot {
            kinds,
            numbers,
            styles,
            text_index,
            strings,
        })
    }
}

impl Default for CellStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Marks a validated bulk source rectangle once and detaches intersecting
/// spills in one pass, so the per-cell loop that follows writes storage only.
/// Paged callers reserve the rectangle's dirty overlay before calling.
fn prepare_rect_write(sheet: &mut SheetData, rect: DirtyRect) {
    sheet.formulas.mark_dirty_rect(rect);

    if !sheet.spill.is_empty() {
        let detached = sheet.spill.detach_rect(rect, &mut sheet.cells);
        sheet.formulas.mark_cells_dirty(detached);
    }
}

/// One destination cell plus the source that replaces whatever it held.
///
/// Every writer — scalar, sparse and packed — builds this and hands it to
/// [`CellStore::replace_cell_source`], so kind, payload, source, dirty marking
/// and the dependency epoch are decided in one place.
struct CellSourceWrite {
    sheet: usize,
    row: usize,
    col: usize,
    kind: u8,
    payload: u64,
    style: u32,
    /// `Some` installs the entry, `None` removes any formula at the cell.
    source: Option<FormulaEntry>,
    revision: Option<u64>,
    /// Page-load writes hydrate stored cells instead of editing user data.
    hydrating: bool,
}
impl CellStore {
    /// Translate coordinates at evaluator boundaries; pass work keeps ids.
    #[inline]
    pub(crate) fn formula_id(&self, key: AbsCellKey) -> Option<FormulaId> {
        self.sheets
            .get(key.sheet as usize)?
            .formulas
            .id(key.local())
    }

    pub(crate) fn maybe_collect_strings(&mut self) {
        if self.active_mutation_revision.is_none()
            && self.loading_page == 0
            && self.strings.retained_bytes() >= self.strings.next_collection_bytes
        {
            self.collect_strings(false);
        }
    }

    fn collect_strings(&mut self, force: bool) {
        let mut marks = Vec::new();
        if marks.try_reserve_exact(self.strings.len()).is_err() {
            self.strings.postpone_collection();
            return;
        }
        marks.resize(self.strings.len(), false);
        for sheet in &self.sheets {
            sheet.cells.visit_string_ids(|id| marks[id as usize] = true);
        }
        if let Some((replacement, remap)) = self.strings.collection(&marks, force) {
            for sheet in &mut self.sheets {
                sheet.cells.remap_string_ids(&remap);
            }
            self.strings = replacement;
        } else {
            self.strings.postpone_collection();
        }
    }

    /// Store one cell write and take the source-replacement decision: replace
    /// the formula source, mark the destination dirty, and bump the dependency
    /// epoch only when the replacement reads a different dependency graph.
    /// Rejected writes leave sources and the epoch untouched.
    fn replace_cell_source(&mut self, write: CellSourceWrite) -> bool {
        self.replace_cell_source_inner(write, false)
    }

    /// Writes a validated, spill-free dense literal block column by column.
    /// Formula retirement and dirty seeds still describe only listed cells.
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
            sheet_data.cells.write_dense_column_cells(
                block.start.1 + col,
                column.iter().map(|&index| block.cell(index as usize)),
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
            for key in keys() {
                self.graph.replace_entry(
                    &mut sheet_data.formulas,
                    &mut self.formula_slots,
                    sheet,
                    key,
                    None,
                );
            }
        }
        if hydrating {
            sheet_data.formulas.mark_all_dirty();
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

    fn replace_prepared_cell_source(&mut self, write: CellSourceWrite) -> bool {
        self.replace_cell_source_inner(write, true)
    }

    fn replace_cell_source_inner(&mut self, write: CellSourceWrite, prepared_rect: bool) -> bool {
        let CellSourceWrite {
            sheet,
            row,
            col,
            kind,
            payload,
            style,
            source,
            revision,
            hydrating,
        } = write;
        let Some(key) = cell_key(row, col) else {
            return false;
        };
        let Some(sheet_data) = self.sheets.get_mut(sheet) else {
            return false;
        };
        if !sheet_data.cells.contains_cell(row, col) {
            return false;
        }

        if source.is_some()
            && !self.formula_slots.can_allocate()
            && !sheet_data.formulas.contains(key)
        {
            return false;
        }

        let written = if hydrating {
            sheet_data.hydrate_cell(row, col, kind, payload, style)
        } else if prepared_rect {
            sheet_data
                .cells
                .write_cell(row, col, kind, payload, style, revision)
        } else {
            sheet_data.write_cell(row, col, kind, payload, style, revision)
        };
        if !written {
            return false;
        }
        self.graph.replace_entry(
            &mut sheet_data.formulas,
            &mut self.formula_slots,
            sheet,
            key,
            source,
        );
        if hydrating {
            sheet_data.formulas.mark_all_dirty();
        } else if !prepared_rect {
            sheet_data.formulas.mark_cell_dirty(key);
        }
        true
    }

    fn store_memory_stats(&self) -> StoreMemoryStats {
        let mut stats = StoreMemoryStats::default();
        for sheet in &self.sheets {
            sheet.add_memory_stats(&mut stats);
        }

        let (utf8, spans) = self.strings.memory_stats();
        stats.owner_mut(STRING_POOL_UTF8).add(utf8);
        stats.owner_mut(STRING_POOL_SPANS).add(spans);

        stats
            .owner_mut(STRING_INDEX)
            .add(self.strings.index_memory_stats());
        self.formula_slots.add_memory_stats(&mut stats);
        if let Some(changes) = &self.recalculation {
            let (used, retained) = changes.bytes();
            stats
                .owner_mut(crate::memory::FORMULAS)
                .add_payload(used, retained);
        }
        if let Some(results) = &self.formula_results {
            let bytes = size_of::<FormulaResults>();
            stats
                .owner_mut(crate::memory::FORMULAS)
                .add_payload(bytes, bytes);
            results.add_memory_stats(&mut stats);
        }
        #[cfg(feature = "analysis")]
        if let Some(patterns) = self.regex_patterns.take() {
            patterns.add_memory_stats(stats.owner_mut(crate::memory::FORMULAS));
            self.regex_patterns.set(Some(patterns));
        }

        self.graph.add_memory_stats(&mut stats);
        self.conditional_rules.add_memory_stats(&mut stats);
        if let Some(pivots) = &self.pivots {
            let bytes = pivots.retained_bytes();
            stats
                .owner_mut(SHEET_INDEXES_METADATA)
                .add_payload(bytes, bytes);
        }

        let metadata = stats.owner_mut(SHEET_INDEXES_METADATA);
        metadata.add_payload(std::mem::size_of::<Self>(), std::mem::size_of::<Self>());
        if self.iteration.is_some() {
            metadata.add_payload(size_of::<IterationLimits>(), size_of::<IterationLimits>());
        }
        metadata.add_vec::<SheetData>(self.sheets.len(), self.sheets.capacity());
        metadata.add_vec::<String>(self.sheet_names.len(), self.sheet_names.capacity());
        for name in &self.sheet_names {
            metadata.add_payload(name.len(), name.capacity());
        }
        metadata.add_vec::<bool>(self.sheet_alive.len(), self.sheet_alive.capacity());
        if let Some(order) = &self.sheet_order {
            metadata.add_payload(size_of::<Vec<u32>>(), size_of::<Vec<u32>>());
            metadata.add_vec::<u32>(order.len(), order.capacity());
        }
        metadata.add_hash_table::<String, usize>(self.sheet_ids.len(), self.sheet_ids.capacity());
        for id in self.sheet_ids.keys() {
            metadata.add_payload(id.len(), id.capacity());
        }
        metadata
            .add_hash_table::<String, usize>(self.sheet_lookup.len(), self.sheet_lookup.capacity());
        for name in self.sheet_lookup.keys() {
            metadata.add_payload(name.len(), name.capacity());
        }
        self.add_defined_name_memory(metadata);
        stats
    }

    #[cfg(test)]
    pub(crate) fn set_spill_owner_limit_for_test(&mut self, cells: usize) {
        self.spill_owner_cell_limit = cells.min(MAX_SPILL_OWNER_CELLS);
    }

    pub(crate) fn try_add_sheet(
        &mut self,
        n_cols: usize,
        row_count: usize,
    ) -> Result<usize, String> {
        let sheet = SheetData::try_new(n_cols, row_count)?;
        let index = self.sheets.len();
        self.sheets.push(sheet);
        self.sheet_names.push(String::new());
        self.sheet_alive.push(true);
        if let Some(order) = &mut self.sheet_order {
            order.push(index as u32);
        }
        Ok(index)
    }

    pub(crate) fn intern(&mut self, s: &str) -> u32 {
        self.strings.intern(s)
    }

    fn rewrite_formula_rows(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            if formula_sheet as u32 != edited_sheet {
                sheet
                    .formulas
                    .rewrite_entries(&mut self.formula_slots, |entry| {
                        entry.shift_rows(at, delta, formula_sheet as u32, edited_sheet);
                    });
            }
            sheet.formulas.mark_all_dirty();
        }
        self.drop_invalid_references();
        self.rebase_table_rows(edited_sheet, at, delta);
        let mut changed = Vec::new();
        self.rebase_named_ranges(edited_sheet, (at, delta), false, &mut changed);
        self.shift_named_formulas(edited_sheet, (at, delta), false, &mut changed);
        self.rebind_name_users(changed);
    }

    fn rewrite_formula_cols(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            if formula_sheet as u32 != edited_sheet {
                sheet
                    .formulas
                    .rewrite_entries(&mut self.formula_slots, |entry| {
                        entry.shift_cols(at, delta, formula_sheet as u32, edited_sheet);
                    });
            }
            sheet.formulas.mark_all_dirty();
        }
        self.drop_invalid_references();
        self.rebase_table_cols(edited_sheet, at, delta);
        let mut changed = Vec::new();
        self.rebase_named_ranges(edited_sheet, (at, delta), true, &mut changed);
        self.shift_named_formulas(edited_sheet, (at, delta), true, &mut changed);
        self.rebind_name_users(changed);
    }

    /// Follow `block` (`from`, `count`, `to`) rows or, with `columns`,
    /// columns of `edited_sheet` that move, in every formula, defined name
    /// and table of the workbook. The cells themselves move afterwards.
    pub(crate) fn move_references(
        &mut self,
        edited_sheet: u32,
        columns: bool,
        block: (u32, u32, u32),
    ) {
        for (formula_sheet, sheet) in self.sheets.iter_mut().enumerate() {
            sheet
                .formulas
                .rewrite_entries(&mut self.formula_slots, |entry| {
                    entry.move_axis(edited_sheet, formula_sheet as u32, columns, block);
                });
            sheet.formulas.mark_all_dirty();
        }

        let (from, count, to) = block;
        for (_, table) in self
            .tables
            .iter_mut()
            .filter(|(_, table)| table.sheet == edited_sheet)
        {
            let span = if columns {
                (&mut table.col_start, &mut table.col_end)
            } else {
                (&mut table.row_start, &mut table.row_end)
            };
            if let Some(moved) = moved_span(*span.0, *span.1, from, count, to) {
                (*span.0, *span.1) = moved;
            }
            // Core refuses a move that splits a table, so the moved columns
            // fill the table's span again; each takes its new place.
            if columns {
                let mut placed: Vec<Option<TableColumn>> =
                    table.columns.iter().map(|_| None).collect();
                for mut column in std::mem::take(&mut table.columns) {
                    column.col = moved_index(column.col, from, count, to);
                    let slot = column.col.saturating_sub(table.col_start) as usize;
                    if let Some(empty) = placed.get_mut(slot) {
                        *empty = Some(column);
                    }
                }
                table.columns = placed.into_iter().flatten().collect();
            }
        }

        // Saved pivot output and pivot sources move as a delete where the
        // block was and an insert where it lands; core sends the moved
        // definitions again.
        let axis = if columns {
            pivot_output::ShiftAxis::Cols
        } else {
            pivot_output::ShiftAxis::Rows
        };
        self.shift_pivots(edited_sheet as usize, axis, from, -i64::from(count));
        self.shift_pivots(edited_sheet as usize, axis, to, i64::from(count));

        let mut changed = Vec::new();
        self.move_named_references(edited_sheet, columns, block, &mut changed);
        self.rebind_name_users(changed);
        self.graph.invalidate();
    }

    fn drop_invalid_references(&mut self) {
        for (sheet_index, sheet) in self.sheets.iter_mut().enumerate() {
            let invalid: Vec<_> = sheet
                .formulas
                .iter(&self.formula_slots)
                .filter_map(|(key, entry)| {
                    (entry.is_reference() && entry.reference_target(sheet_index as u32).is_none())
                        .then_some(key)
                })
                .collect();
            for key in invalid {
                sheet.formulas.remove(key, &mut self.formula_slots);
                let (row, col) = (key.0 as usize, key.1 as usize);
                if sheet.cells.contains_cell(row, col) {
                    let style = sheet.cells.style_at(sheet.cells.idx(row, col));
                    let _ = sheet.write_cell(row, col, KIND_EMPTY, 0, style, None);
                }
            }
        }
    }
}

/// Makes the new entry of the formula in the cell it is given after a table
/// edit, reading the tables as they are now; `None` leaves it unchanged.
type TableRebind<'a> =
    dyn Fn(&mut FormulaEntry, AbsCellKey, &TableSlots) -> Option<FormulaEntry> + 'a;

/// Whether an edit of a table from `previous` to `table` only added rows
/// around its data, keeping its sheet, columns, names, header and totals:
/// the rows a `[@Column]` reads are still in the table, so only the
/// formulas that read whole sections need new cells.
fn rows_only_grew(previous: &Table, table: &Table) -> bool {
    let same_columns = previous.columns.len() == table.columns.len()
        && previous
            .columns
            .iter()
            .zip(&table.columns)
            .all(|(before, after)| {
                before.id == after.id && before.name == after.name && before.col == after.col
            });
    same_columns
        && previous.name == table.name
        && previous.sheet == table.sheet
        && previous.header_row == table.header_row
        && previous.totals_row == table.totals_row
        && table.row_start <= previous.row_start
        && table.row_end >= previous.row_end
}

impl CellStore {
    /// The scope of a new defined name `name`: `None` for the workbook (a
    /// negative `scope`), else the live sheet handle. `None` overall when
    /// the name is not formula-safe, a table has it, or the sheet is gone.
    fn defined_name_scope(&self, name: &str, scope: i32) -> Option<Option<u32>> {
        if name.is_empty()
            || !matches!(parse(name), Ok(Ast::Name(_)))
            || self.tables.named(name).is_some()
        {
            return None;
        }
        let Ok(sheet_scope) = u32::try_from(scope) else {
            return Some(None);
        };
        self.sheet_alive
            .get(sheet_scope as usize)
            .copied()
            .unwrap_or_default()
            .then_some(Some(sheet_scope))
    }

    pub(super) fn resolve_structured_reference(
        &self,
        reference: &UnresolvedStructuredRef,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> Option<StructuredRef> {
        self.tables.bind(
            reference.written(),
            AbsCellKey {
                sheet: formula_sheet,
                row: formula_row,
                col: formula_col,
            },
        )
    }

    /// Follow an edit of the table in `slot`, which held `replaced` (`None`
    /// for a new table): refresh the cells of the formulas that use it, by
    /// stable column id, and bind the formulas whose table reference waited
    /// for a table. Only those formulas change; their reads are patched in
    /// the dependency index and they recalculate. A defined name's formula
    /// uses tables through expansions the index does not list, so the users
    /// of such names are bound again too.
    fn after_table_edit(&mut self, slot: u16, replaced: Option<&Table>) {
        if let Some(previous) = replaced {
            let own_rows = !self
                .tables
                .get(slot)
                .is_some_and(|table| rows_only_grew(previous, table));
            let users = self.formula_slots.table_users(slot, own_rows);
            self.rebind_table_users(users, &|entry, location, tables| {
                let refresh = |reference: &StructuredRef| {
                    let table = tables.get(slot)?;
                    let column_id = &previous.column_at(reference.col)?.id;
                    let column = table
                        .columns
                        .iter()
                        .find(|column| column.id == *column_id)?;
                    let refreshed =
                        table.reference(slot, column, reference.section, reference.row_start)?;
                    Some(StructuredRef {
                        qualified: reference.qualified,
                        ..refreshed
                    })
                };
                entry.refresh_table(slot, location.sheet, &refresh)
            });
        }
        // The formulas holding a table reference that no table bound may
        // bind now. Their text stays as typed.
        let waiting = self.formula_slots.unbound_table_users();
        self.rebind_table_users(waiting, &|entry, location, tables| {
            entry.bind_tables(location, tables)
        });
        let mut changed = Vec::new();
        self.add_names_over_tables(&mut changed);
        self.rebind_name_users(changed);
    }

    /// Give each of `formulas` the entry `rebind` makes of it, if any: the
    /// dependency index patches its reads and the formula recalculates.
    /// Out of line, so the two table passes share one copy of the loop.
    #[inline(never)]
    fn rebind_table_users(&mut self, formulas: Vec<FormulaId>, rebind: &TableRebind<'_>) {
        for formula in formulas {
            let Some(location) = self.formula_slots.location(formula) else {
                continue;
            };
            let tables = &self.tables;
            if let Some(entry) = self
                .formula_slots
                .get_mut(formula)
                .and_then(|entry| rebind(entry, location, tables))
            {
                self.replace_bound_formula(location, entry);
            }
        }
    }

    /// Store `entry` again for the formula at `location`, whose tree a
    /// binding changed: the dependency index patches its reads and the
    /// formula recalculates.
    fn replace_bound_formula(&mut self, location: AbsCellKey, entry: FormulaEntry) {
        let sheet = location.sheet as usize;
        let data = &mut self.sheets[sheet];
        self.graph.replace_entry(
            &mut data.formulas,
            &mut self.formula_slots,
            sheet,
            location.local(),
            Some(entry),
        );
        data.formulas.mark_cell_dirty(location.local());
    }

    pub(crate) fn parse_formula_entry(
        &self,
        source: &str,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> FormulaEntry {
        match self.resolve_formula_ast(source, formula_sheet, formula_row, formula_col) {
            Ok((ast, features)) => {
                FormulaEntry::parsed_source(ast, formula_sheet, source.to_owned(), features)
            }
            Err(error) => FormulaEntry::error(source, error),
        }
    }

    /// Parses a formula as [`Self::resolve_unbound_formula`] does, then binds
    /// its literal REGEX patterns to the patterns the store's formulas share.
    /// The features tell whether a sheet reference stayed detached and
    /// whether the formula has a table reference.
    fn resolve_formula_ast(
        &self,
        source: &str,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> Result<ResolvedFormula, FormulaError> {
        let (ast, features) =
            self.resolve_unbound_formula(source, formula_sheet, formula_row, formula_col)?;
        #[cfg(feature = "analysis")]
        let resolved = self.bind_regex_patterns(source, ast);
        #[cfg(not(feature = "analysis"))]
        let resolved = ast;
        Ok((resolved, features))
    }

    /// A formula resolved as [`Self::resolve_formula_ast`] does, without
    /// touching the store's shared REGEX patterns, for a result preview.
    pub(crate) fn resolve_preview_ast(
        &self,
        source: &str,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> Result<Ast, FormulaError> {
        self.resolve_unbound_formula(source, formula_sheet, formula_row, formula_col)
            .map(|(ast, _)| ast)
    }

    /// Parses a formula, binding its sheet and table references as it goes,
    /// then resolves its defined names when the parse found a name and
    /// numbers its LAMBDA parameters when it found a LAMBDA, so a formula of
    /// plain cells is parsed in one pass.
    fn resolve_unbound_formula(
        &self,
        source: &str,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> Result<ResolvedFormula, FormulaError> {
        let at = AbsCellKey {
            sheet: formula_sheet,
            row: formula_row,
            col: formula_col,
        };
        let (mut ast, features) = parse_bound_with_features(
            source,
            &|name| self.sheet_handle(name),
            &|span| place_span(span, &self.tab_order()),
            &|written| self.tables.bind(written, at),
        )
        .map_err(|_| FormulaError::Value)?;

        if features.names {
            let placement = names::NamePlacement::new(formula_row, formula_col);
            ast = self.resolve_defined_names(ast, formula_sheet, &placement);
        }

        // A LAMBDA reads its parameters from the call frame. Numbering them
        // before the formula is stored or previewed lets its shape checks see
        // which ones a call binds to arrays.
        #[cfg(feature = "analysis")]
        if features.lambdas {
            crate::eval::analysis::lambda::resolve_parameters(&mut ast);
        }
        Ok((ast, features))
    }

    /// Resolves a parsed formula as if it were in the cell at
    /// (`formula_row`, `formula_col`) of `formula_sheet`: sheet names, defined
    /// names, then structured references. Measures resolve their inlined
    /// expression this way.
    #[cfg(feature = "analysis")]
    pub(crate) fn resolve_parsed_formula(
        &self,
        ast: Ast,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> Result<Ast, FormulaError> {
        let with_sheets = self.resolve_sheets(ast)?;
        let placement = names::NamePlacement::new(formula_row, formula_col);
        let mut with_names = self.resolve_defined_names(with_sheets, formula_sheet, &placement);
        self.resolve_table_refs(&mut with_names, formula_sheet, formula_row, formula_col);
        Ok(with_names)
    }

    /// Resolves the table references of a formula in the cell at
    /// (`formula_row`, `formula_col`) of `formula_sheet`.
    #[cfg(feature = "analysis")]
    fn resolve_table_refs(
        &self,
        ast: &mut Ast,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) {
        crate::calc::resolve_structured_refs(
            ast,
            formula_sheet,
            formula_row,
            formula_col,
            &|reference, sheet, row, col| {
                self.resolve_structured_reference(reference, sheet, row, col)
            },
        );
    }

    /// Points the literal REGEX patterns of a new formula at the patterns the
    /// store's formulas share, so formulas with one pattern compile it once.
    #[cfg(feature = "analysis")]
    fn bind_regex_patterns(&self, source: &str, mut ast: Ast) -> Ast {
        if crate::eval::regex_patterns::may_call_regex(source) {
            let mut patterns = self.regex_patterns.take().unwrap_or_default();
            patterns.bind(&mut ast);
            self.regex_patterns.set(Some(patterns));
        }
        ast
    }

    /// Naming a sheet visits only formulas whose retained tree names it.
    /// Stable ids keep this index correct when formulas move between cells.
    fn bind_pending_sheet_formulas(&mut self, id: &str, name: &str) -> Vec<usize> {
        let keys = [sheet_name_key(name), sheet_name_key(id)];
        let users = self.formula_slots.unresolved_sheet_users(&keys);
        if users.is_empty() {
            return Vec::new();
        }
        let order = self.tab_order().into_owned();
        let mut affected = Vec::new();
        for formula in users {
            let Some(location) = self.formula_slots.location(formula) else {
                continue;
            };
            let sheet = location.sheet as usize;
            let replacement = {
                let Some(entry) = self.formula_slots.get_mut(formula) else {
                    continue;
                };
                let ids = &self.sheet_ids;
                let lookup = &self.sheet_lookup;
                entry.bind_sheets(
                    location.sheet,
                    &|name| {
                        ids.get(name)
                            .or_else(|| lookup.get(&sheet_name_key(name)))
                            .map(|&handle| handle as u32)
                    },
                    &|span| place_span(span, &order),
                )
            };
            let Some(entry) = replacement else {
                continue;
            };
            let data = &mut self.sheets[sheet];
            self.graph.replace_entry(
                &mut data.formulas,
                &mut self.formula_slots,
                sheet,
                location.local(),
                Some(entry),
            );
            data.formulas.mark_cell_dirty(location.local());
            if !affected.contains(&sheet) {
                affected.push(sheet);
            }
        }
        affected
    }

    /// Resolve a sheet id or case-insensitive name to its stable handle.
    fn sheet_handle(&self, name: &str) -> Option<u32> {
        self.sheet_ids
            .get(name)
            .or_else(|| self.sheet_lookup.get(&sheet_name_key(name)))
            .map(|&index| index as u32)
    }

    /// The names formula text writes for bound sheet and table references.
    pub(crate) fn written_names(&self) -> WrittenNames<'_> {
        WrittenNames {
            sheets: &self.sheet_names,
            tables: Some(&self.tables),
        }
    }

    /// Bind standalone-parsed definitions/measures without rebuilding their tree.
    /// Such definitions still reject missing local sheets at installation.
    fn resolve_sheets(&self, mut ast: Ast) -> Result<Ast, FormulaError> {
        bind_sheet_refs(&mut ast, &|name| self.sheet_handle(name), &|span| {
            place_span(span, &self.tab_order())
        });
        if has_unresolved_local_sheets(&ast) {
            return Err(FormulaError::Ref);
        }
        Ok(ast)
    }

    /// Follow a row (or, with `columns`, column) insertion or deletion of
    /// `delta` at `at` on `edited_sheet` in every named range, adding the
    /// names it moved or removed to `changed`. A range the edit deletes
    /// whole is removed.
    fn rebase_named_ranges(
        &mut self,
        edited_sheet: u32,
        (at, delta): (u32, i64),
        columns: bool,
        changed: &mut Vec<String>,
    ) {
        self.defined_names.retain(|(_, name), definition| {
            let names::DefinedName::Range(range) = definition else {
                return true;
            };
            if range.sheet != edited_sheet {
                return true;
            }
            let (start, end) = if columns {
                (&mut range.col_start, &mut range.col_end)
            } else {
                (&mut range.row_start, &mut range.row_end)
            };
            let shifted = shift_range(*start, *end, at, delta);
            if shifted == Some((*start, *end)) {
                return true;
            }
            changed.push(name.clone());
            let Some(span) = shifted else {
                return false;
            };
            (*start, *end) = span;
            true
        });
    }

    // A table's references follow the edit in each formula tree, so moving
    // or removing the table here leaves no formula naming a removed slot.
    fn rebase_table_rows(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        self.tables.retain_mut(|table| {
            if table.sheet != edited_sheet {
                return true;
            }
            let Some((start, end)) = shift_range(table.row_start, table.row_end, at, delta) else {
                return false;
            };
            table.row_start = start;
            table.row_end = end;
            true
        });
    }

    fn rebase_table_cols(&mut self, edited_sheet: u32, at: u32, delta: i64) {
        self.tables.retain_mut(|table| {
            if table.sheet != edited_sheet {
                return true;
            }
            let Some((start, end)) = shift_range(table.col_start, table.col_end, at, delta) else {
                return false;
            };
            table.col_start = start;
            table.col_end = end;
            table.columns.retain_mut(|column| {
                let Some((col, _)) = shift_range(column.col, column.col, at, delta) else {
                    return false;
                };
                column.col = col;
                true
            });
            !table.columns.is_empty()
        });
    }

    fn recompute_all_sheets(&mut self) {
        let live: Vec<usize> = (0..self.sheets.len())
            .filter(|&sheet| self.sheet_alive.get(sheet).copied().unwrap_or_default())
            .collect();

        // One pass for every sheet: a pass per sheet would recalculate the
        // workbook's volatile formulas once per sheet.
        self.recompute_seed_sheets(&live);
    }

    /// A sheet rename or removal changes what INDIRECT text names, and no
    /// static read records that, so the volatile sheets join the seeds.
    fn recompute_with_volatile_sheets(&mut self, mut seeds: Vec<usize>) {
        for (sheet, data) in self.sheets.iter().enumerate() {
            if data.formulas.has_volatile() && !seeds.contains(&sheet) {
                seeds.push(sheet);
            }
        }

        self.recompute_seed_sheets(&seeds);
    }

    /// Live sheet handles in tab order.
    pub(crate) fn tab_order(&self) -> Cow<'_, [u32]> {
        match &self.sheet_order {
            Some(order) => Cow::Borrowed(order.as_slice()),
            None => Cow::Owned(
                (0..self.sheet_alive.len() as u32)
                    .filter(|&handle| self.sheet_alive[handle as usize])
                    .collect(),
            ),
        }
    }

    /// Re-places every 3-D reference after the tab order changed or a sheet
    /// was removed. Both are rare structural edits that already walk every
    /// formula, so the scan keeps no per-store index of 3-D formulas. A
    /// changed formula is replaced through the dependency index, which
    /// patches only that formula's reads, and is marked dirty. Returns the
    /// sheets whose formulas changed.
    fn refresh_sheet_spans(&mut self) -> Vec<usize> {
        let mut affected = Vec::new();
        let order = self.tab_order().into_owned();

        for (sheet, data) in self.sheets.iter_mut().enumerate() {
            if !self.sheet_alive[sheet] {
                continue;
            }
            let keys: Vec<_> = data
                .formulas
                .iter(&self.formula_slots)
                .filter(|(_, entry)| entry.ast.as_ref().is_some_and(ast_contains_sheet_span))
                .map(|(key, _)| key)
                .collect();

            let mut changed = false;
            for key in keys {
                let Some(mut entry) = data.formulas.get(key, &self.formula_slots).cloned() else {
                    continue;
                };
                if !entry.refresh_sheet_spans(&order, &self.sheet_names, sheet as u32) {
                    continue;
                }
                self.graph.replace_entry(
                    &mut data.formulas,
                    &mut self.formula_slots,
                    sheet,
                    key,
                    Some(entry),
                );
                data.formulas.mark_cell_dirty(key);
                changed = true;
            }
            if changed {
                affected.push(sheet);
            }
        }

        affected
    }
}

/// A resolved formula tree, and what its parse found: whether a sheet
/// reference stayed detached and whether it has a table reference.
type ResolvedFormula = (Ast, ParseFeatures);

/// Result of a single-cell read.
#[wasm_bindgen]
pub struct CellOut {
    kind: u8,
    num: f64,
    string: Option<String>,
    style: u32,
}

impl CellOut {
    pub(crate) fn empty() -> Self {
        Self {
            kind: KIND_EMPTY,
            num: 0.0,
            string: None,
            style: 0,
        }
    }
}

#[wasm_bindgen]
impl CellOut {
    /// The kind of the value (`KIND_*`). Errors and cells still loading are
    /// text, with their sentinel in `string`.
    #[wasm_bindgen(getter, js_name = kind)]
    #[must_use]
    pub fn kind(&self) -> u8 {
        self.kind
    }

    /// The number, for number and boolean cells.
    #[wasm_bindgen(getter, js_name = num)]
    #[must_use]
    pub fn num(&self) -> f64 {
        self.num
    }

    /// The text, for text cells, errors and cells still loading.
    #[wasm_bindgen(getter, js_name = string)]
    #[must_use]
    pub fn string(&self) -> Option<String> {
        self.string.clone()
    }

    /// The cell's style id.
    #[wasm_bindgen(getter, js_name = style)]
    #[must_use]
    pub fn style(&self) -> u32 {
        self.style
    }
}

/// Resolved values of a sparse coordinate batch, one entry per requested cell.
///
/// Every list holds one entry per cell, in the requested order. Text is stored
/// once: `text_index` names the cell's entry in `strings`, or `-1` when the cell
/// has no text, exactly like [`CellOut::string`] reports it.
#[wasm_bindgen]
pub struct CellSnapshot {
    kinds: Vec<u8>,
    numbers: Vec<f64>,
    styles: Vec<u32>,
    text_index: Vec<i32>,
    strings: Vec<String>,
}

#[wasm_bindgen]
impl CellSnapshot {
    #[wasm_bindgen(getter, js_name = kinds)]
    pub fn kinds(&self) -> Vec<u8> {
        self.kinds.clone()
    }

    #[wasm_bindgen(getter, js_name = numbers)]
    pub fn numbers(&self) -> Vec<f64> {
        self.numbers.clone()
    }

    #[wasm_bindgen(getter, js_name = styles)]
    pub fn styles(&self) -> Vec<u32> {
        self.styles.clone()
    }

    /// Entry in [`Self::strings`] per cell, or `-1` for a cell without text.
    #[wasm_bindgen(getter, js_name = textIndex)]
    pub fn text_index(&self) -> Vec<i32> {
        self.text_index.clone()
    }

    #[wasm_bindgen(getter, js_name = strings)]
    pub fn strings(&self) -> Vec<String> {
        self.strings.clone()
    }
}
