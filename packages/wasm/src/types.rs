//! Shared value model: cell tags, keys, formula errors/values, read-sets.

use crate::calc::{
    invalidate_sheet_refs, rename_sheet_refs, serialize, shift_cols, shift_rows,
    update_structured_refs, Ast, Func, RefFlags, SheetRef, StructuredRef,
};
use crate::eval::expand_let_reachable_ast;
use crate::memory::MemoryOwnerStats;
use std::rc::Rc;

// TypeScript mirrors these values in packages/core/src/store/wire-tags.ts;
// packages/core/test/wire-tags.test.ts enforces the pairing.
pub(crate) const KIND_EMPTY: u8 = 0;
pub(crate) const KIND_NUMBER: u8 = 1;
pub(crate) const KIND_STRING: u8 = 2;
pub(crate) const KIND_BOOL: u8 = 3;
pub(crate) const KIND_FORMULA: u8 = 4;

pub(crate) const NO_STRING: u32 = u32::MAX;
/// Bounds dependency/evaluation recursion; deeper formulas resolve to `#NUM!`.
pub(crate) const FORMULA_RECURSION_LIMIT: usize = 256;
/// Bounds one materialized formula range; larger ranges resolve to `#NUM!`.
pub(crate) const RANGE_CELL_LIMIT: u64 = 1_000_000;

