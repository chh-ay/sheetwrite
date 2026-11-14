//! Shared value model: cell tags, keys, formula errors/values, read-sets.

use crate::calc::{
    bind_sheet_refs, has_unresolved_local_sheets, invalidate_sheet_refs, move_refs,
    refresh_sheet_spans, refresh_table_refs, relink_sheet_refs, rename_sheet_refs,
    resolve_structured_refs, shift_cols, shift_rows, Ast, Func, ParseFeatures, RefFlags, SheetRef,
    SheetResolver, SpanPlacer, TableRefresh, UnresolvedStructuredRef, WrittenNames,
};
use crate::eval::{expand_let_reachable_ast, intersection_range};
use crate::formula_rewrite::write_references;
use crate::memory::MemoryOwnerStats;
use crate::tables::TableSlots;
use std::borrow::Cow;
use std::rc::Rc;

// TypeScript mirrors these values in packages/core/src/store/wire-tags.ts;
// packages/core/test/wire-tags.test.ts enforces the pairing.
pub(crate) const KIND_EMPTY: u8 = 0;
pub(crate) const KIND_NUMBER: u8 = 1;
pub(crate) const KIND_STRING: u8 = 2;
pub(crate) const KIND_BOOL: u8 = 3;
pub(crate) const KIND_FORMULA: u8 = 4;

/// The bits the literal kinds use: every literal kind is at most this value,
/// and every other kind (a formula, or a calculated slot) sets a higher bit,
/// so one OR over a run of kind bytes tells whether it holds only literals.
pub(crate) const LITERAL_KIND_BITS: u8 = 0b11;
const _: () = assert!(
    KIND_EMPTY | KIND_NUMBER | KIND_STRING | KIND_BOOL == LITERAL_KIND_BITS
        && KIND_FORMULA & !LITERAL_KIND_BITS != 0
);

pub(crate) const NO_STRING: u32 = u32::MAX;
/// Bounds dependency/evaluation recursion; deeper formulas resolve to `#NUM!`.
pub(crate) const FORMULA_RECURSION_LIMIT: usize = 256;
/// Bounds one materialized formula range; larger ranges resolve to `#NUM!`.
pub(crate) const RANGE_CELL_LIMIT: u64 = 1_000_000;

pub(crate) type CellKey = (u32, u32);

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub(crate) struct AbsCellKey {
    pub(crate) sheet: u32,
    pub(crate) row: u32,
    pub(crate) col: u32,
}

impl AbsCellKey {
    pub(crate) fn new(sheet: usize, row: u32, col: u32) -> Self {
        Self {
            sheet: sheet as u32,
            row,
            col,
        }
    }

    pub(crate) fn from_local(sheet: usize, (row, col): CellKey) -> Self {
        Self::new(sheet, row, col)
    }

    pub(crate) fn local(self) -> CellKey {
        (self.row, self.col)
    }
}
pub(crate) type EvalResult = Value;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum FormulaError {
    Cycle,
    DivZero,
    Ref,
    Num,
    Value,
    Name,
    Na,
    Spill,
    Calc,
    Loading,
    Null,
}

impl FormulaError {
    pub(crate) const COUNT: usize = 11;

