//! Table relationships of the full engine (#229): the definitions core sends
//! and their key checks. Core admits the structure (tables, no cycle); the
//! engine checks the key values, which change with the cells.

use wasm_bindgen::prelude::wasm_bindgen;

use super::{CellStore, TableColumnDefinition, TableDefinition};
use crate::cells::payload_str_id;
use crate::data_model::{KeyCell, KeyIndex, KeyProblem, KEY_ERROR, NO_MATCH};
use crate::eval::settled_cell_value;
use crate::types::{string_from_pool_ref, KIND_STRING};

/// Most relationships one workbook may hold; twin of `MAX_RELATIONSHIPS` in
/// `packages/core/src/data-model.ts`.
const MAX_RELATIONSHIPS: usize = 1_024;
/// Strings per relationship in a `setRelationships` payload.
const RELATIONSHIP_STRIDE: usize = 5;

/// Status codes of `relationshipStatus`; twins of `RELATIONSHIP_STATUS` in
/// `packages/core/src/store/data-engine.ts`.
const STATUS_OK: u32 = 0;
const STATUS_MISSING_TABLE: u32 = 1;
const STATUS_MISSING_COLUMN: u32 = 2;
const STATUS_ONE_SIDE_TYPE: u32 = 3;
const STATUS_MANY_SIDE_TYPE: u32 = 4;
const STATUS_DUPLICATE_KEY: u32 = 5;
/// Marks an empty slot of a status record.
const NO_ROW: u32 = u32::MAX;

/// One table column by stable IDs.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ColumnRef {
    pub(crate) table: String,
    pub(crate) column: String,
}

/// One relationship: `from` is the many side, `to` the one side.
///
/// A record whose `to.table` is empty is a measure of the data model,
/// sent in the same payload: `from.table` is its home table, `from.column`
/// its formula and `to.column` its name.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Relationship {
    pub(crate) id: String,
    pub(crate) from: ColumnRef,
    pub(crate) to: ColumnRef,
}

impl Relationship {
    /// Whether this record is a measure rather than a relationship.
    pub(crate) fn is_measure(&self) -> bool {
        self.to.table.is_empty()
    }
}

/// Why a relationship's keys do not resolve.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RelationshipError {
    MissingTable,
    MissingColumn,
    Keys(KeyProblem),
}

/// The data rows of one table column: where they are on the sheet.
#[derive(Clone, Copy, Debug)]
pub(crate) struct KeyColumn {
    pub(crate) sheet: usize,
    pub(crate) first_row: u32,
    pub(crate) rows: u32,
    pub(crate) col: u32,
}

impl KeyColumn {
    fn of(table: &TableDefinition, column_id: &str) -> Result<Self, RelationshipError> {
        let column = table
            .columns
            .iter()
            .find(|column| *column.id == *column_id)
            .ok_or(RelationshipError::MissingColumn)?;
        Ok(Self::at(table, column))
    }

