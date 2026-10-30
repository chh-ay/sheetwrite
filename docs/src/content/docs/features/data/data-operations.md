---
title: Data operations
description: Sort, filter, hide, group and aggregate rows, then set frozen panes and zoom.
---

```ts prelude="core" partial="requires an initialized grid with Customer and Total columns" title="Show highest totals first"
grid.sortBy(1, false);
const total = grid.aggregate(1, "sum");
console.log(total); // 195 for Ada: 120 and Lin: 75
```

<div class="sw-grid-result" data-caption="Descending Total: stored row data stays in its original order">

| Ada | 120 |
| --- | --- |
| Lin | 75 |

</div>

[Try it live: sort and filter orders](/showcases/data-tools/).

<details>
<summary>Full setup</summary>

```ts compile title="Create and sort a two-row table"
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (!host) throw new Error("Missing #grid host");
host.style.height = "320px";
const workbook: Workbook = {
  activeSheet: "s",
  sheets: [{ id: "s", name: "Sales", rowCount: 2, columns: [
    { key: "customer", header: "Customer", width: 140, type: "text" },
    { key: "total", header: "Total", width: 100, type: "number" },
  ] }],
};
await initSheetwrite();
const grid = createGrid(host, {
  workbook,
  data: { rowCount: 2, columns: {
    customer: ["Lin", "Ada"], total: new Float64Array([75, 120]),
  } },
});
grid.sortBy(1, false);
console.log(grid.aggregate(1, "sum")); // 195
```

</details>

Sheetwrite can sort, filter, hide, group, aggregate, import, and export the active
sheet without rewriting the stored row data. Sorts and filters are display views:
the store keeps a row-order permutation/subset and the renderer reads through it.

## Display views

The simple shorthands are still available:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.sortBy(4);            // sort by column 4, ascending
grid.sortBy(4, false);     // descending
grid.filterBy(3, "Tokyo"); // keep rows whose column-3 text contains "Tokyo"
grid.clearView();          // clear sort/filter state only
```

For custom UI, use the composable primitives. All active column filters are ANDed
together, hidden rows and collapsed groups are subtracted, and the remaining rows
are sorted by the active multi-key sort.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.sortByMulti([
  { col: 4, ascending: false }, // primary key
  { col: 0, ascending: true },  // tie-breaker
]);

grid.setColumnFilter(3, { kind: "contains", text: "Tokyo" });
grid.setColumnFilter(2, { kind: "values", values: ["Retail", "Partner"] });
grid.setColumnFilter(5, { kind: "compare", op: "gte", value: 1000 });

const cities = grid.distinctValues(3, 100); // data source for a filter menu

grid.hideRows([1, 7, 9]);
grid.groupRows(10, 25);
grid.setGroupCollapsed(10, true);
```

| Method | Signature | Effect |
| --- | --- | --- |
| `sortBy` | `sortBy(col: number, ascending = true): void` | Reorder displayed rows by one column. |
| `sortByMulti` | `sortByMulti(keys: readonly SortKey[]): void` | Stable multi-key sort; first key is primary. |
| `filterBy` | `filterBy(col: number, needle: string): void` | Shorthand for a case-insensitive `contains` column filter. |
| `setColumnFilter` | `setColumnFilter(col: number, filter: ColumnFilter \| null): void` | Set or clear one column filter. |
| `getColumnFilters` | `getColumnFilters(): ReadonlyMap<number, ColumnFilter>` | Current active column filters. |
| `distinctValues` | `distinctValues(col: number, limit = 1000): CellScalar[]` | First-seen distinct resolved values for a column. |
| `hideRows` / `showRows` | `hideRows(rows)` / `showRows(rows?)` | Hide/show data rows independent of sort/filter state. |
| `hiddenRows` | `hiddenRows(): readonly number[]` | Currently hidden data rows. |
| `groupRows` / `ungroupRows` | `groupRows(start, end)` / `ungroupRows(start, end)` | Create/remove an inclusive data-row group. |
| `setGroupCollapsed` | `setGroupCollapsed(start, collapsed): void` | Collapse or expand the group starting at `start`. |
| `rowGroups` | `rowGroups(): readonly RowGroup[]` | Current row-group definitions. |
| `clearView` | `clearView(): void` | Clears sort/filter state. Hidden rows and row groups are preserved. |

`clearView()` deliberately does **not** unhide rows or expand row groups. This
matches spreadsheet behavior: clearing a filter removes the query, but explicit
hidden rows and collapsed groups remain a separate visibility state. Use
`showRows()` and `setGroupCollapsed(start, false)` to reverse those states.

Because a view reorders or hides rows, two features that depend on a stable
row-to-cell mapping are disabled while a view is active:

- **Merged cells** are not drawn (the layout reports no merges under a view).
- **Drag-to-fill** is unavailable (the fill handle is hidden).

Call `clearView()` to remove sort/filter state; also show hidden rows / expand
row groups if you need the full natural data order.

## Aggregate

`aggregate` computes a column reduction over the active sheet's data and returns a
number:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
type Aggregate = Grid["aggregate"];
```

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
const total = grid.aggregate(4, "sum");
const rows = grid.aggregate(0, "count");
```

## Frozen panes and zoom

Frozen panes and zoom are view geometry, not data mutations:

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.setFrozen(1, 1); // pin first view row and first column
grid.setFrozen(0, 0); // unfreeze

grid.setZoom(1.25);
console.log(grid.getZoom());
```

`setFrozen(rows, cols?)` pins leading view rows and columns while the body
scrolls. `setZoom(z)` clamps to `0.5`-`2` and scales painted row/column geometry
and fonts; workbook widths/heights remain in base units.

## See also

- [Interaction](/docs/features/grid/selection-and-keyboard/) for clipboard TSV and the toolbar sort control.
- [Concepts](/docs/concepts/documents-and-operations/#document-protocol-and-storage-transactions) for row/column `DocumentOp` transactions.