    pub(crate) fn sentinel(self) -> &'static str {
        match self {
            Self::Cycle => "#CYCLE!",
            Self::DivZero => "#DIV/0!",
            Self::Ref => "#REF!",
            Self::Num => "#NUM!",
            Self::Value => "#VALUE!",
            Self::Name => "#NAME?",
            Self::Na => "#N/A",
            Self::Spill => "#SPILL!",
            Self::Calc => "#CALC!",
            Self::Loading => "#LOADING!",
            Self::Null => "#NULL!",
        }
    }

    /// Dense slot index for per-window scratch tables.
    pub(crate) fn slot(self) -> usize {
        match self {
            Self::Cycle => 0,
            Self::DivZero => 1,
            Self::Ref => 2,
            Self::Num => 3,
            Self::Value => 4,
            Self::Name => 5,
            Self::Na => 6,
            Self::Spill => 7,
            Self::Calc => 8,
            Self::Loading => 9,
            Self::Null => 10,
        }
    }

    pub(crate) fn from_slot(slot: u64) -> Option<Self> {
        match slot {
            0 => Some(Self::Cycle),
            1 => Some(Self::DivZero),
            2 => Some(Self::Ref),
            3 => Some(Self::Num),
            4 => Some(Self::Value),
            5 => Some(Self::Name),
            6 => Some(Self::Na),
            7 => Some(Self::Spill),
            8 => Some(Self::Calc),
            9 => Some(Self::Loading),
            10 => Some(Self::Null),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Value {
    Number(f64),
    Text(Rc<str>),
    Bool(bool),
    Blank,
    Error(FormulaError),
}

// Every cell value, argument and array element is a `Value`: a larger
// `Value` grows every evaluation buffer. Change these only with a measurement.
#[cfg(target_arch = "wasm32")]
const _: () = assert!(
    std::mem::size_of::<Value>() == 16,
    "Value changed size: measure, then update this number"
);
#[cfg(not(target_arch = "wasm32"))]
const _: () = assert!(
    std::mem::size_of::<Value>() == 24,
    "Value changed size: measure, then update this number"
);

impl Value {
    pub(crate) fn number(value: f64) -> Self {
        if value.is_finite() {
            Self::Number(value)
        } else {
            Self::Error(FormulaError::Num)
        }
    }

    pub(crate) fn text(text: impl Into<Rc<str>>) -> Self {
        Self::Text(text.into())
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub(crate) struct CellRange {
    pub(crate) sheet: u32,
    pub(crate) row_start: u32,
    pub(crate) col_start: u32,
    pub(crate) row_end: u32,
    pub(crate) col_end: u32,
}

impl CellRange {
    pub(crate) fn new(
        sheet: u32,
        row_start: u32,
        col_start: u32,
        row_end: u32,
        col_end: u32,
    ) -> Self {
        Self {
            sheet,
            row_start,
            col_start,
            row_end,
            col_end,
        }
    }

    pub(crate) fn contains(self, cell: AbsCellKey) -> bool {
        cell.sheet == self.sheet
            && cell.row >= self.row_start
            && cell.row <= self.row_end
            && cell.col >= self.col_start
            && cell.col <= self.col_end
    }
}

/// Cell and range references captured from one formula AST.
///
/// Mutators add changed cells to a per-sheet dirty set. A transaction-barrier
/// recompute grows that set through these read-sets until every dependent
/// formula cell has been found, then evaluates only that affected subgraph.
#[derive(Clone, Debug, Default)]
pub(crate) struct ReadSet {
    pub(crate) cells: Vec<AbsCellKey>,
    pub(crate) ranges: Vec<CellRange>,
}

impl ReadSet {
    pub(crate) fn from_ast(ast: &Ast, formula_sheet: u32) -> Self {
        let mut out = Self::default();
        out.collect(ast, formula_sheet);
        out
    }

    pub(crate) fn collect(&mut self, ast: &Ast, formula_sheet: u32) {
        match ast {
            Ast::LetSlot { expression, .. } => self.collect(expression, formula_sheet),
            Ast::NamedFormula(named) => self.collect(&named.expression, formula_sheet),
            Ast::Cell(row, col, _) => self.push_cell(AbsCellKey {
                sheet: formula_sheet,
                row: *row,
                col: *col,
            }),
            Ast::AbsCell(sheet, row, col, _) => self.push_cell(AbsCellKey {
                sheet: sheet.handle,
                row: *row,
                col: *col,
            }),
            Ast::Range(row_start, col_start, row_end, col_end, _) => self.push_range(
                CellRange::new(formula_sheet, *row_start, *col_start, *row_end, *col_end),
            ),
            Ast::AbsRange(sheet, row_start, col_start, row_end, col_end, _) => self.push_range(
                CellRange::new(sheet.handle, *row_start, *col_start, *row_end, *col_end),
            ),
            Ast::NamedRange(named) => self.push_range(CellRange::new(
                named.sheet,
                named.row_start,
                named.col_start,
                named.row_end,
                named.col_end,
            )),
            Ast::Structured(reference) => self.push_range(CellRange::new(
                reference.sheet,
                reference.row_start,
                reference.col,
                reference.row_end,
                reference.col,
            )),
            Ast::SheetSpan(span) => {
                for &sheet in &span.sheets {
                    self.push_range(CellRange::new(
                        sheet,
                        span.row_start,
                        span.col_start,
                        span.row_end,
                        span.col_end,
                    ));
                }
            }
            // AREAS reads the shape of its reference, never its cells, so a
            // dependency on them would only invent cycles and wasted work.
            // A runtime reference inside it is volatile and refreshes anyway.
            Ast::Func(Func::Areas, _) => {}
            // SUMIF and AVERAGEIF read as many sum cells as the criteria
            // range has, whatever size the sum range is written with.
            Ast::Func(Func::SumIf | Func::AverageIf, args) if args.len() == 3 => {
                for arg in args {
                    self.collect(arg, formula_sheet);
                }
                if let (Some(criteria), Some(sum)) = (
                    crate::eval::static_range(&args[0], formula_sheet as usize),
                    crate::eval::static_range(&args[2], formula_sheet as usize),
                ) {
                    self.push_range(crate::eval::sum_range_extent(
                        sum,
                        criteria.row_end - criteria.row_start + 1,
                        criteria.col_end - criteria.col_start + 1,
                    ));
                }
            }
            // Static operands read only the shared cells; an empty
            // intersection is a constant #NULL! and reads nothing.
            Ast::Func(Func::Intersect, operands) => {
                match intersection_range(operands, formula_sheet as usize) {
                    Ok(range) => self.push_range(range),
                    Err(FormulaError::Null) => {}
                    Err(_) => {
                        for operand in operands {
                            self.collect(operand, formula_sheet);
                        }
                    }
                }
            }
            Ast::Func(_, args) => {
                for arg in args {
                    self.collect(arg, formula_sheet);
                }
            }
            Ast::UnknownFunc(call) => {
                for arg in &call.args {
                    self.collect(arg, formula_sheet);
                }
            }
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                self.collect(left, formula_sheet);
                self.collect(right, formula_sheet);
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                self.collect(inner, formula_sheet);
            }
            Ast::SheetCell(..)
            | Ast::SheetRange(..)
            | Ast::InvalidRef
            | Ast::Str(_)
            | Ast::Bool(_)
            | Ast::Missing
            | Ast::Name(_)
            | Ast::LetName { .. }
            | Ast::UnresolvedStructured(_)
            | Ast::Num(_)
            | Ast::Array(_) => {}
            #[cfg(feature = "analysis")]
            Ast::BoundMatrix(_) | Ast::RegexPattern(_) => {}
        }
    }

    pub(crate) fn push_cell(&mut self, cell: AbsCellKey) {
        if !self.cells.contains(&cell) {
            self.cells.push(cell);
        }
    }

    pub(crate) fn push_range(&mut self, range: CellRange) {
        if !self.ranges.contains(&range) {
            self.ranges.push(range);
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum FormulaValueKind {
    Number,
    Text,
    Bool,
    Blank,
}

/// Values, cell references and operators only, with no function, range,
/// name, array or LET anywhere in the tree.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node is not plain"
)]
fn ast_is_plain(ast: &Ast) -> bool {
    match ast {
        Ast::Num(_)
        | Ast::Str(_)
        | Ast::Bool(_)
        | Ast::Missing
        | Ast::Cell(..)
        | Ast::SheetCell(..)
        | Ast::AbsCell(..)
        | Ast::InvalidRef => true,
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_is_plain(left) && ast_is_plain(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_is_plain(inner),
        _ => false,
    }
}

#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node is checked through its children"
)]
fn ast_is_volatile(ast: &Ast) -> bool {
    match ast {
        Ast::Func(
            Func::Today
            | Func::Now
            | Func::Rand
            | Func::RandBetween
            | Func::Offset
            | Func::Indirect
            | Func::Sheet
            | Func::Sheets
            | Func::Info,
            _,
        ) => true,
        Ast::NamedFormula(named) => ast_is_volatile(&named.expression),
        _ => ast.any_child(&mut ast_is_volatile),
    }
}

#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node is checked through its children"
)]
fn ast_contains_let(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Let, _) => true,
        Ast::NamedFormula(named) => ast_contains_let(&named.expression),
        _ => ast.any_child(&mut ast_contains_let),
    }
}

