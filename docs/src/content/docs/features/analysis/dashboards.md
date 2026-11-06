---
title: Dashboards
description: "Arrange pivots and slicers on a dashboard sheet with a grid layout that is saved, undone and synchronized."
---

A dashboard is a sheet of the workbook with `kind: "dashboard"`. It has a tab, a name, an order and a visibility like a worksheet, but it has no cells, rows or columns. It holds items on a grid of 12 columns:

- a **pivot** item shows a pivot of the same sheet,
- a **slicer** item lists the values of one table column and holds the values that pass.

Charts and KPI cards follow in later releases ([#231](https://github.com/chh-ay/sheetwrite/issues/231)).

## Add a dashboard

**Insert › New Dashboard** adds a dashboard sheet named `Dashboard1`, `Dashboard2`, and so on, and shows it. Hosts can do the same with `grid.actions.newDashboard()`, or choose the name:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.addSheet({ name: "Report", kind: "dashboard" });
```

On a dashboard, **Insert › PivotTable** asks for the table to analyze. It adds a pivot over that table and an item that shows it in the first free place, in one undo step, and opens the field list.

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

## The dashboard view

While a dashboard is the active sheet, the grid shows its items over the cells. The toolbar, the side panel and the sheet tabs stay as they are. The view loads as its own chunk the first time a dashboard is shown.

- A pivot item shows the pivot's result as a table, with each value field's number format. Pivots on a dashboard compute without placing output in cells. With the default engine, the item says that it needs the full engine.
- A slicer item lists the values of its column. A click keeps one value, and Ctrl or Cmd with a click adds or removes a value; a slicer always keeps at least one value. **Clear** keeps every value. Each change is saved with the item.
- Drag an item's header to move it, and drag its bottom-right corner to resize it. With the keyboard, open the item's actions menu, choose **Move** or **Resize**, then use the arrow keys; Enter or Escape ends. Each drop or arrow step is one undo step. A place that another item holds is refused, and the view says so.
- In a read-only grid, items cannot move, resize or change.

## Slicers

**Insert › Filters › Slicer** shows on a dashboard. It opens the Insert Slicers list, where each checked table column becomes a slicer in the next free place, in one undo step.

The slicers of a dashboard filter its pivots together. A slicer on a column of table T filters every pivot whose table is T, or a table that reaches T through many-to-one relationships, as an Excel slicer filters the PivotTables connected to it. The filter goes from the one side to the many side, never back. A slicer whose table a pivot cannot reach does not filter it. Slicer filters are added to each pivot's own report filters when the pivot computes; the saved definitions do not change.

In an editable grid, a slicer selection is a saved, synced change of its item, so it is one undo step. In a read-only grid, a slicer filters only that viewer's view: it makes no document change and no undo step.

A slicer dims each value that no row has under the other slicers, and the value stays selectable, as Excel's "Visually indicate items with no data" does. The slicer's actions menu has **Dim Items with No Data**, **Hide Items with No Data** and **Show Items with No Data**, each a saved change. In the API, set `itemsWithNoData` on the slicer item to `"hide"` to hide those values (Excel's "Hide items with no data"), or to `"show"` to show every value plainly.

The dashboard view applies the slicers, so they filter once a dashboard has been shown.

## Undo and collaboration

`setDashboardItem` (insert or replace by ID) and `removeDashboardItem` are document operations. Each change is one undo step, and it is saved and synchronized like other sheet metadata. A slicer selection is a change of its item, so it is saved too, as Excel saves slicer state. Two concurrent changes to the same item conflict, and so do two concurrent items whose boxes overlap. A version-history restore brings the items and pivots of a dashboard back in place.

| Store method | Result |
| --- | --- |
| `getDashboard(sheet)` | A copy of the items, or `null` for a worksheet |
| `setDashboardItem(sheet, item)` | Inserts it, or replaces the item with its ID |
| `removeDashboardItem(sheet, id)` | Removes it |
