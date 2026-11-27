//! Bulk render-window assembly: one boundary crossing per visible window,
//! including the conditional-format rules evaluated against it.

use rustc_hash::FxHashMap;

use crate::formula_slots::{FormulaResults, FormulaStore};
use wasm_bindgen::prelude::*;

use crate::calc::{relative_reach, translate_relative_refs, Ast, Func, SHEET_COLS, SHEET_ROWS};
use crate::cells::{payload_num, payload_str_id};
use crate::memory::{StoreMemoryStats, SHEET_INDEXES_METADATA};
use crate::query::matches_needle;
use crate::sheet::{formula_error_with_entry, SheetData};
use crate::store::CellStore;
use crate::types::{
    cell_key, FormulaError, StringStorage, Value, KIND_BOOL, KIND_EMPTY, KIND_FORMULA, KIND_NUMBER,
    KIND_STRING, NO_STRING,
};

/// Global style id of a cell with no style of its own.
const NO_STYLE_ID: u32 = 0;

/// One conditional-format predicate, mirroring the host's rule kinds. String
/// needles for case-insensitive `Contains` are pre-lowercased at rule-set time;
/// formula ASTs are parsed once, written for the rule range's top-left cell,
/// and read at every other covered cell with that cell's distance from it.
enum CondPred {
    GtNum(f64),
    LtNum(f64),
    EqNum(f64),
    EqStr(String),
    EqEmpty,
    Contains { needle: String, match_case: bool },
    Formula(FormulaRule),
}

/// A formula rule's parsed expression, written for the rule range's top-left
/// cell, and its [`relative_reach`]: how far its references can move before
/// one leaves the sheet.
struct FormulaRule {
    ast: Ast,
    reach: (u32, u32),
}

/// Whether `ast` has one value at every cell of a row: no reference moves
/// with the column, and nothing reads the column of the cell it is read for
/// or draws a random number for each cell. Defined names, table
/// references, and custom and LAMBDA calls count as varying, since their
/// content is not read here.
fn same_across_row(ast: &Ast) -> bool {
    match ast {
        Ast::Cell(.., flags) | Ast::AbsCell(.., flags) => flags.col_abs(),
        Ast::SheetCell(reference) => reference.flags.col_abs(),
        Ast::Range(.., flags) | Ast::AbsRange(.., flags) => {
            flags.start.col_abs() && flags.end.col_abs()
        }
        Ast::SheetRange(reference) => {
            reference.flags.start.col_abs() && reference.flags.end.col_abs()
        }
        Ast::SheetSpan(span) => span.flags.start.col_abs() && span.flags.end.col_abs(),
        Ast::Func(
            Func::Column | Func::Cell | Func::Indirect | Func::Rand | Func::RandBetween,
            ..,
        ) => false,
        Ast::Func(..)
        | Ast::Bin(..)
        | Ast::Cmp(..)
        | Ast::Neg(..)
        | Ast::Pos(..)
        | Ast::Percent(..)
        | Ast::LetSlot { .. } => !ast.any_child(&mut |child| !same_across_row(child)),
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::InvalidRef
        | Ast::LetName { .. }
        | Ast::Array(_) => true,
        Ast::Name(_)
        | Ast::DefinedName(..)
        | Ast::UnresolvedStructured(_)
        | Ast::Structured(_)
        | Ast::UnknownFunc(_) => false,
        #[cfg(feature = "analysis")]
        Ast::Lambda(_) | Ast::Parameter { .. } | Ast::RegexPattern(_) => false,
    }
}

/// A cell a rule covers, and its distance in rows and columns from the rule
/// range's top-left cell.
#[derive(Clone, Copy)]
struct CoveredCell {
    target: (u32, u32),
    shift: (u32, u32),
}

