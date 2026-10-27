//! Pivot tables of the full engine: the definitions the host sends, their
//! caches, and the output each one spills from its anchor.
//!
//! The output is spill state owned by the anchor and never a formula entry,
//! so pivots stay out of formula sources, snapshots, `ISFORMULA` and
//! transfer. Core keeps the definitions and sends them again after a
//! transfer; the caches then rebuild.
//!
//! Each recompute pass records the source rows it changed (see
//! [`CellStore::capture_pivot_changes`]); after the pass,
//! [`CellStore::settle_pivots`] updates those rows in the caches, writes the
//! changed output cells and recomputes the formulas that read them.

use std::collections::BTreeMap;
use std::mem::size_of;

use rustc_hash::{FxHashMap, FxHashSet};
use wasm_bindgen::prelude::*;

use super::pivot_output::{attempt_cut, shift_anchor, ShiftAxis};
use super::{CellStore, TableColumnDefinition};
use crate::calc::shift_range;
use crate::eval::{calculated_slot, settled_cell_value};
use crate::graph::{DirtyRect, DirtySeeds};
use crate::pivot::{
    source_fields, Aggregation, PivotCache, PivotDefinition, PivotFilter, PivotLayout, PivotSource,
    PivotValue,
};
use crate::sheet::SheetData;
use crate::spill::SpillRange;
use crate::types::{AbsCellKey, CellKey, FormulaError, StringStorage, Value, KIND_EMPTY};

/// Pivots one sheet may hold; a payload with more is malformed. Core's
/// workbook pivot bound is lower.
const MAX_PIVOTS_PER_SHEET: usize = 1_024;

/// Pivot output that keeps changing its own source after this many rounds
/// is a cycle and shows `#CYCLE!`.
const MAX_SETTLE_ROUNDS: usize = 32;

const SOURCE_RANGE: u32 = 0;
const SOURCE_TABLE: u32 = 1;
const SOURCE_INVALID: u32 = 2;

/// Unused bound slots after a table id, and after the absent-string slot of
/// an invalid source, so every source takes the slots of a range (sheet,
/// r0, c0, r1, c1). Twins of `TABLE_SOURCE_PADDING` and
/// `INVALID_SOURCE_PADDING` in `packages/core/src/pivot.ts`.
const TABLE_SOURCE_PADDING: usize = 4;
const INVALID_SOURCE_PADDING: usize = 4;

/// Numbers per pivot in a `pivotStatus` record; twin of
/// `PIVOT_STATUS_STRIDE` in `packages/core/src/store/data-engine.ts`.
pub(super) const STATUS_STRIDE: usize = 7;

const FILTER_NULL: u32 = 0;
const FILTER_NUMBER: u32 = 1;
const FILTER_TEXT: u32 = 2;
const FILTER_BOOL: u32 = 3;

const SORT_ROWS: u32 = 0;
const SORT_COLUMNS: u32 = 1;

const FLAG_ROW_TOTALS: u32 = 1;
const FLAG_COLUMN_TOTALS: u32 = 1 << 1;
const FLAG_SUBTOTALS: u32 = 1 << 2;
const FLAG_TABULAR: u32 = 1 << 3;

/// Numbers per item in the wire format, used to bound counts before
/// allocating for them.
const VALUE_NUMBERS: usize = 3;
const FILTER_NUMBERS: usize = 2;
const FILTER_VALUE_NUMBERS: usize = 2;
const SORT_NUMBERS: usize = 3;

/// The wire value of a value field without a custom name.
const NO_NAME: f64 = -1.0;

#[derive(Clone, Debug, PartialEq)]
enum SourceRef {
    /// Inclusive rows and columns; the first row holds the headers.
    Range {
        sheet: usize,
        rows: (u32, u32),
        cols: (u32, u32),
    },
    Table(String),
    Invalid,
}

/// One decoded pivot definition: where it reads and writes on the workbook,
/// plus the fields and options its cache builds from.
#[derive(Clone, Debug, PartialEq)]
struct SheetPivot {
    id: String,
    source: SourceRef,
    anchor: CellKey,
    definition: PivotDefinition,
}

/// Reads one sheet's packed definitions; see `setPivots`.
struct Payload<'a> {
    numbers: &'a [f64],
    strings: &'a [String],
    at: usize,
}

/// The slot as a string or field index; `None` for a negative, fractional or
/// oversized number.
fn as_index(number: f64) -> Option<u32> {
    (number >= 0.0 && number.fract() == 0.0 && number <= f64::from(u32::MAX))
        .then_some(number as u32)
}

