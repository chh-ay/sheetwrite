---
title: XLSX and export
description: Register the optional XLSX backend and choose table or workbook interchange deliberately.
---

CSV and TSV remain core-only. XLSX is optional so normal grid and framework bundles do not pull spreadsheet-file dependencies into their initial graph.

```sh verify title="Install the optional XLSX backend"
bun add @sheetwrite/xlsx
```

Register it once before invoking grid XLSX actions or the core workbook/table functions:

```ts prelude="core" partial="requires an initialized grid" title="Register and export"
import "@sheetwrite/xlsx/register";

await grid.exportXlsx("sales.xlsx");
```
All four optional XLSX functions are asynchronous. Missing registration and
codec failures reject with `SheetwriteError`; use `code` rather than matching
the installation message. Resource failures remain `XlsxResourceError`
instances and therefore also satisfy `isSheetwriteError`.


## Table interchange

`toXlsxTable` and `fromXlsxTable` exchange the active rectangular table. They deliberately reduce scope and fidelity — one sheet, synthesized headers, resolved scalars instead of formula source. CSV output is UTF-8 with a BOM and CRLF line endings and prefixes injection-sensitive leading characters in string values.

## Streaming

`toCsvStream`, `toTsvStream`, `toXlsxTableStream` and `toXlsxWorkbookStream` return a `ReadableStream<Uint8Array>` that produces the file in bounded chunks, honours backpressure and stops reading the store when the reader cancels. Existing string and `Uint8Array` functions keep working. XLSX streams contain the same parts, but ZIP entry order and container bytes may differ from buffered output. `fromXlsxWorkbookFile` imports a `File` or `Blob` without first buffering it. Both import paths keep the ZIP directory and parse each worksheet incrementally from bounded inflated chunks, so no whole worksheet string or XML tree is held; the resulting snapshot still holds every imported cell.

## Workbook interchange

`toXlsxWorkbook` and `fromXlsxWorkbook` preserve supported worksheets, formula source, styles, merges, dimensions, frozen panes, names, HTTPS/mailto and internal range hyperlinks, ordered conditional formats, table autofilter rules, sort state, calculated-column formulas and totals-row functions, and Sheetwrite metadata. Unsupported Excel features are never silently flattened: every dropped native feature is reported through the structured `onWarning` callback (`XlsxWorkbookWarning`), and callers must surface warnings when fidelity matters.

### Parts Sheetwrite does not model

Import keeps the parts Sheetwrite does not edit in `snapshot.workbook.xlsxSource`, so opening and saving a file does not remove them. Each part is kept as its original compressed ZIP payload and written back byte for byte, without recompression. Verification inflates bounded chunks and discards them; only relationships are parsed. Only opaque parts are kept — never worksheet XML. The payload is base64-encoded for JSON-safe persistence, costing about four thirds of its compressed size, plus bounded graph metadata.

| Kept part graph | Kept on save when |
| --- | --- |
| VBA project (`.xlsm`), customXml items, XML maps, data connections, theme, core and custom document properties | Always. They do not read cells. A macro workbook keeps its macro content type. |
| Images and other drawings without charts, single-cell XML tables | Their sheet still exists and no row or column was inserted, removed or moved, resized, hidden or merged on it. |
| Charts and pivot tables (with their caches) | No cell on any sheet changed, no sheet was renamed or removed, and no defined name changed. |

Everything else is dropped with a warning: parts reached through a relationship into a worksheet, table, styles or the workbook part (Sheetwrite rewrites those), external links, chart sheets, digital signatures, and kept parts beyond `maxPreservedBytes` (64 MiB of compressed data by default).

Relationships and content types stay valid: kept parts keep their names and their own `.rels` parts unchanged, the workbook, sheets and package get new relationship ids pointing at them, pivot caches are re-listed in `workbook.xml`, and each kept part gets its content-type override. A graph whose relationships point outside the kept parts is dropped.

