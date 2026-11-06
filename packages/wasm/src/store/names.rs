//! Defined names that hold a formula, such as `Tax = 0.2`,
//! `Recent = OFFSET(Data!$A$1,COUNT(Data!$A:$A)-5,0,5)` or
//! `MYFN = LAMBDA(x,x+1)`.
//!
//! A formula that uses such a name gets the name's formula expanded in its
//! tree as an [`Ast::NamedFormula`] node, which writes back as the name.
//! Expansion happens when the formula is parsed, like the expansion of named
//! ranges, so evaluation reads no name table. Every change that alters an
//! expansion (a definition, a sheet, a table, a row or column edit)
//! re-resolves every formula through `refresh_named_formula_entries`.
//!
//! As in Excel, relative references in a name's formula are relative to cell
//! A1, and a formula at C5 that uses the name reads them two columns right
//! and four rows down.
//!
//! A name whose expansion is the same for every cell and every sheet is
//! resolved once, when formulas are refreshed, and every formula that uses it
//! shares that one resolved definition. A single unqualified reference takes
//! the sheet of the formula when the formula binds to the name. Any other
//! name is expanded for the cell that binds to it.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use wasm_bindgen::prelude::*;

use super::{workbook_name_key, CellStore};
use crate::calc::{
    invalidate_sheet_refs, parse, rename_sheet_refs, resolve_named_ranges, resolve_structured_refs,
    shift_cols, shift_rows, translate_name_refs, Ast, NameTarget, NamedFormulaRef, NamedRangeRef,
    RangeFlags, RefFlags,
};
use crate::formula_rewrite::rewrite_parsed_references;
use crate::memory::MemoryOwnerStats;
use crate::types::{FormulaError, Value};

/// The formula sheet a name's definition is shifted as: no sheet, so a
/// row or column edit moves only the references that name their sheet. An
/// unqualified reference reads the sheet of the formula that uses the name.
const NO_SHEET: u32 = u32::MAX;

type NameKey = (Option<u32>, String);

/// Most nodes one name's expansion may have, counting the names in it at
/// their own expanded size. Past it the name returns `#NUM!`, as a LET does
/// past its expansion limit, so a chain of names that each use the next
/// twice cannot grow without bound.
const EXPANSION_NODE_LIMIT: usize = 65_536;

pub(super) enum DefinedName {
    Range(NamedRangeRef),
    Formula(Box<Definition>),
}

pub(super) struct Definition {
    name: String,
    /// The formula with its leading `=`, as the host reads it back.
    source: String,
    /// `source` parsed, with its sheet references resolved. Defined names in
    /// it resolve in each formula that uses the name.
    ast: Ast,
    /// Whether the expansion depends on the cell that uses the name: a
    /// relative reference or a table reference makes it so.
    positional: bool,
    /// The one resolved definition that every formula binds to, when the
    /// expansion is the same for every cell and sheet. A reference target
    /// whose sheet is [`NO_SHEET`] takes the formula's sheet at bind.
    /// `resolve_name_definitions` sets it whenever formulas are refreshed.
    resolved: Option<NameTarget>,
    /// Where `resolve_name_definitions` is with this definition while it
    /// orders definitions so that each one's names are resolved first.
    visit: Cell<Visit>,
}

/// The state of a definition while `resolve_name_definitions` orders them.
#[derive(Clone, Copy, PartialEq)]
enum Visit {
    Unvisited,
    Visiting,
    Done,
}

impl Definition {
    /// Rewrite each reference of the tree with `rewrite`; the source changes
    /// only where a reference changed.
    fn rewrite(&mut self, rewrite: &mut dyn FnMut(&mut Ast) -> bool) -> bool {
        let Some(source) = rewrite_parsed_references(&self.source, &mut self.ast, rewrite) else {
            return false;
        };
        self.source = source;
        true
    }
}