impl FormulaRule {
    /// Whether the formula holds at `cell`. The expression is read in place
    /// with the cell's shift. Where the shift would move a reference out of
    /// the sheet, or the formula reads a defined name holding a relative
    /// reference, a translated copy keeps the result of placing the formula
    /// at the cell: `#REF!` for the moved reference, the name where it was.
    fn holds(
        &self,
        store: &CellStore,
        sheet: usize,
        cell: CoveredCell,
        results: &mut FormulaResults,
    ) -> bool {
        let CoveredCell { target, shift } = cell;
        results.clear();
        let in_sheet = shift.0.saturating_add(self.reach.0) <= SHEET_ROWS
            && shift.1.saturating_add(self.reach.1) <= SHEET_COLS;
        let result = if in_sheet {
            store.eval_conditional_ast(&self.ast, sheet, target, shift, results)
        } else {
            let translated = translated_formula(&self.ast, shift);
            store.eval_conditional_ast(&translated, sheet, target, (0, 0), results)
        };
        match result {
            Value::Bool(holds) => holds,
            Value::Number(number) => number != 0.0,
            Value::Text(_) | Value::Blank | Value::Error(_) => false,
        }
    }
}

/// A copy of `ast` placed `shift` rows and columns further, for the rare
/// cell [`FormulaRule::holds`] cannot read in place.
#[cold]
#[inline(never)]
fn translated_formula(ast: &Ast, shift: (u32, u32)) -> Ast {
    let mut translated = ast.clone();
    translate_relative_refs(&mut translated, i64::from(shift.0), i64::from(shift.1));
    translated
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
    /// A formula rule that holds alike at every cell of a row
    /// ([`same_across_row`]), so a window reads it once per row. It sits in
    /// the rule's padding, so a rule takes no more memory for it.
    same_across_row: bool,
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
                    CondPred::GtNum(_)
                    | CondPred::LtNum(_)
                    | CondPred::EqNum(_)
                    | CondPred::EqEmpty
                    | CondPred::Formula(_) => None,
                };
                if let Some(payload) = text {
                    metadata.add_payload(payload.len(), payload.capacity());
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

            let num = nums.get(i).copied().unwrap_or_default();
            let flag = flags.get(i).copied().unwrap_or_default();
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
                6 => {
                    let ast = formula_asts
                        .get(i)
                        .and_then(Clone::clone)
                        .unwrap_or(Ast::InvalidRef);
                    let reach = relative_reach(&ast);
                    CondPred::Formula(FormulaRule { ast, reach })
                }
                _ => continue,
            };

            let row_invariant = if let CondPred::Formula(formula) = &pred {
                same_across_row(&formula.ast)
            } else {
                false
            };
            rules.push(CondRule {
                r0,
                c0,
                r1,
                c1,
                pred,
                stop_if_true: flag & 2 != 0,
                same_across_row: row_invariant,
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
        let clamped_row_start = row_start.min(s.cells.row_count());
        let clamped_row_end = row_end.min(s.cells.row_count());
        let n_rows = clamped_row_end.saturating_sub(clamped_row_start);
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
                for row in clamped_row_start..clamped_row_end {
                    let dst = (row - clamped_row_start) * n_cols + col_index;
                    cells.fill(
                        s,
                        row,
                        col,
                        dst,
                        Some(column.cell(row)),
                        &self.formula_slots,
                    );
                }
                continue;
            }

            let mut start = s.cells.idx(clamped_row_start, col);
            let end = s.cells.idx(clamped_row_end, col);
            while start < end {
                let run = s.cells.run(start, end);
                run.visit_paged(|src, resolved| {
                    let row = src - col * s.cells.row_count();
                    let dst = (row - clamped_row_start) * n_cols + col_index;
                    cells.fill(s, row, col, dst, resolved, &self.formula_slots);
                });
                start = run.end;
            }
        }

        let row_start_u = clamped_row_start as u32;
        let cond_matches =
            cond_matches_for_window(self, sheet, |ri| row_start_u + ri as u32, cols, &cells);

        WindowView::new(self.strings.epoch, cells, &cond_matches)
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
                    let sheet_row = row as usize;
                    if sheet_row < s.cells.row_count() {
                        let dst = row_index * n_cols + col_index;
                        cells.fill(
                            s,
                            sheet_row,
                            col,
                            dst,
                            Some(column.cell(sheet_row)),
                            &self.formula_slots,
                        );
                    }
                }
                continue;
            }

            s.cells
                .visit_paged_rows(rows, col, |row_index, row, resolved| {
                    let dst = row_index * n_cols + col_index;
                    cells.fill(s, row, col, dst, resolved, &self.formula_slots);
                });
        }

        let cond_matches = cond_matches_for_window(
            self,
            sheet,
            |ri| rows.get(ri).copied().unwrap_or(u32::MAX),
            cols,
            &cells,
        );

        WindowView::new(self.strings.epoch, cells, &cond_matches)
    }
}

