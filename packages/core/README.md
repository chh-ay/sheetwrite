# @sheetwrite/core

The imperative Sheetwrite engine for vanilla applications and advanced framework consumers.

## Install

```sh
npm install @sheetwrite/core   # or: pnpm add, yarn add, bun add
```

`@sheetwrite/wasm` is a runtime dependency and does not need to be installed separately.

## Usage

```ts
import { createGrid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";

await initSheetwrite();

const workbook: Workbook = {
  activeSheet: "sheet1",
  sheets: [
    {
      id: "sheet1",
      name: "Products",
      rowCount: 2,
      columns: [
        { key: "name", header: "Name", width: 180, type: "text" },
        { key: "price", header: "Price", width: 100, type: "currency" },
      ],
    },
  ],
};

const grid = createGrid(document.querySelector("#grid")!, {
  workbook,
  data: {
    rowCount: 2,
    columns: { name: ["Notebook", "Pen"], price: [12.5, 2.25] },
  },
});
```

`initSheetwrite()` is re-entrant: concurrent calls share initialization, failures can be retried, and successful repeats are no-ops. Pass an explicit `BufferSource | URL | string | Request | WebAssembly.Module` only when controlling asset delivery for an unsupported or unusually configured bundler.

Framework users should normally install only `@sheetwrite/react`, `@sheetwrite/vue`, or `@sheetwrite/svelte` and import that package's `styles.css`; the adapters initialize WASM automatically.

## New in 0.6.0

- **Ribbon.** Set `config.ribbon: true`, or `ribbon: true` in the shell, to get an Excel-style ribbon with Home, Insert, Data and View tabs. Groups shrink, then fold into dropdowns, as the grid narrows. The ribbon loads as its own chunk, so grids without a ribbon do not download it. New `GridActions` include `setBorders`, `setFontFamily`, `setNumberFormat`, `mergeAndCenter`, `autoSum` and `freezePanes`. See [Toolbar and ribbon](https://sheetwrite.vercel.app/docs/features/grid/toolbar-and-ribbon/).
- **Status bar.** `grid.summarizeSelection(signal?)` returns Count, Sum, Average, Min and Max for the selected cells that the user can see. It reads in bounded chunks between frames, and an `AbortSignal` cancels it. The shell status line shows Average, Count and Sum. The shell name box also accepts ranges such as `B2:D9`. See [Status bar](https://sheetwrite.vercel.app/docs/features/grid/status-bar/).
- **Formulas.** Both engines add volatile recalculation, `RAND`, `RANDBETWEEN`, `FORMULATEXT`, `ISFORMULA`, `HYPERLINK`, `CELL`, `OFFSET`, `INDIRECT` and `AREAS`, plus intersection, union and 3-D references. The undoable `setCalculation` document operation sets `{ iterate, maxIterations, maxChange }`; snapshots store it as `workbook.calculation`. See [Volatile functions](https://sheetwrite.vercel.app/docs/features/formulas/volatile-functions/), [Operators](https://sheetwrite.vercel.app/docs/features/formulas/operators/) and [Iterative calculation](https://sheetwrite.vercel.app/docs/features/formulas/iterative-calculation/).
- **Streaming export.** `toCsvStream` and `toTsvStream` return a `ReadableStream<Uint8Array>`. The XLSX streams need `@sheetwrite/xlsx`. See [Large files and streaming](https://sheetwrite.vercel.app/docs/import-export/large-files-and-streaming/).
- **Undo and sync.** Large undo restores packed engine snapshots without expanding them into JavaScript arrays. History keeps at most 200 entries and 256 MiB of reported range-snapshot bytes; the newest entry always stays undoable. This is not a total memory cap. A `SyncCoordinator` commit no longer scans the pending queue. See [Editing and clipboard](https://sheetwrite.vercel.app/docs/features/grid/editing-and-clipboard/) and [Collaboration](https://sheetwrite.vercel.app/docs/features/collaboration/).

## Full formula engine

The default engine, `@sheetwrite/wasm`, has the standard functions and the smaller download. For analysis functions such as `GROUPBY`, `PIVOTBY`, `LAMBDA`, statistics, regression, and finance, install `@sheetwrite/formulas` and select it before you create a grid or store:

```ts
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

See [Choose an engine](https://sheetwrite.vercel.app/docs/start/choose-an-engine/) and the [function reference](https://sheetwrite.vercel.app/docs/reference/formula-functions/) for the functions in each engine.

## Optional XLSX support

Core includes CSV/TSV and the backend-neutral canonical XLSX contracts, but no
Excel library or concrete XLSX implementation. Install and register the
optional package before `grid.exportXlsx()`, a framework toolbar XLSX action,
or any table/workbook XLSX function:

```sh
npm install @sheetwrite/xlsx
```

```ts
import "@sheetwrite/xlsx/register";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";
```

The table APIs exchange the first sheet with a synthesized header row. The
workbook APIs preserve multi-sheet `WorkbookSnapshot` semantics and use an
in-memory backend with a default 1,000,000-populated-cell limit. Without
registration, each core XLSX function throws an error telling the caller to
install `@sheetwrite/xlsx` and import `@sheetwrite/xlsx/register`.

Workbook import and export also keep unmodeled XLSX parts within resource limits.
Cell edits drop kept charts and pivot tables with a warning. Structural edits
drop affected images. Streamed XLSX output and `Blob` workbook input are available.
See [Kept parts and round trips](https://sheetwrite.vercel.app/docs/import-export/kept-parts-and-round-trips/)
and [Large files and streaming](https://sheetwrite.vercel.app/docs/import-export/large-files-and-streaming/).
