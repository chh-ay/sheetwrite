---
title: Pivot tables
description: "Summarize a range or a table into a pivot table: define rows, columns, values and filters, read the result for a field list, and keep the definition through edits, undo, snapshots and collaboration."
---

A pivot table summarizes a source range or a workbook table into groups. The
pivot definition is part of the document. The full engine calculates the
output, and updates it when source cells change. `PIVOTBY` is a formula and is
separate: it does not create a pivot table.

## Define a pivot

A pivot belongs to the sheet that holds its anchor cell. Commit the complete
definition with `setPivot`. A second `setPivot` with the same `id` replaces the
definition. Each call is one undo entry.

```ts prelude="core" partial="requires surrounding host state" title="Partial example"
grid.setPivot({
  id: "sales-by-region",
  name: "Sales by region",
  // The first range row holds the field names.
  source: { range: { sheet: "orders", start: { row: 0, col: 0 }, end: { row: 500, col: 4 } } },
  anchor: { row: 1, col: 1 },
  rows: [0],
  columns: [1],
  values: [{ field: 4, aggregation: "SUM", name: "Revenue" }],
  filters: [{ field: 2, values: ["Desk", "Chair"] }],
  sort: [{ axis: "rows", field: 0, descending: false }],
});

grid.removePivot("sales-by-region");
```

| Field | Meaning |
| --- | --- |
| `id` | A stable ID, unique in the workbook. |
| `source` | A range with its header row, or `{ table: tableId }` for a workbook table. A table source excludes the header and totals rows. |
| `anchor` | The top-left output cell on the owning sheet. |
| `rows`, `columns` | Source field indices that group the output rows and columns, outermost first. A field can be on one axis only. |
| `values` | Aggregated fields: `SUM`, `COUNT`, `AVERAGE`, `MIN`, `MAX`, `COUNTA` or `DISTINCTCOUNT`. These use the `PIVOTBY` semantics. `SUM` and `AVERAGE` round the exact sum one time. `PIVOTBY` rounds after each value, so the results can be different. |
| `filters` | Keep-lists: a source row contributes only if its value is in the list. |
| `sort` | The label order of axis fields. Fields without a key sort ascending. |
| `rowTotals` | The grand-total row at the bottom. Default `true`. |
| `columnTotals` | The grand-total column at the right. Default `true`. |
| `subtotals` | Subtotal rows and columns for multi-field axes. Default `true`. |
| `layout` | `"compact"` (one label column) or `"tabular"` (one label column per row field). Default `"compact"`. |

A field index is an offset in the source: column `range.start.col + i`, or
table column `i`. Invalid definitions are rejected before the document
changes. Limits: 1,000 pivots in a workbook, 256 entries in each list, and
10,000 filter values in one pivot.

## Build a field list

The field list reads plain data. It never reads engine structures.

- `getPivots(sheet?)` returns copies of the definitions. It does not need the
  engine.
- `getPivotFields(sheet, id)` returns the source fields as
  `{ index, header, type }`. The type is `number`, `text`, `boolean`, `mixed`
  or `blank`.
- `getPivotResult(sheet, id)` returns the output: `status`, `anchor`, `rows`,
  `cols`, `headerRows`, `labelCols` and the cell values in row-major order. The
  status is `ok`, `saved`, `error` (with `error`, for example `#SPILL!`), or
  `unavailable`.

The store has the same methods. The full engine calculates pivots. Select it
as shown in [Analysis formulas](/docs/guides/analysis-formulas/). With the
default engine, the document keeps, saves, undoes and synchronizes the same
definitions. It shows values saved by Excel without recalculating the pivot.
`getPivotResult` reports `saved` for those values, or `unavailable` when no
saved output exists. `getPivotFields` returns an empty list. `setPivot` removes
saved output because it no longer matches the changed definition.

## Output

The output starts at the anchor and fills cells to the right and down, like a
spill. If source cells, formulas, another spill or another pivot are in the
way, the anchor shows `#SPILL!`. The pivot appears when the blocking cells are
cleared. Output that would cover its own source also shows `#SPILL!`.

Output cells are read-only. A local edit that writes a value into them is
rejected with a `pivot-output` mutation issue. Undo and redo are not checked:
a value that undo puts back blocks the pivot, and the anchor shows `#SPILL!`.

## Row and column edits

Edits keep pivots up to date, with the same rules as formula references:

- Rows or columns inserted or deleted around the source move or resize it.
  Inside a range source, a deleted column removes its field from the pivot,
  and the other field indices move with their columns.
- When the whole source disappears (every source row or column is deleted, or
  the source sheet or table is removed), the pivot is kept. Its source gets
  `invalid: true` and keeps the old reference. The anchor shows `#REF!`.
- When the row or column of the anchor is deleted, the pivot is kept. The
  anchor moves to the first remaining row or column at the deleted position.
- If a structural edit moves two anchors to the same cell, both definitions
  remain saved and both results report `#SPILL!`. Moving one anchor away lets
  the engine retry. An explicit local `setPivot` cannot choose an occupied
  anchor.

Undo restores the exact definition from before the edit.

### Differences from Excel

These Excel behaviors are not verified against Excel yet:

- Excel refuses a delete that cuts through part of a PivotTable. Sheetwrite
  accepts it and draws the output again at the new position.
- Excel removes a PivotTable when whole rows or columns that cover it are
  deleted. Sheetwrite keeps the pivot and moves its anchor.

## Snapshots and collaboration

Definitions are in `sheet.pivots` of the workbook snapshot. Snapshot
validation checks pivot references after it reads all sheets and tables, so a
pivot can refer to a sheet that comes later in the snapshot. A reference to a
missing sheet or table is an error unless the source is `invalid`.

The operations are `{ op: "setPivot", sheet, pivot }` and
`{ op: "removePivot", sheet, id }`. They synchronize like other document
operations. Two pending changes to the same pivot ID conflict during rebase.
`releaseEngineMemory` keeps the definitions and installs them in the new
engine.

## XLSX saves

Represented pivots remain pivot definitions when an imported workbook is edited
and saved. Supported definitions are written as native XLSX pivot tables and
caches. Definitions that cannot be written natively are preserved in Sheetwrite
metadata, with a warning; Excel does not calculate that metadata-only output.

The reader captures Excel's rendered pivot values in `pivot.savedOutput` and
removes them from ordinary source cells. The default engine installs those
values as read-only calculated output, so cell reads and formulas can use
them. The full engine ignores saved values and calculates fresh output.
Loading either engine does not change the document. Snapshots and
collaboration carry the same saved output across engines. XLSX export writes
saved output back when no fresh rendered values replace it.

Unsupported or opaque imported pivots are different: their original parts are
preserved only while the workbook is unchanged. Editing the workbook drops those
opaque parts under the XLSX preservation policy (#179), with a warning. This does
not drop represented pivot definitions.
