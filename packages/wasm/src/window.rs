//! Bulk render-window assembly: one boundary crossing per visible window,
//! including the conditional-format rules evaluated against it.

use rustc_hash::{FxHashMap, FxHashSet};

use wasm_bindgen::prelude::*;

use crate::calc::{translate_relative_refs, Ast};
use crate::cells::{payload_num, payload_str_id};
use crate::memory::{StoreMemoryStats, SHEET_INDEXES_METADATA};
use crate::query::matches_needle;
use crate::sheet::{formula_error_with_entry, SheetData};
use crate::store::CellStore;
use crate::types::{
    cell_key, AbsCellKey, EvalResult, FormulaError, StringStorage, Value, KIND_BOOL, KIND_EMPTY,
    KIND_FORMULA, KIND_NUMBER, KIND_STRING, NO_STRING,
};

/// Global style id of a cell with no style of its own.
const NO_STYLE_ID: u32 = 0;

/// One conditional-format predicate, mirroring the host's rule kinds. String
/// needles for case-insensitive `Contains` are pre-lowercased at rule-set time;
/// formula ASTs are parsed once and translated from their stored anchor per cell.
enum CondPred {
    GtNum(f64),
    LtNum(f64),
    EqNum(f64),
    EqStr(String),
    EqEmpty,
    Contains {
        needle: String,
        match_case: bool,
    },
    Formula {
        ast: Ast,
        anchor_row: u32,
        anchor_col: u32,
    },
}

/// One conditional-format rule: a normalized cell rectangle plus a predicate.
/// The window read reports per-cell matches as a bitmask (rule index = bit),
/// so the host merges styles only for matched cells; predicates evaluate here,
/// where the cell data lives.
struct CondRule {
    r0: u32,
    c0: u32,
    r1: u32,
    c1: u32,
    pred: CondPred,
    stop_if_true: bool,
}

/// Parsed conditional-format rules per sheet handle, synced from the host and
/// evaluated per window. Not transferred on memory release: the host re-sends
/// rules, and parsed ASTs would otherwise need their own codec.
#[derive(Default)]
pub(crate) struct ConditionalRules {
    by_sheet: FxHashMap<usize, Vec<CondRule>>,
}

impl ConditionalRules {
    fn for_sheet(&self, sheet: usize) -> &[CondRule] {
        self.by_sheet.get(&sheet).map_or(&[], Vec::as_slice)
    }

    /// A removed sheet handle never renders again.
    pub(crate) fn remove_sheet(&mut self, sheet: usize) {
        self.by_sheet.remove(&sheet);
    }

