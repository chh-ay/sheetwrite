# @sheetwrite/core

## 0.7.0

### Minor Changes

- [#466](https://github.com/chh-ay/sheetwrite/pull/466) [`2800304`](https://github.com/chh-ay/sheetwrite/commit/28003040e4c0eed510d19bf960f65021bb522239) Thanks [@chh-ay](https://github.com/chh-ay)! - **Breaking:** add-ons install through one entry point, `initSheetwrite({ engine, source, addons })`.
  
  - Core exports one `SheetwriteAddon` type: a `name`, an optional `setup(context)` hook that gives core the add-on's page-wide parts, and an optional `grid({ grid, settings })` hook that runs for each new grid and may return a cleanup that runs when that grid is destroyed.
  - `initSheetwrite` takes one options object. `engine` selects the engine (the default engine otherwise), `source` gives explicit WASM bytes or a URL, and `addons` lists add-ons. Setup runs once per add-on, in list order, after the engine loads. A name listed twice in one call rejects with `invalid-argument` before any setup runs. A name installed by an earlier call is kept, so repeated calls, as framework adapters make, change nothing. The registry code loads only when a page installs an add-on.
  - `createGrid(host, { addons: { [name]: settings } })` and `createGridFromSnapshot` pass per-grid settings to an installed add-on. Settings for a name that `initSheetwrite` did not install reject with `invalid-argument` before the grid is built. A grid hook that throws destroys the grid.
  - Each add-on package exports one factory named `<name>Addon`, and each loads its heavy code on first use:
    - `chartsAddon()` from `@sheetwrite/charts`: the SVG drawing code loads when a grid is created.
    - `xlsxAddon()` from `@sheetwrite/xlsx`: the codec loads on the first XLSX call.
    - `functionsAddon([{ metadata, implementation }])` from `@sheetwrite/core/functions`: functions given at init apply to every grid; `addons: { functions: [...] }` adds functions to one grid and replaces init functions of the same name there. Functions register when a grid is created; there is no runtime add or remove.
    - `queriesAddon({ fetchSource })` from `@sheetwrite/queries`: each grid with a `fetchSource` gets a query session, which `querySessionOf(grid)` resolves to. The engine loads in the background when such a grid is created.
    - `historyAddon()` from `@sheetwrite/core/history`: a grid with `addons: { history: { archive, authorId } }` shows Version History and Save Version.
    - `externalLinksAddon({ resolve })` from `@sheetwrite/core/external-links`: gives each grid's Edit Links panel its Update Values resolver.
  - The React, Vue and Svelte grid components take an `addons` prop with the same per-grid settings. A change to it recreates the grid, like the other options that apply at creation.
  
  Removed: the `@sheetwrite/charts/register` entry; use `initSheetwrite({ addons: [chartsAddon()] })` instead.
  Removed: `registerChartsBackend()` from `@sheetwrite/charts`; use `initSheetwrite({ addons: [chartsAddon()] })` instead.
  Removed: the `@sheetwrite/xlsx/register` entry; use `initSheetwrite({ addons: [xlsxAddon()] })` instead.
  Removed: `registerXlsxBackends()` from `@sheetwrite/xlsx`; use `initSheetwrite({ addons: [xlsxAddon()] })` instead.
  Removed: `setChartRendererFactory` and `setChartViewProviderFactory` from `@sheetwrite/core`; use an add-on whose `setup` calls `context.charts({ views, renderer })` instead.
  Removed: `setXlsxWorkbookBackend`, `setXlsxTableImportBackend` and `setXlsxTableExportBackend` from `@sheetwrite/core`; use an add-on whose `setup` calls `context.xlsx({ workbook, tableImport, tableExport })` instead.
  Removed: the positional arguments of `initSheetwrite(source, engine)`; use `initSheetwrite({ source, engine })` instead.
  Removed: `registerFunction` from `@sheetwrite/core/functions`; use `functionsAddon([...])` at init or `createGrid(host, { addons: { functions: [...] } })` instead.
  Removed: `unregisterFunction` from `@sheetwrite/core/functions`; use a grid created without the function instead.
  Removed: `createQuerySession` from `@sheetwrite/queries`; use `queriesAddon({ fetchSource })` and `querySessionOf(grid)` instead.
  Removed: `registerQueryCommands` from `@sheetwrite/core`; use an add-on whose `grid` hook calls `context.queryCommands(commands)` instead.
  Removed: `createHistoryCommands` from `@sheetwrite/core/history` and `GridConfig.history`; use `historyAddon()` and `createGrid(host, { addons: { history: { archive, authorId } } })` instead.
  Removed: `HistoryCommandsOptions` from `@sheetwrite/core/history`; use `HistoryAddonOptions` instead.
  Removed: `connectExternalLinks` from `@sheetwrite/core/external-links`; use `externalLinksAddon({ resolve })` instead.

- [#320](https://github.com/chh-ay/sheetwrite/pull/320) [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f) Thanks [@chh-ay](https://github.com/chh-ay)! - **Behaviour change:** sync and collaboration coordinators treat an abort as cancellation, not as a failure.
  
  - Revision `list`, `preview` and `restore`, and comment `load`, `create`, `reply`, `resolve` and `mutate` accept a final optional `AbortSignal`. Cancelling, or destroying the coordinator, rejects the call with the signal's reason and emits no `error` event. A late response cannot create a preview grid or change the coordinator's version or threads.
  - Coordinator teardown and sync disconnection pass an `AbortError` reason to transport adapters, not a string.
  - A sync send aborted by `setOnline(false)` or `destroy()` rejects with that `AbortError` reason, not a `sync-failed` error, and emits no `error` event. The commit stays pending under its mutation ID.
  - Restoring durable pending commits stops after `destroy()`, and a storage abort caused by destroy is not reported as a hydration failure.
  - IndexedDB pending-commit storage keeps its typed `aborted` code.
  
  **Upgrade checklist:** do not compare cancellation reasons with the old string messages. Handle an `AbortError` rejection from comment `load`/`mutate` after `destroy()`, and from a sync send after `setOnline(false)`, as cancellation. Cancellation cannot undo a request the server already committed; keep mutation IDs to reconcile an ambiguous response.

- [#503](https://github.com/chh-ay/sheetwrite/pull/503) [`55bffb1`](https://github.com/chh-ay/sheetwrite/commit/55bffb17ed553f16f652aaed03f2cbd87b27970d) Thanks [@chh-ay](https://github.com/chh-ay)! - Charts draw multi-level category labels, as Excel does ([#501](https://github.com/chh-ay/sheetwrite/issues/501)).
  
  - A category range of several rows and several columns holds one category level per column (per row when the values run along a row). The last column labels each point. `ChartSeriesView.categoryLevels` holds the outer levels, outermost first, each with `labels` and `formats`; a blank cell continues the group above it. `categories` stays the innermost level, so charts with one level do not change.
  - A chart over a pivot with more than one row field gets its outer row fields as outer levels. `categories` holds the leaf items, not the joined `East / Retail` label.
  - The renderer draws one row of labels per level: each outer label once, centered under its group, with lines between categories and groups. Crowded inner labels turn to read upward, and outer labels wrap. In bar charts the outer labels stand left of the inner labels and read upward.
  - `ChartDefinition.axes.multiLevelLabels: false` draws one row of labels, each the text of its levels from the outside in (Excel's Format Axis › Multi-level Category Labels, cleared). The Chart panel has a **Multi-level category labels** check box when the categories have levels.
  - XLSX writes category levels as `c:multiLvlStrRef` and reads them back; `c:noMultiLvlLbl` round trips. A chart over a pivot now reads the cells that hold the pivot's values, with the values as its cache: over a native worksheet PivotTable it is that table's PivotChart (`c:pivotSource`), and over a dashboard pivot item it reads the item's cells. Without such cells it keeps literal data; category levels then have the formula `#REF!` and the labels in their cache.

- [#309](https://github.com/chh-ay/sheetwrite/pull/309) [`f8bce6b`](https://github.com/chh-ay/sheetwrite/commit/f8bce6bcea2f4bcedfacf38ec22ad64fc52fcd8a) Thanks [@chh-ay](https://github.com/chh-ay)! - Core failures have one shape. Bad host input and passed limits on public paths now throw a `SheetwriteError` with a code instead of a plain `Error`, `TypeError` or `RangeError`: simple columns, row bridge options and row IDs, `CellRenderer.dom()` results, store options, resource reports, restore blocks, transaction limits, datasource pages and unknown sheet IDs. `isSheetwriteError` checks the shape only, so it also accepts codes from a newer release. A failure stays small: its message and the strings in its `context` are cut to 8 KiB, a `context` over 1,024 entries becomes `{ truncated: true }` instead of making the constructor throw, and `SnapshotValidationError.errors` keeps the first 64 issues. `SyncProtocolError` keeps the original failure as its `cause`.
  
  Upgrade checklist:
  
  - If you catch `RangeError` or `TypeError` from `resolveTransactionResourceLimits`, `validateTransactionResources`, `createRowBridge`, `createSimpleGridInput`, `legacyFullWidthDataSource`, `decodeStoreMemoryStats`, `assertRuntimeResourceSnapshot` or a custom `CellRenderer`, check `isSheetwriteError(error)` and `error.code` instead. The new code is `invalid-argument`; the new operations are `store`, `transaction`, `render`, `row-bridge` and `resource-diagnostics`.
  - An unknown sheet ID throws `not-found` with operation `store` and `context.sheet`. Do not match the message.
  - A bad limit override throws `invalid-limits` everywhere, also from `IndexedDbPendingCommitStorage.load` (was `limit`) and direct workbook allocation (was `TypeError`).
  - The operation `comments` is now `comment`, and the grid export operation `export-xlsx` is now `xlsx-export`.
  - `datasource-error` contexts no longer copy column keys: they hold `columnBandCount` and the `start` and `end` of the first 64 bands. Read the keys from `event.request`.
  - If you `switch` over `SheetwriteErrorCode` or `SheetwriteErrorOperation` without a default case, add the new values.
  
  Changed: bad host input and passed limits on public paths throw a `SheetwriteError` (`invalid-argument`, `not-found`, `invalid-limits`) instead of `RangeError`, `TypeError` or `Error`; check `isSheetwriteError(error)` and `error.code` instead.
  
  Removed: the error operations `comments` and `export-xlsx`; use `comment` and `xlsx-export` instead.
  
  Changed: `datasource-error` contexts hold `columnBandCount` and the first 64 bands, not column keys; read the keys from `event.request` instead.

- [#321](https://github.com/chh-ay/sheetwrite/pull/321) [`b98d86b`](https://github.com/chh-ay/sheetwrite/commit/b98d86b61c767e0ba037723b9802ea855b2c8837) Thanks [@chh-ay](https://github.com/chh-ay)! - Synchronous sort, filter, hidden-row, row-group and view-clear methods now return the same `ApplyTransactionResult` as `applyTransaction`. Hosts can see when one of these calls is rejected or makes no change.
  
  Upgrade checklist:
  
  - `Grid.sortBy` and `Grid.sortByMulti` return `ApplyTransactionResult` instead of `void`.
  - `SheetwriteStore.sortBy`, `sortByMulti`, `setColumnFilter`, `filterBy`, `hideRows`, `showRows`, `groupRows`, `ungroupRows`, `setGroupCollapsed` and `clearView` return `ApplyTransactionResult` instead of `void`.
  - If your code implements these method types or assigns them to a callback type that returns `void`, update the declared return type.
  
  Changed: `store.setColumnFilter`, `filterBy`, `hideRows`, `showRows`, `groupRows`, `ungroupRows`, `setGroupCollapsed`, `clearView` and `grid.sortBy` return `ApplyTransactionResult` instead of `void`.

- [#414](https://github.com/chh-ay/sheetwrite/pull/414) [`94242d0`](https://github.com/chh-ay/sheetwrite/commit/94242d0eb3617f966a7df596bbfdb63c15349746) Thanks [@chh-ay](https://github.com/chh-ay)! - UI code uses one copy of each shared rule:
  
  - Double-clicking a column border fits the column to all of its rows with their cell fonts, as `grid.autoFitColumns` does, instead of only the rows on screen.
  - One cell style check guards hyperlinks, table styles and pasted Sheetwrite cells: font sizes from 1 to 409 points, as in Excel, and `#rrggbb` colors. A pasted style that breaks the check is dropped.
  - Anchored popups keep 8 px from the window edge, including the sheet tab menu.
  - With several ranges selected, the name box, formula bar, Explain Formula, link, note and PivotTable field commands use the top-left cell of the last range, where Excel keeps the active cell.
  
  Removed: `sanitizeHyperlinkStyle`; use `sanitizeCellStyle` instead.

- [#286](https://github.com/chh-ay/sheetwrite/pull/286) [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can register synchronous JavaScript functions that formulas call, on the full engine (`@sheetwrite/formulas`). Import `registerFunction(store, metadata, implementation)` and `unregisterFunction(store, name)` from `@sheetwrite/core/functions`; an application that does not import that entry carries none of its JavaScript, and the default engine binary does not change. On the default engine, `registerFunction` throws a `SheetwriteError` with code `optional-backend-unavailable`. A thrown error or a result that is not a number, text, boolean or `null` shows `#VALUE!`. A workbook that calls a function that is not registered shows `#NAME?`. `listFunctions(store)` returns the metadata of the built-in functions of the active engine and of the host functions in one list.

- [#479](https://github.com/chh-ay/sheetwrite/pull/479) [`1aada28`](https://github.com/chh-ay/sheetwrite/commit/1aada28341741ee998205962f203179a87c6c5b9) Thanks [@chh-ay](https://github.com/chh-ay)! - Dashboards show KPI cards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). A `DashboardKpiItem` (`kind: "kpi"`) shows the value of one data model measure, in the filter context of the dashboard's slicers, with an optional caption and number format. **Insert › Dashboard › KPI Card** adds one.

- [#478](https://github.com/chh-ay/sheetwrite/pull/478) [`4b705e2`](https://github.com/chh-ay/sheetwrite/commit/4b705e28bf9a003192d234b7e3becd385fe1481b) Thanks [@chh-ay](https://github.com/chh-ay)! - Dashboards show PivotCharts ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). `ChartDefinition.pivot` names a pivot on the same sheet; the chart shows its row items as categories and each value field, for each column item, as a series, without subtotals or totals, as an Excel PivotChart does. The new `DashboardChartItem` (`kind: "chart"`) shows such a chart in a dashboard box, and **Insert › Charts › PivotChart** adds both in one undo step. Slicers filter the chart with its pivot.

- [#416](https://github.com/chh-ay/sheetwrite/pull/416) [`9669e3c`](https://github.com/chh-ay/sheetwrite/commit/9669e3c83b42c23c9705477295baacc0b4c421fa) Thanks [@chh-ay](https://github.com/chh-ay)! - Add dashboard sheets ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). A sheet with `kind: "dashboard"` has no cells, rows or columns, and holds pivot and slicer items on a grid of 12 columns. The new `setDashboardItem` and `removeDashboardItem` operations are admitted (items stay inside the grid and do not overlap), undone, rebased, saved, synchronized and restored by version history. `SheetwriteStore` gets `getDashboard`, `setDashboardItem` and `removeDashboardItem`, and `grid.addSheet({ name, kind: "dashboard" })` adds a dashboard. New types: `SheetKind`, `Dashboard`, `DashboardBox`, `DashboardItem`, `DashboardPivotItem` and `DashboardSlicerItem`.

- [#467](https://github.com/chh-ay/sheetwrite/pull/467) [`acbd1e2`](https://github.com/chh-ay/sheetwrite/commit/acbd1e2864bfe552c30efd5303ec3ee9e215e721) Thanks [@chh-ay](https://github.com/chh-ay)! - Slicers filter dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). The slicers of a dashboard filter every pivot on it whose table reaches the slicer's table through many-to-one relationships, as report filters added when the pivot computes; the saved definitions do not change. In an editable grid a slicer selection is a saved, synced, undoable change; in a read-only grid it filters only that viewer's view. Insert › Filters › Slicer opens the Insert Slicers list on a dashboard.

- [#438](https://github.com/chh-ay/sheetwrite/pull/438) [`afa9bcc`](https://github.com/chh-ay/sheetwrite/commit/afa9bcc25a08321681187f8c300ff05b5e863271) Thanks [@chh-ay](https://github.com/chh-ay)! - Show dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). While a dashboard sheet is active, the grid shows its pivot and slicer items over the cells, from a chunk that loads the first time a dashboard is shown. Items move and resize with the mouse and with the keyboard; each step is one undo step. Slicer items list their column's values and save the values the user keeps. Insert › New Dashboard (`grid.actions.newDashboard()`, command state `newDashboard`) adds a dashboard, and on a dashboard Insert › PivotTable asks for a table and adds the pivot to the first free place. Pivots on a dashboard compute without placing output in cells; `getPivotResult` reports their status and size, and the dashboard view shows their cells.

- [#480](https://github.com/chh-ay/sheetwrite/pull/480) [`8298eda`](https://github.com/chh-ay/sheetwrite/commit/8298edad91dc51947941284785a83a2a662cecb1) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). Excel has no dashboard sheet, so each dashboard becomes a worksheet of its current values: pivot results, slicer selections and KPI values from the top-left of each item's box, and PivotCharts as native charts with literal data. The dashboard is saved in the Sheetwrite metadata and opens as a dashboard again. Core passes the computed values to the backend in the export context (`DashboardExport`, `DashboardItemExport`).

- [#396](https://github.com/chh-ay/sheetwrite/pull/396) [`b59c0af`](https://github.com/chh-ay/sheetwrite/commit/b59c0afccb201c5fb5d22584d311543e717ef71b) Thanks [@chh-ay](https://github.com/chh-ay)! - Add Data › Data Tools › Data Model and Relationships to the full ribbon, the compact ribbon and the toolbar ([#229](https://github.com/chh-ay/sheetwrite/issues/229)). Both open the data model panel, which loads on first use: it lists the workbook tables and the relationships with their key status, and creates, edits and deletes relationships as single undo steps. Data Model appears when the workbook has a table, and Relationships when it has two. As Excel does, the panel does not keep a relationship whose lookup keys repeat or whose key types differ.

- [#343](https://github.com/chh-ay/sheetwrite/pull/343) [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911) Thanks [@chh-ay](https://github.com/chh-ay)! - Add defined-name formulas and a lazy Name Manager under Formulas › Defined Names in the ribbon, compact ribbon, and toolbar. Names can hold constants, calculated values, references, or a reusable LAMBDA. Saves and deletes use document transactions, undo/redo, and collaboration.
  
  Plain named formulas evaluate in both engines. Named LAMBDA calls require the full engine; the default engine keeps and round-trips definitions but returns `#NAME?` when called. Recursive calls stop at 64 nested calls with `#NUM!`, below Excel's parameter-dependent allowance.
  
  A concurrent structural edit and a named-formula edit conflict and force a document reload. The pending edit remains available for host recovery; it is not rewritten across the remote structural edit.
  
  Keep defined-name formulas and scope in native XLSX. The engine converts Excel's future-function, LET binding, and LAMBDA parameter prefixes without changing quoted text or reference names. Formula-name conversion reuses the document engine or releases a temporary instance; range-only workbooks do not load one.

- [#489](https://github.com/chh-ay/sheetwrite/pull/489) [`ea18b3e`](https://github.com/chh-ay/sheetwrite/commit/ea18b3e1dceab79231f8df7aa21895f80ef556a3) Thanks [@chh-ay](https://github.com/chh-ay)! - The grid has Excel's **Data › Queries & Connections › Edit Links** panel for workbooks with external links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). It lists each linked workbook with its location and status, and runs **Update Values**, **Change Source** and **Break Link** as one undoable change each. The command shows only while the workbook has links, and the panel loads as its own chunk on first use. `connectExternalLinks(grid, resolve)` from `@sheetwrite/core/external-links` gives the panel a resolver for **Update Values**; without one, the panel offers **Change Source** and **Break Link** only. The ribbon and the toolbar now also update which commands show after document changes, not only after command-state changes.

- [#296](https://github.com/chh-ay/sheetwrite/pull/296) [`50a75e6`](https://github.com/chh-ay/sheetwrite/commit/50a75e6b993b75c1ca8c63ec261dd24e49d6ebe7) Thanks [@chh-ay](https://github.com/chh-ay)! - A WASM trap in the engine now stops the engine with the new error code `engine-failed` (operation `engine`) instead of an untyped `RuntimeError`. The call that trapped throws it. Every grid on that engine emits the new `engine-failed` grid event once, keeps its last frame and becomes read-only; `setReadOnly(false)` does not undo this. Stores on that engine refuse `applyTransaction`, `recalculateVolatile` and `loadPage` with the same code. Call `initSheetwrite()` again and create a new grid from a saved document to continue. The restart uses the compiled module again.
  
  Worker renderer failures are now typed `renderer-fallback` errors with `context.failure`: `spawn`, `crash`, `protocol`, `timeout` or `fatal`. A reply or request that one side cannot read stops the worker and falls back to the canvas renderer, where it was ignored before.
  
  Engine loading and memory release failures are typed too: `getEngine` before `initSheetwrite()` reports `initialization-required`, an engine change or a concurrent source reports `initialization-failed`, and a `releaseEngineMemory()` preparation that runs out of memory reports `resource-limit` (a trap reports `engine-failed`).
  
  Upgrade checklist:
  
  - If you catch errors from grid or store calls, handle `error.code === "engine-failed"`: destroy the grid, `await initSheetwrite()` and create a new grid from your last saved document. Do not read the failed grid or store for the document.
  - If you check `renderer-fallback` errors by message, use `error.context.failure` instead.
  - If you `switch` over `SheetwriteErrorCode` or `SheetwriteErrorOperation` without a default case, add `engine-failed` and `engine`.

- [#380](https://github.com/chh-ay/sheetwrite/pull/380) [`df99575`](https://github.com/chh-ay/sheetwrite/commit/df9957517d2f9f513d9da546fa6b9e2f7752f17f) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds Excel's Bessel functions `BESSELJ`, `BESSELY`, `BESSELI` and `BESSELK` ([#274](https://github.com/chh-ay/sheetwrite/issues/274)). They use the approximations that give Excel's published results. These are accurate to about 1E-8.
  
  The default engine does not change.

- [#371](https://github.com/chh-ay/sheetwrite/pull/371) [`9667e81`](https://github.com/chh-ay/sheetwrite/commit/9667e815c363f3ae03f5896273c3559a2a8aceda) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds the 34 statistical function names that Excel keeps for workbooks from Excel 2007 and earlier, so these workbooks no longer show `#NAME?` ([#273](https://github.com/chh-ay/sheetwrite/issues/273)):
  
  - `STDEV`, `STDEVP`, `VAR`, `VARP`, `MODE` and `COVAR` give the results of `STDEV.S`, `STDEV.P`, `VAR.S`, `VAR.P`, `MODE.SNGL` and `COVARIANCE.P`. `STDEV`, `STDEVP`, `VAR` and `VARP` read 3-D references, and these five list functions read unions.
  - `BETAINV`, `BINOMDIST`, `CHIDIST`, `CHIINV`, `CONFIDENCE`, `EXPONDIST`, `FDIST`, `FINV`, `GAMMADIST`, `GAMMAINV`, `LOGINV`, `NORMDIST`, `NORMINV`, `NORMSINV`, `POISSON`, `TINV` and `WEIBULL` give the results of their newer distribution functions. `CHIDIST` and `FDIST` are right-tailed, and `TINV` is two-tailed.
  - `BETADIST`, `LOGNORMDIST` and `NORMSDIST` always return the cumulative probability. `HYPGEOMDIST` and `NEGBINOMDIST` return the probability mass. `TDIST(x, deg_freedom, tails)` returns one or both tails of a non-negative `x`. `CRITBINOM` returns the smallest number of successes whose cumulative binomial probability is at least `alpha`.
  - `CHITEST`, `FTEST`, `TTEST` and `ZTEST` return the probability of the chi-squared, F, Student's t and z test statistics. `TTEST` supports paired, equal-variance and unequal-variance tests.
  
  The default engine does not change.

- [#379](https://github.com/chh-ay/sheetwrite/pull/379) [`466708a`](https://github.com/chh-ay/sheetwrite/commit/466708a5b45ab4774e6eafd27a79f824ea8a9591) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds Excel's complex number functions ([#274](https://github.com/chh-ay/sheetwrite/issues/274)): `COMPLEX` and the 25 `IM*` functions, such as `IMSUM`, `IMPRODUCT`, `IMDIV`, `IMEXP` and `IMSQRT`. They read and write complex numbers in Excel's text form, such as `3+4i` or `2-j`. Each part of a result has 15 significant digits. `IMSUM` and `IMPRODUCT` skip blank cells in a range.
  
  The default engine does not change.

- [#381](https://github.com/chh-ay/sheetwrite/pull/381) [`19ac121`](https://github.com/chh-ay/sheetwrite/commit/19ac1213c5f1323b339d05e8a0dcb32cbdeb7307) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds Excel's `CONVERT` function ([#274](https://github.com/chh-ay/sheetwrite/issues/274)). It converts between the units of Excel's 13 unit groups. Metric units take decimal prefixes, and `bit` and `byte` also take binary prefixes. Each factor is the exact definition of the unit, so a result can differ from Excel in the last digits.
  
  The default engine does not change.

- [#392](https://github.com/chh-ay/sheetwrite/pull/392) [`c67bb48`](https://github.com/chh-ay/sheetwrite/commit/c67bb489582f6920810aeba2f020ae5d4bec6266) Thanks [@chh-ay](https://github.com/chh-ay)! - More Excel statistics functions ([#277](https://github.com/chh-ay/sheetwrite/issues/277)):
  
  - Both engines add `AVERAGEA`, `MAXA`, `MINA`, `STDEVA`, `STDEVPA`, `VARA` and `VARPA`. A logical value counts as 1 or 0 and text in a reference counts as 0. Text typed as an argument is read as a number. Empty cells are skipped.
  - The full engine adds `BINOM.DIST.RANGE`, `BINOM.INV`, `HYPGEOM.DIST` and `NEGBINOM.DIST` (with the cumulative form), `GAMMALN.PRECISE`, and the current test names `CHISQ.TEST`, `F.TEST`, `T.TEST` and `Z.TEST`.

- [#376](https://github.com/chh-ay/sheetwrite/pull/376) [`cc07fea`](https://github.com/chh-ay/sheetwrite/commit/cc07fea9c9c6d2781fa829cafae4c0bfb40f4079) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds 23 of Excel's engineering functions ([#274](https://github.com/chh-ay/sheetwrite/issues/274)):
  
  - Base conversion between binary, octal, decimal and hexadecimal: `BIN2DEC`, `DEC2HEX`, `HEX2OCT` and the other nine pairs. Binary, octal and hexadecimal numbers have at most 10 digits, and 10 digits with the highest bit set are negative, in two's complement.
  - Bit functions on integers from 0 to 2^48 - 1: `BITAND`, `BITOR`, `BITXOR`, `BITLSHIFT` and `BITRSHIFT`.
  - `DELTA`, `GESTEP`, `ERF`, `ERF.PRECISE`, `ERFC` and `ERFC.PRECISE`.
  
  The default engine does not change.

- [#426](https://github.com/chh-ay/sheetwrite/pull/426) [`27bb47b`](https://github.com/chh-ay/sheetwrite/commit/27bb47bd95cfa5f8b35df9add770486b48a0b754) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds `GETPIVOTDATA` ([#280](https://github.com/chh-ay/sheetwrite/issues/280)). It reads a value cell of a pivot table: the data field by its source name or caption (`"Sales"` or `"Sum of Sales"`), the pivot by any cell of its output, and field and item pairs in any order, with numbers and date serials as items. A pivot, field or item that the output does not show gives `#REF!`, as in Excel. Formulas that use it recompute when the pivot output changes, including pivots over the data model.
  
  The default engine does not change.

- [#399](https://github.com/chh-ay/sheetwrite/pull/399) [`b08cb80`](https://github.com/chh-ay/sheetwrite/commit/b08cb80b3d3a29e34336b2c9cf65f4b8fae74840) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines add Excel's information functions `ERROR.TYPE`, `INFO`, `ISEVEN`, `ISODD`, `ISNONTEXT`, `ISREF`, `SHEET` and `SHEETS` ([#278](https://github.com/chh-ay/sheetwrite/issues/278)). `SHEET` and `SHEETS` count every sheet in tab order, hidden sheets too, and recompute when a sheet is added, removed, renamed or moved.
  
  `INFO` returns the sheet count for `"numfile"` and `"Automatic"` for `"recalc"`. It returns `#N/A` for `"directory"`, `"origin"`, `"osversion"`, `"release"` and `"system"`, which describe the desktop program. `STOCKHISTORY` stays unsupported by design, with the other external data functions.

- [#401](https://github.com/chh-ay/sheetwrite/pull/401) [`916b452`](https://github.com/chh-ay/sheetwrite/commit/916b452044664a2753150a7e061c6d08b369f5f4) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines add `LOOKUP` and `TRIMRANGE` ([#280](https://github.com/chh-ay/sheetwrite/issues/280)). `LOOKUP` has the vector form and the array form, which searches the first row of an array wider than it is tall and the first column otherwise. `TRIMRANGE` removes leading and trailing blank rows and columns; a range with no value is `#REF!`, as in Excel.
  
  `GETPIVOTDATA` is not added yet: formulas cannot read pivot results until the pivot API can answer a field and item query.

- [#382](https://github.com/chh-ay/sheetwrite/pull/382) [`5474c76`](https://github.com/chh-ay/sheetwrite/commit/5474c76349cf2bfa491893be1548ef274ca94904) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds Excel's 32 remaining financial functions ([#275](https://github.com/chh-ay/sheetwrite/issues/275)):
  
  - Coupon dates and days: `COUPDAYBS`, `COUPDAYS`, `COUPDAYSNC`, `COUPNCD`, `COUPNUM` and `COUPPCD`.
  - Accrued interest, prices, yields and durations of bonds: `ACCRINT`, `ACCRINTM`, `PRICE`, `YIELD`, `DURATION` and `MDURATION`, and `ODDFPRICE`, `ODDFYIELD`, `ODDLPRICE` and `ODDLYIELD` for an odd first or last period.
  - Discounted securities and Treasury bills: `DISC`, `INTRATE`, `PRICEDISC`, `PRICEMAT`, `RECEIVED`, `YIELDDISC`, `YIELDMAT`, `TBILLEQ`, `TBILLPRICE` and `TBILLYIELD`.
  - Depreciation: `VDB`, `AMORDEGRC` and `AMORLINC`.
  - `DOLLARDE`, `DOLLARFR` and `ISPMT`.
  
  All five day-count bases follow Excel's rules.
  
  The default engine does not change.

- [#400](https://github.com/chh-ay/sheetwrite/pull/400) [`9968bc5`](https://github.com/chh-ay/sheetwrite/commit/9968bc5511decc2a7aa7ce2f9c06861d0c52ae4f) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds Excel's byte, width and Thai text functions ([#279](https://github.com/chh-ay/sheetwrite/issues/279)):
  
  - `LENB`, `LEFTB`, `RIGHTB`, `MIDB`, `REPLACEB`, `FINDB` and `SEARCHB` count one byte per character, as Excel does when the default editing language is not a double-byte language.
  - `ASC` changes full-width ASCII characters, the ideographic space and katakana to half-width forms, and `DBCS` changes them back. A voiced katakana such as ガ becomes ｶﾞ.
  - `BAHTTEXT` writes a number as Thai words in baht and satang.
  
  The default engine does not change.
  
  `DETECTLANGUAGE`, `TRANSLATE` and `PHONETIC` stay unsupported by design: formula evaluation calls no translation service and cells store no furigana.

- [#391](https://github.com/chh-ay/sheetwrite/pull/391) [`675dd15`](https://github.com/chh-ay/sheetwrite/commit/675dd15b224763ebda96f5f0e06bceee908efcee) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines add 30 Excel math functions ([#276](https://github.com/chh-ay/sheetwrite/issues/276)):
  
  - Trigonometry: `SIN`, `COS`, `TAN`, `COT`, `CSC`, `SEC`, `ASIN`, `ACOS`, `ATAN`, `ATAN2` and `ACOT`.
  - Hyperbolic functions: `SINH`, `COSH`, `TANH`, `COTH`, `CSCH`, `SECH`, `ASINH`, `ACOSH`, `ATANH` and `ACOTH`.
  - Angles: `DEGREES` and `RADIANS`.
  - Numerals: `ROMAN` (all five forms), `ARABIC`, `BASE` and `DECIMAL`.
  - Rounding: `CEILING.PRECISE`, `FLOOR.PRECISE` and `ISO.CEILING`.

- [#500](https://github.com/chh-ay/sheetwrite/pull/500) [`6ec955a`](https://github.com/chh-ay/sheetwrite/commit/6ec955a0d74c229dfc7eeeb61631b02f69b101d4) Thanks [@chh-ay](https://github.com/chh-ay)! - Formulas can use the defined names of a linked workbook, as Excel does: `Budget.xlsx!Total`, `'C:\Reports\Budget.xlsx'!Total`, or `[Budget.xlsx]Annual!Total` for a name of one sheet. A name shows the saved values of the cells it refers to, and `#REF!` when the link does not hold it.
  
  - `ExternalLink.names` (type `ExternalLinkName`: `name`, `refersTo` and an optional `sheet`) keeps the names of a link in snapshots. `validateWorkbookSnapshot` checks their shape.
  - The store gives each name to the engine as a defined name spelled as formulas write it (`'[Budget.xlsx]'!Total`), whose references name the link's sheets. Both engines resolve every spelling of a link name to it, without case or folder.
  - XLSX import reads the `definedNames` of each external link part and turns `[1]!Total` into `Budget.xlsx!Total`; before, such formulas were kept as text. Export writes `[1]!Total` and the names back.
  - Change Source and Break Link also cover formulas that use a name of the link.

- [#481](https://github.com/chh-ay/sheetwrite/pull/481) [`7a7ba88`](https://github.com/chh-ay/sheetwrite/commit/7a7ba88f7c7f17b9527aa4384a4073899e0372b7) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can update, re-point and break external workbook links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). The commands load only from `@sheetwrite/core/external-links`, so an application that does not import them carries none of their code:
  
  - `updateExternalLinks(grid, resolve, books?)` asks the host's `ExternalLinkResolver` for the current values of each link, as Excel's "Update Values" does. It saves them in one undoable change and returns a status per link: `updated`, `unavailable` (the resolver gave `null`) or `failed`.
  - `changeExternalLinkSource(grid, book, { book, target })` points the formulas that name a workbook at another one, as "Change Source" does, and keeps the saved values until the next update.
  - `breakExternalLinks(grid, books)` replaces the formulas that read those workbooks with their values and removes the links, as "Break Link" does.
  - `listExternalLinks(grid)` returns the links. The entry also exports the formula-text helpers for external references (`rewriteExternalSheets`, `externalSheetText`, `formulaContainsExternalReference`, `formulaCallsExternalData`), which the XLSX codec now uses.
  
  A new document operation, `{ op: "setExternalLinks"; links }`, replaces the saved values of all links. It is undoable, syncs to collaborators, persists, and is restored with a workbook version. Excel clears Undo after "Update Values" and "Break Link"; Sheetwrite keeps them undoable, and an undo restores both the links and the formulas.
  
  In both engines, a formula that names a linked workbook reads the link as soon as it is added, also when the formula was entered first. `CellStore.removeExternalSheet(book, sheet)` removes a link sheet, and formulas that read it show `#REF!` and keep their text.

- [#301](https://github.com/chh-ay/sheetwrite/pull/301) [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula help in the cell editor and the formula bar. Autocomplete lists the built-in functions of the active engine and the store's custom functions; an argument guide shows the signature of the function around the caret with the current argument in bold; syntax errors, unknown names and wrong argument counts are underlined while you type; and each reference gets a colour in the text and the same colour on its range in the grid. **Formulas › Formula Auditing › Explain Formula** opens a side panel that describes the formula in the focus cell from function metadata. The function list is an ARIA listbox, and the guide is a polite live region. Formula help loads on the first formula edit, and the panel on first use, so they add almost nothing to the grid's first download. Host editors can use the same analysis: `analyzeFormula(text, cursor, functions)` from `@sheetwrite/core/functions` returns the tokens, references, call at the cursor, completions and problems of a formula. The Formulas tab now always shows; Insert Function in it still needs custom functions.

- [#315](https://github.com/chh-ay/sheetwrite/pull/315) [`cc9a143`](https://github.com/chh-ay/sheetwrite/commit/cc9a1430bea2f7e1bfdf56f883612c4aacdad42b) Thanks [@chh-ay](https://github.com/chh-ay)! - **Behaviour change:** `grid.destroy()` stops the grid's running work, and nothing of a destroyed grid or shell runs later.
  
  - `grid.summarizeSelection()` rejects with an `AbortError` when the grid is destroyed while it runs, or when it is called on a destroyed grid. Before, it kept reading the freed store. Its pause timer is cleared when it is aborted.
  - A clipboard action that a newer action of the same kind replaces (a second paste while the first one reads the clipboard; a copy or cut while another one writes) resolves `"empty"` and does not change the grid. A cut that the grid's destroy interrupts keeps its source cells. The actions still never reject.
  - After destroy, no timer, animation frame, document or window listener, observer or download object URL of the grid, its ribbon or toolbar, find bar, side panel, auto-fit, export or action alerts stays: an export's object URL is revoked at once. An XLSX export that runs at destroy is aborted and downloads nothing.
  - A ribbon, toolbar, find bar or panel chunk that loads after destroy (or after the chrome is rebuilt) does nothing, also in `createSpreadsheetShell`.
  - An open field menu in the pivot panel stops listening on the document when the panel closes.
  - An abort is never shown as an error alert.
  
  **Upgrade checklist:** if you call `summarizeSelection()` and can destroy the grid while it runs, handle the `AbortError` rejection as you handle your own signal's abort.
  
  Ribbon and toolbar popups ignore a late resize event when they were placed after the resize. A later change to the viewport or the trigger position still closes them.

- [#313](https://github.com/chh-ay/sheetwrite/pull/313) [`3c57cb9`](https://github.com/chh-ay/sheetwrite/commit/3c57cb9e038c94cd17c7fac9a7fff2d01344b03e) Thanks [@chh-ay](https://github.com/chh-ay)! - New `grid.trimMemory()` gives back the memory that an open grid can build again: decoded cell strings, rendered number text, compiled number formats, text measurement and unused overlay nodes, in the grid and in its worker renderer. Document data, undo history and the visible output do not change; the next frame builds only what it paints. Call it on a memory signal or when the page goes to the background. The number format caches are shared by all grids on the page, so a trim drops them for every grid. It does nothing after `destroy()`, and it does not shrink WebAssembly memory (use `releaseEngineMemory()` for that).
  
  The find bar code is now in its own chunk. The grid loads it and builds the find bar DOM when the find bar first opens, not when the grid is created. A grid that never opens the find bar does not download its code and has no `.sheetwrite-find` element. The first Ctrl+F, Ctrl+H or `grid.actions.find()` shows the bar after its chunk loads.
  
  Upgrade checklist:
  
  - If your code or tests look for `.sheetwrite-find` before the find bar opens, open it first with `grid.actions.find()` or Ctrl+F, then wait for the element to appear.
  - If your bundler setup lists the grid's lazy chunks (as for the ribbon and the panels), expect one more chunk for the find bar.

- [#365](https://github.com/chh-ay/sheetwrite/pull/365) [`3890a7a`](https://github.com/chh-ay/sheetwrite/commit/3890a7abdc2ce352119ef73cd62e4782206b438a) Thanks [@chh-ay](https://github.com/chh-ay)! - Add an opt-in version history archive ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). Import `HistoryArchive` and `MemoryHistoryStorage` from the new `@sheetwrite/core/history` entrypoint, and `IndexedDbHistoryStorage` from `@sheetwrite/core/browser/history`. The archive stores a checkpoint plus the committed document operations since it. Checkpoints are content-addressed chunks: one record per sheet, fixed 16-row by 4-column cell pages and separate metadata blocks, so a new checkpoint stores only the chunks that changed. Named and automatic versions record their author and time. `readVersion` rebuilds a version in a disposable store. Hosts keep history in their own backend through the four-method `HistoryStorageAdapter` (`put`, `get`, `list`, `prune`), with atomic publication, reference-counted pruning and byte ceilings. A grid that does not import these entrypoints loads no history code, timers, storage requests or arrays. New `SheetwriteErrorCode` values: `invalid-history`, `capacity` and `integrity`; new `SheetwriteErrorOperation` value: `history`.

- [#386](https://github.com/chh-ay/sheetwrite/pull/386) [`c0b2ac0`](https://github.com/chh-ay/sheetwrite/commit/c0b2ac0ee506b2ff4e57ae6012da0cbaaf6ceb1c) Thanks [@chh-ay](https://github.com/chh-ay)! - Version history records who made each change ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `SyncCoordinatorOptions.authorId` puts the editor's authenticated ID on each new `PendingCommit` (`authorId`), and `IndexedDbPendingCommitStorage` stores it, so a commit restored after a reload keeps its author. `VersionedOperation` gains `authorId` and `committedAt`; `SyncCoordinator` validates them, keeps them on `remote-applied` events and rejects an atomic batch whose members name different authors. `MemoryPersistenceAdapter.recordHistory(documentId, journal)` records each commit in a `CommitJournal` as the last step of the commit: when the journal rejects, the commit is not applied, published or acknowledged. `HistoryArchive` implements `CommitJournal`, and `HistoryArchive.record` takes the root type `CommittedTransaction`.

- [#405](https://github.com/chh-ay/sheetwrite/pull/405) [`4727a3d`](https://github.com/chh-ay/sheetwrite/commit/4727a3de909c0645d11a0dc74196fecfea68008c) Thanks [@chh-ay](https://github.com/chh-ay)! - Compare two history versions ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `HistoryArchive.diffVersions({ from, to, cursor, maxEntries, signal, kernel })` from `@sheetwrite/core/history` returns one page of at most 1,000 changes: changed cells as typed columns (`HistoryDiffCells`: sheet, row, column, earlier position, `HistoryDiffFlag` bits and last writer), the before and after of each cell (`HistoryDiffDetail`), sheets added, removed or changed outside their cells (`HistoryDiffSheet`), changed workbook fields and a `cursor` for the next page. Sources and styles are compared by content, not calculated values. Rows and columns are aligned through the structural operations of the log, and each change names the last person whose write reached the cell. The comparison runs in a separate history-only WASM kernel, `@sheetwrite/wasm/history` (16.6 KB gzip, no formula engine), that loads on the first diff; the default and full engines do not change. `HistoryVersion.checkpoints` and `HistoryHead.checkpoints` list the checkpoints made since the previous marker, so the log between two retained versions stays readable.

- [#421](https://github.com/chh-ay/sheetwrite/pull/421) [`3310e7e`](https://github.com/chh-ay/sheetwrite/commit/3310e7eeb14684e1386903d1462b3eb977b84106) Thanks [@chh-ay](https://github.com/chh-ay)! - Version history panel ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `createHistoryCommands({ archive, authorId, sync, authorName })` from `@sheetwrite/core/history` returns the `GridConfig.history` capability that shows Review › Version History and Save Version in the full ribbon, the compact ribbon and the toolbar (`GridActions.versionHistory`, `GridActions.saveVersion`, and command states of the same names). The panel loads as a separate chunk on the first command. It saves named versions after pending changes are committed, lists versions with authors, compares a version with a later one or with the current committed document page by page, opens a read-only preview, and restores the workbook, one sheet or a range after a confirmation. `HistoryArchive.diffVersions` accepts `to: "head"`, and a reader lease can name `"head"`.

- [#390](https://github.com/chh-ay/sheetwrite/pull/390) [`19fd4b5`](https://github.com/chh-ay/sheetwrite/commit/19fd4b541cbdc6343513c21f8c16b05e0efdea10) Thanks [@chh-ay](https://github.com/chh-ay)! - Restore a history version on a live grid ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `HistoryArchive.restoreVersion(grid, versionId, scope, { sync, signal })` from `@sheetwrite/core/history` restores the whole workbook, one sheet or one range (`HistoryRestoreScope`) as one undoable change: one undo step, one `change` event with `commitReason: "restore"` and, with `sync`, one synchronized transaction, sent as an atomic batch when it needs more than one server version. A sheet keeps its ID and is resized in place at its end; a reference into removed rows or columns becomes `#REF!` and comes back on undo. Retained OOXML parts (`xlsxSource`) are not restored, as with undo. A shared document must be idle to restore; the pending commit carries `PendingCommit.restore` (`RestoreProvenance`), is never rebased, and on conflict `SyncCoordinator.recoverConflict()` returns `reload-required` with reason `restore`. A range that cuts a merged cell or hyperlink rejects with the new `HistoryError` code `invalid-scope`.
  
  Removed: `RevisionCoordinator`, `RevisionAdapter`, `RevisionCoordinatorOptions`, `RevisionCoordinatorEvent`, `RevisionSummary`, `RevisionRestoreRequest` and `RevisionRestoreResponse`; use `HistoryArchive.listVersions`, `HistoryArchive.readVersion` and `HistoryArchive.restoreVersion` with a `HistoryStorageAdapter` instead.
  
  Removed: the `revision-failed` error code and the `revision` error operation; history failures use `HistoryError` codes instead.

- [#378](https://github.com/chh-ay/sheetwrite/pull/378) [`01b8d72`](https://github.com/chh-ay/sheetwrite/commit/01b8d729b92351e46e3f343aa08ca33604ef3284) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort cells in place, as Excel does. `store.sortRange(range, keys, { hasHeader })` moves the rows of a range in one undoable, synced transaction with the new `permuteRows` document operation and the new `"sort"` commit reason.
  
  - Values, formulas, cell styles, notes and one-row hyperlinks move with their row. Row heights, hidden rows, conditional formats, validation rules and protected ranges keep their addresses.
  - A formula in a moved row is adjusted for the move of its own row: relative row references without a sheet name move with the row; absolute rows and references with a sheet name stay. Formulas elsewhere keep their references and read the new values.
  - Hidden and filtered-out rows keep their place. Identically sized merged cells sort as whole records; other merged layouts reject the sort. A spill range that the sort would move only in part rejects the sort. A sort in a table must cover its whole body.
  - The operation carries the row order (one `u32` per row, base64), so every collaborator applies the same order. A concurrent edit inside the sorted range is a rebase conflict. Undo applies the inverse order and restores formulas whose adjusted references left the sheet.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - **Behaviour change:** XLSX and CSV/TSV aborts reject with `signal.reason`, not with a `SheetwriteError` that has `code: "aborted"`.
  
  - `fromXlsxWorkbook`, `fromXlsxWorkbookFile`, `fromXlsxTable`, `toXlsxWorkbook`, `toXlsxTable`, their streams, `buildXlsxModel`, and the CSV/TSV parse and export functions reject, throw or error with `signal.reason` after the signal fires. An abort is not a failure, so it is never a `SheetwriteError`.
  - `parseCsv`, `parseTsv` and `fromCsv` now check `signal` too: before the scan and once per 1,024 records.
  - The XLSX codec checks the signal once per ZIP entry, worksheet and chunk of cells, also while it builds the snapshot. An aborted import keeps no partial snapshot.
  
  **Upgrade checklist:** if your code tells an aborted XLSX or CSV/TSV call apart with `error.code === "aborted"`, check `signal.aborted` (or `error === signal.reason`) instead. Persistence and IndexedDB storage still use `code: "aborted"`.
  
  Changed: aborted XLSX and CSV/TSV calls reject with `signal.reason`, not a `SheetwriteError` with code `aborted`; check `signal.aborted` instead.

- [#477](https://github.com/chh-ay/sheetwrite/pull/477) [`3ef2323`](https://github.com/chh-ay/sheetwrite/commit/3ef2323d90d26e6f2be276b4ad799259ccb7b45f) Thanks [@chh-ay](https://github.com/chh-ay)! - Measures can use `CALCULATE(expression, filter, …)` to evaluate an expression in a changed filter context ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).
  
  - A filter compares one model column with a value (`Customers[Region]="West"`, `Orders[Month]>=3`) and replaces the cell's row items, column items and report filter on that column, or is `ALL(Table[Column])` and removes them. Filters on other columns stay, and filters still flow from the one side to the many side only.
  - Other filters (`ALL(Table)`, `FILTER`, a comparison of two columns) and a `CALCULATE` inside another show `#VALUE!`. In cell formulas `CALCULATE` and `ALL` stay unknown functions (`#NAME?`), as in Excel.

- [#485](https://github.com/chh-ay/sheetwrite/pull/485) [`969dc82`](https://github.com/chh-ay/sheetwrite/commit/969dc8211886ca106bac441ff5f8e6a6254fcbdd) Thanks [@chh-ay](https://github.com/chh-ay)! - Charts over a pivot can plot only some of its values, measures included ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).
  
  - New `ChartDefinition.pivotValues`: the positions in the pivot's `values` that a chart over a pivot plots. Absent plots every value field.
  - The Chart panel shows a **Values** section for a chart over a pivot, listing the pivot's value fields with measures next to fields. Each change is one undo step, and at least one value stays plotted.

- [#458](https://github.com/chh-ay/sheetwrite/pull/458) [`17664a9`](https://github.com/chh-ay/sheetwrite/commit/17664a95da5d137a5e0863f9434ffa5d6ccbc771) Thanks [@chh-ay](https://github.com/chh-ay)! - Measures read related tables, refer to other measures, and follow renames ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).
  
  - A measure reads qualified columns of any model table. Another table than the pivot's base sees its rows that match the cell's row items, column items and report filters on the fields it reaches through many-to-one relationships; other fields put no condition on it, so filters flow from the one side to the many side only.
  - `[Name]` in a measure formula refers to another measure, ignoring case. An unknown name shows `#REF!`; measures that refer to each other in a cycle show `#VALUE!`.
  - Renaming a table or a table column with `updateTable` rewrites the measure formulas that name it, and renaming a measure with `setMeasure` rewrites the `[Name]` references to it, within the same undo step. `rebaseDocumentOperations` reports a pending `setMeasure` and a concurrent `updateTable` that renames the table or its columns as an `overlapping-edit` conflict, in either order, so collaborating peers reload and converge on the renamed formulas.
  - New engine function `renameStructuredReference(source, table, column, to)` renames a table (empty `column`) or a table column in the structured references of formula text, keeping the rest of the text.
  - `GETPIVOTDATA` reads measure values by the measure name.

- [#490](https://github.com/chh-ay/sheetwrite/pull/490) [`c4933f9`](https://github.com/chh-ay/sheetwrite/commit/c4933f93d43e82e7613482e80fd8c822ff13fdaa) Thanks [@chh-ay](https://github.com/chh-ay)! - Measures have a command and a panel, and the PivotTable field list lists them ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).
  
  - **Data › Data Tools › Measures** opens the Measures panel. It lists the measures under their home tables, each with a note when its formula does not parse or its table is gone, and has a form to create, edit and remove measures. Each change is one undo step.
  - The PivotTable field list shows the measures a pivot does not use yet under **Measures: Table**, with **Add to Values**. A pivot over one table becomes a model pivot with the same fields when a measure is added.

- [#406](https://github.com/chh-ay/sheetwrite/pull/406) [`b0668a3`](https://github.com/chh-ay/sheetwrite/commit/b0668a31e8074c494d42889ed0d078683d0f89c5) Thanks [@chh-ay](https://github.com/chh-ay)! - The pivot field list shows the columns of related tables ([#229](https://github.com/chh-ay/sheetwrite/issues/229)). A pivot over a table gets one **Related** section for each table that its table reaches through relationships. Adding a related column turns the table source into a model source in the same undo step, and keeps the indices of the fields in use. Related fields show their table name, for example `Customers › Region`.

- [#419](https://github.com/chh-ay/sheetwrite/pull/419) [`444420c`](https://github.com/chh-ay/sheetwrite/commit/444420ccc6c529d21c9712ef6c2a55d10f7b61e7) Thanks [@chh-ay](https://github.com/chh-ay)! - Add measures to the workbook data model: formulas over model columns, calculated in the filter context of each pivot cell ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).
  
  - New type `Measure` (`id`, `name`, home `table`, `formula`) saved in `workbook.dataModel.measures`, and `MeasureStatus`.
  - New document operations `setMeasure` and `removeMeasure`, and the store methods `getMeasures()`, `setMeasure()`, `removeMeasure()` and `getMeasureStatus()`. Each change is one undo step and is saved, synchronized and restored from version history. Measure names are unique ignoring case and differ from the column names of their home table. `getMeasureStatus()` checks the home table and the formula syntax on every engine.
  - `PivotValueField` has a second form, `{ measure, name? }`, for pivots with a model source. Each value cell, subtotal and grand total evaluates the measure over the base rows that the cell's row items, column items and report filters select, so totals are not sums of the cells above them.
  - A measure reads qualified columns of the pivot's base table, such as `=SUM(Sales[Amount])/SUM(Sales[Qty])`, with any worksheet function. A formula that does not parse shows `#NAME?` in its cells, a missing table or column `#REF!`, and a cell reference or another table's column `#VALUE!`. A removed measure shows `#REF!` at the pivot anchor until undo restores it.
  - The full engine receives measures in the `setRelationships` payload, as records `[id, homeTable, formula, "", name]`, and keeps no measure state between recomputes: each update groups the base rows by output cell with one counting pass per pair of axis depths and binds each cell's rows to the formula. The default engine keeps and synchronizes measures without computing them.
  - `RowBridgeMetadataDelta.metadata` has the new value `"measure"`.
  - Measures and pivots that use them are kept in Sheetwrite metadata on XLSX export, as model pivots are, because Excel keeps measures in its data model part.

- [#388](https://github.com/chh-ay/sheetwrite/pull/388) [`b549147`](https://github.com/chh-ay/sheetwrite/commit/b549147b27a46393ececb62accbac54a8ca0d5a6) Thanks [@chh-ay](https://github.com/chh-ay)! - Pivot tables can use fields from related tables ([#229](https://github.com/chh-ay/sheetwrite/issues/229)).
  
  - New pivot source `{ model: { table, fields } }`. `table` is the base (many-side) table; each field names a table and column by stable IDs. A field's table must be the base table or a table that the base reaches through many-to-one relationships.
  - The output equals a pivot over the lookup-flattened table: an unmatched or blank key gives a blank related value, and an error in a many-side key carries that error. A duplicate one-side key or a key type mismatch shows `#VALUE!`; a missing table, column or relationship shows `#REF!`.
  - The full engine reads related values through sorted key indexes built for each pivot rebuild, and keeps no index or row map between recomputes. An edit in a related table rebuilds the pivot.
  - XLSX export keeps a model pivot in Sheetwrite metadata and warns, because Excel needs a data-model binary for it.

- [#287](https://github.com/chh-ay/sheetwrite/pull/287) [`dd153bb`](https://github.com/chh-ay/sheetwrite/commit/dd153bb24808b011b90c48cf8d3061a743b7d0e6) Thanks [@chh-ay](https://github.com/chh-ay)! - The toolbar, the full ribbon and a new compact ribbon render one command model. They show the same commands, glyphs, enabled and pressed state, accessible names and keyboard behavior.
  
  - The compact ribbon shows a tab's commands on one row. Set `config.ribbon` to `{ mode: "compact" }`, or to `{ mode: "auto", compactWidth }` to use compact below a width (default 768 px). The **Compact** button beside the tab list switches layout.
  - The toolbar shows the ribbon's commands on one row. Commands that do not fit move into a **More commands** popup. Font Color and Fill Color are palettes, and Borders, Clear and Merge & Center are menus, as in the ribbon.
  - The `GridConfig` command flags (`bold`, `sort`, `export` and the others, typed as `CommandFlags`) now choose commands in the ribbon too. `export: true` adds an Export group with Export CSV and Export XLSX.
  - Every command element has a `data-command` attribute. The old `.sheetwrite-tb-*` classes are gone.
  - The built-in toolbar loads with the ribbon's chunk, so it appears after the grid mounts.
  - The shell toolbar also loads lazily, with its row height reserved. Custom Border, Merge, Unmerge and Clear Formats items keep their one-click behavior.
  
  Removed: the `.sheetwrite-tb-*` toolbar classes; use the `data-command` attribute instead.

- [#460](https://github.com/chh-ay/sheetwrite/pull/460) [`d83d1bc`](https://github.com/chh-ay/sheetwrite/commit/d83d1bc1c43941523448322e04de2f190ca4d9e7) Thanks [@chh-ay](https://github.com/chh-ay)! - Pivot value fields get a number format (`PivotValueField.numberFormat`), as Excel's Value Field Settings › Number Format. The grid paints it on the field's value cells, subtotals and grand totals included, and dashboards show it. The field list has **Number Format…** in each value field's actions menu. A new value field stays General, as in Excel. XLSX export writes it as the `dataField` `numFmtId`, and import reads it.

- [#394](https://github.com/chh-ay/sheetwrite/pull/394) [`2251d6e`](https://github.com/chh-ay/sheetwrite/commit/2251d6eab0951e556c13fa9a5c8bf1639608dd0d) Thanks [@chh-ay](https://github.com/chh-ay)! - Write saved queries to XLSX as Power Query M and read them back. Pass
  `powerQuery: await loadPowerQueryCodec()` to `toXlsxWorkbook` and
  `fromXlsxWorkbook`. Export writes a DataMashup part, plus a workbook connection
  and a query table for each output table. Import parses supported M members into
  saved queries and never evaluates M. Other members stay in the kept part and are
  reported with a new `query-loss` warning. Without a codec, a kept DataMashup is
  written back only while the saved queries are unchanged since import.

- [#417](https://github.com/chh-ay/sheetwrite/pull/417) [`1d49097`](https://github.com/chh-ay/sheetwrite/commit/1d49097901768723e2bd0e880ee0e33256e0a958) Thanks [@chh-ay](https://github.com/chh-ay)! - Add the Data › Get Data, Refresh All and Queries & Connections commands to the
  ribbon, the compact ribbon and the toolbar. `createQuerySession` shows them
  through `registerQueryCommands`, and `dispose` removes them. Refresh All
  cancels a running refresh when pressed again. The Queries & Connections panel
  loads as its own chunk; it edits the source, output table and supported steps
  as short text lines and saves through the engine check. XLSX import with a
  Power Query codec records unsupported members on the kept DataMashup graph
  (`XlsxSourceGraph.unsupportedQueries`), and the panel lists them read-only.

- [#373](https://github.com/chh-ay/sheetwrite/pull/373) [`d0b34a7`](https://github.com/chh-ay/sheetwrite/commit/d0b34a770f74e2f42ab4bf67b3a9387b158537bf) Thanks [@chh-ay](https://github.com/chh-ay)! - Check the keys of table relationships in the full engine ([#229](https://github.com/chh-ay/sheetwrite/issues/229)).
  
  - New `SheetwriteStore.getRelationshipStatus(id)` returns a `RelationshipStatus`: `ok` with the count of unmatched many-side keys, `missingTable`, `missingColumn`, `typeMismatch` (side and row), `duplicateKey` (both one-side rows), or `unavailable` on the default engine and for an unknown ID.
  - Keys match as pivot group keys do: numbers by value and text without case. A blank key matches nothing. The one-side keys must be unique, and both columns must hold only numbers or only text.
  - The engine checks keys with a sorted index of the one-side keys: one sort, then one binary search per many-side key. It builds the index for each check and keeps nothing between checks, so a workbook with relationships holds only their IDs in the engine.

- [#295](https://github.com/chh-ay/sheetwrite/pull/295) [`9ef07fe`](https://github.com/chh-ay/sheetwrite/commit/9ef07fea96dd5491352ad9ffe54aa5270dc61ff1) Thanks [@chh-ay](https://github.com/chh-ay)! - The ribbon and the toolbar get **Formulas › Insert Function** for custom functions, 16 new glyphs for the 0.7 features, a tab row that scrolls when it is narrow, and new group dividers.
  
  - **Insert Function** lists the functions registered with `registerFunction` (full engine), each with its signature and description as the tooltip. Picking one starts `=NAME(` in the focus cell's editor. The Formulas tab, and the command in the toolbar, show only while the store has a registered function.
  - New glyphs: `insertFunction`, `defineName`, `nameManager`, `explainFormula`, `getData`, `refreshAll`, `queries`, `editLinks`, `relationships`, `dataModel`, `measure`, `dashboard`, `slicer`, `kpiCard`, `versionHistory` and `saveVersion`. `ICON_NAMES`, `IconName` and `@sheetwrite/core/icons.json` list them. They take new rows on the sheet; no published glyph moves, so a replacement sheet drawn for 0.6 still lines up.
  - When the tabs do not fit, the tab row scrolls sideways instead of running under the **Compact** button. Focusing a tab with the keyboard scrolls it into view.
  - The divider between ribbon groups stops short of the panel edges, so each group label reads as the caption of its controls.

- [#363](https://github.com/chh-ay/sheetwrite/pull/363) [`72fb51c`](https://github.com/chh-ay/sheetwrite/commit/72fb51c15c49a625e726d8f110e48dfdedd0d7ef) Thanks [@chh-ay](https://github.com/chh-ay)! - Add File › Import XLSX when a workbook backend is registered. The command opens a native file picker and replaces the workbook without recreating the grid or its chrome.
  
  Add `grid.importWorkbook(snapshotOrLoader, { signal? })`. A new import aborts the previous loader. Parsing and validation finish before replacement, so failure keeps the old document and undo history. Successful import frees old document resources and clears undo and redo, like Excel Open. Import is blocked for attached collaboration sessions, injected stores and datasource-backed grids.
  
  Keep the optional XLSX registration bridge separate from CSV code. Core does not ship an XLSX codec.

- [#383](https://github.com/chh-ay/sheetwrite/pull/383) [`5e9ba79`](https://github.com/chh-ay/sheetwrite/commit/5e9ba79d2fc0eb562fde68a2261f3633d678bd3a) Thanks [@chh-ay](https://github.com/chh-ay)! - Save refreshable queries in the workbook. `workbook.queries` holds each query's
  source, steps and output table. The undoable, synced `setQuery` and `removeQuery`
  operations change them. `createQuerySession(grid, { fetchSource })` checks
  definitions in the query engine. It refreshes one query, or all queries, as one
  undoable transaction that writes the output tables. Sources load only through the
  host callback. CSV records with fewer fields than the declared columns have null
  in the missing columns, and extra fields are ignored, as in Power Query's
  `Csv.Document`.

- [#475](https://github.com/chh-ay/sheetwrite/pull/475) [`1c41081`](https://github.com/chh-ay/sheetwrite/commit/1c410818c95bf1f27ed5fa3744e580cf7c9bc7b5) Thanks [@chh-ay](https://github.com/chh-ay)! - Slicers mark values with no data, as Excel does ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). A slicer dims each value that no row has under the other slicers; `itemsWithNoData: "hide"` hides those values and `"show"` shows every value plainly, matching Excel's slicer settings. The engine computes this in the normal pivot pass, with one hidden pivot per slicer.

- [#393](https://github.com/chh-ay/sheetwrite/pull/393) [`b7cef92`](https://github.com/chh-ay/sheetwrite/commit/b7cef927b5223a57f2f5fd08d1a4b4749f0fa31a) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort commands rewrite the cells, as Excel does; the view sort stays as an option.
  
  - Sort A to Z and Sort Z to A (ribbon, compact ribbon, toolbar and the column context menu) and `grid.sortBy(col, ascending)` run Excel's quick sort: they sort the cells of the table body that holds the focus cell, or else the selected range, or else the current region around the focus cell. A first row of text over other values stays as a header. One undo restores the cells.
  - Data › Custom Sort opens the Sort panel: a range, "My data has headers", up to 64 sort levels, and "Sort view only".
  - Sort View A to Z and Sort View Z to A sort the displayed rows without moving cells.
  - New: `grid.sortRange(range, keys, { hasHeader })`, `grid.setViewSort(keys)`, `store.setViewSort(sheet, keys)`, the `sortView` and `customSort` grid actions, the `sortAscending`, `sortDescending`, `sortViewAscending` and `sortViewDescending` context-menu actions, and the `sortCustom` and `sortView` icons.
  
  Breaking changes:
  
  - Changed: `grid.sortBy(col, ascending)` now sorts the cells in place; for the display-only sort, use `grid.setViewSort([{ col, ascending }])` instead.
  - Removed: `store.sortBy(sheet, col, ascending)`; use `store.setViewSort(sheet, [{ col, ascending }])` instead.
  - Removed: `store.sortByMulti(sheet, keys)`; use `store.setViewSort(sheet, keys)` instead.
  - Removed: `grid.setSort(keys)`; use `grid.setViewSort(keys)` instead.
  - Removed: `grid.sortByMulti(keys)`; use `grid.setViewSort(keys)` instead.

- [#398](https://github.com/chh-ay/sheetwrite/pull/398) [`d59c5e6`](https://github.com/chh-ay/sheetwrite/commit/d59c5e693a45fd51392d3f1fa48f91548c4e1b7e) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort round trips with XLSX as in Excel.
  
  - An in-place sort of a table body records the table `sortState` in the same transaction, so Excel shows the sort on the table.
  - An imported worksheet `sortState` is kept as `Sheet.sortState` and written back on export, but no longer applied as a view sort: Excel writes it after a sort whose cells it already moved. A live view sort comes only from Sheetwrite's own metadata.
  - Removed: the "sortState did not cover every Sheetwrite data row" import warning; an imported worksheet `sortState` is now kept whatever rows it covers.
  - On export, a kept worksheet `sortState` that no longer fits the sheet is dropped with an `unsupported-feature` warning.

- [#306](https://github.com/chh-ay/sheetwrite/pull/306) [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUBTOTAL` and `AGGREGATE` skip hidden rows, as in Excel:
  
  - `SUBTOTAL` accepts codes 101 to 111. All codes skip the rows that a filter hides. Codes 101 to 111 also skip the rows that you hide (`hideRows`) and the rows of a collapsed row group. Before, codes 101 to 111 returned `#VALUE!`.
  - `SUBTOTAL` reads a cell argument, such as `A2` in `=SUBTOTAL(9,A2)`, as a reference: text in the cell is ignored, as in Excel, and the cell's row can be hidden.
  - `SUBTOTAL` skips cells whose formula calls `SUBTOTAL` or `AGGREGATE`, as `AGGREGATE` already did, so a subtotal is not counted two times.
  - `AGGREGATE` options 1, 3, 5 and 7 skip hidden rows. Before, they had no effect.
  - When you hide or show rows, collapse or expand a row group, or change a filter, only the `SUBTOTAL` and `AGGREGATE` formulas that read the sheet calculate again. Core sends the hidden rows of a sheet in one engine call per transaction.
  - New engine export `CellStore.setHiddenRows(sheet, manual, filtered)` sets the hidden rows of a sheet as packed `[first, last]` row ranges. A sheet without hidden rows uses no extra memory.

- [#368](https://github.com/chh-ay/sheetwrite/pull/368) [`97796fe`](https://github.com/chh-ay/sheetwrite/commit/97796fe66ab5551a95b5fea9253e73b08d683646) Thanks [@chh-ay](https://github.com/chh-ay)! - Add a workbook data model: one-to-many relationships between workbook tables, saved in `workbook.dataModel.relationships` ([#229](https://github.com/chh-ay/sheetwrite/issues/229)).
  
  - New types `DataModel`, `TableRelationship` and `TableColumnRef`. A relationship names a many-side (`from`) and a one-side (`to`) column by stable table and column IDs, as Excel's `x15:modelRelationship` does.
  - New document operations `setRelationship` and `removeRelationship`, and the store methods `getRelationships()`, `setRelationship()` and `removeRelationship()`. Each change is one undo step and is saved and synchronized.
  - A new relationship needs existing columns in two different tables. At most one relationship joins two tables, and relationships form no cycle. A relationship whose table or column is removed stays saved, so undo restores a working model.
  - Rebase reports a conflict for two concurrent relationship changes, and for a pending relationship whose table a concurrent edit changes or removes.
  - `RowBridgeMetadataDelta.metadata` has the new value `"relationship"`.

- [#498](https://github.com/chh-ay/sheetwrite/pull/498) [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557) Thanks [@chh-ay](https://github.com/chh-ay)! - A chart over a worksheet pivot (`ChartDefinition.pivot`) plots the pivot's leaf items, as an Excel PivotChart does. Before, it showed only on dashboards. The categories are the leaf row items, with the outer items joined into each label (`East / Retail`), and each value field, for each column item, is one series. Subtotals and grand totals are never points, in compact and tabular layout. The chart follows the pivot's fields, filters and source edits, `pivotValues` picks the values it plots, and it keeps no values of its own.
  
  - The full engine computes a copy of the pivot for its charts, without totals and without cells: core anchors the copy right of the last column, and a pivot anchored right of the last column of its sheet places no output.
  - The code that reads charts over pivots loads with the first such chart. A change event names the charts when it has loaded; that event has no `epoch`.
  - With the active cell in a worksheet pivot, Insert › Charts › PivotChart adds a chart over that pivot to the right of its output.
  - XLSX export writes the chart with the values it plots, and import reads it back as a chart over the pivot.

- [#462](https://github.com/chh-ay/sheetwrite/pull/462) [`50eb898`](https://github.com/chh-ay/sheetwrite/commit/50eb89857ce7791003eb8a7e200682396ce7fd83) Thanks [@chh-ay](https://github.com/chh-ay)! - Workbooks keep the saved values of linked workbooks, and XLSX files keep their external links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). A snapshot holds them in `workbook.externalLinks`: for each linked workbook, its file name (`book`), its location (`target`) and the saved cells of its sheets (`ExternalLink`, `ExternalLinkSheet`, `ExternalLinkCell`, `ExternalLinkValue`). The store gives them to the engine before formulas load, so `[Budget.xlsx]Annual!C10` shows the saved value in both engines. `validateWorkbookSnapshot` checks the shape of the links only (unique book names, targets, named sheets with cell arrays). The store checks each saved cell when it loads the snapshot, and an invalid cell fails the load with `invalid-snapshot`.
  
  XLSX import reads Excel's external link parts. Formulas that read a link, such as `'[1]Annual Plan'!C10` in the file, stay live as `'[Budget 2024.xlsx]Annual Plan'!C10`; before, they were kept as text. XLSX export writes the `[n]` form back. An unchanged link part is written byte for byte, a changed link is written from its saved values, and a workbook that a formula names without a link gets a link with no values. Formulas that name a defined name of another workbook, and DDE and OLE links, are still kept as text or dropped with a warning, as before.

### Patch Changes

- [#293](https://github.com/chh-ay/sheetwrite/pull/293) [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd) Thanks [@chh-ay](https://github.com/chh-ay)! - Fix more bugs from the 0.6.0 audit:
  
  - Pasting `-5` or `+1` from HTML (Excel, Google Sheets) into a number column stores a number. Only text that would become a formula gets a leading quote.
  - A row or column delete shrinks a conditional-format formula range whose edge was deleted (`=SUM(A1:B4)` becomes `=SUM(A1:B2)`). Only a range with no rows or columns left becomes `#REF!`.
  - The formula bar keeps a pasted or dropped draft when the grid refreshes.
  - Formula reference highlights skip text in quotes and references to other sheets.
  - A cell edit no longer closes an open sheet tab menu in the spreadsheet shell.
  - Auto-fit row height from the menu fits the selected row under a sort or filter.
  - Search over a custom store reports data rows when the store offers `getDataWindow`.
  - A failed PivotTable placement shows its error in the form instead of an unhandled rejection.
  - A toolbar or ribbon that cannot load tells the user why in the grid's alert. The load error still reaches the host.
  - A row bridge clear lists only the cells that changed, so clearing whole columns no longer creates one object per empty cell.
  - Disposing a store ends an engine memory release that was waiting for its page loads.

- [#283](https://github.com/chh-ay/sheetwrite/pull/283) [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53) Thanks [@chh-ay](https://github.com/chh-ay)! - Fix several bugs that changed user data:
  
  - Fill, copy and row or column edits keep function names such as `LOG10` and `BIN2DEC`. A reference that moves outside the sheet, before column A or row 1 or past column XFD or row 1048576, becomes `#REF!` instead of stopping at the edge. A range with such a corner becomes one `#REF!`.
  - Pasting `-5` or `+1` as plain text from another app into a number column stores a number. Only text that would become a formula gets a leading quote.
  - Case-insensitive replace keeps non-ASCII text intact when lower case changes the text length (for example `İ`).
  - Replace all skips reference cells, so the reference stays linked.
  - `loadPage` keeps empty cells, booleans and dates, the same as `loadColumnar`.
  - Editing a boolean cell shows `TRUE` or `FALSE`, and the editor reads formulas from any store.
  - Delete on a focused sheet tab does not remove the last visible sheet, and Backspace no longer removes a sheet.
  - Snapshots reject a row height of 0, the same as sheet operations, and canonical order no longer depends on the runtime locale.

- [#283](https://github.com/chh-ay/sheetwrite/pull/283) [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53) Thanks [@chh-ay](https://github.com/chh-ay)! - Fix bugs that hid failures or let a peer mislead the page:
  
  - Presence publishing reports an active-sheet failure as an `error` event instead of an unhandled rejection.
  - Revision restore rejects a non-integer version from the adapter instead of storing `NaN`.
  - Copied HTML writes only safe colors, and underline with strikethrough gives one `text-decoration` value.
  - `Grid.destroy()` removes the DOM and listeners even when an earlier teardown step throws.
  - `aria-rowcount` follows inserted, deleted and filtered rows.
  - Default sync mutation IDs are random, so two clients that edit in the same millisecond do not collide.
  - Conflict recovery saves the rebased queue only after every missed version applies.
  - `SyncCoordinator.subscribe()` keeps the host's offline state.
  - A table with too many columns reports a table-column limit.

- [#327](https://github.com/chh-ay/sheetwrite/pull/327) [`9fcc918`](https://github.com/chh-ay/sheetwrite/commit/9fcc918cbf03bbf1f66767afb2b4753605fb9b54) Thanks [@chh-ay](https://github.com/chh-ay)! - Replace non-null assertions and casts in core with checks that narrow the type, and separate the steps of long core functions with blank lines. Public behavior does not change.

- [#413](https://github.com/chh-ay/sheetwrite/pull/413) [`dc9a6d5`](https://github.com/chh-ay/sheetwrite/commit/dc9a6d5fa145f5044503254b6b54e3c52ebcf866) Thanks [@chh-ay](https://github.com/chh-ay)! - Core data paths use one copy of each shared rule:
  
  - Operation, snapshot and history size checks count JSON bytes with one walker. A `toJSON` field that is not a function is ordinary data, as it is for `JSON.stringify`; symbol-keyed fields, which JSON drops, are rejected.
  - The IndexedDB pending queue rejects a batch of more than 16 versions, and a durable queue record whose version counts have holes is rejected, like every other invalid batch.
  - `grid.hideRows` and `grid.showRows` skip rows that are not whole numbers, as the store's methods do, and `grid.clearView()` or removing a filter that is not set commits nothing.

- [#502](https://github.com/chh-ay/sheetwrite/pull/502) [`968df36`](https://github.com/chh-ay/sheetwrite/commit/968df36c94d94a615b8b3ef03da24a6a1a0b5be1) Thanks [@chh-ay](https://github.com/chh-ay)! - The dashboard background, secondary widget text and error colors follow the theme. When `--sheetwrite-widget-muted-bg`, `--sheetwrite-widget-muted` or `--sheetwrite-widget-error` is unset, the stylesheet derives it from the widget background and text colors the grid sets, so a dark theme no longer shows a light dashboard background or light-theme greys and reds.

- [#529](https://github.com/chh-ay/sheetwrite/pull/529) [`3c9dac3`](https://github.com/chh-ay/sheetwrite/commit/3c9dac3ffd83f1427a688cde26dc65eeade1f78d) Thanks [@chh-ay](https://github.com/chh-ay)! - Editing a cell in a `date` column keeps it a date. The editor opens on the date text (`2024-02-29`, or `2024-03-01 12:00` when the serial has a time) rather than the raw serial, so committing it unchanged keeps the serial. A number typed into a date column is stored as that serial instead of as text. Custom editors receive the same date text in `CellEditorContext.text`.

- [#523](https://github.com/chh-ay/sheetwrite/pull/523) [`8a543f7`](https://github.com/chh-ay/sheetwrite/commit/8a543f7a11f9d9a9b8df6039c66e99a7c0e9bd5c) Thanks [@chh-ay](https://github.com/chh-ay)! - A date-formatted cell holding serial 60 shows 29 February 1900, as Excel does and as `DAY`, `MONTH` and `TEXT` already did. Every date code agrees: `yyyy-mm-dd` gives `1900-02-29`, `d mmm yyyy` gives `29 Feb 1900`, and `dddd` gives `Wednesday`. Typing `1900-02-29` into a date column stores serial 60. Other serials, including dates from 1904 date system workbooks, display as before.

- [#528](https://github.com/chh-ay/sheetwrite/pull/528) [`3a7e6be`](https://github.com/chh-ay/sheetwrite/commit/3a7e6befde186f767c645c2d3357b05b27aa2039) Thanks [@chh-ay](https://github.com/chh-ay)! - Weekday names (`ddd`, `dddd`) for serials 1–59 (1 January to 28 February 1900) now match Excel and `WEEKDAY`: serial 1 shows Sunday and serial 59 shows Tuesday. These names used to be a day later. Excel counts its fictional 29 February 1900 when it counts weekdays. Weekday names for serial 60 onward are unchanged.

- [#307](https://github.com/chh-ay/sheetwrite/pull/307) [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste, fill and conditional-format rules now rewrite formula references with the engine's own rules (part of [#246](https://github.com/chh-ay/sheetwrite/issues/246)). `=SUM(A:A)` pasted one column right becomes `=SUM(B:B)`, and a name such as `XYZ1`, past the last column, stays a name instead of becoming `#REF!`. A row or column insert, delete or move rewrites whole columns and rows in conditional-format formulas too. Only the references that change are rewritten, so the rest of the formula keeps its spacing and case.
  
  The engines export `translateFormula`, `shiftFormulaAxis` and `moveFormulaAxis`. `shiftA1Refs` from `@sheetwrite/core` now calls the engine, so it needs `initSheetwrite()` first. `rebaseDocumentOperations` needs it too when it moves a conditional format that has a formula.

- [#415](https://github.com/chh-ay/sheetwrite/pull/415) [`d519828`](https://github.com/chh-ay/sheetwrite/commit/d519828c399b00c0f6a7646633a11853d9bf8eeb) Thanks [@chh-ay](https://github.com/chh-ay)! - The core build generates the built-in function table from the formula contract inventory instead of reading a committed copy. The published table is unchanged; the packed `@sheetwrite/core` manifest gains a `generate` script, and the `@sheetwrite/formulas` README no longer asks contributors to regenerate docs after adding a function.

- [#447](https://github.com/chh-ay/sheetwrite/pull/447) [`3f5a91f`](https://github.com/chh-ay/sheetwrite/commit/3f5a91f65974b3631efd6cfd6687933effe95be5) Thanks [@chh-ay](https://github.com/chh-ay)! - Document every `Grid` member: `store`, `setActiveSheet`, `scrollToCell`, `getSelection`, `setSelection`, `defineCellRenderer`, the row and column insert and remove methods, sheet rename and move, conditional formats, hyperlinks, validation rules, protected ranges, the protection resolver, notes, `getZoom`, `on` and `refresh` now have doc comments, so editor hovers and the API reference describe them. No behaviour changes.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX and CSV failures stay small:
  
  - An XLSX error message keeps at most 8 KiB of text from the file, from the start and the end, and keeps the decoding error as its `cause`.
  - One XLSX conversion reports at most 64 warnings to `onWarning`.
  - `DelimitedTextOptionsError.context` keeps a number option value, or only `valueType` for any other value, never a copy of it.
  - A registered XLSX backend name in a failure context is cut to 256 characters.

- [#506](https://github.com/chh-ay/sheetwrite/pull/506) [`cd6dc20`](https://github.com/chh-ay/sheetwrite/commit/cd6dc204da50474d221f33f634b3e5d097649b51) Thanks [@chh-ay](https://github.com/chh-ay)! - A grid destroyed while optional code loads no longer calls its freed engine. A chart over a pivot that starts loading the pivot views, an XLSX export that loads the pivot export code, Insert › New Dashboard, the panels that the ribbon, Edit Links, Queries & Connections and Version History open, and `updateExternalLinks` waiting on its resolver now check whether the grid or its store is gone when the wait ends. The export and `updateExternalLinks` then reject with an `aborted` error, `loadPanels` rejects with the grid's `AbortError`, and the others do nothing. Before, the engine could fail with "null pointer passed to rust".

- [#375](https://github.com/chh-ay/sheetwrite/pull/375) [`d078939`](https://github.com/chh-ay/sheetwrite/commit/d0789397aa1d91efdb6de0d3e3ccd1e6b03751c6) Thanks [@chh-ay](https://github.com/chh-ay)! - Keep the store and its error helpers out of webpack's initial chunk when an app only initializes core. The lazy XLSX import and export module no longer imports the store; the grid checks that an exported sheet is complete before the lazy module runs.

- [#330](https://github.com/chh-ay/sheetwrite/pull/330) [`52daf35`](https://github.com/chh-ay/sheetwrite/commit/52daf35c41d27a52d827d87adcb005595ebe1605) Thanks [@chh-ay](https://github.com/chh-ay)! - A workbook or snapshot that loads with hidden rows, collapsed row groups, filters or sort keys now shows its saved view at once. Before, the store view (`hasView`, `viewRowCount`, `viewRowOf`) ignored them until the first row or filter change on that sheet, and `SUBTOTAL` counted the rows that a saved filter hides. A sheet added from a snapshot, for example when you undo a sheet removal, also gets its saved view.

- [#499](https://github.com/chh-ay/sheetwrite/pull/499) [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11) Thanks [@chh-ay](https://github.com/chh-ay)! - Moving rows or columns (`moveRows`, `moveColumns`) moves the cells, as Excel's Cut and Insert Cut Cells does, and every reference in the workbook follows the cells it names. Before, a move ran as a delete and an insert: references to the moved cells became `#REF!`, and a moved formula read the cells that took its old place. A range loses a moved row or column at its edge and grows by a block that lands inside it, as in Excel, and undo restores the formulas that lost a row or column. A move that would split a table is refused, as in Excel.
  
  The engines add `CellStore.moveRows`, `CellStore.moveCols` and `CellStore.moveLosses`. `CellStore.moveNamedFormulaSource` is removed: the engine moves defined-name formulas itself.

- [#468](https://github.com/chh-ay/sheetwrite/pull/468) [`8229709`](https://github.com/chh-ay/sheetwrite/commit/82297093792ceda7833750a2896e13fca515b216) Thanks [@chh-ay](https://github.com/chh-ay)! - The pivot field list, dashboard slicers (in the view and in XLSX export), Insert › Chart and the Sort panel's header labels read their source cells in bulk windows instead of one cell at a time. Results are unchanged.

- [#320](https://github.com/chh-ay/sheetwrite/pull/320) [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f) Thanks [@chh-ay](https://github.com/chh-ay)! - Unmounting a React, Vue or Svelte grid destroys it and aborts its pending summaries, lazy chrome, clipboard work and built-in saves without an error event. Late initialization and publication failures from an unmounted or replaced grid are not reported. Shared WASM initialization continues for other mounted grids.
  
  **Upgrade checklist:** treat an `AbortError` from `grid.summarizeSelection()` after unmount as cancellation. Destroy host-created sync and collaboration coordinators yourself when the view is removed.

- [#333](https://github.com/chh-ay/sheetwrite/pull/333) [`8c9bc55`](https://github.com/chh-ay/sheetwrite/commit/8c9bc55a0661ee138e16d7f1594c53bf626c5157) Thanks [@chh-ay](https://github.com/chh-ay)! - Roll back restored pending commits if a later stored record cannot apply. Keep each record's paged acknowledgement revision and preserve user undo history when restore fails.

- [#509](https://github.com/chh-ay/sheetwrite/pull/509) [`21f64aa`](https://github.com/chh-ay/sheetwrite/commit/21f64aa87263d59cb996b0e04da9801a7deceebf) Thanks [@chh-ay](https://github.com/chh-ay)! - A compact or automatic ribbon no longer moves the grid when it arrives. The grid and `createSpreadsheetShell` reserve the height the ribbon will take, compact or full for the host's width, instead of the full height, so on a narrow host the rows below no longer jump up 56 px after the ribbon chunk loads.

- [#293](https://github.com/chh-ay/sheetwrite/pull/293) [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd) Thanks [@chh-ay](https://github.com/chh-ay)! - In Safari (WebKit), a ribbon or toolbar menu opened from the keyboard stays open. Before, focus on the first menu item scrolled the page, and the scroll closed the menu at once. A page scroll now closes a ribbon or toolbar popup only when its button moves, so a late scroll event for an earlier scroll does not close a menu that just opened.
  
  Ribbon tab and mode changes now finish their layout before the next command can open a menu. A late toolbar size notification no longer closes an open More commands group when its width has not changed. Keyboard menus stay open until dismissed, and Escape returns focus to their button.

- [#474](https://github.com/chh-ay/sheetwrite/pull/474) [`b029afe`](https://github.com/chh-ay/sheetwrite/commit/b029afe02f2a0933a1efb451dcc8cebc4d3773c7) Thanks [@chh-ay](https://github.com/chh-ay)! - At narrow widths the ribbon fades out a tab label cut off by the tab list, so it no longer runs into the Compact button.

- [#352](https://github.com/chh-ay/sheetwrite/pull/352) [`a1444f0`](https://github.com/chh-ay/sheetwrite/commit/a1444f00af111dd7921130f2e28fd1374a594eee) Thanks [@chh-ay](https://github.com/chh-ay)! - Keep values typed, filled, pasted, or received from collaborators inside a dynamic-array spill. The value blocks the anchor with `#SPILL!`; clearing it restores the array. Preserve source-only undo and redo, and reject child-only cuts before replacing the clipboard. Document spill editing rules and the view-only sort and filter difference from Excel.

- [#300](https://github.com/chh-ay/sheetwrite/pull/300) [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e) Thanks [@chh-ay](https://github.com/chh-ay)! - A row or column insert that a sheet cannot hold changes nothing. `addRows`, `removeRows`, `insertCols` and `removeCols` return `false` for a dense sheet that would pass its cell limit or a row count that overflows, and the store rejects the operation instead of moving formulas, charts or metadata for cells that did not move. `addPagedSheet` throws for a chunk size above 1048576 rows.

- [#356](https://github.com/chh-ay/sheetwrite/pull/356) [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e) Thanks [@chh-ay](https://github.com/chh-ay)! - Write cell formulas with Excel's future-function and local-binding prefixes, including LET, LAMBDA, XLOOKUP, FILTER and SORT, and remove those prefixes on import. Cells and defined names now share the engine converter, including the A1# spill spelling.
  
  Convert each workbook's distinct formulas in one batch instead of crossing the JavaScript-to-WASM boundary for every cell. Reuse an initialized engine or retire a temporary conversion instance. Formula-free workbooks, including workbooks with only range names, do not load an engine.

- [#496](https://github.com/chh-ay/sheetwrite/pull/496) [`380f3d5`](https://github.com/chh-ay/sheetwrite/commit/380f3d5a3fac92da7e0389c099a8f27d91e5b90e) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes the current output of a pivot it keeps in Sheetwrite metadata, such as a pivot over the data model with measures, as cells at the pivot's place with its number formats, so Excel shows the values ([#495](https://github.com/chh-ay/sheetwrite/issues/495)). Sheetwrite reopens the pivot live, removing those cells on import unless another application changed them. The pivot keeps its one export warning, which now says its values were written as cells.

- [#322](https://github.com/chh-ay/sheetwrite/pull/322) [`487e7f7`](https://github.com/chh-ay/sheetwrite/commit/487e7f7262f7fccd92f3d8a213be8130ce525861) Thanks [@chh-ay](https://github.com/chh-ay)! - Workbook import expands shared formulas in the engine, with its copy rule, the one that paste and fill use (part of [#250](https://github.com/chh-ay/sheetwrite/issues/250)). Import still works before `initSheetwrite()`: it borrows an initialized engine or uses a temporary one, as formula conversion does. Expanded formulas change where the old rule differed:
  
  - Whole columns and rows move: a shared `=SUM(A:A)` one column right is `=SUM(B:B)`. Before, it stayed `=SUM(A:A)`.
  - A reference moved past `XFD` or row 1048576 is `#REF!`, as is a range with any corner off the sheet: `=SUM(#REF!)` instead of `=SUM(#REF!:A1)`.
  - A name past the last column, such as `XYZ1`, stays a name.
  
  A shared-formula master that the engine's lexer cannot read has no copy rule. Each other cell of its group then keeps the formula text its writer stored on it, if any, and otherwise the master's text. Import reports an `unsupported-feature` warning for each such cell.
  
  `withXlsxFormulaEngine` in `@sheetwrite/core` replaces the unreleased `convertXlsxFormulas`. It runs a callback with the engine's formula conversion, lexer check and copy rule in one engine session.
- Updated dependencies [[`3644d27`](https://github.com/chh-ay/sheetwrite/commit/3644d278220a06a4701bb53e9ad98efb5a108353), [`a13996c`](https://github.com/chh-ay/sheetwrite/commit/a13996cdbdfc503da1105a7f43716e0817d5b1fa), [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b), [`4b705e2`](https://github.com/chh-ay/sheetwrite/commit/4b705e28bf9a003192d234b7e3becd385fe1481b), [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911), [`85f214a`](https://github.com/chh-ay/sheetwrite/commit/85f214a1e3b5467a3fede1516e273eb6dff396dd), [`0975f07`](https://github.com/chh-ay/sheetwrite/commit/0975f07912d62896d239adf449b3552944728c24), [`2270082`](https://github.com/chh-ay/sheetwrite/commit/2270082dd02bf5fc3f9e5452776991a54831bc27), [`663d875`](https://github.com/chh-ay/sheetwrite/commit/663d8758dc8a9a12da4b4424b2f028fa61ca4cd6), [`c8f462a`](https://github.com/chh-ay/sheetwrite/commit/c8f462a7a867e3c0a5d728bae017462a97636fe3), [`2c386ac`](https://github.com/chh-ay/sheetwrite/commit/2c386ac3af54cee76c983ee5c4dee4d80a822e17), [`bebc860`](https://github.com/chh-ay/sheetwrite/commit/bebc860402ca104fa8ebe1c657c41f6af529d371), [`2493222`](https://github.com/chh-ay/sheetwrite/commit/2493222a57c88440c474988c15496329423a29d1), [`48c8639`](https://github.com/chh-ay/sheetwrite/commit/48c86395551d8fe8db453e65c55b775c6c6d1a31), [`c67bb48`](https://github.com/chh-ay/sheetwrite/commit/c67bb489582f6920810aeba2f020ae5d4bec6266), [`b08cb80`](https://github.com/chh-ay/sheetwrite/commit/b08cb80b3d3a29e34336b2c9cf65f4b8fae74840), [`916b452`](https://github.com/chh-ay/sheetwrite/commit/916b452044664a2753150a7e061c6d08b369f5f4), [`d5af8e5`](https://github.com/chh-ay/sheetwrite/commit/d5af8e520ba50789eb70a6eca50c37691a8f3615), [`675dd15`](https://github.com/chh-ay/sheetwrite/commit/675dd15b224763ebda96f5f0e06bceee908efcee), [`6ec955a`](https://github.com/chh-ay/sheetwrite/commit/6ec955a0d74c229dfc7eeeb61631b02f69b101d4), [`7a7ba88`](https://github.com/chh-ay/sheetwrite/commit/7a7ba88f7c7f17b9527aa4384a4073899e0372b7), [`2ef581a`](https://github.com/chh-ay/sheetwrite/commit/2ef581aa7730a70b86f5a1c4887c777f48b233b0), [`8a75714`](https://github.com/chh-ay/sheetwrite/commit/8a7571407979f2c6b347335c949b8b0ad366b5cd), [`f25e99a`](https://github.com/chh-ay/sheetwrite/commit/f25e99a640d4291e44c12524c3674d40f647a760), [`6bf7d02`](https://github.com/chh-ay/sheetwrite/commit/6bf7d0212f2abea022e63846730722b867abc186), [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`bbd90b0`](https://github.com/chh-ay/sheetwrite/commit/bbd90b0ab1c7f401ec2d0b2d63b0b6250b74b1f7), [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`c9fc2a8`](https://github.com/chh-ay/sheetwrite/commit/c9fc2a81017afcdb958f5748ac71789a255ad5c2), [`4727a3d`](https://github.com/chh-ay/sheetwrite/commit/4727a3de909c0645d11a0dc74196fecfea68008c), [`01b8d72`](https://github.com/chh-ay/sheetwrite/commit/01b8d729b92351e46e3f343aa08ca33604ef3284), [`d41651f`](https://github.com/chh-ay/sheetwrite/commit/d41651fc4865a1602c84b1f635c0df6a16ace46b), [`45a0b1f`](https://github.com/chh-ay/sheetwrite/commit/45a0b1f2977df891203bf7685f6e81ee852c2820), [`85367f4`](https://github.com/chh-ay/sheetwrite/commit/85367f46bbbfe784732f4dcad5cb5cc2385118b1), [`725732b`](https://github.com/chh-ay/sheetwrite/commit/725732bbd8767ba6abd1e862a4af88a1acf01228), [`cf90c45`](https://github.com/chh-ay/sheetwrite/commit/cf90c45b95e123ea984e06d3361981e76668b9a2), [`2625510`](https://github.com/chh-ay/sheetwrite/commit/26255105d445edb7e862ba738654e4cad0b4202d), [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11), [`143a647`](https://github.com/chh-ay/sheetwrite/commit/143a647c610af9955e719f8be818a9609ed6d1d9), [`1d0cf59`](https://github.com/chh-ay/sheetwrite/commit/1d0cf59764de8ab436a9f9506fad52694cba6d76), [`872c448`](https://github.com/chh-ay/sheetwrite/commit/872c448a05577d8b0ed7e00bad48838886980468), [`3938183`](https://github.com/chh-ay/sheetwrite/commit/3938183a5454a08b431bacd060bf2c7eff59d6ce), [`4a50582`](https://github.com/chh-ay/sheetwrite/commit/4a50582a04d3084915a97565e9f5703c9b64f048), [`e8f34cd`](https://github.com/chh-ay/sheetwrite/commit/e8f34cde93187376d1c0a2855ef4246aaeaba37a), [`22c6721`](https://github.com/chh-ay/sheetwrite/commit/22c672182ec0c52981e7988705706c82c1825cac), [`dd49f28`](https://github.com/chh-ay/sheetwrite/commit/dd49f284abd25aefae57d78abdde762ac26aedf5), [`b7cef92`](https://github.com/chh-ay/sheetwrite/commit/b7cef927b5223a57f2f5fd08d1a4b4749f0fa31a), [`5ea7336`](https://github.com/chh-ay/sheetwrite/commit/5ea7336d7602697a123a5f6594e6c77924e5a415), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f), [`3978341`](https://github.com/chh-ay/sheetwrite/commit/3978341c92da5578cccd166568eb7dfcddf7d17e), [`2d17ed1`](https://github.com/chh-ay/sheetwrite/commit/2d17ed18937ce2c832517d67d18de166b7a9f3b2), [`9ba077c`](https://github.com/chh-ay/sheetwrite/commit/9ba077c00fa532b1a7264952606d36cd361d5fae), [`bc7ca0d`](https://github.com/chh-ay/sheetwrite/commit/bc7ca0deddf6ee4b054123a7480f36211e8ffd77), [`411f4e4`](https://github.com/chh-ay/sheetwrite/commit/411f4e4131907e2fe0108beaf3a5ec8ea2b5801b), [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e)]:
  - @sheetwrite/wasm@0.7.0

## 0.6.1

### Patch Changes

- [#232](https://github.com/chh-ay/sheetwrite/pull/232) [`c29a25a`](https://github.com/chh-ay/sheetwrite/commit/c29a25a65c4ff01ae32ad89fc6b32dde4798ffde) Thanks [@chh-ay](https://github.com/chh-ay)! - Reduce repeated accessibility DOM updates when revisiting loaded datasource pages.
- Updated dependencies [[`1ceb09a`](https://github.com/chh-ay/sheetwrite/commit/1ceb09a7567a99292744d8b4fd459ffc0c73b3fb), [`3df2d80`](https://github.com/chh-ay/sheetwrite/commit/3df2d80d6b670d41ba5b18954befe281694a2ddd)]:
  - @sheetwrite/wasm@0.6.1

## 0.6.0

### Minor Changes

- 81e45e3: Add three cell style fields: `fontFamily` (with the theme font as fallback), `verticalAlign` (`top`, `middle` or `bottom`), and a per-cell `numberFormat` that overrides the column's format; `General` opts a cell out of it. Paint, column auto-fit, snapshots, clipboard and hyperlink styles all honor them, and `isCellFontFamily` exposes the font-name rule. XLSX import and export round-trip all three: a column that mixes number formats keeps each cell's format instead of dropping them, and only fonts other than the workbook default become a cell `fontFamily`.
- 92dcd37: Show and edit cell notes in the grid, as in Excel. Rest the pointer on a cell with a note to see the note in a card (`.sheetwrite-note`). `grid.actions.editNote()` and Shift+F2 (the new rebindable `editNote` keyboard action) open a note editor (`.sheetwrite-note-editor`) on the focus cell: Ctrl or Cmd+Enter or leaving the editor saves the note as one undoable step, empty text removes it, and Escape cancels. `grid.actions.deleteNote()` removes the focus cell's note. The context menu accepts the new `editNote` and `deleteNote` actions.
- d99f762: Add charts to the workbook document. A sheet can hold up to 100 charts in `Sheet.charts`. Snapshots keep the charts in their array order. Each chart is a column, bar, line, area, pie, doughnut or scatter chart. It has up to 32 series, and each series reads cell ranges on any sheet. Use the `setChart` and `removeChart` operations to create, change, move and delete charts. These operations work with undo, sync and snapshots.
  
  Row and column inserts, deletes and moves update chart ranges and anchors. A deleted range becomes `#REF!`. Removing a sheet turns the ranges on it into `#REF!`. Renaming a sheet changes nothing.
  
  `resolveChartView(store, sheet, id)` returns the chart data as plain values: series names, numbers, categories and number formats. It reads at most 10,000 points per range (`MAX_CHART_POINTS`) and marks a longer range as `truncated`. `subscribeChartChanges(store, listener)` calls the listener once per commit with the charts whose data changed. Edits outside every chart range do not call it. Workbooks without charts do not change in speed or memory.
  
  `openChartViews(store)` returns live chart views from the registered chart package. When no package is registered, it throws a `SheetwriteError` with code `optional-backend-unavailable` and operation `chart-view`. Install `@sheetwrite/charts` and import `@sheetwrite/charts/register`. Other packages can register with `setChartViewProviderFactory`.
- b159a35: Show charts over the cells. Each chart floats at its anchor and follows scroll, zoom, row and column sizes, hidden rows and columns, and frozen panes. Click a chart to select it; drag it or its handles to move or resize it; use the arrow keys to move it by a pixel (Shift: by a cell), Delete to remove it, Enter to open its panel and Escape to return to the grid. Each change is one undo step. New `Grid` methods: `getCharts(sheet?)`, `setChart(chart, sheet?)` and `removeChart(id, sheet?)` return the transaction result, and `selectChart(id, sheet?)` selects a chart; new events `chart-select` and `chart-activate`. Hosts that draw charts themselves register a `ChartRenderer` with `setChartRendererFactory`. Without a renderer, a chart shows as a frame with its title. Series colors come from `--sheetwrite-chart-1` to `--sheetwrite-chart-8`.
- b159a35: Reach charts and pivot tables from the ribbon and the context menus. **Insert › Chart** is a split button: the face inserts a column chart, and its menu inserts any of the seven kinds, each with its own glyph. Right-click a chart (or press Shift+F10 or the ContextMenu key on it) for **Edit chart** and **Delete chart**; a read-only grid offers only Edit chart. Right-click a cell of a pivot table's output for **PivotTable Fields**, which opens its field list. The new context-menu action `pivotFields` and `grid.actions.showPivotFields()` do the same from host menus and code. `ContextMenu`'s glyphs follow `config.icons` overrides as before.
- b159a35: Insert and edit charts and pivot tables from the ribbon. **Insert › Chart** makes a chart from the selection and opens the chart panel (kind, ranges, titles, legend). **Insert › PivotTable** asks for a destination and opens the field list, where fields move between Rows, Columns, Values and Filters by drag or by keyboard; selecting a cell in a pivot's output opens it again. The panels open beside the grid with `grid.openPanel()`, which hosts can also use for their own panels. Each change is one undo step. With the default engine, Insert › PivotTable is disabled and says that pivot tables need the full engine. The panel code loads on first use.
- 92dcd37: The toolbar, ribbon, ribbon menus and context menu now draw their command icons from one icon sheet, shipped as `@sheetwrite/core/icons.svg` with its layout in `@sheetwrite/core/icons.json`. The icons follow the text color, so they suit light, dark and High Contrast themes.
  
  Replace icons by glyph name with the new `icons` option (`GridConfig.icons`, type `IconOverrides`). `IconName` and `ICON_NAMES` list the glyph names. To replace the whole set, set the CSS variable `--sheetwrite-icon-sheet` to your own sheet with the same layout.
  
  The default sheet is an inline `data:` URL. If your Content Security Policy blocks `data:` images, serve `@sheetwrite/core/icons.svg` from your site and set `--sheetwrite-icon-sheet: url("/path/to/icons.svg")`.
- 92dcd37: The built-in context menu is shorter and grouped. Cut, Copy and Paste come first, then Insert, Delete and Clear contents, then Row and Column, then Merge, then the note. Insert, Delete, Row, Column and Merge open submenus. Each row shows its command icon.
  
  The menu now works from the keyboard. It takes focus when it opens: Up and Down move, Home and End jump, Enter or Space runs a row, Right opens a submenu, Left or Escape closes it, and focus returns to the grid when the menu closes.
  
  Custom menus can use the same features. `ContextMenuItem.items` makes a row open a submenu, and `ContextMenuItem.icon` sets its glyph. Built-in actions have default icons, and `config.icons` overrides apply. Rows without an `id` now get `data-context-menu-item` set to their action name.
- b6f333c: Add saved pivot definitions and the `getPivots`, `setPivot`, `removePivot`, `getPivotFields`, and `getPivotResult` methods on grids and stores. Validate definitions before changes. Keep pivots in snapshots, undo history, collaboration, and engine memory transfers.
  
  Use the full engine to calculate pivot output. The default engine shows Excel's saved pivot values as read-only calculated output that formulas can read. It reports `saved`, or `unavailable` when no saved values exist. Both engines keep the same saved output in snapshots and collaboration. A `setPivot` call removes saved values. Refuse local writes into pivot output. Row and column edits update sources and anchors; deleting an anchor moves it to the first remaining cell. Undo restores the previous definition and output.
- 9dc3ab1: Add reference-valued `OFFSET(reference, rows, cols, [height], [width])` and `INDIRECT(text, [a1])` in both engines and formula autocomplete. Their results can feed reference-taking functions, `LAMBDA`, `MAP` and the other array helpers, or spill multiple cells; a one-cell result is a plain value, not a spill. Both functions are volatile and recalculate with their dependents after every source-changing edit; runtime dependency cycles return `#CYCLE!`.
  
  `OFFSET` inherits omitted dimensions from its source reference and requires positive height and width. Out-of-grid bounds return `#REF!`; nonpositive dimensions, nonnumeric offsets or a non-reference first argument return `#VALUE!`. `INDIRECT` accepts A1 or R1C1 notation, including relative R1C1 coordinates, sheet-qualified references, defined names and table references. Invalid targets and external workbook references return `#REF!`. Reference text is not rewritten by fill, copy or structural edits. Existing sheet, range and spill limits still apply.
  
  OFFSET and INDIRECT are volatile, as in Excel. The engine does not record the cells they read as graph edges. Each edit recalculates them again, so a moved or edited target always shows. Workbooks without these functions do not pay this cost. `recompute(sheet)` on a sheet with volatile formulas also recalculates the volatile formulas on every other sheet, because Excel recalculates volatile functions for the whole workbook. A reference to another sheet then stays current.
- 03ad409: Add an opt-in Excel-style ribbon (`config.ribbon: true`, or `createRibbon` and `ribbon: true` in the shell) with Home, Insert, Data and View tabs. Groups shrink, then fold into dropdowns, as the grid narrows, and the panel can be hidden to its tab row.
  
  New `GridActions`: `setBorders` (Excel border presets that keep each cell's other sides), `setFontFamily`, `setFontSize`, `stepFontSize`, `setVerticalAlign`, `toggleWrap`, `setNumberFormat`, `stepDecimals`, `mergeAndCenter`, `clearAll`, `autoSum`, `find` and `freezePanes`. `setTextColor` and `setFillColor` now accept `null` for Automatic and No Fill. New `Grid.getFocusCellStyle()`, and command state for `alignTop`, `alignMiddle`, `alignBottom` and `wrap`.
- 0b5cc2d: Add iterative calculation for circular references, as in Excel. The new `setCalculation` document operation sets `{ iterate, maxIterations, maxChange }`. The defaults are the Excel defaults: off, 100 iterations, and a maximum change of 0.001. When iteration is off, a circular reference shows `#CYCLE!`, as before. When it is on, the engine calculates each circular reference again until no value changes by more than `maxChange`, or until `maxIterations` passes are done. A cycle that does not settle keeps the values of its last pass. Formulas that read a cycle calculate once, after it settles. `OFFSET`, `INDIRECT` and volatile functions work inside a cycle, and a cycle that only `OFFSET` or `INDIRECT` closes also iterates.
  
  The setting is undoable and is part of the workbook snapshot as `workbook.calculation`. Snapshots of workbooks with the default setting do not change. XLSX import reads `iterate`, `iterateCount` and `iterateDelta` from `<calcPr>`, and export writes them. The WASM `CellStore` has the new `setIterativeCalculation` method. Core exports `CalculationSettings`, `DEFAULT_MAX_ITERATIONS`, `DEFAULT_MAX_CHANGE` and `MAX_ITERATIONS`.
  
  The engine finds circular references once per recalculation, only when the dependency check finds a cycle, so workbooks without one do no extra work.
- c56a350: The shell's name box selects ranges as Excel's does: type `B2:D9` (or `$B$2:$D$9`) and press Enter. Single cells work as before.
- 0f36fda: Add the Excel reference operators. A space between two references is the intersection operator: `=SUM(A1:C3 B2:D4)` adds the cells that both ranges cover. When the references share no cell, or are on different sheets, the result is `#NULL!`. Spaces around other operators, after commas and before `)` do not change.
  
  A comma inside parentheses that are not a function call is the union operator: `=SUM((A1:A2,C1:C2))`. `SUM`, `COUNT`, `AVERAGE`, `MAX`, `MIN`, `SMALL`, `LARGE` and the other functions that read lists of values accept a union. `INDEX` has the optional `area_num` argument, which selects one area of a union. The new `AREAS` function counts the areas of a reference. A union in a position that needs one range, such as a `VLOOKUP` table, returns `#VALUE!`.
  
  A 3-D reference such as `=SUM(Jan:Mar!B2)` or `=SUM('Jan:Q1 Close'!A1:B2)` reads the same cells on every sheet from the first to the last sheet in tab order. `SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `VAR.S` and `VAR.P` accept 3-D references; other positions return `#VALUE!`. When you insert, move or delete a sheet inside the span, the result changes as in Excel. When you delete or move an endpoint sheet, the formula moves to the nearest sheet inside the span. A rename keeps the formula valid. When every sheet of the span is deleted, the reference becomes `#REF!`. Row and column edits on one sheet do not change a 3-D reference.
  
  The three operators record only the cells they read, so an edit recalculates only the formulas that it can change. A tab move updates the dependencies of the affected formulas only. When a tab move rewrites a 3-D reference, undo restores the original formula text. XLSX import and export keep these formulas as Excel text. The WASM `CellStore` has the new `setSheetOrder` and `sheetSpanFormulaCells` methods; core calls them when tabs are added, moved or restored.
- c56a350: Add `Grid.summarizeSelection()`: Count, Sum, Average, Min and Max over the selected cells the user can see (rows a filter hides are left out), read in bounded chunks between frames and cancellable with an `AbortSignal`. The shell's status line now shows Excel's Average, Count and Sum next to the selection size.
- bcfe991: Add `RAND` and `RANDBETWEEN`, and make volatile formulas recalculate after each edit. `RAND`, `RANDBETWEEN`, `TODAY` and `NOW`, and the formulas that read them, now recalculate in every transaction that changes a cell, as in Excel. Before, they recalculated only when the host called `recalculateVolatile`. A transaction without cell changes recalculates nothing. Workbooks without volatile formulas do no extra work, and the extra work of an edit grows only with the number of volatile formulas and their dependents.
  
  `RANDBETWEEN(bottom, top)` rounds `bottom` up and `top` down. It returns `#NUM!` for an empty interval and `#VALUE!` for a bound that is not a number.
  
  Add `FORMULATEXT`, `ISFORMULA`, `HYPERLINK` and `CELL`. `FORMULATEXT` returns the formula of a cell, or `#N/A` when the cell holds no formula. `HYPERLINK` returns its friendly name, or the link when there is no friendly name; the grid does not open the link. `CELL` supports the info types `address`, `col`, `contents`, `row` and `type`; other info types return `#VALUE!`. Formula autocomplete offers all six functions.
- 5308206: Opening and saving an XLSX file now keeps the parts Sheetwrite does not model: charts, pivot tables, images, VBA projects, customXml, XML maps, data connections, themes and document properties. They are kept as their original compressed bytes in the new `WorkbookSnapshot.workbook.xlsxSource` and written back unchanged. Charts and pivots are dropped with a warning once a cell changes, images once their sheet's rows or columns move, and VBA and customXml always survive. The new `maxPreservedBytes` resource limit (64 MiB by default) bounds the kept data.
  
  Table autofilter rules, sort state, calculated-column formulas and totals-row functions now round-trip through XLSX.
  
  New streaming functions `toCsvStream`, `toTsvStream`, `toXlsxTableStream` and `toXlsxWorkbookStream` return a `ReadableStream<Uint8Array>`, and `fromXlsxWorkbookFile` imports a `Blob` without buffering every part. The existing functions are unchanged.
  
  Import no longer writes the workbook's default font size onto every cell; only cells with a different size get a `fontSize` style.

### Patch Changes

- cbcf0b8: `renderer: "worker"` now works without `workerUrl` in bundled apps. The grid creates its worker with the exact `new Worker(new URL("./worker.js", import.meta.url))` expression bundlers look for, so Vite (and other bundlers that recognize it) build the worker with its imports instead of copying a file whose imports are missing, which made the grid fall back to the main-thread renderer.
- 8d70aae: Package READMEs and API doc comments link to the restructured documentation pages.
- 286ac93: Wrapped text lays out 2.5–3.3× faster in the browser (painting and row auto-fit). Each line's break is now found by searching prefix widths instead of measuring every growing prefix.
  
  Wrapped lines no longer break inside an emoji sequence (such as 👨‍👩‍👧‍👦), a flag or a letter with combining marks: breaks fall between graphemes. Plain Latin text wraps exactly as before.
- ec8e0ee: Skip repaint work for edits that cannot change what the grid shows. On a sheet without formulas, a plain value edit outside the painted window or on another sheet no longer re-reads the visible window, rebuilds the search-match and note indexes, or rewrites the accessibility mirror. An active search now also picks up matches that a value edit adds or removes, without scrolling.
  
  Sheets with formulas or references conservatively rescan an active search after an edit, including edits to off-screen inputs or other sheets. This preserves matches whose computed text changes; it can cost more than the old behavior, which left those matches stale.
- ec8e0ee: Large undo restores the saved range directly from its packed engine snapshot instead of decoding and re-applying a JSON block, and the restore payload sent to listeners and sync is measured once instead of being walked at every layer. In local runs, undo of a 1,000,000-cell clear was 2–6× faster and the memory it added during undo fell from about 310 MiB to about 190 MiB. Undo history now also drops its oldest entries once retained range snapshots pass 256 MiB (about twenty million-cell clears); the newest entry always stays undoable. `restoreRange` now applies the same source, reference and dirty-capacity rules as a packed block write, so a local undo and its replay on another peer give the same state.
  
  The 256 MiB policy uses engine-reported snapshot payload bytes, not total retained process memory. It excludes cloned formula ASTs and JavaScript patch/redo payloads, which remain bounded only by the 200-entry limit.
  
  Formula-free packed writes and restores select their source-free cell loop once per range, avoiding repeated formula-map checks and kind normalization during large imports.
- 78665d3: The ribbon now loads as its own chunk when `config.ribbon` (or the shell's `ribbon: true`) asks for it, so grids without a ribbon no longer download it: about 25 KB less minified JavaScript for every `createGrid` app. The grid reserves the ribbon's height while it loads, so nothing moves when it arrives.
- 60590f9: Keep workbook layout and link text stable when another spreadsheet app saves an XLSX file.
  
  Import cells with no XLSX vertical alignment at the bottom, as Excel shows them. Import centered cells with the Sheetwrite default alignment. Export the Sheetwrite default as centered alignment. This changes how imported Excel cells with no alignment setting appear.
  
  Use the OOXML column width conversion. Keep automatic row heights automatic. Use cell text when a hyperlink has no display text. Export hyperlink colors and underlines in cell styles so other apps can keep them.
  
  Native fixture widths now match what Excel shows. Remove the old extra 5 pixels. The changed widths, in pixels, are: 19 → 14, 25 → 20, 26 → 21, 40 → 35, 44 → 39, 52 → 47, 53 → 48, 60 → 55, 64 → 59, 78 → 73, 85 → 80, 86 → 81, 94 → 89, 107 → 102, 114 → 109, 116 → 111, 119 → 114, 132 → 127, 154 → 149, 156 → 151, 162 → 157, and 171 → 166.
  
  Keep explicit cell font colors and underline settings when a hyperlink has no style. Use the default link look only for font properties the cell does not set.
- c0f9c00: Reconcile displayed rows, selection, and scrolling before change listeners run when transactions, remote operations, or undo/redo change filters, sorting, hidden rows, or row groups, including structural edits that clear a query. Keep filtered row geometry bounded when row heights change or a sheet is activated.
- 92dcd37: The ribbon's View › Zoom group is one stepper, Zoom Out, the zoom percent and Zoom In. Select the percent to return to 100%; at 100% it is disabled. Its accessible name starts with the shown percent, for example "120%, zoom to 100%", so voice control can target it by its visible text.
  
  The find and replace bar uses one field style for both fields, with its own focus ring, and shows the match count inside the find field. The Previous, Next and Close buttons have accessible names, and the replace-all button reads "Replace all".
  
  Several command icons are clearer at 16 px: row, column, freeze and merge icons no longer draw a full frame, vertical alignment uses arrows, and Comma Style shows ",00".
- 3bdb073: The packages are smaller to install. The code is not minified and stays readable.
  
  - `@sheetwrite/core` is 1.83 MB → 1.55 MB unpacked (387 KB → 350 KB packed), with 214 → 157 files.
  - The packages publish only the type declarations that their entry points use. Core no longer ships 57 internal declaration files (117 KB), and `@sheetwrite/xlsx` no longer ships 8. You cannot import these files through the package `exports`, so no types change.
  - The published JavaScript uses 2-space indentation instead of 4. This saves 155 KB in core and 20 KB in `@sheetwrite/xlsx`.
  - `@sheetwrite/wasm` and `@sheetwrite/formulas` no longer publish `pkg/sheetwrite_wasm_bg.wasm.d.ts` (14 KB each). No entry point refers to it, and `sheetwrite_wasm.d.ts` has the same types.
- ec8e0ee: Make each local commit cost the same at any offline queue depth. `SyncCoordinator` no longer walks every pending commit to pick a base version or report its state, so 10,000 queued edits no longer slow the next one down.
- bcfe991: `TODAY` and `NOW` now read the clock once in each recalculation, as in Excel. Every `TODAY` and `NOW` in one recalculation uses the same time. Before, they used only the time from the last `recalculateVolatile` call. `recalculateVolatile(date)` still uses the time you give it, until the next edit.
- 2984b0b: XLSX import now builds the snapshot cells while it reads the worksheet rows, so each cell has one representation in memory instead of two. Restoring Sheetwrite sidecar fields now indexes only the sidecar cells, not all cells. Snapshot validation now finds duplicate cells with sorted numeric keys instead of a set of text keys, builds cell paths only for cells that fail, and counts the bytes of integers without making text. Validation results are the same. On generated 200,000 × 8 and 1,000,000 × 8 workbooks, over seven interleaved rounds for each side, the median import peak RSS went from 1,095 MiB to 800 MiB and from 5,061 MiB to 3,352 MiB (buffered). With `fromXlsxWorkbookFile`, it went from 1,112 MiB to 779 MiB and from 4,475 MiB to 3,336 MiB. The highest candidate run was lower than the median baseline run in all four cases, and the median import time decreased by about 20%.
- Updated dependencies [34bdcba]
- Updated dependencies [34bdcba]
- Updated dependencies [8d70aae]
- Updated dependencies [9dc3ab1]
- Updated dependencies [34bdcba]
- Updated dependencies [b6f333c]
- Updated dependencies [0b5cc2d]
- Updated dependencies [ec8e0ee]
- Updated dependencies [34bdcba]
- Updated dependencies [0f36fda]
- Updated dependencies [957b82f]
- Updated dependencies [3bdb073]
- Updated dependencies [bcfe991]
- Updated dependencies [bcfe991]
- Updated dependencies [064fe74]
  - @sheetwrite/wasm@0.6.0

## 0.5.4

### Patch Changes

- cb8a609: Remove `sourceMappingURL` comments that pointed to source map files the packages do not publish. Debuggers and bundlers no longer try to load missing maps.
- Updated dependencies [aba7c92]
  - @sheetwrite/wasm@0.5.4

## 0.5.3

### Patch Changes

- 885b764: Package READMEs show npm, pnpm, Yarn, and Bun install commands, and the core and WASM READMEs explain how to select the full formula engine.
- 222a3f8: Publish readable JavaScript again. 0.5.2 removed whitespace from the published files, so stack traces pointed into one long line and the code in `node_modules` was hard to read and debug. Your bundler still minifies your app build. Module paths, exports, and type documentation do not change.
- Updated dependencies [885b764]
- Updated dependencies [222a3f8]
  - @sheetwrite/wasm@0.5.3

## 0.5.2

### Patch Changes

- e09f014: Reduce peak memory during CSV import by reusing parsed arrays for visible columns.
- f836aba: Key combinations with Shift or Alt and a digit or symbol now run. For example, `"Mod+Shift+1"` runs when the browser reports `!` for Shift+1. Letters and digits keep their meaning on other keyboard layouts.
- 2e4231c: Remove comments and extra whitespace from published JavaScript to reduce package download and installed sizes. Keep module paths, exported names, type documentation, and WebAssembly binaries unchanged.
- Updated dependencies [2e4231c]
  - @sheetwrite/wasm@0.5.2

## 0.5.1

### Patch Changes

- 1f50d09: Built-in toolbar, context-menu, and find buttons show busy state while commands run and show errors when commands fail. Repeated starts of a pending command are ignored. Blocked clipboard access shows a recovery message.
  
  `GridActions.exportXlsx()` returns a promise that never rejects. Built-in export failures show an alert and emit `export-error`; the event format can be `"csv"` or `"xlsx"`. Direct `Grid.exportXlsx()` calls still reject on failure.
- 7d9b52a: Add checked API examples and links for grid setup, data, synchronization, framework components, engine selection, and XLSX import and export.
- edb091d: Add declarative keyboard bindings, custom key combinations and platform-aware shortcut labels. Context menus and toolbar titles use the same bindings.
  
  API change: a key combination is a string such as `"Mod+Shift+K"` or `"Ctrl+Alt+Delete"`, or an object such as `{ key: "k", mod: true, shift: true }`. `Mod` is Command on macOS and Control elsewhere; `Ctrl` and `Meta` are always literal. `ContextMenuItem.shortcut` accepts a bound action name, such as `"copy"`, or a key combination. Replace free-text shortcut hints with one of these forms. Use `config.keyboard.bindings` to change or disable an action's keys.
  
  A context-menu item with a key combination and an `onClick` now runs `onClick` when the grid has focus and the user presses that combination. A combination with `Mod`, `Ctrl` or `Meta` also works in the inline editor. Two commands with the same combination throw a `SheetwriteError` with code `shortcut-conflict`; a malformed combination throws `invalid-shortcut`.
  
  Document `highlightCells(null)` to clear temporary highlights. Update showcase menus for their tasks. The Vanilla "Highlight cell" menu item now applies a cell fill, so Undo removes it, and the same item clears it.
- Updated dependencies [7d9b52a]
- Updated dependencies [c8db125]
  - @sheetwrite/wasm@0.5.1

## 0.5.0

### Minor Changes

- be6b618: Restore large cleared ranges with a lossless `restoreBlock` document operation. If compact encoding still cannot fit, split restores into an atomic multi-version batch. Undo remains one history step and one change event. Each version keeps the default 8 MiB payload limit.
  
  Add optional `PersistenceAdapter.commitBatch`, batch positions on `VersionedOperation`, and durable version operation counts. Servers must apply and publish all members or none. Peers wait for every member before applying the batch. Batches have fixed ceilings of 16 versions and 64 MiB.
  
  Validate compressed values, formulas, references, styles, and envelope fields before mutation. A restore block can decode to at most 64 MiB of JSON and 4,000,000 cells. Hosts must support `restoreBlock` and batch metadata before accepting new clients. Snapshot schema version 1 and host transaction results do not change.
  
  Core now depends on `fflate` 0.8.3 for the `restoreBlock` DEFLATE codec. It is the same pinned version that `@sheetwrite/xlsx` uses. Core still does not depend on `@sheetwrite/xlsx`.
- a9a3c5f: A Grid with `presentation: "data-grid"` shows only its own columns. Before, it added empty, unnamed columns until the grid filled its host width, as a spreadsheet does, and typing into them created cells with no column. A spreadsheet still fills the width. To keep empty columns in a data grid, set `minColumns`.
- 9915236: Add `releaseEngineMemory()`. Call it when the app is idle, for example after a large clear or after a big sheet closes. It moves every live store into a fresh WASM instance and lets the browser free the old instance's memory, which a WASM instance never gives back by itself. Cached formula results, loaded datasource pages, unsaved edits and undo/redo history move with the stores. If any store cannot move, all stores stay on the old instance and nothing changes. The returned report gives the WASM bytes before and after and the pause.
  
  After a three-column, million-row sheet is cleared down to ten rows, WASM memory drops from 173 MiB to 38 MiB, the size of a freshly built store with the same content. Release never makes WASM memory larger. The pause grows with the live data: about 50 ms in that case, and up to about 270 ms when undo history for the cleared million rows is kept.
  
  Both engine loaders can create independent instances from shared compiled code. For direct engine use, `load()`, `isLoaded()`, `initSync()` and the synchronous exports keep working. The default engine grows by about 9 KB (Brotli).
  
  **Breaking:** core now owns its own engine instance, so `await initSheetwrite()` is required before you create a Grid or a `SheetwriteStore`. Calling only `load()` from `@sheetwrite/wasm` or `@sheetwrite/formulas` no longer initializes core; the error message now says so. Apps that already call `initSheetwrite()` need no change.
- b8dbb50: Add `@sheetwrite/formulas`, an optional full formula engine. It is the same Rust engine as `@sheetwrite/wasm`, built with more functions, and it has the same API and loaders. The full engine is a separate build: it adds nothing to the function set or binary of the default `@sheetwrite/wasm` engine.
  
  - Select the full engine one time, before the app creates a grid or a store: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`. A call that selects a different engine after this rejects. Calls without an engine keep the selected engine, so framework adapters work with both engines.
  - The full engine adds 36 statistical distribution functions: `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `F.DIST`, `F.DIST.RT`, `F.INV`, `F.INV.RT`, `BINOM.DIST`, `POISSON.DIST`, `EXPON.DIST`, `GAMMA`, `GAMMALN`, `GAMMA.DIST`, `GAMMA.INV`, `BETA.DIST`, `BETA.INV`, `LOGNORM.DIST`, `LOGNORM.INV`, `WEIBULL.DIST`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `STANDARDIZE`, `FISHER`, `FISHERINV`, `PHI`, and `GAUSS`. They use the Excel argument rules and error values.
  - Formula assist suggests only the functions of the selected engine. With the default engine, these functions return `#NAME?`.
  - In this release, the full engine binary is 1,160,345 bytes (344,260 bytes with Brotli) and the default engine binary is 876,918 bytes (256,150 bytes with Brotli).
- a767c8b: Add `SyncCoordinator.recoverConflict()`. After a base-version conflict, it recovers on the live Grid without a reload when the pending work and the server versions it did not see change different cells and sheets, and neither side inserts, deletes, or moves rows or columns. It applies the missed server versions, moves the pending queue onto the server head, keeps undo history, and emits a `recovered` event; call `flush()` to resend. In every other case it returns `reload-required` with a `SyncConflictReloadReason` and changes nothing, so the host reloads as before.
- 73cb52a: Reuse decoded compressed restore blocks during synchronous transaction application and row projection, while revalidating payloads changed by host callbacks. Large-clear undo uses its already materialized block without decompressing it again. Rebase decodes each restore once across structural edits and serializes it once when complete. Document operations and change events retain their existing wire format.
- e6b6dbb: Share adapter initialization, reset classification, Grid generation publication, and retirement through `createAdapterGridController` in `@sheetwrite/core/adapter`. Apply pending live options before readiness, retire a new Grid when publication or readiness callbacks throw, preserve first-source loader diagnostics without replacing healthy Grids, and treat omitted and canvas renderers as the same input.
- bc7bc53: Reclaim obsolete text after committed edit transactions when dead storage exceeds the collection thresholds. History snapshots own their text, and raw string IDs and worker frames carry a pool epoch so caches remain correct after collection. Explicit string compaction now also reclaims unreachable text.
- 59e8d1a: Show the real default colors in the toolbar color swatches. Before, the text color and fill color swatches always showed black until the user picked a color. Now they show the grid theme's text and cell background colors, and they follow theme changes until the user picks a color.
  
  Add `grid.getTheme()`, which returns a copy of the base theme, and the `theme-change` event, which the Grid emits after `setTheme` or `replaceTheme`.

### Patch Changes

- a490186: Row projection keeps a bounded window of recent transaction IDs and local operation fingerprints. Each window defaults to 8,192 entries. Set `maxRecentTransactions` in `createRowBridge` to a positive safe integer to change the limit. Hosts that apply local echoes directly must deliver them before their identities leave this window. The bridge reuses identity entries and removes the oldest entry without a scan.
- b2379eb: Fill, Replace all, formatting across merged cells, merging cells, and deleting a sheet now read old cell values in bulk and write with one range operation, instead of one engine call and one operation per cell. Undo capture for multi-cell edits reads in bulk too. In local alternating comparisons, fill took 66–71% less time from 1,000 to 100,000 cells, Replace all 35–50% less, formatting a 4,096-cell selection across merges 52% less, merging cells 41% less, and deleting a 100,000-cell sheet 85% less. Events, undo results, and sync operations stay the same. Sheets with validation rules or protected ranges keep one operation per cell, so policy issues still name each cell.
  
  Fill and Replace all now send one range operation instead of one operation per cell, so the `maxOperations` transaction limit (10,000 by default) no longer rejects them when they cover more than 10,000 cells, as paste already worked. The `maxEncodedBytes` limit still applies.
- fca4622: Read selection styles and detailed clear events in batches, and avoid repeated paged dirty-state reads for large sparse edits. In local alternating comparisons, a 4,096-cell toolbar summary took 52% less time, detailed clears of 10,000–100,000 cells took 69% less time, and acknowledging a 10,000-cell sparse edit without a stored revision took 25% less time.
- ed66b6d: Faster large edits, scrolling and collaboration paths. Results are unchanged; numbers are medians from alternating runs.
  
  - A large `setBlock` measures its payload once per commit instead of three times: a 1,000,000-cell block write is 60% faster (1,364 ms to 545 ms), 50% faster with detailed change capture.
  - Number and date cells reuse their formatted text, and wrapped text stops laying out lines that cannot be drawn: wrapped-text scrolling is 39% faster and number-format scrolling 14% faster.
  - Inserting rows with a row bridge checks duplicate IDs with a set: inserting 10,000 rows into 1,000,000 fell from 34.7 s to 5 ms.
  - Framework adapters subscribe to command state only while a command-state handler exists, so selection skips the per-cell summary otherwise (24% faster selection without a handler).
  - Rebasing operations no longer clones them a second time (98% faster for a large block), and sparse writes skip validation rules outside the written area (22% faster with 100 unrelated rules).
  - A search highlight or note on a partly visible top row is no longer dropped, and a command-state handler installed inside a selection or change callback now receives the following emission.
- 11e9336: Keep calculated formula values and spill output separate from written cell sources. Hydrating a source into spill output now preserves the source and reports `#SPILL!`; paged formulas request unknown spill destinations as calculation prerequisites. History captures source cells rather than calculated output, including fallback history for custom stores.
  
  For direct `CellStore` users, finish staged edits or page loads with `commitSources()`, which completes recalculation and collects eligible string-pool garbage after local edits. Page loads retain the existing deferred-collection policy. This replaces `endMutation()`, `endPageLoad()`, and `recomputeChanged()`. `admitSourceRange()` checks spill admission in Rust without transferring an owner window.
  
  Bulk source loads invalidate calculated output once per range, avoiding per-cell spill teardown and redundant dirty-cell tracking before whole-sheet recalculation.
  
  Formula range evaluation decodes literal source payloads directly, keeping calculated-overlay resolution off literal scans while retaining source precedence for spill output.
  
  Calculated errors share the same tagged overlay slots as other formula results, avoiding a separate error hash table and its per-result allocation and lookup costs.
  
  Engine memory release transfers calculated overlay slots and spill ownership independently of source storage, preserving cached volatile values, calculated errors, blocked spills, and compact undo history without recalculation.
- 26a3552: Keep row and column resize previews out of the document until release, then record one undoable change. Cancel active pointer gestures on sheet, view, structure, or read-only changes and ignore other pointers during a drag. Keep all editors bound to their original document cell through sorting and filtering. Notify selection changes before edit-begin, prevent reentrant handlers from reopening stale editors, and leave selection unchanged when a fill is rejected.
- 0f4b9da: Reduce transaction admission work when counting encoded JSON bytes. Count plain ASCII runs together, encode finite number lengths without JSON serialization, and check own `toJSON` properties without allocating descriptors. Keep byte counts, resource limits, and invalid-input checks unchanged.
- d1d34b9: Allow row insertion and layout refresh to grow an admitted grid beyond the default snapshot row limit. Snapshot validation and direct workbook construction continue to enforce their configured resource ceilings.
- cf1a10c: Load the off-screen cells that visible formulas read. With a windowed datasource, a formula that read a column outside the visible columns showed `#LOADING!` forever, because nothing requested that column for those rows. The Grid now asks the engine which same-sheet cells the visible formulas read, including cells reached through other formulas, and loads them with the window. A cell budget equal to the prefetch byte limit bounds this work, so a whole-column read cannot make one window load the full column. Reads from other sheets are not loaded.
  
  `CellStore` in `@sheetwrite/wasm` adds `formulaReadBands`.
- 48be92d: `MemoryPersistenceAdapter` commits are faster on large documents. Each document keeps one live store, so a commit applies its transaction instead of rebuilding the whole workbook from a snapshot, re-exporting it and copying it. With a 110,000-cell document, a one-cell commit no longer blocks for about 450 ms. `load` and conflict responses export a fresh snapshot on demand. A rejected or aborted commit, including a failed member of an atomic batch, still leaves the document unchanged.
- ef2b0f5: Negative numbers put the minus sign before a currency prefix, as Excel does.
- 2c03528: Scrolling a large search result no longer walks every match on each repaint. Search
  highlights and note indicators are indexed by view row and rebuilt only when the matches,
  notes, view order or geometry change, so a repaint touches just the rows the viewport
  covers. Header hover resolves the previous visible column from the column index instead of
  scanning the column list, and a legacy DOM cell renderer that only moved keeps the
  accessibility and interactivity semantics it already installed.
- 2b5f1eb: Faster bulk loading through packed block writes.
  
  - **Breaking for direct `@sheetwrite/wasm` users:** `CellStore.setBlock` is removed. Use `CellStore.setBlockPacked`, which takes the text of every string cell as one UTF-8 buffer plus byte offsets instead of one JavaScript string per cell. `setColumnBlockPacked` takes the same input in column-major order. Code that uses Sheetwrite through `@sheetwrite/core` or a framework adapter needs no change.
  - New engine exports: `setBlockPacked`, `setColumnBlockPacked`, `loadedSpans` (loaded row runs of one column) and `cellSnapshots` with its `CellSnapshot` result (packed old values for detailed change events).
  - Core loads columnar data column by column without a row-major copy, reads old values in bulk when detailed change capture is on, and reconciles paged residency with one call per column.
  
  Measured in alternating runs: loading 100,000 to 1,000,000 rows is 26–35% faster, number-only loading is 56–59% faster, a detailed-capture block write is 10% faster, and revisiting an evicted paged band needs 108 residency checks instead of 1,026.
- cb12daa: Fix pasting across hidden columns. Paste into the visible columns, leave hidden cells unchanged, and undo the paste in one step.
- 4d4b204: Keep sheet tab scrolling inside the tab strip. Mounting a workbook no longer scrolls the surrounding page. Keyboard navigation still reveals the selected tab.
  
  The sheet options menu now stays open when another part of the page scrolls. It still closes when a scroll moves the options button. Before, any scroll on the page, such as a growing event log, closed the menu and dropped keyboard focus.
- be093cd: Fix `rebaseDocumentOperations` for pending work with more than one operation. Each server operation is now moved past the earlier local operations before it is compared with a later one. Before, an edit written after a local row or column insert or delete could land on the wrong row, and an edit to a row the server deleted could be written onto a different row instead of returning a `structural-overlap` conflict. A pending move that reorders cells a server operation targets now returns an `unsupported-structural` conflict.
- 43b0e9c: Keep undo and redo correct after remote row and column changes. `Grid.applyRemoteOperations`, which `SyncCoordinator` uses for every remote version, now moves undo and redo entries past remote row and column inserts and deletes, as local ones already did. Before, undoing a local edit after a collaborator inserted or deleted rows above it wrote the old value onto a different row and left the edit in place. An undo entry whose row a collaborator deleted no longer changes any other row.
- 7221484: Report an undo that is too large instead of failing silently. When the data that an undo restores is above the transaction limits (`maxEncodedBytes` or `maxOperations`), `grid.undo()` changes nothing. The Grid now emits `mutation-rejected` with the `resource-limit` issue and removes that entry from the undo history, so older edits can still be undone. Before, the Grid sent no event and kept the entry, so every later undo failed the same way. Large restores first use the compact `restoreBlock` encoding and atomic batches, so this applies only to an undo that still exceeds those ceilings.
- b54b29a: Keep row numbers below the column header. When the top row was scrolled partly under the header, its number painted into the header's top-left corner. Row numbers now clip at the header edge, like cell text.
- e725d98: Support spill references such as `A1#`. A spill reference refers to the current spill of its anchor cell and follows it when the spill changes size. It returns `#REF!` when the anchor holds no spill. Row and column edits move the reference with its anchor. XLSX import and export convert it to and from `_xlfn.ANCHORARRAY`.
- eb1c786: Faster CSV import and workbook snapshot validation.
  
  - CSV import writes each parsed record straight into its target columns instead of building an intermediate string grid. Plain fields are one slice of the input, and imported values are converted without building a temporary cell value. Over 200,000 rows by 10 columns, a same-process A/B measured a 52% median improvement (493 ms to 239 ms). The parsed values are unchanged.
  - Snapshot validation builds an error path only when it reports a problem, instead of formatting one for every property it checks. Error paths and messages are unchanged.
- fdc14ce: A theme change now also repaints the built-in toolbar, find bar, and context menu. Before, `setTheme` and `replaceTheme` updated only the canvas, so after a switch to dark these widgets kept the light colours.
- 99435f8: Keep painted and frozen cells resident during unrelated bulk reads. Load the same-sheet formula dependencies of frozen cells and reached merge anchors, and retain the bounded formula closure while its window is visible. Give bulk reads transient pins separate from viewport protection and caller-owned WASM `pinRange` pins.
- Updated dependencies [a320510]
- Updated dependencies [f25513a]
- Updated dependencies [0241abd]
- Updated dependencies [837eb95]
- Updated dependencies [1240c84]
- Updated dependencies [ed66b6d]
- Updated dependencies [9915236]
- Updated dependencies [c6674f9]
- Updated dependencies [d137ff0]
- Updated dependencies [7f73dc7]
- Updated dependencies [b771aa0]
- Updated dependencies [ddaac0d]
- Updated dependencies [11e9336]
- Updated dependencies [d63ac3d]
- Updated dependencies [cf1a10c]
- Updated dependencies [2b5f1eb]
- Updated dependencies [64aebd9]
- Updated dependencies [2dcfc2e]
- Updated dependencies [2c26d4c]
- Updated dependencies [11e8edd]
- Updated dependencies [e725d98]
- Updated dependencies [5bdff6a]
- Updated dependencies [bc7bc53]
- Updated dependencies [99435f8]
  - @sheetwrite/wasm@0.5.0

## 0.4.0

### Minor Changes

- 41f6749: Remove the unsupported `cloneCellHyperlink` and `createHyperlinkId` root exports. Hyperlink behavior remains available through the documented grid APIs.

### Patch Changes

- 8457eca: Fall back observably to the main-thread renderer when a paint worker cannot initialize, cannot create a 2D context, or loses its context. The public worker acknowledgement type now includes `ready` and `fatal` lifecycle messages.
- dac694a: Re-rasterize the grid when a window moves between displays with different pixel densities instead of remaining blurry or oversized until the next interaction.
- 0e09ecc: Share cell-kind wire tags across the store, window reader, and paint worker to prevent internal WASM contract divergence.
- 41f6749: Exclude generated source maps from the published package while retaining JavaScript, declarations, styles, and unchanged browser runtime output.
- 41f6749: Pack visible-window numeric, kind, style, string-index, and conditional-format data into one validated transfer buffer, reducing ordinary window reads from seven output allocations to one.
- 41f6749: Compare render state with allocation-light scalar snapshots instead of rebuilding composite signature strings on every frame.
- 55b1f35: Stop exporting implementation-only helpers and types from internal modules, and gate package workspaces against new unused internal exports.
- b225783: Keep cached worker-renderer views valid across repeated paints so scrolling no longer produces blank or stale regions.
- 41f6749: Keep paged transaction admission and reference accounting isolated from dense store initialization while preserving existing resource limits.
- ce1e404: Keep uniform row geometry allocation-free until a custom row height requires dense indexing.
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
  - @sheetwrite/wasm@0.4.0

## 0.3.1

### Patch Changes

- Correct the core package release metadata and package-specific changelog without changing runtime behavior.
- Updated dependencies
  - @sheetwrite/wasm@0.3.1

## 0.3.0

### Minor Changes

- e551eb0: Introduce the canonical `SheetwriteError` envelope and stable error codes across initialization, data sources, rendering, persistence, synchronization, collaboration, and import/export boundaries, with serialization-safe context and explicit retryability.

## 0.2.0

### Minor Changes

- 6ed7572: Harden collaboration, persistence, paged datasource, snapshot, and spreadsheet interchange boundaries; add bounded XLSX import/export with independent producer coverage; improve large-dataset cache behavior and browser rendering; and ship complete framework, database, collaboration, interoperability, and performance showcases.
- 87fadb7: Strengthen collaboration recovery, bounded persistence and paging, snapshot resource enforcement, and framework adapter contracts.

  Replace the optional XLSX implementation with a bounded OOXML codec, broaden workbook fidelity and producer conformance, and add deterministic performance evidence.

  Ship searchable capability-owned evaluation surfaces for framework integration, database lifecycle, collaboration, interoperability, and million-row performance.

### Patch Changes

- Updated dependencies [6ed7572]
- Updated dependencies [87fadb7]
  - @sheetwrite/wasm@0.2.0
