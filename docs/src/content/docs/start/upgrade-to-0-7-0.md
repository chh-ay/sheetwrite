---
title: Upgrade to 0.7.0
description: Replace removed APIs, accept the new document operations, keys and column type, and review the behavior that changes in 0.7.0.
---

> [!NOTE]
> 0.7.0 is the next release and is not published yet. This guide tracks the
> changes already merged for it, so an upgrade can be planned ahead.

Each section lists what changed in 0.7.0 and what replaces it. "Before" code
is 0.6 code, and "after" code is 0.7.0 code.

## Update packages together

Install 0.7.0 for every `@sheetwrite/*` package that you use. Packages from
different versions are not supported together.

## Sort

Sort commands now move the cells, as Excel's Sort does. The display-only sort
of 0.6 is called a view sort and has its own methods. See
[Sort cells in place](/docs/features/data/data-operations/#sort-cells-in-place)
and [Display views](/docs/features/data/data-operations/#display-views).

| 0.6 API | 0.7.0 |
| --- | --- |
| `grid.sortBy(col, ascending)` sorted the view | Changed: sorts the cells in place, as Excel's quick sort does. For the view sort, use `grid.setViewSort([{ col, ascending }])` |
| `grid.setSort(keys)` | Removed: use `grid.setViewSort(keys)` |
| `grid.sortByMulti(keys)` | Removed: use `grid.setViewSort(keys)` |
| `store.sortBy(sheet, col, ascending)` | Removed: use `store.setViewSort(sheet, [{ col, ascending }])` |
| `store.sortByMulti(sheet, keys)` | Removed: use `store.setViewSort(sheet, keys)` |

Before:

```js partial="0.6 code"
grid.sortBy(2, false);
grid.setSort([{ col: 2, ascending: false }, { col: 0, ascending: true }]);
store.sortByMulti("s1", [{ col: 2, ascending: false }]);
```

After, to keep the display-only sort:

```ts compile title="Sort the displayed rows"
import type { Grid, SheetwriteStore } from "@sheetwrite/core";

export function showLargestFirst(grid: Grid) {
  return grid.setViewSort([
    { col: 2, ascending: false },
    { col: 0, ascending: true },
  ]);
}

export function showLargestFirstInStore(store: SheetwriteStore) {
  return store.setViewSort("s1", [{ col: 2, ascending: false }]);
}
```

After, to move the cells as Excel does:

```ts compile title="Sort the cells"
import type { Grid } from "@sheetwrite/core";

export function sortFocusRegion(grid: Grid) {
  return grid.sortBy(2, false);
}

export function sortOrders(grid: Grid) {
  return grid.sortRange(
    { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 99, col: 3 } },
    [{ col: 2, ascending: false }],
    { hasHeader: true },
  );
}
```

An in-place sort is one undoable change, sent to collaborators as the new
`permuteRows` operation with the new `"sort"` commit reason. A server or handler that
checks every operation or commit reason must accept them; see
[Document operations](#document-operations).

## Revisions move to version history

`RevisionCoordinator` and its types are removed. Version history in
`@sheetwrite/core/history` lists, reads and restores versions through a
`HistoryStorageAdapter`. See
[Opt-in version archives](/docs/features/data/persistence/#opt-in-version-archives)
and [Restoring versions](/docs/features/collaboration/#restoring-versions).

| Removed | Use instead |
| --- | --- |
| `RevisionCoordinator`, `RevisionCoordinatorOptions`, `RevisionCoordinatorEvent` | `HistoryArchive.open({ documentId, storage })` |
| `RevisionAdapter` | `HistoryStorageAdapter`, or the built-in `MemoryHistoryStorage` and `IndexedDbHistoryStorage` |
| `RevisionAdapter.listRevisions` | `HistoryStorageAdapter` (`list`) behind `HistoryArchive.listVersions` |
| `RevisionAdapter.loadRevision` | `HistoryArchive.readVersion` |
| `RevisionAdapter.restoreRevision` | `HistoryArchive.restoreVersion`; the restore is an ordinary commit through `PersistenceAdapter.commit` or `commitBatch` |
| `RevisionCoordinator.list()`, `RevisionSummary` | `HistoryArchive.listVersions()`, which returns `HistoryVersion` pages |
| `RevisionCoordinator.preview()` | `HistoryArchive.readVersion()`, then `createGridFromSnapshot(host, snapshot, { readOnly: true })` |
| `RevisionCoordinator.restore()`, `RevisionRestoreRequest`, `RevisionRestoreResponse` | `HistoryArchive.restoreVersion(grid, id, scope, { sync })` |
| The `revision-failed` error code and the `revision` error operation | `HistoryError` codes |

A server that kept revisions as full snapshots can serve them through a
`HistoryStorageAdapter`, or start a history archive from its current snapshot
with `HistoryArchive.initialize` and record commits with `CommitJournal`.

Before:

```js partial="0.6 code"
const revisions = new RevisionCoordinator(revisionAdapter, { documentId, serverVersion });
const [latest] = await revisions.list();
const preview = await revisions.preview(previewHost, latest.version);
await revisions.restore(latest.version, crypto.randomUUID());
```

After:

```ts compile title="List, preview and restore a version"
import { createGridFromSnapshot, type Grid, type SyncCoordinator } from "@sheetwrite/core";
import { HistoryArchive, type HistoryStorageAdapter } from "@sheetwrite/core/history";

export async function restoreLatest(
  grid: Grid,
  sync: SyncCoordinator,
  storage: HistoryStorageAdapter,
  previewHost: HTMLElement,
) {
  const archive = await HistoryArchive.open({ documentId: "workbook-42", storage });
  const page = await archive.listVersions({ maxEntries: 20 });
  const latest = page.versions[0];
  if (latest === undefined) return;

  const snapshot = await archive.readVersion(latest.id);
  const preview = createGridFromSnapshot(previewHost, snapshot, { readOnly: true });
  preview.destroy();

  return archive.restoreVersion(grid, latest.id, { kind: "workbook" }, { sync });
}
```

A restore is an ordinary commit, so the server no longer needs a separate
restore endpoint. A server that records history attaches a `CommitJournal`, as
`MemoryPersistenceAdapter.recordHistory` does.

## Sync and history

| Change | What to do |
| --- | --- |
| New `SyncCoordinatorOptions.authorId` stamps each pending commit. `VersionedOperation` has `authorId` and `committedAt`. | Pass the signed-in user's ID to record who made each change. While a history journal is attached, a commit without `authorId` is rejected with `commit-rejected`. |
| Comment calls (`load`, `create`, `reply`, `resolve`, `mutate`) accept a final `AbortSignal`. An abort or `destroy()` rejects with the signal's reason and emits no `error` event. A sync send aborted by `setOnline(false)` or `destroy()` rejects with an `AbortError` instead of `sync-failed`, and the commit stays pending. | Treat these `AbortError` rejections as cancellation. Do not compare them with the old string messages. |
| Coordinator teardown and sync disconnection pass an `AbortError` reason to transport adapters. | Check `signal.aborted` in your adapter instead of matching a string reason. |
| Unmounting a React, Vue or Svelte grid destroys it and aborts its pending work. | Destroy host-created sync and collaboration coordinators yourself when the view is removed. |
| `rebaseDocumentOperations` copies a local operation only when a remote row or column change rewrites it, so its result can hold your own operation objects. | Treat the result as read-only. Your operations are still never modified. |

```ts compile title="Record the author of each change"
import { SyncCoordinator, type Grid, type PersistenceAdapter } from "@sheetwrite/core";

export function connect(grid: Grid, adapter: PersistenceAdapter, userId: string) {
  return new SyncCoordinator(grid, adapter, {
    documentId: "workbook-42",
    serverVersion: 0,
    authorId: userId,
  });
}
```

### Document operations

0.7.0 adds these document operations: `permuteRows` (sort), `moveCells`
(cut and paste, and Insert and Delete that shift cells), `setRelationship`
and `removeRelationship` (data model), `setMeasure` and `removeMeasure`
(measures), `setExternalLinks` (linked workbooks), `setQuery` and
`removeQuery` (saved queries) and `setDashboardItem` and `removeDashboardItem`
(dashboards). A sheet can have `kind: "dashboard"`.
`setSheetMeta` can carry `tabColor`. The commit reasons `"sort"` and
`"restore"` are new, and `"cut"` is no longer emitted: cut leaves its cells in
place until the paste moves them. `RowBridgeMetadataDelta.metadata` can be
`"relationship"`. Update server-side validation and every `switch` over
operations, commit reasons or metadata kinds before you accept 0.7.0 clients.

Before:

```js partial="0.6 code"
const ACCEPTED = new Set(["set", "setRange", "setBlock", "clearRange"]);
// A cut arrived as a clear with the "cut" reason, and the paste as ordinary cell writes.
```

After:

```ts compile title="Accept the new operations on your server"
import type { DocumentOp } from "@sheetwrite/core";

const ACCEPTED = new Set<DocumentOp["op"]>([
  "set",
  "setRange",
  "setBlock",
  "clearRange",
  "permuteRows",
  "moveCells",
]);

export function accepts(op: DocumentOp): boolean {
  // A cut and paste is one moveCells; Insert and Delete that shift cells add `shift: true`.
  return ACCEPTED.has(op.op);
}
```

## Add-on registration

0.7.0 installs add-ons in one way: `initSheetwrite({ engine, source, addons })`,
plus per-grid settings in `createGrid(host, { addons: { [name]: settings } })`. Each add-on package
exports a factory named `<name>Addon`.

Before:

```text partial="0.6 code; these imports and arguments no longer exist"
import "@sheetwrite/charts/register";
import "@sheetwrite/xlsx/register";
import * as formulas from "@sheetwrite/formulas";

await initSheetwrite(undefined, formulas);
```

After:

```ts compile title="Install the engine and add-ons"
import { chartsAddon } from "@sheetwrite/charts";
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";
import { xlsxAddon } from "@sheetwrite/xlsx";

await initSheetwrite({ engine: formulas, addons: [chartsAddon(), xlsxAddon()] });
```

| 0.6 | 0.7.0 |
| --- | --- |
| `import "@sheetwrite/charts/register"` or `registerChartsBackend()` | `initSheetwrite({ addons: [chartsAddon()] })` |
| `import "@sheetwrite/xlsx/register"` or `registerXlsxBackends()` | `initSheetwrite({ addons: [xlsxAddon()] })` |
| `setChartRendererFactory`, `setChartViewProviderFactory` | An add-on whose `setup` calls `context.charts({ views, renderer })` |
| `setXlsxWorkbookBackend`, `setXlsxTableImportBackend`, `setXlsxTableExportBackend` | An add-on whose `setup` calls `context.xlsx({ workbook, tableImport, tableExport })` |
| `initSheetwrite(source, engine)` | `initSheetwrite({ source, engine })` |

Custom functions, saved queries, the version history commands, external
links and formula assist are new in 0.7.0 and install the same way:
`functionsAddon`, `queriesAddon`, `historyAddon`, `externalLinksAddon` and
`formulaAssistAddon` (from `@sheetwrite/formula-assist`).

Add-ons set up once, in list order. A name listed twice in one call rejects
with `invalid-argument`; a name installed by an earlier call is kept. Settings
in `createGrid` for an add-on that `initSheetwrite` did not install reject with
`invalid-argument`. Each add-on loads its heavy code on first use. The XLSX codec
loads on the first XLSX call, and the chart drawing code and the query engine
when a grid that uses them is created. The history panel loads on its first
command.

## Errors and cancellation

Core failures have one shape: a `SheetwriteError` with a stable `code` and
`operation`. An abort is
not a failure: it rejects with the signal's reason. See
[Error handling](/docs/concepts/error-handling/).

| 0.6 behavior | 0.7.0 |
| --- | --- |
| Bad host input threw `RangeError`, `TypeError` or `Error` from `resolveTransactionResourceLimits`, `validateTransactionResources`, `createRowBridge`, `createSimpleGridInput`, `legacyFullWidthDataSource`, `decodeStoreMemoryStats`, `assertRuntimeResourceSnapshot` and custom `CellRenderer` results | A `SheetwriteError` with code `invalid-argument`; operations `store`, `transaction`, `render`, `row-bridge` and `resource-diagnostics` are new |
| An unknown sheet ID threw a plain error | `not-found`, operation `store`, with `context.sheet` |
| A bad limit override threw `limit` or `TypeError` | `invalid-limits` everywhere |
| Operations `comments` and `export-xlsx` | Renamed to `comment` and `xlsx-export` |
| `datasource-error` context copied column keys | Holds `columnBandCount` and the first 64 bands; read the keys from `event.request` |
| A WASM trap threw an untyped `RuntimeError` | `engine-failed` (operation `engine`); the grid emits `engine-failed` and becomes read-only |
| `renderer-fallback` errors told the cause in the message | `error.context.failure`: `spawn`, `crash`, `protocol`, `timeout` or `fatal` |
| An aborted XLSX or CSV/TSV call rejected with `code: "aborted"` | Rejects with `signal.reason`; persistence and IndexedDB storage keep `aborted` |
| `grid.summarizeSelection()` kept reading after `destroy()` | Rejects with an `AbortError` |
| `<Sheetwrite>` in Vue and Svelte threw a plain `Error` for a bad `height`/`fill` | `invalid-argument`, operation `create-grid` |
| `<Sheetwrite>` in React accepted both or neither of `height` and `fill`, and Svelte checked them after the grid mounted. Vue typed `fill` as `boolean` | React, Vue and Svelte throw `invalid-argument` (operation `create-grid`) while rendering, before a grid mounts. Vue types `fill` as `fill?: true` |
| `revision-failed`, `revision` | Removed with `RevisionCoordinator`; see [Revisions move to version history](#revisions-move-to-version-history) |

Before:

```js partial="0.6 code"
try {
  bridge = createRowBridge(options);
} catch (error) {
  if (error instanceof RangeError) showInvalidOptions(error.message);
}

try {
  snapshot = await fromXlsxWorkbookFile(file, { signal });
} catch (error) {
  if (error.code === "aborted") return;
  throw error;
}
```

After:

```ts compile title="Check the code, and tell aborts apart by the signal"
import { fromXlsxWorkbookFile, isSheetwriteError } from "@sheetwrite/core";

export function describeFailure(error: unknown): string {
  if (!isSheetwriteError(error)) throw error;

  switch (error.code) {
    case "invalid-argument":
      return `Check the ${error.operation} options.`;
    case "engine-failed":
      return "The engine stopped. Reload the document to continue.";
    default:
      return error.message;
  }
}

export async function importFile(file: Blob, signal: AbortSignal) {
  try {
    return await fromXlsxWorkbookFile(file, { signal });
  } catch (error) {
    if (signal.aborted) return undefined;
    throw error;
  }
}
```

After `engine-failed`, destroy the grid, call `initSheetwrite()` again and
create a new grid from the last saved document. If you `switch` over
`SheetwriteErrorCode` or `SheetwriteErrorOperation` without a default case,
add the new values.

## Methods that return a result

Synchronous sort, filter, hidden-row, row-group and view-clear methods of the
store return the same `ApplyTransactionResult` as `applyTransaction`, so you can
see a rejected or empty change. They are `setColumnFilter`, `filterBy`,
`hideRows`, `showRows`, `groupRows`, `ungroupRows`, `setGroupCollapsed`,
`clearView` and `grid.sortBy`. Code that implements these method types, or
assigns them to a callback type that returns `void`, must update the return type.

Before:

```js partial="0.6 code"
store.hideRows("s1", [4, 5]); // returned undefined
```

After:

```ts compile title="Read the result of a view change"
import type { SheetwriteStore } from "@sheetwrite/core";

export function hideDrafts(store: SheetwriteStore, rows: readonly number[]) {
  const result = store.hideRows("s1", rows);
  if (result.status === "rejected") console.warn(result.issues);
  return result.status === "applied";
}
```

## Cell style sanitizing

`sanitizeHyperlinkStyle` is removed; use `sanitizeCellStyle` instead. The same check guards
hyperlinks, table styles and pasted cells, and applies Excel's font size range
of 1 to 409 points and `#rrggbb` colors.

Before:

```js partial="0.6 code"
const style = sanitizeHyperlinkStyle(untrusted);
```

After:

```ts compile title="Check an untrusted cell style"
import { sanitizeCellStyle } from "@sheetwrite/core";

export function safeStyle(untrusted: unknown) {
  return sanitizeCellStyle(untrusted) ?? {};
}
```

## Chart views are read-only

`ChartView.chart` is now the store's own chart definition instead of a deep
copy. Its type is `ReadonlyChartDefinition`, read-only all the way down, and
development builds freeze it, so a write throws. To change a chart, edit a copy
and commit it with `grid.setChart`. `grid.getCharts(sheet)` returns copies.

Before:

```js partial="0.6 code"
view.chart.title = "Revenue";
grid.setChart(view.chart, sheet);
```

After:

```ts compile title="Edit a chart from its view"
import type { ChartView, Grid, SheetId } from "@sheetwrite/core";

export function retitleChart(grid: Grid, sheet: SheetId, view: ChartView, title: string) {
  const chart = grid.getCharts(sheet).find((candidate) => candidate.id === view.chart.id);
  if (chart === undefined) return undefined;
  return grid.setChart({ ...chart, title }, sheet);
}
```

## Stylesheet parts

`@sheetwrite/core/styles.css` now imports the stylesheet in parts, and the command icon sheet is its own file, `styles/icons.svg`, instead of a `data:` URL. An app that imports `styles.css` looks the same.

| Change | What to do |
| --- | --- |
| `icons.css` loads `icons.svg` from beside it. | Nothing with Vite, webpack or Next.js. With esbuild, give `.svg` files a loader, for example `loader: { ".svg": "file" }`. Without one, the build fails with `No loader is configured for ".svg" files: icons.svg`. |
| The default icon sheet is a file from your origin, not a `data:` URL. | If you set `--sheetwrite-icon-sheet` only because your Content Security Policy blocks `data:` images, you can remove it. |
| The parts are published under `@sheetwrite/core/styles/` and in each framework adapter. | To ship less CSS, import only the parts your grid uses; see [Stylesheet parts](/docs/features/formatting/styles/#stylesheet-parts). |
| The AutoFilter header buttons and the sheet tab menu draw their glyphs from the icon sheet. | If you import the parts yourself, include `icons.css` on a grid that shows filters or sheet tabs. `styles.css` includes it. |

## Direct engine calls

Most apps never call the engine directly. If you call `CellStore` from
`@sheetwrite/wasm` or `@sheetwrite/formulas` yourself, these methods change.

| 0.6 | 0.7.0 |
| --- | --- |
| `setSparseBlock(..., numbers, texts, styles, ...)` with one string per entry | `setSparseBlock(..., numbers, textBuf, textOffsets, styles, ...)`: the UTF-8 bytes of the string entries only, in entry order. The n-th string entry owns bytes `textOffsets[n]` to `textOffsets[n + 1]`; a block without text passes an empty buffer and `[0]`. |
| `convertXlsxFormulas(sources, exporting)`; scalar `formulaToXlsx` / `formulaFromXlsx` | `convertXlsxFormulas(sources.join(""), ends, exporting, changedIndices)`: `ends` are cumulative UTF-16 lengths (JavaScript `length`), `changedIndices` is a `Uint32Array` with one slot per source. It returns only the changed formulas and writes their input positions to the front of `changedIndices`; keep every other source. For one source use one end, `source.length`. Core's `XlsxFormulaEngine.convert` is unchanged. |
| `PivotFields.names()`, `PivotFields.types()` | `takeNames()`, `takeTypes()`. Each hands the buffer over once and leaves it empty. |
| `CellStore.setColumnNumbers`, `setColumnStrings`, `setColumnStringsPacked` | Removed: use `setBlockPacked`, `setSparseBlock` or `setColumnBlockPacked`. |
| `DiffKernel.clearPage`, `DiffKernel.pageLength` | Removed: consume the page arrays, then call `compare` to start the next page; read the length of a returned page array. |
| `setSheetName(sheet, id, name)` returned nothing and accepted any name | Returns whether it named the sheet. Like `renameSheet`, it refuses an empty name, a name another sheet holds in any case, and another sheet's id, and then changes nothing. |
| `search(sheet, cols, query, caseInsensitive, wholeCell)` matched `query` as plain text | `query` takes Excel's wildcards: `*`, `?`, and `~` before a literal `*`, `?` or `~`. A sixth argument, `formulas`, matches a formula cell by its formula text; without it, cells match by their values. |

Before:

```js partial="0.6 code"
cells.setSparseBlock(sheet, row, col, rows, cols, offsets, kinds, numbers,
  texts, styles, formulaOffsets, formulaSources, referenceOffsets, referenceTargets);
const names = fields.names();
const types = fields.types();
```

After:

```js partial="requires an engine CellStore, its block arrays and a PivotFields list"
// String entries have kind 2.
const encoder = new TextEncoder();
const parts = texts.filter((_, i) => kinds[i] === 2).map((text) => encoder.encode(text));
const textOffsets = new Uint32Array(parts.length + 1);
parts.forEach((part, i) => (textOffsets[i + 1] = textOffsets[i] + part.length));
const textBuf = new Uint8Array(textOffsets[parts.length]);
parts.forEach((part, i) => textBuf.set(part, textOffsets[i]));
cells.setSparseBlock(sheet, row, col, rows, cols, offsets, kinds, numbers,
  textBuf, textOffsets, styles, formulaOffsets, formulaSources, referenceOffsets, referenceTargets);

// Take each buffer once.
const names = fields.takeNames();
const types = fields.takeTypes();
fields.free();
```

XLSX formula conversion takes one joined string and returns only the changed
formulas.

Before:

```js partial="0.6 code"
const converted = engine.convertXlsxFormulas(sources, true);
```

After:

```js partial="requires an engine module and an array of formula sources"
let end = 0;
const ends = Uint32Array.from(sources, (source) => (end += source.length));
const changedIndices = new Uint32Array(sources.length);
const changed = engine.convertXlsxFormulas(sources.join(""), ends, true, changedIndices);
const converted = sources.slice();
changed.forEach((formula, position) => {
  converted[changedIndices[position]] = formula;
});
```

## Keyboard defaults

The grid's keys follow Excel. These default keys are new, and each is a
`KeyboardAction` that `config.keyboard.bindings` can rebind or turn off with
`null`. A host context-menu item that already uses one of them now throws a
`shortcut-conflict` error. See
[Keyboard shortcuts](/docs/features/grid/keyboard-shortcuts/).

| Keys (Ctrl, or Cmd on a Mac) | Actions |
| --- | --- |
| Ctrl+B or Ctrl+2, Ctrl+I or Ctrl+3, Ctrl+U or Ctrl+4, Ctrl+5 | `bold`, `italic`, `underline`, `strikethrough` |
| Ctrl+; and Ctrl+Shift+; | `insertDate`, `insertTime` |
| Ctrl+A | `selectAll`: the current region, then the whole sheet |
| Ctrl+D and Ctrl+R | `fillDown`, `fillRight` |
| Ctrl+Shift+~, !, @, #, $, % and ^ | `formatGeneral`, `formatNumber`, `formatTime`, `formatDate`, `formatCurrency`, `formatPercent`, `formatScientific` |
| Ctrl+9, Ctrl+Shift+9, Ctrl+0, Ctrl+Shift+0 | `hideRows`, `unhideRows`, `hideColumns`, `unhideColumns` |
| Ctrl++ and Ctrl+- | `insertCells`, `deleteCells` |
| Ctrl+1 | `formatCells` |
| Ctrl+Alt+V (Ctrl+Cmd+V on a Mac) | `pasteSpecial` |
| Ctrl+Shift+L | `toggleFilter` |
| Ctrl+PageDown and Ctrl+PageUp, or Ctrl+Alt+PageDown and Ctrl+Alt+PageUp | `nextSheet`, `previousSheet` |
| Shift+F11 | `insertSheet` |

Backspace is no longer a `clearContents` key: it clears only the active cell
and opens the editor, as in Excel. Delete still clears the selection's values,
and now keeps their formats, as Excel's Delete does; in 0.6 it also removed
number formats and styles. `grid.actions.clearContents()` does the same. Enter
and Tab move the active cell instead of opening the editor; F2 opens it.

Before:

```js partial="0.6 code"
const config = {
  contextMenu: [{ id: "bookmark", label: "Bookmark", shortcut: "Mod+B", onClick: addBookmark }],
};
```

After:

```ts compile title="Keep a host key that a new default uses"
import type { GridConfig } from "@sheetwrite/core";

export function bookmarkConfig(addBookmark: () => void): GridConfig {
  return {
    // Bold keeps Ctrl+2, so Ctrl+B stays with your command.
    keyboard: { bindings: { bold: ["Mod+2"] } },
    contextMenu: [
      { id: "bookmark", label: "Bookmark", shortcut: "Mod+B", onClick: () => addBookmark() },
    ],
  };
}
```

## The active cell of a selection

Extending a selection with Shift+Arrow, Shift-click or a drag keeps the cell
where it started active, as in Excel. A range, row, column or multi selection
reports that cell as `active` when it is not the selection's first cell, and
`setSelection` accepts it. Code that took the far corner of a range as the cell
the user edits must read `active` instead.

Before:

```js partial="0.6 code"
const selection = grid.getSelection();
const cell = selection.kind === "range" ? selection.range.end : selection.addr;
```

After:

```ts compile title="Read the active cell"
import type { CellAddress, Grid } from "@sheetwrite/core";

export function activeCell(grid: Grid): CellAddress | null {
  const selection = grid.getSelection();
  if (selection === null) return null;
  switch (selection.kind) {
    case "cell":
      return selection.addr;
    case "range":
      return selection.active ?? { sheet: selection.range.sheet, ...selection.range.start };
    case "row":
      return selection.active ?? { sheet: selection.sheet, row: selection.row, col: 0 };
    case "column":
      return selection.active ?? { sheet: selection.sheet, row: 0, col: selection.col };
    case "multi": {
      const last = selection.ranges[selection.ranges.length - 1];
      return selection.active ?? (last ? { sheet: last.sheet, ...last.start } : null);
    }
  }
}
```

## Find and Replace

Search works as Excel's Find does. See [Search](/docs/features/grid/search/).

| 0.6 | 0.7.0 |
| --- | --- |
| `*` and `?` in a query matched themselves | They are wildcards: `*` matches any run of characters and `?` one character. Search for a literal one with `~*` or `~?`. |
| A formula cell matched by its result | It matches by its formula text unless `lookIn: "values"`. Replace rewrites formula text. |
| `search` searched the whole sheet | With more than one cell selected on the active sheet, it searches only the selection. Select one cell, or pass `within: "workbook"`, to search more. |
| A number matched by its stored value (`0.15` found a cell showing `15%`) | A number in a number format matches by its text: Look in Formulas by the formula bar's text (`15%`), Look in Values by the shown text (`$4.50`). |
| `search`, `findNext`, `findPrev` and `replaceCurrent` moved a highlight | They also select the match and scroll to it, so typing after Find edits that cell. |

Before:

```js partial="0.6 code"
grid.search("5*"); // cells that hold the text "5*"
grid.search("1200"); // also formula cells whose result is 1200
```

After:

```ts compile title="Search for literal wildcards and for results"
import type { Grid } from "@sheetwrite/core";

export function findLiteralStar(grid: Grid) {
  return grid.search("5~*");
}

export function findResult(grid: Grid) {
  return grid.search("1200", { lookIn: "values" });
}
```

## Paste and data validation

A paste works as Excel's does with data validation: the pasted values land
unchecked, and the cells the paste covers take the copied cells' rules in place
of their own, as one undo step. In 0.6 a paste kept the target's rules and
silently dropped each value a rule rejected. Paste Values and a paste from
another application keep the target's rules. The store no longer checks
validation for a commit with the `"paste"` reason. A paste of cells copied in
the same grid also brings their notes and conditional formats.

To keep the target cells' rules, as 0.6 did, set `paste.keepValidation`. A
value that a `reject` rule refuses is then not pasted, and the status bar names
the refused cells.

Before:

```js partial="0.6 code"
createGrid(host, { workbook, config: { toolbar: true } });
```

After:

```ts compile title="Keep the target's validation rules on paste"
import { createGrid, type GridOptions } from "@sheetwrite/core";

export function mountGrid(host: HTMLElement, workbook: GridOptions["workbook"]) {
  return createGrid(host, {
    workbook,
    config: { toolbar: true, paste: { keepValidation: true } },
  });
}
```

## Validation rule and filter types

`DataValidationCondition` and `ColumnFilter` have new members. A `switch` over
their `kind` that lists every case, or code that reads a field without
checking the kind, must handle them.

| Type | New in 0.7.0 |
| --- | --- |
| `DataValidationCondition` | `{ kind: "any" }`, `{ kind: "time", ... }`, `{ kind: "custom", formula }`, and a list from a range or a name, `{ kind: "list", source: "=$H$2:$H$5" }`, which has no `values` |
| `DataValidationComparison` | `min`, `max` and `value` can be formula text, such as `"=TODAY()"`, as well as a number |
| `DataValidationRule` | `inCellDropdown`, `errorStyle`, `errorTitle`, `showInputMessage`, `inputTitle` and `inputMessage` |
| `ColumnFilter` | `{ kind: "custom", join, conditions }` for Excel's custom AutoFilter, and `{ kind: "dynamic", type }` for its Date Filters |

Before:

```js partial="0.6 code"
function choices(rule) {
  return rule.condition.kind === "list" ? rule.condition.values : [];
}
```

After:

```ts compile title="Read a list rule's own items"
import type { CellScalar, DataValidationRule } from "@sheetwrite/core";

export function choices(rule: DataValidationRule): readonly CellScalar[] {
  const { condition } = rule;
  // A list from a range or a defined name has `source` instead of `values`.
  return "values" in condition ? condition.values : [];
}
```

## Sheet names

`validateSheetName` reports the new code `reserved` for History, which Excel
reserves. A user's rename to History is refused; adding a sheet, undo, a
version restore and XLSX files keep the name. New sheets from the + button,
the tab menu's Insert and Shift+F11 are named `Sheet4`, with no space, instead
of `Sheet 4`.

Before:

```js partial="0.6 code"
const messages = {
  blank: "Enter a name.",
  "too-long": "Use 31 characters or fewer.",
  "forbidden-character": "Remove : \\ / ? * [ or ].",
  "edge-apostrophe": "Remove the apostrophe at the start or end.",
  duplicate: "Another sheet has this name.",
};
```

After:

```ts compile title="A message for each sheet name problem"
import type { SheetNameIssueCode } from "@sheetwrite/core";

export const SHEET_NAME_MESSAGES: Record<SheetNameIssueCode, string> = {
  blank: "Enter a name.",
  "too-long": "Use 31 characters or fewer.",
  "forbidden-character": "Remove : \\ / ? * [ or ].",
  "edge-apostrophe": "Remove the apostrophe at the start or end.",
  reserved: "History is reserved.",
  duplicate: "Another sheet has this name.",
};
```

## Behavior changes you will notice

### Excel sort order

Every sort uses Excel's sort order. Text compares without case in Excel's
character order and skips apostrophes and hyphens. Errors sort after `FALSE` and
`TRUE` and are equal to each other. Blank cells are last in both directions. A
saved view sort with mixed-case text, errors, or blank
cells in a descending sort shows a different order after the upgrade. Sorting a
spilled column uses the spilled values.

### Sort commands and the view sort

Sort A to Z and Sort Z to A in the ribbon, the toolbar and the column menu
move the cells. One undo restores them. To sort only the displayed rows, use
Sort View A to Z, Sort View Z to A, or "Sort view only" in Data › Custom Sort. A view sort is still
saved with the sheet.

### Imported worksheet sort state

An imported worksheet `sortState` is no longer applied as a view sort. Excel
writes it after a sort that already moved the cells, so the rows keep the
order Excel saved. It is kept as `Sheet.sortState` and written back on export,
and the "sortState did not cover every data row" import warning is removed. An
in-place sort of a table body records the table's sort state, so Excel shows
the sort on the table's header buttons.

### INFO and other new functions

`INFO` is new in both engines. It returns the sheet count for `"numfile"` and
`"Automatic"` for `"recalc"`, and `#N/A` for `"directory"`, `"origin"`,
`"osversion"`, `"release"` and `"system"`, which describe the desktop program. Workbooks that showed
`#NAME?` for an Excel function that 0.7.0 adds now show a result. See the
[formula function contract](/docs/reference/formula-functions/).

### Formula results that match Excel

| Change |
| --- |
| Operators read number text as `VALUE` does: `="1,000"+0` is 1000 and `="2024-01-31"+0` is 45322. A space inside a number is text (`=VALUE("1 234")` is `#VALUE!`), date text with trailing words is `#VALUE!`, and the criterion `"inf"` is text. |
| `ROUND`, `TEXT`, `CHOOSE`, `INDEX`, `SUMIF`, `FLOOR`, `CEILING`, `TRIM` and other functions give Excel's result; numbers become text with 15 significant digits. |
| `SUBTOTAL` accepts codes 101 to 111 and skips hidden rows; `AGGREGATE` options 1, 3, 5 and 7 skip hidden rows; a subtotal does not count another subtotal. |
| Paste, fill and conditional-format rules rewrite references with the engine's rules: `=SUM(A:A)` pasted one column right is `=SUM(B:B)`, and a reference that leaves the sheet becomes `#REF!`. `shiftA1Refs` needs `initSheetwrite()` first. |
| XLSX import expands shared formulas with the same rule, so a shared whole-column reference moves with each cell. |
| A row or column insert that a sheet cannot hold changes nothing; `addRows`, `removeRows`, `insertCols` and `removeCols` return `false`. A transaction whose `addRows` or `addColumns` would pass `maxRowsPerSheet`, `maxColumnsPerSheet`, `maxLogicalCellsPerSheet` or `maxLocalPagedCells` is rejected with a `resource-limit` issue that names the limit. Insert Row and Insert Column show the limit in an alert. |
| A reference to another workbook, such as `[Budget.xlsx]Annual!C10`, keeps its text and shows `#REF!` until the workbook has values for the link. Before, the unquoted form was a syntax error and a quoted form made the whole formula `#REF!`. |
| A sheet rename or delete, a row or column insert or delete, a tab move and a table change keep the formula text as written and change only its references. Renaming `Sales` to `Sales Data` turns `=Sales!A1+1` into `='Sales Data'!A1+1`, not `=('Sales Data'!A1+1)`. |
| Moving rows or columns (`moveRows`, `moveColumns`) moves the cells, as Excel's Cut and Insert Cut Cells does. References follow the moved cells instead of becoming `#REF!`. A range loses a moved row at its edge and grows by one that lands inside it. A move that would split a table is refused. |
| Cut no longer empties its cells: it marks them, and the next paste moves them with the new `moveCells` operation, as Excel's Cut and Paste does. References to the moved cells follow them, and the move is one undo step. A server or store that checks operation kinds must accept `moveCells`; the `"cut"` commit reason is no longer emitted. See [Cut and paste moves cells](/docs/features/grid/editing-and-clipboard/#cut-and-paste-moves-cells). |
| Array formulas whose size comes from a cell, such as `=SEQUENCE($C$1)`, spill in every formula of a recalculation; the third and later ones no longer show `#NUM!`. |
| On paged data, `INDEX` that returns one cell shows `#LOADING!` only until that cell loads, and a short text result no longer shows `#NUM!` when other cells of its area hold a lot of text. |
| `GROUPBY` and `PIVOTBY` compute large sources that Excel computes: their source rows no longer count against the 2,000,000-operation limit. A call that places more than 16,777,216 rows into groups returns `#NUM!`. |
| `GETPIVOTDATA` is no longer volatile. It recalculates when its pivot's output changes, as in Excel, not on every edit. |

### Grid markup and loading

| Change | What to do |
| --- | --- |
| The toolbar, the ribbon and the compact ribbon render one command model. The `.sheetwrite-tb-*` classes are gone; each command element has a `data-command` attribute. The built-in toolbar loads with the ribbon's chunk. | Select commands by `data-command` in styles and tests, and wait for the toolbar after the grid mounts. |
| `GridConfig` command flags (`CommandFlags`) choose ribbon commands too. | Check the ribbon after changing a flag such as `export`. |
| The find bar loads on first open. | Open it with `grid.actions.find()` or Ctrl+F before looking for `.sheetwrite-find`. Expect one more lazy chunk. |
| Typing, fill, paste or a remote edit inside a spill keeps the value and shows `#SPILL!` on the anchor. | Nothing; clearing the value restores the array. |
| Saved hidden rows, collapsed groups and filters apply at load. | Nothing; `SUBTOTAL` no longer counts rows that a saved filter hides. |
| The number-format box and `grid.getFocusCellStyle()` show the column's `numberFormat` when the cell's style sets none. | Nothing; a cell in a percentage column no longer shows "General". |
| Each paint writes the screen-reader mirror as its last step. A `scroll` listener runs before that write. | A `scroll` listener that reads the mirror sees the previous paint's rows. |

### Editing, filters and sheets

| Change | What to do |
| --- | --- |
| AutoComplete is on: typing a text entry completes it from the same column, and Enter stores the completed entry. | Set `config: { autoComplete: false }` to turn it off. |
| An entry typed into a cell keeps the cell's formatting, bold and number format included. What a user types into a Text (`@`) cell stays text, so `0123` keeps its zero. | Nothing. `parseCellInput` takes the cell's number format as an optional third argument, for a formula bar of your own. |
| A new column type, `general`, reads typing as Excel's General format does: `42` is a number, `15%` is 0.15 shown as `0%`, `1/2/2024` is a date, `'007` is the text `007`. The columns Sheetwrite makes itself are `general`: new sheets, `addSheet` without `columns`, the empty columns right of a sheet's own, XLSX imports without one number format per column, and an adapter's `SimpleColumn` without `type`. In 0.6 they were `text`, which kept typed numbers and dates as text. | Handle `general` where your code switches on `Column.type`. Set `type: "text"` on a column whose entries must stay text, such as codes with leading zeros. A 0.6 peer refuses a snapshot or patch with a `general` column, so update collaborating clients together. `parseCellInput` takes the column's number locale as an optional fourth argument. |
| Insert, delete, hide and auto-fit row and column commands act on every row or column of the selection. | Nothing. |
| Undo and redo select the cells they change; a change on another sheet makes that sheet active. | Nothing. |
| Column filters keep through inserted and deleted rows, and move with their columns. In 0.6 any row or column edit cleared them. | Nothing. |
| XLSX import turns rows an Excel AutoFilter hid into filtered rows, not hidden rows. | Nothing. Clearing the filter shows them, as in Excel. |
| A cut over a filtered range moves the rows the filter hides too, as in Excel. Copy, delete, formatting and the fill handle still act only on the rows the filter shows. | Nothing. |
| A pasted block over a filtered range or rows hidden with Hide Rows writes into consecutive sheet rows, the hidden rows included, as in Excel, and says "This paste wrote into N hidden rows". In 0.6 it wrote only into the rows a filter showed. One copied value pasted over a filtered selection still fills only the shown cells. The context menu's Paste Options then offers Paste into visible rows only (`grid.actions.pasteVisibleRows()`, new context-menu action `pasteVisibleRows`). | Nothing. Under a view sort a block still takes the shown rows. A host's own context menu can add `{ action: "pasteVisibleRows" }`. |
| New sheets from the + button, Insert and Shift+F11 start with columns A to Z and 1,000 rows, instead of one column and 100 rows. The + button adds the sheet after the active one. | Nothing. A sheet added with `addSheet` without `columns` fills the grid's width with empty columns. |
| A number with no format, `General` or `@` shows as Excel's General: `2026`, not `2,026`, and `1.23457E+11` for a long number. | Update tests that expected thousands separators or three decimals. |
| XLSX export writes a `text` column in Excel's Text format `@`, and import reads an `@` column as `text`. | Nothing; `007` keeps its zero through a round trip. |
| The Name Box goes to a cell on a hidden row. While that cell is active, the `selection` event has `selection: null` and names the cell in `sheetFocus`. | Handle `selection: null` with a `sheetFocus` where you read the selection event. |
| A paste the grid refuses, a paste too large for the sheet included, resolves the new `ClipboardOutcome` `"rejected"` instead of `"done"` or rejecting. | Add the case where you `switch` over `ClipboardOutcome`. |

### setBlock cell arrays

| Change | What to do |
| --- | --- |
| An accessor entry in setBlock arrays is now read once instead of rejected. `grid.applyTransaction`, `grid.applyRemoteOperations` and `SheetwriteStore.applyTransaction` read each entry of a `setBlock`'s `block.values` and `block.styleIds` once, by index, into a private copy. Validation, the store, history, sync and the `change` event use that copy. A getter that throws gives a `SheetwriteError` with code `invalid-argument` and operation `transaction`. Only those two arrays change. Every other `setBlock` field (`range`, `formulas`, `refs`, `styleTable`), every other operation type, holes, non-finite numbers and byte limits keep the same validation. Getters there are still rejected without running. `store.applyTransaction` returns and emits a copy of a transaction that contains `setBlock`. | Nothing, unless you relied on the rejection or on getting your own `patches` array back. Changing your arrays after the call no longer reaches the document. |

### Dense workbooks past maxDenseCells

| Change | What to do |
| --- | --- |
| A dense-storage workbook no longer stops at `maxDenseCells` (5,000,000 cells). In 0.6.1 a snapshot past it failed with `SnapshotResourceError("maxDenseCells")`. Now the sheets past it load in local pages, which are never evicted and always loaded, so they still behave as dense sheets (`isPaged` is false). A row or column insert that would pass it moves the sheet into local pages instead of being refused. | Nothing, unless you load untrusted snapshots: see the next row. |
| With the default limits, the most cells an untrusted dense-storage snapshot can make the engine hold rises from 5,000,000 to 25,000,000: 5,000,000 dense and 20,000,000 in local pages. A sheet filled to the full local budget held 625 MB of WASM memory in our measurement. | To keep 0.6.1's ceiling, pass `snapshotResourceLimits: { maxLocalPagedCells: 0 }`; any lower value bounds local pages. Lowering `maxDenseCells` also lowers what the engine allocates densely: the store gives both limits to the engine. |
| Local sheets share a new limit, `maxLocalPagedCells` in `SnapshotResourceLimits` (20,000,000 cells by default, also the engine's ceiling). A snapshot past it fails with `SnapshotResourceError("maxLocalPagedCells")`, and an `addRows` or `addColumns` that would pass it is rejected with a `resource-limit` issue whose resource is `local-paged-cells`. That code replaces `dense-cells`, which pre-release builds of 0.7.0 reported for an insert past `maxDenseCells`. `maxDenseCells` and `maxLocalPagedCells` are capped at the engine's ceilings (5,000,000 and 20,000,000); a larger value acts as the ceiling. | Match `local-paged-cells` where you matched `dense-cells`. |

Before:

```js partial="0.6 code"
// 0.6.1 refused a snapshot past 5,000,000 cells.
const grid = createGridFromSnapshot(host, untrusted);
```

After:

```ts compile title="Keep 0.6.1's ceiling for untrusted snapshots"
import { createGridFromSnapshot } from "@sheetwrite/core";

export function openUntrusted(host: HTMLElement, untrusted: unknown) {
  return createGridFromSnapshot(host, untrusted, {
    snapshotResourceLimits: { maxLocalPagedCells: 0 },
  });
}
```

## How 0.7.0 compares with 0.5.4 and 0.6.1

The same workloads ran against the published 0.5.4 and 0.6.1 packages and
against 0.7.0 on two machines. The 0.7.0 numbers come from develop before the
release and are measured again on the release commit. Recalculation is about
twice as fast as in 0.6.1 and uses less memory; the engine download grows. The
workloads, raw samples and noise are in
[the comparison results](https://github.com/chh-ay/sheetwrite/blob/develop/bench/results/version-comparison/version-comparison.md).

<version-compare></version-compare>

## Upgrade from earlier versions

If you upgrade from a version before 0.6.0, first read
[Upgrade to 0.6.0](/docs/start/upgrade-to-0-6-0/).