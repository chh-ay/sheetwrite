---
title: Excel in Vue
description: Open an XLSX table, edit it in Vue, and download the current workbook.
---

```vue prelude="vue" partial="adapter element; the complete component in Full setup owns input"
<script setup lang="ts">
import { shallowRef } from "vue";

defineProps<{ input: { workbook: Workbook; data: ColumnarData } }>();
const activeGrid = shallowRef<Grid>();
function ready(event: GridReadyEvent) { activeGrid.value = event.grid; }
</script>

<template>
  <SheetwriteGrid :workbook="input.workbook" :data="input.data"
    :height="420" @ready="ready" />
</template>
```

<div class="sw-grid-result" data-caption="Result: imported rows after opening a workbook whose first row is Item, Amount">

| Tea | 12 |
| --- | --- |
| Coffee | 18 |

</div>

The source file has headers `Item`, `Amount`, then rows `Tea, 12` and `Coffee, 18`. The headers become column keys, not data cells. Edit a value, then save the current workbook.

[Try it live → Vue example](/vue/)

<details>
<summary>Full setup</summary>

Install in an existing Vue application:

```sh verify
npm install @sheetwrite/vue @sheetwrite/core @sheetwrite/xlsx
```

Save this as `ExcelTable.vue` and render it from your application.

```vue prelude="vue" partial="complete Vue SFC; requires the Vue SFC compiler"
<script setup lang="ts">
import { shallowRef, ref, onBeforeUnmount } from "vue";
import { SheetwriteGrid, type GridReadyEvent } from "@sheetwrite/vue";
import "@sheetwrite/vue/styles.css";
import {
  fromXlsxTable, toXlsxWorkbook, downloadBytes, isSheetwriteError,
  type ColumnarData, type Workbook, type Grid, type SheetwriteError, type XlsxWorkbookOptions,
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

const input = shallowRef({ workbook: workbookFor(initialData), data: initialData });
const activeGrid = shallowRef<Grid>();
const busy = ref(false);
const error = ref("");
const controller = new AbortController();
onBeforeUnmount(() => { controller.abort(); activeGrid.value = undefined; });
function ready(event: GridReadyEvent) { activeGrid.value = event.grid; }
function initializationFailed(failure: SheetwriteError) { error.value = message(failure); }
const options = (): XlsxWorkbookOptions => ({
  signal: controller.signal, maxCells: 100_000,
  resourceLimits: { maxInputBytes: 8 * 1024 * 1024 },
  onWarning: (warning) => { error.value = warning.message; },
});
async function open(file: File) {
  busy.value = true; error.value = "";
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error("File exceeds 8 MiB");
    const data = await fromXlsxTable(await file.arrayBuffer(), options());
    if (controller.signal.aborted) return;
    activeGrid.value = undefined;
    input.value = { workbook: workbookFor(data), data };
  } catch (failure) {
    if (!controller.signal.aborted) error.value = message(failure);
  } finally { if (!controller.signal.aborted) busy.value = false; }
}
async function save() {
  const current = activeGrid.value;
  if (!current) return;
  busy.value = true; error.value = "";
  try {
    const bytes = await toXlsxWorkbook(current, options());
    if (!controller.signal.aborted) downloadBytes(bytes, "sales.xlsx", mime);
  } catch (failure) {
    if (!controller.signal.aborted) error.value = message(failure);
  } finally { if (!controller.signal.aborted) busy.value = false; }
}
function choose(event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const file = target.files?.[0];
  if (file) void open(file);
  target.value = "";
}
</script>

<template>
  <input type="file" accept=".xlsx" :disabled="busy" @change="choose" />
  <button :disabled="busy" @click="save">Save XLSX</button>
  <p role="status">{{ error }}</p>
  <SheetwriteGrid :workbook="input.workbook" :data="input.data" :height="420"
    @ready="ready" @initialization-error="initializationFailed" />
</template>
```

</details>

## Readiness and cleanup

The adapter initializes WASM after client mount and destroys its Grid on unmount. Use the handle published by `@ready`, not a handle captured before initialization. Import replaces the workbook and data together. This creates a new Grid generation; ready publishes its replacement. Do not call `grid.destroy()` on an adapter-owned Grid.

The adapter clears its exposed or bound handle before reset. The ready callback receives the new generation. Dispose any host subscriptions or persistence coordinators before attaching them to the replacement. This example attaches none. File controls are disabled during conversion, and unmount aborts the outstanding codec operation.

Use a client-only boundary in Nuxt. Import the adapter stylesheet once. Keep `workbook` and `data` identities stable between imports so unrelated renders do not reset edits.

## Options and limits

| Choice | Behavior |
| --- | --- |
| Import | `fromXlsxTable` reads only the first sheet. Its first row supplies headers. Formula source and workbook formatting are not preserved by table import. |
| Save | `toXlsxWorkbook` saves the current Grid as a workbook, not only its visible viewport. |
| Budget | This example accepts 100,000 cells and at most 8 MiB of input. Codec defaults still bound ZIP entries, expanded bytes, XML depth and other resources. |
| Cancel | Unmount aborts work between bounded codec stages. Cancellation is not an immediate interrupt inside a stage. |

Import builds the full result in memory. The Blob workbook importer avoids an initial full-file buffer, but still returns an in-memory snapshot; it is not an unbounded-data reader. Use [workbook interchange](/docs/import-export/xlsx-export/#workbook-interchange) instead of table import when you must retain sheets, formulas, styles and kept parts. Surface its `onWarning` messages when fidelity matters. Resource failures are `XlsxResourceError` values and also satisfy `isSheetwriteError`.


See [adapter lifecycle](/docs/frameworks/lifecycle/) and the [Vue adapter](/docs/frameworks/vue/).