    /// The data rows of `column`, which belongs to `table`.
    pub(super) fn at(table: &TableDefinition, column: &TableColumnDefinition) -> Self {
        let first_row = table.row_start + u32::from(table.header_row);
        let end = table.row_end + 1 - u32::from(table.totals_row);
        Self {
            sheet: table.sheet as usize,
            first_row,
            rows: end.saturating_sub(first_row),
            col: column.col,
        }
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Replaces every relationship and measure with the packed definitions:
    /// five strings each, `[id, fromTable, fromColumn, toTable, toColumn]`,
    /// by stable table and column IDs, or `[id, homeTable, formula, "",
    /// name]` for a measure. Returns `false`, changing nothing, for a
    /// malformed payload.
    #[wasm_bindgen(js_name = setRelationships)]
    pub fn set_relationships(&mut self, strings: Vec<String>) -> bool {
        if !strings.len().is_multiple_of(RELATIONSHIP_STRIDE)
            || strings.len() / RELATIONSHIP_STRIDE > MAX_RELATIONSHIPS
        {
            return false;
        }

        let mut parts = strings.into_iter();
        let mut relationships = Vec::with_capacity(parts.len() / RELATIONSHIP_STRIDE);
        while let (Some(id), Some(from_table), Some(from_column), Some(to_table), Some(to_column)) = (
            parts.next(),
            parts.next(),
            parts.next(),
            parts.next(),
            parts.next(),
        ) {
            relationships.push(Relationship {
                id,
                from: ColumnRef {
                    table: from_table,
                    column: from_column,
                },
                to: ColumnRef {
                    table: to_table,
                    column: to_column,
                },
            });
        }
        self.relationships = (!relationships.is_empty()).then(|| Box::new(relationships));
        // Only model pivots read relationships, so formulas stay clean.
        if self.invalidate_model_pivots() {
            self.settle_pivots();
        }
        true
    }

    /// `[code, firstRow, secondRow, unmatched]` for the relationship with
    /// `id`, or an empty array for an unknown ID. Codes: 0 ok, 1 missing
    /// table, 2 missing column, 3 and 4 a key of the wrong kind on the one
    /// or the many side (`firstRow`), 5 a duplicate one-side key (both
    /// rows). Rows are data-row offsets in their table. `unmatched` counts
    /// the non-blank many-side keys that match no one-side row. The keys
    /// are checked now, from the settled cell values.
    #[wasm_bindgen(js_name = relationshipStatus)]
    pub fn relationship_status(&self, id: &str) -> Vec<u32> {
        let Some(relationship) = self.relationships.as_deref().and_then(|relationships| {
            relationships
                .iter()
                .find(|candidate| !candidate.is_measure() && candidate.id == id)
        }) else {
            return Vec::new();
        };
        let record = match self.relationship_rows(relationship) {
            Ok((map, _)) => {
                // Error keys match no row, so they count as unmatched.
                let unmatched = map
                    .iter()
                    .filter(|&&target| target == NO_MATCH || target == KEY_ERROR)
                    .count();
                [STATUS_OK, NO_ROW, NO_ROW, unmatched as u32]
            }
            Err(RelationshipError::MissingTable) => [STATUS_MISSING_TABLE, NO_ROW, NO_ROW, 0],
            Err(RelationshipError::MissingColumn) => [STATUS_MISSING_COLUMN, NO_ROW, NO_ROW, 0],
            Err(RelationshipError::Keys(KeyProblem::OneSideType { row })) => {
                [STATUS_ONE_SIDE_TYPE, row, NO_ROW, 0]
            }
            Err(RelationshipError::Keys(KeyProblem::ManySideType { row })) => {
                [STATUS_MANY_SIDE_TYPE, row, NO_ROW, 0]
            }
            Err(RelationshipError::Keys(KeyProblem::DuplicateKey { first, second })) => {
                [STATUS_DUPLICATE_KEY, first, second, 0]
            }
        };
        record.to_vec()
    }
}

impl CellStore {
    /// The table with stable ID `id`. Tables are keyed by name, so this scans.
    #[inline(never)]
    pub(super) fn table_by_id(&self, id: &str) -> Option<&TableDefinition> {
        self.tables.values().find(|table| *table.id == *id)
    }

    /// The key column `column` names, if its table and column exist.
    pub(crate) fn key_column(&self, column: &ColumnRef) -> Result<KeyColumn, RelationshipError> {
        let table = self
            .table_by_id(&column.table)
            .ok_or(RelationshipError::MissingTable)?;
        KeyColumn::of(table, &column.column)
    }

    /// The settled value of data row `row` of `column`.
    pub(super) fn key_value(&self, column: KeyColumn, row: u32) -> crate::types::Value {
        settled_cell_value(
            &self.sheets[column.sheet],
            &self.strings,
            (column.first_row + row) as usize,
            column.col as usize,
            &self.formula_slots,
        )
    }