#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node is checked through its children"
)]
fn ast_contains_spill_ref(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::AnchorArray | Func::Offset | Func::Indirect, _) => true,
        Ast::NamedFormula(named) => ast_contains_spill_ref(&named.expression),
        _ => ast.any_child(&mut ast_contains_spill_ref),
    }
}

/// The reads and volatility of `ast`; `contains_let` is
/// [`ast_contains_let`] of it, which the caller may need too.
fn formula_metadata(ast: &Ast, formula_sheet: u32, contains_let: bool) -> (ReadSet, bool) {
    if !contains_let {
        return (ReadSet::from_ast(ast, formula_sheet), ast_is_volatile(ast));
    }
    let expanded = expand_let_reachable_ast(ast).ok();
    let metadata = expanded.as_ref().unwrap_or(ast);
    (
        ReadSet::from_ast(metadata, formula_sheet),
        ast_is_volatile(metadata),
    )
}

/// Stored derived-cell metadata: parsed formulas and plain references share the
/// same Rust-owned read-set/dependency graph, while retaining distinct
/// persistence kinds at the ABI boundary.
#[derive(Clone, Debug)]
pub(crate) struct FormulaEntry {
    pub(crate) ast: Option<Ast>,
    /// The formula text as the user wrote it. After an edit rewrites the
    /// references of the tree, its references are out of date until
    /// [`FormulaEntry::source`] writes them again; read it through that.
    source: String,
    pub(crate) reads: ReadSet,
    // Low nibble: source-error slot + 1 (zero means none). Upper bits are
    // independent predicates. Keep this private to prevent invalid encodings.
    flags: u16,
}

// One per stored formula, in every workbook's formula table.
#[cfg(target_arch = "wasm32")]
const _: () = assert!(
    std::mem::size_of::<FormulaEntry>() == 64,
    "FormulaEntry changed size: measure, then update this number"
);
#[cfg(not(target_arch = "wasm32"))]
const _: () = assert!(
    std::mem::size_of::<FormulaEntry>() == 104,
    "FormulaEntry changed size: measure, then update this number"
);

impl FormulaEntry {
    const ERROR_MASK: u16 = 0x0f;
    const VOLATILE: u16 = 1 << 4;
    const SPILL_REFS: u16 = 1 << 5;
    const PRODUCES_ARRAY: u16 = 1 << 6;
    const REFERENCE: u16 = 1 << 7;
    const CALLS_SUBTOTAL: u16 = 1 << 8;
    /// An edit changed the references of the tree after `source` was set.
    const STALE_REFERENCES: u16 = 1 << 9;
    /// The tree holds a table reference, bound or not.
    const TABLE_REFS: u16 = 1 << 10;
    /// The tree calls GETPIVOTDATA.
    #[cfg(feature = "analysis")]
    const CALLS_PIVOT_DATA: u16 = 1 << 12;

