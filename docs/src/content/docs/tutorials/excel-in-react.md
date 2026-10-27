---
title: Excel in React
description: Open an XLSX table, edit it in React, and download the current workbook.
---

```tsx prelude="react" partial="adapter element from the complete component in Full setup"
import type { RefObject } from "react";

function ExcelGrid({ input, grid }: {
  input: { workbook: Workbook; data: ColumnarData };
  grid: RefObject<Grid | null>;
}) {
  return <SheetwriteGrid {...input} height={420}
    onReady={({ grid: ready }) => { grid.current = ready; }} />;
}
```

<div class="sw-grid-result" data-caption="Result: imported rows after opening a workbook whose first row is Item, Amount">

| Tea | 12 |
| --- | --- |
| Coffee | 18 |

</div>

The source file has headers `Item`, `Amount`, then rows `Tea, 12` and `Coffee, 18`. The headers become column keys, not data cells. Edit a value, then save the current workbook.

[Try it live → React example](/react/)

<details>
<summary>Full setup</summary>

Install in an existing React application:

```sh verify
npm install @sheetwrite/react @sheetwrite/core @sheetwrite/xlsx
```

Save this as `ExcelTable.tsx` and render it from your application.

```tsx compile
"use client";
import { useEffect, useRef, useState } from "react";
import { SheetwriteGrid } from "@sheetwrite/react";
import "@sheetwrite/react/styles.css";
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

export default function ExcelTable() {
  const [input, setInput] = useState(() => ({
    workbook: workbookFor(initialData), data: initialData,
  }));
  const grid = useRef<Grid | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    controller.current = new AbortController();
    return () => { controller.current?.abort(); grid.current = null; };
  }, []);
  const options = (): XlsxWorkbookOptions => ({
    signal: controller.current?.signal, maxCells: 100_000,
    resourceLimits: { maxInputBytes: 8 * 1024 * 1024 },
    onWarning: (warning) => setError(warning.message),
  });
  async function open(file: File) {
    setBusy(true); setError("");
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("File exceeds 8 MiB");
      const data = await fromXlsxTable(await file.arrayBuffer(), options());
      if (controller.current?.signal.aborted) return;
      grid.current = null;
      setInput({ workbook: workbookFor(data), data });
    } catch (error) {
      if (!controller.current?.signal.aborted) setError(message(error));
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  async function save() {
    const current = grid.current;
    if (!current) return;
    setBusy(true); setError("");
    try {
      const bytes = await toXlsxWorkbook(current, options());
      if (!controller.current?.signal.aborted) downloadBytes(bytes, "sales.xlsx", mime);
    } catch (error) {
      if (!controller.current?.signal.aborted) setError(message(error));
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  return <>
    <input type="file" accept=".xlsx" disabled={busy} onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (file) void open(file);
      event.currentTarget.value = "";
    }} />
    <button disabled={busy} onClick={() => void save()}>Save XLSX</button>
    <p role="status">{error}</p>
    <SheetwriteGrid {...input} height={420}
      onReady={({ grid: ready }) => { grid.current = ready; }}
      onInitializationError={(event) => setError(message(event))} />
  </>;
}
```

</details>

## Readiness and cleanup

The adapter initializes WASM after client mount and destroys its Grid on unmount. Use the handle published by `onReady`, not a handle captured before initialization. Import replaces the workbook and data together. This creates a new Grid generation; ready publishes its replacement. Do not call `grid.destroy()` on an adapter-owned Grid.

React clears the host-held handle in effect cleanup. Vue and Svelte adapters also clear their exposed or bound handle on reset. Dispose any host subscriptions or persistence coordinators before attaching them to the replacement. This example attaches none. File controls are disabled during conversion, and unmount aborts the outstanding codec operation.

Use a client component in Next.js. Import the adapter stylesheet once. Keep `workbook` and `data` identities stable between imports so unrelated renders do not reset edits.

## Options and limits

| Choice | Behavior |
| --- | --- |
| Import | `fromXlsxTable` reads only the first sheet. Its first row supplies headers. Formula source and workbook formatting are not preserved by table import. |
| Save | `toXlsxWorkbook` saves the current Grid as a workbook, not only its visible viewport. |
| Budget | This example accepts 100,000 cells and at most 8 MiB of input. Codec defaults still bound ZIP entries, expanded bytes, XML depth and other resources. |
| Cancel | Unmount aborts work between bounded codec stages. Cancellation is not an immediate interrupt inside a stage. |

Import builds the full result in memory. The Blob workbook importer avoids an initial full-file buffer, but still returns an in-memory snapshot; it is not an unbounded-data reader. Use [workbook interchange](/docs/import-export/xlsx-export/#workbook-interchange) instead of table import when you must retain sheets, formulas, styles and kept parts. Surface its `onWarning` messages when fidelity matters. Resource failures are `XlsxResourceError` values and also satisfy `isSheetwriteError`.


See [adapter lifecycle](/docs/frameworks/lifecycle/) and the [React adapter](/docs/frameworks/react/).
