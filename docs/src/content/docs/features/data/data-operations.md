---
title: Data operations
description: Sort, filter, hide, group and aggregate rows, then set frozen panes and zoom.
---

```ts prelude="core" partial="requires an initialized grid with Customer and Total columns" title="Show highest totals first"
grid.sortBy(1, false);
const total = grid.aggregate(1, "sum");
console.log(total); // 195 for Ada: 120 and Lin: 75
```

<div class="sw-grid-result" data-caption="Descending Total: the rows move, as in Excel">

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
sheet. An in-place sort rewrites the cells of a range. Display views sort and
filter without rewriting the stored row data: the store keeps a row-order
permutation/subset and the renderer reads through it.

## Sort cells in place

`grid.sortRange` and `store.sortRange` sort the cells of a range as Excel's
Sort does. The cells move to their new rows in one undoable transaction that
collaborators receive as one change, so formulas, charts and other sheets read
the sorted values. Use `grid.sortRange` in an app with a grid, so the sort joins
the grid's undo history.

The Sort A to Z and Sort Z to A commands (ribbon, toolbar and the column
context menu) and `grid.sortBy(col, ascending)` run Excel's quick sort: they sort
the table body that holds the focus cell, or else the selected range, or else
the current region around the focus cell (the block bounded by empty rows and
columns). A first row of text over numbers, logical values or blanks stays as a
header. Data › Custom Sort opens the Sort panel: a range, a header row, up to 64
sort levels, and "Sort view only".

```ts compile title="Sort a range by its third column"
import type { SheetwriteStore } from "@sheetwrite/core";

function sortByRevenue(store: SheetwriteStore) {
  return store.sortRange(
    { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 99, col: 3 } },
    [{ col: 2, ascending: false }],
    { hasHeader: true }, // the first row stays in place
  );
}
```

- Values, formulas, cell styles, notes and one-row hyperlinks move with their
  row. Row heights, hidden rows, conditional formats, validation rules and
  protected ranges keep their addresses.
- A formula in a moved row is adjusted for the move of its own row: relative
  row references without a sheet name move with the row, so a reference to the
  same row stays on that row. Absolute rows and references with a sheet name
  stay. Formulas outside the range keep their references.
- Hidden and filtered-out rows keep their place.
- Merged cells of the same size sort as whole records; other merged layouts
  reject the sort. A sort that would move only part of a spill range is
  rejected. A sort in a table must cover the table body.

## Display views

A view sort orders the displayed rows without moving any cell. It is saved
with the sheet and exports to XLSX as `sortState`. The Sort panel calls it
"Sort view only".

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.setViewSort([{ col: 4, ascending: false }]); // display largest first
grid.filterBy(3, "Tokyo"); // keep rows whose column-3 text contains "Tokyo"
grid.clearView();          // clear sort/filter state only
```

For custom UI, use the composable primitives. All active column filters are ANDed
together, hidden rows and collapsed groups are subtracted, and the remaining rows
are sorted by the active multi-key sort.

Sort keys use Excel's sort order: numbers, then text, then `FALSE` and `TRUE`,
then errors. Text compares without case, character by character, in Excel's
documented character order, and skips apostrophes and hyphens. Errors are equal
to each other. A descending sort reverses this order, but blank cells are last
in both directions. Rows with equal keys keep their order.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.setViewSort([
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
| `sortBy` | `sortBy(col: number, ascending = true): ApplyTransactionResult` | Quick sort in place: the table body, selected range or current region around the focus cell. |
| `sortRange` | `sortRange(range, keys, { hasHeader? }): ApplyTransactionResult` | Sort the cells of a range in place by several keys. |
| `setViewSort` | `setViewSort(keys: readonly SortKey[]): ApplyTransactionResult` | Stable multi-key view sort; first key is primary. Cells keep their rows. |
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

## Headless columnar queries

Use `@sheetwrite/queries` to parse host-provided CSV or JSON and run saved step
lists in Rust. It is separate from worksheet display views and does not edit a
workbook. Importing the package loads no query WASM; the explicit load call does.

```ts compile title="Shape host-provided data in Rust"
import { loadQueryEngine } from "@sheetwrite/queries";

const engine = await loadQueryEngine();
const source = engine.parse(
  new TextEncoder().encode('[{"Total":120},{"Total":75}]'),
  { format: "json", columns: [{ id: "total", name: "Total", type: "number" }] },
);

