---
title: Spreadsheet app with a ribbon
description: Build a disposable spreadsheet shell with a ribbon, formula bar, sheet tabs and XLSX file controls.
---

```ts prelude="core" partial="host, workbook and data are declared in Full setup"
import { createSpreadsheetShell } from "@sheetwrite/core/shell";

const shell = createSpreadsheetShell(host, {
  ribbon: true,
  grid: { workbook, data },
});
```

<div class="sw-grid-result" data-caption="Result: Sales cells below the Home ribbon, with a formula bar above and sheet tabs below">

| Tea | 12 |
| --- | --- |
| Coffee | 18 |

</div>

Select B1 and use Home to change its number format. The value stays `12`; the selected format changes its display. Save XLSX writes the current workbook, including supported styles and formula source.

[Try it live → Spreadsheet showcase](/showcases/spreadsheet/)

<details>
<summary>Full setup</summary>

Use a browser TypeScript entry in a Vite application:

```sh verify
npm install @sheetwrite/core @sheetwrite/xlsx
```

```ts compile
import { initSheetwrite } from "@sheetwrite/core";
import { createSpreadsheetShell } from "@sheetwrite/core/shell";
import "@sheetwrite/core/styles.css";
import {
  fromXlsxTable, toXlsxWorkbook, downloadBytes, isSheetwriteError,
  type ColumnarData, type Workbook, type Grid, type XlsxWorkbookOptions,
} from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

const initialData: ColumnarData = {
  rowCount: 2, columns: { Item: ["Tea", "Coffee"], Amount: [12, 18] },
};
function workbookFor(data: ColumnarData): Workbook {
  return { activeSheet: "sales", sheets: [{
    id: "sales", name: "Sales", rowCount: data.rowCount,
    columns: Object.keys(data.columns).map((key) => ({
      key, header: key, width: 160,
      type: typeof data.columns[key]?.[0] === "number" ? "number" : "text",
    })),
  }] };
}
const message = (error: unknown) => isSheetwriteError(error)
  ? `${error.code}: ${error.message}` : String(error);
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function mountExcel(host: HTMLElement) {
  await initSheetwrite();
  const controller = new AbortController();
  const controls = document.createElement("div");
  const picker = document.createElement("input");
  picker.type = "file"; picker.accept = ".xlsx";
  const save = document.createElement("button");
  save.textContent = "Save XLSX";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  controls.append(picker, save, status);
  host.before(controls);
  host.style.height = "480px";
  let shell = createSpreadsheetShell(host, {
    ribbon: true,
    grid: { workbook: workbookFor(initialData), data: initialData },
  });
  const options = (): XlsxWorkbookOptions => ({
    signal: controller.signal, maxCells: 100_000,
    resourceLimits: { maxInputBytes: 8 * 1024 * 1024 },
    onWarning: (warning) => { status.textContent = warning.message; },
  });
  async function run(action: () => Promise<void>) {
    picker.disabled = save.disabled = true; status.textContent = "";
    try { await action(); }
    catch (error) {
      if (!controller.signal.aborted) status.textContent = message(error);
    } finally {
      if (!controller.signal.aborted) picker.disabled = save.disabled = false;
    }
  }
  picker.onchange = () => {
    const file = picker.files?.[0]; picker.value = "";
    if (!file) return;
    void run(async () => {
      if (file.size > 8 * 1024 * 1024) throw new Error("File exceeds 8 MiB");
      const data = await fromXlsxTable(await file.arrayBuffer(), options());
      if (controller.signal.aborted) return;
      shell.destroy();
      shell = createSpreadsheetShell(host, {
        ribbon: true, grid: { workbook: workbookFor(data), data },
      });
    });
  };
  save.onclick = () => void run(async () => {
    const bytes = await toXlsxWorkbook(shell.grid, options());
    if (!controller.signal.aborted) downloadBytes(bytes, "sales.xlsx", mime);
  });
  return () => {
    controller.abort(); picker.onchange = null; save.onclick = null;
    shell.destroy(); controls.remove();
  };
}

const host = document.createElement("div");
document.body.append(host);
try {
  const dispose = await mountExcel(host);
  window.addEventListener("pagehide", dispose, { once: true });
} catch (error) { host.textContent = message(error); }
```

</details>

## Shell ownership

The shell owns one Grid and its ribbon, name box, formula bar, sheet tabs and selection status. Keep the host at a real size. Call `shell.destroy()` when the view leaves; it destroys its Grid and chrome and is safe to call twice. Do not also mount the Grid's built-in ribbon with `grid.config.ribbon`.

The file buttons are host-owned. A successful table import destroys the old shell and starts a new one. This also resets undo history and sheet selection. Parse failure leaves the old shell intact. On teardown, abort work before destroying the shell so a late conversion cannot recreate it.

## Ribbon behavior

| Choice | Effect |
| --- | --- |
| `ribbon: true` | Shows Home, Insert, Data and View instead of the flat toolbar. |
| Narrow host | Labels shrink and groups fold into popup controls. |
| Double-click a tab | Minimizes the ribbon to its tab row. |
| Read-only Grid | Editing commands disable; view commands remain available. |
| Host commands | Read `shell.grid.getCommandState(...)` and subscribe to `command-state-change`; do not derive availability from CSS. |

The ribbon loads as a separate chunk. The shell reserves its height while loading and ignores a late chunk after destruction. A failed load falls back to the flat toolbar and still reports an unhandled promise rejection; the file-handler `try/catch` does not catch that asynchronous load failure. Keep chunk URLs available after deployment.

The built-in ribbon does not provide a chart-authoring API. Do not treat retained XLSX chart parts as editable charts.

## Options and limits

| Choice | Behavior |
| --- | --- |
| Import | `fromXlsxTable` reads only the first sheet. Its first row supplies headers. Formula source and workbook formatting are not preserved by table import. |
| Save | `toXlsxWorkbook` saves the current Grid as a workbook, not only its visible viewport. |
| Budget | This example accepts 100,000 cells and at most 8 MiB of input. Codec defaults still bound ZIP entries, expanded bytes, XML depth and other resources. |
| Cancel | Unmount aborts work between bounded codec stages. Cancellation is not an immediate interrupt inside a stage. |

Import builds the full result in memory. The Blob workbook importer avoids an initial full-file buffer, but still returns an in-memory snapshot; it is not an unbounded-data reader. Use [workbook interchange](/docs/import-export/xlsx-export/#workbook-interchange) instead of table import when you must retain sheets, formulas, styles and kept parts. Surface its `onWarning` messages when fidelity matters. Resource failures are `XlsxResourceError` values and also satisfy `isSheetwriteError`.

See [toolbar and ribbon](/docs/features/grid/toolbar-and-ribbon/) and [shell API](/docs/api/core-shell/).
