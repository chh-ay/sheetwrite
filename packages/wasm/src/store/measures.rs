//! Measures of the data model, evaluated in the filter context of each
//! pivot cell. Core sends them with the relationships (`setRelationships`),
//! so they share its storage; see [`Relationship::is_measure`].

use std::rc::Rc;

use super::relationships::Relationship;
use super::CellStore;
use crate::calc::{Ast, Func, StructuredRef, TableSection};
use crate::eval::analysis::lambda::capture;
use crate::eval::{ast_produces_array, settled_cell_value};
use crate::formula_slots::FormulaResults;
use crate::pivot::{PivotCache, PivotLayout};
use crate::types::{FormulaError, Value};

/// A measure resolved once per pivot pass: its formula with each model
/// column replaced by a local name, and the columns those names stand for.
struct PreparedMeasure {
    expression: Ast,
    columns: Vec<StructuredRef>,
    /// `column_name(i)` for each column, made once per pass.
    names: Vec<String>,
}

/// The local name of column `index` in a prepared measure. Measure formulas
/// may not use names, so it cannot meet one of the user's.
fn column_name(index: usize) -> String {
    format!("_measure_column_{index}")
}

impl CellStore {
    /// Measure values of one model pivot's output as `(offset, value)`
    /// cells. Each formula is prepared once; bound values live only for one
    /// cell.
    #[inline(never)]
    pub(super) fn pivot_measure_cells(
        &self,
        cache: &PivotCache,
        layout: &PivotLayout,
        base: &str,
    ) -> Vec<(usize, Value)> {
        let prepared: Vec<Result<PreparedMeasure, FormulaError>> = cache
            .values()
            .iter()
            .map(|value| self.prepare_pivot_measure(value.measure.as_deref(), base))
            .collect();

        let mut cells = Vec::new();
        cache.visit_measure_cells(layout, &mut |offset, slot, rows| {
            let value = match &prepared[slot] {
                Ok(measure) => self.measure_family(measure, rows),
                Err(error) => Value::Error(*error),
            };
            cells.push((offset, value));
        });
        cells
    }

    /// The measure with `id`, if core sent one.
    pub(super) fn measure_by_id(&self, id: &str) -> Option<&Relationship> {
        self.relationships
            .as_deref()?
            .iter()
            .find(|record| record.is_measure() && record.id == id)
    }

    /// The measure of one pivot value, prepared for a pivot whose base
    /// table is `base`. Measures read only base-table columns.
    ///
    /// Errors: a missing measure or table, or a column that does not
    /// resolve, is `#REF!`; a formula that does not parse is `#NAME?`; any
    /// other reference, or a column of another table, is `#VALUE!`.
    #[inline(never)]
    fn prepare_pivot_measure(
        &self,
        id: Option<&str>,
        base: &str,
    ) -> Result<PreparedMeasure, FormulaError> {
        let measure = id
            .and_then(|id| self.measure_by_id(id))
            .ok_or(FormulaError::Ref)?;
        if self.table_by_id(&measure.from.table).is_none() {
            return Err(FormulaError::Ref);
        }

        // Parsed and resolved as a cell formula at A1, so names resolve too
        // and a defined name is refused below.
        let mut expression = self
            .parse_formula_entry(&measure.from.column, 0, 0, 0)
            .ast
            .ok_or(FormulaError::Name)?;
        let mut columns = Vec::new();
        name_columns(&mut expression, &mut columns)?;
        if columns.iter().any(|column| column.table_id != base) {
            return Err(FormulaError::Value);
        }

        let names = (0..columns.len()).map(column_name).collect();
        Ok(PreparedMeasure {
            expression,
            columns,
            names,
        })
    }

    /// Evaluates a prepared measure over base rows `rows`, binding each
    /// column name to those rows' settled values as LAMBDA binds parameters.
    /// A measure returns one value, so an array result is `#VALUE!`.
    #[inline(never)]
    fn measure_family(&self, measure: &PreparedMeasure, rows: &[u32]) -> Value {
        let bindings: Vec<(&str, Ast)> = measure
            .names
            .iter()
            .zip(&measure.columns)
            .map(|(name, column)| (name.as_str(), self.bind_column(column, rows)))
            .collect();

        match capture(&measure.expression, &bindings) {
            Ok(expression) if ast_produces_array(&expression) => Value::Error(FormulaError::Value),
            Ok(expression) => {
                self.eval_conditional_ast(&expression, 0, 0, 0, &mut FormulaResults::default())
            }
            Err(error) => Value::Error(error),
        }
    }

    /// The settled values of one column at `rows`, as a one-column matrix.
    #[inline(never)]
    fn bind_column(&self, column: &StructuredRef, rows: &[u32]) -> Ast {
        let sheet = &self.sheets[column.sheet as usize];
        let values = rows
            .iter()
            .map(|&row| {
                settled_cell_value(
                    sheet,
                    &self.strings,
                    column.row_start as usize + row as usize,
                    column.col as usize,
                    &self.formula_slots,
                )
            })
            .collect();
        Ast::BoundMatrix {
            rows: rows.len(),
            cols: 1,
            values: Rc::new(values),
        }
    }
}

/// Checks the references of a resolved measure and replaces each model
/// column with its local name, collecting the distinct columns in order.
/// A reference that did not resolve is `#REF!`; a measure has no cell
/// position, so cell, range, name and position-dependent references are
/// `#VALUE!`.
fn name_columns(
    expression: &mut Ast,
    columns: &mut Vec<StructuredRef>,
) -> Result<(), FormulaError> {
    match expression {
        Ast::Structured(reference)
            if reference.qualified && reference.section == TableSection::Body =>
        {
            let index = columns
                .iter()
                .position(|column| {
                    column.table_id == reference.table_id && column.col == reference.col
                })
                .unwrap_or_else(|| {
                    columns.push((**reference).clone());
                    columns.len() - 1
                });
            *expression = Ast::Name(column_name(index));
            Ok(())
        }
        Ast::UnresolvedStructured(reference)
            if reference.table_name.is_some() && reference.section == TableSection::Body =>
        {
            Err(FormulaError::Ref)
        }
        Ast::Func(
            Func::Offset
            | Func::Indirect
            | Func::Row
            | Func::Column
            | Func::Cell
            | Func::AnchorArray,
            _,
        ) => Err(FormulaError::Value),
        Ast::Func(_, arguments) | Ast::UnknownFunc(_, arguments) => arguments
            .iter_mut()
            .try_for_each(|argument| name_columns(argument, columns)),
        Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
            name_columns(left, columns)?;
            name_columns(right, columns)
        }
        Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => name_columns(inner, columns),
        Ast::Num(_) | Ast::Str(_) | Ast::Bool(_) | Ast::Missing | Ast::Array { .. } => Ok(()),
        _ => Err(FormulaError::Value),
    }
}
