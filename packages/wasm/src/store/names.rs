//! Defined names: named ranges such as `Scale = Data!$C$1`, and names that
//! hold a formula, such as `Tax = 0.2`,
//! `Recent = OFFSET(Data!$A$1,COUNT(Data!$A:$A)-5,0,5)` or
//! `MYFN = LAMBDA(x,x+1)`.
//!
//! The store keeps one [`NameTable`] entry per name without case, holding the
//! name's definition in each scope. A formula holds the entry's id
//! ([`Ast::DefinedName`]) for each name it uses, defined yet or not, and
//! reads the definition through the table whenever it is evaluated or
//! walked: the sheet's own definition first, then the workbook's. A
//! definition change therefore rewrites no formula tree: the formulas that
//! use a changed name get their reads and flags again and recalculate
//! (`rebind_name_users`).
//!
//! As in Excel, relative references in a name's formula are relative to cell
//! A1, and a formula at C5 that uses the name reads them two columns right
//! and four rows down. Such a formula, or one with a table reference, is
//! placed for the cell that reads it each time it is read
//! ([`NameView::Placed`]); every other definition is read as it is stored, by
//! every formula that uses it.

use std::cell::{Cell, RefCell};

use rustc_hash::FxHashMap;
use wasm_bindgen::prelude::*;

use super::{workbook_name_key, CellStore};
use crate::calc::{
    bind_defined_names, for_each_table_ref, invalidate_sheet_refs, move_refs, moved_span, parse,
    rename_sheet_refs, resolve_structured_refs, shift_cols, shift_rows, translate_name_refs,
    ArrayLiteral, Ast, NameId, NamedRangeRef, WrittenNames,
};
use crate::formula_rewrite::write_references;
use crate::memory::MemoryOwnerStats;
use crate::tables::TableSlots;
use crate::types::{AbsCellKey, CellRange, FormulaError, Value, FORMULA_RECURSION_LIMIT};

/// The formula sheet a name's definition is shifted as: no sheet, so a
/// row or column edit moves only the references that name their sheet. An
/// unqualified reference reads the sheet of the formula that uses the name.
const NO_SHEET: u32 = u32::MAX;

/// Most nodes one name's formula may have, counting the names in it at
/// their own size. Past it the name returns `#NUM!`, as a LET does past its
/// expansion limit, so a chain of names that each use the next twice cannot
/// grow the time to read it without bound.
const EXPANSION_NODE_LIMIT: usize = 65_536;

/// The store's defined names, one entry per name without case, by
/// [`NameId`]. An entry is made the first time a definition or a formula
/// names it and is kept for the store's life, so an id in a formula tree
/// always finds its entry.
#[derive(Default)]
pub(crate) struct NameTable {
    /// Ids by folded name ([`workbook_name_key`]).
    ids: FxHashMap<Box<str>, NameId>,
    entries: Vec<NameEntry>,
    /// Names that formulas used first while the store was only read, so no
    /// entry could be added: ids past `entries`, with no definition.
    /// [`NameTable::settle`] adds their entries.
    unsettled: RefCell<UnsettledNames>,
}

#[derive(Default)]
struct UnsettledNames {
    ids: FxHashMap<Box<str>, NameId>,
    /// Folded name and first spelling, in id order.
    names: Vec<(Box<str>, Box<str>)>,
}

struct NameEntry {
    key: Box<str>,
    /// What a use writes back while no scope defines the name: the
    /// spelling of the first formula that used it.
    spelling: Box<str>,
    /// The name's definitions, the workbook's and sheets' own. Most names
    /// have one.
    definitions: Vec<(Option<u32>, DefinedName)>,
    /// The formula cell `(sheet, row, col)` whose walk is inside this name's
    /// formula. A name met again inside its own formula, for the same cell,
    /// reads as undefined.
    followed_by: Cell<Option<(u32, u32, u32)>>,
}

/// A name whose formula a cell is reading, and the cell that read it
/// before, to put back when the read ends.
type FollowedName<'a> = (&'a NameEntry, Option<(u32, u32, u32)>);

pub(super) enum DefinedName {
    Range(NamedRangeRef),
    Formula(Box<Definition>),
}

pub(super) struct Definition {
    name: String,
    /// The formula with its leading `=`, as the host reads it back.
    source: String,
    /// `source` parsed, with its sheet references bound. Its names stay as
    /// written; row, column and sheet edits rewrite it.
    ast: Ast,
    /// `ast` with its names bound to the table, its LAMBDA parameters
    /// numbered, and `#NUM!` in its place past [`EXPANSION_NODE_LIMIT`]:
    /// what reads of the name walk and evaluate. Bound again after every
    /// name change, since a call binds only to a name that holds a formula.
    expression: Ast,
    /// Whether the formula reads differently from different cells: it has a
    /// relative reference or a table reference.
    positional: bool,
    /// The nodes a read of `expression` walks, counting the names in it at
    /// their own sizes; worked out when the formulas are bound.
    nodes: Cell<Option<usize>>,
    /// Whether `expression` uses a name or calls a function that may be one,
    /// so a read of it can come back to this name; a read of any other
    /// formula that is not positional needs no cycle guard.
    follows_names: bool,
    /// Whether every read of `expression` is the formula as it is: not
    /// positional, not following names, and not one reference.
    shared: bool,
}

