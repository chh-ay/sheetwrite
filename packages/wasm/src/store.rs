//! The workbook-wide store: sheet management, cell reads/writes, bulk loads.
//! Missing sheet references retain their tree and are indexed by stable formula
//! identity, so naming a sheet binds only its waiting users without reparsing.

use std::borrow::Cow;

use rustc_hash::{FxBuildHasher, FxHashMap, FxHashSet};
use wasm_bindgen::prelude::*;

use crate::calc::{
    ast_contains_sheet_span, bind_sheet_refs, external_name_key, has_unresolved_local_sheets,
    moved_index, moved_span, parse, parse_bound_with_features, place_span, sheet_name_key,
    shift_range, Ast, NamedRangeRef, ParseFeatures, StructuredRef, WrittenNames,
};
use crate::cell_move::CellMove;
use crate::cells::{
    encode_num, encode_str_id, payload_num, payload_str_id, DirtyRowWrite,
    DEFAULT_MAX_PAGED_DIRTY_CELLS, DEFAULT_PAGE_CHUNK_ROWS, MAX_DENSE_CELLS, MAX_LOCAL_PAGED_CELLS,
};
use crate::eval::{IterationLimits, RandomSource};
use crate::formula_slots::{FormulaId, FormulaResults, FormulaStore};
use crate::graph::{DirtyRect, FormulaGraph};
use crate::memory::{
    StoreMemoryStats, SHEET_INDEXES_METADATA, STRING_INDEX, STRING_POOL_SPANS, STRING_POOL_UTF8,
};
use crate::sheet::{formula_error_at, SheetData};
use crate::sorting::sort_by_key96;
use crate::spill::{SpillBlocker, MAX_SPILL_OWNER_CELLS};
use crate::tables::{Table, TableColumn};
use crate::types::{
    cell_key, string_from_pool, AbsCellKey, FormulaEntry, FormulaError, StringStorage, KIND_BOOL,
    KIND_EMPTY, KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};
use crate::window::ConditionalRules;
use names::NameScope;

mod blocks;
mod external_links;
mod hidden_rows;
#[cfg(all(test, feature = "analysis"))]
mod measure_tests;
#[cfg(feature = "analysis")]
mod measures;
#[cfg(feature = "analysis")]
mod model_source;
pub(crate) mod names;
pub(crate) mod pivot_output;
#[cfg(all(test, feature = "analysis"))]
mod pivot_tests;
#[cfg(feature = "analysis")]
mod pivots;
mod range_transfer;
mod recalculation;
#[cfg(all(test, feature = "analysis"))]
mod related_measure_tests;
#[cfg(feature = "analysis")]
mod relationships;
mod sheets;
#[cfg(test)]
mod sparse_tests;
mod structural;
mod tables;
mod transfer;

