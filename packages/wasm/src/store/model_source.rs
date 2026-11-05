//! A pivot source that reads a lookup-flattened model without copying columns.
//!
//! Relationships are traversed from many to one. Only paths used by fields
//! build key indexes. The indexes and lookup scratch have one refresh lifetime;
//! no index or row map is retained between recomputes.

use std::cell::RefCell;
use std::rc::Rc;

use super::pivots::SourceRect;
use super::relationships::{ColumnRef, KeyColumn, Relationship, RelationshipError};
use super::CellStore;
use crate::data_model::{KeyIndex, NO_MATCH};
use crate::types::{FormulaError, Value};

struct Route<'a> {
    table: &'a str,
    parent: usize,
    relationship: Option<&'a Relationship>,
}

struct Hop {
    from: KeyColumn,
    index: KeyIndex,
}

struct Field<'a> {
    column: KeyColumn,
    name: &'a str,
    /// Hop indexes in many-to-one order, starting at the base table.
    path: Vec<usize>,
}

/// Settled values of a model pivot's virtual fields, one row per base row.
/// Missing matches and blank keys produce blank fields; a many-side key error
/// propagates to the related field, just as in a flattened lookup column.
pub(super) struct ModelSource<'a> {
    store: &'a CellStore,
    fields: Vec<Field<'a>>,
    hops: Vec<Hop>,
    scratch: RefCell<Vec<u8>>,
    /// All table rectangles the source reads, including intermediate tables.
    pub(super) dependencies: Rc<[SourceRect]>,
}

impl<'a> ModelSource<'a> {
    pub(super) fn build(
        store: &'a CellStore,
        base: &'a str,
        columns: &'a [ColumnRef],
    ) -> Result<Self, FormulaError> {
        let mut routes = vec![Route {
            table: base,
            parent: 0,
            relationship: None,
        }];
        let relationships = store
            .relationships
            .as_deref()
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let mut next = 0;
        while next < routes.len() {
            for relationship in relationships {
                if relationship.from.table == routes[next].table
                    && !routes
                        .iter()
                        .any(|route| route.table == relationship.to.table)
                {
                    routes.push(Route {
                        table: &relationship.to.table,
                        parent: next,
                        relationship: Some(relationship),
                    });
                }
            }
            next += 1;
        }

        let base_table = store
            .tables
            .values()
            .find(|table| table.id == base)
            .ok_or(FormulaError::Ref)?;
        let mut dependencies = vec![SourceRect::table(base_table)];
        let mut hops = Vec::new();
        let mut hop_ids = vec![None; routes.len()];
        let mut fields = Vec::with_capacity(columns.len());
        for column in columns {
            let mut route = routes
                .iter()
                .position(|route| route.table == column.table)
                .ok_or(FormulaError::Ref)?;
            let table = store
                .tables
                .values()
                .find(|table| table.id == column.table)
                .ok_or(FormulaError::Ref)?;
            let definition = table
                .columns
                .iter()
                .find(|field| field.id == column.column)
                .ok_or(FormulaError::Ref)?;
            let resolved = store.key_column(column).map_err(model_error)?;
            let mut path = Vec::new();
            while let Some(relationship) = routes[route].relationship {
                let hop = match hop_ids[route] {
                    Some(hop) => hop,
                    None => {
                        let from = store.key_column(&relationship.from).map_err(model_error)?;
                        let index = store
                            .relationship_index(relationship)
                            .map_err(model_error)?;
                        let one = store
                            .tables
                            .values()
                            .find(|table| table.id == relationship.to.table)
                            .ok_or(FormulaError::Ref)?;
                        dependencies.push(SourceRect::table(one));
                        let hop = hops.len();
                        hops.push(Hop { from, index });
                        hop_ids[route] = Some(hop);
                        hop
                    }
                };
                path.push(hop);
                route = routes[route].parent;
            }
            path.reverse();
            fields.push(Field {
                column: resolved,
                name: &definition.name,
                path,
            });
        }

        Ok(Self {
            store,
            fields,
            hops,
            dependencies: dependencies.into(),
            scratch: RefCell::new(Vec::new()),
        })
    }

    pub(super) fn header(&self, field: usize) -> Value {
        self.fields
            .get(field)
            .map_or(Value::Blank, |field| Value::text(field.name))
    }

    pub(super) fn width(&self) -> usize {
        self.fields.len()
    }

    pub(super) fn value(&self, row: usize, field: usize) -> Value {
        let Some(field) = self.fields.get(field) else {
            return Value::Error(FormulaError::Ref);
        };
        let mut matched = row as u32;
        let mut scratch = self.scratch.borrow_mut();
        for &hop in &field.path {
            let hop = &self.hops[hop];
            let key = self.store.key_value(hop.from, matched);
            if let Value::Error(_) = key {
                return key;
            }
            matched = hop.index.find(&key, &mut scratch);
            if matched == NO_MATCH {
                return Value::Blank;
            }
        }
        self.store.key_value(field.column, matched)
    }
}

fn model_error(error: RelationshipError) -> FormulaError {
    match error {
        RelationshipError::MissingTable | RelationshipError::MissingColumn => FormulaError::Ref,
        RelationshipError::Keys(_) => FormulaError::Value,
    }
}
