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
grid.actions.merge(); // merges A1:B1 now and keeps only A1's value
```

<div class="sw-grid-result" data-caption="Result: A1:B1 is merged and shows 10, the value from A1. B1's 30 is discarded. This static illustration shows the merge, not the grid's pixel widths.">

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

Column A is 160 px wide. `merge()` merges before it returns: A1's value spans both columns and B1's value is discarded, as Excel's `Range.Merge` does in a macro with `DisplayAlerts = False`. To warn first, as the toolbar does, call `grid.actions.merge({ ask: true })`. Call `grid.actions.unmerge()` to separate them again.

[Try it live → Spreadsheet showcase](/showcases/spreadsheet/)

## Resizing

Drag a column-header boundary or a row-header boundary to preview its size. The preview changes geometry only: the document and undo history stay the same until release. Release submits one undoable size change. Cancellation, capture loss, or a rejected change restores the document's size. Turning read-only on ends an active resize without committing.

## Merged cells

Merging combines the selected range into one cell. The top-left value shows, and the covered cells are hidden. A per-sheet merge registry tracks them. Unmerge reverses it.

As in Excel, when more than one cell of the range holds a value, Merge, Merge & Center and the context menu warn first: "Merging cells only keeps the upper-left value and discards other values." The warning then names the values the merge would discard and their cells, in reading order, as the cells show them: "These values will be discarded: C2: 'Avery', B3: 'South', C3: 12." It lists the first five and counts the rest ("and 7 more"), so you see what you would lose, also in cells out of view; Excel's warning does not say which values or how many. OK merges and clears the other cells, as one undoable step. Cancel or Escape leaves the cells as they were. A range with at most one value merges at once. From code, `grid.actions.merge()` and `mergeAndCenter()` merge at once, as Excel's `Range.Merge` does with `DisplayAlerts = False`; pass `{ ask: true }` to warn first as the toolbar does. The warning's dialog loads the first time it opens, and keys pressed meanwhile reach it. See Microsoft's [Merge and unmerge cells](https://support.microsoft.com/en-us/office/merge-and-unmerge-cells-in-excel-5cbd15d5-9375-4540-907f-c673a93fcedf).

## Drag-to-fill

A small fill handle sits at the bottom-right corner of the selection. Drag it **down, up, left, or right** to fill the new region. The dominant axis wins. As in Excel, the fill continues a series along the direction you drag and copies everything else, with each source cell's format and data validation rules (see [Paste and validation](/docs/features/data/validation-protection-and-notes/#paste-and-validation)):

| Source | Fill |
| --- | --- |
| One number | Copies it. |
| One date (a date number format or a date column) | Counts up by one day per cell. |
| One time (a number format with only a time, such as `h:mm`) | Counts up by one hour per cell. |
| Dates on the same day of the month (`1-Jan`, `1-Apr`), or each on the last day of its month | Steps by whole months or years: `1-Jul`, `1-Oct`, … |
| Numbers with a constant step, such as 1, 2 | Continues the step: 3, 4, … |
| Other numbers, such as 1, 2, 4 | Continues their linear trend. |
| Day or month names (`Mon`, `Monday`, `Jan`, `January`) | Continues the list in the same letter case. |
| Quarters (`Q3`, `Qtr3`, `Qtr 3`, `Quarter 3`, `3rd Qtr`) | Counts to 4, then starts again at 1: `Qtr4`, `Qtr1`, … |
| Text that starts with an ordinal (`1st`, `1st Period`) | Counts up: `2nd Period`, `3rd Period`, … |
| Text that ends in a number (`Item 1`, `Q01`) | Counts the number up, keeping leading zeros. |
| Formulas and other text | Copies the source cells in turn. In a mix, each text with a number counts up once per repeat: `text1`, `textA` fills `text2`, `textA`, `text3`, … |

Hold Ctrl (Option on a Mac) while you release to swap counting and copying: one number then counts up by 1, and a series is copied. Double-click the fill handle to fill down as far as the data in the column next to the selection reaches. Ctrl/Cmd + D and Ctrl/Cmd + R copy the top row or left column of the selection, with its format, into the rest of it; with one cell selected they copy the cell above or to the left.

Rows hidden by hand (Hide Rows or a collapsed group) between the rows a fill covers fill too, and a series counts through them, as in Excel; the fill handle, Ctrl/Cmd + D and Ctrl/Cmd + R over a range all do this. With one cell selected, Ctrl/Cmd + D and Ctrl/Cmd + R copy only the cell before it. Under a sort or a filter the fill handle is hidden.

While you drag, a tip beside the pointer shows the value the last cell will get, as in Excel, with Ctrl counted as you move. A cell that will get a formula shows no tip.

Every new cell on screen also shows the value it will get, as faint text in the cell, so you see the whole series and catch a wrong pattern (a copy instead of a series, a step of 2) before you release. A cell that will get a formula shows nothing until it is written. Only the cells on screen are drawn, so a fill of 10,000 cells costs about half a millisecond per pointer move in Chromium. Esc ends the drag without filling, as in Excel.

After a drag or a double-click on the fill handle, the **Auto Fill Options** button shows at the bottom-right corner of the filled cells. Its menu redoes the fill another way, as one undo step:

| Choice | Fill |
| --- | --- |
| Copy Cells | Copies the source cells, with their formats. |
| Fill Series | Continues the series; one number counts up by 1. |
| Fill Formatting Only | Copies only the formats and the data validation rules; the cells keep their values. |
| Fill Without Formatting | Fills the values; the cells keep their formats and their data validation rules. |
| Fill Days, Fill Weekdays, Fill Months, Fill Years | Offered for dates: steps the first date by a day, a weekday (skipping Saturday and Sunday), a month or a year per cell. |

Any other change, or a switch to another sheet, removes the button, as in Excel. Sheetwrite has no Flash Fill, so the menu does not offer it. A grid with `contextMenu: false` shows no button. See Microsoft's [Fill data automatically in worksheet cells](https://support.microsoft.com/en-us/excel/get-started/fill-data-automatically-in-worksheet-cells).

For example, after unmerging, select A1:B2 from Full setup and drag the fill handle down through row 4. Each column continues its step:

<div class="sw-grid-result" data-caption="Result: filling A1:B2 down through row 4 continues 10, 20 with 30, 40 and 30, 40 with 50, 60; this static illustration has no draggable handle.">

| 10 | 30 |
| --- | --- |
| 20 | 40 |
| 30 | 50 |
| 40 | 60 |

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
| `grid.actions.merge(options?)` / `grid.actions.unmerge()` | Merge or unmerge the selection, before the call returns. With `{ ask: true }`, merge warns first when more than one cell holds a value, and merges after OK. |
| `grid.actions.mergeAndCenter(options?)` | Merge the selection and center its text, as one undoable step. It takes `{ ask: true }` like `merge()`. |
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
