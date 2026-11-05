---
title: XLSX import
description: Import workbook snapshots or rectangular tables with explicit fidelity warnings.
---

## Open a file from the ribbon

Register the optional backend before creating a grid with `config: { ribbon: true }`.
Choose **File › Import XLSX**, then choose an `.xlsx` file in the browser's file
picker. The File tab is hidden when no workbook backend is registered. Use the
ribbon's arrow-key navigation and Enter or Space to open the picker; the command
has the accessible name **Import XLSX**.

Import replaces the whole workbook, not the current selection. It keeps the grid,
its chrome, host configuration and event subscriptions. The imported workbook
opens on its saved active sheet with a fresh selection and scroll position.
Successful import clears undo and redo. Import itself cannot be undone, like
Excel's Open command. Save or export the old document first if you need it later.

If parsing, validation or cancellation fails, the old document and history stay
intact. A new import aborts the previous import. Destroying the grid also aborts
import. The command and picker live in lazy chrome. Document replacement loads
on first import; core does not load the XLSX codec unless the host registers it.

## Replace a document through the API

```ts compile title="Open an XLSX file in the current grid"
import { fromXlsxWorkbookFile, type Grid } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

declare const grid: Grid;
declare const file: File;
await grid.importWorkbook((signal) => fromXlsxWorkbookFile(file, { signal }));
```

Pass a snapshot directly with `await grid.importWorkbook(snapshot)`. For async
readers, pass a loader that receives an `AbortSignal`. Forward that signal to the
reader so a newer import can stop parsing. You can also pass a host signal as the
second argument: `{ signal: controller.signal }`. Late results from cancelled
loaders never replace the current document.

The grid validates and hydrates a separate store before it replaces the live
document. On success it releases the previous document's engine storage, undo
resources, read caches, search results and rich clipboard state.

Import needs an editable grid-owned store with no datasource. Grids with injected
stores or datasources reject import because the host owns those lifetimes.
Import is also blocked while a collaboration session is attached, even while
offline or reconnecting. Disconnect that session first. Use a new collaboration
session and document identity for the imported workbook; import is not broadcast
as a transaction to the old session.

```ts prelude="core" partial="bytes is an ArrayBuffer or Uint8Array from an XLSX file" title="Open a workbook"
import { fromXlsxWorkbook, SheetwriteStore } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

declare const bytes: ArrayBuffer | Uint8Array;
const snapshot = await fromXlsxWorkbook(bytes, {
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
const importedStore = SheetwriteStore.fromSnapshot(snapshot);
```

For a workbook containing `10`, `20` and `=SUM(A1:A2)` in A1:A3, the imported grid evaluates:

<div class="sw-grid-result" data-caption="Imported worksheet: formula source retained in A3">

| 10 |
| --- |
| 20 |
| 30 |

</div>

The snapshot retains `=SUM(A1:A2)`, not a cached result or a raw formula handle.