/// The cell whose formula is being resolved, and the state of the defined
/// names being expanded for it.
pub(crate) struct NamePlacement {
    row: u32,
    col: u32,
    /// Name keys being expanded. A name met again inside its own expansion
    /// stays unresolved: a plain formula then returns `#NAME?`, and a LAMBDA
    /// that calls itself finds itself when the call is evaluated.
    expanding: RefCell<Vec<String>>,
    /// Whether the expansion in progress depends on `row` and `col`.
    positional: Cell<bool>,
    /// The lowest index in `expanding` that the expansion in progress left
    /// unresolved, or `usize::MAX`. An expansion that left a name outside
    /// itself unresolved differs where that name is not being expanded, so
    /// it is not reused.
    lowest_cut: Cell<usize>,
    /// Whether the expansion in progress reads a name that some sheet
    /// defines in its own scope, so it reads differently on that sheet. Only
    /// set while definitions are resolved for every sheet.
    sheet_bound: Cell<bool>,
    /// The names already expanded for this one formula, so a name used many
    /// times, directly or through other names, is expanded once. It lives
    /// only as long as this placement, which serves one formula. A formula
    /// uses few names, so a list is searched.
    placed: RefCell<Vec<Placed>>,
}

/// One name expanded for the formula of a [`NamePlacement`].
struct Placed {
    key: String,
    target: NameTarget,
    /// Whether the expansion depends on the formula's cell.
    positional: bool,
    /// Whether the expansion depends on the formula's sheet.
    sheet_bound: bool,
}

impl NamePlacement {
    pub(crate) fn new(row: u32, col: u32) -> Self {
        Self {
            row,
            col,
            expanding: RefCell::new(Vec::new()),
            positional: Cell::new(false),
            lowest_cut: Cell::new(usize::MAX),
            sheet_bound: Cell::new(false),
            placed: RefCell::new(Vec::new()),
        }
    }

    /// Start one definition: forget what the previous one found.
    fn restart(&self) {
        self.positional.set(false);
        self.lowest_cut.set(usize::MAX);
        self.sheet_bound.set(false);
        self.placed.borrow_mut().clear();
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
        let Some(scope) = self.defined_name_scope(name, scope) else {
            return false;
        };
        let Some(ast) = parse(source)
            .ok()
            .and_then(|ast| self.resolve_sheets(ast).ok())
        else {
            return false;
        };

        let key = (scope, workbook_name_key(name));
        let definition = Definition {
            name: name.to_string(),
            source: source.to_string(),
            positional: is_positional(&ast),
            ast,
            resolved: None,
            visit: Cell::new(Visit::Unvisited),
        };
        self.defined_names
            .insert(key, DefinedName::Formula(Box::new(definition)));
        self.refresh_named_formula_entries();
        self.recompute_all_sheets();
        true
    }

    /// The formula of the defined name `name` in `scope` (-1 for the
    /// workbook), or nothing when the name holds no formula there. A sheet
    /// rename, a sheet removal or a row or column edit can rewrite it.
    #[wasm_bindgen(js_name = namedFormulaSource)]
    pub fn named_formula_source(&self, name: &str, scope: i32) -> Option<String> {
        let scope = u32::try_from(scope).ok();
        match self.defined_names.get(&(scope, workbook_name_key(name)))? {
            DefinedName::Formula(definition) => Some(definition.source.clone()),
            DefinedName::Range(_) => None,
        }
    }

    /// Rewrite a saved name definition after a row/column move. Unqualified
    /// relative references keep their A1-relative meaning; only references
    /// qualified by the moved sheet follow that sheet's cells.
    #[wasm_bindgen(js_name = moveNamedFormulaSource)]
    pub fn move_named_formula_source(
        &self,
        source: &str,
        sheet: u32,
        columns: bool,
        from: u32,
        count: u32,
        to: u32,
    ) -> Option<String> {
        let mut ast = self.resolve_sheets(parse(source).ok()?).ok()?;
        let moved = rewrite_parsed_references(source, &mut ast, &mut |reference| {
            crate::calc::move_named_formula_refs(reference, sheet, columns, from, count, to)
        });
        Some(moved.unwrap_or_else(|| source.to_owned()))
    }
}

