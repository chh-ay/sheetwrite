---
title: Dashboards
description: "Arrange pivots and slicers on a dashboard sheet with a grid layout that is saved, undone and synchronized."
---

A dashboard is a sheet of the workbook with `kind: "dashboard"`. It has a tab, a name, an order and a visibility like a worksheet, but it has no cells, rows or columns. It holds items on a grid of 12 columns:

- a **pivot** item shows a pivot of the same sheet,
- a **slicer** item lists the values of one table column and holds the values that pass.

A dashboard view, slicer filtering, charts and KPI cards follow in later releases ([#231](https://github.com/chh-ay/sheetwrite/issues/231)).

## Add a dashboard

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.addSheet({ name: "Report", kind: "dashboard" });
```

A dashboard snapshot has `rowCount: 0`, no columns and no cells. Cell, row, column, table and sheet-format operations that target a dashboard leave it unchanged. Its pivots read a table or the data model, not a range, because slicers filter tables.

## Items

```ts compile title="A pivot and a slicer"
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
      rowCount: 3,
      columns: [
        { key: "a", header: "A", width: 80, type: "text" },
        { key: "b", header: "B", width: 80, type: "number" },
      ],
      tables: [
        {
          id: "orders",
          name: "Orders",
          range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 2, col: 1 } },
          columns: [
            { id: "region", name: "Region" },
            { id: "amount", name: "Amount" },
          ],
          headerRow: true,
          totalsRow: false,
        },
      ],
      cells: [],
    },
    {
      id: "dash",
      name: "Dash",
      order: 1,
      kind: "dashboard",
      rowCount: 0,
      columns: [],
      pivots: [
        {
          id: "by-region",
          name: "By region",
          source: { table: "orders" },
          anchor: { row: 0, col: 0 },
          rows: [0],
          columns: [],
          values: [{ field: 1, aggregation: "SUM" }],
        },
      ],
      cells: [],
    },
  ],
};

const store = SheetwriteStore.fromSnapshot(snapshot);

store.setDashboardItem("dash", {
  id: "sales",
  box: { x: 0, y: 0, w: 8, h: 6 },
  kind: "pivot",
  pivot: "by-region",
});

store.setDashboardItem("dash", {
  id: "region",
  box: { x: 8, y: 0, w: 4, h: 6 },
  kind: "slicer",
  field: { table: "orders", column: "region" },
  selected: ["East"],
});
```

| Field | Meaning |
| --- | --- |
| `id` | A stable ID, unique on the dashboard. |
| `box` | Column `x` (0–11) and row `y`, width `w` and height `h` (1–64) in grid units. `x + w` is at most 12. |
| `pivot` | The ID of a pivot on the same sheet. If that pivot is removed, the item stays and shows `#REF!`; undo brings the pivot back. |
| `field` | The table and column IDs whose values a slicer lists. |
| `selected` | The values that pass, at most 10,000; absent means every value passes. |
| `title` | The caption of a slicer; absent shows the column name. |

Items do not overlap, and a dashboard holds at most 64 items. They are kept in reading order: by `box.y`, then by `box.x`.

## Undo and collaboration

`setDashboardItem` (insert or replace by ID) and `removeDashboardItem` are document operations. Each change is one undo step, and it is saved and synchronized like other sheet metadata. A slicer selection is a change of its item, so it is saved too, as Excel saves slicer state. Two concurrent changes to the same item conflict, and so do two concurrent items whose boxes overlap. A version-history restore brings the items and pivots of a dashboard back in place.

| Store method | Result |
| --- | --- |
| `getDashboard(sheet)` | A copy of the items, or `null` for a worksheet |
| `setDashboardItem(sheet, item)` | Inserts it, or replaces the item with its ID |
| `removeDashboardItem(sheet, id)` | Removes it |