[Try it live: import a source workbook](/showcases/interoperability/#fixtures).

<details>
<summary>Full setup</summary>

Install `@sheetwrite/xlsx` and register it on the import path. This complete example makes its own XLSX input:

```ts compile title="Import formula source from XLSX bytes"
import {
  fromXlsxWorkbook, initSheetwrite, SheetwriteStore, toXlsxWorkbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

await initSheetwrite();
const source: WorkbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "s" },
  sheets: [{
    id: "s", name: "Sales", order: 0, rowCount: 3,
    columns: [{ key: "amount", header: "Amount", width: 100, type: "number" }],
    cells: [{ startRow: 0, startCol: 0, rowCount: 3, colCount: 1, cells: [
      { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 10 } },
      { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: 20 } },
      { rowOffset: 2, colOffset: 0, value: { kind: "formula", src: "=SUM(A1:A2)" } },
    ] }],
  }],
};
const bytes = await toXlsxWorkbook(source);
const snapshot = await fromXlsxWorkbook(bytes, {
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
const importedStore = SheetwriteStore.fromSnapshot(snapshot);
console.log(importedStore.exportSnapshot().sheets[0]?.name); // Sales
```

</details>

## Choose an import contract

| Function | Input | Result |
| --- | --- | --- |
| `fromXlsxWorkbook(data, options?)` | `ArrayBuffer` or `Uint8Array` | `Promise<WorkbookSnapshot>`; preserves supported workbook state with no header synthesis. |
| `fromXlsxWorkbookFile(file, options?)` | `File` or `Blob` | Same snapshot contract, without first buffering the compressed file. |
| `fromXlsxTable(data, options?)` | `ArrayBuffer` or `Uint8Array` | `Promise<ColumnarData>`; one rectangular table with first-row headers and resolved scalars. |

Table import reads boolean literals. It is not a workbook round-trip API. See the [fidelity table](/docs/import-export/xlsx-export/#workbook-interchange) for supported workbook state.

Workbook formulas import as source. `SheetwriteStore.fromSnapshot` recompiles them into the selected formula engine; no raw handles enter the serialized snapshot. Import also keeps eligible [opaque parts](/docs/import-export/kept-parts-and-round-trips/).

## Warnings

`onWarning` receives `XlsxWorkbookWarning` with `code`, `message`, and optional `sheet`, `cell` and `part`. Rich-text flattening uses `rich-text`; unsupported conditional rules use `format-loss`; dropped unmodelled features use structured warnings such as `unsupported-feature`. Do not assume that a successful import was lossless.

Supported native hyperlinks, conditional formats, tables, validation and notes are not all dropped merely because a file lacks Sheetwrite metadata. Unsupported content still produces warnings. The [checked compatibility results](/docs/reference/compatibility-results/) distinguish evaluated, preserved, flattened, warning and unsupported behavior by file and producer.

## Hyperlinks

Hyperlinks retain stable IDs in Sheetwrite metadata. Internal targets use stable sheet IDs: a sheet rename does not retarget a link. Removing the destination atomically removes inbound links; undo restores them with the sheet. Activation of stale host-held targets fails closed.

External mutation and activation allow only absolute `https://` and `mailto:` targets. `javascript:`, `data:`, `file:`, HTTP, credentials, malformed URLs and internal OOXML relationship traversal are rejected before document mutation or activation.

Sheetwrite never calls `window.open`. Ctrl/Meta-click and `grid.activateHyperlink()` emit `hyperlink-activate` with a validated target. Set `hyperlinkActivation: "internal-navigation"` to also navigate internal targets, or `"disabled"` to suppress activation.

## Conditional formats

Rules run in array order. Earlier rules have style precedence. A matching `stopIfTrue` blocks later rules from the main/Worker match mask. Formula predicates are anchored at the rule range's top-left: relative A1 references move per cell; `$`-absolute components stay fixed.

A sheet supports at most 32 rules (the renderer's deterministic `u32` mask). One predicate formula is limited to 8,192 characters. SpreadsheetML `cellIs`, blank/text and expression rules round-trip with priority and stop behavior. Color scales, data bars, icon sets and unrepresentable differential styles enter neither the live model nor the renderer. Import emits a deterministic `format-loss` warning naming the dropped rule kind.

## Options and limits

Every import path uses `XlsxWorkbookOptions`. Missing registration and codec errors reject with `SheetwriteError`; resource errors remain `XlsxResourceError` and satisfy `isSheetwriteError`. Read error `code` rather than matching installation text. Use [bounded resource options](/docs/import-export/large-files-and-streaming/#resource-limits), including cancellation, for untrusted files.

## See also

- [XLSX export](/docs/import-export/xlsx-export/)
- [Large files and streaming](/docs/import-export/large-files-and-streaming/)
- [LibreOffice compatibility](/docs/import-export/libreoffice-compatibility/)