impl Payload<'_> {
    fn number(&mut self) -> Option<f64> {
        let number = *self.numbers.get(self.at)?;
        self.at += 1;
        number.is_finite().then_some(number)
    }

    fn index(&mut self) -> Option<u32> {
        as_index(self.number()?)
    }

    /// Skips `count` unused slots, which must still be finite numbers.
    fn skip(&mut self, count: usize) -> Option<()> {
        for _ in 0..count {
            self.number()?;
        }
        Some(())
    }

    /// A count of items that each take `numbers_per_item` numbers; a count
    /// the rest of the payload cannot hold is malformed.
    fn count(&mut self, numbers_per_item: usize) -> Option<usize> {
        let count = self.index()? as usize;
        (count.saturating_mul(numbers_per_item) <= self.numbers.len() - self.at).then_some(count)
    }

    fn text(&mut self) -> Option<String> {
        let index = self.index()?;
        self.strings.get(index as usize).cloned()
    }

    fn fields(&mut self) -> Option<Vec<usize>> {
        let count = self.count(1)?;
        (0..count).map(|_| Some(self.index()? as usize)).collect()
    }

    fn definition(&mut self) -> Option<SheetPivot> {
        let id = self.text()?;
        let source = self.source()?;
        let anchor = (self.index()?, self.index()?);
        let rows = self.fields()?;
        let columns = self.fields()?;
        let values = self.value_fields()?;
        let filters = self.filters()?;
        let (row_descending, column_descending) = self.sort(&rows, &columns)?;
        let flags = self.index()?;

        Some(SheetPivot {
            id,
            source,
            anchor,
            definition: PivotDefinition {
                rows,
                columns,
                values,
                filters,
                row_descending,
                column_descending,
                row_totals: flags & FLAG_ROW_TOTALS != 0,
                column_totals: flags & FLAG_COLUMN_TOTALS != 0,
                subtotals: flags & FLAG_SUBTOTALS != 0,
                tabular: flags & FLAG_TABULAR != 0,
            },
        })
    }

    fn source(&mut self) -> Option<SourceRef> {
        match self.index()? {
            SOURCE_RANGE => {
                let sheet = self.index()? as usize;
                let (r0, c0, r1, c1) = (self.index()?, self.index()?, self.index()?, self.index()?);
                if r0 > r1 || c0 > c1 {
                    return None;
                }
                Some(SourceRef::Range {
                    sheet,
                    rows: (r0, r1),
                    cols: (c0, c1),
                })
            }
            SOURCE_TABLE => {
                let table = self.text()?;
                self.skip(TABLE_SOURCE_PADDING)?;
                Some(SourceRef::Table(table))
            }
            SOURCE_INVALID => {
                // Core sends no sheet or table here: the slot holds its
                // absent-string marker.
                self.number()?;
                self.skip(INVALID_SOURCE_PADDING)?;
                Some(SourceRef::Invalid)
            }
            _ => None,
        }
    }

    fn value_fields(&mut self) -> Option<Vec<PivotValue>> {
        let count = self.count(VALUE_NUMBERS)?;
        let mut values = Vec::with_capacity(count);
        for _ in 0..count {
            let field = self.index()? as usize;
            let aggregation = Aggregation::from_code(self.index()?)?;
            let name_slot = self.number()?;
            let name = if name_slot == NO_NAME {
                None
            } else {
                Some(self.strings.get(as_index(name_slot)? as usize)?.clone())
            };

            values.push(PivotValue {
                field,
                aggregation,
                name,
            });
        }
        Some(values)
    }

    fn filters(&mut self) -> Option<Vec<PivotFilter>> {
        let count = self.count(FILTER_NUMBERS)?;
        let mut filters = Vec::with_capacity(count);
        for _ in 0..count {
            let field = self.index()? as usize;
            let keep_count = self.count(FILTER_VALUE_NUMBERS)?;
            let keep = (0..keep_count)
                .map(|_| self.filter_value())
                .collect::<Option<Vec<Value>>>()?;
            filters.push(PivotFilter::new(field, keep));
        }
        Some(filters)
    }

    /// One kept value: a kind, then its payload (unused for a blank).
    fn filter_value(&mut self) -> Option<Value> {
        match self.index()? {
            FILTER_NULL => {
                self.number()?;
                Some(Value::Blank)
            }
            FILTER_NUMBER => Some(Value::number(self.number()?)),
            FILTER_TEXT => Some(Value::text(self.text()?)),
            FILTER_BOOL => Some(Value::Bool(self.index()? != 0)),
            _ => None,
        }
    }

    /// The descending flag of each row and column level. A sort on a field
    /// outside its axis is ignored; levels without one sort ascending.
    fn sort(&mut self, rows: &[usize], columns: &[usize]) -> Option<(Vec<bool>, Vec<bool>)> {
        let mut row_descending = vec![false; rows.len()];
        let mut column_descending = vec![false; columns.len()];
        for _ in 0..self.count(SORT_NUMBERS)? {
            let (axis, field, descending) = (self.index()?, self.index()? as usize, self.index()?);
            let (fields, directions) = match axis {
                SORT_ROWS => (rows, &mut row_descending),
                SORT_COLUMNS => (columns, &mut column_descending),
                _ => return None,
            };
            if let Some(level) = fields.iter().position(|&axis_field| axis_field == field) {
                directions[level] = descending != 0;
            }
        }
        Some((row_descending, column_descending))
    }
}