impl CellStore {
    /// What `name` stands for in a formula on `formula_sheet` at the cell of
    /// `placement`: a sheet-scoped name first, then the workbook's.
    pub(crate) fn name_target(
        &self,
        name: &str,
        formula_sheet: u32,
        placement: &NamePlacement,
    ) -> Option<NameTarget> {
        let mut key = workbook_name_key(name);
        if formula_sheet == NO_SHEET {
            key = self.note_sheet_scoped(key, placement);
        }
        for scope in [Some(formula_sheet), None] {
            let scoped = (scope, key);
            match self.defined_names.get(&scoped) {
                Some(DefinedName::Range(range)) => return Some(NameTarget::Range(range.clone())),
                Some(DefinedName::Formula(definition)) => {
                    return self.expand(definition, scoped, formula_sheet, placement);
                }
                None => {}
            }
            key = scoped.1;
        }
        None
    }

    /// Mark the definition being resolved for every sheet as depending on
    /// the sheet when some sheet defines `key` in its own scope. Returns `key`.
    fn note_sheet_scoped(&self, key: String, placement: &NamePlacement) -> String {
        let mut scoped = (None, key);
        for (sheet, _) in (0u32..).zip(&self.sheet_names) {
            scoped.0 = Some(sheet);
            if self.defined_names.contains_key(&scoped) {
                placement.sheet_bound.set(true);
                break;
            }
        }
        scoped.1
    }

    /// Cell formulas and expanded name definitions use one resolver closure
    /// type, so the recursive traversal has one compiled specialization.
    #[inline(never)]
    pub(super) fn resolve_defined_names(
        &self,
        ast: Ast,
        formula_sheet: u32,
        placement: &NamePlacement,
    ) -> Ast {
        resolve_named_ranges(ast, formula_sheet, &|name, sheet| {
            self.name_target(name, sheet, placement)
        })
    }

    fn expand(
        &self,
        definition: &Definition,
        (scope, key): NameKey,
        formula_sheet: u32,
        placement: &NamePlacement,
    ) -> Option<NameTarget> {
        let depth = {
            let expanding = placement.expanding.borrow();
            if let Some(index) = expanding.iter().position(|expanding| *expanding == key) {
                placement
                    .lowest_cut
                    .set(placement.lowest_cut.get().min(index));
                return None;
            }
            expanding.len()
        };
        if let Some(placed) = placement
            .placed
            .borrow()
            .iter()
            .find(|placed| placed.key == key)
        {
            placement
                .positional
                .set(placement.positional.get() || placed.positional);
            placement
                .sheet_bound
                .set(placement.sheet_bound.get() || placed.sheet_bound);
            return Some(placed.target.clone());
        }
        if let Some(target) = &definition.resolved {
            return Some(match target {
                NameTarget::Range(range) => place_range(range.clone(), formula_sheet, depth),
                _ => target.clone(),
            });
        }

        let outer_positional = placement.positional.replace(definition.positional);
        let outer_sheet_bound = placement.sheet_bound.replace(false);
        let outer_cut = placement.lowest_cut.replace(usize::MAX);
        placement.expanding.borrow_mut().push(key.clone());
        let mut ast = definition.ast.clone();
        if definition.positional {
            translate_name_refs(&mut ast, placement.row, placement.col);
        }
        let ast = self.resolve_defined_names(ast, formula_sheet, placement);
        let ast = resolve_structured_refs(
            ast,
            formula_sheet,
            placement.row,
            placement.col,
            &|reference, sheet, row, col| {
                self.resolve_structured_reference(reference, sheet, row, col)
            },
        );
        placement.expanding.borrow_mut().pop();
        let positional = placement.positional.get();
        let sheet_bound = placement.sheet_bound.get();
        let cut = placement.lowest_cut.get();
        placement.positional.set(outer_positional || positional);
        placement.sheet_bound.set(outer_sheet_bound || sheet_bound);
        placement.lowest_cut.set(outer_cut.min(cut));

        let target = match reference_target(&ast, &definition.name, scope, formula_sheet) {
            Some(range) => place_range(range, formula_sheet, depth),
            None => NameTarget::Formula(Rc::new(bounded_expansion(&definition.name, ast))),
        };
        if cut >= depth {
            placement.placed.borrow_mut().push(Placed {
                key,
                target: target.clone(),
                positional,
                sheet_bound,
            });
        }
        Some(target)
    }