/// Cells of one render window, row-major over `n_rows x n_cols`, written in
/// place into the packed layout the host decodes: the header, then the kinds,
/// the numbers (8-byte aligned), the pool string ids, the window-local string
/// ids and the window-local style ids. [`WindowCells::into_packed`] appends
/// the style dictionary and the conditional matches and writes the header.
struct WindowCells {
    n_rows: usize,
    n_cols: usize,
    cell_count: usize,
    packed: Vec<u8>,
    numbers_start: usize,
    string_ids_start: usize,
    string_index_start: usize,
    style_index_start: usize,
    /// Window-local formula-error sentinels, indexed by the local string ids.
    strings: Vec<String>,
    style_dict: Vec<u32>,
    error_slots: [i32; FormulaError::COUNT],
}

// A zeroed kind is an empty cell, and the all-ones bytes the pool and local
// string sections start as read back as `NO_STRING` and -1.
const _: () = assert!(
    KIND_EMPTY == 0 && NO_STRING == u32::MAX,
    "a new window's zero and all-ones bytes must read as empty cells without strings"
);

/// Room for the style dictionary after the cell sections: a window holds a
/// handful of styles, so appending it does not move the buffer.
const STYLE_DICT_RESERVE_BYTES: usize = 16 * std::mem::size_of::<u32>();

