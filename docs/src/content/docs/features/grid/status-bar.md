---
title: Status bar
description: Show Excel's cell mode and Average, Count and Sum for the selected cells, or read the totals yourself.
---

The status bar names Excel's cell mode (Ready, Enter, Edit or Point) and shows Average, Count and Sum for the selected cells, next to the size of the selection.

```ts prelude="core" partial="requires the initialized shell and sales data from Full setup" title="Summarize the selected amounts"
import type { createSpreadsheetShell } from "@sheetwrite/core/shell";
declare const shell: ReturnType<typeof createSpreadsheetShell>;

shell.grid.setSelection({
  kind: "range",
  range: { sheet: "sales", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
});
```

<div class="sw-grid-result" data-selected="B1:B3">

| Notebook | 12 |
| --- | ---: |
| Pen | 4 |
| Folder | 8 |

<div class="sw-mini-status">
  <span>Sales</span>
  <output aria-label="Selection summary">Ready Average: 8 · Count: 3 · Sum: 24 · 3 × 1 cells</output>
</div>

<figcaption>Result: selecting the amounts in B1:B3 shows the selection totals and size in the shell's bottom status bar.</figcaption>

</div>

<details>
<summary>Full setup</summary>

```ts compile title="A spreadsheet shell with a status bar"
import { initSheetwrite, type ColumnarData, type Workbook } from "@sheetwrite/core";
import { createSpreadsheetShell } from "@sheetwrite/core/shell";
import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

const host = document.querySelector<HTMLElement>("#app");
if (host === null) throw new Error("Missing #app host");
host.style.height = "480px";

const workbook: Workbook = {
  activeSheet: "sales",
  sheets: [
    {
      id: "sales",
      name: "Sales",
      rowCount: 3,
      columns: [
        { key: "product", header: "Product", width: 180, type: "text" },
        { key: "amount", header: "Amount", width: 100, type: "number" },
      ],
    },
  ],
};
const data: ColumnarData = {
  rowCount: 3,
  columns: {
    product: ["Notebook", "Pen", "Folder"],
    amount: new Float64Array([12, 4, 8]),
  },
};

await initSheetwrite();
const shell = createSpreadsheetShell(host, { grid: { workbook, data } });

// Select B1:B3, the three amounts.
shell.grid.setSelection({
  kind: "range",
  range: { sheet: "sales", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
});
```

The status line at the bottom of the shell reads `Ready`, then `Average: 8 · Count: 3 · Sum: 24 · 3 × 1 cells`.

</details>

## Turn it on

`createSpreadsheetShell` always adds the status bar to its bottom row, next to the sheet tabs. There is no flag to turn it on.

To use it with a grid that you created yourself, for example the `Grid` from a framework adapter, mount the piece into your own element:

```ts prelude="core" partial="requires surrounding host state" title="Mount only the status bar"
import { createSelectionStatus } from "@sheetwrite/core/shell";

const statusHost = document.createElement("div");
host.after(statusHost);

const status = createSelectionStatus(statusHost, grid);
// Later, when the grid goes away:
status.destroy();
```

`createSelectionStatus(host, grid)` appends an `<output role="status">` with the class `sheetwrite-shell-status` to `host` and returns a `ShellPiece`: `element` is the `<output>`, and `destroy()` removes it and stops its listeners. The cell mode is its first child, a `<span>` with the class `sheetwrite-shell-mode`. Import `@sheetwrite/core/shell.css` for the shell styles.

## What it shows