    /// Resolve every name definition once, for every formula that uses it.
    /// A definition whose expansion depends on the cell or the sheet that
    /// uses it is left unresolved and is expanded where it is used. Names
    /// that a definition uses are resolved before it, so it reads their
    /// resolved form.
    pub(super) fn resolve_name_definitions(&mut self) {
        let mut keys = Vec::new();
        for (key, definition) in &mut self.defined_names {
            if let DefinedName::Formula(definition) = definition {
                definition.resolved = None;
                definition.visit.set(Visit::Unvisited);
                keys.push(key.clone());
            }
        }

        let placement = NamePlacement::new(0, 0);
        for key in self.dependency_order(keys) {
            let resolved = self.resolve_definition(&key, &placement);
            if let Some(DefinedName::Formula(definition)) = self.defined_names.get_mut(&key) {
                definition.resolved = resolved;
            }
        }
    }

    /// `keys` ordered so that each definition comes after the definitions it
    /// uses. Definitions in a cycle come in the order the walk meets them.
    fn dependency_order(&self, keys: Vec<NameKey>) -> Vec<NameKey> {
        let mut order = Vec::with_capacity(keys.len());
        let mut stack: Vec<(NameKey, bool)> = Vec::new();
        for root in keys {
            stack.push((root, false));
            while let Some((key, used_names_done)) = stack.pop() {
                let Some(DefinedName::Formula(definition)) = self.defined_names.get(&key) else {
                    continue;
                };
                if used_names_done {
                    definition.visit.set(Visit::Done);
                    order.push(key);
                    continue;
                }
                if definition.visit.get() != Visit::Unvisited {
                    continue;
                }

                definition.visit.set(Visit::Visiting);
                let scope = key.0;
                stack.push((key, true));
                let mut names = Vec::new();
                used_names(&definition.ast, &mut names);
                for name in names {
                    stack.push((self.used_name_key(scope, name), false));
                }
            }
        }
        order
    }

    /// The key that `name`, used in a definition in `scope`, resolves to
    /// while definitions are resolved: the scope's own name first.
    fn used_name_key(&self, scope: Option<u32>, name: &str) -> NameKey {
        let key = workbook_name_key(name);
        if scope.is_some() {
            let scoped = (scope, key);
            if self.defined_names.contains_key(&scoped) {
                return scoped;
            }
            return (None, scoped.1);
        }
        (None, key)
    }

    /// The expansion of one definition for every sheet, or nothing when it
    /// depends on the cell or the sheet that uses it. A sheet's own name is
    /// only used on that sheet, so it resolves as that sheet's.
    fn resolve_definition(&self, key: &NameKey, placement: &NamePlacement) -> Option<NameTarget> {
        let Some(DefinedName::Formula(definition)) = self.defined_names.get(key) else {
            return None;
        };
        if definition.positional {
            return None;
        }

        placement.restart();
        let formula_sheet = key.0.unwrap_or(NO_SHEET);
        let target = self.expand(definition, key.clone(), formula_sheet, placement)?;
        let shared = !placement.positional.get()
            && !placement.sheet_bound.get()
            && placement.lowest_cut.get() == usize::MAX;
        shared.then_some(target)
    }

    /// The LAMBDA that `name` holds, expanded for the formula being
    /// evaluated. A LAMBDA that calls itself leaves that call unresolved in
    /// its expansion; evaluation finds it here when the call runs.
    #[cfg(feature = "analysis")]
    pub(crate) fn named_lambda(&self, name: &str, sheet: usize) -> Option<Rc<NamedFormulaRef>> {
        if self.defined_names.is_empty() {
            return None;
        }
        let (row, col) = crate::eval::current_formula_origin().unwrap_or((0, 0));
        match self.name_target(name, sheet as u32, &NamePlacement::new(row, col))? {
            NameTarget::Formula(formula) => Some(formula),
            NameTarget::Range(_) | NameTarget::Reference(_) => None,
        }
    }

