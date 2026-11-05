//! Table relationships of the full engine (#229): the definitions core sends
//! and their key checks. Core admits the structure (tables, no cycle); the
//! engine checks the key values, which change with the cells.

use wasm_bindgen::prelude::wasm_bindgen;

use super::{CellStore, TableDefinition};
use crate::data_model::{is_blank_key, KeyIndex, KeyProblem, NO_MATCH};
use crate::eval::settled_cell_value;

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
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Relationship {
    pub(crate) id: String,
    pub(crate) from: ColumnRef,
    pub(crate) to: ColumnRef,
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
            .find(|column| column.id == column_id)
            .ok_or(RelationshipError::MissingColumn)?;
        let first_row = table.row_start + u32::from(table.header_row);
        let end = table.row_end + 1 - u32::from(table.totals_row);
        Ok(Self {
            sheet: table.sheet as usize,
            first_row,
            rows: end.saturating_sub(first_row),
            col: column.col,
        })
    }
}

#[wasm_bindgen]
impl CellStore {
    /// Replaces every relationship with the packed definitions: five strings
    /// each, `[id, fromTable, fromColumn, toTable, toColumn]`, by stable
    /// table and column IDs. Returns `false`, changing nothing, for a
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
        let Some(relationship) = self
            .relationships
            .as_deref()
            .and_then(|relationships| relationships.iter().find(|candidate| candidate.id == id))
        else {
            return Vec::new();
        };
        let record = match self.relationship_index(relationship) {
            Ok(index) => [
                STATUS_OK,
                NO_ROW,
                NO_ROW,
                self.unmatched_keys(relationship, &index),
            ],
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
    /// The key column `column` names, if its table and column exist.
    pub(crate) fn key_column(&self, column: &ColumnRef) -> Result<KeyColumn, RelationshipError> {
        let table = self
            .tables
            .values()
            .find(|table| table.id == column.table)
            .ok_or(RelationshipError::MissingTable)?;
        KeyColumn::of(table, &column.column)
    }

    /// The settled value of data row `row` of `column`.
    fn key_value(&self, column: KeyColumn, row: u32) -> crate::types::Value {
        settled_cell_value(
            &self.sheets[column.sheet],
            &self.strings,
            (column.first_row + row) as usize,
            column.col as usize,
        )
    }

    /// Builds the one-side key index of `relationship` and checks both key
    /// columns. The index lives only as long as its caller keeps it.
    pub(crate) fn relationship_index(
        &self,
        relationship: &Relationship,
    ) -> Result<KeyIndex, RelationshipError> {
        let one = self.key_column(&relationship.to)?;
        let many = self.key_column(&relationship.from)?;
        KeyIndex::build(
            one.rows,
            |row| self.key_value(one, row),
            many.rows,
            |row| self.key_value(many, row),
        )
        .map_err(RelationshipError::Keys)
    }

    /// Counts the non-blank many-side keys of `relationship` that `index`
    /// does not hold. Error keys count: they match no row.
    fn unmatched_keys(&self, relationship: &Relationship, index: &KeyIndex) -> u32 {
        let Ok(many) = self.key_column(&relationship.from) else {
            return 0;
        };
        let mut scratch = Vec::new();
        let mut unmatched = 0;
        for row in 0..many.rows {
            let value = self.key_value(many, row);
            if !is_blank_key(&value) && index.find(&value, &mut scratch) == NO_MATCH {
                unmatched += 1;
            }
        }
        unmatched
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
    fn status_reports_a_duplicate_key_by_its_data_rows() {
        let (mut store, sheet) = fixture();
        // C3 becomes c1, equal to C1 without case; data rows 0 and 2.
        store.set_string(sheet, 3, CUSTOMER_ID, "c1", 0);
        store.commit_sources();
        assert_eq!(
            store.relationship_status("r"),
            [STATUS_DUPLICATE_KEY, 0, 2, 0]
        );
    }

    #[test]
    fn status_reads_settled_formula_results_and_key_kinds() {
        let (mut store, sheet) = fixture();
        store.set_formula(sheet, 3, CUSTOMER_ID, "=\"C\"&1", 0);
        store.recompute(sheet);
        assert_eq!(
            store.relationship_status("r"),
            [STATUS_DUPLICATE_KEY, 0, 2, 0]
        );

        store.set_number(sheet, 3, CUSTOMER_ID, 3.0, 0);
        store.commit_sources();
        assert_eq!(
            store.relationship_status("r"),
            [STATUS_ONE_SIDE_TYPE, 2, NO_ROW, 0]
        );

        store.set_string(sheet, 3, CUSTOMER_ID, "C3", 0);
        store.set_number(sheet, 4, ORDER_CUSTOMER, 9.0, 0);
        store.commit_sources();
        assert_eq!(
            store.relationship_status("r"),
            [STATUS_MANY_SIDE_TYPE, 3, NO_ROW, 0]
        );
    }

    #[test]
    fn status_reports_a_removed_table_or_column() {
        let (mut store, _) = fixture();
        let missing_column = ["r", "orders", "gone", "customers", "id"];
        assert!(store.set_relationships(missing_column.map(String::from).to_vec()));
        assert_eq!(
            store.relationship_status("r"),
            [STATUS_MISSING_COLUMN, NO_ROW, NO_ROW, 0]
        );

        let valid = ["r", "orders", "customer", "customers", "id"];
        assert!(store.set_relationships(valid.map(String::from).to_vec()));
        assert!(store.remove_table("customers"));
        assert_eq!(
            store.relationship_status("r"),
            [STATUS_MISSING_TABLE, NO_ROW, NO_ROW, 0]
        );
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