/// What a defined name stands for in the formula being read.
enum NameView<'a> {
    /// No definition for the formula's sheet: `#NAME?`. A name met again
    /// inside its own formula reads as undefined too.
    Undefined,
    /// A name of a linked workbook that the link does not hold: `#REF!`, as
    /// in Excel.
    Linked,
    /// A range. A name whose formula is one cell or range reference reads as
    /// one, so functions that take a reference accept it.
    Range(CellRange),
    /// The name's formula, the same for every cell that reads it. It reads
    /// unqualified references on the sheet of the formula that uses it.
    Formula(&'a Ast),
    /// The name's formula placed for the cell that reads it.
    Placed(Ast),
}

/// One read of a defined name by a formula ([`NameScope::read`]). While it
/// lives, a use of the name inside the name's own formula, for the same
/// cell, reads as undefined; dropping it ends that.
pub(crate) struct NameRead<'a> {
    view: NameView<'a>,
    followed: Option<FollowedName<'a>>,
}

impl NameRead<'_> {
    /// The name's formula, as defined or placed for the reading cell; `None`
    /// for a range or an undefined name.
    pub(crate) fn formula(&self) -> Option<&Ast> {
        match &self.view {
            NameView::Formula(expression) => Some(expression),
            NameView::Placed(expression) => Some(expression),
            NameView::Undefined | NameView::Linked | NameView::Range(_) => None,
        }
    }

    /// The range the name stands for, also when its formula is one
    /// reference.
    pub(crate) const fn range(&self) -> Option<CellRange> {
        match &self.view {
            NameView::Range(range) => Some(*range),
            NameView::Undefined | NameView::Linked | NameView::Formula(_) | NameView::Placed(_) => {
                None
            }
        }
    }

    /// The error an undefined name is: `#NAME?`, or `#REF!` for a linked
    /// workbook's name the link does not hold.
    pub(crate) const fn error(&self) -> Option<FormulaError> {
        match &self.view {
            NameView::Undefined => Some(FormulaError::Name),
            NameView::Linked => Some(FormulaError::Ref),
            NameView::Range(_) | NameView::Formula(_) | NameView::Placed(_) => None,
        }
    }
}

impl Drop for NameRead<'_> {
    fn drop(&mut self) {
        if let Some((entry, previous)) = self.followed {
            entry.followed_by.set(previous);
        }
    }
}

/// The formula a walk is in, for reading the defined names of its tree: the
/// store's name table and table slots, which place a name's table
/// references, and the formula's sheet, which picks each name's scope. It
/// borrows only those two parts of the store, so an edit can walk the
/// formulas of its sheets while it holds them.
#[derive(Clone, Copy)]
pub(crate) struct NameScope<'a> {
    pub(crate) table: &'a NameTable,
    pub(crate) tables: &'a TableSlots,
    pub(crate) sheet: u32,
}

impl<'a> NameScope<'a> {
    /// The names of a formula on `sheet`, read from `table` and placed with
    /// `tables`.
    pub(crate) const fn new(table: &'a NameTable, tables: &'a TableSlots, sheet: u32) -> Self {
        Self {
            table,
            tables,
            sheet,
        }
    }