    /// Follow a row (or, with `columns`, column) insertion or deletion on
    /// `edited_sheet` in every name's formula. Returns whether formulas need
    /// resolving again: a name's formula changed, or a name is placed by
    /// the cell that uses it, and formulas on the edited sheet moved.
    pub(super) fn shift_named_formulas(
        &mut self,
        edited_sheet: u32,
        at: u32,
        delta: i64,
        columns: bool,
    ) -> bool {
        let mut refresh = false;
        for definition in self.defined_names.values_mut() {
            let DefinedName::Formula(definition) = definition else {
                continue;
            };
            refresh |= definition.positional
                | definition.rewrite(&mut |ast| {
                    if columns {
                        shift_cols(ast, at, delta, NO_SHEET, edited_sheet)
                    } else {
                        shift_rows(ast, at, delta, NO_SHEET, edited_sheet)
                    }
                });
        }
        refresh
    }

    /// Follow a sheet rename in every name's formula.
    pub(super) fn rename_sheet_in_named_formulas(&mut self, handle: u32, name: &str) {
        for definition in self.defined_names.values_mut() {
            if let DefinedName::Formula(definition) = definition {
                definition.rewrite(&mut |ast| rename_sheet_refs(ast, handle, name));
            }
        }
    }

    /// Turn a removed sheet's references into `#REF!`. The table owner has
    /// already removed definitions scoped to that sheet.
    pub(super) fn remove_sheet_from_named_formulas(&mut self, handle: u32) -> bool {
        let mut changed = false;
        for definition in self.defined_names.values_mut() {
            if let DefinedName::Formula(definition) = definition {
                changed |= definition.rewrite(&mut |ast| invalidate_sheet_refs(ast, handle));
            }
        }
        changed
    }

    pub(super) fn add_defined_name_memory(&self, metadata: &mut MemoryOwnerStats) {
        metadata.add_hash_table::<NameKey, DefinedName>(
            self.defined_names.len(),
            self.defined_names.capacity(),
        );
        for ((_, key), definition) in &self.defined_names {
            metadata.add_payload(key.len(), key.capacity());
            let DefinedName::Formula(definition) = definition else {
                if let DefinedName::Range(range) = definition {
                    metadata.add_payload(range.name.len(), range.name.capacity());
                }
                continue;
            };
            let bytes = std::mem::size_of::<Definition>();
            metadata.add_payload(bytes, bytes);
            metadata.add_payload(definition.name.len(), definition.name.capacity());
            metadata.add_payload(definition.source.len(), definition.source.capacity());
            definition.ast.heap_memory_stats(metadata);
            match &definition.resolved {
                Some(NameTarget::Range(range)) => {
                    metadata.add_payload(range.name.len(), range.name.capacity());
                }
                Some(NameTarget::Formula(expansion)) => {
                    let bytes = std::mem::size_of::<NamedFormulaRef>();
                    metadata.add_payload(bytes, bytes);
                    metadata.add_payload(expansion.name.len(), expansion.name.capacity());
                    expansion.expression.heap_memory_stats(metadata);
                }
                Some(NameTarget::Reference(_)) | None => {}
            }
        }
    }

    /// Every name's scope, name and formula, for a same-build transfer.
    pub(super) fn named_formula_sources(&self) -> impl Iterator<Item = (Option<u32>, &str, &str)> {
        self.defined_names
            .iter()
            .filter_map(|((scope, _), definition)| match definition {
                DefinedName::Formula(definition) => {
                    Some((*scope, definition.name.as_str(), definition.source.as_str()))
                }
                DefinedName::Range(_) => None,
            })
    }

    /// Define a transferred name without resolving formulas, which the
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
        let key = (scope, workbook_name_key(&name));
        let definition = Definition {
            name,
            source,
            positional: is_positional(&ast),
            ast,
            resolved: None,
            visit: Cell::new(Visit::Unvisited),
        };
        self.defined_names
            .insert(key, DefinedName::Formula(Box::new(definition)));
        Ok(())
    }
}