| Part | When it shows |
| --- | --- |
| Cell mode | Always, as in [Excel](https://support.microsoft.com/en-us/office/excel-status-bar-options-6055ecd9-e20f-4a7a-a611-4481bd488c55): **Ready** with no edit open, **Enter** after typing opened the editor, **Edit** after F2 or a double-click, and **Point** while an arrow key or a click has just picked a reference for a formula. See [Inline editing](/docs/features/grid/editing-and-clipboard/#inline-editing). |
| Undo or redo step | Right after Ctrl/Cmd + Z or Ctrl/Cmd + Y, until the selection changes: the step and the cells it changed, such as `Undo: Paste in B2:D9` or `Redo: Insert Rows`. Steps are named as in Excel's undo list: Typing, Paste, Clear, Auto Fill, Replace, Sort, Format Cells, Insert Rows and so on. |
| Average | Two or more selected cells hold values, and at least one of them is a number. |
| Count | Two or more selected cells hold values. Text and errors count. |
| Sum | Two or more selected cells hold values, and at least one of them is a number. |
| Selection size | A range shows `rows × columns cells`, a row shows `Row n`, a column shows `Column n`, and a multi selection shows `n ranges`. A single cell shows nothing. |

The totals and the size are joined with ` · `, after the cell mode.

As in Excel, Average and Sum show in the number format of the active cell, so a selection that starts on a `$#,##0` cell shows `Sum: $736,610`. Without a format they show as Excel's General format shows a number, such as `Average: 61384.16667`. Count is a plain count.

When the row is too narrow for the whole line, the status bar drops whole parts: the selection size first, then the records found and the undo step, then Count, then Average. Sum, the total people read most, stays longest, and the cell mode always stays. In the shell, the sheet tabs give way first: the tab strip narrows and scrolls, down to half the row (or its own width, if less), and only then does the status drop parts. Screen readers still hear every part.

The status bar updates on each `selection`, `change`, `history-step` and `cell-mode` event. It is a polite live region, so screen readers announce changes without interrupting the user.

Excel changes the cells of an undo silently. Here the step's name says what was undone, and the changed cells also flash in the grid for a moment, so a change spread over many cells, or one that started out of view, is easy to check. The grid reports each step with the `history-step` event, `{ direction, step, range }`, so a status bar of your own can show it too.

## Read the totals yourself

`grid.summarizeSelection(signal?)` returns the totals that the status bar uses. Use it to build your own status bar, or to show Min and Max.

```ts prelude="core" partial="requires surrounding host state" title="Show Min and Max for the selection"
let pending: AbortController | null = null;

grid.on("selection", async () => {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  try {
    const summary = await grid.summarizeSelection(controller.signal);
    if (summary === null || summary.numericCount === 0) return;
    console.log(`Min: ${summary.min} · Max: ${summary.max}`);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  }
});
```

With B1:B3 from the first example selected, this logs `Min: 4 · Max: 12`.

## Options

`createSelectionStatus` and `createSpreadsheetShell` have no status bar options. These are the fields of the `SelectionSummary` that `summarizeSelection` resolves:

| Field | Type | Meaning |
| --- | --- | --- |
| `count` | `number` | Cells that hold any value, including text and errors. |
| `numericCount` | `number` | Cells that hold a number. Dates are numbers too. |
| `sum` | `number` | Sum of the numeric cells. |
| `average` | `number \| null` | Mean of the numeric cells; `null` when there are none. |
| `min` | `number \| null` | Smallest number; `null` when there are none. |
| `max` | `number \| null` | Largest number; `null` when there are none. |

`summarizeSelection` resolves `null` when nothing is selected.

## Edge cases and limits

- The totals cover only the cells the user can see. Rows that a filter hides are left out.
- Overlapping ranges in a multi selection count once per range, as in Excel.
- Whole-row selections stop at the last column; there are no cells past it.
- Large selections are read in chunks of 65,536 cells, with a pause between frames, so the page stays responsive. In one measurement, 4 million cells took about 160 ms in total and at most 10 ms per chunk.
- Abort the `signal` to stop early. The promise then rejects with the signal's reason. The status bar aborts an unfinished summary when the selection or the data changes.
- The totals use the selection and the active sheet as they were when the call started.

## See also

- [Selection and keyboard](/docs/features/grid/selection-and-keyboard/)
- [`createSelectionStatus` API](/docs/api/core-shell/create-selection-status/)
- [`createSpreadsheetShell` API](/docs/api/core-shell/create-spreadsheet-shell/)
- [`Grid.summarizeSelection` API](/docs/api/core/grid/#grid-summarize-selection)