    /// Whether the tree holds a table reference, so its tables list it
    /// among their users.
    pub(crate) const fn uses_tables(&self) -> bool {
        self.flags & Self::TABLE_REFS != 0
    }

    /// The formula text: the text the user wrote, with each reference that
    /// an edit has changed since written from the tree. An edit only marks
    /// the text, so a rename or a row edit over many formulas writes none of
    /// them; the text is written when it is read. Out of line: many readers.
    #[inline(never)]
    pub(crate) fn source(&self, names: &WrittenNames<'_>) -> Cow<'_, str> {
        match &self.ast {
            Some(ast) if self.flags & Self::STALE_REFERENCES != 0 => {
                Cow::Owned(write_references(&self.source, ast, names))
            }
            _ => Cow::Borrowed(&self.source),
        }
    }

    /// Capture a history entry with current source text. Its stale bit is
    /// cleared, so history can read/export it without retaining the registry.
    pub(crate) fn captured(&self, names: &WrittenNames<'_>) -> Self {
        Self {
            ast: self.ast.clone(),
            source: self.source(names).into_owned(),
            reads: self.reads.clone(),
            flags: self.flags & !Self::STALE_REFERENCES,
        }
    }

    /// The text of an entry from [`Self::captured`], which is already
    /// written out, so it needs no sheet or table names.
    pub(crate) fn captured_source(&self) -> &str {
        debug_assert_eq!(
            self.flags & Self::STALE_REFERENCES,
            0,
            "a captured entry has written text"
        );
        &self.source
    }

    /// Parse rejection or an unresolved local sheet; binding can clear the latter.
    pub(crate) fn source_error(&self) -> Option<FormulaError> {
        let encoded = self.flags & Self::ERROR_MASK;

        encoded
            .checked_sub(1)
            .and_then(|slot| FormulaError::from_slot(u64::from(slot)))
    }

    pub(crate) fn set_source_error(&mut self, error: Option<FormulaError>) {
        self.flags =
            (self.flags & !Self::ERROR_MASK) | error.map_or(0, |known| (known.slot() + 1) as u16);
    }

    pub(crate) fn volatile(&self) -> bool {
        self.flags & Self::VOLATILE != 0
    }

    pub(crate) fn set_volatile(&mut self, volatile: bool) {
        self.set_flag(Self::VOLATILE, volatile);
    }

    /// Runtime references share the existing spill-resolution path and flag.
    /// This avoids a new entry field or checks on formulas without these calls.
    pub(crate) fn has_spill_refs(&self) -> bool {
        self.flags & Self::SPILL_REFS != 0
    }

    pub(crate) fn set_has_spill_refs(&mut self, has_spill_refs: bool) {
        self.set_flag(Self::SPILL_REFS, has_spill_refs);
    }

    pub(crate) fn produces_array(&self) -> bool {
        self.flags & Self::PRODUCES_ARRAY != 0
    }

    pub(crate) fn set_produces_array(&mut self, produces_array: bool) {
        self.set_flag(Self::PRODUCES_ARRAY, produces_array);
    }

    /// Whether the formula calls SUBTOTAL or AGGREGATE. Such a formula reads
    /// the hidden rows of the sheets it reads, and a SUBTOTAL or AGGREGATE
    /// over its cell skips it, as Excel does to avoid double counting.
    pub(crate) fn calls_subtotal(&self) -> bool {
        self.flags & Self::CALLS_SUBTOTAL != 0
    }

    /// Whether the formula calls GETPIVOTDATA. It reads pivot output that
    /// no reference names, so a pivot update recalculates it.
    #[cfg(feature = "analysis")]
    pub(crate) const fn calls_pivot_data(&self) -> bool {
        self.flags & Self::CALLS_PIVOT_DATA != 0
    }

    fn set_flag(&mut self, flag: u16, enabled: bool) {
        self.flags = (self.flags & !flag) | if enabled { flag } else { 0 };
    }

    /// `features` are the parse's: only a tree that may hold a detached
    /// sheet reference is walked for a missing local sheet, and only one
    /// with a table reference is listed among its tables' users.
    pub(crate) fn parsed_source(
        mut ast: Ast,
        sheet: u32,
        source: String,
        features: ParseFeatures,
    ) -> Self {
        let missing_local = features.detached_sheets && has_unresolved_local_sheets(&ast);
        // A formula of values, cells and operators has no function, range,
        // name or array: every flag below stays clear, and its reads are the
        // only metadata that needs a walk.
        if ast_is_plain(&ast) {
            let mut entry = Self {
                flags: 0,
                reads: ReadSet::from_ast(&ast, sheet),
                ast: Some(ast),
                source,
            };
            entry.set_source_error(missing_local.then_some(FormulaError::Ref));
            return entry;
        }

        let contains_let = ast_contains_let(&ast);
        let (reads, volatile) = formula_metadata(&ast, sheet, contains_let);

        let mut entry = Self {
            flags: 0,
            ast: None,
            source,
            reads,
        };

        entry.set_volatile(volatile);
        entry.set_has_spill_refs(ast_contains_spill_ref(&ast));
        entry.set_produces_array(crate::eval::ast_produces_array(&ast));
        entry.set_flag(Self::CALLS_SUBTOTAL, crate::eval::ast_calls_subtotal(&ast));
        #[cfg(feature = "analysis")]
        entry.set_flag(
            Self::CALLS_PIVOT_DATA,
            crate::eval::analysis::ast_calls_pivot_data(&ast),
        );
        entry.set_flag(Self::TABLE_REFS, features.table_refs);
        // The flags and reads above come from the tree as written; resolving
        // LET names afterwards changes how it evaluates, not what it reads.
        if contains_let && !entry.has_spill_refs() {
            crate::eval::resolve_let_names(&mut ast);
        }
        entry.set_source_error(missing_local.then_some(FormulaError::Ref));
        entry.ast = Some(ast);

        entry
    }

    /// Same-build transfers own their read sets and cached metadata. Only the
    /// AST is rebuilt; deriving its reads again would discard runtime reads.
    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn transferred_source(
        mut ast: Option<Ast>,
        source: String,
        reads: ReadSet,
        is_reference: bool,
        uses_tables: bool,
    ) -> Self {
        if let Some(tree) = ast
            .as_mut()
            .filter(|candidate| ast_contains_let(candidate) && !ast_contains_spill_ref(candidate))
        {
            crate::eval::resolve_let_names(tree);
        }
        let mut entry = Self {
            ast,
            source,
            reads,
            flags: 0,
        };
        entry.set_flag(Self::REFERENCE, is_reference);
        entry.set_flag(Self::TABLE_REFS, uses_tables);
        entry.set_flag(
            Self::CALLS_SUBTOTAL,
            entry
                .ast
                .as_ref()
                .is_some_and(crate::eval::ast_calls_subtotal),
        );
        #[cfg(feature = "analysis")]
        entry.set_flag(
            Self::CALLS_PIVOT_DATA,
            entry
                .ast
                .as_ref()
                .is_some_and(crate::eval::analysis::ast_calls_pivot_data),
        );
        entry
    }

    pub(crate) fn reference(target: AbsCellKey, formula_sheet: u32) -> Self {
        let ast = Ast::AbsCell(
            SheetRef {
                handle: target.sheet,
            },
            target.row,
            target.col,
            RefFlags::default(),
        );
        Self {
            reads: ReadSet::from_ast(&ast, formula_sheet),
            ast: Some(ast),
            source: String::new(),
            flags: Self::REFERENCE,
        }
    }

    pub(crate) fn is_formula(&self) -> bool {
        !self.is_reference()
    }

    pub(crate) fn is_reference(&self) -> bool {
        self.flags & Self::REFERENCE != 0
    }

    #[allow(
        clippy::wildcard_enum_match_arm,
        reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other formula has no target cell"
    )]
    pub(crate) fn reference_target(&self, formula_sheet: u32) -> Option<AbsCellKey> {
        if !self.is_reference() {
            return None;
        }
        match self.ast.as_ref()? {
            Ast::Cell(row, col, _) => Some(AbsCellKey {
                sheet: formula_sheet,
                row: *row,
                col: *col,
            }),
            Ast::AbsCell(sheet, row, col, _) => Some(AbsCellKey {
                sheet: sheet.handle,
                row: *row,
                col: *col,
            }),
            _ => None,
        }
    }

    pub(crate) fn error(source: &str, error: FormulaError) -> Self {
        let mut entry = Self {
            ast: None,
            source: source.to_owned(),
            reads: ReadSet::default(),
            flags: 0,
        };
        entry.set_source_error(Some(error));

        entry
    }

    /// Applies `rewrite` to the entry's tree. When it reports a change, the
    /// read metadata follows the new tree, and the source text is marked so
    /// that its references are written from the tree when it is read; the
    /// rest stays as the user wrote it, as in Excel. Returns whether anything
    /// changed. Out of line, so the edits that call it share one copy.
    #[inline(never)]
    fn rewrite_ast(&mut self, formula_sheet: u32, rewrite: impl FnOnce(&mut Ast) -> bool) -> bool {
        let Some(ast) = &mut self.ast else {
            return false;
        };
        if !rewrite(ast) {
            return false;
        }

        let (reads, volatile) = formula_metadata(ast, formula_sheet, ast_contains_let(ast));
        self.reads = reads;

        // A plain reference has no source text: its tree is the target.
        let has_text = self.flags & Self::REFERENCE == 0;
        self.set_flag(Self::STALE_REFERENCES, has_text);
        self.set_volatile(volatile);
        true
    }

    /// Bind only retained detached sheet references. Moves the tree and source
    /// into its replacement, leaving the old read set for the graph edit.
    pub(crate) fn bind_sheets(
        &mut self,
        formula_sheet: u32,
        resolve: &SheetResolver<'_>,
        place: &SpanPlacer<'_>,
    ) -> Option<Self> {
        let ast = self.ast.as_mut()?;
        if !bind_sheet_refs(ast, resolve, place) {
            return None;
        }
        self.rebound(formula_sheet)
    }

    /// Bind the table references that no table bound when the formula in
    /// cell `at` was written. Like [`Self::bind_sheets`], the text stays as
    /// typed.
    pub(crate) fn bind_tables(&mut self, at: AbsCellKey, tables: &TableSlots) -> Option<Self> {
        let ast = self.ast.as_mut()?;
        let bind = |reference: &UnresolvedStructuredRef, sheet: u32, row: u32, col: u32| {
            tables.bind(reference.written(), AbsCellKey { sheet, row, col })
        };
        if !resolve_structured_refs(ast, at.sheet, at.row, at.col, &bind) {
            return None;
        }
        self.rebound(at.sheet)
    }

    /// Refresh the entry's references to table slot `table` after an edit of
    /// the table, with `refresh` (see [`refresh_table_refs`]). The text then
    /// names the table and its columns as they are now.
    pub(crate) fn refresh_table(
        &mut self,
        table: u16,
        formula_sheet: u32,
        refresh: &TableRefresh<'_>,
    ) -> Option<Self> {
        let ast = self.ast.as_mut()?;
        if !refresh_table_refs(ast, table, refresh) {
            return None;
        }
        let mut replacement = self.rebound(formula_sheet)?;
        let has_text = replacement.flags & Self::REFERENCE == 0;
        replacement.set_flag(Self::STALE_REFERENCES, has_text);
        Some(replacement)
    }

    /// The entry rebuilt around its edited tree, with its text and its
    /// reference and stale-text bits. Moves the tree and source into the
    /// replacement, leaving the old read set for the graph edit.
    fn rebound(&mut self, formula_sheet: u32) -> Option<Self> {
        let ast = self.ast.take()?;
        let features = ParseFeatures {
            detached_sheets: true,
            table_refs: self.uses_tables(),
            ..ParseFeatures::default()
        };
        let mut replacement = Self::parsed_source(
            ast,
            formula_sheet,
            std::mem::take(&mut self.source),
            features,
        );
        replacement.flags |= self.flags & (Self::REFERENCE | Self::STALE_REFERENCES);
        Some(replacement)
    }

    pub(crate) fn shift_rows(
        &mut self,
        at: u32,
        delta: i64,
        formula_sheet: u32,
        edited_sheet: u32,
    ) -> bool {
        self.rewrite_ast(formula_sheet, |ast| {
            shift_rows(ast, at, delta, formula_sheet, edited_sheet)
        })
    }

    pub(crate) fn shift_cols(
        &mut self,
        at: u32,
        delta: i64,
        formula_sheet: u32,
        edited_sheet: u32,
    ) -> bool {
        self.rewrite_ast(formula_sheet, |ast| {
            shift_cols(ast, at, delta, formula_sheet, edited_sheet)
        })
    }

    pub(crate) fn rename_sheet(&mut self, handle: u32, name: &str, formula_sheet: u32) -> bool {
        self.rewrite_ast(formula_sheet, |ast| rename_sheet_refs(ast, handle, name))
    }

    pub(crate) fn invalidate_sheet(&mut self, handle: u32, formula_sheet: u32) -> bool {
        self.rewrite_ast(formula_sheet, |ast| invalidate_sheet_refs(ast, handle))
    }

    /// Follow `block` (`from`, `count`, `to`) rows or, with `columns`,
    /// columns of `edited_sheet` that moved; see [`move_refs`].
    pub(crate) fn move_axis(
        &mut self,
        edited_sheet: u32,
        formula_sheet: u32,
        columns: bool,
        block: (u32, u32, u32),
    ) -> bool {
        self.rewrite_ast(formula_sheet, |ast| {
            move_refs(ast, edited_sheet, formula_sheet, columns, block)
        })
    }

    /// Point the entry's references to a sheet of another workbook at the
    /// link sheet `handle` (`Some`), or back to unresolved references when
    /// the link sheet `key` names goes away (`None`).
    pub(crate) fn relink_sheet(
        &mut self,
        key: &str,
        handle: Option<u32>,
        formula_sheet: u32,
        names: &[String],
    ) -> bool {
        let Some(ast) = &mut self.ast else {
            return false;
        };
        if !relink_sheet_refs(ast, key, handle, names) {
            return false;
        }

        // A relinked reference writes the same text, so the source stays as
        // the user wrote it instead of being written again from the tree.
        let (reads, volatile) = formula_metadata(ast, formula_sheet, ast_contains_let(ast));
        self.reads = reads;
        self.set_volatile(volatile);
        true
    }

    /// Re-places the entry's 3-D references in the tab `order`; `names` holds
    /// the sheet name of each handle. Returns whether anything changed.
    pub(crate) fn refresh_sheet_spans(
        &mut self,
        order: &[u32],
        names: &[String],
        formula_sheet: u32,
    ) -> bool {
        self.rewrite_ast(formula_sheet, |ast| refresh_sheet_spans(ast, order, names))
    }

    /// Heap allocations owned by this formula entry. The inline entry is
    /// accounted by the workbook's formula slot array.
    pub(crate) fn heap_memory_stats(&self, out: &mut MemoryOwnerStats) {
        out.add_payload(self.source.len(), self.source.capacity());
        out.add_payload(
            self.reads
                .cells
                .len()
                .saturating_mul(std::mem::size_of::<AbsCellKey>()),
            self.reads
                .cells
                .capacity()
                .saturating_mul(std::mem::size_of::<AbsCellKey>()),
        );
        out.add_payload(
            self.reads
                .ranges
                .len()
                .saturating_mul(std::mem::size_of::<CellRange>()),
            self.reads
                .ranges
                .capacity()
                .saturating_mul(std::mem::size_of::<CellRange>()),
        );
        if let Some(ast) = &self.ast {
            ast.heap_memory_stats(out);
        }
    }
}