/// A name's single reference for a formula on `formula_sheet`. A reference
/// with no sheet takes the formula's sheet. While a definition is resolved for
/// every sheet, it keeps no sheet at the top of that definition, which takes
/// the sheet at bind, and stays a plain reference inside it, which reads the
/// sheet of the formula that evaluates it.
fn place_range(range: NamedRangeRef, formula_sheet: u32, depth: usize) -> NameTarget {
    if range.sheet != NO_SHEET {
        return NameTarget::Range(range);
    }
    if formula_sheet == NO_SHEET && depth > 0 {
        let absolute = RefFlags {
            row_abs: true,
            col_abs: true,
        };
        return NameTarget::Reference(Ast::Range(
            range.row_start,
            range.col_start,
            range.row_end,
            range.col_end,
            RangeFlags {
                start: absolute,
                end: absolute,
            },
        ));
    }

    NameTarget::Range(NamedRangeRef {
        sheet: formula_sheet,
        ..range
    })
}

/// The expansion of `name`, or a `#NUM!` in its place when it is larger than
/// [`EXPANSION_NODE_LIMIT`].
fn bounded_expansion(name: &str, expression: Ast) -> NamedFormulaRef {
    let nodes = expanded_nodes(&expression);
    let expression = if nodes > EXPANSION_NODE_LIMIT {
        Ast::Array {
            cols: 1,
            values: vec![Value::Error(FormulaError::Num)],
        }
    } else {
        expression
    };
    NamedFormulaRef {
        name: name.to_string(),
        expression,
        nodes,
    }
}

/// The nodes a walk over `ast` visits, where a name counts as its expansion.
fn expanded_nodes(ast: &Ast) -> usize {
    let children = match ast {
        Ast::NamedFormula(named) => return named.nodes,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args
            .iter()
            .map(expanded_nodes)
            .fold(0, usize::saturating_add),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            expanded_nodes(left).saturating_add(expanded_nodes(right))
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => expanded_nodes(inner),
        Ast::LetSlot { expression, .. } => expanded_nodes(expression),
        _ => 0,
    };
    children.saturating_add(1)
}

/// A name whose formula is one cell or range reference is a named range in
/// the formula that uses it, so functions that take a reference accept it.
fn reference_target(
    ast: &Ast,
    name: &str,
    scope: Option<u32>,
    formula_sheet: u32,
) -> Option<NamedRangeRef> {
    let (sheet, row_start, col_start, row_end, col_end) = match ast {
        Ast::Cell(row, col, _) => (formula_sheet, *row, *col, *row, *col),
        Ast::AbsCell(sheet, row, col, _) => (sheet.handle, *row, *col, *row, *col),
        Ast::Range(r0, c0, r1, c1, _) => (formula_sheet, *r0, *c0, *r1, *c1),
        Ast::AbsRange(sheet, r0, c0, r1, c1, _) => (sheet.handle, *r0, *c0, *r1, *c1),
        _ => return None,
    };
    Some(NamedRangeRef {
        name: name.to_string(),
        scope,
        sheet,
        row_start,
        col_start,
        row_end,
        col_end,
    })
}

/// The names that `ast` uses, as a name or as a function it calls.
fn used_names<'a>(ast: &'a Ast, names: &mut Vec<&'a str>) {
    match ast {
        Ast::Name(name) => names.push(name),
        Ast::UnknownFunc(name, args) => {
            names.push(name);
            for arg in args {
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
        _ => {}
    }
}

/// Whether a name's formula reads differently from different cells: it has
/// a relative row or column, or a table reference, which can name the row
/// of the cell that uses it.
fn is_positional(ast: &Ast) -> bool {
    match ast {
        Ast::Cell(_, _, flags) | Ast::SheetCell(_, _, _, flags) | Ast::AbsCell(_, _, _, flags) => {
            !flags.row_abs || !flags.col_abs
        }
        Ast::Range(.., flags) | Ast::SheetRange(.., flags) | Ast::AbsRange(.., flags) => {
            [flags.start, flags.end]
                .iter()
                .any(|corner| !corner.row_abs || !corner.col_abs)
        }
        Ast::SheetSpan(span) => [span.flags.start, span.flags.end]
            .iter()
            .any(|corner| !corner.row_abs || !corner.col_abs),
        Ast::UnresolvedStructured(_) | Ast::Structured(_) => true,
        Ast::Func(_, args) | Ast::UnknownFunc(_, args) => args.iter().any(is_positional),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            is_positional(left) || is_positional(right)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => is_positional(inner),
        Ast::LetSlot { expression, .. } => is_positional(expression),
        _ => false,
    }
}
