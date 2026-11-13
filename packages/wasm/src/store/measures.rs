//! Measures of the data model, evaluated in the filter context of each
//! pivot cell. Core sends them with the relationships (`setRelationships`),
//! so they share its storage; see [`Relationship::is_measure`].
//!
//! A measure reads columns of any model table. Base-table columns see the
//! base rows of the cell. Another table `T` sees its rows whose values match
//! the cell's labels and report filters on the fields `T` reaches through
//! many-to-one relationships; other fields put no condition on `T`, so
//! filters flow from the one side to the many side only.
//!
//! `CALCULATE(expression, filter, …)` evaluates its expression in a changed
//! copy of that context; see [`ContextEdit`]. Every table it reads, the base
//! table included, then finds its rows as another table does.

use std::hash::{Hash, Hasher};
use std::rc::Rc;

use rustc_hash::FxHasher;

use super::model_source::{model_routes, ModelSource};
use super::relationships::{ColumnRef, KeyColumn, Relationship};
use super::CellStore;
use crate::calc::{parse, Ast, CmpOp, Func, StructuredRef, TableSection};
use crate::eval::analysis::grouping::{key_part, KeyPart};
use crate::eval::analysis::lambda::{capture, literal};
use crate::eval::{ast_produces_array, comparison, settled_cell_value};
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
    /// For each column, the expression that reads it: 0 for the measure's
    /// own expression, `k + 1` for calculation `k`.
    owners: Vec<usize>,
    calculations: Vec<Calculation>,
    /// Whether every column is on the base table (table index 0).
    base_only: bool,
    /// Whether any column is on the base table. A cell without base rows
    /// stays blank for such a measure, as an aggregate of no rows is blank
    /// in Excel's data model.
    reads_base: bool,
}

/// One `CALCULATE` of a prepared measure. Its value depends only on the
/// rows of its table slots, so a pivot update evaluates it once per
/// distinct set of those rows, and the measure's expression reads it by
/// `name`.
struct Calculation {
    expression: Ast,
    name: String,
    /// The table slot its columns read: [`NO_SLOT`] for none and
    /// [`MANY_SLOTS`] for several. Only a calculation over one slot is
    /// shared between cells, keyed by that slot's row set.
    slot: usize,
}

/// [`Calculation::slot`] of a calculation that reads no column. Slot 0 is
/// the base table in the cell's own context, which no calculation reads.
const NO_SLOT: usize = 0;
/// [`Calculation::slot`] of a calculation over several table slots.
const MANY_SLOTS: usize = usize::MAX;

/// The local name of column `index` in a prepared measure. Measure formulas
/// may not use names, so it cannot meet one of the user's.
fn column_name(index: usize) -> String {
    format!("_measure_column_{index}")
}

/// The rows of one non-base table `T` that pass the pivot's report filters
/// on fields `T` reaches, with their keys at the reachable axis levels.
#[derive(Default)]
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
    /// One entry per row: the 32-bit hash of its keys at `active` above its
    /// index into `rows`, sorted, so a cell's candidate rows are one range
    /// in ascending row order.
    order: Vec<u64>,
    /// The axis depths `order` was sorted for.
    depths: Option<(usize, usize)>,
    /// Counts the sorts of `order`, so a row set's identity names one sort.
    sorts: u32,
    /// The keys of the cell [`RelatedRows::locate`] found.
    wanted: Vec<KeyPart>,
    /// The position in `order` of that cell's first row, or `u32::MAX`.
    first: u32,
}

impl RelatedRows {
    /// The keys of entry `index` of `rows` at the active levels.
    fn active_keys(&self, index: u32) -> impl Iterator<Item = &KeyPart> {
        let start = index as usize * self.levels.len();
        self.active
            .iter()
            .map(move |&level| &self.keys[start + level])
    }

