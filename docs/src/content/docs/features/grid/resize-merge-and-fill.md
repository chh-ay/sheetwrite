---
title: Resize, merge and fill
description: Resize rows and columns, merge cells, and fill a range with the fill handle.
---

Users drag header boundaries to resize, merge a range into one cell, and drag the fill handle to repeat cells; code can do the first two through the `Grid`.

```ts prelude="core" partial="requires the grid from Full setup" title="Resize a column and merge A1:B1"
grid.setColumnWidth(0, 160); // one undoable size change
grid.setSelection({
  kind: "range",
  range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } },
});
grid.actions.merge(); // A1:B1 is now one cell that shows A1's value
```

<div class="sw-grid-result" data-caption="Result: A1:B1 is merged and shows 10, the value from A1. B1's 30 is hidden. This static illustration shows the merge, not the grid's pixel widths.">

<table>
<tbody>
<tr><td colspan="2">10</td></tr>
<tr><td>20</td><td>40</td></tr>
</tbody>
</table>

</div>

<details>
<summary>Full setup</summary>

```ts compile title="Resize a column and merge A1:B1"
import { createGrid, initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

const host = document.querySelector<HTMLElement>("#grid");
if (host === null) throw new Error("Missing #grid host");
host.style.height = "320px";

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [{
    id: "sheet1",
    name: "Sheet1",
    rowCount: 4,
    columns: [
      { key: "a", header: "A", type: "number", width: 120 },
      { key: "b", header: "B", type: "number", width: 120 },
    ],
  }],
};
const data: ColumnarData = {
  rowCount: 4,
  columns: { a: new Float64Array([10, 20, 0, 0]), b: new Float64Array([30, 40, 0, 0]) },
};

await initSheetwrite();
const grid = createGrid(host, { workbook, data });
grid.setColumnWidth(0, 160);
grid.setSelection({
  kind: "range",
  range: { sheet: "sheet1", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } },
});
grid.actions.merge();
// Later, make A1 and B1 separate again:
// grid.actions.unmerge();
```

</details>

Column A is 160 px wide. After `merge()`, A1's value spans both columns and B1 is hidden. Call `grid.actions.unmerge()` to separate them again.

[Try it live → Spreadsheet showcase](/showcases/spreadsheet/)

## Resizing

Drag a column-header boundary or a row-header boundary to preview its size. The preview changes geometry only: the document and undo history stay the same until release. Release submits one undoable size change. Cancellation, capture loss, or a rejected change restores the document's size. Turning read-only on ends an active resize without committing.

## Merged cells

Merging combines the selected range into one cell. The top-left value shows, and the covered cells are hidden. A per-sheet merge registry tracks them. Unmerge reverses it.

## Drag-to-fill

A small fill handle sits at the bottom-right corner of the selection. Drag it **down, up, left, or right** to fill the source block across the new region. The dominant axis wins. The grid tiles (repeats) the source to cover the target.

For example, after unmerging, select A1:B2 from Full setup and drag the fill handle down through row 4. The source repeats; it does not become a numeric series:

<div class="sw-grid-result" data-caption="Result: filling A1:B2 down through row 4 repeats 10, 30 and 20, 40. Rows 3 and 4 are the new copies; this static illustration has no draggable handle.">

| 10 | 30 |
| --- | --- |
| 20 | 40 |
| 10 | 30 |
| 20 | 40 |

</div>

When the filled cells contain formulas, the grid rewrites references as it copies them: **relative** A1 parts shift by the fill offset, and **absolute** parts (prefixed with `$`) stay fixed.

| Source formula | Fill direction | Filled formula |
| --- | --- | --- |
| `=A1 + $B$1` | One column right | `=B1 + $B$1` |

See [Formulas → Point mode and reference rewriting](/docs/features/formulas/authoring-and-references/#point-mode-and-reference-rewriting).

## Options

| API | Effect |
| --- | --- |
| `grid.setColumnWidth(col, width)` | Set one column's width with an undoable `setColumn` patch. |
| `grid.setRowHeight(row, height)` | Set one row's persistent display height through document history. |
| `grid.actions.merge()` / `grid.actions.unmerge()` | Merge or unmerge the selection. |
| `grid.actions.mergeAndCenter()` | Merge the selection and center its text, as one undoable step. |
| `readOnly: true` | Turns off drag-to-fill and resizing, including double-click autofit. Turning it on ends an active resize without committing. |

## Edge cases and limits

- Merges are **not drawn while a sort or filter view is active**, because the display order no longer maps cleanly to the merged region. Clear the view to see them again. See [Data operations](/docs/features/data/data-operations/#display-views).
- Drag-to-fill is unavailable while a sort or filter view is active (the handle is hidden). When `readOnly` is on, the handle still shows, but a fill changes nothing.
- A resize preview does not change the document. Only the release commits.

## See also

- [Selection and keyboard](/docs/features/grid/selection-and-keyboard/)
- [Touch](/docs/features/grid/touch/): resize and fill on a touch screen
- [Editing and clipboard](/docs/features/grid/editing-and-clipboard/#undo-and-redo)
- [`Grid` API](/docs/api/core/grid/)