fn decode_definitions(numbers: &[f64], strings: &[String]) -> Option<Vec<SheetPivot>> {
    let mut payload = Payload {
        numbers,
        strings,
        at: 0,
    };
    let mut definitions = Vec::new();
    while payload.at < numbers.len() {
        if definitions.len() == MAX_PIVOTS_PER_SHEET {
            return None;
        }
        definitions.push(payload.definition()?);
    }
    let mut ids = FxHashSet::default();
    definitions
        .iter()
        .all(|definition| ids.insert(definition.id.as_str()))
        .then_some(definitions)
}

/// The source cells a cache was built from: an optional header row, then
/// `rows` data rows from `first`, over `cols` columns from `col_start`.
#[derive(Clone, Copy, Debug, PartialEq)]
struct SourceRect {
    sheet: usize,
    header: Option<u32>,
    first: u32,
    rows: u32,
    col_start: u32,
    cols: u32,
}

impl SourceRect {
    fn bounds(self) -> Option<DirtyRect> {
        let top = self.header.unwrap_or(self.first);
        let bottom = (self.first + self.rows).checked_sub(1)?.max(top);
        DirtyRect::new(
            top as usize,
            self.col_start as usize,
            bottom as usize,
            (self.col_start + self.cols - 1) as usize,
        )
    }

    fn meets(self, range: SpillRange) -> bool {
        self.bounds().is_some_and(|bounds| {
            bounds.intersects(DirtyRect {
                row_start: range.anchor.0,
                col_start: range.anchor.1,
                row_end: range.row_end,
                col_end: range.col_end,
            })
        })
    }

    fn holds_col(self, col: u32) -> bool {
        col >= self.col_start && col - self.col_start < self.cols
    }

    /// Records that the cell at `(row, col)` changed.
    fn touch(self, (row, col): CellKey, pending: &mut Pending) {
        if !self.holds_col(col) {
            return;
        }
        if self.header == Some(row) {
            pending.headers = true;
        } else if row >= self.first && row - self.first < self.rows {
            pending.rows.push(row - self.first);
        }
    }

    /// Records that every cell of `rect` changed.
    fn touch_rect(self, rect: DirtyRect, pending: &mut Pending) {
        let cols_end = self.col_start + self.cols - 1;
        if rect.col_end < self.col_start || rect.col_start > cols_end {
            return;
        }
        if self
            .header
            .is_some_and(|header| rect.row_start <= header && header <= rect.row_end)
        {
            pending.headers = true;
        }
        let Some(last) = (self.first + self.rows).checked_sub(1) else {
            return;
        };
        let start = rect.row_start.max(self.first);
        let end = rect.row_end.min(last);
        if start <= end {
            pending.rows.extend(start - self.first..=end - self.first);
        }
    }
}

/// One source as the cache reads it: settled cell values below the header.
struct StoreSource<'a> {
    sheet: &'a SheetData,
    strings: &'a StringStorage,
    rect: SourceRect,
    /// A table's column names, which are its field names.
    names: Option<&'a [TableColumnDefinition]>,
}

impl PivotSource for StoreSource<'_> {
    fn rows(&self) -> usize {
        self.rect.rows as usize
    }

    fn width(&self) -> usize {
        self.rect.cols as usize
    }

    fn header(&self, field: usize) -> Value {
        if let Some(names) = self.names {
            return names
                .get(field)
                .map_or(Value::Blank, |column| Value::text(column.name.as_str()));
        }
        self.rect.header.map_or(Value::Blank, |row| {
            settled_cell_value(
                self.sheet,
                self.strings,
                row as usize,
                self.rect.col_start as usize + field,
            )
        })
    }

    fn value(&self, row: usize, field: usize) -> Value {
        settled_cell_value(
            self.sheet,
            self.strings,
            self.rect.first as usize + row,
            self.rect.col_start as usize + field,
        )
    }
}

/// Work a pivot owes since its last update.
#[derive(Default)]
struct Pending {
    rebuild: bool,
    headers: bool,
    /// Its output was cut, or a blocker of its attempt changed.
    readmit: bool,
    /// Changed source data rows, unsorted, possibly repeated.
    rows: Vec<u32>,
}

impl Pending {
    fn is_empty(&self) -> bool {
        !self.rebuild && !self.headers && !self.readmit && self.rows.is_empty()
    }

    /// Marks the work done, keeping the row buffer's capacity for the next
    /// pass.
    fn clear(&mut self) {
        self.rebuild = false;
        self.headers = false;
        self.readmit = false;
        self.rows.clear();
    }
}

struct Pivot {
    /// The definition as the sheet sent it, with its id, source and anchor.
    saved: SheetPivot,
    /// `None` until built, and after a source error, a failed build, a
    /// cycle, or while its anchor collides with another pivot's.
    cache: Option<PivotCache>,
    /// The source the cache holds.
    source: Option<SourceRect>,
    /// The layout of the installed output.
    layout: Option<PivotLayout>,
    error: Option<FormulaError>,
    /// The output range last attempted, installed or blocked.
    attempt: Option<SpillRange>,
    pending: Pending,
}