    /// Orders the rows by the hash of the levels that cells at `depths`
    /// constrain. Depths that constrain the same levels keep the order.
    fn sort_for(&mut self, depths: (usize, usize)) {
        if self.depths == Some(depths) {
            return;
        }
        let active: Vec<usize> = (0..self.levels.len())
            .filter(|&index| {
                let (on_rows, level) = self.levels[index];
                level < if on_rows { depths.0 } else { depths.1 }
            })
            .collect();
        let sorted = self.depths.is_some() && active == self.active;
        self.depths = Some(depths);
        if sorted {
            return;
        }
        self.active = active;
        self.sorts += 1;
        let mut order: Vec<u64> = (0..self.rows.len() as u32)
            .map(|index| (u64::from(keys_hash(self.active_keys(index))) << 32) | u64::from(index))
            .collect();
        order.sort_unstable();
        self.order = order;
    }

    /// Finds the rows of `T` visible in the cell of `groups`: the entries
    /// of `order` with the hash of the cell's labels at the active levels
    /// whose keys equal those labels. Returns the identity of that row set:
    /// the current sort in the high half and the position of its first
    /// entry in `order` (`u32::MAX` for none) in the low half, so two cells
    /// with one identity see the same rows. [`RelatedRows::collect`] lists them.
    #[inline(never)]
    fn locate(&mut self, cache: &PivotCache, groups: (u32, u32)) -> u64 {
        self.sort_for((
            cache.group_depth(true, groups.0),
            cache.group_depth(false, groups.1),
        ));
        self.wanted.clear();
        self.first = u32::MAX;
        let sorts = u64::from(self.sorts) << 32;
        for &index in &self.active {
            let (on_rows, level) = self.levels[index];
            let group = if on_rows { groups.0 } else { groups.1 };
            match key_part(&cache.path_label(on_rows, group, level)) {
                Ok(key) => self.wanted.push(key),
                Err(_) => return sorts | u64::from(u32::MAX),
            }
        }

        let hash = keys_hash(self.wanted.iter());
        let start = self
            .order
            .partition_point(|&entry| entry < u64::from(hash) << 32);
        if let Some(position) = self.order[start..]
            .iter()
            .take_while(|&&entry| (entry >> 32) as u32 == hash)
            .position(|&entry| self.active_keys(entry as u32).eq(self.wanted.iter()))
        {
            self.first = (start + position) as u32;
        }
        sorts | u64::from(self.first)
    }

    /// The rows [`RelatedRows::locate`] found, ascending.
    fn collect(&self, out: &mut Vec<u32>) {
        out.clear();
        let Some(&first) = self.order.get(self.first as usize) else {
            return;
        };
        for &entry in self.order[self.first as usize..]
            .iter()
            .take_while(|&&entry| entry >> 32 == first >> 32)
        {
            let index = entry as u32;
            if self.active_keys(index).eq(self.wanted.iter()) {
                out.push(self.rows[index as usize]);
            }
        }
    }
}

/// Lists the rows of every table slot other than the base that the
/// expression `owner` of `measure` reads (see [`CellStore::measure_family`]).
fn collect_rows(
    measure: &PreparedMeasure,
    owner: usize,
    related: &[RelatedRows],
    visible: &mut [Vec<u32>],
) {
    for (&slot, &reader) in measure.tables.iter().zip(&measure.owners) {
        if reader == owner && slot > 0 {
            related[slot - 1].collect(&mut visible[slot - 1]);
        }
    }
}

/// The local name of calculation `index` in a prepared measure.
fn calculation_name(index: usize) -> String {
    format!("_measure_calculate_{index}")
}

