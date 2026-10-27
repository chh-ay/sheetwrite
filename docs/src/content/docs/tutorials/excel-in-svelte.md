---
title: Excel in Svelte
description: Open an XLSX table, edit it in Svelte, and download the current workbook.
---

```svelte prelude="svelte" partial="adapter element; the complete component in Full setup owns input"
<script lang="ts">
let { input }: { input: { workbook: Workbook; data: ColumnarData } } = $props();
let activeGrid = $state<Grid | undefined>();
function ready(event: GridReadyEvent) { activeGrid = event.grid; }
</script>

<SheetwriteGrid workbook={input.workbook} data={input.data}
  height={420} bind:grid={activeGrid} onReady={ready} />
```

<div class="sw-grid-result" data-caption="Result: imported rows after opening a workbook whose first row is Item, Amount">

| Tea | 12 |
| --- | --- |
| Coffee | 18 |

</div>

The source file has headers `Item`, `Amount`, then rows `Tea, 12` and `Coffee, 18`. The headers become column keys, not data cells. Edit a value, then save the current workbook.

[Try it live → Svelte example](/svelte/)

<details>
<summary>Full setup</summary>

Install in an existing Svelte 5 application:

```sh verify
npm install @sheetwrite/svelte @sheetwrite/core @sheetwrite/xlsx
```

Save this as `ExcelTable.svelte` and render it from your application.

```svelte prelude="svelte" partial="complete Svelte 5 component; requires the Svelte compiler"
<script lang="ts">
import { onMount } from "svelte";
import { SheetwriteGrid, type GridReadyEvent } from "@sheetwrite/svelte";
import "@sheetwrite/svelte/styles.css";
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

let input = $state({ workbook: workbookFor(initialData), data: initialData });
let activeGrid = $state<Grid | undefined>();
let busy = $state(false);
let error = $state("");
const controller = new AbortController();
onMount(() => () => { controller.abort(); activeGrid = undefined; });
function ready(event: GridReadyEvent) { activeGrid = event.grid; }
const options = (): XlsxWorkbookOptions => ({
  signal: controller.signal, maxCells: 100_000,
  resourceLimits: { maxInputBytes: 8 * 1024 * 1024 },
  onWarning: (warning) => { error = warning.message; },
});
async function open(file: File) {
  busy = true; error = "";
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error("File exceeds 8 MiB");
    const data = await fromXlsxTable(await file.arrayBuffer(), options());
    if (controller.signal.aborted) return;
    activeGrid = undefined;
    input = { workbook: workbookFor(data), data };
  } catch (failure) {
    if (!controller.signal.aborted) error = message(failure);
  } finally { if (!controller.signal.aborted) busy = false; }
}
async function save() {
  const current = activeGrid;
  if (!current) return;
  busy = true; error = "";
  try {
    const bytes = await toXlsxWorkbook(current, options());
    if (!controller.signal.aborted) downloadBytes(bytes, "sales.xlsx", mime);
  } catch (failure) {
    if (!controller.signal.aborted) error = message(failure);
  } finally { if (!controller.signal.aborted) busy = false; }
}
function choose(event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const file = target.files?.[0];
  if (file) void open(file);
  target.value = "";
}
</script>

<input type="file" accept=".xlsx" disabled={busy} onchange={choose} />
<button disabled={busy} onclick={() => void save()}>Save XLSX</button>
<p role="status">{error}</p>
<SheetwriteGrid workbook={input.workbook} data={input.data} height={420}
  bind:grid={activeGrid} onReady={ready} onInitializationError={(failure) => { error = message(failure); }} />
```

</details>

## Readiness and cleanup

The adapter initializes WASM after client mount and destroys its Grid on unmount. Use the handle published by `onReady`, not a handle captured before initialization. Import replaces the workbook and data together. This creates a new Grid generation; ready publishes its replacement. Do not call `grid.destroy()` on an adapter-owned Grid.

The adapter clears its exposed or bound handle before reset. The ready callback receives the new generation. Dispose any host subscriptions or persistence coordinators before attaching them to the replacement. This example attaches none. File controls are disabled during conversion, and unmount aborts the outstanding codec operation.

For SvelteKit, use a client-only route or create this component after client mount. Import the adapter stylesheet once. Keep `workbook` and `data` identities stable between imports so unrelated renders do not reset edits.

## Options and limits

| Choice | Behavior |
| --- | --- |
| Import | `fromXlsxTable` reads only the first sheet. Its first row supplies headers. Formula source and workbook formatting are not preserved by table import. |
| Save | `toXlsxWorkbook` saves the current Grid as a workbook, not only its visible viewport. |
| Budget | This example accepts 100,000 cells and at most 8 MiB of input. Codec defaults still bound ZIP entries, expanded bytes, XML depth and other resources. |
| Cancel | Unmount aborts work between bounded codec stages. Cancellation is not an immediate interrupt inside a stage. |

Import builds the full result in memory. The Blob workbook importer avoids an initial full-file buffer, but still returns an in-memory snapshot; it is not an unbounded-data reader. Use [workbook interchange](/docs/import-export/xlsx-export/#workbook-interchange) instead of table import when you must retain sheets, formulas, styles and kept parts. Surface its `onWarning` messages when fidelity matters. Resource failures are `XlsxResourceError` values and also satisfy `isSheetwriteError`.


See [adapter lifecycle](/docs/frameworks/lifecycle/) and the [Svelte adapter](/docs/frameworks/svelte/).