// Include the no-error sentinel in the low nibble's capacity.
const _: () = assert!(FormulaError::COUNT <= FormulaEntry::ERROR_MASK as usize);

#[cfg(test)]
mod formula_entry_tests {
    use super::*;

    #[test]
    fn formula_entry_flags_preserve_independent_metadata() {
        for reference in [false, true] {
            let mut entry = if reference {
                FormulaEntry::reference(
                    AbsCellKey {
                        sheet: 0,
                        row: 1,
                        col: 2,
                    },
                    0,
                )
            } else {
                FormulaEntry::parsed_source(
                    Ast::Num(1.0),
                    0,
                    "=1".to_owned(),
                    ParseFeatures::default(),
                )
            };

            for (volatile, spill_refs, produces_array) in [
                (false, false, false),
                (false, false, true),
                (false, true, false),
                (false, true, true),
                (true, false, false),
                (true, false, true),
                (true, true, false),
                (true, true, true),
                (false, false, false),
            ] {
                entry.set_volatile(volatile);
                entry.set_has_spill_refs(spill_refs);
                entry.set_produces_array(produces_array);

                for error in std::iter::once(None)
                    .chain(
                        (0..FormulaError::COUNT).map(|slot| FormulaError::from_slot(slot as u64)),
                    )
                    .chain(std::iter::once(None))
                {
                    entry.set_source_error(error);
                    assert_eq!(entry.source_error(), error);
                    assert_eq!(entry.volatile(), volatile);
                    assert_eq!(entry.has_spill_refs(), spill_refs);
                    assert_eq!(entry.produces_array(), produces_array);
                    assert_eq!(entry.is_reference(), reference);
                    assert_eq!(entry.is_formula(), !reference);
                }
            }
        }
    }
}

