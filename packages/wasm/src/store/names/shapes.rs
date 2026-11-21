//! Whether a use of a defined name evaluates to an array, for shape checks
//! ([`crate::eval::ast_produces_array`]).
//!
//! Each use of a name records the name's shape in its node
//! ([`Ast::DefinedName`]), so a shape check needs no name table: [`mark`]
//! sets it where a formula's flags are worked out, and
//! [`CellStore::mark_definition_shapes`] in each name's own formula whenever
//! the names are bound. Some sheet can define a name in its own scope; a
//! workbook formula that uses such a name reads with another shape on that
//! sheet, so it is read in a copy marked for the reading sheet
//! ([`read_in_copy`], [`mark_copy`]), as develop expanded it per sheet.

use super::{Definition, NameFacts, NameScope, SheetFacts};
use crate::calc::{Ast, NameId};
use crate::eval::{ast_calls_subtotal, ast_produces_array, Shapes};
use crate::store::CellStore;
use crate::types::{ast_with_names_contains_spill_ref, ast_with_names_is_volatile};

/// Mark each use of a defined name in `ast` with its shape, as `names` reads
/// it for the formula being bound: its sheet, and the cell
/// `current_formula_origin` gives.
pub(crate) fn mark(ast: &mut Ast, names: NameScope<'_>) {
    mark_uses(ast, names);
}

/// Whether `formula` is read in a copy placed for the reading cell, since
/// the shapes of the names in it depend on the reading sheet.
pub(super) const fn read_in_copy(formula: &Definition) -> bool {
    formula.sheet_shapes()
}

/// Mark the names in `tree`, a copy of `formula` placed for a cell, for the
/// sheet of `names` when their shapes depend on it. The caller's guard is
/// up, so a use of the name inside its own formula reads as undefined.
pub(super) fn mark_copy(tree: &mut Ast, formula: &Definition, names: NameScope<'_>) {
    if formula.sheet_shapes() {
        mark_uses(tree, names);
    }
}

impl CellStore {
    /// Mark the shapes of the names in each name's formula, as read from the
    /// formula's scope (a sheet, or [`super::NO_SHEET`] for the workbook),
    /// work out each formula's [`NameFacts`], and find the workbook formulas
    /// whose shapes depend on the reading sheet
    /// ([`Definition::sheet_shapes`]); those get their facts as each sheet
    /// with names of its own reads them too ([`SheetFacts`]). One formula's
    /// marks and facts can depend on another's, so the marking repeats until
    /// nothing changes, at most once more than there are formulas: a longer
    /// run comes only from names that use each other, which read as
    /// undefined. While a formula is marked, it reads itself as empty, as a
    /// name met in its own formula reads as undefined.
    pub(super) fn mark_definition_shapes(&mut self) {
        let mut definitions = Vec::new();
        let mut scoped_sheets = Vec::new();
        for (entry_index, entry) in self.bindings.names.entries().iter().enumerate() {
            for (definition_index, (scope, definition)) in entry.definitions.iter().enumerate() {
                if let Some(own) = *scope {
                    if !scoped_sheets.contains(&own) {
                        scoped_sheets.push(own);
                    }
                }
                if let super::DefinedName::Formula(_) = definition {
                    let sheet = scope.unwrap_or(super::NO_SHEET);
                    definitions.push(((entry_index, definition_index), sheet));
                }
            }
        }
        for &(at, _) in &definitions {
            if let Some(formula) = self.bindings.names.formula_at_position(at) {
                formula.facts = NameFacts::default();
                if let Some(by_sheet) = &mut formula.sheet_shapes {
                    **by_sheet = SheetFacts::default();
                }
            }
        }
        for _ in 0..=definitions.len() {
            let mut changed = false;
            for &(at, sheet) in &definitions {
                let Some(formula) = self.bindings.names.formula_at_position(at) else {
                    continue;
                };
                let mut expression = std::mem::replace(&mut formula.expression, Ast::Missing);
                let names = NameScope::new(&self.bindings, sheet);
                changed |= mark_uses(&mut expression, names);
                let sheet_shapes =
                    sheet == super::NO_SHEET && uses_sheet_shaped_name(&expression, names.table());
                if let Some(formula) = self.bindings.names.formula_at_position(at) {
                    changed |= formula.sheet_shapes() != sheet_shapes;
                    if !sheet_shapes {
                        formula.sheet_shapes = None;
                    } else if formula.sheet_shapes.is_none() {
                        formula.sheet_shapes = Some(Box::default());
                    }
                    formula.expression = expression;
                }
                let Some(id) = NameId::at(at.0) else {
                    continue;
                };
                let facts = name_facts(id, NameScope::new(&self.bindings, sheet));
                let by_sheet = sheet_shapes.then(|| self.sheet_facts(id, &scoped_sheets));
                if let Some(formula) = self.bindings.names.formula_at_position(at) {
                    changed |= formula.facts != facts;
                    formula.facts = facts;
                    if let (Some(own), Some(worked_out)) = (&mut formula.sheet_shapes, by_sheet) {
                        changed |= **own != worked_out;
                        **own = worked_out;
                    }
                }
            }
            if !changed {
                return;
            }
        }
    }