impl Pivot {
    fn new(saved: SheetPivot) -> Self {
        Self {
            saved,
            cache: None,
            source: None,
            layout: None,
            error: None,
            attempt: None,
            pending: Pending {
                rebuild: true,
                ..Pending::default()
            },
        }
    }

    /// Heap bytes the pivot owns; the `Vec<Pivot>` slot is counted by the
    /// registry.
    fn heap_bytes(&self) -> usize {
        let saved = &self.saved;
        let table = match &saved.source {
            SourceRef::Table(id) => id.capacity(),
            _ => 0,
        };
        saved.id.capacity()
            + table
            + saved.definition.retained_bytes()
            + self.cache.as_ref().map_or(0, PivotCache::retained_bytes)
            + self.layout.as_ref().map_or(0, PivotLayout::retained_bytes)
            + self.pending.rows.capacity() * size_of::<u32>()
    }
}

/// Where a pivot reads and writes, for the overlap check.
#[derive(Clone, Copy)]
struct Footprint {
    owner: usize,
    source: Option<SourceRect>,
    attempt: Option<SpillRange>,
}

/// Every pivot of the workbook by owning sheet, in the order the host sent
/// them.
#[derive(Default)]
pub(crate) struct PivotRegistry {
    sheets: BTreeMap<usize, Vec<Pivot>>,
    /// Scratch buffers each update pass refills, so a recompute does not
    /// allocate: every pivot's footprint in registry order, and the anchor
    /// counts of one sheet.
    footprints: Vec<Footprint>,
    anchor_counts: FxHashMap<CellKey, usize>,
}

impl PivotRegistry {
    pub(crate) fn retained_bytes(&self) -> usize {
        // A B-tree entry costs its key and value plus a share of the node.
        const BTREE_ENTRY_OVERHEAD: usize = 8;
        let scratch = self.footprints.capacity() * size_of::<Footprint>()
            + self.anchor_counts.capacity() * size_of::<(CellKey, usize)>();
        size_of::<Self>()
            + scratch
            + self
                .sheets
                .values()
                .map(|pivots| {
                    size_of::<usize>()
                        + size_of::<Vec<Pivot>>()
                        + BTREE_ENTRY_OVERHEAD
                        + pivots.capacity() * size_of::<Pivot>()
                        + pivots.iter().map(Pivot::heap_bytes).sum::<usize>()
                })
                .sum::<usize>()
    }

    fn pivots_mut(&mut self) -> impl Iterator<Item = &mut Pivot> {
        self.sheets.values_mut().flatten()
    }

    /// Whether no pivot owes work, so an update pass has nothing to do.
    fn is_idle(&self) -> bool {
        self.sheets
            .values()
            .flatten()
            .all(|pivot| pivot.pending.is_empty())
    }

    fn refresh_footprints(&mut self) {
        self.footprints.clear();
        self.footprints
            .extend(self.sheets.iter().flat_map(|(&owner, pivots)| {
                pivots.iter().map(move |pivot| Footprint {
                    owner,
                    source: pivot.source,
                    attempt: pivot.attempt,
                })
            }));
    }
}

/// Whether the output `range` of pivot `index` meets its own source or the
/// source of a pivot that feeds it, directly or through other pivots.
fn meets_upstream_source(footprints: &[Footprint], index: usize, range: SpillRange) -> bool {
    let owner = footprints[index].owner;
    let mut upstream = vec![index];
    let mut seen = vec![false; footprints.len()];
    seen[index] = true;
    let mut next = 0;
    while let Some(&current) = upstream.get(next) {
        next += 1;
        let Some(source) = footprints[current].source else {
            continue;
        };
        if source.sheet == owner && source.meets(range) {
            return true;
        }
        for (other, footprint) in footprints.iter().enumerate() {
            if !seen[other]
                && footprint.owner == source.sheet
                && footprint
                    .attempt
                    .is_some_and(|attempt| source.meets(attempt))
            {
                seen[other] = true;
                upstream.push(other);
            }
        }
    }
    false
}

/// The names and types of a pivot's source fields, for the field list.
#[wasm_bindgen]
pub struct PivotFields {
    names: Vec<String>,
    types: Vec<u8>,
}

#[wasm_bindgen]
impl PivotFields {
    /// Field names: header text, or `ColumnN` for a blank header.
    pub fn names(&self) -> Vec<String> {
        self.names.clone()
    }