pub(crate) fn cell_key(row: usize, col: usize) -> Option<CellKey> {
    Some((u32::try_from(row).ok()?, u32::try_from(col).ok()?))
}

pub(crate) enum InternSlot {
    One(u32),
    Many(Vec<u32>),
}

/// The intern map's keys are already 64-bit string hashes; re-hashing them
/// through `SipHash` on every probe is unnecessary. This hasher passes the key
/// through untouched.
#[derive(Default)]
pub(crate) struct IdentityHasher(u64);

impl Hasher for IdentityHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, _: &[u8]) {
        unreachable!("IdentityHasher is only used with u64 keys");
    }

    fn write_u64(&mut self, n: u64) {
        self.0 = n;
    }
}
fn string_hash(s: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

const STRING_COLLECTION_FLOOR_BYTES: usize = 256 * 1024;

/// Dictionary-encoded string pool backed by one contiguous UTF-8 arena.
///
/// `Vec<String>` costs a 12-byte header plus a separate heap allocation per
/// entry on wasm32; at a million distinct strings that is tens of megabytes of
/// headers and allocator slack. The arena stores every string back to back in
/// one buffer with an 8-byte `(offset, len)` span per id, keeping pool text
/// cache-contiguous for filter/search scans.
pub(crate) struct StringStorage {
    bytes: Vec<u8>,
    spans: Vec<PoolSpan>,
    #[allow(
        clippy::disallowed_types,
        reason = "keys are already hashes of the text, so the hasher passes them through unchanged"
    )]
    lookup:
        std::collections::HashMap<u64, InternSlot, std::hash::BuildHasherDefault<IdentityHasher>>,
    pub(crate) epoch: u32,
    pub(crate) next_collection_bytes: usize,
}

