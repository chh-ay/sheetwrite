---
title: XLSX export
description: Download an active-sheet table or save a workbook with formulas and supported formatting.
---

```ts prelude="core" partial="requires an initialized grid" title="Download the active table"
import "@sheetwrite/xlsx/register";

await grid.exportXlsx("sales.xlsx");
```

For columns named Customer and Total with one row `Ada, 120`, the table file opens as:

<div class="sw-grid-result" data-caption="sales.xlsx: synthesized headers, then data">

| Customer | Total |
| --- | --- |
| Ada | 120 |

</div>

[Try it live: export the workbook](/showcases/interoperability/#xlsx).

<details>
<summary>Full setup</summary>

Install the optional package on the path that needs XLSX:

```sh verify title="Install XLSX"
npm install @sheetwrite/xlsx
```

Use the workbook API to save an existing store without adding a header row:

```ts prelude="core" partial="requires an initialized store" title="Save all sheets and observe warnings"
import { downloadBytes, toXlsxWorkbook } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

const bytes = await toXlsxWorkbook(store.exportSnapshot(), {
  maxCells: 250_000,
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
downloadBytes(bytes, "workbook.xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
```

</details>

## Table interchange

`toXlsxTable(workbook, store, options?)` returns `Promise<Uint8Array>`. `grid.exportXlsx` uses this contract: active sheet only, synthesized first-row column headers, and resolved scalars instead of formula source. Styles, borders, number/date formats, merges, column widths and row heights are preserved on active-sheet export. Frozen panes, active worksheet state and names are not table round-trip state.

## Workbook interchange

`toXlsxWorkbook(snapshot, options?)` returns `Promise<Uint8Array>` from the same `WorkbookSnapshot` used by persistence. It does not synthesize a header row.

| Feature | Workbook result |
| --- | --- |
| Worksheets, order and active sheet | Preserved. |
| Formula source, including cross-sheet formulas | Preserved; requests full recalculation on open. |
| Styles, borders, number/date formats, merges, dimensions and frozen panes | Preserved. |
| Named ranges and native booleans | Preserved. |
| HTTPS/mailto and internal range hyperlinks | Preserved, with stable IDs in Sheetwrite metadata. |
| Supported ordered conditional formats | Native rules preserve priority and stop behavior. |
| Tables | Autofilter rules, sort state, calculated-column formulas and totals-row functions round-trip. |
| Validation | Sheetwrite metadata preserved; supported list/numeric/date/text-length rules also emit native Excel validation. |
| Protected ranges | Metadata preserved; no Excel sheet-protection claim is made. |
| Cell notes | Metadata preserved and native Excel notes emitted. |
| Row groups | Preserved in metadata and emitted as native row outlines with hidden/collapsed state; native outline depth is capped at seven. |
| Rich text | Display text preserved; structured warnings report flattening. |
| Unmodelled package parts | [Kept under explicit edit rules](/docs/import-export/kept-parts-and-round-trips/), not automatically discarded. |

Every dropped native feature is reported through `onWarning` (`XlsxWorkbookWarning`). Surface these warnings when fidelity matters. [Import limits and conditional-rule support](/docs/import-export/xlsx-import/#conditional-formats) describe the supported subset.

## Errors and built-in actions

`grid.exportXlsx(...)` rejects on missing registration or encoding failure and preserves the backend error. The four buffered table/workbook import/export functions are asynchronous. Missing registration and codec failures reject with `SheetwriteError`; inspect `code`, not the installation message. Resource failures remain `XlsxResourceError` instances and satisfy `isSheetwriteError`.

Built-in toolbar and context-menu actions show an alert and emit one `export-error` event with `{ format: "csv" | "xlsx", error }`:

```ts prelude="core" partial="requires an initialized grid" title="Observe built-in failures"
grid.on("export-error", ({ format, error }) => {
  console.error(`${format} export failed`, error);
});
```

`grid.actions.exportXlsx()` returns a promise that resolves after the command finishes, including when export fails. Built-in buttons ignore repeated starts for the same pending command and show a busy state.

## XLSX backends

Core and framework entry points do not resolve the optional codec. Register it before invoking XLSX functions or framework toolbar actions. A missing backend error names both remedies: install `@sheetwrite/xlsx`, then import `@sheetwrite/xlsx/register`.

The root `@sheetwrite/xlsx` entry is side-effect free. Its `./register` entry registers idempotently. Explicit registration and individual backend composition are also public:

```ts compile title="Explicit backend registration"
import {
  registerXlsxBackends,
  sheetwriteTableExportBackend,
  sheetwriteTableImportBackend,
  sheetwriteWorkbookBackend,
} from "@sheetwrite/xlsx";
import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
} from "@sheetwrite/core";

registerXlsxBackends();
// Or register the roles individually when composing backends.
setXlsxTableExportBackend(sheetwriteTableExportBackend);
setXlsxTableImportBackend(sheetwriteTableImportBackend);
setXlsxWorkbookBackend(sheetwriteWorkbookBackend);
```

Hosts can implement `XlsxWorkbookBackend`, `XlsxTableExportBackend`, or `XlsxTableImportBackend` to replace a role. `@sheetwrite/xlsx` is the only concrete implementation package. Its bounded OOXML codec owns OPC part resolution, XML tokenization, styles and worksheet mapping over the audited compression primitive `fflate`.

## Options and limits

All XLSX paths share `XlsxWorkbookOptions`: `maxCells`, `resourceLimits`, `signal` and `onWarning`. See [resource limits and streaming](/docs/import-export/large-files-and-streaming/#resource-limits) before increasing a budget. Buffered export holds its output in memory.

## See also

- [XLSX import](/docs/import-export/xlsx-import/)
- [CSV and TSV](/docs/import-export/csv-and-tsv/)
- [Detailed compatibility evidence](/docs/reference/compatibility-results/)
- [`@sheetwrite/xlsx` API](/docs/api/xlsx/)
- [`@sheetwrite/xlsx/register` API](/docs/api/xlsx-register/)
- [`toXlsxWorkbook`](/docs/api/core/to-xlsx-workbook/)
