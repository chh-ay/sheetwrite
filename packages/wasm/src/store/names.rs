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
//! and four rows down. An expansion with no relative or table reference is
//! the same for every cell of one sheet, so those formulas share it.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;

use rustc_hash::FxHashMap;
use wasm_bindgen::prelude::*;

use super::{workbook_name_key, CellStore};
use crate::calc::{
    invalidate_sheet_refs, parse, rename_sheet_refs, resolve_named_ranges,
    resolve_structured_refs, serialize, shift_cols, shift_rows, translate_name_refs, Ast,
    NameTarget, NamedFormulaRef, NamedRangeRef,
};
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

#[derive(Default)]
pub(crate) struct NamedFormulas {
    definitions: HashMap<NameKey, Definition>,
    /// Expansions that do not depend on the cell that uses them, by formula
    /// sheet and name key. A change that would alter one re-resolves every
    /// formula, and that clears this first.
    shared: RefCell<FxHashMap<(u32, String), NameTarget>>,
}

struct Definition {
    name: String,
    /// The formula with its leading `=`, as the host reads it back.
    source: String,
    /// `source` parsed, with its sheet references resolved. Defined names in
    /// it resolve in each formula that uses the name.
    ast: Ast,
    /// Whether the expansion depends on the cell that uses the name: a
    /// relative reference or a table reference makes it so.
    positional: bool,
}

impl Definition {
    /// Rewrite the tree with `rewrite`; the source follows a changed tree.
    fn rewrite(&mut self, rewrite: impl FnOnce(&mut Ast) -> bool) -> bool {
        if !rewrite(&mut self.ast) {
            return false;
        }
        self.source = serialize(&self.ast);
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
    /// Expansions for this cell that depend on it, by name key, so a name
    /// used many times in one formula is expanded once.
    placed: RefCell<FxHashMap<String, NameTarget>>,
}

impl NamePlacement {
    pub(crate) fn new(row: u32, col: u32) -> Self {
        Self {
            row,
            col,
            expanding: RefCell::new(Vec::new()),
            positional: Cell::new(false),
            lowest_cut: Cell::new(usize::MAX),
            placed: RefCell::new(FxHashMap::default()),
        }
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
        let Some(ast) = parse(source).ok().and_then(|ast| self.resolve_sheets(ast).ok()) else {
            return false;
        };

        let key = (scope, workbook_name_key(name));
        self.named_ranges.remove(&key);
        let definition = Definition {
            name: name.to_string(),
            source: source.to_string(),
            positional: is_positional(&ast),
            ast,
        };
        self.named_formulas
            .get_or_insert_with(Box::default)
            .definitions
            .insert(key, definition);
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
        self.named_formulas
            .as_deref()?
            .definitions
            .get(&(scope, workbook_name_key(name)))
            .map(|definition| definition.source.clone())
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
        for scope in [Some(formula_sheet), None] {
            let scoped = (scope, key);
            if let Some(range) = self.named_ranges.get(&scoped) {
                return Some(NameTarget::Range(range.clone()));
            }
            if let Some(definition) = self
                .named_formulas
                .as_deref()
                .and_then(|formulas| formulas.definitions.get(&scoped))
            {
                return self.expand(definition, scoped, formula_sheet, placement);
            }
            key = scoped.1;
        }
        None
    }

    fn expand(
        &self,
        definition: &Definition,
        (scope, key): NameKey,
        formula_sheet: u32,
        placement: &NamePlacement,
    ) -> Option<NameTarget> {
        let formulas = self.named_formulas.as_deref()?;
        let depth = {
            let expanding = placement.expanding.borrow();
            if let Some(index) = expanding.iter().position(|expanding| *expanding == key) {
                placement.lowest_cut.set(placement.lowest_cut.get().min(index));
                return None;
            }
            expanding.len()
        };
        if let Some(target) = placement.placed.borrow().get(&key) {
            placement.positional.set(true);
            return Some(target.clone());
        }
        let shared_key = (formula_sheet, key);
        if let Some(target) = formulas.shared.borrow().get(&shared_key) {
            return Some(target.clone());
        }

        let outer_positional = placement.positional.replace(definition.positional);
        let outer_cut = placement.lowest_cut.replace(usize::MAX);
        placement.expanding.borrow_mut().push(shared_key.1.clone());
        let mut ast = definition.ast.clone();
        if definition.positional {
            translate_name_refs(&mut ast, placement.row, placement.col);
        }
        let ast = resolve_named_ranges(ast, formula_sheet, &|name, sheet| {
            self.name_target(name, sheet, placement)
        });
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
        let cut = placement.lowest_cut.get();
        placement.positional.set(outer_positional || positional);
        placement.lowest_cut.set(outer_cut.min(cut));

        let target = match reference_target(&ast, &definition.name, scope, formula_sheet) {
            Some(range) => NameTarget::Range(range),
            None => NameTarget::Formula(Rc::new(bounded_expansion(&definition.name, ast))),
        };
        if cut >= depth {
            if positional {
                placement
                    .placed
                    .borrow_mut()
                    .insert(shared_key.1, target.clone());
            } else {
                formulas
                    .shared
                    .borrow_mut()
                    .insert(shared_key, target.clone());
            }
        }
        Some(target)
    }

