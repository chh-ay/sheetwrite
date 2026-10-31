---
title: Large files and streaming
description: Read seekable files and write bounded chunks while retaining explicit XLSX resource limits.
---

```ts prelude="core" partial="requires an initialized store and a host-owned WritableStream<Uint8Array> named destination" title="Stream a workbook to a destination"
import { toXlsxWorkbookStream } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

declare const destination: WritableStream<Uint8Array>;
const controller = new AbortController();
await toXlsxWorkbookStream(store.exportSnapshot(), {
  signal: controller.signal,
  onWarning: (warning) => console.warn(warning.code, warning.message),
}).pipeTo(destination);
```

| Output | Result |
| --- | --- |
| Destination receives bytes | Bounded `Uint8Array` chunks, not one complete file buffer. |
| Destination slows down | Backpressure slows the producer. |
| Reader cancels | Export stops reading the store. |
| `controller.abort(reason)` | The stream errors with `reason` at the next ZIP entry, worksheet or chunk of cells. |

The output contains the same XLSX parts as buffered export. ZIP entry order and container bytes can differ.

[Try it live: resource-limit failures](/showcases/interoperability/#limits). The lab demonstrates typed limits, not a whole-file memory guarantee.

<details>
<summary>Full setup</summary>

This browser example reads a selected `File` without calling `arrayBuffer()` on the whole compressed input. Its writable consumer counts bytes instead of collecting them:

```ts compile title="Seekable import and bounded output consumption"
import { fromXlsxWorkbookFile, toXlsxWorkbookStream } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

const input = document.querySelector<HTMLInputElement>('input[type="file"]');
const file = input?.files?.[0];
if (!file) throw new Error("Choose an XLSX file first");
const options = {
  onWarning: (warning: import("@sheetwrite/core").XlsxWorkbookWarning) =>
    console.warn(warning.code, warning.message),
};
const snapshot = await fromXlsxWorkbookFile(file, options);
let outputBytes = 0;
await toXlsxWorkbookStream(snapshot, options).pipeTo(new WritableStream<Uint8Array>({
  write(chunk) { outputBytes += chunk.byteLength; },
}));
console.log(outputBytes); // Total depends on the selected workbook.
```

Replace the counting consumer with the host's actual writable destination to save bytes. Collecting chunks into a `Blob` or using `new Response(stream).arrayBuffer()` buffers the output again.

</details>

## Streaming functions

| Function | Input | Result |
| --- | --- | --- |
| `toCsvStream(sheet, store, options?)` | Visible table view | `ReadableStream<Uint8Array>`. |
| `toTsvStream(range, store, options?)` | Canonical data-space range | `ReadableStream<Uint8Array>`. |
| `toXlsxTableStream(workbook, store, options?)` | Active-sheet table | `ReadableStream<Uint8Array>`. |
| `toXlsxWorkbookStream(snapshot, options?)` | Workbook snapshot | `ReadableStream<Uint8Array>`. |
| `fromXlsxWorkbookFile(file, options?)` | Seekable `File` or `Blob` | `Promise<WorkbookSnapshot>`. |

CSV/TSV remain core-only; XLSX requires backend registration. Existing string and `Uint8Array` APIs remain available.

Both buffered and Blob XLSX import retain the ZIP directory and parse each worksheet incrementally from bounded inflated chunks. Neither builds a whole-worksheet string or XML tree. Snapshot cells are built as rows stream, with one cell representation rather than a second parsed record. The snapshot still holds **every imported cell**: streaming is not a lazy or constant-memory workbook store.

## Resource limits

Every XLSX table/workbook path shares `XlsxWorkbookOptions`:

| Option | Meaning |
| --- | --- |
| `maxCells` | Logical accepted cells; default `1_000_000`. |
| `resourceLimits` | Override specific input, archive, XML, dimension, preservation and output budgets. |
| `signal` | Checked before the work and once per ZIP entry, worksheet and chunk of XML elements or cells, never once per cell. |
| `onWarning` | Surface structured fidelity losses; one conversion reports at most 64 warnings. |

Defaults are exported as `DEFAULT_XLSX_RESOURCE_LIMITS`:

| Resource | Default |
| --- | --- |
| Input bytes | 32 MiB |
| Output bytes | 128 MiB |
| Archive entries | 1,024 |
| Per-entry uncompressed bytes | 64 MiB |
| Total uncompressed bytes | 256 MiB |
| Kept unmodelled part bytes | 64 MiB compressed |
| Compression ratio | ×100 |
| Sheets | 256 |
| Rows per sheet | 1,048,576 |
| Columns per sheet | 16,384 |
| Merges | 100,000 |
| Shared strings | 1,000,000 |
| Style records | 65,536 |
| XML elements | 2,000,000 |
| XML depth | 64 |
| XML attributes per element | 128 |
| XML text bytes | 16 MiB |

Hard resource bounds are checked before unsafe decompression or allocation. Exceeding one rejects with `XlsxResourceError`, which names the resource, limit and observed value. The [kept-part budget](/docs/import-export/kept-parts-and-round-trips/#drops-and-warnings) instead drops over-budget graphs with warnings. Do not raise limits merely to suppress failures; budget for the resulting snapshot as well as the codec.

## Abort

An abort is not a failure. After `signal` fires, every import and export call rejects (and every stream errors) with `signal.reason` itself, not with a `SheetwriteError`. CSV and TSV parsing and export do the same with `DelimitedTextOptions.signal`, checked once per 1,024 records and once per store window. An aborted import keeps no partial snapshot, and an aborted export does not change the store. Compare the rejection with the reason to tell an abort from a failure:

```ts compile title="Tell an abort from a failure"
import { fromXlsxWorkbook, isSheetwriteError } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

declare const bytes: Uint8Array;
const controller = new AbortController();
try {
  await fromXlsxWorkbook(bytes, { signal: controller.signal });
} catch (error) {
  if (error === controller.signal.reason) console.info("Import cancelled");
  else if (isSheetwriteError(error)) console.error(error.code, error.message);
  else throw error;
}
```

An XLSX error message keeps at most 8 KiB of text from the file, so a hostile part name or attribute cannot make a large error.

## Memory evidence and limits

[PR #186](https://github.com/chh-ay/sheetwrite/pull/186) measured seven interleaved fresh-process rounds per side with one CPU slot:

| Generated workbook | Import path | Peak RSS median before → after | Candidate maximum |
| --- | --- | --- | --- |
| 200,000 × 8 | Buffered | 1,095 → 800 MiB | 814 MiB |
| 200,000 × 8 | Blob | 1,112 → 779 MiB | 791 MiB |
| 1,000,000 × 8 | Buffered | 5,061 → 3,352 MiB | 3,512 MiB |
| 1,000,000 × 8 | Blob | 4,475 → 3,336 MiB | 3,504 MiB |

These are measured workloads with adjusted budgets, not default-limit promises. The later results supersede the earlier #179 import peak-risk observation; they do not establish a universal memory ceiling.

## See also

- [XLSX import](/docs/import-export/xlsx-import/)
- [XLSX export](/docs/import-export/xlsx-export/)
- [CSV and TSV](/docs/import-export/csv-and-tsv/)
- [`XlsxWorkbookOptions`](/docs/api/core/xlsx-workbook-options/)
- [`XlsxResourceLimits`](/docs/api/core/xlsx-resource-limits/)