    /// The formula `id` holds for this sheet when every cell reads it the
    /// same way, it is not one reference, and reading it needs no cycle
    /// guard: what evaluation reads without [`Self::read`]. Inline, since
    /// evaluation calls it for every use of a name.
    #[inline]
    pub(crate) fn shared_formula(self, id: NameId) -> Option<&'a Ast> {
        match NameTable::definition_for(self.table.entry(id)?, self.sheet)? {
            DefinedName::Formula(formula) if formula.shared => Some(&formula.expression),
            DefinedName::Formula(_) | DefinedName::Range(_) => None,
        }
    }

    /// Read the name `id` for the formula on [`Self::sheet`] at the cell that
    /// is being evaluated or bound (`current_formula_origin`). Out of line:
    /// every walk that meets a name calls it.
    #[inline(never)]
    pub(crate) fn read(self, id: NameId) -> NameRead<'a> {
        let Some(entry) = self.table.entry(id) else {
            let view = if self.table.unsettled_is_linked(id) {
                NameView::Linked
            } else {
                NameView::Undefined
            };
            return NameRead {
                view,
                followed: None,
            };
        };
        if let Some(DefinedName::Formula(formula)) = NameTable::definition_for(entry, self.sheet) {
            if !formula.positional && !formula.follows_names {
                let view = reference_target(&formula.expression, self.sheet)
                    .map_or(NameView::Formula(&formula.expression), NameView::Range);
                return NameRead {
                    view,
                    followed: None,
                };
            }
        }
        let (row, col) = crate::eval::current_formula_origin().unwrap_or_default();
        let cell = (self.sheet, row, col);
        if entry.followed_by.get() == Some(cell) {
            return NameRead {
                view: NameView::Undefined,
                followed: None,
            };
        }
        let view = self.view(entry, row, col);
        let followed = matches!(view, NameView::Formula(_) | NameView::Placed(_))
            .then(|| (entry, entry.followed_by.replace(Some(cell))));
        NameRead { view, followed }
    }

    /// What the name of `entry` stands for in the formula at (`row`, `col`).
    fn view(self, entry: &'a NameEntry, row: u32, col: u32) -> NameView<'a> {
        let sheet = self.sheet;
        match NameTable::definition_for(entry, sheet) {
            None if entry.key.contains('!') => NameView::Linked,
            None => NameView::Undefined,
            Some(DefinedName::Range(range)) => NameView::Range(CellRange::new(
                range.sheet,
                range.row_start,
                range.col_start,
                range.row_end,
                range.col_end,
            )),
            Some(DefinedName::Formula(formula)) if formula.positional => {
                let mut placed = formula.expression.clone();
                translate_name_refs(&mut placed, row, col);
                let tables = self.tables;
                resolve_structured_refs(&mut placed, sheet, row, col, &|reference, at, row, col| {
                    tables.bind(reference.written(), AbsCellKey { sheet: at, row, col })
                });
                reference_target(&placed, sheet).map_or(NameView::Placed(placed), NameView::Range)
            }
            Some(DefinedName::Formula(formula)) => reference_target(&formula.expression, sheet)
                .map_or(NameView::Formula(&formula.expression), NameView::Range),
        }
    }

    /// What a use of `id` writes, as [`NameTable::write_spelling`] does.
    #[cfg(feature = "analysis")]
    pub(crate) fn spelling(self, id: NameId) -> String {
        let mut out = String::new();
        self.table.write_spelling(id, &mut out);
        out
    }

    /// The formula the name `id` holds for this sheet, as it is defined.
    #[cfg(feature = "analysis")]
    fn formula(self, id: NameId) -> Option<&'a Ast> {
        let entry = self.table.entry(id)?;
        match NameTable::definition_for(entry, self.sheet)? {
            DefinedName::Formula(formula) => Some(&formula.expression),
            DefinedName::Range(_) => None,
        }
    }

    /// The expression that a LET binding's use or a defined name stands
    /// for, through any number of them: what a function argument such as
    /// `MAP(A1:A3,MYFN)` passes. A name's formula is read as it is defined:
    /// placing it for a cell moves its references, not its shape.
    #[cfg(feature = "analysis")]
    pub(crate) fn bound_value<'t>(self, ast: &'t Ast) -> &'t Ast
    where
        'a: 't,
    {
        let mut expression = ast;
        for _ in 0..FORMULA_RECURSION_LIMIT {
            expression = match expression {
                Ast::LetSlot {
                    expression: bound, ..
                } => bound,
                Ast::DefinedName(id) => match self.formula(*id) {
                    Some(formula) => formula,
                    None => return expression,
                },
                Ast::Num(_)
                | Ast::Str(_)
                | Ast::Bool(_)
                | Ast::Missing
                | Ast::Parameter { .. }
                | Ast::Lambda(_)
                | Ast::RegexPattern(_)
                | Ast::Name(_)
                | Ast::UnresolvedStructured(_)
                | Ast::Structured(_)
                | Ast::Cell(..)
                | Ast::SheetCell(..)
                | Ast::AbsCell(..)
                | Ast::Range(..)
                | Ast::SheetRange(..)
                | Ast::AbsRange(..)
                | Ast::SheetSpan(_)
                | Ast::InvalidRef
                | Ast::Func(..)
                | Ast::UnknownFunc(..)
                | Ast::Bin(..)
                | Ast::Cmp(..)
                | Ast::Neg(_)
                | Ast::Pos(_)
                | Ast::Percent(_)
                | Ast::LetName { .. }
                | Ast::Array { .. } => return expression,
            };
        }
        expression
    }
}

impl NameTable {
    /// The id of `key`, a folded name, making its entry with `spelling` when
    /// the table has none.
    fn intern(&self, key: String, spelling: &str) -> Option<NameId> {
        if let Some(&id) = self.ids.get(key.as_str()) {
            return Some(id);
        }
        let mut unsettled = self.unsettled.try_borrow_mut().ok()?;
        if let Some(&id) = unsettled.ids.get(key.as_str()) {
            return Some(id);
        }
        let id = NameId::at(self.entries.len() + unsettled.names.len())?;
        let key: Box<str> = key.into_boxed_str();
        unsettled.names.push((key.clone(), spelling.into()));
        unsettled.ids.insert(key, id);
        Some(id)
    }

    /// Add the entries of the names formulas used first while the store
    /// was only read. Every change to the table settles first, so an
    /// unsettled id is always the next entry's.
    fn settle(&mut self) {
        let unsettled = std::mem::take(self.unsettled.get_mut());
        for ((key, spelling), id) in unsettled.names.into_iter().zip(self.entries.len()..) {
            let Some(id) = NameId::at(id) else {
                return;
            };
            self.entries.push(NameEntry {
                key: key.clone(),
                spelling,
                definitions: Vec::new(),
                followed_by: Cell::new(None),
            });
            self.ids.insert(key, id);
        }
    }

    /// The table with every used name settled, for a change.
    pub(super) fn settled(&mut self) -> &mut Self {
        self.settle();
        self
    }

    /// Whether the unsettled name `id` is a linked workbook's.
    fn unsettled_is_linked(&self, id: NameId) -> bool {
        self.unsettled.try_borrow().is_ok_and(|unsettled| {
            id.index()
                .checked_sub(self.entries.len())
                .and_then(|index| unsettled.names.get(index))
                .is_some_and(|(key, _)| key.contains('!'))
        })
    }

    fn id(&self, key: &str) -> Option<NameId> {
        self.ids.get(key).copied()
    }

    fn entry(&self, id: NameId) -> Option<&NameEntry> {
        self.entries.get(id.index())
    }

    /// Whether `id` holds a formula for a formula on `sheet`, so a call of it
    /// calls that formula's value.
    fn holds_formula(&self, id: NameId, sheet: u32) -> bool {
        self.entry(id).is_some_and(|entry| {
            matches!(
                Self::definition_for(entry, sheet),
                Some(DefinedName::Formula(_))
            )
        })
    }

