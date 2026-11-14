---
title: Kept parts and round trips
description: Keep eligible unmodelled XLSX parts as original compressed bytes and surface losses after edits.
---

```ts prelude="core" partial="bytes contains an imported XLSX or XLSM file" title="Open and save without edits"
import { fromXlsxWorkbook, toXlsxWorkbook, initSheetwrite } from "@sheetwrite/core";
import { xlsxAddon } from "@sheetwrite/xlsx";

await initSheetwrite({ addons: [xlsxAddon()] });

declare const bytes: Uint8Array;
const options = {
  onWarning: (warning: import("@sheetwrite/core").XlsxWorkbookWarning) =>
    console.warn(warning.code, warning.message),
};
const snapshot = await fromXlsxWorkbook(bytes, options);
const saved = await toXlsxWorkbook(snapshot, options);
console.log(snapshot.workbook.xlsxSource?.graphs.length ?? 0);
```

The saved workbook retains its modelled cells. Eligible charts, pivots, images and macros travel alongside them as opaque package parts, not as flattened cell values. Charts that the chart model can hold are not kept parts: import reads them into `Sheet.charts`, edits keep them, and export writes them again. See [Charts in XLSX files](/docs/features/analysis/charts/#charts-in-xlsx-files).

| Operation | Result for a kept chart graph (a chart that the chart model cannot hold) |
| --- | --- |
| Open → save, no edits | Original compressed payload retained. |
| Change a cell → save | Graph dropped; structured warning reports loss. |
| Undo that cell edit → save | Dropped graph is not restored. |

[Try it live: workbook round-trip and warnings](/showcases/interoperability/#xlsx).

<details>
<summary>Full setup</summary>

Use the [complete import setup](/docs/import-export/xlsx-import/) to obtain a snapshot, or read bytes from a host file input. Keep the imported snapshot's `workbook.xlsxSource` when persisting it. The source is JSON-safe; no separate original file is required for eligible parts.

```ts compile title="Round-trip a host-selected file"
import { fromXlsxWorkbookFile, toXlsxWorkbook, initSheetwrite } from "@sheetwrite/core";
import { xlsxAddon } from "@sheetwrite/xlsx";

await initSheetwrite({ addons: [xlsxAddon()] });

const input = document.querySelector<HTMLInputElement>('input[type="file"]');
const file = input?.files?.[0];
if (!file) throw new Error("Choose an XLSX or XLSM file first");
const snapshot = await fromXlsxWorkbookFile(file, {
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
const saved = await toXlsxWorkbook(snapshot, {
  onWarning: (warning) => console.warn(warning.code, warning.message),
});
console.log(saved.byteLength);
```

</details>

## Parts Sheetwrite does not model

Import stores eligible parts in `snapshot.workbook.xlsxSource`. Each part keeps its original compressed ZIP payload and is written back byte for byte without recompression. Only opaque parts are kept, never worksheet XML. Verification inflates bounded chunks and discards them; only relationships are parsed.

The payload is base64-encoded for JSON-safe persistence: about four thirds of its compressed size, plus bounded graph metadata.

| Kept part graph | Kept on save when |
| --- | --- |
| VBA project (`.xlsm`), customXml items, XML maps, data connections, theme, core and custom document properties | Always: they do not read cells. Macro workbooks retain the macro content type. |
| Images and other drawings without charts, single-cell XML tables | Their sheet still exists and no row or column on it was inserted, removed, moved, resized, hidden or merged. |
| Charts that the chart model cannot hold, and pivot tables, with their caches | No cell on any sheet changed, no sheet was renamed or removed, and no defined name changed. |

Shared parts such as a pivot and its cache form one graph: they are kept or dropped together.

A drawing that holds both charts that Sheetwrite reads and other objects is split. The charts go to `Sheet.charts`, and the kept drawing keeps only the other anchors. On export, Sheetwrite charts go into the sheet's kept drawing, because a worksheet has only one drawing.

Power Query parts (the `DataMashup` customXml item and `xl/connections.xml`)
hold saved query definitions. They are kept only while `workbook.queries` is
unchanged since import. If a query was added, edited or removed, the kept M
would be stale. Export then drops these parts, writes output tables as values,
and reports a `query-loss` warning. With a Power Query codec, export writes new
parts for the current queries instead. See
[Power Query in XLSX](/docs/features/data/data-operations/#power-query-in-xlsx).

## Drops and warnings

Parts reached through a relationship into worksheet, table, styles or workbook parts are dropped because Sheetwrite rewrites those parts. External links that are not workbooks (DDE and OLE links), chart sheets, digital signatures and graphs whose relationships point outside the kept parts are also dropped with warnings.

`resourceLimits.maxPreservedBytes` defaults to 64 MiB of compressed data. A graph over this kept-part budget is dropped with a warning rather than making preservation unbounded. This is distinct from hard input/decompression resource failures.

Kept parts retain their names and their own `.rels` bytes. New workbook, sheet and package relationship IDs point at them. Pivot caches are re-listed in `workbook.xml`; each kept part receives its content-type override. Relationship and content-type validity does not mean the graph is editable in Sheetwrite.

### Excel data model

Excel keeps its data model in a binary part (`powerPivotData`, [MS-XLDM]) that Sheetwrite does not read or write. Import drops that part with a warning, and reads the model's active relationships from `x15:dataModel` in `workbook.xml` ([MS-XLSX] 2.6.128–2.6.132). A relationship whose two model tables load worksheet tables becomes a [data model](/docs/features/analysis/data-model/) relationship; each other relationship is reported. Sheetwrite relationships and pivots over related tables round-trip through Sheetwrite metadata. Excel opens an exported file without a data model. A pivot that export keeps in Sheetwrite metadata, such as a pivot over the data model, is written as the cells of its current output with its number formats, so Excel shows the values; on import, Sheetwrite removes those cells and shows the live pivot again, and keeps any of them that another application changed.

## Edits, undo and snapshots

A `SheetwriteStore`, or a `Grid` over one, drops a graph when an invalidating edit commits. It adds no per-cell cost. Undo cannot restore the graph because the original package is not retained.

A directly passed `WorkbookSnapshot` has no edit history. The backend compares each sheet's source values against its import-time 64-bit fingerprint. This reads all cells once, O(cells), and a difference drops the dependent graph.

Import and store hydration verify payload CRCs and sizes by inflating and discarding bounded chunks. Hydration also checks source values against fingerprints before enabling edit-time pruning. Verification is cached per immutable part object in process memory, never serialized. Direct external snapshots are checked on save. Corrupt payloads drop their graphs with warnings.

`xlsxSource` objects are frozen and shared between snapshots from one store. Clone them before changing them.

## See also

- [XLSX import](/docs/import-export/xlsx-import/)
- [XLSX export](/docs/import-export/xlsx-export/)
- [LibreOffice comparison limits](/docs/import-export/libreoffice-compatibility/#what-the-comparison-proves)
- [Resource limits](/docs/import-export/large-files-and-streaming/#resource-limits)