impl WindowCells {
    /// `None` when the window's byte length overflows `usize`.
    fn new(n_rows: usize, n_cols: usize) -> Option<Self> {
        let cell_count = n_rows.checked_mul(n_cols)?;
        let numbers_start = align_to_8(WINDOW_PACKED_HEADER_BYTES.checked_add(cell_count)?)?;
        let string_ids_start = numbers_start.checked_add(cell_count.checked_mul(8)?)?;
        let string_index_start = string_ids_start.checked_add(cell_count.checked_mul(4)?)?;
        let style_index_start = string_index_start.checked_add(cell_count.checked_mul(4)?)?;
        let cells_end = style_index_start.checked_add(cell_count.checked_mul(4)?)?;
        let mut packed = Vec::with_capacity(cells_end.checked_add(STYLE_DICT_RESERVE_BYTES)?);
        // Header and kinds (empty), padding and numbers (0.0).
        packed.resize(string_ids_start, 0);
        // No pool string, no local string.
        packed.resize(style_index_start, u8::MAX);
        // Slots stay 0 for cells the window skips (past the sheet's edge, or
        // not loaded), so local slot 0 must mean "no style".
        packed.resize(cells_end, 0);
        Some(Self {
            n_rows,
            n_cols,
            cell_count,
            packed,
            numbers_start,
            string_ids_start,
            string_index_start,
            style_index_start,
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
        slots: &FormulaStore,
    ) {
        let Some((stored_kind, payload, style)) = resolved else {
            self.set_error(dst, FormulaError::Loading);
            return;
        };

        let style_index = local_style_index(style, &mut self.style_dict);
        self.write(self.style_index_start, dst, style_index.to_le_bytes());

        match stored_kind {
            KIND_NUMBER | KIND_BOOL => {
                self.set_kind(dst, stored_kind);
                self.write(self.numbers_start, dst, payload_num(payload).to_le_bytes());
            }
            KIND_STRING => {
                // A string cell without pool text stays empty.
                let pool_id = payload_str_id(payload);
                if pool_id != NO_STRING {
                    self.set_kind(dst, KIND_STRING);
                    self.write(self.string_ids_start, dst, pool_id.to_le_bytes());
                }
            }
            KIND_FORMULA => {
                let key = cell_key(row, col);
                let entry = key.and_then(|cell| sheet.formulas.get(cell, slots));
                let error = key.and_then(|cell| formula_error_with_entry(sheet, cell, entry));
                if let Some(found) = error {
                    self.set_error(dst, found);
                } else {
                    self.set_kind(dst, KIND_NUMBER);
                    self.write(self.numbers_start, dst, payload_num(payload).to_le_bytes());
                }
            }
            _ => self.set_kind(dst, stored_kind),
        }
    }

    fn set_kind(&mut self, dst: usize, kind: u8) {
        if let Some(slot) = self.packed.get_mut(WINDOW_PACKED_HEADER_BYTES + dst) {
            *slot = kind;
        }
    }

    /// Show `error`'s sentinel text in cell `dst`.
    fn set_error(&mut self, dst: usize, error: FormulaError) {
        let local = local_error_index(error, &mut self.error_slots, &mut self.strings);
        self.set_kind(dst, KIND_STRING);
        self.write(self.string_index_start, dst, local.to_le_bytes());
    }

    /// Write cell `dst`'s `N`-byte value into the section at `section_start`.
    #[inline(always)]
    fn write<const N: usize>(&mut self, section_start: usize, dst: usize, bytes: [u8; N]) {
        let at = section_start + dst * N;
        if let Some(slot) = self.packed.get_mut(at..at + N) {
            slot.copy_from_slice(&bytes);
        }
    }

    /// Cell `dst`'s `N`-byte value in the section at `section_start`.
    fn read<const N: usize>(&self, section_start: usize, dst: usize) -> Option<[u8; N]> {
        let at = section_start + dst * N;
        self.packed.get(at..at + N)?.try_into().ok()
    }

    fn kind(&self, dst: usize) -> u8 {
        self.packed
            .get(WINDOW_PACKED_HEADER_BYTES + dst)
            .copied()
            .unwrap_or(KIND_EMPTY)
    }

    fn number(&self, dst: usize) -> f64 {
        self.read(self.numbers_start, dst)
            .map_or(0.0, f64::from_le_bytes)
    }

    fn pool_string_id(&self, dst: usize) -> u32 {
        self.read(self.string_ids_start, dst)
            .map_or(NO_STRING, u32::from_le_bytes)
    }

    fn local_string_id(&self, dst: usize) -> i32 {
        self.read(self.string_index_start, dst)
            .map_or(-1, i32::from_le_bytes)
    }

    /// The packed window with `cond_matches` (empty, or one mask per cell)
    /// and the count of its local strings; `None` when `cond_matches` has
    /// another length or a count overflows the header.
    fn into_packed(self, cond_matches: &[u32], local_string_count: usize) -> Option<Vec<u8>> {
        let Self {
            n_rows,
            n_cols,
            cell_count,
            mut packed,
            style_dict,
            ..
        } = self;
        if !cond_matches.is_empty() && cond_matches.len() != cell_count {
            return None;
        }
        packed.reserve_exact((style_dict.len() + cond_matches.len()) * 4);
        for value in style_dict.iter().chain(cond_matches) {
            packed.extend_from_slice(&value.to_le_bytes());
        }
        let header = [
            WINDOW_PACKED_MAGIC,
            WINDOW_PACKED_VERSION,
            WINDOW_PACKED_HEADER_BYTES.try_into().ok()?,
            packed.len().try_into().ok()?,
            n_rows.try_into().ok()?,
            n_cols.try_into().ok()?,
            cell_count.try_into().ok()?,
            style_dict.len().try_into().ok()?,
            cond_matches.len().try_into().ok()?,
            local_string_count.try_into().ok()?,
        ];
        for (slot, word) in packed.as_chunks_mut::<4>().0.iter_mut().zip(header) {
            *slot = word.to_le_bytes();
        }
        Some(packed)
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
        strings.push(error.sentinel().to_owned());
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
    let mut results = FormulaResults::default();
    for ri in 0..n_rows {
        let data_row = data_row_at(ri);
        // The row's result of each rule that holds alike across it.
        let mut row_holds = [None; 32];
        for (cj, &col) in cols.iter().enumerate() {
            let dst = ri * n_cols + cj;
            for (bit, rule) in rules.iter().take(32).enumerate() {
                let covered =
                    data_row >= rule.r0 && data_row <= rule.r1 && col >= rule.c0 && col <= rule.c1;
                if !covered {
                    continue;
                }
                let hit = match &rule.pred {
                    CondPred::Formula(formula) => {
                        let cell = CoveredCell {
                            target: (data_row, col),
                            shift: (data_row - rule.r0, col - rule.c0),
                        };
                        if rule.same_across_row {
                            *row_holds[bit].get_or_insert_with(|| {
                                formula.holds(store, sheet_index, cell, &mut results)
                            })
                        } else {
                            formula.holds(store, sheet_index, cell, &mut results)
                        }
                    }
                    predicate @ (CondPred::GtNum(_)
                    | CondPred::LtNum(_)
                    | CondPred::EqNum(_)
                    | CondPred::EqStr(_)
                    | CondPred::EqEmpty
                    | CondPred::Contains { .. }) => cond_pred_matches(
                        predicate,
                        cells.kind(dst),
                        cells.number(dst),
                        cell_text(
                            cells.pool_string_id(dst),
                            cells.local_string_id(dst),
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
        CondPred::Formula(_) => false,
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
#[derive(Debug)]
#[wasm_bindgen]
pub struct WindowView {
    string_pool_epoch: u32,
    n_rows: u32,
    n_cols: u32,
    packed: Vec<u8>,
    strings: Vec<String>,
}

impl WindowView {
    fn new(string_pool_epoch: u32, mut cells: WindowCells, cond_matches: &[u32]) -> Self {
        let n_rows = cells.n_rows.try_into().unwrap_or_default();
        let n_cols = cells.n_cols.try_into().unwrap_or_default();
        let strings = std::mem::take(&mut cells.strings);
        let packed = cells
            .into_packed(cond_matches, strings.len())
            .unwrap_or_default();
        Self {
            string_pool_epoch,
            n_rows,
            n_cols,
            packed,
            strings,
        }
    }

    pub(crate) fn empty(epoch: u32) -> Self {
        let cells = WindowCells::new(0, 0).expect("an empty window has no cells");
        Self::new(epoch, cells, &[])
    }
}

fn align_to_8(value: usize) -> Option<usize> {
    value.checked_add(7).map(|end| end & !7)
}

#[wasm_bindgen]
impl WindowView {
    /// The string pool epoch the window was read in. Its string ids are
    /// valid only within that epoch (see `CellStore::string_pool_epoch`).
    #[wasm_bindgen(js_name = stringPoolEpoch)]
    #[must_use]
    pub fn string_pool_epoch(&self) -> u32 {
        self.string_pool_epoch
    }

    /// Rows in the window.
    ///
    /// @enginePublic Result dimensions let engine hosts interpret a window without core.
    #[wasm_bindgen(getter, js_name = nRows)]
    #[must_use]
    pub fn n_rows(&self) -> u32 {
        self.n_rows
    }

    /// Columns in the window.
    ///
    /// @enginePublic Result dimensions let engine hosts interpret a window without core.
    #[wasm_bindgen(getter, js_name = nCols)]
    #[must_use]
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
    use super::WindowCells;

    #[test]
    fn packed_window_rejects_mismatched_conditional_matches() {
        let cells = WindowCells::new(1, 1).unwrap();
        assert!(
            cells.into_packed(&[0, 0], 0).is_none(),
            "two conditional matches for one cell must not pack"
        );
    }
}