    /// The id of the name written `name` when it holds a formula for a
    /// formula on `sheet`.
    #[cfg(feature = "analysis")]
    pub(crate) fn formula_id(&self, name: &str, sheet: u32) -> Option<NameId> {
        let id = self.id(&workbook_name_key(name))?;
        self.holds_formula(id, sheet).then_some(id)
    }

    /// The definition of `id` in exactly `scope`.
    fn defined_at(&self, scope: Option<u32>, id: NameId) -> Option<&DefinedName> {
        self.entry(id)?
            .definitions
            .iter()
            .find_map(|(defined, definition)| (*defined == scope).then_some(definition))
    }

    /// The formula at `(entry, definition)` positions of the table, to bind
    /// it again.
    fn formula_at_position(&mut self, (entry, definition): (usize, usize)) -> Option<&mut Definition> {
        match self.entries.get_mut(entry)?.definitions.get_mut(definition)? {
            (_, DefinedName::Formula(formula)) => Some(formula),
            (_, DefinedName::Range(_)) => None,
        }
    }

    /// The definition of `key` in exactly `scope`.
    pub(super) fn get(&self, scope: Option<u32>, key: &str) -> Option<&DefinedName> {
        self.defined_at(scope, self.id(key)?)
    }

    /// Define `key` in `scope` as `definition`, replacing the one there.
    pub(super) fn insert(
        &mut self,
        scope: Option<u32>,
        key: String,
        spelling: &str,
        definition: DefinedName,
    ) {
        self.settle();
        let id = self.intern(key, spelling);
        self.settle();
        let Some(entry) = id.and_then(|id| self.entries.get_mut(id.index())) else {
            return;
        };
        if let Some(slot) = entry
            .definitions
            .iter_mut()
            .find(|(defined, _)| *defined == scope)
        {
            slot.1 = definition;
        } else {
            entry.definitions.push((scope, definition));
        }
    }

    /// Remove the definition of `key` in `scope`; whether there was one.
    pub(super) fn remove(&mut self, scope: Option<u32>, key: &str) -> bool {
        let Some(entry) = self
            .id(key)
            .and_then(|id| self.entries.get_mut(id.index()))
        else {
            return false;
        };
        let before = entry.definitions.len();
        entry.definitions.retain(|(defined, _)| *defined != scope);
        entry.definitions.len() != before
    }

    /// Whether any scope defines `key`.
    pub(super) fn defines(&self, key: &str) -> bool {
        self.id(key)
            .and_then(|id| self.entry(id))
            .is_some_and(|entry| !entry.definitions.is_empty())
    }

    /// Every definition with its scope and folded name.
    pub(super) fn definitions(
        &self,
    ) -> impl Iterator<Item = (Option<u32>, &str, &DefinedName)> + '_ {
        self.entries.iter().flat_map(|entry| {
            entry
                .definitions
                .iter()
                .map(move |(scope, definition)| (*scope, &*entry.key, definition))
        })
    }

    /// Keep only the definitions `keep` accepts; it gets each one's scope and
    /// folded name, and may change it.
    pub(super) fn retain(&mut self, mut keep: impl FnMut(Option<u32>, &str, &mut DefinedName) -> bool) {
        for entry in &mut self.entries {
            let key = &entry.key;
            entry
                .definitions
                .retain_mut(|(scope, definition)| keep(*scope, key, definition));
        }
    }

    /// The definition a formula on `sheet` reads: the sheet's own, then the
    /// workbook's.
    #[inline]
    fn definition_for(entry: &NameEntry, sheet: u32) -> Option<&DefinedName> {
        let mut workbook = None;
        for (scope, definition) in &entry.definitions {
            match scope {
                Some(own) if *own == sheet => return Some(definition),
                Some(_) => {}
                None => workbook = Some(definition),
            }
        }
        workbook
    }

    /// Write what a formula writes for a use of `id`: the spelling of the
    /// workbook's definition, else of any definition, else of the first use.
    pub(crate) fn write_spelling(&self, id: NameId, out: &mut String) {
        let Some(entry) = self.entry(id) else {
            if let Ok(unsettled) = self.unsettled.try_borrow() {
                let index = id.index().saturating_sub(self.entries.len());
                if let Some((_, spelling)) = unsettled.names.get(index) {
                    out.push_str(spelling);
                }
            }
            return;
        };
        let defined = entry
            .definitions
            .iter()
            .min_by_key(|(scope, _)| scope.is_some())
            .map(|(_, definition)| match definition {
                DefinedName::Range(range) => range.name.as_str(),
                DefinedName::Formula(formula) => formula.name.as_str(),
            });
        out.push_str(defined.unwrap_or(&entry.spelling));
    }

    fn add_memory(&self, metadata: &mut MemoryOwnerStats) {
        metadata.add_hash_table::<Box<str>, NameId>(self.ids.len(), self.ids.capacity());
        let bytes = self.entries.capacity() * std::mem::size_of::<NameEntry>();
        metadata.add_payload(
            self.entries.len() * std::mem::size_of::<NameEntry>(),
            bytes,
        );
        for entry in &self.entries {
            // The key is held twice: by the entry and by the id lookup.
            metadata.add_payload(2 * entry.key.len(), 2 * entry.key.len());
            metadata.add_payload(entry.spelling.len(), entry.spelling.len());
            let bytes = entry.definitions.capacity()
                * std::mem::size_of::<(Option<u32>, DefinedName)>();
            metadata.add_payload(bytes, bytes);
            for (_, definition) in &entry.definitions {
                match definition {
                    DefinedName::Range(range) => {
                        metadata.add_payload(range.name.len(), range.name.capacity());
                    }
                    DefinedName::Formula(formula) => {
                        let bytes = std::mem::size_of::<Definition>();
                        metadata.add_payload(bytes, bytes);
                        metadata.add_payload(formula.name.len(), formula.name.capacity());
                        metadata.add_payload(formula.source.len(), formula.source.capacity());
                        formula.ast.heap_memory_stats(metadata);
                        formula.expression.heap_memory_stats(metadata);
                    }
                }
            }
        }
    }
}