const output = engine.execute(source, [
  { kind: "filter", predicate: { kind: "compare", column: "total", op: "gte", value: 100 } },
]);
```

The engine supports filter, select, rename, change type, join, group, and
unpivot. Joins use sorted flat row indexes; grouping folds adjacent key runs.
Typed output columns keep null and error bitsets, with separate sparse error
codes. No step runs on JavaScript row objects.

Null keys match null keys in joins and form one group, as in the
[M equality operator](https://learn.microsoft.com/en-us/powerquery-m/m-spec-operators#equality-operators),
[`Table.Join`](https://learn.microsoft.com/en-us/powerquery-m/table-join), and
[`Table.Group`](https://learn.microsoft.com/en-us/powerquery-m/table-group). A sum
of only null values is null, as in
[`List.Sum`](https://learn.microsoft.com/en-us/powerquery-m/list-sum).
Fatal failures throw `QueryError`, a `SheetwriteError` with a structured
`diagnostic`.

The host owns source fetching and credentials. These entry points accept bytes
or typed batches; they never fetch a URL. See the
[query package reference](/docs/api/queries/) for the full interface.

## Saved queries and refresh

A workbook can save queries in `workbook.queries`. Each saved query has a source,
its steps, and an optional output table. `createQuerySession` is the only call
that loads the query engine. It binds the saved queries of one grid to the
host's `fetchSource` callback.

```ts compile title="Refresh saved queries through host fetch"
import type { Grid } from "@sheetwrite/core";
import { createQuerySession } from "@sheetwrite/queries";

async function refreshSales(grid: Grid) {
  const session = await createQuerySession(grid, {
    // The host applies its own credentials and network policy here.
    fetchSource: async (request, { signal }) => {
      const response = await fetch(`/sources/${request.sourceId}`, { signal });
      return { kind: "bytes", bytes: new Uint8Array(await response.arrayBuffer()) };
    },
  });

  session.define({
    id: "sales",
    name: "Sales",
    source: {
      kind: "csv",
      sourceId: "sales-feed",
      columns: [
        { id: "region", name: "Region", type: "text" },
        { id: "total", name: "Total", type: "number" },
      ],
    },
    steps: [{ kind: "filter", predicate: { kind: "compare", column: "total", op: "gt", value: 0 } }],
    output: { table: "sales", tableName: "Sales", anchor: { sheet: "sheet1", row: 0, col: 0 } },
  });

  return session.refresh("sales");
}
```

- `define` runs the plan on zero-row inputs in the engine before it saves, so a
  missing column or a wrong type is reported as `invalid` and nothing is saved.
- `refresh` loads the query and every query it joins, then writes the output
  table in one undoable transaction. `refreshAll` writes every output table in
  one transaction, or none if any query fails.
- The output table holds the saved values. Formulas and pivots read it as an
  ordinary table. Undo and redo restore the recorded values without another
  fetch. Synced peers receive the written values and never fetch.
- A refresh is `stale` if a definition or its output table changes while the
  sources load. Growth into non-empty cells, or into another table, is
  `blocked`. In both cases nothing is written.
- Saved locators are public. A locator with a user name or password is
  rejected, and credentials stay in the host's callback.

## Power Query in XLSX

Pass a Power Query codec to XLSX export and import to write saved queries as
Power Query M and read them back. `loadPowerQueryCodec` loads the same lazy
query artifact as the engine.

```ts compile title="Keep saved queries in an XLSX file"
import { type Grid, toXlsxWorkbook } from "@sheetwrite/core";
import { loadPowerQueryCodec } from "@sheetwrite/queries";

async function saveWithQueries(grid: Grid) {
  const powerQuery = await loadPowerQueryCodec();
  return toXlsxWorkbook(grid, {
    powerQuery,
    onWarning: (warning) => {
      if (warning.code === "query-loss") console.warn(warning.message);
    },
  });
}
```

- Export writes one `Section1` document in a DataMashup part
  ([MS-QDEFF](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-qdeff/27b1dd1e-7de8-45d9-9c84-dfcc7a802e37)).
  Each query with an output table also gets a workbook connection and a query
  table, so Excel shows the table as that query's output. The values are saved
  in the table cells as usual.
- The M is built only from
  [documented Power Query functions](https://learn.microsoft.com/en-us/powerquery-m/power-query-m-function-reference).
  M does not promise a row order for joins and groups, so the exported M sorts
  by keys and added row positions, which gives Sheetwrite's order. Conversions
  use the `en-US` culture. A host source has no M connector, so it is written
  as an M error with its source ID. Each such difference is a `query-loss`
  warning.
- Import reads M as text with a bounded parser. It never evaluates M and
  never fetches a source. Supported members become saved queries, bound to
  their output tables by name. Other members stay in the kept DataMashup part
  and are reported with a `query-loss` warning.
- Files that Sheetwrite wrote also keep the exact definitions in the hidden
  workbook metadata, so identities and host sources come back unchanged.
- Without a codec, export writes output tables as values. A DataMashup kept
  from import is written back unchanged while `workbook.queries` is unchanged;
  otherwise it is dropped with a `query-loss` warning.

## See also

- [Interaction](/docs/features/grid/selection-and-keyboard/) for clipboard TSV and the toolbar sort control.
- [Concepts](/docs/concepts/documents-and-operations/#document-protocol-and-storage-transactions) for row/column `DocumentOp` transactions.