    /// The facts of the workbook formula of `id` as each of `sheets` that
    /// reads it, rather than a definition of its own, reads it.
    fn sheet_facts(&self, id: NameId, sheets: &[u32]) -> SheetFacts {
        let Some(entry) = self.bindings.names.entry(id) else {
            return SheetFacts::default();
        };
        SheetFacts(
            sheets
                .iter()
                .filter(|&&sheet| {
                    entry
                        .definitions
                        .iter()
                        .all(|(scope, _)| *scope != Some(sheet))
                })
                .map(|&sheet| (sheet, name_facts(id, NameScope::new(&self.bindings, sheet))))
                .collect(),
        )
    }
}

/// [`mark`], returning whether a mark changed.
fn mark_uses(ast: &mut Ast, names: NameScope<'_>) -> bool {
    if let Ast::DefinedName(id, produces_array) = ast {
        let marked = names.facts(*id).has(NameFacts::ARRAY);
        let changed = *produces_array != marked;
        *produces_array = marked;
        return changed;
    }
    ast.fold_children_mut(&mut |child| mark_uses(child, names))
}

/// The facts of the formula that `id` holds for the sheet of `names`, read
/// through `names` as a formula that uses it reads it.
fn name_facts(id: NameId, names: NameScope<'_>) -> NameFacts {
    let read = names.read(id);
    if let Some(range) = read.range() {
        return NameFacts::default().with(
            NameFacts::ARRAY,
            range.row_start != range.row_end || range.col_start != range.col_end,
        );
    }
    let Some(expression) = read.formula() else {
        return NameFacts::default();
    };
    let facts = NameFacts::default()
        .with(
            NameFacts::ARRAY,
            ast_produces_array(expression, Shapes::top(names)),
        )
        .with(
            NameFacts::VOLATILE,
            ast_with_names_is_volatile(expression, names),
        )
        .with(
            NameFacts::SPILL_REFS,
            ast_with_names_contains_spill_ref(expression, names),
        )
        .with(
            NameFacts::CALLS_SUBTOTAL,
            ast_calls_subtotal(expression, names),
        );
    with_pivot_data_fact(facts, expression, names)
}

/// `facts` with whether `expression` calls GETPIVOTDATA, a fact only the
/// analysis engine has.
#[cfg(feature = "analysis")]
fn with_pivot_data_fact(facts: NameFacts, expression: &Ast, names: NameScope<'_>) -> NameFacts {
    facts.with(
        NameFacts::CALLS_PIVOT_DATA,
        crate::eval::analysis::ast_calls_pivot_data(expression, names),
    )
}

#[cfg(not(feature = "analysis"))]
const fn with_pivot_data_fact(facts: NameFacts, _: &Ast, _: NameScope<'_>) -> NameFacts {
    facts
}

/// Whether `ast` uses a name whose shape can depend on the sheet that reads
/// it: one that some sheet defines in its own scope, or one whose workbook
/// formula has [`Definition::sheet_shapes`].
fn uses_sheet_shaped_name(ast: &Ast, table: &super::NameTable) -> bool {
    if let Ast::DefinedName(id, _) = ast {
        return table.entry(*id).is_some_and(|entry| {
            entry
                .definitions
                .iter()
                .any(|(scope, definition)| match definition {
                    super::DefinedName::Range(_) => scope.is_some(),
                    super::DefinedName::Formula(formula) => {
                        scope.is_some() || formula.sheet_shapes()
                    }
                })
        });
    }
    ast.any_child(&mut |child| uses_sheet_shaped_name(child, table))
}