impl Definition {
    /// Rewrite the tree with `rewrite`; the source follows a changed tree in
    /// the references it writes differently. A definition's table
    /// references stay unbound, so only sheet names are needed.
    fn rewrite(&mut self, sheets: &[String], rewrite: impl FnOnce(&mut Ast) -> bool) -> bool {
        if !rewrite(&mut self.ast) {
            return false;
        }
        let names = WrittenNames {
            sheets,
            tables: None,
            names: None,
        };
        self.source = write_references(&self.source, &self.ast, &names);
        true
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Define `name` in `scope` (a sheet handle, or -1 for the workbook) as
    /// `source`, a formula with its leading `=` whose relative references
    /// are relative to A1. It replaces a range or formula of the same name
    /// and scope. Rejects a name that is not formula-safe or that a table
    /// has, a removed scope sheet, and a formula that does not parse or
    /// names a missing sheet.
    #[wasm_bindgen(js_name = setNamedFormula)]
    pub fn set_named_formula(&mut self, name: &str, scope: i32, source: &str) -> bool {
        let Some(name_scope) = self.defined_name_scope(name, scope) else {
            return false;
        };
        let Some(ast) = parse(source)
            .ok()
            .and_then(|ast| self.resolve_sheets(ast).ok())
        else {
            return false;
        };

        let key = workbook_name_key(name);
        let definition = Definition {
            name: name.to_owned(),
            source: source.to_owned(),
            positional: is_positional(&ast),
            ast,
            expression: Ast::Missing,
            nodes: Cell::new(None),
            follows_names: true,
            shared: false,
        };
        self.names.insert(
            name_scope,
            key.clone(),
            name,
            DefinedName::Formula(Box::new(definition)),
        );
        self.rebind_name_users(vec![key]);
        self.recompute_all_sheets();
        true
    }

    /// The formula of the defined name `name` in `scope` (-1 for the
    /// workbook), or nothing when the name holds no formula there. A sheet
    /// rename, a sheet removal or a row or column edit can rewrite it.
    #[wasm_bindgen(js_name = namedFormulaSource)]
    pub fn named_formula_source(&self, name: &str, scope: i32) -> Option<String> {
        let name_scope = u32::try_from(scope).ok();
        match self.names.get(name_scope, &workbook_name_key(name))? {
            DefinedName::Formula(definition) => Some(definition.source.clone()),
            DefinedName::Range(_) => None,
        }
    }
}

impl CellStore {
    /// Bind the defined names of a formula on `formula_sheet`: each name
    /// becomes its table id, and a call of a name that holds a formula
    /// becomes a call of that formula's value. LET and LAMBDA names stay.
    pub(super) fn bind_formula_names(&self, ast: Ast, formula_sheet: u32) -> Ast {
        let table = &self.names;
        bind_defined_names(ast, &mut |name, call| {
            let key = workbook_name_key(name);
            if call {
                let id = table.id(&key)?;
                return table
                    .holds_formula(id, formula_sheet)
                    .then_some(Ast::DefinedName(id));
            }
            table.intern(key, name).map(Ast::DefinedName)
        })
    }

    /// The defined names of a formula on `sheet`, for its walks and its
    /// evaluation.
    pub(crate) fn name_scope(&self, sheet: usize) -> NameScope<'_> {
        NameScope {
            table: &self.names,
            tables: &self.tables,
            sheet: sheet as u32,
        }
    }

    /// Add to `changed` the names whose formula has a table reference: a
    /// table edit changes how the formulas that use them read.
    pub(super) fn add_names_over_tables(&self, changed: &mut Vec<String>) {
        for (_, key, definition) in self.names.definitions() {
            let DefinedName::Formula(formula) = definition else {
                continue;
            };
            let mut uses_table = false;
            for_each_table_ref(&formula.ast, &mut |_| uses_table = true);
            if uses_table {
                changed.push(key.to_owned());
            }
        }
    }

    /// Add to `changed` every name whose formula uses a name in it, directly
    /// or through other names.
    fn add_names_using(&self, changed: &mut Vec<String>) {
        let table = &self.names;
        loop {
            let before = changed.len();
            for (_, key, definition) in table.definitions() {
                let DefinedName::Formula(formula) = definition else {
                    continue;
                };
                if changed.iter().any(|name| name == key) {
                    continue;
                }
                let mut used = Vec::new();
                used_names(&formula.ast, &mut used);
                if used
                    .iter()
                    .any(|name| changed.contains(&workbook_name_key(name)))
                {
                    changed.push(key.to_owned());
                }
            }
            if changed.len() == before {
                return;
            }
        }
    }