A `SheetwriteStore` (and a `Grid` over one) drops a graph when the edit that invalidates it commits. This costs nothing per cell. Undo does not bring a dropped graph back, because the original package is not kept. A `WorkbookSnapshot` passed directly has no edit history, so the backend compares a 64-bit fingerprint of each sheet's source values with the import fingerprint; this reads every cell once (O(cells)) and drops a graph on a difference. Import and store hydration verify payload CRCs and sizes by inflating bounded chunks and discarding them. Hydration also checks that source values still match their fingerprints before enabling edit-time pruning. Verification is cached per immutable part object in process memory, never serialized. Direct external snapshots are checked on save. Corrupt payloads drop their graphs with warnings. `xlsxSource` objects are frozen and shared between snapshots of one store; clone them before changing them.

Both directions keep the workbook representation in memory; use the streaming functions above for large files.

Hyperlinks retain stable IDs in Sheetwrite metadata. Internal destinations use stable sheet IDs, so a sheet rename does not retarget the link; removing the destination removes inbound links atomically, and undo restores them with the sheet. Activation of any stale host-held target still fails closed. External mutation and activation accept only absolute `https://` and `mailto:` targets. `javascript:`, `data:`, `file:`, HTTP, credentials, malformed URLs, and internal OOXML relationship traversal are rejected before document mutation or host activation. Sheetwrite never calls `window.open`: Ctrl/Meta-click and `grid.activateHyperlink()` emit `hyperlink-activate` with a validated target. Set `hyperlinkActivation: "internal-navigation"` to additionally navigate internal targets, or `"disabled"` to suppress activation.

Conditional rules are evaluated in array order. Earlier rules have style precedence, and a matching `stopIfTrue` prevents later rules from entering the main/Worker match mask. Formula predicates are anchored at the rule range's top-left: relative A1 references move per target cell while `$`-absolute components stay fixed. One sheet admits at most 32 rules (the deterministic `u32` renderer mask), and one predicate formula is limited to 8,192 characters. SpreadsheetML `cellIs`, blank/text, and expression rules round-trip with priority and stop behavior. Color scales, data bars, icon sets, and unrepresentable differential styles remain in neither the live model nor the renderer; import emits a deterministic `format-loss` warning naming the exact dropped rule kind.

The [detailed compatibility results](/docs/reference/compatibility-results/) distinguish evaluated, preserved, flattened, warning, and unsupported behavior by checked test file and producing application.

## Resource limits

Every table and workbook path shares one resource contract, `XlsxWorkbookOptions`:

- `maxCells` bounds logical accepted cells and defaults to `1_000_000`;
- `resourceLimits` overrides the remaining bounded dimensions, checked before decompression and allocation: input bytes (32 MiB), output bytes (128 MiB), archive entries (1,024), per-entry uncompressed bytes (64 MiB), total uncompressed bytes (256 MiB), kept unmodelled part bytes (64 MiB compressed), compression ratio (×100), sheets (256), rows per sheet (1,048,576), columns per sheet (16,384), merges (100,000), shared strings (1,000,000), style records (65,536), XML elements (2,000,000), XML depth (64), XML attributes per element (128), and XML text bytes (16 MiB);
- `signal` aborts between bounded codec stages.

Crossing any bound rejects with a typed `XlsxResourceError` naming the resource, limit, and observed value — before the codec allocates unsafe data. The defaults are exported as `DEFAULT_XLSX_RESOURCE_LIMITS`.

The optional package implements a bounded OOXML subset internally over one audited compression primitive (`fflate`). Load `@sheetwrite/xlsx/register` on the path that needs XLSX rather than in every application entry.

- [Data operations and XLSX compatibility](/docs/guides/data-operations/#xlsx-compatibility)
- [`@sheetwrite/xlsx` API](/docs/api/xlsx/)
- [`@sheetwrite/xlsx/register` API](/docs/api/xlsx-register/)
- [`toXlsxWorkbook`](/docs/api/core/to-xlsx-workbook/)