    /// Field types: 0 blank, 1 number, 2 text, 3 boolean, 4 mixed.
    pub fn types(&self) -> Vec<u8> {
        self.types.clone()
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Replaces every pivot anchored on `sheet` with the packed definitions,
    /// concatenated per pivot: `[id, sourceKind (0 range, 1 table,
    /// 2 invalid), sourceSheet | tableId, r0, c0, r1, c1, anchorRow,
    /// anchorCol, nRows, ...rowFields, nCols, ...colFields, nValues,
    /// ...(field, aggregation, name | -1), nFilters, ...(field, nValues,
    /// ...(kind, payload)), nSort, ...(axis, field, descending), flags]`.
    /// Text slots index `strings`. A pivot whose definition did not change
    /// keeps its cache. Output appears at the next recalculation. Returns
    /// `false`, changing nothing, for a malformed payload or a dead sheet.
    #[wasm_bindgen(js_name = setPivots)]
    pub fn set_pivots(&mut self, sheet: usize, numbers: &[f64], strings: Vec<String>) -> bool {
        if !self.sheet_alive.get(sheet).copied().unwrap_or(false) {
            return false;
        }
        let Some(definitions) = decode_definitions(numbers, &strings) else {
            return false;
        };
        if definitions.is_empty() && self.pivots.is_none() {
            return true;
        }

        let mut registry = self.pivots.take().unwrap_or_default();
        let mut previous: Vec<Option<Pivot>> = registry
            .sheets
            .remove(&sheet)
            .unwrap_or_default()
            .into_iter()
            .map(Some)
            .collect();
        let mut next = Vec::with_capacity(definitions.len());
        for definition in definitions {
            let kept = previous
                .iter_mut()
                .find(|pivot| {
                    pivot
                        .as_ref()
                        .is_some_and(|pivot| pivot.saved.id == definition.id)
                })
                .and_then(Option::take);
            match kept {
                Some(pivot) if pivot.saved == definition => next.push(pivot),
                kept => {
                    if let Some(old) = kept.filter(|old| old.saved.anchor != definition.anchor) {
                        self.remove_pivot_output(sheet, old.saved.anchor);
                    }
                    let data = &mut self.sheets[sheet];
                    data.formulas.mark_cell_dirty(definition.anchor);
                    next.push(Pivot::new(definition));
                }
            }
        }
        for removed in previous.into_iter().flatten() {
            self.remove_pivot_output(sheet, removed.saved.anchor);
        }

        if !next.is_empty() {
            registry.sheets.insert(sheet, next);
        }
        self.pivots = (!registry.sheets.is_empty()).then_some(registry);
        true
    }

    /// One record per pivot of `sheet`, in the order sent: `[error (0 ok,
    /// else error slot + 1), rowStart, colStart, rows, cols, headerRows,
    /// labelCols]`. A pivot with an error covers only its anchor, which
    /// shows the error, or nothing (0 × 0) when a source value or formula
    /// holds the anchor: that cell belongs to the user.
    #[wasm_bindgen(js_name = pivotStatus)]
    pub fn pivot_status(&self, sheet: usize) -> Vec<u32> {
        let Some(pivots) = self
            .pivots
            .as_deref()
            .and_then(|registry| registry.sheets.get(&sheet))
        else {
            return Vec::new();
        };
        let data = &self.sheets[sheet];
        let mut status = Vec::with_capacity(pivots.len() * STATUS_STRIDE);
        for pivot in pivots {
            let (row, col) = pivot.saved.anchor;
            let record: [u32; STATUS_STRIDE] = match (pivot.error, &pivot.layout) {
                (Some(error), _) => {
                    let user_anchor = data.formulas.contains((row, col))
                        || (data.cells.contains_cell(row as usize, col as usize)
                            && data
                                .cells
                                .source_kind_at(data.cells.idx(row as usize, col as usize))
                                != KIND_EMPTY);
                    let size = u32::from(!user_anchor);
                    [error.slot() as u32 + 1, row, col, size, size, 0, 0]
                }
                (None, Some(layout)) => [
                    0,
                    row,
                    col,
                    layout.rows as u32,
                    layout.cols as u32,
                    layout.header_rows as u32,
                    layout.label_cols as u32,
                ],
                (None, None) => [0, row, col, 0, 0, 0, 0],
            };
            status.extend(record);
        }
        status
    }

    /// The fields of pivot `index` on `sheet`; empty while its source is
    /// invalid.
    #[wasm_bindgen(js_name = pivotFields)]
    pub fn pivot_fields(&self, sheet: usize, index: usize) -> PivotFields {
        let fields = self
            .pivots
            .as_deref()
            .and_then(|registry| registry.sheets.get(&sheet)?.get(index))
            .and_then(|pivot| self.resolve_pivot_source(&pivot.saved.source).ok())
            .map(|(rect, names)| {
                source_fields(&StoreSource {
                    sheet: &self.sheets[rect.sheet],
                    strings: &self.strings,
                    rect,
                    names,
                })
            });
        let (names, types) = fields.unwrap_or_default();
        PivotFields { names, types }
    }
}

impl CellStore {
    fn resolve_pivot_source(
        &self,
        source: &SourceRef,
    ) -> Result<(SourceRect, Option<&[TableColumnDefinition]>), FormulaError> {
        match source {
            SourceRef::Range { sheet, rows, cols } => {
                let data = self
                    .sheets
                    .get(*sheet)
                    .filter(|_| self.sheet_alive.get(*sheet).copied().unwrap_or(false))
                    .ok_or(FormulaError::Ref)?;
                if rows.1 as usize >= data.cells.row_count()
                    || cols.1 as usize >= data.cells.n_cols()
                {
                    return Err(FormulaError::Ref);
                }
                Ok((
                    SourceRect {
                        sheet: *sheet,
                        header: Some(rows.0),
                        first: rows.0 + 1,
                        rows: rows.1 - rows.0,
                        col_start: cols.0,
                        cols: cols.1 - cols.0 + 1,
                    },
                    None,
                ))
            }
            SourceRef::Table(id) => {
                let table = self
                    .tables
                    .values()
                    .find(|table| &table.id == id)
                    .ok_or(FormulaError::Ref)?;
                let first = table.row_start + u32::from(table.header_row);
                let end = table.row_end + 1 - u32::from(table.totals_row);
                Ok((
                    SourceRect {
                        sheet: table.sheet as usize,
                        header: table.header_row.then_some(table.row_start),
                        first,
                        rows: end.saturating_sub(first),
                        col_start: table.col_start,
                        cols: table.col_end - table.col_start + 1,
                    },
                    Some(&table.columns),
                ))
            }
            SourceRef::Invalid => Err(FormulaError::Ref),
        }
    }