    /// After the names in `changed` (folded names) changed, give the
    /// formulas that use one, or a name whose formula uses one, their reads
    /// and flags again from their trees, which hold only the names' ids; the
    /// dependency index patches their reads and they recalculate. A formula
    /// whose tree a change does alter is parsed again from its text: one
    /// that calls a changed name that no longer holds a formula, or that
    /// holds a changed name unbound, and one with a LET, whose tree is
    /// resolved in place.
    pub(super) fn rebind_name_users(&mut self, mut changed: Vec<String>) {
        if changed.is_empty() {
            return;
        }
        self.bind_name_definitions();
        self.add_names_using(&mut changed);
        let table = self.names.settled();
        let ids: Vec<NameId> = changed.iter().filter_map(|key| table.id(key)).collect();
        let mut users = Vec::new();
        for (sheet, data) in self.sheets.iter().enumerate() {
            if self.sheet_alive.get(sheet) != Some(&true) {
                continue;
            }
            for formula in data.formulas.ids() {
                let Some(ast) = self
                    .formula_slots
                    .get(formula)
                    .filter(|entry| entry.uses_names())
                    .and_then(|entry| entry.ast.as_ref())
                else {
                    continue;
                };
                let callable = |id: NameId| self.names.holds_formula(id, sheet as u32);
                match name_use(ast, &ids, &changed, &callable) {
                    NameUse::None => {}
                    NameUse::Read => users.push((formula, false)),
                    NameUse::Bound => users.push((formula, true)),
                }
            }
        }
        for (formula, parse_again) in users {
            let Some(at) = self.formula_slots.location(formula) else {
                continue;
            };
            let replacement = if parse_again {
                let Some(source) = self
                    .formula_slots
                    .get(formula)
                    .map(|entry| entry.source(&self.written_names()).into_owned())
                else {
                    continue;
                };
                Some(self.parse_formula_entry(&source, at.sheet, at.row, at.col))
            } else {
                let names = NameScope::new(&self.names, &self.tables, at.sheet);
                self.formula_slots.get_mut(formula).and_then(|entry| {
                    crate::eval::with_formula_origin((at.row, at.col), || entry.rebound(names))
                })
            };
            if let Some(entry) = replacement {
                self.replace_bound_formula(at, entry);
            }
        }
    }

    /// Bind every name definition's formula again: its names to their ids
    /// and its calls to the names that hold a formula now. A formula whose
    /// reads would pass [`EXPANSION_NODE_LIMIT`] nodes, counting each name
    /// it uses at that name's size, becomes `#NUM!`.
    pub(super) fn bind_name_definitions(&mut self) {
        let table = self.names.settled();
        let mut written = Vec::new();
        for (entry_index, entry) in table.entries.iter().enumerate() {
            for (definition_index, (scope, definition)) in entry.definitions.iter().enumerate() {
                if let DefinedName::Formula(formula) = definition {
                    let sheet = scope.unwrap_or(NO_SHEET);
                    written.push(((entry_index, definition_index), sheet, formula.ast.clone()));
                }
            }
        }
        let mut bound = Vec::with_capacity(written.len());
        for (at, sheet, ast) in written {
            #[cfg_attr(not(feature = "analysis"), allow(unused_mut))]
            let mut expression = self.bind_formula_names(ast, sheet);
            // A named LAMBDA reads its parameters from the call frame, like
            // one written in a formula.
            #[cfg(feature = "analysis")]
            crate::eval::analysis::lambda::resolve_parameters(&mut expression);
            bound.push((at, expression));
        }
        let table = &mut self.names;
        for (at, expression) in &mut bound {
            if let Some(formula) = table.formula_at_position(*at) {
                formula.expression = std::mem::replace(expression, Ast::Missing);
                formula.follows_names = follows_names(&formula.expression);
                formula.shared = !formula.positional
                    && !formula.follows_names
                    && reference_target(&formula.expression, NO_SHEET).is_none();
                formula.nodes.set(None);
            }
        }
        // Past the limit, a formula reads as `#NUM!`, as a LET does past
        // its expansion limit.
        for (at, _) in bound {
            let oversized = table.entries.get(at.0).is_some_and(|entry| {
                let scope = entry.definitions.get(at.1).and_then(|(scope, _)| *scope);
                NameId::at(at.0)
                    .is_some_and(|id| definition_size(table, (scope, id), 0) > EXPANSION_NODE_LIMIT)
            });
            if let Some(formula) = oversized.then(|| table.formula_at_position(at)).flatten() {
                formula.expression = Ast::Array(Box::new(ArrayLiteral {
                    cols: 1,
                    values: vec![Value::Error(FormulaError::Num)],
                }));
            }
        }
    }

    /// Follow a row (or, with `columns`, column) insertion or deletion on
    /// `edited_sheet` in every name's formula. Adds to `changed` the names
    /// that read differently: a name whose formula changed, and a name
    /// placed by the cell that reads it, since formulas moved.
    pub(super) fn shift_named_formulas(
        &mut self,
        edited_sheet: u32,
        (at, delta): (u32, i64),
        columns: bool,
        changed: &mut Vec<String>,
    ) {
        let sheets = &self.sheet_names;
        for entry in &mut self.names.entries {
            let mut moved = false;
            for (_, definition) in &mut entry.definitions {
                let DefinedName::Formula(formula) = definition else {
                    continue;
                };
                let shifted = formula.rewrite(sheets, |ast| {
                    if columns {
                        shift_cols(ast, at, delta, NO_SHEET, edited_sheet)
                    } else {
                        shift_rows(ast, at, delta, NO_SHEET, edited_sheet)
                    }
                });
                moved |= formula.positional || shifted;
            }
            if moved {
                changed.push(entry.key.to_string());
            }
        }
    }