    pub(crate) fn add_memory_stats(&self, stats: &mut StoreMemoryStats) {
        let metadata = stats.owner_mut(SHEET_INDEXES_METADATA);
        metadata
            .add_hash_table::<usize, Vec<CondRule>>(self.by_sheet.len(), self.by_sheet.capacity());
        for rules in self.by_sheet.values() {
            metadata.add_vec::<CondRule>(rules.len(), rules.capacity());
            for rule in rules {
                let text = match &rule.pred {
                    CondPred::EqStr(value) => Some(value),
                    CondPred::Contains { needle, .. } => Some(needle),
                    _ => None,
                };
                if let Some(text) = text {
                    metadata.add_payload(text.len(), text.capacity());
                }
            }
        }
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Replace a sheet's conditional-format rules. Packed columnar encoding,
    /// one entry per rule: `kinds` 0 gt / 1 lt / 2 eqNum / 3 eqStr / 4 eqEmpty /
    /// 5 contains / 6 boolean formula; `bounds` = normalized `[r0, c0, r1, c1]`
    /// per rule; `nums` carries the numeric operand; `strs` the text/formula
    /// operand; `flags` bit 0 = match-case for `contains`, bit 1 = stop-if-true.
    /// Formula strings are parsed once here, never once per visible cell.
    #[wasm_bindgen(js_name = setConditionalRules)]
    pub fn set_conditional_rules(
        &mut self,
        sheet: usize,
        kinds: &[u8],
        bounds: &[u32],
        nums: &[f64],
        strs: Vec<String>,
        flags: &[u8],
    ) {
        let formula_asts: Vec<Option<Ast>> = kinds
            .iter()
            .zip(strs.iter())
            .take(32)
            .map(|(&kind, source)| {
                (kind == 6 && source.len() <= 8_192)
                    .then(|| self.parse_formula_entry(source, sheet as u32, 0, 0).ast)
                    .flatten()
            })
            .collect();

        if self.sheets.get(sheet).is_none() {
            return;
        }

        let mut rules: Vec<CondRule> = Vec::with_capacity(kinds.len().min(32));

        for (i, (&kind, text)) in kinds.iter().zip(strs).take(32).enumerate() {
            let b = i * 4;
            let (Some(&r0), Some(&c0), Some(&r1), Some(&c1)) = (
                bounds.get(b),
                bounds.get(b + 1),
                bounds.get(b + 2),
                bounds.get(b + 3),
            ) else {
                break;
            };

            let num = nums.get(i).copied().unwrap_or(0.0);
            let flag = flags.get(i).copied().unwrap_or(0);
            let match_case = flag & 1 != 0;

            let pred = match kind {
                0 => CondPred::GtNum(num),
                1 => CondPred::LtNum(num),
                2 => CondPred::EqNum(num),
                3 => CondPred::EqStr(text),
                4 => CondPred::EqEmpty,
                5 => CondPred::Contains {
                    needle: if match_case {
                        text
                    } else {
                        text.to_lowercase()
                    },
                    match_case,
                },
                6 => CondPred::Formula {
                    ast: formula_asts
                        .get(i)
                        .and_then(Clone::clone)
                        .unwrap_or(Ast::InvalidRef),
                    anchor_row: r0,
                    anchor_col: c0,
                },
                _ => continue,
            };

            rules.push(CondRule {
                r0,
                c0,
                r1,
                c1,
                pred,
                stop_if_true: flag & 2 != 0,
            });
        }

        self.conditional_rules.by_sheet.insert(sheet, rules);
    }
}

#[wasm_bindgen]
impl CellStore {
    /// One bulk read of a rectangular window for the renderer. Returns
    /// contiguous packed cell data (row-major over `rows x cols`) with pool IDs
    /// and window-local formula-error strings, avoiding per-cell boundary reads.
    #[wasm_bindgen(js_name = getWindow)]
    pub fn get_window(
        &self,
        sheet: usize,
        row_start: usize,
        row_end: usize,
        cols: &[u32],
    ) -> WindowView {
        let Some(s) = self.sheets.get(sheet) else {
            return WindowView::empty(self.strings.epoch);
        };
        let row_start = row_start.min(s.cells.row_count());
        let row_end = row_end.min(s.cells.row_count());
        let n_rows = row_end.saturating_sub(row_start);
        let n_cols = cols.len();
        let Some(mut cells) = WindowCells::new(n_rows, n_cols) else {
            return WindowView::empty(self.strings.epoch);
        };

        for (col_index, &col_u) in cols.iter().enumerate() {
            let col = col_u as usize;
            if col >= s.cells.n_cols() {
                continue;
            }

            if let Some(column) = s.cells.dense_column(col) {
                for row in row_start..row_end {
                    let dst = (row - row_start) * n_cols + col_index;
                    cells.fill(s, row, col, dst, Some(column.cell(row)));
                }
                continue;
            }

            let mut start = s.cells.idx(row_start, col);
            let end = s.cells.idx(row_end, col);
            while start < end {
                let run = s.cells.run(start, end);
                run.visit_paged(|src, resolved| {
                    let row = src - col * s.cells.row_count();
                    let dst = (row - row_start) * n_cols + col_index;
                    cells.fill(s, row, col, dst, resolved);
                });
                start = run.end;
            }
        }

        let row_start_u = row_start as u32;
        let cond_matches =
            cond_matches_for_window(self, sheet, |ri| row_start_u + ri as u32, cols, &cells);

        WindowView::new(self.strings.epoch, cells, cond_matches)
    }

