//! Measures of the data model, evaluated in the filter context of each
//! pivot cell. Core sends them with the relationships (`setRelationships`),
//! so they share its storage; see [`Relationship::is_measure`].
//!
//! A measure reads columns of any model table. Base-table columns see the
//! base rows of the cell. Another table `T` sees its rows whose values match
//! the cell's labels and report filters on the fields `T` reaches through
//! many-to-one relationships; other fields put no condition on `T`, so
//! filters flow from the one side to the many side only.

use std::rc::Rc;

use super::model_source::{model_routes, ModelSource};
use super::relationships::{ColumnRef, KeyColumn, Relationship};
use super::CellStore;
use crate::calc::{parse, Ast, Func, StructuredRef, TableSection};
use crate::eval::analysis::grouping::{key_part, KeyPart};
use crate::eval::analysis::lambda::capture;
use crate::eval::{ast_produces_array, settled_cell_value};
use crate::formula_slots::FormulaResults;
use crate::pivot::{MeasureCell, PivotCache, PivotLayout};
use crate::types::{FormulaError, Value};

/// A measure resolved once per pivot pass: its formula with each model
/// column replaced by a local name, and the columns those names stand for.
struct PreparedMeasure {
    expression: Ast,
    columns: Vec<StructuredRef>,
    /// `column_name(i)` for each column, made once per pass.
    names: Vec<String>,
    /// For each column, its table's index in the pass's table list.
    tables: Vec<usize>,
    /// Whether every column is on the base table (table index 0).
    base_only: bool,
    /// Whether any column is on the base table. A cell without base rows
    /// stays blank for such a measure, as an aggregate of no rows is blank
    /// in Excel's data model.
    reads_base: bool,
}

/// The local name of column `index` in a prepared measure. Measure formulas
/// may not use names, so it cannot meet one of the user's.
fn column_name(index: usize) -> String {
    format!("_measure_column_{index}")
}

/// The rows of one non-base table `T` that pass the pivot's report filters
/// on fields `T` reaches, with their keys at the reachable axis levels.
struct RelatedRows {
    /// Reachable row-axis levels, then column-axis levels, in level order.
    levels: Vec<(bool, usize)>,
    /// Data rows of `T` that pass the filters and have no key error.
    rows: Vec<u32>,
    /// `levels.len()` keys per entry of `rows`, row-major.
    keys: Vec<KeyPart>,
    /// The levels a cell at `depths` constrains: those above its row and
    /// column depths.
    active: Vec<usize>,
    /// Indices into `rows`, sorted by their keys at `active` and ascending
    /// within equal keys, so each cell's rows are one range.
    order: Vec<u32>,
    /// The axis depths `order` was sorted for.
    depths: Option<(usize, usize)>,
}

impl RelatedRows {
    /// The keys of entry `index` of `rows` at the active levels.
    fn active_keys(&self, index: u32) -> impl Iterator<Item = &KeyPart> {
        let start = index as usize * self.levels.len();
        self.active
            .iter()
            .map(move |&level| &self.keys[start + level])
    }

    /// Sorts the rows by the levels that cells at `depths` constrain, once
    /// per pair of axis depths.
    fn sort_for(&mut self, depths: (usize, usize)) {
        if self.depths == Some(depths) {
            return;
        }
        self.depths = Some(depths);
        self.active = (0..self.levels.len())
            .filter(|&index| {
                let (on_rows, level) = self.levels[index];
                level < if on_rows { depths.0 } else { depths.1 }
            })
            .collect();
        let mut order: Vec<u32> = (0..self.rows.len() as u32).collect();
        order.sort_by(|&left, &right| self.active_keys(left).cmp(self.active_keys(right)));
        self.order = order;
    }

    /// The rows of `T` visible in the cell of `groups`, ascending: the range
    /// of `order` whose keys equal the cell's labels at the active levels.
    fn visible(&mut self, cache: &PivotCache, groups: (u32, u32), out: &mut Vec<u32>) {
        out.clear();
        self.sort_for((
            cache.group_depth(true, groups.0),
            cache.group_depth(false, groups.1),
        ));
        let mut wanted = Vec::with_capacity(self.active.len());
        for &index in &self.active {
            let (on_rows, level) = self.levels[index];
            let group = if on_rows { groups.0 } else { groups.1 };
            match key_part(&cache.path_label(on_rows, group, level)) {
                Ok(key) => wanted.push(key),
                Err(_) => return,
            }
        }

        let start = self
            .order
            .partition_point(|&index| self.active_keys(index).lt(wanted.iter()));
        let end = self
            .order
            .partition_point(|&index| self.active_keys(index).le(wanted.iter()));
        out.extend(
            self.order[start..end]
                .iter()
                .map(|&index| self.rows[index as usize]),
        );
    }
}

