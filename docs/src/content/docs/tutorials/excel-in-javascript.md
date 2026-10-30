---
title: Excel in JavaScript
description: Open an XLSX table, edit it in a browser Grid, and download a workbook without a framework.
---

```ts prelude="core" partial="file handler excerpt; options and workbookFor are defined in Full setup"
import { fromXlsxTable, type XlsxWorkbookOptions } from "@sheetwrite/core";

declare const options: () => XlsxWorkbookOptions;
declare function workbookFor(data: ColumnarData): Workbook;

async function openFile(file: File): Promise<Grid> {
  const data = await fromXlsxTable(await file.arrayBuffer(), options());
  grid.destroy();
  return createGrid(host, { workbook: workbookFor(data), data });
}
```

<div class="sw-grid-result" data-caption="Result: imported rows after opening a workbook whose first row is Item, Amount">

| Tea | 12 |
| --- | --- |
| Coffee | 18 |

</div>

The source file has headers `Item`, `Amount`, then rows `Tea, 12` and `Coffee, 18`. The headers become column keys, not data cells. Edit a value, then save the current workbook.

[Try it live → Vanilla example](/vanilla/)

<details>
<summary>Full setup</summary>

Use a browser TypeScript entry in a Vite application. The code creates its own host and file controls; it needs no HTML IDs.

```sh verify
npm install @sheetwrite/core @sheetwrite/xlsx
```

```ts compile
import { createGrid, initSheetwrite } from "@sheetwrite/core";
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
  let grid = createGrid(host, { workbook: workbookFor(initialData), data: initialData });
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
      grid.destroy();
      grid = createGrid(host, { workbook: workbookFor(data), data });
    });
  };
  save.onclick = () => void run(async () => {
    const bytes = await toXlsxWorkbook(grid, options());
    if (!controller.signal.aborted) downloadBytes(bytes, "sales.xlsx", mime);
  });
  return () => {
    controller.abort(); picker.onchange = null; save.onclick = null;
    grid.destroy(); controls.remove();
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

## Ownership and errors

Await `initSheetwrite()` before creating a Grid. Keep the returned disposer in a single-page application and call it when the view leaves; `pagehide` covers this standalone example. The disposer aborts conversion, removes controls and destroys the Grid. A file parse failure keeps the current Grid. A successful import replaces it, so prior undo history does not carry over.

Initialization errors appear in the host. Codec errors appear beside the controls. No file is substituted when import fails.

## Options and limits

| Choice | Behavior |
| --- | --- |
| Import | `fromXlsxTable` reads only the first sheet. Its first row supplies headers. Formula source and workbook formatting are not preserved by table import. |
| Save | `toXlsxWorkbook` saves the current Grid as a workbook, not only its visible viewport. |
| Budget | This example accepts 100,000 cells and at most 8 MiB of input. Codec defaults still bound ZIP entries, expanded bytes, XML depth and other resources. |
| Cancel | Unmount aborts work between bounded codec stages. Cancellation is not an immediate interrupt inside a stage. |

Import builds the full result in memory. The Blob workbook importer avoids an initial full-file buffer, but still returns an in-memory snapshot; it is not an unbounded-data reader. Use [workbook interchange](/docs/import-export/xlsx-export/#workbook-interchange) instead of table import when you must retain sheets, formulas, styles and kept parts. Surface its `onWarning` messages when fidelity matters. Resource failures are `XlsxResourceError` values and also satisfy `isSheetwriteError`.

See [Vanilla lifecycle](/docs/frameworks/vanilla/) and [XLSX API](/docs/api/xlsx/).