    /// Bulk read of an explicit row list (sorted/filtered views) — same output
    /// shape as `get_window`, rows taken from `rows` rather than a range.
    #[wasm_bindgen(js_name = getWindowRows)]
    pub fn get_window_rows(&self, sheet: usize, rows: &[u32], cols: &[u32]) -> WindowView {
        let Some(s) = self.sheets.get(sheet) else {
            return WindowView::empty(self.strings.epoch);
        };
        let n_cols = cols.len();
        let Some(mut cells) = WindowCells::new(rows.len(), n_cols) else {
            return WindowView::empty(self.strings.epoch);
        };

        for (col_index, &col_u) in cols.iter().enumerate() {
            let col = col_u as usize;
            if col >= s.cells.n_cols() {
                continue;
            }

            if let Some(column) = s.cells.dense_column(col) {
                for (row_index, &row) in rows.iter().enumerate() {
                    let row = row as usize;
                    if row < s.cells.row_count() {
                        let dst = row_index * n_cols + col_index;
                        cells.fill(s, row, col, dst, Some(column.cell(row)));
                    }
                }
                continue;
            }

            s.cells
                .visit_paged_rows(rows, col, |row_index, row, resolved| {
                    let dst = row_index * n_cols + col_index;
                    cells.fill(s, row, col, dst, resolved);
                });
        }

        let cond_matches = cond_matches_for_window(
            self,
            sheet,
            |ri| rows.get(ri).copied().unwrap_or(u32::MAX),
            cols,
            &cells,
        );

        WindowView::new(self.strings.epoch, cells, cond_matches)
    }
}

/// Cell buffers of one render window, row-major over `n_rows x n_cols`.
struct WindowCells {
    n_rows: usize,
    n_cols: usize,
    kind: Vec<u8>,
    num: Vec<f64>,
    str_local: Vec<i32>,
    style_local: Vec<u32>,
    string_ids: Vec<u32>,
    /// Window-local formula-error sentinels, indexed by `str_local`.
    strings: Vec<String>,
    style_dict: Vec<u32>,
    error_slots: [i32; FormulaError::COUNT],
}

impl WindowCells {
    /// `None` when the window's cell count overflows `usize`.
    fn new(n_rows: usize, n_cols: usize) -> Option<Self> {
        let cells = n_rows.checked_mul(n_cols)?;
        Some(Self {
            n_rows,
            n_cols,
            kind: vec![KIND_EMPTY; cells],
            num: vec![0.0f64; cells],
            str_local: vec![-1i32; cells],
            // Slots stay 0 for cells the window skips (past the sheet's edge,
            // or not loaded), so local slot 0 must mean "no style".
            style_local: vec![0u32; cells],
            string_ids: vec![NO_STRING; cells],
            strings: Vec::new(),
            style_dict: vec![NO_STYLE_ID],
            error_slots: [-1i32; FormulaError::COUNT],
        })
    }