    /// Records, before a pass clears the dirty state of `sheets`, the source
    /// rows each pivot must update (cells written or recalculated in the
    /// pass, including the formula results in `affected`), and whether a
    /// change inside its output range means its output must be placed again.
    pub(crate) fn capture_pivot_changes<I>(
        &mut self,
        sheets: I,
        affected: Option<&FxHashSet<AbsCellKey>>,
    ) where
        I: IntoIterator<Item = usize> + Clone,
    {
        let Some(registry) = self.pivots.as_deref_mut() else {
            return;
        };
        let finished = |sheet: usize| sheets.clone().into_iter().any(|done| done == sheet);

        for (&owner, pivots) in &mut registry.sheets {
            for pivot in pivots {
                if let Some(rect) = pivot.source {
                    capture_source(
                        &self.sheets[rect.sheet],
                        rect,
                        finished(rect.sheet),
                        affected,
                        &mut pivot.pending,
                    );
                }

                if let Some(attempt) = pivot.attempt.filter(|_| finished(owner)) {
                    let installed = pivot.error.is_none();
                    pivot.pending.readmit |= attempt_cut(&self.sheets[owner], attempt, installed);
                }
            }
        }
    }

    /// Updates every pivot with pending changes and recomputes the formulas
    /// that read changed output, round by round, until nothing changes.
    pub(crate) fn settle_pivots(&mut self) {
        for _ in 0..MAX_SETTLE_ROUNDS {
            let changed = self.update_pivots();
            if changed.is_empty() {
                return;
            }
            self.recompute_formulas(&changed);
        }

        // The output keeps changing its own sources: a cycle.
        let mut changed = Vec::new();
        if let Some(mut registry) = self.pivots.take() {
            for (&owner, pivots) in &mut registry.sheets {
                for pivot in pivots {
                    if !pivot.pending.is_empty() {
                        pivot.pending.clear();
                        pivot.cache = None;
                        if self.show_pivot_error(owner, pivot, FormulaError::Cycle, None)
                            && !changed.contains(&owner)
                        {
                            changed.push(owner);
                        }
                    }
                }
            }
            self.pivots = Some(registry);
        }
        self.recompute_formulas(&changed);

        if let Some(registry) = self.pivots.as_deref_mut() {
            for pivot in registry.pivots_mut() {
                // A stale cache rebuilds at the pivot's next source change.
                if !pivot.pending.is_empty() {
                    pivot.pending.clear();
                    pivot.cache = None;
                }
            }
        }
    }

    /// Updates each pivot with pending changes. Returns the sheets whose
    /// cells changed; those cells are marked dirty.
    fn update_pivots(&mut self) -> Vec<usize> {
        // Every change that needs output work marks a pivot pending, including
        // anchors that a structural edit moves together or apart.
        if self.pivots.as_deref().is_none_or(PivotRegistry::is_idle) {
            return Vec::new();
        }
        let Some(mut registry) = self.pivots.take() else {
            return Vec::new();
        };

        registry.refresh_footprints();
        let mut changed = Vec::new();
        let mut index = 0;
        for (&owner, pivots) in &mut registry.sheets {
            let anchor_counts = &mut registry.anchor_counts;
            anchor_counts.clear();
            for pivot in pivots.iter() {
                *anchor_counts.entry(pivot.saved.anchor).or_insert(0) += 1;
            }

            for pivot in pivots {
                let output_changed = if anchor_counts[&pivot.saved.anchor] > 1 {
                    // Structural deletion can clamp distinct anchors together.
                    // Keep both definitions, but let neither install output.
                    pivot.pending.clear();
                    pivot.cache = None;
                    registry.footprints[index].attempt = SpillRange::new(pivot.saved.anchor, 1, 1);
                    self.show_pivot_error(owner, pivot, FormulaError::Spill, None)
                } else {
                    !pivot.pending.is_empty()
                        && self.update_pivot(owner, pivot, &mut registry.footprints, index)
                };
                if output_changed && !changed.contains(&owner) {
                    changed.push(owner);
                }
                index += 1;
            }
        }

        self.pivots = Some(registry);
        changed
    }