    /// Follow `count` rows (or, with `columns`, columns) of `edited_sheet`
    /// moved from `from` to `to` in every name: a named range's span and the
    /// references of a name's formula. Adds to `changed` the names that read
    /// differently.
    pub(super) fn move_named_references(
        &mut self,
        edited_sheet: u32,
        columns: bool,
        (from, count, to): (u32, u32, u32),
        changed: &mut Vec<String>,
    ) {
        let sheets = &self.sheet_names;
        for entry in &mut self.names.entries {
            let mut moved = false;
            for (_, definition) in &mut entry.definitions {
                moved |= match definition {
                    DefinedName::Formula(formula) => {
                        formula.positional
                            | formula.rewrite(sheets, |ast| {
                                move_refs(ast, edited_sheet, NO_SHEET, columns, (from, count, to))
                            })
                    }
                    DefinedName::Range(range) if range.sheet == edited_sheet => {
                        let (start, end) = if columns {
                            (&mut range.col_start, &mut range.col_end)
                        } else {
                            (&mut range.row_start, &mut range.row_end)
                        };
                        let span = moved_span(*start, *end, from, count, to);
                        let differs = span.is_some_and(|span| span != (*start, *end));
                        if let Some(span) = span {
                            (*start, *end) = span;
                        }
                        differs
                    }
                    DefinedName::Range(_) => false,
                };
            }
            if moved {
                changed.push(entry.key.to_string());
            }
        }
    }

    /// Follow a sheet rename in every name's formula.
    pub(super) fn rename_sheet_in_named_formulas(&mut self, handle: u32, name: &str) {
        let sheets = &self.sheet_names;
        for entry in &mut self.names.entries {
            for (_, definition) in &mut entry.definitions {
                if let DefinedName::Formula(formula) = definition {
                    formula.rewrite(sheets, |ast| rename_sheet_refs(ast, handle, name));
                }
            }
        }
    }

    /// Turn a removed sheet's references into `#REF!`, adding the names
    /// whose formula changed to `changed`. The definitions scoped to that
    /// sheet are already removed.
    pub(super) fn remove_sheet_from_named_formulas(
        &mut self,
        handle: u32,
        changed: &mut Vec<String>,
    ) {
        let sheets = &self.sheet_names;
        for entry in &mut self.names.entries {
            let mut invalidated = false;
            for (_, definition) in &mut entry.definitions {
                if let DefinedName::Formula(formula) = definition {
                    invalidated |=
                        formula.rewrite(sheets, |ast| invalidate_sheet_refs(ast, handle));
                }
            }
            if invalidated {
                changed.push(entry.key.to_string());
            }
        }
    }

    pub(super) fn add_defined_name_memory(&self, metadata: &mut MemoryOwnerStats) {
        self.names.add_memory(metadata);
    }

    /// Every named formula's scope, name and formula, for a same-build
    /// transfer.
    pub(super) fn named_formula_sources(
        &self,
    ) -> impl Iterator<Item = (Option<u32>, &str, &str)> + '_ {
        self.names
            .definitions()
            .filter_map(|(scope, _, definition)| match definition {
                DefinedName::Formula(formula) => {
                    Some((scope, formula.name.as_str(), formula.source.as_str()))
                }
                DefinedName::Range(_) => None,
            })
    }

    /// Define a transferred name without binding formulas, which the
    /// transfer has not read yet.
    #[cfg(any(target_arch = "wasm32", test))]
    pub(super) fn insert_transferred_named_formula(
        &mut self,
        scope: Option<u32>,
        name: String,
        source: String,
    ) -> Result<(), String> {
        let ast = parse(&source)
            .ok()
            .and_then(|ast| self.resolve_sheets(ast).ok())
            .ok_or("invalid transferred defined name")?;
        let key = workbook_name_key(&name);
        let definition = Definition {
            positional: is_positional(&ast),
            name: name.clone(),
            source,
            ast,
            expression: Ast::Missing,
            nodes: Cell::new(None),
            follows_names: true,
            shared: false,
        };
        self.names.insert(
            scope,
            key,
            &name,
            DefinedName::Formula(Box::new(definition)),
        );
        Ok(())
    }
}

/// The nodes a read of the definition `(scope, id)` walks, counting each name
/// in it at its own size, saturating, and kept in the definition. A name
/// met again inside its own formula counts as one node, as it reads as
/// undefined.
fn definition_size(table: &NameTable, (scope, id): (Option<u32>, NameId), depth: usize) -> usize {
    let Some(DefinedName::Formula(formula)) = table.defined_at(scope, id) else {
        return 1;
    };
    if let Some(size) = formula.nodes.get() {
        return size;
    }
    // A cycle reads as undefined where it closes.
    formula.nodes.set(Some(1));
    let size = if depth > FORMULA_RECURSION_LIMIT {
        usize::MAX
    } else {
        expression_size(table, &formula.expression, scope, depth)
    };
    formula.nodes.set(Some(size));
    size
}

/// The nodes of `ast`, counting each name in it at the size of its
/// definition in `scope`, else the workbook's.
fn expression_size(table: &NameTable, ast: &Ast, scope: Option<u32>, depth: usize) -> usize {
    if let Ast::DefinedName(id) = ast {
        let own = scope.filter(|_| table.defined_at(scope, *id).is_some());
        return definition_size(table, (own, *id), depth + 1);
    }
    let mut size: usize = 1;
    #[cfg(feature = "analysis")]
    if let Ast::Lambda(definition) = ast {
        size = size.saturating_add(definition.parameters.len());
    }
    ast.any_child(&mut |child| {
        size = size.saturating_add(expression_size(table, child, scope, depth));
        false
    });
    size
}