impl CellStore {
    /// Measure values of one model pivot's output as `(offset, value)`
    /// cells. Each formula is prepared once; bound values live only for one
    /// cell. `fields` are the pivot's model fields.
    #[inline(never)]
    pub(super) fn pivot_measure_cells(
        &self,
        cache: &PivotCache,
        layout: &PivotLayout,
        base: &str,
        fields: &[ColumnRef],
    ) -> Vec<(usize, Value)> {
        let mut tables = vec![base.to_string()];
        let prepared: Vec<Result<PreparedMeasure, FormulaError>> = cache
            .values()
            .iter()
            .map(|value| self.prepare_pivot_measure(value.measure.as_deref(), &mut tables))
            .collect();
        let mut related: Vec<Result<RelatedRows, FormulaError>> = tables[1..]
            .iter()
            .map(|table| self.related_rows(cache, table, fields))
            .collect();
        let include_empty = prepared
            .iter()
            .any(|measure| measure.as_ref().is_ok_and(|measure| !measure.base_only));

        let mut cells = Vec::new();
        let mut visible = vec![Vec::new(); related.len()];
        let mut current = None;
        cache.visit_measure_cells(layout, include_empty, &mut |cell: &MeasureCell<'_>| {
            let measure = match &prepared[cell.slot] {
                Ok(measure) if measure.reads_base && cell.rows.is_empty() => return,
                Ok(measure) => measure,
                Err(error) => return cells.push((cell.offset, Value::Error(*error))),
            };
            if current != Some(cell.groups) {
                current = Some(cell.groups);
                for (rows, table) in visible.iter_mut().zip(&mut related) {
                    if let Ok(table) = table {
                        table.visible(cache, cell.groups, rows);
                    }
                }
            }

            let value = match measure.tables.iter().find_map(|&table| {
                table
                    .checked_sub(1)
                    .and_then(|index| related[index].as_ref().err())
            }) {
                Some(error) => Value::Error(*error),
                None => {
                    let rows_of = |table: usize| {
                        table
                            .checked_sub(1)
                            .map_or(cell.rows, |index| visible[index].as_slice())
                    };
                    self.measure_family(measure, &rows_of)
                }
            };
            cells.push((cell.offset, value));
        });
        cells
    }

    /// The measure with `id`, if core sent one.
    pub(super) fn measure_by_id(&self, id: &str) -> Option<&Relationship> {
        self.measures().find(|record| record.id == id)
    }

    fn measures(&self) -> impl Iterator<Item = &Relationship> {
        self.relationships
            .as_deref()
            .into_iter()
            .flatten()
            .filter(|record| record.is_measure())
    }

    /// The measure of one pivot value, prepared for a pass whose tables are
    /// `tables` (the base first); tables it reads are appended.
    ///
    /// Errors: a missing measure, table or column, or an unknown measure
    /// name, is `#REF!`; a formula that does not parse is `#NAME?`; a cycle
    /// of measure references and any reference other than a qualified data
    /// column or a measure name is `#VALUE!`.
    #[inline(never)]
    fn prepare_pivot_measure(
        &self,
        id: Option<&str>,
        tables: &mut Vec<String>,
    ) -> Result<PreparedMeasure, FormulaError> {
        let measure = id
            .and_then(|id| self.measure_by_id(id))
            .ok_or(FormulaError::Ref)?;
        let mut stack = Vec::new();
        let expression = self.inlined_measure(measure, &mut stack)?;
        // Resolved as a cell formula at A1, so names resolve too and a
        // defined name is refused below.
        let mut expression = self.resolve_parsed_formula(expression, 0, 0, 0)?;
        let mut columns = Vec::new();
        name_columns(&mut expression, &mut columns)?;

        let column_tables: Vec<usize> = columns
            .iter()
            .map(|column: &StructuredRef| {
                tables
                    .iter()
                    .position(|table| *table == column.table_id)
                    .unwrap_or_else(|| {
                        tables.push(column.table_id.clone());
                        tables.len() - 1
                    })
            })
            .collect();
        let names = (0..columns.len()).map(column_name).collect();
        Ok(PreparedMeasure {
            expression,
            columns,
            names,
            base_only: column_tables.iter().all(|&table| table == 0),
            reads_base: column_tables.contains(&0),
            tables: column_tables,
        })
    }

    /// The parsed formula of `measure` with every `[Name]` reference to
    /// another measure replaced by that measure's formula, before any
    /// reference resolves. `stack` holds the measures being inlined.
    fn inlined_measure<'a>(
        &'a self,
        measure: &'a Relationship,
        stack: &mut Vec<&'a str>,
    ) -> Result<Ast, FormulaError> {
        if self.table_by_id(&measure.from.table).is_none() {
            return Err(FormulaError::Ref);
        }
        if stack.contains(&measure.id.as_str()) {
            return Err(FormulaError::Value);
        }

        let mut expression = parse(&measure.from.column).map_err(|_| FormulaError::Name)?;
        stack.push(&measure.id);
        let inlined = self.inline_references(&mut expression, stack);
        stack.pop();
        inlined.map(|()| expression)
    }

    fn inline_references<'a>(
        &'a self,
        expression: &mut Ast,
        stack: &mut Vec<&'a str>,
    ) -> Result<(), FormulaError> {
        match expression {
            Ast::UnresolvedStructured(reference)
                if reference.table_name.is_none() && reference.section == TableSection::Body =>
            {
                let name = reference.column_name.to_lowercase();
                let measure = self
                    .measures()
                    .find(|measure| measure.to.column.to_lowercase() == name)
                    .ok_or(FormulaError::Ref)?;
                *expression = self.inlined_measure(measure, stack)?;
                Ok(())
            }
            Ast::Func(_, arguments) | Ast::UnknownFunc(_, arguments) => arguments
                .iter_mut()
                .try_for_each(|argument| self.inline_references(argument, stack)),
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                self.inline_references(left, stack)?;
                self.inline_references(right, stack)
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                self.inline_references(inner, stack)
            }
            _ => Ok(()),
        }
    }

    /// The rows of non-base table `table` and their keys at the axis levels
    /// whose fields it reaches, filtered by the reachable report filters.
    fn related_rows(
        &self,
        cache: &PivotCache,
        table: &str,
        fields: &[ColumnRef],
    ) -> Result<RelatedRows, FormulaError> {
        let reachable: Vec<&str> = model_routes(self, table)
            .iter()
            .map(|route| route.0)
            .collect();
        let reaches = |field: usize| {
            fields
                .get(field)
                .is_some_and(|column| reachable.contains(&column.table.as_str()))
        };
        let definition = cache.definition();
        let levels: Vec<(bool, usize)> = [(true, &definition.rows), (false, &definition.columns)]
            .into_iter()
            .flat_map(|(on_rows, axis)| {
                axis.iter()
                    .enumerate()
                    .filter(|&(_, &field)| reaches(field))
                    .map(move |(level, _)| (on_rows, level))
            })
            .collect();
        let filters: Vec<_> = definition
            .filters
            .iter()
            .filter(|filter| reaches(filter.field))
            .collect();

        // One model source over `table`: the level fields, then the filters.
        let columns: Vec<ColumnRef> = levels
            .iter()
            .map(|&(on_rows, level)| {
                let axis = if on_rows {
                    &definition.rows
                } else {
                    &definition.columns
                };
                fields[axis[level]].clone()
            })
            .chain(filters.iter().map(|filter| fields[filter.field].clone()))
            .collect();
        let source = ModelSource::build(self, table, &columns)?;
        let definition_table = self.table_by_id(table).ok_or(FormulaError::Ref)?;
        let count = definition_table
            .columns
            .first()
            .map_or(0, |column| KeyColumn::at(definition_table, column).rows);

        let mut related = RelatedRows {
            levels,
            rows: Vec::new(),
            keys: Vec::new(),
            active: Vec::new(),
            order: Vec::new(),
            depths: None,
        };
        let mut folded = String::new();
        'rows: for row in 0..count as usize {
            for (index, filter) in filters.iter().enumerate() {
                let value = source.value(row, related.levels.len() + index);
                if !filter.keeps(&value, &mut folded) {
                    continue 'rows;
                }
            }
            let start = related.keys.len();
            for field in 0..related.levels.len() {
                match key_part(&source.value(row, field)) {
                    Ok(key) => related.keys.push(key),
                    Err(_) => {
                        related.keys.truncate(start);
                        continue 'rows;
                    }
                }
            }
            related.rows.push(row as u32);
        }
        Ok(related)
    }

    /// Evaluates a prepared measure, binding each column name to the
    /// settled values of its table's rows in the cell (`rows_of(table)`), as
    /// LAMBDA binds parameters. A measure returns one value, so an array
    /// result is `#VALUE!`.
    #[inline(never)]
    fn measure_family<'r>(
        &self,
        measure: &PreparedMeasure,
        rows_of: &dyn Fn(usize) -> &'r [u32],
    ) -> Value {
        let bindings: Vec<(&str, Ast)> = measure
            .names
            .iter()
            .zip(&measure.columns)
            .zip(&measure.tables)
            .map(|((name, column), &table)| {
                (name.as_str(), self.bind_column(column, rows_of(table)))
            })
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
    /// No rows bind one blank, as an empty range reads.
    #[inline(never)]
    fn bind_column(&self, column: &StructuredRef, rows: &[u32]) -> Ast {
        let sheet = &self.sheets[column.sheet as usize];
        let mut values: Vec<Value> = rows
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
        if values.is_empty() {
            values.push(Value::Blank);
        }
        Ast::BoundMatrix {
            rows: values.len(),
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