pub(crate) use blocks::{BLOCK_INVALID, BLOCK_OK, BLOCK_RESOURCE_LIMIT};
use range_transfer::RangeSnapshot;

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
    /// `Cell` keeps the field one pointer wide and lets readers that hold
    /// `&self` take the index out and put it back.
    #[cfg(feature = "analysis")]
    regex_patterns: std::cell::Cell<Option<Box<crate::eval::regex_patterns::PatternIndex>>>,
    /// Count of open page loads. A `u16` lets `remote_load` share its word.
    loading_page: u16,
    /// Set while a page load applies edits another client committed, which
    /// recalculate only the formulas that read them.
    remote_load: bool,
    /// Drops the formulas that ingest keeps for reuse with the store; held
    /// only for that.
    _formula_templates: crate::calc::FormulaTemplatesHold,
    /// The defined names, by the id formulas hold, and the tables.
    pub(crate) bindings: names::Bindings,
    mutation_revision: u64,
    active_mutation_revision: Option<u64>,
    pub(crate) volatile_serial: f64,
    pub(crate) random: RandomSource,
    pub(crate) spill_owner_cell_limit: usize,
    /// Cells dense sheets may hold across the workbook, at most
    /// [`MAX_DENSE_CELLS`]; the host's `maxDenseCells`.
    dense_cell_limit: usize,
    /// Logical cells local sheets may hold across the workbook, at most
    /// [`MAX_LOCAL_PAGED_CELLS`]; the host's `maxLocalPagedCells`.
    local_paged_cell_limit: usize,
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
    /// Table relationships and measures of the full engine. `None` until the host
    /// sends one, so a workbook without relationships pays one pointer.
    #[cfg(feature = "analysis")]
    #[allow(
        clippy::box_collection,
        reason = "boxed so the field stays one pointer: most workbooks have no model"
    )]
    pub(crate) relationships: Option<Box<Vec<relationships::Relationship>>>,
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
            remote_load: false,
            _formula_templates: crate::calc::FormulaTemplatesHold,
            mutation_revision: 0,
            active_mutation_revision: None,
            bindings: names::Bindings::default(),
            volatile_serial: 0.0,
            random: RandomSource::from_host(),
            spill_owner_cell_limit: MAX_SPILL_OWNER_CELLS,
            dense_cell_limit: MAX_DENSE_CELLS,
            local_paged_cell_limit: MAX_LOCAL_PAGED_CELLS,
            iteration: None,
            pivots: None,
            #[cfg(feature = "analysis")]
            relationships: None,
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

    /// Whether `sheet` keeps its cells in paged storage, loaded from the host
    /// on demand.
    #[wasm_bindgen(js_name = isPaged)]
    pub fn is_paged(&self, sheet: usize) -> bool {
        self.sheets
            .get(sheet)
            .is_some_and(|data| data.cells.is_datasource_paged())
    }

    /// Whether `sheet` keeps its cells in local pages: a dense sheet that
    /// grew past the dense cell cap. `isPaged` is false for such a sheet.
    #[wasm_bindgen(js_name = isLocalPaged)]
    pub fn is_local_paged(&self, sheet: usize) -> bool {
        self.sheets
            .get(sheet)
            .is_some_and(|data| data.cells.is_local_paged())
    }

    /// Sets the workbook-wide limits on dense cells and on local-page cells,
    /// each capped at the engine's ceiling (5,000,000 and 20,000,000). A sheet
    /// added or grown past the dense limit continues in local pages, and one
    /// that would pass the local limit is refused. Sheets already held stay
    /// where they are, so a host sets the limits before adding sheets.
    #[wasm_bindgen(js_name = setStorageLimits)]
    pub fn set_storage_limits(&mut self, dense_cells: usize, local_paged_cells: usize) {
        self.dense_cell_limit = dense_cells.min(MAX_DENSE_CELLS);
        self.local_paged_cell_limit = local_paged_cells.min(MAX_LOCAL_PAGED_CELLS);
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

    /// Starts applying edits another client committed. As in a page load,
    /// writes are stored values and keep cells with an unacknowledged edit;
    /// unlike a page load, they recalculate only the formulas that read them,
    /// as local edits do.
    ///
    /// @internal
    #[wasm_bindgen(js_name = beginRemoteLoad)]
    pub fn begin_remote_load(&mut self) {
        self.begin_page_load();
        self.remote_load = true;
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

    /// Empties the cell at `row`, `col` of `sheet`, removing its value or
    /// formula, and gives it style `style`.
    ///
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

    /// Packed `[source_sheet, source_row, source_col, ...]` of each formula
    /// that is only a reference to a cell of `target_sheet`. `None` when there
    /// are more than `max_entries`, so the list stays bounded for the host.
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

    /// Runs `edit`, a row or column insert or delete, on `sheet`. When it
    /// fails because memory runs out, the cells and formulas stay where they
    /// were, and every formula of the sheet recalculates, since
    /// `begin_structural_edit` already detached the spills they showed.
    /// `edit` reads the sheet's defined names through the scope it gets.
    fn finish_cell_edit(
        &mut self,
        sheet: usize,
        edit: impl FnOnce(&mut SheetData, &mut FormulaStore, NameScope<'_>) -> Result<(), String>,
    ) -> bool {
        let names = NameScope::new(&self.bindings, sheet as u32);
        let data = &mut self.sheets[sheet];
        if edit(data, &mut self.formula_slots, names).is_err() {
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

    /// Explicit volatile barrier. `serial` is a UTC spreadsheet serial using
    /// the 1899-12-30 epoch. Only volatile formulas and their dependents
    /// recalculate: formulas that call TODAY, NOW, RAND, RANDBETWEEN, OFFSET,
    /// INDIRECT, SHEET, SHEETS, INFO or a host function registered as
    /// volatile. TODAY and NOW use `serial` instead of the clock. Later
    /// recalculations read the clock.
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
    /// recalculates once at the transaction barrier (`commitSources` or
    /// `recompute`), so a multi-cell edit performs one dependency-scoped pass
    /// instead of one full-sheet pass per setter. A successful parse returns
    /// the pre-write cached scalar; a parse rejection returns `0.0`, and a
    /// rejected write returns `NaN`.
    ///
    /// A rewrite that keeps every read and the array shape, such as a
    /// constant-only edit, leaves the dependency index as it is. Any other
    /// rewrite queues a patch that the next recompute applies to the index.
    /// Either way, that recompute visits just the edited formula and its
    /// dependents instead of every formula in the workbook.
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

    /// Stable spill owner row, or `u32::MAX` when the cell is not part of a
    /// materialized spill; the column comes from `spillAnchorCol`.
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

    /// `[row, col, row_end, col_end]` of each installed spill on `sheet`, the
    /// anchor's row and column first; empty for an unknown sheet. An XLSX
    /// export writes each one as a dynamic array with its values.
    #[wasm_bindgen(js_name = spillRanges)]
    pub fn spill_ranges(&self, sheet: usize) -> Vec<u32> {
        let Some(data) = self.sheets.get(sheet) else {
            return Vec::new();
        };
        data.spill
            .installed_ranges()
            .flat_map(|range| [range.anchor.0, range.anchor.1, range.row_end, range.col_end])
            .collect()
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
        if self.loading_page == 0 {
            self.remote_load = false;
        }

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
    /// otherwise the result is `None`. Every entry reads exactly like
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
/// Range writes reserve the rectangle's dirty overlay before calling;
/// `clear_range` skips unloaded paged cells, so it reserves per written cell.
fn prepare_rect_write(sheet: &mut SheetData, rect: DirtyRect) {
    sheet.formulas.mark_dirty_rect(rect);

    if !sheet.spill.is_empty() {
        let detached = sheet.spill.detach_rect(rect, &mut sheet.cells);
        sheet.formulas.mark_cells_dirty(detached);
    }
}

/// One destination cell plus the source that replaces whatever it held.
///
/// The scalar setters, sparse blocks and range writes build this and hand it
/// to [`CellStore::replace_cell_source`] or its prepared-rectangle form, so
/// kind, payload, source and dirty marking are decided in one place.
/// `clearRange` and literal-only dense blocks write storage directly.
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
        // An empty pool has nothing to reclaim, so no cell is walked.
        if self.strings.len() == 0 {
            return;
        }
        let mut marks = Vec::new();
        if marks.try_reserve_exact(self.strings.len()).is_err() {
            self.strings.postpone_collection();
            return;
        }
        marks.resize(self.strings.len(), false);
        for sheet in &self.sheets {
            sheet.cells.visit_string_ids(|id| marks[id as usize] = true);
        }
        // Every string is live, as after a fresh load: there is nothing to
        // reclaim, so the pool keeps its ids and releases its growth slack in
        // place. Interning every string again and rewriting every cell would
        // cost about a sixth of a 1,000,000-row load.
        if marks.iter().all(|&marked| marked) {
            if force {
                self.strings.release_slack();
            }
            self.strings.postpone_collection();
            return;
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

    /// Store one cell write: write the cell, replace its formula source and
    /// mark what must recalculate. The dependency index records the change
    /// only when the replacement reads differently
    /// ([`FormulaGraph::replace_entry`]). A rejected write leaves the cell,
    /// the sources and the index untouched.
    fn replace_cell_source(&mut self, write: CellSourceWrite) -> bool {
        self.replace_cell_source_inner(write, false)
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
        // A snapshot or datasource page load recalculates the whole sheet; a
        // remote edit recalculates the readers of its cell.
        if hydrating && !self.remote_load {
            sheet_data.formulas.mark_all_dirty();
        } else if hydrating {
            sheet_data.formulas.mark_remote_cells_dirty([key]);
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

    pub(crate) fn intern(&mut self, s: &str) -> u32 {
        self.strings.intern(s)
    }
}

impl CellStore {
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
                // Only a formula that uses a defined name reads its origin,
                // to place a name relative to the cell.
                let _origin = features
                    .names
                    .then(|| crate::eval::FormulaOriginGuard::push((formula_row, formula_col)));
                FormulaEntry::parsed_source(
                    ast,
                    self.name_scope(formula_sheet as usize),
                    source.to_owned(),
                    features,
                )
            }
            Err(error) => FormulaEntry::error(source, error),
        }
    }

    /// Parses a formula as [`Self::resolve_unbound_formula`] does, then binds
    /// its literal REGEX patterns to the patterns the store's formulas share.
    /// The features tell what the parse found, such as a defined name, a
    /// table reference or a sheet reference left detached.
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
    /// then binds its defined names to the name table when the parse found a
    /// name and numbers its LAMBDA parameters when it found a LAMBDA, so a
    /// formula of plain cells is parsed in one pass.
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
            &|written| self.bindings.tables.bind(written, at),
        )
        .map_err(|_| FormulaError::Value)?;

        if features.names {
            ast = self.bind_formula_names(ast, formula_sheet);
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
    /// (`formula_row`, `formula_col`) of `formula_sheet`: sheet names, then
    /// defined names, then structured references, and last the shapes of the
    /// defined names. Measures resolve their inlined expression this way.
    #[cfg(feature = "analysis")]
    pub(crate) fn resolve_parsed_formula(
        &self,
        ast: Ast,
        formula_sheet: u32,
        formula_row: u32,
        formula_col: u32,
    ) -> Result<Ast, FormulaError> {
        let with_sheets = self.resolve_sheets(ast)?;
        let mut with_names = self.bind_formula_names(with_sheets, formula_sheet);
        self.resolve_table_refs(&mut with_names, formula_sheet, formula_row, formula_col);
        crate::eval::with_formula_origin((formula_row, formula_col), || {
            names::shapes::mark(&mut with_names, self.name_scope(formula_sheet as usize));
        });
        Ok(with_names)
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

    /// The names formula text writes for bound sheet, table and defined name
    /// references.
    pub(crate) fn written_names(&self) -> WrittenNames<'_> {
        WrittenNames {
            sheets: &self.sheet_names,
            tables: Some(&self.bindings.tables),
            names: Some(&self.bindings.names),
        }
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
}

/// A resolved formula tree, and what its parse found ([`ParseFeatures`]).
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
    /// The kind of each cell's value (`KIND_*`), as [`CellOut::kind`] reports it.
    #[wasm_bindgen(getter, js_name = kinds)]
    pub fn kinds(&self) -> Vec<u8> {
        self.kinds.clone()
    }

    /// Each cell's number, for number and boolean cells.
    #[wasm_bindgen(getter, js_name = numbers)]
    pub fn numbers(&self) -> Vec<f64> {
        self.numbers.clone()
    }

    /// Each cell's style id.
    #[wasm_bindgen(getter, js_name = styles)]
    pub fn styles(&self) -> Vec<u32> {
        self.styles.clone()
    }

    /// Entry in [`Self::strings`] per cell, or `-1` for a cell without text.
    #[wasm_bindgen(getter, js_name = textIndex)]
    pub fn text_index(&self) -> Vec<i32> {
        self.text_index.clone()
    }

    /// The text of each cell that has one, in cell order; [`Self::text_index`]
    /// gives a cell's entry.
    #[wasm_bindgen(getter, js_name = strings)]
    pub fn strings(&self) -> Vec<String> {
        self.strings.clone()
    }
}