    /// `None` marks an unloaded cell; its payload must not be read before this check.
    #[inline(always)]
    fn fill(
        &mut self,
        sheet: &SheetData,
        row: usize,
        col: usize,
        dst: usize,
        resolved: Option<(u8, u64, u32)>,
    ) {
        let Some((stored_kind, payload, style)) = resolved else {
            self.kind[dst] = KIND_STRING;
            self.str_local[dst] = local_error_index(
                FormulaError::Loading,
                &mut self.error_slots,
                &mut self.strings,
            );
            return;
        };

        self.kind[dst] = stored_kind;
        self.style_local[dst] = local_style_index(style, &mut self.style_dict);

        match stored_kind {
            KIND_NUMBER | KIND_BOOL => self.num[dst] = payload_num(payload),
            KIND_STRING => {
                let pool_id = payload_str_id(payload);
                if pool_id == NO_STRING {
                    self.kind[dst] = KIND_EMPTY;
                } else {
                    self.string_ids[dst] = pool_id;
                }
            }
            KIND_FORMULA => {
                let key = cell_key(row, col);
                let entry = key.and_then(|key| sheet.formulas.get(key));
                let error = key.and_then(|key| formula_error_with_entry(sheet, key, entry));
                if let Some(error) = error {
                    self.kind[dst] = KIND_STRING;
                    self.str_local[dst] =
                        local_error_index(error, &mut self.error_slots, &mut self.strings);
                } else {
                    self.kind[dst] = KIND_NUMBER;
                    self.num[dst] = payload_num(payload);
                }
            }
            _ => {}
        }
    }
}

/// Window-local style index: linear scan over the (tiny) per-window dict. A
/// visible window holds a handful of distinct styles, so a scan beats a
/// per-frame `HashMap` allocation and hashing on the 60Hz render path.
fn local_style_index(style_id: u32, style_dict: &mut Vec<u32>) -> u32 {
    if let Some(pos) = style_dict.iter().position(|&s| s == style_id) {
        return pos as u32;
    }
    style_dict.push(style_id);
    (style_dict.len() - 1) as u32
}

/// Window-local index of a formula-error sentinel; `slots` has one entry per
/// `FormulaError` variant and requires no allocation.
fn local_error_index(
    error: FormulaError,
    slots: &mut [i32; FormulaError::COUNT],
    strings: &mut Vec<String>,
) -> i32 {
    let slot = &mut slots[error.slot()];
    if *slot < 0 {
        *slot = strings.len() as i32;
        strings.push(error.sentinel().to_string());
    }
    *slot
}

/// Per-cell conditional-format matches for one window: bit `i` set means rule
/// `i` (capped at 32 rules) matched the cell's displayed value. Empty when the
/// sheet has no rules, so rule-free windows pay nothing. Predicates evaluate
/// against the window OUTPUT arrays — the same displayed values the host would
/// otherwise re-derive in JS — including formula results and error sentinels.
fn cond_matches_for_window<F: Fn(usize) -> u32>(
    store: &CellStore,
    sheet_index: usize,
    data_row_at: F,
    cols: &[u32],
    cells: &WindowCells,
) -> Vec<u32> {
    let n_rows = cells.n_rows;
    let rules = store.conditional_rules.for_sheet(sheet_index);
    if rules.is_empty() || n_rows == 0 || cols.is_empty() {
        return Vec::new();
    }

    let n_cols = cols.len();
    let mut matches = vec![0u32; n_rows * n_cols];
    let mut memo: FxHashMap<AbsCellKey, EvalResult> = FxHashMap::default();
    let mut visiting: FxHashSet<AbsCellKey> = FxHashSet::default();
    for ri in 0..n_rows {
        let data_row = data_row_at(ri);
        for (cj, &col) in cols.iter().enumerate() {
            let dst = ri * n_cols + cj;
            for (bit, rule) in rules.iter().take(32).enumerate() {
                let covered =
                    data_row >= rule.r0 && data_row <= rule.r1 && col >= rule.c0 && col <= rule.c1;
                if !covered {
                    continue;
                }
                let hit = match &rule.pred {
                    CondPred::Formula {
                        ast,
                        anchor_row,
                        anchor_col,
                    } => {
                        let mut translated = ast.clone();
                        translate_relative_refs(
                            &mut translated,
                            i64::from(data_row) - i64::from(*anchor_row),
                            i64::from(col) - i64::from(*anchor_col),
                        );
                        memo.clear();
                        visiting.clear();
                        match store.eval_conditional_ast(
                            &translated,
                            sheet_index,
                            data_row,
                            col,
                            &mut memo,
                            &mut visiting,
                        ) {
                            Value::Bool(value) => value,
                            Value::Number(value) => value != 0.0,
                            _ => false,
                        }
                    }
                    predicate => cond_pred_matches(
                        predicate,
                        cells.kind[dst],
                        cells.num[dst],
                        cell_text(
                            cells.string_ids[dst],
                            cells.str_local[dst],
                            &store.strings,
                            &cells.strings,
                        ),
                    ),
                };
                if hit {
                    matches[dst] |= 1 << bit;
                    if rule.stop_if_true {
                        break;
                    }
                }
            }
        }
    }
    matches
}

fn cond_pred_matches(pred: &CondPred, kind: u8, num: f64, text: Option<&str>) -> bool {
    match pred {
        CondPred::GtNum(v) => kind == KIND_NUMBER && num > *v,
        CondPred::LtNum(v) => kind == KIND_NUMBER && num < *v,
        CondPred::EqNum(v) => kind == KIND_NUMBER && num == *v,
        CondPred::EqEmpty => kind == KIND_EMPTY,
        CondPred::EqStr(s) => kind == KIND_STRING && text == Some(s.as_str()),
        CondPred::Contains { needle, match_case } => {
            if kind != KIND_STRING || needle.is_empty() {
                return false;
            }
            text.is_some_and(|hay| matches_needle(hay, needle, !match_case, false))
        }
        CondPred::Formula { .. } => false,
    }
}

/// Displayed text of a window cell: pooled user/formula text, or the
/// window-local list (formula error sentinels).
fn cell_text<'a>(
    pool_id: u32,
    local_id: i32,
    pool: &'a StringStorage,
    local_strings: &'a [String],
) -> Option<&'a str> {
    if pool_id != NO_STRING {
        pool.get(pool_id)
    } else if local_id >= 0 {
        local_strings.get(local_id as usize).map(String::as_str)
    } else {
        None
    }
}

const WINDOW_PACKED_MAGIC: u32 = 0x3157_4e53;
const WINDOW_PACKED_VERSION: u32 = 1;
const WINDOW_PACKED_HEADER_BYTES: usize = 10 * std::mem::size_of::<u32>();

/// A bulk window of resolved cells, row-major over `n_rows x n_cols`.
#[wasm_bindgen]
pub struct WindowView {
    string_pool_epoch: u32,
    n_rows: u32,
    n_cols: u32,
    packed: Vec<u8>,
    strings: Vec<String>,
}

impl WindowView {
    fn new(string_pool_epoch: u32, cells: WindowCells, cond_matches: Vec<u32>) -> Self {
        let packed = pack_window(&cells, &cond_matches).unwrap_or_default();
        Self {
            string_pool_epoch,
            n_rows: cells.n_rows.try_into().unwrap_or_default(),
            n_cols: cells.n_cols.try_into().unwrap_or_default(),
            packed,
            strings: cells.strings,
        }
    }

