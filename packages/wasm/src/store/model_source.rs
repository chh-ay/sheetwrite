//! A pivot source that reads a lookup-flattened model without copying columns.
//!
//! Relationships are followed from the many side to the one side. Each hop
//! that a field uses builds a sorted key index once and maps every parent row
//! through it. The index and maps live for one cache build; nothing is kept
//! between recomputes.

use super::pivots::SourceRect;
use super::relationships::{ColumnRef, KeyColumn, Relationship, RelationshipError};
use super::CellStore;
use crate::data_model::{BLANK_KEY, KEY_ERROR, NO_MATCH};
use crate::types::{FormulaError, Value};

/// One many-to-one step from the table of route `parent`: for each of its
/// rows, the matched row of this route's table or a marker. Built in one
/// pass over the parent's keys, so reads index a flat array in row order.
struct Hop {
    parent: usize,
    from: KeyColumn,
    rows: Vec<u32>,
}

struct Field<'a> {
    column: KeyColumn,
    name: &'a str,
    /// Route of the field's table; route 0 is the base table.
    route: usize,
}

/// Settled values of a model pivot's fields, one row per base row. An
/// unmatched or blank key gives a blank field; a many-side key error gives
/// that error, as a lookup-flattened column would.
pub(super) struct ModelSource<'a> {
    store: &'a CellStore,
    fields: Vec<Field<'a>>,
    /// The hop into each route's table; `None` for the base table and for
    /// tables that no field reads.
    hops: Vec<Option<Hop>>,
    /// Every table rectangle the source reads, base table first.
    pub(super) dependencies: Box<[SourceRect]>,
}

impl<'a> ModelSource<'a> {
    pub(super) fn build(
        store: &'a CellStore,
        base: &'a str,
        columns: &'a [ColumnRef],
    ) -> Result<Self, FormulaError> {
        let routes = model_routes(store, base);

        let base_table = store.table_by_id(base).ok_or(FormulaError::Ref)?;
        let mut dependencies = vec![SourceRect::table(base_table)];
        let mut hops: Vec<Option<Hop>> = routes.iter().map(|_| None).collect();
        let mut fields = Vec::with_capacity(columns.len());
        for column in columns {
            let route = routes
                .iter()
                .position(|route| route.0 == column.table)
                .ok_or(FormulaError::Ref)?;
            let table = store.table_by_id(&column.table).ok_or(FormulaError::Ref)?;
            let definition = table
                .columns
                .iter()
                .find(|field| field.id == column.column)
                .ok_or(FormulaError::Ref)?;
            fields.push(Field {
                column: KeyColumn::at(table, definition),
                name: &definition.name,
                route,
            });

            let mut step = route;
            while let (Some(relationship), None) = (routes[step].2, &hops[step]) {
                let one = store
                    .table_by_id(&relationship.to.table)
                    .ok_or(FormulaError::Ref)?;
                dependencies.push(SourceRect::table(one));
                let (rows, from) = store.relationship_rows(relationship).map_err(model_error)?;
                hops[step] = Some(Hop {
                    parent: routes[step].1,
                    from,
                    rows,
                });
                step = routes[step].1;
            }
        }

        Ok(Self {
            store,
            fields,
            hops,
            dependencies: dependencies.into(),
        })
    }

    pub(super) fn width(&self) -> usize {
        self.fields.len()
    }

    pub(super) fn header(&self, field: usize) -> Value {
        self.fields
            .get(field)
            .map_or(Value::Blank, |field| Value::text(field.name))
    }

    pub(super) fn value(&self, row: usize, field: usize) -> Value {
        let Some(field) = self.fields.get(field) else {
            return Value::Error(FormulaError::Ref);
        };

        match self.row_in(field.route, row as u32) {
            Ok(matched) => self.store.key_value(field.column, matched),
            Err(value) => value,
        }
    }

    /// The row of route `route`'s table that base row `row` reaches, or the
    /// value the field shows instead: blank for no match, or the key error.
    fn row_in(&self, route: usize, row: u32) -> Result<u32, Value> {
        let Some(hop) = &self.hops[route] else {
            return Ok(row);
        };

        let parent_row = self.row_in(hop.parent, row)?;
        match hop.rows[parent_row as usize] {
            NO_MATCH | BLANK_KEY => Err(Value::Blank),
            KEY_ERROR => Err(self.store.key_value(hop.from, parent_row)),
            matched => Ok(matched),
        }
    }
}

fn model_error(error: RelationshipError) -> FormulaError {
    match error {
        RelationshipError::MissingTable | RelationshipError::MissingColumn => FormulaError::Ref,
        RelationshipError::Keys(_) => FormulaError::Value,
    }
}

/// One table reachable from a base table: its ID, the route it is reached
/// from, and the relationship of that last hop (`None` for the base).
pub(super) type Route<'a> = (&'a str, usize, Option<&'a Relationship>);

/// Breadth-first over many-to-one relationships from `base`. Core admits no
/// cycle, so each reachable table has exactly one route; route 0 is `base`.
pub(super) fn model_routes<'a>(store: &'a CellStore, base: &'a str) -> Vec<Route<'a>> {
    let relationships = store
        .relationships
        .as_deref()
        .map_or(&[][..], Vec::as_slice);
    let mut routes = vec![(base, 0, None)];
    let mut next = 0;
    while next < routes.len() {
        for relationship in relationships {
            let to = relationship.to.table.as_str();
            if !relationship.is_measure()
                && relationship.from.table == routes[next].0
                && !routes.iter().any(|route| route.0 == to)
            {
                routes.push((to, next, Some(relationship)));
            }
        }
        next += 1;
    }
    routes
}