    /// The LAMBDA that `name` holds, expanded for the formula being
    /// evaluated. A LAMBDA that calls itself leaves that call unresolved in
    /// its expansion; evaluation finds it here when the call runs.
    #[cfg(feature = "analysis")]
    pub(crate) fn named_lambda(&self, name: &str, sheet: usize) -> Option<Rc<NamedFormulaRef>> {
        self.named_formulas.as_deref()?;
        let (row, col) = crate::eval::current_formula_origin().unwrap_or((0, 0));
        match self.name_target(name, sheet as u32, &NamePlacement::new(row, col))? {
            NameTarget::Formula(formula) => Some(formula),
            NameTarget::Range(_) => None,
        }
    }

    /// Remove a defined name that holds a formula; whether there was one.
    pub(super) fn remove_named_formula(&mut self, key: &NameKey) -> bool {
        self.named_formulas
            .as_deref_mut()
            .is_some_and(|formulas| formulas.definitions.remove(key).is_some())
    }

    /// Whether a defined name that holds a formula has the name key `key`
    /// in any scope.
    pub(super) fn has_named_formula_key(&self, key: &str) -> bool {
        self.named_formulas.as_deref().is_some_and(|formulas| {
            formulas
                .definitions
                .keys()
                .any(|(_, existing)| existing == key)
        })
    }

    /// Forget every shared expansion; the caller re-resolves every formula.
    pub(super) fn forget_name_expansions(&self) {
        if let Some(formulas) = self.named_formulas.as_deref() {
            formulas.shared.borrow_mut().clear();
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
        let Some(formulas) = self.named_formulas.as_deref_mut() else {
            return false;
        };
        let mut refresh = false;
        for definition in formulas.definitions.values_mut() {
            refresh |= definition.positional
                | definition.rewrite(|ast| {
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
        if let Some(formulas) = self.named_formulas.as_deref_mut() {
            for definition in formulas.definitions.values_mut() {
                definition.rewrite(|ast| rename_sheet_refs(ast, handle, name));
            }
        }
    }

    /// Remove the names scoped to a removed sheet, and turn references to it
    /// into `#REF!`, as Excel does. Returns whether any name changed.
    pub(super) fn remove_sheet_from_named_formulas(&mut self, handle: u32) -> bool {
        let Some(formulas) = self.named_formulas.as_deref_mut() else {
            return false;
        };
        let before = formulas.definitions.len();
        formulas
            .definitions
            .retain(|(scope, _), _| *scope != Some(handle));
        let mut changed = formulas.definitions.len() != before;
        for definition in formulas.definitions.values_mut() {
            changed |= definition.rewrite(|ast| invalidate_sheet_refs(ast, handle));
        }
        changed
    }

    pub(super) fn add_named_formula_memory(&self, metadata: &mut MemoryOwnerStats) {
        let Some(formulas) = self.named_formulas.as_deref() else {
            return;
        };
        let bytes = std::mem::size_of::<NamedFormulas>();
        metadata.add_payload(bytes, bytes);
        metadata.add_hash_table::<NameKey, Definition>(
            formulas.definitions.len(),
            formulas.definitions.capacity(),
        );
        for ((_, key), definition) in &formulas.definitions {
            metadata.add_payload(key.len(), key.capacity());
            metadata.add_payload(definition.name.len(), definition.name.capacity());
            metadata.add_payload(definition.source.len(), definition.source.capacity());
            definition.ast.heap_memory_stats(metadata);
        }

        let shared = formulas.shared.borrow();
        metadata.add_hash_table::<(u32, String), NameTarget>(shared.len(), shared.capacity());
        for ((_, key), target) in shared.iter() {
            metadata.add_payload(key.len(), key.capacity());
            match target {
                NameTarget::Range(range) => {
                    metadata.add_payload(range.name.len(), range.name.capacity());
                }
                NameTarget::Formula(expansion) => {
                    let bytes = std::mem::size_of::<NamedFormulaRef>();
                    metadata.add_payload(bytes, bytes);
                    metadata.add_payload(expansion.name.len(), expansion.name.capacity());
                    expansion.expression.heap_memory_stats(metadata);
                }
            }
        }
    }

    /// Every name's scope, name and formula, for a same-build transfer.
    pub(super) fn named_formula_sources(&self) -> Vec<(Option<u32>, &str, &str)> {
        self.named_formulas
            .as_deref()
            .map(|formulas| {
                formulas
                    .definitions
                    .iter()
                    .map(|((scope, _), definition)| {
                        (*scope, definition.name.as_str(), definition.source.as_str())
                    })
                    .collect()
            })
            .unwrap_or_default()
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
        };
        self.named_formulas
            .get_or_insert_with(Box::default)
            .definitions
            .insert(key, definition);
        Ok(())
    }
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