#[derive(Clone, Copy)]
struct PoolSpan {
    offset: u32,
    len: u32,
}

impl StringStorage {
    pub(crate) fn new() -> Self {
        Self {
            bytes: Vec::new(),
            spans: Vec::new(),
            lookup: Default::default(),
            epoch: 0,
            next_collection_bytes: STRING_COLLECTION_FLOOR_BYTES,
        }
    }

    /// Text for a pool id; `None` when out of range. O(1), allocation-free.
    #[allow(
        unsafe_code,
        reason = "pool text is valid UTF-8 by construction; a checked `str` slice measured 35 instead of 23 native instructions per read"
    )]
    pub(crate) fn get(&self, id: u32) -> Option<&str> {
        let span = self.spans.get(id as usize)?;
        let start = span.offset as usize;
        let bytes = &self.bytes[start..start + span.len as usize];
        // SAFETY: `push` only appends whole valid UTF-8 strings, and every
        // span covers exactly one pushed string.
        Some(unsafe { std::str::from_utf8_unchecked(bytes) })
    }

    fn push(&mut self, text: &str) -> u32 {
        let id = self.spans.len() as u32;
        let offset = self.bytes.len() as u32;
        self.bytes.extend_from_slice(text.as_bytes());
        self.spans.push(PoolSpan {
            offset,
            len: text.len() as u32,
        });
        id
    }

    pub(crate) fn intern(&mut self, text: &str) -> u32 {
        let hash = string_hash(text);

        if let Some(slot) = self.lookup.get(&hash) {
            match slot {
                InternSlot::One(id) if self.get(*id) == Some(text) => return *id,
                InternSlot::Many(ids) => {
                    for &id in ids {
                        if self.get(id) == Some(text) {
                            return id;
                        }
                    }
                }
                _ => {}
            }
        }

        let id = self.push(text);

        match self.lookup.get_mut(&hash) {
            None => {
                self.lookup.insert(hash, InternSlot::One(id));
            }
            Some(slot) => match slot {
                InternSlot::One(previous) => *slot = InternSlot::Many(vec![*previous, id]),
                InternSlot::Many(ids) => ids.push(id),
            },
        }

        id
    }

    pub(crate) fn len(&self) -> usize {
        self.spans.len()
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.bytes.len() + self.spans.len() * std::mem::size_of::<PoolSpan>()
    }

    /// Build before remapping roots: reservation failure leaves the old epoch intact.
    pub(crate) fn collection(&self, marks: &[bool], force: bool) -> Option<(Self, Vec<u32>)> {
        let live_count = marks.iter().filter(|&&marked| marked).count();
        let live_utf8 = self
            .spans
            .iter()
            .zip(marks)
            .filter(|(_, marked)| **marked)
            .map(|(span, _)| span.len as usize)
            .sum::<usize>();
        let live_bytes = live_utf8 + live_count * std::mem::size_of::<PoolSpan>();

        if !force
            && (self.retained_bytes() <= live_bytes.saturating_mul(2)
                || self.retained_bytes() - live_bytes < STRING_COLLECTION_FLOOR_BYTES)
        {
            return None;
        }

        let mut replacement = Self::new();
        replacement.bytes.try_reserve_exact(live_utf8).ok()?;
        replacement.spans.try_reserve_exact(live_count).ok()?;
        replacement.lookup.try_reserve(live_count).ok()?;

        let mut remap = Vec::new();
        remap.try_reserve_exact(self.len()).ok()?;
        remap.resize(self.len(), NO_STRING);

        for (id, &marked) in marks.iter().enumerate() {
            if marked {
                remap[id] = replacement.intern(self.get(id as u32)?);
            }
        }

        replacement.epoch = self.epoch.wrapping_add(1);
        replacement.next_collection_bytes = live_bytes
            .saturating_mul(2)
            .saturating_add(STRING_COLLECTION_FLOOR_BYTES);

        Some((replacement, remap))
    }

    pub(crate) fn postpone_collection(&mut self) {
        self.next_collection_bytes = self
            .retained_bytes()
            .saturating_mul(2)
            .saturating_add(STRING_COLLECTION_FLOOR_BYTES);
    }

    pub(crate) fn index_memory_stats(&self) -> MemoryOwnerStats {
        let mut stats = MemoryOwnerStats::default();
        stats.add_hash_table::<u64, InternSlot>(self.lookup.len(), self.lookup.capacity());

        for slot in self.lookup.values() {
            if let InternSlot::Many(ids) = slot {
                stats.add_vec::<u32>(ids.len(), ids.capacity());
            }
        }

        stats
    }

    /// Destructive bulk changes may leave no subsequent unique-string growth.
    pub(crate) fn request_collection(&mut self) {
        self.next_collection_bytes = STRING_COLLECTION_FLOOR_BYTES;
    }
}

impl StringStorage {
    pub(crate) fn memory_stats(&self) -> (MemoryOwnerStats, MemoryOwnerStats) {
        let mut utf8 = MemoryOwnerStats::default();
        utf8.add_vec::<u8>(self.bytes.len(), self.bytes.capacity());
        let mut spans = MemoryOwnerStats::default();
        spans.add_vec::<PoolSpan>(self.spans.len(), self.spans.capacity());
        (utf8, spans)
    }
}

pub(crate) fn string_from_pool(strings: &StringStorage, pool_id: u32) -> Option<String> {
    string_from_pool_ref(strings, pool_id).map(str::to_owned)
}

pub(crate) fn string_from_pool_ref(strings: &StringStorage, pool_id: u32) -> Option<&str> {
    if pool_id == NO_STRING {
        return None;
    }
    strings.get(pool_id)
}