    /// The key of data row `row` of `column`. Literal text is borrowed from
    /// the string pool; a settled value would copy it into a new `Rc<str>`.
    fn key_cell(&self, column: KeyColumn, row: u32) -> KeyCell<'_> {
        let cells = &self.sheets[column.sheet].cells;
        let (row, col) = ((column.first_row + row) as usize, column.col as usize);
        if cells.contains_cell(row, col) && cells.is_loaded(row, col) {
            let index = cells.idx(row, col);
            if cells.source_kind_at(index) == KIND_STRING {
                let id = payload_str_id(cells.source_payload_at(index));
                if let Some(text) = string_from_pool_ref(&self.strings, id) {
                    return KeyCell::Text(text, id);
                }
            }
        }
        KeyCell::Value(self.key_value(column, row as u32 - column.first_row))
    }

    /// Checks both key columns of `relationship` and maps each many-side
    /// row to its one-side row (see [`KeyIndex::build`]). Returns the map
    /// with the many-side key column. The sorted index is freed here; the
    /// map lives only as long as its caller keeps it.
    pub(crate) fn relationship_rows(
        &self,
        relationship: &Relationship,
    ) -> Result<(Vec<u32>, KeyColumn), RelationshipError> {
        let one = self.key_column(&relationship.to)?;
        let many = self.key_column(&relationship.from)?;
        let (_, map) = KeyIndex::build(
            one.rows,
            |row| self.key_cell(one, row),
            many.rows,
            |row| self.key_cell(many, row),
        )
        .map_err(RelationshipError::Keys)?;
        Ok((map, many))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Columns of the fixture sheet: orders in A:B, customers in D:E.
    const ORDER_CUSTOMER: usize = 0;
    const CUSTOMER_ID: usize = 3;
    const CUSTOMER_REGION: usize = 4;

    /// A sheet with an Orders table (A1:B5) and a Customers table (D1:E4).
    /// Customers C1, C2 and C3 exist; orders refer to C1, c2 (case differs),
    /// a blank key and C9, which no customer has.
    fn fixture() -> (CellStore, usize) {
        let mut store = CellStore::new();
        let sheet = store.add_sheet(6, 10);
        for (row, key) in ["Customer", "C1", "c2", "", "C9"].iter().enumerate() {
            store.set_string(sheet, row, ORDER_CUSTOMER, key, 0);
        }
        for (row, (id, region)) in [
            ("ID", "Region"),
            ("C1", "North"),
            ("C2", "South"),
            ("C3", ""),
        ]
        .iter()
        .enumerate()
        {
            store.set_string(sheet, row, CUSTOMER_ID, id, 0);
            store.set_string(sheet, row, CUSTOMER_REGION, region, 0);
        }
        store.commit_sources();

        let two = |first: &str, second: &str| vec![first.to_string(), second.to_string()];
        assert!(store.set_table(
            "orders",
            "Orders",
            sheet,
            0,
            0,
            4,
            1,
            true,
            false,
            two("customer", "amount"),
            two("Customer", "Amount"),
        ));
        assert!(store.set_table(
            "customers",
            "Customers",
            sheet,
            0,
            3,
            3,
            4,
            true,
            false,
            two("id", "region"),
            two("ID", "Region"),
        ));
        assert!(store.set_relationships(
            ["r", "orders", "customer", "customers", "id"]
                .map(String::from)
                .to_vec()
        ));
        (store, sheet)
    }

    #[test]
    fn status_counts_unmatched_keys_but_not_blank_keys() {
        let (store, _) = fixture();
        assert_eq!(
            store.relationship_status("r"),
            [STATUS_OK, NO_ROW, NO_ROW, 1]
        );
        assert!(store.relationship_status("unknown").is_empty());
    }

    #[test]
    fn malformed_payloads_change_nothing_and_an_empty_one_frees_the_model() {
        let (mut store, _) = fixture();
        assert!(!store.set_relationships(vec!["r".into(), "orders".into()]));
        assert!(store.relationships.is_some());

        assert!(store.set_relationships(Vec::new()));
        assert!(store.relationships.is_none());
    }
}