pub(crate) type CellKey = (u32, u32);

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
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
            FormulaError::Cycle => "#CYCLE!",
            FormulaError::DivZero => "#DIV/0!",
            FormulaError::Ref => "#REF!",
            FormulaError::Num => "#NUM!",
            FormulaError::Value => "#VALUE!",
            FormulaError::Name => "#NAME?",
            FormulaError::Na => "#N/A",
            FormulaError::Spill => "#SPILL!",
            FormulaError::Calc => "#CALC!",
            FormulaError::Loading => "#LOADING!",
            FormulaError::Null => "#NULL!",
        }
    }

    /// Dense slot index for per-window scratch tables.
    pub(crate) fn slot(self) -> usize {
        match self {
            FormulaError::Cycle => 0,
            FormulaError::DivZero => 1,
            FormulaError::Ref => 2,
            FormulaError::Num => 3,
            FormulaError::Value => 4,
            FormulaError::Name => 5,
            FormulaError::Na => 6,
            FormulaError::Spill => 7,
            FormulaError::Calc => 8,
            FormulaError::Loading => 9,
            FormulaError::Null => 10,
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

impl Value {
    pub(crate) fn number(value: f64) -> Self {
        if value.is_finite() {
            Value::Number(value)
        } else {
            Value::Error(FormulaError::Num)
        }
    }

    pub(crate) fn text(text: impl Into<Rc<str>>) -> Self {
        Value::Text(text.into())
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
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
            Ast::Func(_, args) | Ast::UnknownFunc(_, args) => {
                for arg in args {
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
            | Ast::UnresolvedStructured(_)
            | Ast::Num(_)
            | Ast::Array { .. } => {}
            #[cfg(feature = "analysis")]
            Ast::BoundMatrix { .. } => {}
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

fn ast_is_volatile(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Today | Func::Now, _) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_is_volatile),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_is_volatile(left) || ast_is_volatile(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_is_volatile(inner),
        Ast::LetSlot { expression, .. } => ast_is_volatile(expression),
        _ => false,
    }
}

fn ast_contains_let(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::Let, _) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_contains_let),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_contains_let(left) || ast_contains_let(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_contains_let(inner),
        Ast::LetSlot { expression, .. } => ast_contains_let(expression),
        _ => false,
    }
}

fn ast_contains_spill_ref(ast: &Ast) -> bool {
    match ast {
        Ast::Func(Func::AnchorArray, _) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(ast_contains_spill_ref),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            ast_contains_spill_ref(left) || ast_contains_spill_ref(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => ast_contains_spill_ref(inner),
        Ast::LetSlot { expression, .. } => ast_contains_spill_ref(expression),
        _ => false,
    }
}

fn formula_metadata(ast: &Ast, formula_sheet: u32) -> (ReadSet, bool) {
    if !ast_contains_let(ast) {
        return (ReadSet::from_ast(ast, formula_sheet), ast_is_volatile(ast));
    }
    let expanded = expand_let_reachable_ast(ast).ok();
    let metadata = expanded.as_ref().unwrap_or(ast);
    (
        ReadSet::from_ast(metadata, formula_sheet),
        ast_is_volatile(metadata),
    )
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PersistedSourceKind {
    Formula,
    Reference,
}

/// Stored derived-cell metadata: parsed formulas and plain references share the
/// same Rust-owned read-set/dependency graph, while retaining distinct
/// persistence kinds at the ABI boundary.
#[derive(Clone, Debug)]
pub(crate) struct FormulaEntry {
    pub(crate) ast: Option<Ast>,
    pub(crate) source: String,
    pub(crate) reads: ReadSet,
    /// Source parse rejection; recalculation never mutates this field.
    pub(crate) error: Option<FormulaError>,
    pub(crate) volatile: bool,
    /// The formula contains `A1#`. Each evaluation replaces those with the
    /// current spill ranges; other formulas skip that step.
    pub(crate) has_spill_refs: bool,
    pub(crate) produces_array: bool,
    pub(crate) source_kind: PersistedSourceKind,
}

impl FormulaEntry {
    pub(crate) fn parsed_source(ast: Ast, sheet: u32, source: String) -> Self {
        let (reads, volatile) = formula_metadata(&ast, sheet);
        Self {
            has_spill_refs: ast_contains_spill_ref(&ast),
            produces_array: crate::eval::ast_produces_array(&ast),
            ast: Some(ast),
            source: source.to_string(),
            reads,
            error: None,
            volatile,
            source_kind: PersistedSourceKind::Formula,
        }
    }

    pub(crate) fn reference(target: AbsCellKey, target_name: &str, formula_sheet: u32) -> Self {
        let ast = Ast::AbsCell(
            SheetRef {
                handle: target.sheet,
                name: target_name.to_string(),
                quoted: false,
            },
            target.row,
            target.col,
            RefFlags::default(),
        );
        Self {
            reads: ReadSet::from_ast(&ast, formula_sheet),
            ast: Some(ast),
            source: String::new(),
            error: None,
            volatile: false,
            has_spill_refs: false,
            produces_array: false,
            source_kind: PersistedSourceKind::Reference,
        }
    }

    pub(crate) fn is_formula(&self) -> bool {
        self.source_kind == PersistedSourceKind::Formula
    }

    pub(crate) fn is_reference(&self) -> bool {
        self.source_kind == PersistedSourceKind::Reference
    }

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

    pub(crate) fn parse_error(source: &str) -> Self {
        Self::error(source, FormulaError::Value)
    }

    pub(crate) fn error(source: &str, error: FormulaError) -> Self {
        Self {
            ast: None,
            source: source.to_string(),
            reads: ReadSet::default(),
            error: Some(error),
            volatile: false,
            has_spill_refs: false,
            produces_array: false,
            source_kind: PersistedSourceKind::Formula,
        }
    }

    pub(crate) fn shift_rows(
        &mut self,
        at: u32,
        delta: i64,
        formula_sheet: u32,
        edited_sheet: u32,
    ) {
        if let Some(ast) = &mut self.ast {
            shift_rows(ast, at, delta, formula_sheet, edited_sheet);
            self.source = serialize(ast);
            let (reads, volatile) = formula_metadata(ast, formula_sheet);
            self.reads = reads;
            self.volatile = volatile;
        }
    }

    pub(crate) fn shift_cols(
        &mut self,
        at: u32,
        delta: i64,
        formula_sheet: u32,
        edited_sheet: u32,
    ) {
        if let Some(ast) = &mut self.ast {
            shift_cols(ast, at, delta, formula_sheet, edited_sheet);
            self.source = serialize(ast);
            let (reads, volatile) = formula_metadata(ast, formula_sheet);
            self.reads = reads;
            self.volatile = volatile;
        }
    }

    pub(crate) fn rename_sheet(&mut self, handle: u32, name: &str, formula_sheet: u32) -> bool {
        let Some(ast) = &mut self.ast else {
            return false;
        };
        if !rename_sheet_refs(ast, handle, name) {
            return false;
        }
        self.source = serialize(ast);
        let (reads, volatile) = formula_metadata(ast, formula_sheet);
        self.reads = reads;
        self.volatile = volatile;
        true
    }

    pub(crate) fn invalidate_sheet(&mut self, handle: u32, formula_sheet: u32) -> bool {
        let Some(ast) = &mut self.ast else {
            return false;
        };
        if !invalidate_sheet_refs(ast, handle) {
            return false;
        }
        self.source = serialize(ast);
        let (reads, volatile) = formula_metadata(ast, formula_sheet);
        self.reads = reads;
        self.volatile = volatile;
        true
    }

    pub(crate) fn update_table<F>(
        &mut self,
        table_id: &str,
        formula_sheet: u32,
        resolve: &F,
    ) -> bool
    where
        F: Fn(&StructuredRef) -> Option<StructuredRef>,
    {
        let Some(ast) = &mut self.ast else {
            return false;
        };
        if !update_structured_refs(ast, table_id, resolve) {
            return false;
        }
        self.source = serialize(ast);
        let (reads, volatile) = formula_metadata(ast, formula_sheet);
        self.reads = reads;
        self.volatile = volatile;
        true
    }

    /// Heap allocations owned by this formula entry. The inline entry is
    /// accounted by the formula hash-table bucket that stores it.
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

pub(crate) fn cell_key(row: usize, col: usize) -> Option<CellKey> {
    Some((u32::try_from(row).ok()?, u32::try_from(col).ok()?))
}

pub(crate) enum InternSlot {
    One(u32),
    Many(Vec<u32>),
}

/// The intern map's keys are already 64-bit string hashes; re-hashing them
/// through SipHash on every probe is pure waste. This hasher passes the key
/// through untouched, halving the hashing work per intern.
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

// ── String pool ──────────────────────────────────────────────────────────────
const STRING_COLLECTION_FLOOR_BYTES: usize = 256 * 1024;

/// Dictionary-encoded string pool backed by one contiguous UTF-8 arena.
///
/// `Vec<String>` costs a 12-byte header plus a separate heap allocation per
/// entry on wasm32; at a million distinct strings that is tens of megabytes of
/// headers and allocator slack. The arena stores every string back to back in
/// one buffer with an 8-byte `(offset, len)` span per id, keeps pool text
/// cache-contiguous for filter/search scans, and frees in two deallocations.
pub(crate) struct StringStorage {
    bytes: Vec<u8>,
    spans: Vec<PoolSpan>,
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