    pub(crate) fn empty(epoch: u32) -> Self {
        let cells = WindowCells::new(0, 0).expect("an empty window has no cells");
        Self::new(epoch, cells, Vec::new())
    }
}

fn pack_window(cells: &WindowCells, cond_matches: &[u32]) -> Option<Vec<u8>> {
    let WindowCells {
        n_rows,
        n_cols,
        kind,
        num,
        str_local,
        style_local,
        string_ids,
        strings,
        style_dict,
        ..
    } = cells;
    let cell_count = n_rows.checked_mul(*n_cols)?;
    if kind.len() != cell_count
        || num.len() != cell_count
        || str_local.len() != cell_count
        || style_local.len() != cell_count
        || string_ids.len() != cell_count
        || (!cond_matches.is_empty() && cond_matches.len() != cell_count)
    {
        return None;
    }

    let numbers_start = align_to_8(WINDOW_PACKED_HEADER_BYTES.checked_add(cell_count)?)?;
    let string_ids_start = numbers_start.checked_add(cell_count.checked_mul(8)?)?;
    let string_index_start = string_ids_start.checked_add(cell_count.checked_mul(4)?)?;
    let style_index_start = string_index_start.checked_add(cell_count.checked_mul(4)?)?;
    let style_dict_start = style_index_start.checked_add(cell_count.checked_mul(4)?)?;
    let cond_matches_start = style_dict_start.checked_add(style_dict.len().checked_mul(4)?)?;
    let total_bytes = cond_matches_start.checked_add(cond_matches.len().checked_mul(4)?)?;

    let header = [
        WINDOW_PACKED_MAGIC,
        WINDOW_PACKED_VERSION,
        WINDOW_PACKED_HEADER_BYTES.try_into().ok()?,
        total_bytes.try_into().ok()?,
        (*n_rows).try_into().ok()?,
        (*n_cols).try_into().ok()?,
        cell_count.try_into().ok()?,
        style_dict.len().try_into().ok()?,
        cond_matches.len().try_into().ok()?,
        strings.len().try_into().ok()?,
    ];
    let mut packed = Vec::with_capacity(total_bytes);
    for word in header {
        packed.extend_from_slice(&word.to_le_bytes());
    }
    packed.extend_from_slice(kind);
    packed.resize(numbers_start, 0);
    for value in num {
        packed.extend_from_slice(&value.to_le_bytes());
    }
    for value in string_ids {
        packed.extend_from_slice(&value.to_le_bytes());
    }
    for value in str_local {
        packed.extend_from_slice(&value.to_le_bytes());
    }
    for value in style_local {
        packed.extend_from_slice(&value.to_le_bytes());
    }
    for value in style_dict {
        packed.extend_from_slice(&value.to_le_bytes());
    }
    for value in cond_matches {
        packed.extend_from_slice(&value.to_le_bytes());
    }
    debug_assert_eq!(packed.len(), total_bytes);
    Some(packed)
}

fn align_to_8(value: usize) -> Option<usize> {
    value.checked_add(7).map(|end| end & !7)
}

#[wasm_bindgen]
impl WindowView {
    #[wasm_bindgen(js_name = stringPoolEpoch)]
    pub fn string_pool_epoch(&self) -> u32 {
        self.string_pool_epoch
    }

    #[wasm_bindgen(getter, js_name = nRows)]
    pub fn n_rows(&self) -> u32 {
        self.n_rows
    }

    #[wasm_bindgen(getter, js_name = nCols)]
    pub fn n_cols(&self) -> u32 {
        self.n_cols
    }

    /// Consume the complete fixed-width window payload. The returned
    /// `Uint8Array` is copied by wasm-bindgen into JS-owned memory.
    #[wasm_bindgen(js_name = takePacked)]
    pub fn take_packed(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.packed)
    }

    /// Consume formula-error sentinel strings referenced by the packed data.
    #[wasm_bindgen(js_name = takeStrings)]
    pub fn take_strings(&mut self) -> Vec<String> {
        std::mem::take(&mut self.strings)
    }
}

#[cfg(test)]
mod tests {
    use super::{pack_window, WindowCells};

    #[test]
    fn packed_window_rejects_mismatched_cell_buffers() {
        let mut cells = WindowCells::new(1, 1).unwrap();
        cells.kind.clear();
        assert!(pack_window(&cells, &[]).is_none());

        let cells = WindowCells::new(1, 1).unwrap();
        assert!(pack_window(&cells, &[0, 0]).is_none());
    }
}
