# @sheetwrite/xlsx

Optional deterministic OOXML table and workbook backends for `@sheetwrite/core`. Core does not depend on this package. It uses the pinned `fflate` codec for bounded ZIP processing.

## Install and register

```sh
npm install @sheetwrite/core @sheetwrite/xlsx
```

Register once before calling any core XLSX function or `grid.exportXlsx()`:

```ts
import "@sheetwrite/xlsx/register";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";
```

The registration entry is idempotent. Importing `@sheetwrite/xlsx` itself is side-effect free. Explicit composition is available through `registerXlsxBackends()`, `sheetwriteWorkbookBackend`, `sheetwriteTableImportBackend`, and `sheetwriteTableExportBackend`.

Without registration, core XLSX functions identify the missing optional package. CSV and TSV do not require this package.

## Table and workbook APIs

- `toXlsxTable(workbook, store, options)` and `fromXlsxTable(bytes, options)` exchange the active or first sheet with a first-row header. Table conversion is in-memory and intentionally reduced-fidelity.
- `toXlsxWorkbook(snapshotOrGrid, options)` and `fromXlsxWorkbook(bytes, options)` preserve multiple sheets, formula source, supported styles and number formats, validations, notes, merges, dimensions, frozen panes, named ranges, and versioned Sheetwrite metadata.
- **Charts.** Workbook import reads Excel column, bar, line, area, pie, doughnut and scatter charts into `Sheet.charts`, and export writes `Sheet.charts` as Excel chart parts. See [Charts in XLSX files](https://www.sheetwrite.dev/docs/features/analysis/charts/#charts-in-xlsx-files).

See [XLSX import](https://www.sheetwrite.dev/docs/import-export/xlsx-import/) and [XLSX export](https://www.sheetwrite.dev/docs/import-export/xlsx-export/).

## New in 0.6.0

- **Kept parts.** Workbook import and export keep unmodeled charts, pivot tables, images, VBA and other package parts as compressed bytes in `WorkbookSnapshot.workbook.xlsxSource`. Cell edits drop kept charts and pivots with a warning; structural edits drop affected images. `maxPreservedBytes` defaults to 64 MiB; graphs over the limit are dropped with a warning. Table autofilter rules, sort state, calculated-column formulas and totals-row functions also round-trip. See [Kept parts and round trips](https://www.sheetwrite.dev/docs/import-export/kept-parts-and-round-trips/).
- **Streaming.** `toXlsxTableStream` and `toXlsxWorkbookStream` return a `ReadableStream<Uint8Array>`. `fromXlsxWorkbookFile` imports a `Blob` without buffering every part. Import parses each worksheet from bounded chunks, so its peak memory is lower. See [Large files and streaming](https://www.sheetwrite.dev/docs/import-export/large-files-and-streaming/).
- **Formulas and calculation.** Import reads `iterate`, `iterateCount` and `iterateDelta` from `<calcPr>`, and export writes them. Formulas with intersection, union and 3-D references stay as Excel text.
- **LibreOffice round trip.** Import and export fixes cover vertical alignment, column widths, automatic row heights and hyperlink text and styles. Imported cells without vertical alignment now sit at the bottom, as in Excel. LibreOffice 26.8 round-trip results record producer differences separately; they do not establish full Excel or Google Sheets compatibility. See [LibreOffice compatibility](https://www.sheetwrite.dev/docs/import-export/libreoffice-compatibility/).

## Limits and safety

Every path shares `XlsxWorkbookOptions`. `maxCells` defaults to 1,000,000 logical cells. `resourceLimits` can lower bounds for compressed input, generated output, archive entries, compression ratio, individual and aggregate inflated bytes, sheets, rows, columns, merges, shared strings, styles, XML elements, XML depth, attributes, and text nodes. Invalid overrides fail before codec work; exceeded bounds throw `XlsxResourceError`. `signal` is checked before and between bounded operations. Unsupported content is dropped only with a structured `onWarning` notification.

The reader preflights the complete ZIP central directory and OPC relationship graph before inflating referenced parts. DTDs and custom XML entities are rejected. Applications accepting untrusted files should set host-specific limits lower than the defaults when appropriate.

Framework toolbar XLSX actions call the core backend contract. Applications enabling those actions must register this package explicitly or lazily import `@sheetwrite/xlsx/register` immediately before use.
