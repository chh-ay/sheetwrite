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

use super::{Definition, NameScope};
use crate::calc::{Ast, NameId};
use crate::eval::{ast_produces_array, Shapes};
use crate::store::CellStore;

/// Mark each use of a defined name in `ast` with its shape, as `names` reads
/// it for the formula being bound: its sheet, and the cell
/// `current_formula_origin` gives.
pub(crate) fn mark(ast: &mut Ast, names: NameScope<'_>) {
    mark_uses(ast, names);
}

/// Whether `formula` is read in a copy placed for the reading cell, since
/// the shapes of the names in it depend on the reading sheet.
pub(super) const fn read_in_copy(formula: &Definition) -> bool {
    formula.sheet_shapes
}

/// Mark the names in `tree`, a copy of `formula` placed for a cell, for the
/// sheet of `names` when their shapes depend on it. The caller's guard is
/// up, so a use of the name inside its own formula reads as undefined.
pub(super) fn mark_copy(tree: &mut Ast, formula: &Definition, names: NameScope<'_>) {
    if formula.sheet_shapes {
        mark_uses(tree, names);
    }
}

impl CellStore {
    /// Mark the shapes of the names in each name's formula, as read from the
    /// formula's scope (a sheet, or [`super::NO_SHEET`] for the workbook),
    /// and find the workbook formulas whose shapes depend on the reading
    /// sheet ([`Definition::sheet_shapes`]). One formula's marks can depend
    /// on another's, so the marking repeats until nothing changes, at most
    /// once more than there are formulas: a longer run comes only from names
    /// that use each other, which read as undefined. While a formula is
    /// marked, it reads itself as empty, as a name met in its own formula
    /// reads as undefined.
    pub(super) fn mark_definition_shapes(&mut self) {
        let mut definitions = Vec::new();
        for (entry_index, entry) in self.bindings.names.entries().iter().enumerate() {
            for (definition_index, (scope, definition)) in entry.definitions.iter().enumerate() {
                if let super::DefinedName::Formula(_) = definition {
                    let sheet = scope.unwrap_or(super::NO_SHEET);
                    definitions.push(((entry_index, definition_index), sheet));
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
                    changed |= formula.sheet_shapes != sheet_shapes;
                    formula.sheet_shapes = sheet_shapes;
                    formula.expression = expression;
                }
            }
            if !changed {
                return;
            }
        }
    }
}

/// [`mark`], returning whether a mark changed.
fn mark_uses(ast: &mut Ast, names: NameScope<'_>) -> bool {
    if let Ast::DefinedName(id, produces_array) = ast {
        let marked = name_produces_array(*id, names);
        let changed = *produces_array != marked;
        *produces_array = marked;
        return changed;
    }
    ast.fold_children_mut(&mut |child| mark_uses(child, names))
}

/// Whether the defined name `id`, read through `names`, evaluates to an
/// array: a range of more than one cell, or a formula that does, by the
/// marks of the names in it.
fn name_produces_array(id: NameId, names: NameScope<'_>) -> bool {
    let read = names.read(id);
    match read.range() {
        Some(range) => range.row_start != range.row_end || range.col_start != range.col_end,
        None => read
            .formula()
            .is_some_and(|expression| ast_produces_array(expression, Shapes::top(names))),
    }
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
                    super::DefinedName::Formula(formula) => scope.is_some() || formula.sheet_shapes,
                })
        });
    }
    ast.any_child(&mut |child| uses_sheet_shaped_name(child, table))
}
