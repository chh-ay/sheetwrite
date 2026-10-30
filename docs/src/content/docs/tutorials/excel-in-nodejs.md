---
title: Excel in Node.js
description: Read real XLSX file bytes and save a workbook snapshot on the server without a DOM.
---

```ts prelude="xlsx" partial="Node file paths and options are declared in Full setup"
import { readFile, writeFile } from "node:fs/promises";
import { fromXlsxWorkbook, toXlsxWorkbook, type XlsxWorkbookOptions } from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

declare const source: string;
declare const destination: string;
declare const options: XlsxWorkbookOptions;

const snapshot = await fromXlsxWorkbook(await readFile(source), options);
await writeFile(destination, await toXlsxWorkbook(snapshot, options), { flag: "wx" });
```

<div class="sw-grid-result" data-caption="Result: a one-sheet input containing these cells produces a one-sheet output with the same supported cell values">

| Item | Amount |
| --- | --- |
| Tea | 12 |
| Coffee | 18 |

</div>

For this input the command prints `Saved 1 sheet(s) to output.xlsx`. This is a workbook conversion, not an image or a browser download.

[Try it live → Browser spreadsheet showcase](/showcases/spreadsheet/)

The live showcase is a browser counterpart. Run the command below for the Node file-system path.

<details>
<summary>Full setup</summary>

In a Node.js TypeScript project, install the codec and a TypeScript runner:

```sh verify
npm install @sheetwrite/core @sheetwrite/xlsx
npm install --save-dev tsx @types/node
```

Save as `roundtrip.mts`. The `.mts` extension selects ESM so the entry can use top-level `await`.

```ts prelude="xlsx" partial="complete Node entry; requires Node types, ESM and top-level await"
import { readFile, writeFile, stat } from "node:fs/promises";
import {
  fromXlsxWorkbook, toXlsxWorkbook, isSheetwriteError,
  type XlsxWorkbookOptions,
} from "@sheetwrite/core";
import "@sheetwrite/xlsx/register";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: roundtrip.mts input.xlsx output.xlsx");
if (source === destination) throw new Error("Choose a separate output path");
const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
const options: XlsxWorkbookOptions = {
  signal: controller.signal,
  maxCells: 100_000,
  resourceLimits: { maxInputBytes: 8 * 1024 * 1024 },
  onWarning: (warning) => console.warn(`${warning.code}: ${warning.message}`),
};
try {
  if ((await stat(source)).size > 8 * 1024 * 1024) throw new Error("Input exceeds 8 MiB");
  const snapshot = await fromXlsxWorkbook(await readFile(source), options);
  const output = await toXlsxWorkbook(snapshot, options);
  if (controller.signal.aborted) throw new Error("Cancelled");
  await writeFile(destination, output, { flag: "wx" });
  console.log(`Saved ${snapshot.sheets.length} sheet(s) to ${destination}`);
} catch (error) {
  console.error(isSheetwriteError(error) ? `${error.code}: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", cancel);
}
```

Supply an existing XLSX file and a new output path:

```sh verify
npx tsx roundtrip.mts input.xlsx output.xlsx
```

</details>

## Server ownership and errors

These workbook codec functions operate on a `WorkbookSnapshot`. They do not create a Grid, initialize a formula engine, evaluate formulas, access the DOM or call `downloadBytes`. Formula source is preserved where supported, not recalculated by this script. Node's `Buffer` is a `Uint8Array`, so `readFile` bytes can go directly to `fromXlsxWorkbook`.

The script never substitutes a mock workbook. Missing or invalid files fail. `flag: "wx"` refuses to overwrite an existing output; use a separate output path. File helpers close their own file handles. The `finally` block removes the process listener, and SIGINT requests codec cancellation between bounded stages. It does not interrupt `writeFile` once that write has started.

## Options and resource limits

| Option | Effect in this command |
| --- | --- |
| `maxCells: 100_000` | Rejects inputs or outputs beyond this accepted-cell budget. |
| `maxInputBytes: 8 * 1024 * 1024` | Bounds codec input bytes; the pre-read size check avoids reading an already oversized file. |
| `onWarning` | Prints structured fidelity losses instead of hiding them. |
| `signal` | Requests cancellation before or between codec stages. |

The stat check is not a security boundary for a file another process can modify. The codec also checks the bytes it actually receives. ZIP expansion, entry count, compression ratio and XML depth retain their default limits. `XlsxResourceError` also satisfies `isSheetwriteError`; report its stable code and resource details rather than parsing a message.

Buffered import holds input bytes and the resulting snapshot; buffered export also holds output bytes. Streaming workbook export can bound output chunks, but it does not make the snapshot disappear. Do not promise constant-memory processing for large workbooks. See [streaming](/docs/import-export/large-files-and-streaming/#streaming-functions) and [kept-part rules](/docs/import-export/kept-parts-and-round-trips/#parts-sheetwrite-does-not-model) before using this as a fidelity-sensitive round trip. An unchanged chart or pivot graph can be kept; that is not a chart-authoring or pivot-calculation API.