/// How a formula uses the changed names.
enum NameUse {
    None,
    /// It reads a changed name through its id: its reads and flags change.
    Read,
    /// Its tree binds differently: it calls a changed name or holds one
    /// unbound; or it reads one and has a LET, whose tree is resolved in
    /// place.
    Bound,
}

/// How `ast` uses the names `ids` (or the folded names `keys`, for names it
/// holds unbound).
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node is walked through its children"
)]
fn name_use(
    ast: &Ast,
    ids: &[NameId],
    keys: &[String],
    callable: &dyn Fn(NameId) -> bool,
) -> NameUse {
    let mut reads = false;
    let mut binds = false;
    let mut has_let = false;
    let mut visit = |node: &Ast| match node {
        Ast::DefinedName(id) => reads |= ids.contains(id),
        Ast::Name(name) => binds |= keys.contains(&workbook_name_key(name)),
        Ast::UnknownFunc(call) => {
            binds |= keys.contains(&workbook_name_key(&call.name))
                || matches!(call.args.first(), Some(Ast::DefinedName(id))
                    if ids.contains(id) && !callable(*id));
        }
        Ast::Func(crate::calc::Func::Let, _) => has_let = true,
        _ => {}
    };
    walk(ast, &mut visit);
    if binds || (reads && has_let) {
        NameUse::Bound
    } else if reads {
        NameUse::Read
    } else {
        NameUse::None
    }
}

/// Visit `ast` and every node below it.
fn walk(ast: &Ast, visit: &mut dyn FnMut(&Ast)) {
    visit(ast);
    ast.any_child(&mut |child| {
        walk(child, visit);
        false
    });
}

/// Whether `ast` uses a defined name or calls a function that may be one.
fn follows_names(ast: &Ast) -> bool {
    matches!(ast, Ast::DefinedName(_) | Ast::UnknownFunc(_))
        || ast.any_child(&mut |child| follows_names(child))
}

/// A name's formula that is one cell or range reference, read as a range
/// on `formula_sheet`: an unqualified reference reads that sheet.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node is not a single cell or range"
)]
fn reference_target(ast: &Ast, formula_sheet: u32) -> Option<CellRange> {
    let (sheet, row_start, col_start, row_end, col_end) = match ast {
        Ast::Cell(row, col, _) => (formula_sheet, *row, *col, *row, *col),
        Ast::AbsCell(sheet, row, col, _) => (sheet.handle, *row, *col, *row, *col),
        Ast::Range(r0, c0, r1, c1, _) => (formula_sheet, *r0, *c0, *r1, *c1),
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) => (sheet.handle, *r0, *c0, *r1, *c1),
        _ => return None,
    };
    Some(CellRange::new(sheet, row_start, col_start, row_end, col_end))
}

/// The names that `ast` uses, as a name or as a function it calls.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node uses no name"
)]
fn used_names<'a>(ast: &'a Ast, names: &mut Vec<&'a str>) {
    match ast {
        Ast::Name(name) | Ast::LetName { name, .. } => names.push(name),
        Ast::UnknownFunc(call) => {
            names.push(&call.name);
            for arg in &call.args {
                used_names(arg, names);
            }
        }
        Ast::Func(_, args) => {
            for arg in args {
                used_names(arg, names);
            }
        }
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            used_names(left, names);
            used_names(right, names);
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => used_names(inner, names),
        Ast::LetSlot { expression, .. } => used_names(expression, names),
        #[cfg(feature = "analysis")]
        Ast::Lambda(definition) => used_names(&definition.body, names),
        _ => {}
    }
}

/// Whether a name's formula reads differently from different cells: it has
/// a relative row or column, or a table reference, which can name the row
/// of the cell that uses it.
#[allow(
    clippy::wildcard_enum_match_arm,
    reason = "Ast has variants that exist only with the analysis feature, so a full list differs between builds; every other node has no reference to read"
)]
fn is_positional(ast: &Ast) -> bool {
    match ast {
        Ast::Cell(_, _, flags) | Ast::AbsCell(_, _, _, flags) => {
            !flags.row_abs() || !flags.col_abs()
        }
        Ast::Range(.., flags) | Ast::AbsRange(.., flags) => [flags.start, flags.end]
            .iter()
            .any(|corner| !corner.row_abs() || !corner.col_abs()),
        Ast::SheetCell(reference) => !reference.flags.row_abs() || !reference.flags.col_abs(),
        Ast::SheetRange(reference) => [reference.flags.start, reference.flags.end]
            .iter()
            .any(|corner| !corner.row_abs() || !corner.col_abs()),
        Ast::SheetSpan(span) => [span.flags.start, span.flags.end]
            .iter()
            .any(|corner| !corner.row_abs() || !corner.col_abs()),
        Ast::UnresolvedStructured(_) | Ast::Structured(_) => true,
        Ast::Func(_, args) => args.iter().any(is_positional),
        Ast::UnknownFunc(call) => call.args.iter().any(is_positional),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            is_positional(left) || is_positional(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => is_positional(inner),
        Ast::LetSlot { expression, .. } => is_positional(expression),
        #[cfg(feature = "analysis")]
        Ast::Lambda(definition) => is_positional(&definition.body),
        _ => false,
    }
}
