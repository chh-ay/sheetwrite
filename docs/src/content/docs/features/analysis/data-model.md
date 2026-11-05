---
title: Data model
description: "Relate workbook tables with one-to-many relationships that are saved in the workbook, undone and synchronized."
---

Every workbook table is a table of the data model. A relationship links two tables with one key column on each side:

- `from` is the many side, the foreign key. Many `from` rows can have the same key.
- `to` is the one side, the key. Each non-blank key is unique in its column.

The names follow Excel's `x15:modelRelationship`.

```ts compile title="Relate orders to customers"
import { initSheetwrite, SheetwriteStore, type WorkbookSnapshot } from "@sheetwrite/core";

await initSheetwrite();

const snapshot: WorkbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "data" },
  sheets: [
    {
      id: "data",
      name: "Data",
      order: 0,
      rowCount: 10,
      columns: ["A", "B", "C", "D"].map((key) => ({
        key,
        header: key,
        width: 100,
        type: "text" as const,
      })),
      tables: [
        {
          id: "orders",
          name: "Orders",
          range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 4, col: 1 } },
          columns: [
            { id: "customer", name: "Customer" },
            { id: "amount", name: "Amount" },
          ],
          headerRow: true,
          totalsRow: false,
        },
        {
          id: "customers",
          name: "Customers",
          range: { sheet: "data", start: { row: 0, col: 2 }, end: { row: 3, col: 3 } },
          columns: [
            { id: "id", name: "ID" },
            { id: "region", name: "Region" },
          ],
          headerRow: true,
          totalsRow: false,
        },
      ],
      cells: [],
    },
  ],
};

const store = SheetwriteStore.fromSnapshot(snapshot);
store.setRelationship({
  id: "orders-customers",
  from: { table: "orders", column: "customer" },
  to: { table: "customers", column: "id" },
});
// The snapshot now holds `workbook.dataModel.relationships`.
const saved = store.exportSnapshot().workbook.dataModel?.relationships ?? [];
if (saved.length !== 1) throw new Error("The relationship was not saved");
store.dispose();
```

## Data model panel

In the ribbon, **Data › Data Tools › Data Model** and **Relationships** open the data model panel. Data Model appears when the workbook has a table, and Relationships when it has two. The panel loads on first use.

- **Tables** lists each table with its column and data-row counts.
- **Relationships** lists each relationship as `Data[Key] → Lookup[Key]` with its key status, and **Edit** and **Delete** buttons.
- The form picks the data table and its key column (the many side), and the lookup table and its key column (the one side).

Each save and delete is one undo step. As Excel's Create Relationship dialog does, the panel does not keep a relationship whose lookup keys repeat or whose key types differ; it shows the reason instead. The API keeps such a relationship, because cells can change later.

## Rules

A relationship refers to tables and columns by their stable IDs, so renames, column moves and row or column edits keep it. A new relationship is refused when:

- a table or a column does not exist,
- both sides are the same table,
- another relationship already joins the same two tables,
- the relationships would form a cycle when direction is ignored. So two related tables always have exactly one path between them.

Removing a table or a column keeps the relationships that refer to it, and undo restores a working model.

## Undo and collaboration

`setRelationship` and `removeRelationship` are document operations. Each change is one undo step, and it is saved and synchronized like other workbook metadata. Two concurrent relationship changes conflict, because the rules apply to the whole model. A pending relationship also conflicts with a concurrent change to one of its tables, or with the removal of a sheet.

| Store method | Result |
| --- | --- |
| `getRelationships()` | Copies of the saved relationships |
| `setRelationship(relationship)` | Inserts it, or replaces the one with its ID |
| `removeRelationship(id)` | Removes it |
| `getRelationshipStatus(id)` | Whether the keys resolve, checked from the current cells |

## Key checks

The full engine checks the key values each time `getRelationshipStatus` is called. Keys match as pivot group keys do: numbers by value, and text without case. A blank key matches nothing.

| Status | Meaning |
| --- | --- |
| `ok` | Every non-blank one-side key is unique. `unmatched` counts the non-blank many-side keys that no one-side row holds. |
| `missingTable`, `missingColumn` | A table or a column was removed. |
| `typeMismatch` | The key at `row` on side `from` or `to` is a boolean, an error on the one side, or a number among text keys (or text among numbers). |
| `duplicateKey` | Two one-side rows hold equal keys. `rows` are their data-row offsets. |
| `unavailable` | The default engine checks no keys, or no relationship has this ID. |

## Pivots across related tables

A model source names a base table (the many side) and the fields to read. Each field is a table and column ID. A field's table must be the base table or a table the base reaches through many-to-one relationships. Field `i` in `rows`, `columns`, `values` and `filters` is `model.fields[i]`.

```ts prelude="core" partial="requires a full-engine grid with the tables and relationship above" title="Amount by customer region"
grid.setPivot({
  id: "by-region",
  name: "By region",
  source: {
    model: {
      table: "orders",
      fields: [
        { table: "customers", column: "region" },
        { table: "orders", column: "amount" },
      ],
    },
  },
  anchor: { row: 0, col: 0 },
  rows: [0],
  columns: [],
  values: [{ field: 1, aggregation: "SUM" }],
});
```

The result equals a pivot over the table you get by looking up each related column for every base row:

| Case | Related value |
| --- | --- |
| The key matches one row | That row's cell |
| The key matches no row, or is blank | Blank |
| The many-side key is an error | That error |

A duplicate one-side key or a key type mismatch shows `#VALUE!` at the anchor. A missing table, column or relationship shows `#REF!`. The default engine keeps and syncs model pivots but does not compute them. XLSX export keeps them in Sheetwrite metadata, because Excel needs its own data-model binary for a model pivot.