/// A 32-bit hash of a sequence of keys.
fn keys_hash<'a>(keys: impl Iterator<Item = &'a KeyPart>) -> u32 {
    let mut hasher = FxHasher::default();
    for key in keys {
        key.hash(&mut hasher);
    }
    hasher.finish() as u32
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
        // Each slot is a table read in one filter context; slot 0 is the
        // base table in the cell's own context.
        let mut slots = vec![(base.to_owned(), 0)];
        let mut contexts = vec![ContextEdit::default()];
        let mut prepared: Vec<Result<PreparedMeasure, FormulaError>> = cache
            .values()
            .iter()
            .map(|value| {
                self.prepare_pivot_measure(value.measure.as_deref(), &mut slots, &mut contexts)
            })
            .collect();
        let mut related = Vec::with_capacity(slots.len() - 1);
        for (index, (table, context)) in slots.iter().enumerate().skip(1) {
            match self.related_rows(cache, table, fields, &contexts[*context]) {
                Ok(rows) => related.push(rows),
                // A measure over a table whose rows cannot be read shows the error.
                Err(error) => {
                    related.push(RelatedRows::default());
                    for measure in &mut prepared {
                        if measure
                            .as_ref()
                            .is_ok_and(|ready| ready.tables.contains(&index))
                        {
                            *measure = Err(error);
                        }
                    }
                }
            }
        }
        let include_empty = prepared
            .iter()
            .any(|measure| measure.as_ref().is_ok_and(|ready| !ready.base_only));

        let mut cells = Vec::new();
        let mut visible = vec![Vec::new(); related.len()];
        // The identity of each slot's rows in the current cell, and the
        // calculation values found so far in this update, sorted by measure,
        // calculation and row-set identity. Cells that see the same rows, such
        // as every region of one quarter under ALL of the region, share one
        // evaluation; the values are freed with the update.
        let mut identities = vec![u64::MAX; related.len()];
        let mut known: Vec<((usize, usize, u64), Value)> = Vec::new();
        let mut current = None;
        cache.visit_measure_cells(layout, include_empty, &mut |cell: &MeasureCell<'_>| {
            let measure = match &prepared[cell.slot] {
                Ok(measure) if measure.reads_base && cell.rows.is_empty() => return,
                Ok(measure) => measure,
                Err(error) => return cells.push((cell.offset, Value::Error(*error))),
            };
            if current != Some(cell.groups) {
                current = Some(cell.groups);
                for (index, table) in related.iter_mut().enumerate() {
                    let identity = table.locate(cache, cell.groups);
                    // A new sort gives new identities; drop the old values.
                    if identity >> 32 != identities[index] >> 32 {
                        known.clear();
                    }
                    identities[index] = identity;
                }
            }

            let mut calculated = Vec::with_capacity(measure.calculations.len());
            for (index, calculation) in measure.calculations.iter().enumerate() {
                let key = (calculation.slot != NO_SLOT && calculation.slot != MANY_SLOTS)
                    .then(|| (cell.slot, index, identities[calculation.slot - 1]));
                let found =
                    key.map(|slot_key| known.binary_search_by_key(&slot_key, |entry| entry.0));
                if let Some(Ok(position)) = found {
                    calculated.push(known[position].1.clone());
                    continue;
                }
                collect_rows(measure, index + 1, &related, &mut visible);
                let rows_of = |table: usize| visible[table - 1].as_slice();
                let value = self.measure_family(measure, index + 1, &rows_of, &[]);
                if let (Some(slot_key), Some(Err(position))) = (key, found) {
                    known.insert(position, (slot_key, value.clone()));
                }
                calculated.push(value);
            }

            collect_rows(measure, 0, &related, &mut visible);
            let rows_of = |table: usize| {
                table
                    .checked_sub(1)
                    .map_or(cell.rows, |index| visible[index].as_slice())
            };
            let value = self.measure_family(measure, 0, &rows_of, &calculated);
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

    /// The measure of one pivot value, prepared for a pass whose table
    /// slots are `slots` (the base in the cell's context first); slots it
    /// reads are appended, and its `CALCULATE` edits to `contexts`.
    ///
    /// Errors: a missing measure, table or column, or an unknown measure
    /// name, is `#REF!`; a formula that does not parse is `#NAME?`; a cycle
    /// of measure references, an unsupported `CALCULATE` filter and any
    /// reference other than a qualified data column or a measure name is
    /// `#VALUE!`.
    #[inline(never)]
    fn prepare_pivot_measure(
        &self,
        id: Option<&str>,
        slots: &mut Vec<(String, usize)>,
        contexts: &mut Vec<ContextEdit>,
    ) -> Result<PreparedMeasure, FormulaError> {
        let measure = id
            .and_then(|measure_id| self.measure_by_id(measure_id))
            .ok_or(FormulaError::Ref)?;
        let mut stack = Vec::new();
        let inlined = self.inlined_measure(measure, &mut stack)?;
        // Resolved as a cell formula at A1, so names resolve too and a
        // defined name is refused below.
        let mut expression = self.resolve_parsed_formula(inlined, 0, 0, 0)?;
        let first_context = contexts.len();
        let mut read = Vec::new();
        let mut calculated = Vec::new();
        self.name_columns(&mut expression, &mut read, 0, contexts, &mut calculated)?;

        let mut columns = Vec::with_capacity(read.len());
        let mut tables = Vec::with_capacity(read.len());
        let mut owners = Vec::with_capacity(read.len());
        // Each CALCULATE adds one context, so context `first_context + k` is
        // that of calculation `k`.
        let mut calculations: Vec<Calculation> = calculated
            .into_iter()
            .map(|(context, expression)| Calculation {
                expression,
                name: calculation_name(context - first_context),
                slot: NO_SLOT,
            })
            .collect();
        for (column, context) in read {
            let table_id = &self.tables.get(column.table).ok_or(FormulaError::Ref)?.id;
            let slot = slots
                .iter()
                .position(|slot| slot.0 == *table_id && slot.1 == context)
                .unwrap_or_else(|| {
                    slots.push((table_id.clone(), context));
                    slots.len() - 1
                });
            let owner = context
                .checked_sub(first_context)
                .map_or(0, |index| index + 1);
            if let Some(calculation) = owner.checked_sub(1).map(|index| &mut calculations[index]) {
                if calculation.slot != slot {
                    calculation.slot = if calculation.slot == NO_SLOT {
                        slot
                    } else {
                        MANY_SLOTS
                    };
                }
            }
            tables.push(slot);
            columns.push(column);
            owners.push(owner);
        }
        let names = (0..columns.len()).map(column_name).collect();
        Ok(PreparedMeasure {
            expression,
            columns,
            names,
            base_only: tables.iter().all(|&table| table == 0),
            reads_base: tables.contains(&0),
            tables,
            owners,
            calculations,
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
            Ast::Func(_, arguments) => arguments
                .iter_mut()
                .try_for_each(|argument| self.inline_references(argument, stack)),
            Ast::UnknownFunc(call) => call
                .args
                .iter_mut()
                .try_for_each(|argument| self.inline_references(argument, stack)),
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                self.inline_references(left, stack)?;
                self.inline_references(right, stack)
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                self.inline_references(inner, stack)
            }
            Ast::Num(_)
            | Ast::Str(_)
            | Ast::Bool(_)
            | Ast::Missing
            | Ast::BoundMatrix { .. }
            | Ast::RegexPattern(_)
            | Ast::Name(_)
            | Ast::NamedRange(_)
            | Ast::NamedFormula(_)
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
            | Ast::LetSlot { .. }
            | Ast::LetName { .. }
            | Ast::Array { .. } => Ok(()),
        }
    }

    /// The rows of `table` and their keys at the axis levels whose fields it
    /// reaches, filtered by the reachable report filters, all as `edit`
    /// changes them: removed columns put no condition on the rows, and its
    /// comparisons on reachable columns must hold.
    fn related_rows(
        &self,
        cache: &PivotCache,
        table: &str,
        fields: &[ColumnRef],
        edit: &ContextEdit,
    ) -> Result<RelatedRows, FormulaError> {
        let reachable: Vec<&str> = model_routes(self, table)
            .iter()
            .map(|route| route.0)
            .collect();
        let reaches = |column: &ColumnRef| reachable.contains(&column.table.as_str());
        let applies = |field: usize| {
            fields
                .get(field)
                .is_some_and(|column| reaches(column) && !edit.removed.contains(column))
        };
        let definition = cache.definition();
        // One model source over `table`: the level fields, the filters, then
        // the comparisons.
        let mut levels = Vec::new();
        let mut columns = Vec::new();
        for (on_rows, axis) in [(true, &definition.rows), (false, &definition.columns)] {
            for (level, &field) in axis.iter().enumerate() {
                if applies(field) {
                    levels.push((on_rows, level));
                    columns.push(fields[field].clone());
                }
            }
        }
        let mut filters = Vec::new();
        for filter in &definition.filters {
            if applies(filter.field) {
                filters.push(filter);
                columns.push(fields[filter.field].clone());
            }
        }
        let mut predicates = Vec::new();
        for predicate in &edit.predicates {
            if reaches(&predicate.0) {
                predicates.push(predicate);
                columns.push(predicate.0.clone());
            }
        }
        let source = ModelSource::build(self, table, &columns)?;
        let definition_table = self.table_by_id(table).ok_or(FormulaError::Ref)?;
        let count = definition_table
            .columns
            .first()
            .map_or(0, |column| KeyColumn::at(definition_table, column).rows);

        let mut related = RelatedRows {
            levels,
            ..RelatedRows::default()
        };
        let mut folded = String::new();
        let checked = related.levels.len() + filters.len();
        'rows: for row in 0..count as usize {
            for (index, filter) in filters.iter().enumerate() {
                let value = source.value(row, related.levels.len() + index);
                if !filter.keeps(&value, &mut folded) {
                    continue 'rows;
                }
            }
            for (index, (_, op, wanted)) in predicates.iter().enumerate() {
                let value = source.value(row, checked + index);
                if comparison(*op, &value, wanted) != Value::Bool(true) {
                    continue 'rows;
                }
            }
            let start = related.keys.len();
            for field in 0..related.levels.len() {
                if let Ok(key) = key_part(&source.value(row, field)) {
                    related.keys.push(key)
                } else {
                    related.keys.truncate(start);
                    continue 'rows;
                }
            }
            related.rows.push(row as u32);
        }
        Ok(related)
    }

    /// Evaluates the expression of a prepared measure that `owner` names
    /// (0 for the measure's own, `k + 1` for calculation `k`), binding each
    /// of its column names to the settled values of its table's rows in the
    /// cell (`rows_of(table)`), as LAMBDA binds parameters. The measure's
    /// own expression also reads the `calculated` values. A measure returns
    /// one value, so an array result is `#VALUE!`.
    #[inline(never)]
    fn measure_family<'r>(
        &self,
        measure: &PreparedMeasure,
        owner: usize,
        rows_of: &dyn Fn(usize) -> &'r [u32],
        calculated: &[Value],
    ) -> Value {
        let mut bindings: Vec<(&str, Ast)> = Vec::with_capacity(measure.columns.len());
        for (index, column) in measure.columns.iter().enumerate() {
            if measure.owners[index] == owner {
                let rows = rows_of(measure.tables[index]);
                bindings.push((&measure.names[index], self.bind_column(column, rows)));
            }
        }
        for (calculation, value) in measure.calculations.iter().zip(calculated) {
            // A blank or an error is a one-cell matrix; INDEX reads it as one
            // value, so the expression around it, IFERROR included, sees it
            // as it would the CALCULATE itself.
            let bound = match literal(value) {
                matrix @ Ast::BoundMatrix(_) => Ast::Func(
                    Func::Index,
                    vec![matrix, Ast::Num(1.0), Ast::Num(1.0)].into(),
                ),
                other @ (Ast::Num(_)
                | Ast::Str(_)
                | Ast::Bool(_)
                | Ast::Missing
                | Ast::RegexPattern(_)
                | Ast::Name(_)
                | Ast::NamedRange(_)
                | Ast::NamedFormula(_)
                | Ast::UnresolvedStructured(_)
                | Ast::Structured(_)
                | Ast::Cell(..)
                | Ast::SheetCell(_)
                | Ast::AbsCell(..)
                | Ast::Range(..)
                | Ast::SheetRange(_)
                | Ast::AbsRange(..)
                | Ast::SheetSpan(_)
                | Ast::InvalidRef
                | Ast::Func(..)
                | Ast::UnknownFunc(_)
                | Ast::Bin(..)
                | Ast::Cmp(..)
                | Ast::Neg(_)
                | Ast::Pos(_)
                | Ast::Percent(_)
                | Ast::LetSlot { .. }
                | Ast::LetName { .. }
                | Ast::Array(_)) => other,
            };
            bindings.push((&calculation.name, bound));
        }

        let expression = match owner {
            0 => &measure.expression,
            nested => &measure.calculations[nested - 1].expression,
        };
        match capture(expression, &bindings) {
            Ok(captured) if ast_produces_array(&captured) => Value::Error(FormulaError::Value),
            Ok(captured) => {
                self.eval_conditional_ast(&captured, 0, 0, 0, &mut FormulaResults::default())
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
        Ast::BoundMatrix(Box::new(crate::calc::BoundMatrix {
            rows: values.len(),
            cols: 1,
            values: Rc::new(values),
        }))
    }
}

/// The name of the function that evaluates its expression in a changed
/// filter context, as DAX `CALCULATE` does.
const CALCULATE: &str = "CALCULATE";
/// The `CALCULATE` filter that removes every filter on one column.
const ALL: &str = "ALL";

/// A change `CALCULATE` makes to the filter context of a cell.
#[derive(Default)]
struct ContextEdit {
    /// Columns whose filters are removed: their axis levels and report
    /// filters. Every compared column is here too, as a comparison
    /// replaces the filters on its column.
    removed: Vec<ColumnRef>,
    /// Comparisons each row must pass, with the column on the left.
    predicates: Vec<(ColumnRef, CmpOp, Value)>,
}

impl CellStore {
    /// The stable table and column ids of a bound model column.
    fn column_ref(&self, column: &StructuredRef) -> Result<ColumnRef, FormulaError> {
        let table = self.tables.get(column.table).ok_or(FormulaError::Ref)?;
        let id = &table.column_at(column.col).ok_or(FormulaError::Ref)?.id;
        Ok(ColumnRef {
            table: table.id.clone(),
            column: id.clone(),
        })
    }
}

/// Whether a reference is a qualified data column, the only column
/// reference a measure accepts.
fn is_data_column(reference: &StructuredRef) -> bool {
    reference.qualified && reference.section == TableSection::Body
}

/// `op` with its operands swapped: `value < column` is `column > value`.
fn swapped(op: CmpOp) -> CmpOp {
    match op {
        CmpOp::Lt => CmpOp::Gt,
        CmpOp::Gt => CmpOp::Lt,
        CmpOp::Le => CmpOp::Ge,
        CmpOp::Ge => CmpOp::Le,
        same @ (CmpOp::Eq | CmpOp::Ne) => same,
    }
}

impl CellStore {
    /// Checks the references of a resolved measure and replaces each model
    /// column with its local name, collecting the distinct columns with the
    /// filter context they are read in (0 is the cell's own context; each
    /// `CALCULATE` adds one to `contexts`). A reference that did not resolve
    /// is `#REF!`; a measure has no cell position, so cell, range, name and
    /// position-dependent references are `#VALUE!`, as is a `CALCULATE`
    /// inside another.
    fn name_columns(
        &self,
        expression: &mut Ast,
        columns: &mut Vec<(StructuredRef, usize)>,
        context: usize,
        contexts: &mut Vec<ContextEdit>,
        calculations: &mut Vec<(usize, Ast)>,
    ) -> Result<(), FormulaError> {
        match expression {
            Ast::Structured(reference) if is_data_column(reference) => {
                let index = columns
                    .iter()
                    .position(|(column, read_in)| {
                        column.table == reference.table
                            && column.col == reference.col
                            && *read_in == context
                    })
                    .unwrap_or_else(|| {
                        columns.push((*reference, context));
                        columns.len() - 1
                    });
                *expression = Ast::Name(column_name(index).into_boxed_str());
                Ok(())
            }
            Ast::UnresolvedStructured(reference)
                if reference.table_name.is_some() && reference.section == TableSection::Body =>
            {
                Err(FormulaError::Ref)
            }
            Ast::UnknownFunc(call) if call.name.eq_ignore_ascii_case(CALCULATE) => {
                let arguments = &mut call.args;
                if context != 0 || arguments.is_empty() {
                    return Err(FormulaError::Value);
                }
                contexts.push(self.calculate_family(&arguments[1..])?);
                let inner_context = contexts.len() - 1;
                let mut inner = std::mem::replace(&mut arguments[0], Ast::Missing);
                self.name_columns(&mut inner, columns, inner_context, contexts, calculations)?;
                *expression = Ast::Name(calculation_name(calculations.len()).into_boxed_str());
                calculations.push((inner_context, inner));
                Ok(())
            }
            Ast::Func(
                Func::Offset
                | Func::Indirect
                | Func::Row
                | Func::Column
                | Func::Cell
                | Func::AnchorArray,
                _,
            )
            | Ast::BoundMatrix(_)
            | Ast::RegexPattern(_)
            | Ast::Name(_)
            | Ast::NamedRange(_)
            | Ast::NamedFormula(_)
            | Ast::UnresolvedStructured(_)
            | Ast::Structured(_)
            | Ast::Cell(..)
            | Ast::SheetCell(_)
            | Ast::AbsCell(..)
            | Ast::Range(..)
            | Ast::SheetRange(_)
            | Ast::AbsRange(..)
            | Ast::SheetSpan(_)
            | Ast::InvalidRef
            | Ast::LetSlot { .. }
            | Ast::LetName { .. } => Err(FormulaError::Value),
            Ast::Func(_, arguments) => arguments.iter_mut().try_for_each(|argument| {
                self.name_columns(argument, columns, context, contexts, calculations)
            }),
            Ast::UnknownFunc(call) => call.args.iter_mut().try_for_each(|argument| {
                self.name_columns(argument, columns, context, contexts, calculations)
            }),
            Ast::Bin(_, left, right) | Ast::Cmp(_, left, right) => {
                self.name_columns(left, columns, context, contexts, calculations)?;
                self.name_columns(right, columns, context, contexts, calculations)
            }
            Ast::Neg(inner) | Ast::Pos(inner) | Ast::Percent(inner) => {
                self.name_columns(inner, columns, context, contexts, calculations)
            }
            Ast::Num(_) | Ast::Str(_) | Ast::Bool(_) | Ast::Missing | Ast::Array(_) => Ok(()),
        }
    }

    /// The context edit of `CALCULATE`'s filter arguments, following DAX
    /// `CALCULATE`: `ALL(Table[Column])` removes the filters on a column,
    /// and a comparison of one column with a value replaces them. The value
    /// may not read columns and is evaluated once. Any other filter is
    /// `#VALUE!`.
    #[inline(never)]
    fn calculate_family(&self, filters: &[Ast]) -> Result<ContextEdit, FormulaError> {
        let mut edit = ContextEdit::default();
        for filter in filters {
            let (column, op, value) = match filter {
                Ast::UnknownFunc(call) if call.name.eq_ignore_ascii_case(ALL) => {
                    match call.args.as_ref() {
                        [Ast::Structured(column)] if is_data_column(column) => {
                            edit.removed.push(self.column_ref(column)?);
                            continue;
                        }
                        _ => return Err(FormulaError::Value),
                    }
                }
                Ast::Cmp(op, left, right) => match (&**left, &**right) {
                    (Ast::Structured(column), value) => (column, *op, value),
                    (value, Ast::Structured(column)) => (column, swapped(*op), value),
                    _ => return Err(FormulaError::Value),
                },
                Ast::Num(_)
                | Ast::Str(_)
                | Ast::Bool(_)
                | Ast::Missing
                | Ast::BoundMatrix { .. }
                | Ast::RegexPattern(_)
                | Ast::Name(_)
                | Ast::NamedRange(_)
                | Ast::NamedFormula(_)
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
                | Ast::Neg(_)
                | Ast::Pos(_)
                | Ast::Percent(_)
                | Ast::LetSlot { .. }
                | Ast::LetName { .. }
                | Ast::Array { .. } => return Err(FormulaError::Value),
            };
            if !is_data_column(column) {
                return Err(FormulaError::Value);
            }

            // Checked in a nested context, so a column or a CALCULATE in the
            // value is refused.
            let mut checked = value.clone();
            let mut read = Vec::new();
            self.name_columns(&mut checked, &mut read, 1, &mut Vec::new(), &mut Vec::new())?;
            if !read.is_empty() {
                return Err(FormulaError::Value);
            }
            let result =
                self.eval_conditional_ast(&checked, 0, 0, 0, &mut FormulaResults::default());
            if let Value::Error(error) = result {
                return Err(error);
            }
            let filtered = self.column_ref(column)?;
            edit.removed.push(filtered.clone());
            edit.predicates.push((filtered, op, result));
        }
        Ok(edit)
    }
}