    fn update_pivot(
        &mut self,
        owner: usize,
        pivot: &mut Pivot,
        footprints: &mut [Footprint],
        index: usize,
    ) -> bool {
        let readmit = pivot.pending.readmit;
        let refreshed = self.refresh_pivot_cache(pivot);
        pivot.pending.clear();
        footprints[index].source = pivot.source;
        if let Err(error) = refreshed {
            footprints[index].attempt = None;
            return self.show_pivot_error(owner, pivot, error, None);
        }

        let Some(cache) = pivot.cache.as_mut() else {
            return self.show_pivot_error(owner, pivot, FormulaError::Ref, None);
        };
        if let Some(error) = cache.error() {
            cache.clear_changes();
            footprints[index].attempt = None;
            return self.show_pivot_error(owner, pivot, error, None);
        }

        // Unchanged groups and intact output: write only the changed cells.
        let anchor = pivot.saved.anchor;
        let shown = pivot.error.is_none() && !readmit;
        let intact = pivot.layout.as_ref().filter(|layout| {
            shown
                && self.sheets[owner].spill.installed(anchor)
                    == SpillRange::new(anchor, layout.rows, layout.cols)
        });
        if let Some(layout) = intact {
            if let Some(offsets) = cache.take_changes(layout) {
                return self.write_pivot_cells(owner, anchor, cache, layout, &offsets);
            }
        } else {
            cache.clear_changes();
        }

        let layout = match cache.layout() {
            Ok(layout) => layout,
            Err(error) => return self.show_pivot_error(owner, pivot, error, None),
        };
        let Some(range) = SpillRange::new(anchor, layout.rows, layout.cols) else {
            return self.show_pivot_error(owner, pivot, FormulaError::Num, None);
        };

        footprints[index].attempt = Some(range);
        if meets_upstream_source(footprints, index, range) {
            return self.show_pivot_error(owner, pivot, FormulaError::Spill, Some(range));
        }

        let (changed, placed) =
            self.place_pivot_output(owner, range, |offset| cache.cell(&layout, offset));
        pivot.attempt = Some(range);
        match placed {
            Ok(()) => {
                pivot.error = None;
                pivot.layout = Some(layout);
                self.mark_pivot_cells_dirty(owner, changed)
            }
            Err(error) => {
                let vacated = self.mark_pivot_cells_dirty(owner, changed);
                self.show_pivot_error(owner, pivot, error, Some(range)) || vacated
            }
        }
    }

    /// Builds the cache when the definition or the source bounds changed,
    /// otherwise updates the pending rows and headers. Leaves the pending
    /// work for the caller to clear.
    fn refresh_pivot_cache(&self, pivot: &mut Pivot) -> Result<(), FormulaError> {
        let resolved = self.resolve_pivot_source(&pivot.saved.source);
        let (rect, names) = match resolved {
            Ok(resolved) => resolved,
            Err(error) => {
                pivot.cache = None;
                pivot.source = None;
                return Err(error);
            }
        };
        let source = StoreSource {
            sheet: &self.sheets[rect.sheet],
            strings: &self.strings,
            rect,
            names,
        };

        let pending = &mut pivot.pending;
        match pivot.cache.as_mut() {
            Some(cache) if !pending.rebuild && pivot.source == Some(rect) => {
                if pending.headers {
                    cache.update_headers(&source);
                }

                pending.rows.sort_unstable();
                pending.rows.dedup();
                cache.update_rows(&pending.rows, &source);
            }
            _ => {
                // Free the old cache before building the new one, and leave
                // `None` when the build fails.
                pivot.cache = None;
                pivot.source = Some(rect);
                pivot.cache = Some(PivotCache::build(&pivot.saved.definition, &source)?);
            }
        }
        Ok(())
    }

    /// Writes the changed `offsets` of installed output in place.
    fn write_pivot_cells(
        &mut self,
        owner: usize,
        anchor: CellKey,
        cache: &PivotCache,
        layout: &PivotLayout,
        offsets: &[usize],
    ) -> bool {
        let data = &mut self.sheets[owner];
        let mut changed = Vec::new();
        for &offset in offsets {
            // Changes are value cells below the header rows: the anchor is a
            // header cell, and a changed header forces a relayout instead.
            debug_assert!(
                offset >= layout.header_rows * layout.cols,
                "a changed offset inside the header rows"
            );

            let cell = (
                anchor.0 + (offset / layout.cols) as u32,
                anchor.1 + (offset % layout.cols) as u32,
            );
            let value = cache.cell(layout, offset);
            let index = data.cells.idx(cell.0 as usize, cell.1 as usize);
            let slot = calculated_slot(&mut self.strings, &value);
            if data.cells.calculated_cell_at(index) != Some(slot) {
                assert!(
                    data.cells.set_derived(index, slot.0, slot.1),
                    "calculated overlay allocation failed"
                );
                changed.push(cell);
            }
        }
        self.mark_pivot_cells_dirty(owner, changed)
    }

