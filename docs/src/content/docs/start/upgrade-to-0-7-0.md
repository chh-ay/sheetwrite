---
title: Upgrade to 0.7.0
description: Replace the removed sort, revision and add-on registration APIs, update error and cancellation handling and direct engine calls, and review the sort order and formula results that change in 0.7.0.
---

> [!NOTE]
> 0.7.0 is the next release and is not published yet. This guide tracks the
> changes already merged for it, so an upgrade can be planned ahead.

Each section lists what changed in 0.7.0, what replaces it, and the pull
request that made the change. The "before" code is 0.6 code; the "after" code is
compiled against the 0.7.0 packages when the docs are built.

## Update packages together

Install 0.7.0 for every `@sheetwrite/*` package that you use. Packages from
different versions are not supported together.

## Sort

Sort commands now move the cells, as Excel's Sort does. The display-only sort
of 0.6 is called a view sort and has its own methods. See
[Sort cells in place](/docs/features/data/data-operations/#sort-cells-in-place)
and [Display views](/docs/features/data/data-operations/#display-views).

| 0.6 API | 0.7.0 | Pull request |
| --- | --- | --- |
| `grid.sortBy(col, ascending)` sorted the view | Changed: sorts the cells in place, as Excel's quick sort does. For the view sort, use `grid.setViewSort([{ col, ascending }])` | [#393](https://github.com/chh-ay/sheetwrite/pull/393) |
| `grid.setSort(keys)` | Removed: use `grid.setViewSort(keys)` | [#393](https://github.com/chh-ay/sheetwrite/pull/393) |
| `grid.sortByMulti(keys)` | Removed: use `grid.setViewSort(keys)` | [#393](https://github.com/chh-ay/sheetwrite/pull/393) |
| `store.sortBy(sheet, col, ascending)` | Removed: use `store.setViewSort(sheet, [{ col, ascending }])` | [#393](https://github.com/chh-ay/sheetwrite/pull/393) |
| `store.sortByMulti(sheet, keys)` | Removed: use `store.setViewSort(sheet, keys)` | [#393](https://github.com/chh-ay/sheetwrite/pull/393) |

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
`permuteRows` operation with the new `"sort"` commit reason
([#378](https://github.com/chh-ay/sheetwrite/pull/378)). A server or handler that
checks every operation or commit reason must accept them; see
[Document operations](#document-operations).

## Revisions move to version history

`RevisionCoordinator` and its types are removed. Version history in
`@sheetwrite/core/history` lists, reads and restores versions through a
`HistoryStorageAdapter`
([#390](https://github.com/chh-ay/sheetwrite/pull/390)). See
[Opt-in version archives](/docs/features/data/persistence/#opt-in-version-archives)
and [Migrating from `RevisionCoordinator`](/docs/features/collaboration/#migrating-from-revisioncoordinator).

| Removed | Use instead |
| --- | --- |
| `RevisionCoordinator`, `RevisionCoordinatorOptions`, `RevisionCoordinatorEvent` | `HistoryArchive.open({ documentId, storage })` |
| `RevisionAdapter` | `HistoryStorageAdapter`, or the built-in `MemoryHistoryStorage` and `IndexedDbHistoryStorage` |
| `RevisionCoordinator.list()`, `RevisionSummary` | `HistoryArchive.listVersions()`, which returns `HistoryVersion` pages |
| `RevisionCoordinator.preview()` | `HistoryArchive.readVersion()`, then `createGridFromSnapshot(host, snapshot, { readOnly: true })` |
| `RevisionCoordinator.restore()`, `RevisionRestoreRequest`, `RevisionRestoreResponse` | `HistoryArchive.restoreVersion(grid, id, scope, { sync })` |
| The `revision-failed` error code and the `revision` error operation | `HistoryError` codes |

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
`MemoryPersistenceAdapter.recordHistory` does
([#386](https://github.com/chh-ay/sheetwrite/pull/386)).

## Sync and history

| Change | What to do | Pull request |
| --- | --- | --- |
| New `SyncCoordinatorOptions.authorId` stamps each pending commit. `VersionedOperation` has `authorId` and `committedAt`. | Pass the signed-in user's ID to record who made each change. While a history journal is attached, a commit without `authorId` is rejected with `commit-rejected`. | [#386](https://github.com/chh-ay/sheetwrite/pull/386) |
| Comment calls (`load`, `create`, `reply`, `resolve`, `mutate`) accept a final `AbortSignal`. An abort or `destroy()` rejects with the signal's reason and emits no `error` event. A sync send aborted by `setOnline(false)` or `destroy()` rejects with an `AbortError` instead of `sync-failed`, and the commit stays pending. | Treat these `AbortError` rejections as cancellation. Do not compare them with the old string messages. | [#320](https://github.com/chh-ay/sheetwrite/pull/320) |
| Coordinator teardown and sync disconnection pass an `AbortError` reason to transport adapters. | Check `signal.aborted` in your adapter instead of matching a string reason. | [#320](https://github.com/chh-ay/sheetwrite/pull/320) |
| Unmounting a React, Vue or Svelte grid destroys it and aborts its pending work. | Destroy host-created sync and collaboration coordinators yourself when the view is removed. | [#320](https://github.com/chh-ay/sheetwrite/pull/320) |

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

0.7.0 adds these document operations: `permuteRows` (sort), `setRelationship`
and `removeRelationship` (data model), `setQuery` and `removeQuery` (saved
queries) and `setDashboardItem` and `removeDashboardItem` (dashboards). The
commit reasons `"sort"` and `"restore"` are new, and
`RowBridgeMetadataDelta.metadata` can be `"relationship"`. Update server-side
validation and every `switch` over operations, commit reasons or metadata
kinds before you accept 0.7.0 clients.

## Add-on registration

0.7.0 installs add-ons in one way: `initSheetwrite({ engine, source, addons })`,
plus per-grid settings in `createGrid(host, { addons: { [name]: settings } })`
([#366](https://github.com/chh-ay/sheetwrite/issues/366),
[#466](https://github.com/chh-ay/sheetwrite/pull/466)). Each add-on package
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

Custom functions, saved queries, the version history commands and external
links are new in 0.7.0 and install the same way: `functionsAddon`,
`queriesAddon`, `historyAddon` and `externalLinksAddon`.

Add-ons set up once, in list order. A name listed twice in one call rejects
with `invalid-argument`; a name installed by an earlier call is kept. Settings
in `createGrid` for an add-on that `initSheetwrite` did not install reject with
`invalid-argument`. Each add-on loads its heavy code on first use: the XLSX codec
on the first XLSX call, the chart drawing code and the query engine when a grid
that uses them is created, and the history panel on its first command.

## Errors and cancellation

Core failures have one shape: a `SheetwriteError` with a stable `code` and
`operation` ([#309](https://github.com/chh-ay/sheetwrite/pull/309)). An abort is
not a failure: it rejects with the signal's reason. See
[Error handling](/docs/concepts/error-handling/).

| 0.6 behavior | 0.7.0 | Pull request |
| --- | --- | --- |
| Bad host input threw `RangeError`, `TypeError` or `Error` from `resolveTransactionResourceLimits`, `validateTransactionResources`, `createRowBridge`, `createSimpleGridInput`, `legacyFullWidthDataSource`, `decodeStoreMemoryStats`, `assertRuntimeResourceSnapshot` and custom `CellRenderer` results | A `SheetwriteError` with code `invalid-argument`; operations `store`, `transaction`, `render`, `row-bridge` and `resource-diagnostics` are new | [#309](https://github.com/chh-ay/sheetwrite/pull/309) |
| An unknown sheet ID threw a plain error | `not-found`, operation `store`, with `context.sheet` | [#309](https://github.com/chh-ay/sheetwrite/pull/309) |
| A bad limit override threw `limit` or `TypeError` | `invalid-limits` everywhere | [#309](https://github.com/chh-ay/sheetwrite/pull/309) |
| Operations `comments` and `export-xlsx` | Renamed to `comment` and `xlsx-export` | [#309](https://github.com/chh-ay/sheetwrite/pull/309) |
| `datasource-error` context copied column keys | Holds `columnBandCount` and the first 64 bands; read the keys from `event.request` | [#309](https://github.com/chh-ay/sheetwrite/pull/309) |
| A WASM trap threw an untyped `RuntimeError` | `engine-failed` (operation `engine`); the grid emits `engine-failed` and becomes read-only | [#296](https://github.com/chh-ay/sheetwrite/pull/296) |
| `renderer-fallback` errors told the cause in the message | `error.context.failure`: `spawn`, `crash`, `protocol`, `timeout` or `fatal` | [#296](https://github.com/chh-ay/sheetwrite/pull/296) |
| An aborted XLSX or CSV/TSV call rejected with `code: "aborted"` | Rejects with `signal.reason`; persistence and IndexedDB storage keep `aborted` | [#294](https://github.com/chh-ay/sheetwrite/pull/294) |
| `grid.summarizeSelection()` kept reading after `destroy()` | Rejects with an `AbortError` | [#315](https://github.com/chh-ay/sheetwrite/pull/315) |
| `<Sheetwrite>` in Vue and Svelte threw a plain `Error` for a bad `height`/`fill` | `invalid-argument`, operation `create-grid` | [#320](https://github.com/chh-ay/sheetwrite/pull/320) |
| `revision-failed`, `revision` | Removed with `RevisionCoordinator`; see [Revisions move to version history](#revisions-move-to-version-history) | [#390](https://github.com/chh-ay/sheetwrite/pull/390) |

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
see a rejected or empty change ([#321](https://github.com/chh-ay/sheetwrite/pull/321)):
`setColumnFilter`, `filterBy`, `hideRows`, `showRows`,
`groupRows`, `ungroupRows`, `setGroupCollapsed` and `clearView`, and
`grid.sortBy`. Code that implements these method types, or assigns them to a
callback type that returns `void`, must update the return type.

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

`sanitizeHyperlinkStyle` is removed; use `sanitizeCellStyle` instead
([#414](https://github.com/chh-ay/sheetwrite/pull/414)). The same check guards
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

## Stylesheet parts

`@sheetwrite/core/styles.css` now imports the stylesheet in parts, and the command icon sheet is its own file, `styles/icons.svg`, instead of a `data:` URL ([#543](https://github.com/chh-ay/sheetwrite/pull/543)). An app that imports `styles.css` looks the same.

| Change | What to do |
| --- | --- |
| `icons.css` loads `icons.svg` from beside it. | Nothing with Vite, webpack or Next.js. With esbuild, give `.svg` files a loader, for example `loader: { ".svg": "file" }`. Without one, the build fails with `No loader is configured for ".svg" files: icons.svg`. |
| The default icon sheet is a file from your origin, not a `data:` URL. | If you set `--sheetwrite-icon-sheet` only because your Content Security Policy blocks `data:` images, you can remove it. |
| The parts are published under `@sheetwrite/core/styles/` and in each framework adapter. | To ship less CSS, import only the parts your grid uses; see [Stylesheet parts](/docs/features/formatting/styles/#stylesheet-parts). |

## Direct engine calls

Most apps never call the engine directly. If you call `CellStore` from
`@sheetwrite/wasm` or `@sheetwrite/formulas` yourself, two methods change.

| 0.6 | 0.7.0 | Pull request |
| --- | --- | --- |
| `setSparseBlock(..., numbers, texts, styles, ...)` with one string per entry | `setSparseBlock(..., numbers, textBuf, textOffsets, styles, ...)`: the UTF-8 bytes of the string entries only, in entry order. The n-th string entry owns bytes `textOffsets[n]` to `textOffsets[n + 1]`; a block without text passes an empty buffer and `[0]`. | [#571](https://github.com/chh-ay/sheetwrite/pull/571) |
| `PivotFields.names()`, `PivotFields.types()` | `takeNames()`, `takeTypes()`. Each hands the buffer over once and leaves it empty. | [#565](https://github.com/chh-ay/sheetwrite/pull/565) |

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

## Behavior changes you will notice

### Excel sort order

Every sort uses Excel's sort order
([#377](https://github.com/chh-ay/sheetwrite/pull/377)): text compares without
case in Excel's character order and skips apostrophes and hyphens, errors sort
after `FALSE` and `TRUE` and are equal to each other, and blank cells are last
in both directions. A saved view sort with mixed-case text, errors, or blank
cells in a descending sort shows a different order after the upgrade. Sorting a
spilled column uses the spilled values
([#355](https://github.com/chh-ay/sheetwrite/pull/355)).

### Sort commands and the view sort

Sort A to Z and Sort Z to A in the ribbon, the toolbar and the column menu
move the cells. One undo restores them. To sort only the displayed rows, use
Sort View A to Z, Sort View Z to A, or "Sort view only" in Data › Custom Sort
([#393](https://github.com/chh-ay/sheetwrite/pull/393)). A view sort is still
saved with the sheet.

### Imported worksheet sort state

An imported worksheet `sortState` is no longer applied as a view sort. Excel
writes it after a sort that already moved the cells, so the rows keep the
order Excel saved. It is kept as `Sheet.sortState` and written back on export,
and the "sortState did not cover every data row" import warning is removed. An
in-place sort of a table body records the table's sort state, so Excel shows
the sort on the table's header buttons
([#398](https://github.com/chh-ay/sheetwrite/pull/398)).

### INFO and other new functions

`INFO` is new in both engines. It returns the sheet count for `"numfile"` and
`"Automatic"` for `"recalc"`, and `#N/A` for `"directory"`, `"origin"`,
`"osversion"`, `"release"` and `"system"`, which describe the desktop program
([#399](https://github.com/chh-ay/sheetwrite/pull/399)). Workbooks that showed
`#NAME?` for an Excel function that 0.7.0 adds now show a result. See the
[formula function contract](/docs/reference/formula-functions/).

### Formula results that match Excel

| Change | Pull request |
| --- | --- |
| Operators read number text as `VALUE` does: `="1,000"+0` is 1000 and `="2024-01-31"+0` is 45322. A space inside a number is text (`=VALUE("1 234")` is `#VALUE!`), date text with trailing words is `#VALUE!`, and the criterion `"inf"` is text. | [#335](https://github.com/chh-ay/sheetwrite/pull/335) |
| `ROUND`, `TEXT`, `CHOOSE`, `INDEX`, `SUMIF`, `FLOOR`, `CEILING`, `TRIM` and other functions give Excel's result; numbers become text with 15 significant digits. | [#300](https://github.com/chh-ay/sheetwrite/pull/300) |
| `SUBTOTAL` accepts codes 101 to 111 and skips hidden rows; `AGGREGATE` options 1, 3, 5 and 7 skip hidden rows; a subtotal does not count another subtotal. | [#306](https://github.com/chh-ay/sheetwrite/pull/306) |
| Paste, fill and conditional-format rules rewrite references with the engine's rules: `=SUM(A:A)` pasted one column right is `=SUM(B:B)`, and a reference that leaves the sheet becomes `#REF!`. `shiftA1Refs` needs `initSheetwrite()` first. | [#307](https://github.com/chh-ay/sheetwrite/pull/307), [#283](https://github.com/chh-ay/sheetwrite/pull/283) |
| XLSX import expands shared formulas with the same rule, so a shared whole-column reference moves with each cell. | [#322](https://github.com/chh-ay/sheetwrite/pull/322) |
| A row or column insert that a sheet cannot hold changes nothing; `addRows`, `removeRows`, `insertCols` and `removeCols` return `false`. | [#300](https://github.com/chh-ay/sheetwrite/pull/300) |
| A reference to another workbook, such as `[Budget.xlsx]Annual!C10`, keeps its text and shows `#REF!` until the workbook has values for the link. Before, the unquoted form was a syntax error and a quoted form made the whole formula `#REF!`. | [#430](https://github.com/chh-ay/sheetwrite/pull/430) |
| A sheet rename or delete, a row or column insert or delete, a tab move and a table change keep the formula text as written and change only its references: renaming `Sales` to `Sales Data` turns `=Sales!A1+1` into `='Sales Data'!A1+1`, not `=('Sales Data'!A1+1)`. | [#497](https://github.com/chh-ay/sheetwrite/pull/497) |
| Moving rows or columns (`moveRows`, `moveColumns`) moves the cells, as Excel's Cut and Insert Cut Cells does: references follow the moved cells instead of becoming `#REF!`, a range loses a moved row at its edge and grows by one that lands inside it, and a move that would split a table is refused. | [#499](https://github.com/chh-ay/sheetwrite/pull/499) |
| Array formulas whose size comes from a cell, such as `=SEQUENCE($C$1)`, spill in every formula of a recalculation; the third and later ones no longer show `#NUM!`. | [#574](https://github.com/chh-ay/sheetwrite/pull/574) |
| On paged data, `INDEX` that returns one cell shows `#LOADING!` only until that cell loads, and a short text result no longer shows `#NUM!` when other cells of its area hold a lot of text. | [#594](https://github.com/chh-ay/sheetwrite/pull/594) |

### Grid markup and loading

| Change | What to do | Pull request |
| --- | --- | --- |
| The toolbar, the ribbon and the compact ribbon render one command model. The `.sheetwrite-tb-*` classes are gone; each command element has a `data-command` attribute. The built-in toolbar loads with the ribbon's chunk. | Select commands by `data-command` in styles and tests, and wait for the toolbar after the grid mounts. | [#287](https://github.com/chh-ay/sheetwrite/pull/287) |
| `GridConfig` command flags (`CommandFlags`) choose ribbon commands too. | Check the ribbon after changing a flag such as `export`. | [#287](https://github.com/chh-ay/sheetwrite/pull/287) |
| The find bar loads on first open. | Open it with `grid.actions.find()` or Ctrl+F before looking for `.sheetwrite-find`. Expect one more lazy chunk. | [#313](https://github.com/chh-ay/sheetwrite/pull/313) |
| Typing, fill, paste or a remote edit inside a spill keeps the value and shows `#SPILL!` on the anchor. | Nothing; clearing the value restores the array. | [#352](https://github.com/chh-ay/sheetwrite/pull/352) |
| Saved hidden rows, collapsed groups and filters apply at load. | Nothing; `SUBTOTAL` no longer counts rows that a saved filter hides. | [#330](https://github.com/chh-ay/sheetwrite/pull/330) |

## How 0.7.0 compares with 0.5.4 and 0.6.1

These figures are measured on the release commit, with the same benchmark rows,
workbooks and machines for all three releases. They are not filled in yet.

| Measure | Engine | Linux 0.5.4 | Linux 0.6.1 | Linux 0.7.0 | Mac 0.5.4 | Mac 0.6.1 | Mac 0.7.0 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Formula recalculation, geomean time of the shared benchmark rows | default | — | — | — | — | — | — |
| Formula recalculation, geomean time of the shared benchmark rows | full | — | — | — | — | — | — |
| Retained memory, 100k formulas | default | — | — | — | — | — | — |
| Retained memory, 100k formulas | full | — | — | — | — | — | — |
| Peak memory, 100k formulas | default | — | — | — | — | — | — |
| Peak memory, 100k formulas | full | — | — | — | — | — | — |
| Engine download, Brotli | default | — | — | — | — | — | — |
| Engine download, Brotli | full | — | — | — | — | — | — |
| XLSX import | default | — | — | — | — | — | — |
| XLSX import | full | — | — | — | — | — | — |
| XLSX export | default | — | — | — | — | — | — |
| XLSX export | full | — | — | — | — | — | — |

## Upgrade from earlier versions

If you upgrade from a version before 0.6.0, first read
[Upgrade to 0.6.0](/docs/start/upgrade-to-0-6-0/).