    /// Shows `error` at the pivot's anchor and keeps `attempt` (or the anchor
    /// cell) registered, so clearing a blocker or the anchor retries it.
    fn show_pivot_error(
        &mut self,
        owner: usize,
        pivot: &mut Pivot,
        error: FormulaError,
        attempt: Option<SpillRange>,
    ) -> bool {
        pivot.layout = None;
        pivot.error = Some(error);
        let (changed, attempt) = self.show_output_error(owner, pivot.saved.anchor, error, attempt);
        pivot.attempt = attempt;
        changed
    }

    /// Moves range sources and anchors with a row or column insert or delete
    /// on `sheet`. Core also remaps or drops field indices and sends the
    /// definitions again; this step only moves the spans and marks the moved
    /// pivots pending. The edit cleared the sheet's spills, so the moved
    /// pivots rebuild and place their output again.
    pub(crate) fn shift_pivots(&mut self, sheet: usize, axis: ShiftAxis, at: u32, delta: i64) {
        let extent_after = match axis {
            ShiftAxis::Rows => self.sheets[sheet].cells.row_count(),
            ShiftAxis::Cols => self.sheets[sheet].cells.n_cols(),
        };
        let Some(registry) = self.pivots.as_deref_mut() else {
            return;
        };
        for (&owner, pivots) in &mut registry.sheets {
            for pivot in pivots {
                let definition = &mut pivot.saved;
                let mut moved = owner == sheet;
                if let SourceRef::Range {
                    sheet: source_sheet,
                    rows,
                    cols,
                } = &mut definition.source
                {
                    if *source_sheet == sheet {
                        moved = true;
                        let span = match axis {
                            ShiftAxis::Rows => rows,
                            ShiftAxis::Cols => cols,
                        };
                        match shift_range(span.0, span.1, at, delta) {
                            Some(shifted) => *span = shifted,
                            None => definition.source = SourceRef::Invalid,
                        }
                    }
                }
                if owner == sheet {
                    let coordinate = match axis {
                        ShiftAxis::Rows => &mut definition.anchor.0,
                        ShiftAxis::Cols => &mut definition.anchor.1,
                    };
                    *coordinate = shift_anchor(*coordinate, at, delta, extent_after);
                    pivot.layout = None;
                    pivot.attempt = None;
                }
                if moved {
                    pivot.pending.rebuild = true;
                    pivot.pending.readmit = true;
                }
            }
        }
    }

    /// Drops the pivots of a removed sheet; pivots that read it show `#REF!`.
    pub(crate) fn forget_pivot_sheet(&mut self, sheet: usize) {
        let Some(registry) = self.pivots.as_deref_mut() else {
            return;
        };
        registry.sheets.remove(&sheet);
        for pivot in registry.pivots_mut() {
            pivot.pending.rebuild = true;
        }
        if registry.sheets.is_empty() {
            self.pivots = None;
        }
    }

    /// A table changed: pivots that read a table resolve and build again.
    pub(crate) fn invalidate_table_pivots(&mut self) {
        let Some(registry) = self.pivots.as_deref_mut() else {
            return;
        };
        for pivot in registry.pivots_mut() {
            if matches!(pivot.saved.source, SourceRef::Table(_)) {
                pivot.pending.rebuild = true;
            }
        }
    }

    /// Aggregate updates of pivot `index` on `sheet` since its cache was
    /// built: the measure of incremental work, which no value shows.
    #[cfg(test)]
    pub(crate) fn pivot_aggregate_updates(&self, sheet: usize, index: usize) -> usize {
        self.pivots
            .as_deref()
            .and_then(|registry| registry.sheets.get(&sheet)?.get(index)?.cache.as_ref())
            .map_or(0, |cache| cache.aggregate_updates)
    }

    #[cfg(test)]
    pub(crate) fn pivot_output_reads(&self, sheet: usize, index: usize) -> usize {
        self.pivots
            .as_deref()
            .and_then(|registry| registry.sheets.get(&sheet)?.get(index)?.cache.as_ref())
            .map_or(0, |cache| cache.output_reads.get())
    }
}

/// Records the source changes of one finished sheet in `pending`.
fn capture_source(
    data: &SheetData,
    rect: SourceRect,
    capture_dirty: bool,
    affected: Option<&FxHashSet<AbsCellKey>>,
    pending: &mut Pending,
) {
    if pending.rebuild {
        return;
    }
    if capture_dirty {
        match data.formulas.dirty_seeds() {
            DirtySeeds::All => {
                pending.rebuild = true;
                return;
            }
            DirtySeeds::Cells(cells) => {
                for &cell in cells {
                    rect.touch(cell, pending);
                }
            }
            DirtySeeds::Ranges(rects) => {
                for &dirty in rects {
                    rect.touch_rect(dirty, pending);
                }
            }
        }
    }
    // Formula results stored in the pass are not dirty seeds.
    for key in affected.into_iter().flatten() {
        if key.sheet as usize == rect.sheet {
            rect.touch(key.local(), pending);
        }
    }
    // Rebuilding reads each row once; updating more rows than the source
    // holds would cost more.
    if pending.rows.len() > rect.rows as usize {
        pending.rows = Vec::new();
        pending.rebuild = true;
    }
}
