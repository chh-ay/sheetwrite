# @sheetwrite/core

## 0.7.0

### Minor Changes

- [#622](https://github.com/chh-ay/sheetwrite/pull/622) [`5ddb4b4`](https://github.com/chh-ay/sheetwrite/commit/5ddb4b458a11733138ec0a8eb9b48f9522aeb400) Thanks [@chh-ay](https://github.com/chh-ay)! - **Breaking:** the simple `Sheetwrite` component has one size rule in React, Vue and Svelte: give exactly one of `height` or `fill`.
  
  - All three check it the same way, while rendering and before a grid mounts. Both or neither throws `SheetwriteError` with code `invalid-argument` and operation `create-grid`. React used to accept both or neither at run time and let `fill` win. Svelte checked after the grid had mounted.
  - Vue types `fill` as `fill?: true`, like React and Svelte, and its `SheetwriteProps` is now a type alias whose `height` and `fill` exclude each other. Code that extends the `SheetwriteProps` interface must use the type instead, and TypeScript code that passes `fill: false` must leave `fill` out.
  - The Svelte `Sheetwrite` declaration keeps the `Row` and `Id` generics, so `columns`, `getRowId` and the row callbacks are typed from your `defaultRows`.

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

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - When two or more entries in the column begin the typed text, AutoComplete lists them under the cell editor. Inline completion and its keys stay as in Excel; Alt+Down moves into the list, the arrow keys move, and Enter or a click puts the entry in the cell.

- [#877](https://github.com/chh-ay/sheetwrite/pull/877) [`d2c286f`](https://github.com/chh-ay/sheetwrite/commit/d2c286f359eddd3ceae65c9f8ae80aaa8db65c92) Thanks [@chh-ay](https://github.com/chh-ay)! - The fill handle shows the value the last cell will get in a tip while it is dragged, and after a fill the Auto Fill Options button redoes it as Copy Cells, Fill Series, Fill Formatting Only or Fill Without Formatting (and Fill Days, Weekdays, Months or Years for dates), as one undo step, as in Excel. New glyph `autoFillOptions`.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter dropdown counts rows. Each value shows how many rows hold it ("North 12"), as do a date column's years, months and days, and OK counts the rows the choice keeps, live: "OK (12 of 48 rows)". The engine returns the counts with the distinct values, in the same scan. A column whose own filter is a value list no longer scans the column a second time to tick its values.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter treats a date column as Excel does. A number whose cell has a date format is a date, and a column of mostly dates offers Date Filters. The value list groups dates by year, month and day, and each value shows as its cell shows it (`$39.50`, not `39.5`). Before, only the column's own type and format counted.
  
  Date Filters adds Excel's periods: Tomorrow, Today, Yesterday, the next, this and last week, month, quarter and year, Year to Date, and All Dates in the Period. They are the new `ColumnFilter` kind `{ kind: "dynamic", type }`, typed `DynamicDateFilter`, with Excel's XLSX `dynamicFilter` names; `isDynamicDateFilter(name)` checks a name. XLSX import and export keep them, and export names a value list's numbers by their cells' text.

- [#736](https://github.com/chh-ay/sheetwrite/pull/736) [`2c06012`](https://github.com/chh-ay/sheetwrite/commit/2c0601238ee6b574f66bb10fab3e8a6515a2002b) Thanks [@chh-ay](https://github.com/chh-ay)! - Excel's AutoFilter, in the document model. `Grid.setAutoFilter(range)` turns filter buttons on for a range whose first row is the header, and `setAutoFilter(null)` turns them off; with an AutoFilter, column filters hide only the range's rows below the header, so the header, and rows above and below the range, always show. `getAutoFilter()` reads it and `reapplyFilter()` filters again after edits, as Excel's Reapply. The sheet's `autoFilter` saves with the snapshot, syncs to collaborators, follows inserted and deleted rows and columns, and is one undo step.
  
  A new column filter, `{ kind: "custom", join, conditions }`, holds Excel's custom AutoFilter: one or two conditions (equals, does not equal, greater or less than, begins with, ends with, contains, does not contain), joined by AND or OR. They match as COUNTIF criteria do, wildcards and blanks included.
  
  Column filters now keep through inserted and deleted rows, and move with their columns when columns are inserted, deleted or moved; before, any row or column edit cleared them.
  
  XLSX import reads a worksheet `<autoFilter>`, with value lists, custom filters and non-blank filters, instead of dropping it with a warning; rows the filter hid in Excel become filtered rows, not hidden ones. Export writes `<autoFilter>`, the `_xlnm._FilterDatabase` name and, when it comes from a grid or store, the rows the filter hides, so Excel opens the file filtered.

- [#743](https://github.com/chh-ay/sheetwrite/pull/743) [`4b5d9d2`](https://github.com/chh-ay/sheetwrite/commit/4b5d9d22f92abbab7acf55f95ed9f08f5d40bb1b) Thanks [@chh-ay](https://github.com/chh-ay)! - Excel's AutoFilter in the grid. Data › Filter, Ctrl+Shift+L and `grid.actions.toggleAutoFilter()` turn filter buttons on for the table, selected range or current region around the focus cell, and off again. Each header cell of the range shows a button, a funnel when its column is filtered. The button, or Alt+Down on the header cell, opens a dropdown: sort, Clear Filter From, Number, Text or Date Filters with Excel's Custom AutoFilter dialog, and a searchable value list with (Select All) and (Blanks). It lists the values of the rows the other columns' filters keep, as Excel does. The dropdown is a labelled dialog with a multi-select listbox, fully usable from the keyboard, and loads on first open.
  
  Data › Clear and Reapply, `clearFilters()`, `reapplyFilter()` and `filterBySelection()` join the ribbon, and a Filter submenu (filter by the selected cell's value, reapply, clear the column's filter) joins the cell context menu. Filtering keeps the selection on the header, and while a filter or hidden rows hide rows, row headers show the sheet's row numbers, as in Excel.

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

- [#803](https://github.com/chh-ay/sheetwrite/pull/803) [`d4bab01`](https://github.com/chh-ay/sheetwrite/commit/d4bab014eab6929e0c41e1948812298552520f51) Thanks [@chh-ay](https://github.com/chh-ay)! - Glyphs drawn for the 0.7.0 commands that showed a reused glyph or none:
  
  - **Insert Cells… and Delete Cells…** join Home › Cells › Insert and Delete (and Insert › Rows & Columns) and the context menu's Insert and Delete submenus, with the new `insertCells` and `deleteCells` glyphs. They open Excel's Insert or Delete dialog, as Ctrl/Cmd + + and Ctrl/Cmd + - do. New context-menu actions: `insertCells` and `deleteCells`.
  - **Format Cells…** joins Home › Cells › Format, and it and the context menu's Format cells… show the new `formatCells` glyph instead of the row-height glyph.
  - **AutoFilter header buttons** draw `filterArrow`, or `filterActive` (a funnel beside the arrow) on a filtered column, from the icon sheet, in its stroke and corners. Before, they were a filled triangle and a filled funnel, and the filtered button lost its arrow. They now need `icons.css`, which `styles.css` includes.
  - **Sort & Filter**'s glyph is the sort arrow beside a funnel, so the menu no longer shows the same glyph as its Filter item.
  - **PivotChart** shows the new `pivotChart` glyph (columns and the pivot's turning arrow) instead of Chart's glyph, which it sat beside.
  - **The sheet tab menu** shows `insertSheet`, `moveCopySheet` and `tabColor` beside Insert, Move or Copy… and Tab Color…, in an icon column like the context menu's. It needs `icons.css` for them, and `config.icons` overrides them. The tab bar's Add sheet plus is drawn at the icon sheet's stroke weight.
  - New on the icon sheet for commands that follow: `settings` and `keyboardShortcuts`.

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

- [#543](https://github.com/chh-ay/sheetwrite/pull/543) [`9a85f26`](https://github.com/chh-ay/sheetwrite/commit/9a85f26aecb57b42ff10f8f4702d2f833c5ea259) Thanks [@chh-ay](https://github.com/chh-ay)! - The stylesheet ships in parts under `@sheetwrite/core/styles/`: `grid.css` (always needed), `formula-help.css`, `find.css`, `ribbon.css`, `panels.css`, `context-menu.css`, `tabs.css`, `charts.css`, `icons.css` and `dashboard.css`. A grid with only `grid.css` ships about 5 KB of CSS instead of 89.5 KB. `styles.css` imports every part, so an app that imports it looks the same as before. The framework adapters have the same parts, for example `@sheetwrite/react/styles/ribbon.css`. In a development build, a widget whose part is missing logs one warning that names the part.
  
  The command icon sheet is now its own file, `styles/icons.svg`, which `icons.css` loads, instead of a `data:` URL inside the stylesheet. Only pages that show icons download it, and the browser caches it. `@sheetwrite/core/icons.svg` still points at the same sheet.
  
  Upgrade checklist:
  
  - Nothing to do if you import `styles.css` with Vite, webpack or Next.js: they copy `icons.svg` into the build.
  - With esbuild, give `.svg` files a loader, for example `loader: { ".svg": "file" }`. Without one, the build fails with `No loader is configured for ".svg" files: icons.svg`.
  - If you set `--sheetwrite-icon-sheet` only because your Content Security Policy blocks `data:` images, you can remove it: the default sheet is now a file from your own origin.
  - To ship less CSS, replace `styles.css` with the parts your grid uses, `grid.css` first. The docs page on styles lists which part each widget needs.

- [#286](https://github.com/chh-ay/sheetwrite/pull/286) [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can register synchronous JavaScript functions that formulas call, on the full engine (`@sheetwrite/formulas`). Import `registerFunction(store, metadata, implementation)` and `unregisterFunction(store, name)` from `@sheetwrite/core/functions`; an application that does not import that entry carries none of its JavaScript, and the default engine binary does not change. On the default engine, `registerFunction` throws a `SheetwriteError` with code `optional-backend-unavailable`. A thrown error or a result that is not a number, text, boolean or `null` shows `#VALUE!`. A workbook that calls a function that is not registered shows `#NAME?`. `listFunctions(store)` returns the metadata of the built-in functions of the active engine and of the host functions in one list.

- [#797](https://github.com/chh-ay/sheetwrite/pull/797) [`9571bc1`](https://github.com/chh-ay/sheetwrite/commit/9571bc1cc57ceb07fbb5aef41f6bb50d46003b41) Thanks [@chh-ay](https://github.com/chh-ay)! - Cut and paste moves cells, as Excel's Cut and Paste does. Cut no longer empties its cells: it marks them with a moving dashed border, and the next paste moves their values, formulas, formats, notes, hyperlinks and merged cells with one new `moveCells` document operation. Every formula, defined name and chart that refers to a moved cell follows it, on the same sheet or to another one, and a reference to a cell the paste replaces becomes `#REF!`, as in Excel. A formula inside the moved block keeps pointing at the same cells. Esc, an edit, another copy or a structural change ends the cut. The move is one undo step and syncs as one operation; rebase treats it like a row move. The `"cut"` commit reason is no longer emitted.
  
  The engines add `CellStore.moveCells` and `CellStore.moveCellsLosses`.

- [#479](https://github.com/chh-ay/sheetwrite/pull/479) [`1aada28`](https://github.com/chh-ay/sheetwrite/commit/1aada28341741ee998205962f203179a87c6c5b9) Thanks [@chh-ay](https://github.com/chh-ay)! - Dashboards show KPI cards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). A `DashboardKpiItem` (`kind: "kpi"`) shows the value of one data model measure, in the filter context of the dashboard's slicers, with an optional caption and number format. **Insert › Dashboard › KPI Card** adds one.

- [#478](https://github.com/chh-ay/sheetwrite/pull/478) [`4b705e2`](https://github.com/chh-ay/sheetwrite/commit/4b705e28bf9a003192d234b7e3becd385fe1481b) Thanks [@chh-ay](https://github.com/chh-ay)! - Dashboards show PivotCharts ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). `ChartDefinition.pivot` names a pivot on the same sheet; the chart shows its row items as categories and each value field, for each column item, as a series, without subtotals or totals, as an Excel PivotChart does. The new `DashboardChartItem` (`kind: "chart"`) shows such a chart in a dashboard box, and **Insert › Charts › PivotChart** adds both in one undo step. Slicers filter the chart with its pivot.

- [#416](https://github.com/chh-ay/sheetwrite/pull/416) [`9669e3c`](https://github.com/chh-ay/sheetwrite/commit/9669e3c83b42c23c9705477295baacc0b4c421fa) Thanks [@chh-ay](https://github.com/chh-ay)! - Add dashboard sheets ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). A sheet with `kind: "dashboard"` has no cells, rows or columns, and holds pivot and slicer items on a grid of 12 columns. The new `setDashboardItem` and `removeDashboardItem` operations are admitted (items stay inside the grid and do not overlap), undone, rebased, saved, synchronized and restored by version history. `SheetwriteStore` gets `getDashboard`, `setDashboardItem` and `removeDashboardItem`, and `grid.addSheet({ name, kind: "dashboard" })` adds a dashboard. New types: `SheetKind`, `Dashboard`, `DashboardBox`, `DashboardItem`, `DashboardPivotItem` and `DashboardSlicerItem`.

- [#467](https://github.com/chh-ay/sheetwrite/pull/467) [`acbd1e2`](https://github.com/chh-ay/sheetwrite/commit/acbd1e2864bfe552c30efd5303ec3ee9e215e721) Thanks [@chh-ay](https://github.com/chh-ay)! - Slicers filter dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). The slicers of a dashboard filter every pivot on it whose table reaches the slicer's table through many-to-one relationships, as report filters added when the pivot computes; the saved definitions do not change. In an editable grid a slicer selection is a saved, synced, undoable change; in a read-only grid it filters only that viewer's view. Insert › Filters › Slicer opens the Insert Slicers list on a dashboard.

- [#438](https://github.com/chh-ay/sheetwrite/pull/438) [`afa9bcc`](https://github.com/chh-ay/sheetwrite/commit/afa9bcc25a08321681187f8c300ff05b5e863271) Thanks [@chh-ay](https://github.com/chh-ay)! - Show dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). While a dashboard sheet is active, the grid shows its pivot and slicer items over the cells, from a chunk that loads the first time a dashboard is shown. Items move and resize with the mouse and with the keyboard; each step is one undo step. Slicer items list their column's values and save the values the user keeps. Insert › New Dashboard (`grid.actions.newDashboard()`, command state `newDashboard`) adds a dashboard, and on a dashboard Insert › PivotTable asks for a table and adds the pivot to the first free place. Pivots on a dashboard compute without placing output in cells; `getPivotResult` reports their status and size, and the dashboard view shows their cells.

- [#480](https://github.com/chh-ay/sheetwrite/pull/480) [`8298eda`](https://github.com/chh-ay/sheetwrite/commit/8298edad91dc51947941284785a83a2a662cecb1) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). Excel has no dashboard sheet, so each dashboard becomes a worksheet of its current values: pivot results, slicer selections and KPI values from the top-left of each item's box, and PivotCharts as native charts with literal data. The dashboard is saved in the Sheetwrite metadata and opens as a dashboard again. Core passes the computed values to the backend in the export context (`DashboardExport`, `DashboardItemExport`).

- [#396](https://github.com/chh-ay/sheetwrite/pull/396) [`b59c0af`](https://github.com/chh-ay/sheetwrite/commit/b59c0afccb201c5fb5d22584d311543e717ef71b) Thanks [@chh-ay](https://github.com/chh-ay)! - Add Data › Data Tools › Data Model and Relationships to the full ribbon, the compact ribbon and the toolbar ([#229](https://github.com/chh-ay/sheetwrite/issues/229)). Both open the data model panel, which loads on first use: it lists the workbook tables and the relationships with their key status, and creates, edits and deletes relationships as single undo steps. Data Model appears when the workbook has a table, and Relationships when it has two. As Excel does, the panel does not keep a relationship whose lookup keys repeat or whose key types differ.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Data › Data Validation opens Excel's Data Validation dialog for the selection, with Settings, Input Message and Error Alert tabs, Clear All, and "Apply these changes to all other cells with the same settings". OK applies the rule to the selected cells as one undoable step; a larger rule keeps its other cells. When the selection holds several kinds of rule, or cells with and without one, Excel's question comes first. The command is also `grid.actions.dataValidation()`.
  
  `DataValidationCondition` gains Excel's other Allow choices: `{ kind: "any" }`, `{ kind: "time" }`, `{ kind: "custom", formula }`, and a list whose items come from a range or a defined name, `{ kind: "list", source: "=$H$2:$H$5" }` or `"=Regions"`; the list shows the cells' current values. Comparison bounds may be formulas, such as `"=TODAY()"`. `DataValidationRule.inCellDropdown: false` hides a list's arrow and list, as Excel's "In-cell dropdown" does. Formulas are relative to the rule's top-left cell and follow inserted and deleted rows and columns. A list compares text without case, and a text length rule measures numbers too, as in Excel.
  
  XLSX import and export keep every Data Validation type, formula sources and bounds, and the dropdown flag. Before, formula-based rules and the time, custom and any-value types were dropped.
  
  The engine's `previewFormulaWith` evaluates a formula as if a cell held a given value, without changing the store; a custom rule checks a typed value with it before the value is stored.

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

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The `edit-begin` and `edit-commit` events carry `sheetAddress`, and the `selection` event `sheetFocus`: the cell in sheet rows next to the view-row address they already report. Under a filter, hidden rows or a view sort the two differ; use the sheet address to store or look up data.

- [#775](https://github.com/chh-ay/sheetwrite/pull/775) [`c424d11`](https://github.com/chh-ay/sheetwrite/commit/c424d11d0da598f36239782425e91aba306cc897) Thanks [@chh-ay](https://github.com/chh-ay)! - The fill handle follows Excel's AutoFill. It continues a series along the drag direction, also to the left and right: one date counts by days, numbers with a constant step continue it and other numbers continue their linear trend, day and month names continue, and text ending in a number counts up. One number, formulas and other text are copied. Filled cells take the source cell's format. Ctrl (Option on a Mac) swaps counting and copying, a double-click on the fill handle fills down as far as the next column's data, and the new `fillDown` (Mod+D) and `fillRight` (Mod+R) keyboard actions copy the selection's first row or column into the rest.

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

- [#796](https://github.com/chh-ay/sheetwrite/pull/796) [`7c0f093`](https://github.com/chh-ay/sheetwrite/commit/7c0f093e18ac730a70623d292b86113d908d35fd) Thanks [@chh-ay](https://github.com/chh-ay)! - Excel's keys for formats, rows and columns, and the Format Cells dialog:
  
  - Ctrl/Cmd + Shift + ~ ! @ # $ % ^ apply the General, Number, Time, Date, Currency, Percentage and Scientific formats with Excel's codes.
  - Ctrl/Cmd + 9 hides the selected rows and Ctrl/Cmd + Shift + 9 shows the hidden rows inside the selection; Ctrl/Cmd + 0 and Ctrl/Cmd + Shift + 0 do the same for columns.
  - Ctrl/Cmd + + (Ctrl/Cmd + Shift + =, or the keypad +) inserts and Ctrl/Cmd + - deletes: whole selected rows or columns at once, and for any other range an Insert or Delete dialog asks for entire rows or entire columns, with Excel's default. New actions: `grid.actions.insertCells(options?)` and `grid.actions.deleteCells(options?)`. They apply before they return, without a dialog, as Excel's `Range.Insert` and `Range.Delete` do in a macro: `{ entire: "row" }` or `{ entire: "column" }` chooses for a range that is neither whole rows nor whole columns, and without it the range's shape chooses, as the dialog's default does. `{ ask: true }` opens the dialog, as the keys do.
  - Ctrl/Cmd + 1, the context menu's new Format cells… item and `grid.actions.formatCells()` open Format Cells, with Number, Alignment, Font, Border and Fill tabs. OK applies what changed as one undoable step. `grid.actions.formatCells({ style, border })` applies a format the same way from code, before it returns, without the dialog.
  - The commands apply when they are called. Only the Insert, Delete and Format Cells dialogs load on first use, and keys pressed while one loads reach it once it opens.
  - New `KeyboardAction` names, which `config.keyboard.bindings` can rebind: `formatGeneral`, `formatNumber`, `formatTime`, `formatDate`, `formatCurrency`, `formatPercent`, `formatScientific`, `hideRows`, `unhideRows`, `hideColumns`, `unhideColumns`, `insertCells`, `deleteCells` and `formatCells`. New context-menu action: `formatCells`.

- [#426](https://github.com/chh-ay/sheetwrite/pull/426) [`27bb47b`](https://github.com/chh-ay/sheetwrite/commit/27bb47bd95cfa5f8b35df9add770486b48a0b754) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine adds `GETPIVOTDATA` ([#280](https://github.com/chh-ay/sheetwrite/issues/280)). It reads a value cell of a pivot table: the data field by its source name or caption (`"Sales"` or `"Sum of Sales"`), the pivot by any cell of its output, and field and item pairs in any order, with numbers and date serials as items. A pivot, field or item that the output does not show gives `#REF!`, as in Excel. Formulas that use it recompute when the pivot output changes, including pivots over the data model.
  
  The default engine does not change.

- [#399](https://github.com/chh-ay/sheetwrite/pull/399) [`b08cb80`](https://github.com/chh-ay/sheetwrite/commit/b08cb80b3d3a29e34336b2c9cf65f4b8fae74840) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines add Excel's information functions `ERROR.TYPE`, `INFO`, `ISEVEN`, `ISODD`, `ISNONTEXT`, `ISREF`, `SHEET` and `SHEETS` ([#278](https://github.com/chh-ay/sheetwrite/issues/278)). `SHEET` and `SHEETS` count every sheet in tab order, hidden sheets too, and recompute when a sheet is added, removed, renamed or moved.
  
  `INFO` returns the sheet count for `"numfile"` and `"Automatic"` for `"recalc"`. It returns `#N/A` for `"directory"`, `"origin"`, `"osversion"`, `"release"` and `"system"`, which describe the desktop program. `STOCKHISTORY` stays unsupported by design, with the other external data functions.

- [#774](https://github.com/chh-ay/sheetwrite/pull/774) [`5f46072`](https://github.com/chh-ay/sheetwrite/commit/5f46072df5a254ea92d046888d5cd44444008161) Thanks [@chh-ay](https://github.com/chh-ay)! - The grid's keys follow Excel's defaults.
  
  - **Active cell.** Extending a selection with Shift+Arrow, Shift-click or a drag keeps the cell it started from active; typing edits that cell. `getSelection()` reports it as `active` on a range, row, column or multi selection when it is not the first cell, and `setSelection` accepts it. The name box and formula bar show it.
  - **Enter and Tab** move the active cell (Shift reverses) instead of opening the editor or leaving the grid. Inside a selected range they move within it and keep it; typing there keeps the range, and Ctrl/Cmd+Enter writes the entry into every selected cell, shifting relative references.
  - **Editor modes.** Typing opens Enter mode, where arrow keys commit and move, or after an operator in a formula point at cells (Shift stretches the reference). F2 and double-click open Edit mode with the caret at the end; F2 switches modes. Shift+Enter commits and moves up. F4 cycles the reference at the caret through `A1`, `$A$1`, `A$1` and `$A1`. A picked reference stays replaceable by the next click until you type.
  - **End mode and Ctrl+End.** End then an arrow jumps like Ctrl+Arrow; Ctrl+End goes to the last used cell.
  - **Backspace** clears only the active cell and opens it; Escape restores it. Delete still clears the selection.
  - **New rebindable actions:** `bold` (Mod+B, Mod+2), `italic` (Mod+I, Mod+3), `underline` (Mod+U, Mod+4), `strikethrough` (Mod+5), `insertDate` (Mod+;) and `insertTime` (Mod+Shift+;). A context-menu item that already used one of these keys now conflicts; rebind or set the action to `null`.
  - **Row numbers** select rows on click, and a drag across row numbers or column letters extends the selection.

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

- [#794](https://github.com/chh-ay/sheetwrite/pull/794) [`591b0a7`](https://github.com/chh-ay/sheetwrite/commit/591b0a75626aad87d4e7b6447602883088d5e8e2) Thanks [@chh-ay](https://github.com/chh-ay)! - The sheet tab menu follows Excel's: Insert, Rename, Move or Copy…, Tab color, Hide and Remove.
  
  - **Insert** adds a sheet before the tab. `AddSheetInput.index` sets the position of a new sheet.
  - **Move or Copy…** opens a dialog that moves a sheet before another one, or copies it with "Create a copy". The new `grid.copySheet(id, { index?, name? })` makes the copy and returns its result, whose `sheet` is the copy's ID, as `addSheet` does: it is named like `Sales (2)`, references to the sheet itself refer to the copy, its tables get new names (`Sales` becomes `Sales2`) and its sheet-scoped names come along.
  - **Tab color** colors a tab with one of Excel's standard colors, or No Color. The new `grid.setSheetTabColor(id, color)`, `Sheet.tabColor` and `SheetSnapshot.tabColor` hold it, the `setSheetMeta` operation takes `tabColor`, and XLSX files read and write it.
  - Ctrl+PageDown and Ctrl+PageUp switch to the next and previous visible sheet, and so do Excel for the web's Ctrl+Alt+PageDown and Ctrl+Alt+PageUp, because browsers keep Ctrl+PageDown and Ctrl+PageUp for their own tabs. They are the new rebindable keyboard actions `nextSheet` and `previousSheet`. A host binding that already uses these keys now raises `shortcut-conflict`.

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

- [#887](https://github.com/chh-ay/sheetwrite/pull/887) [`98e297c`](https://github.com/chh-ay/sheetwrite/commit/98e297c10008b81ef8c475e30da0a4999e1ec2d2) Thanks [@chh-ay](https://github.com/chh-ay)! - While the fill handle is dragged, every new cell on screen shows the value it will get, as faint text, so the whole series shows before the release. Esc ends a fill-handle drag without filling, as in Excel.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The find bar has Excel's Find Options and Find All.
  
  - **⋯ Options** shows Within (Sheet, Workbook), Search (By Rows, By Columns), Look in (Formulas, Values, Notes), Match case and Match entire cell contents.
  - **≡ Find all** lists every match with its sheet, cell, value and formula, with a "12 cells found" count. Click a result, or use the arrow keys, to go to it.
  - On Windows and Linux, Alt and the letter of Excel's dialog reach each control (Alt+C Match case, Alt+I Find All, Alt+T Options, and so on).
  - `SearchOptions` takes `within: "workbook"`, which searches every visible sheet in tab order, `searchBy: "columns"`, and `lookIn: "notes"`. Find Next moves on to the next sheet with a match. Replace with `lookIn: "notes"` rewrites note text.
  - `grid.selectMatch(index)` makes one match of the current search the active match and shows it, as clicking a Find All result does.
  - `grid.getCellText(addr)` returns the text a cell shows, through its number format; Find All's Value column uses it.

- [#788](https://github.com/chh-ay/sheetwrite/pull/788) [`abbd833`](https://github.com/chh-ay/sheetwrite/commit/abbd833c1b778fd542e498183c9cae15a80b61f0) Thanks [@chh-ay](https://github.com/chh-ay)! - Find takes Excel's wildcards and looks in formulas by default, as Excel's Find does.
  
  - `*` matches any run of characters, `?` one character, and `~` makes the next `*`, `?` or `~` literal. A search for a literal `*` or `?` now needs `~*` or `~?`.
  - A formula cell is searched by its formula text unless the new `SearchOptions.lookIn` is `"values"`. `grid.search("A1")` finds `=A1*2`, and a search that used to match a formula's result needs `lookIn: "values"`.
  - Replace rewrites formula text when looking in formulas, and replaces what a wildcard pattern matches. A replacement that would leave a formula the engine cannot read leaves that cell unchanged.
  - `SheetwriteStore.searchCells` and `searchCellsFlat` take the same `lookIn` option, and the engine's `search` takes a sixth argument, `formulas`.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Format Cells previews the new format on the selected cells while it is open. As you change the number format, alignment, font, border or fill, the selection shows the result at once: negative numbers, zeros, `####` in a narrow column and borders show on every selected cell, where Excel shows only the dialog's one sample. The preview changes only what the grid draws; nothing reaches the document, the undo history or collaborators before OK, and Cancel or Escape puts the cells back as they were.

- [#850](https://github.com/chh-ay/sheetwrite/pull/850) [`8a0b26d`](https://github.com/chh-ay/sheetwrite/commit/8a0b26dbaede23d57ed1264036022eb1d71df099) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula AutoComplete lists defined names and tables with the functions, a table's columns after `Table1[`, and the values of arguments such as `TRUE - Approximate match` and `FALSE - Exact match` for VLOOKUP's last argument, as Excel does. The argument guide uses Excel's argument names, such as `SUMIF(range, criteria, [sum_range])`. `analyzeFormula` takes the names and tables to list as a new optional fourth argument, `FormulaCompletion.matches` now holds `FormulaCompletionItem`s (`kind`, `name`, `insert`, `description`, and `function` for a function), and `FormulaArgumentMetadata` has `choices`.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula help offers a fix for a live error while you type: "Add the missing )", "Remove the extra )", "Did you mean SUM?" for an unknown function, and "Did you mean SalesUnits?" for a misspelled defined name or table. A click or Tab applies it and the edit stays open.

- [#301](https://github.com/chh-ay/sheetwrite/pull/301) [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula help in the cell editor and the formula bar. Autocomplete lists the built-in functions of the active engine and the store's custom functions; an argument guide shows the signature of the function around the caret with the current argument in bold; syntax errors, unknown names and wrong argument counts are underlined while you type; and each reference gets a colour in the text and the same colour on its range in the grid. **Formulas › Formula Auditing › Explain Formula** opens a side panel that describes the formula in the focus cell from function metadata. The function list is an ARIA listbox, and the guide is a polite live region. Formula help loads on the first formula edit, and the panel on first use, so they add almost nothing to the grid's first download. Host editors can use the same analysis: `analyzeFormula(text, cursor, functions)` from `@sheetwrite/core/functions` returns the tokens, references, call at the cursor, completions and problems of a formula. The Formulas tab now always shows; Insert Function in it still needs custom functions.

- [#644](https://github.com/chh-ay/sheetwrite/pull/644) [`4c3de4c`](https://github.com/chh-ay/sheetwrite/commit/4c3de4c4d0b72742ea61d07465a7c1b24f23c316) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula help previews the result of a formula while you type. The engines add `previewFormula`, which evaluates a formula text in a cell without changing the store, and `@sheetwrite/core/functions` exports `previewFormula` for host editors. RAND, RANDBETWEEN and host functions are never run for a preview, and a preview that would read or build too much returns `cost-limit`. A range read is charged before its cells are scanned, so once a preview passes a limit no later range read scans any cells, even where `IFERROR` catches the refusal.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Fraction and Text number formats work as in Excel.
  
  - Fraction codes such as `# ?/?`, `# ??/??`, `# ???/???`, `# ?/4`, `# ??/16` and `# ??/100` show the closest fraction (or the fixed number of parts) in cells and in `TEXT()`: `5.25` with `# ?/?` shows `5 1/4`. They used to show a rounded whole number in cells and stray digits in `TEXT()`.
  - The Text format `@` shows a number as General would; a cell used to show nothing. What you type into a cell formatted as Text stays text exactly as typed, so `0123` keeps its zero and `=A1` is not a formula.
  - An entry typed into a cell keeps the cell's formatting, as in Excel, with Enter, Tab and Ctrl+Enter alike. It used to clear the cell's style, bold and number format included.
  - Format Cells has the Fraction and Text categories, and the Home number format list has Fraction and Text.
  - `parseCellInput` takes the cell's effective number format as an optional third argument, so a formula bar keeps Text cells' input as text too.

- [#1028](https://github.com/chh-ay/sheetwrite/pull/1028) [`3c46f4c`](https://github.com/chh-ay/sheetwrite/commit/3c46f4ca1a29c0b453c61c1d380cd76169ff57c1) Thanks [@chh-ay](https://github.com/chh-ay)! - The keyboard can always leave the grid. Tab and Shift+Tab still move between cells, as in Excel, and Excel's own way out now works:
  
  - F6 and Shift+F6 move to the next or previous part of the window. In the spreadsheet shell the parts are the ribbon or toolbar, the formula bar, the sheet, the sheet tabs and the status bar, in a cycle. A grid on its own moves the focus to the page's next or previous control.
  - Escape then Tab or Shift+Tab, when no cell is being edited, moves the focus to the page's next or previous control.
  - The grid's host gets an `aria-description` that names these keys once, when the focus enters the grid. A host that sets its own keeps it.
  - The Keyboard shortcuts panel says that F6 and Shift+F6 always move the focus, and refuses them as a command's keys.

- [#315](https://github.com/chh-ay/sheetwrite/pull/315) [`cc9a143`](https://github.com/chh-ay/sheetwrite/commit/cc9a1430bea2f7e1bfdf56f883612c4aacdad42b) Thanks [@chh-ay](https://github.com/chh-ay)! - **Behaviour change:** `grid.destroy()` stops the grid's running work, and nothing of a destroyed grid or shell runs later.
  
  - `grid.summarizeSelection()` rejects with an `AbortError` when the grid is destroyed while it runs, or when it is called on a destroyed grid. Before, it kept reading the freed store. Its pause timer is cleared when it is aborted.
  - A clipboard action that a newer action of the same kind replaces (a second paste while the first one reads the clipboard; a copy or cut while another one writes) resolves `"empty"` and does not change the grid. A cut that the grid's destroy interrupts keeps its source cells. The actions still never reject.
  - After destroy, no timer, animation frame, document or window listener, observer or download object URL of the grid, its ribbon or toolbar, find bar, side panel, auto-fit, export or action alerts stays: an export's object URL is revoked at once. An XLSX export that runs at destroy is aborted and downloads nothing.
  - A ribbon, toolbar, find bar or panel chunk that loads after destroy (or after the chrome is rebuilt) does nothing, also in `createSpreadsheetShell`.
  - An open field menu in the pivot panel stops listening on the document when the panel closes.
  - An abort is never shown as an error alert.
  
  **Upgrade checklist:** if you call `summarizeSelection()` and can destroy the grid while it runs, handle the `AbortError` rejection as you handle your own signal's abort.
  
  Ribbon and toolbar popups ignore a late resize event when they were placed after the resize. A later change to the viewport or the trigger position still closes them.

- [#865](https://github.com/chh-ay/sheetwrite/pull/865) [`f86c489`](https://github.com/chh-ay/sheetwrite/commit/f86c4894029f64a589357c9a9b6085f1083d7aba) Thanks [@chh-ay](https://github.com/chh-ay)! - `grid.sheetRowOf(viewRow)` and `grid.viewRowOf(sheetRow)` map between the view rows that selections, `scrollToCell` and selection events use and the sheet rows of A1 references and the row headers. The two differ while a filter, hidden rows or a view sort change which rows show. Both take constant time; `viewRowOf` returns `null` for a row the view hides.

- [#313](https://github.com/chh-ay/sheetwrite/pull/313) [`3c57cb9`](https://github.com/chh-ay/sheetwrite/commit/3c57cb9e038c94cd17c7fac9a7fff2d01344b03e) Thanks [@chh-ay](https://github.com/chh-ay)! - New `grid.trimMemory()` gives back the memory that an open grid can build again: decoded cell strings, rendered number text, compiled number formats, text measurement and unused overlay nodes, in the grid and in its worker renderer. Document data, undo history and the visible output do not change; the next frame builds only what it paints. Call it on a memory signal or when the page goes to the background. The number format caches are shared by all grids on the page, so a trim drops them for every grid. It does nothing after `destroy()`, and it does not shrink WebAssembly memory (use `releaseEngineMemory()` for that).
  
  The find bar code is now in its own chunk. The grid loads it and builds the find bar DOM when the find bar first opens, not when the grid is created. A grid that never opens the find bar does not download its code and has no `.sheetwrite-find` element. The first Ctrl+F, Ctrl+H or `grid.actions.find()` shows the bar after its chunk loads.
  
  Upgrade checklist:
  
  - If your code or tests look for `.sheetwrite-find` before the find bar opens, open it first with `grid.actions.find()` or Ctrl+F, then wait for the element to appear.
  - If your bundler setup lists the grid's lazy chunks (as for the ribbon and the panels), expect one more chunk for the find bar.

- [#365](https://github.com/chh-ay/sheetwrite/pull/365) [`3890a7a`](https://github.com/chh-ay/sheetwrite/commit/3890a7abdc2ce352119ef73cd62e4782206b438a) Thanks [@chh-ay](https://github.com/chh-ay)! - Add an opt-in version history archive ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). Import `HistoryArchive` and `MemoryHistoryStorage` from the new `@sheetwrite/core/history` entrypoint, and `IndexedDbHistoryStorage` from `@sheetwrite/core/browser/history`. The archive stores a checkpoint plus the committed document operations since it. Checkpoints are content-addressed chunks: one record per sheet, fixed 16-row by 4-column cell pages and separate metadata blocks, so a new checkpoint stores only the chunks that changed. Named and automatic versions record their author and time. `readVersion` rebuilds a version in a disposable store. Hosts keep history in their own backend through the four-method `HistoryStorageAdapter` (`put`, `get`, `list`, `prune`), with atomic publication, reference-counted pruning and byte ceilings. A grid that does not import these entrypoints loads no history code, timers, storage requests or arrays. New `SheetwriteErrorCode` values: `invalid-history`, `capacity` and `integrity`; new `SheetwriteErrorOperation` value: `history`.

- [#386](https://github.com/chh-ay/sheetwrite/pull/386) [`c0b2ac0`](https://github.com/chh-ay/sheetwrite/commit/c0b2ac0ee506b2ff4e57ae6012da0cbaaf6ceb1c) Thanks [@chh-ay](https://github.com/chh-ay)! - Version history records who made each change ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `SyncCoordinatorOptions.authorId` puts the editor's authenticated ID on each new `PendingCommit` (`authorId`), and `IndexedDbPendingCommitStorage` stores it, so a commit restored after a reload keeps its author. `VersionedOperation` gains `authorId` and `committedAt`; `SyncCoordinator` validates them, keeps them on `remote-applied` events and rejects an atomic batch whose members name different authors. `MemoryPersistenceAdapter.recordHistory(documentId, journal)` records each commit in a `CommitJournal` as the last step of the commit: when the journal rejects, the commit is not applied, published or acknowledged. `HistoryArchive` implements `CommitJournal`, and `HistoryArchive.record` takes the root type `CommittedTransaction`.

- [#405](https://github.com/chh-ay/sheetwrite/pull/405) [`4727a3d`](https://github.com/chh-ay/sheetwrite/commit/4727a3de909c0645d11a0dc74196fecfea68008c) Thanks [@chh-ay](https://github.com/chh-ay)! - Compare two history versions ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `HistoryArchive.diffVersions({ from, to, cursor, maxEntries, signal, kernel })` from `@sheetwrite/core/history` returns one page of at most 1,000 changes: changed cells as typed columns (`HistoryDiffCells`: sheet, row, column, earlier position, `HistoryDiffFlag` bits and last writer), the before and after of each cell (`HistoryDiffDetail`), sheets added, removed or changed outside their cells (`HistoryDiffSheet`), changed workbook fields and a `cursor` for the next page. Sources and styles are compared by content, not calculated values. Rows and columns are aligned through the structural operations of the log, and each change names the last person whose write reached the cell. The comparison runs in a separate history-only WASM kernel, `@sheetwrite/wasm/history` (16.6 KB gzip, no formula engine), that loads on the first diff; the default and full engines do not change. `HistoryVersion.checkpoints` and `HistoryHead.checkpoints` list the checkpoints made since the previous marker, so the log between two retained versions stays readable.

- [#421](https://github.com/chh-ay/sheetwrite/pull/421) [`3310e7e`](https://github.com/chh-ay/sheetwrite/commit/3310e7eeb14684e1386903d1462b3eb977b84106) Thanks [@chh-ay](https://github.com/chh-ay)! - Version history panel ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `createHistoryCommands({ archive, authorId, sync, authorName })` from `@sheetwrite/core/history` returns the `GridConfig.history` capability that shows Review › Version History and Save Version in the full ribbon, the compact ribbon and the toolbar (`GridActions.versionHistory`, `GridActions.saveVersion`, and command states of the same names). The panel loads as a separate chunk on the first command. It saves named versions after pending changes are committed, lists versions with authors, compares a version with a later one or with the current committed document page by page, opens a read-only preview, and restores the workbook, one sheet or a range after a confirmation. `HistoryArchive.diffVersions` accepts `to: "head"`, and a reader lease can name `"head"`.

- [#1093](https://github.com/chh-ay/sheetwrite/pull/1093) [`5278c65`](https://github.com/chh-ay/sheetwrite/commit/5278c6506b94c8b7ae4c0d5a276f112936a40821) Thanks [@chh-ay](https://github.com/chh-ay)! - `HistoryArchive` keeps the last version that `readVersion` or `restoreVersion` rebuilt, so the version history panel's select, compare and restore rebuild the selected version once instead of three times. A moved head is never reused, also when another tab moved it. `HistoryArchive.releaseMemory()` frees the kept version; the panel calls it when it closes and when its grid trims memory, through the new optional `GridPanel.trimMemory()` that `Grid.trimMemory()` calls on the open panel. `HistoryPanelArchive` gets the matching optional `releaseMemory()`.

- [#1126](https://github.com/chh-ay/sheetwrite/pull/1126) [`db81bee`](https://github.com/chh-ay/sheetwrite/commit/db81beeefd3bcac3f542cd86773bb5e2a20e3ec8) Thanks [@chh-ay](https://github.com/chh-ay)! - `HistoryArchive.restoreVersion` compares the live cells with the version's and rewrites only the rows that differ, so restoring a version after a few edits is faster and makes a smaller undo step and synchronized transaction. When a sheet changes shape, the whole scope is rewritten as before. `HistoryRestoreOptions` gains `kernel`, where the history kernel's WASM comes from, as `HistoryDiffRequest.kernel`.

- [#390](https://github.com/chh-ay/sheetwrite/pull/390) [`19fd4b5`](https://github.com/chh-ay/sheetwrite/commit/19fd4b541cbdc6343513c21f8c16b05e0efdea10) Thanks [@chh-ay](https://github.com/chh-ay)! - Restore a history version on a live grid ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `HistoryArchive.restoreVersion(grid, versionId, scope, { sync, signal })` from `@sheetwrite/core/history` restores the whole workbook, one sheet or one range (`HistoryRestoreScope`) as one undoable change: one undo step, one `change` event with `commitReason: "restore"` and, with `sync`, one synchronized transaction, sent as an atomic batch when it needs more than one server version. A sheet keeps its ID and is resized in place at its end; a reference into removed rows or columns becomes `#REF!` and comes back on undo. Retained OOXML parts (`xlsxSource`) are not restored, as with undo. A shared document must be idle to restore; the pending commit carries `PendingCommit.restore` (`RestoreProvenance`), is never rebased, and on conflict `SyncCoordinator.recoverConflict()` returns `reload-required` with reason `restore`. A range that cuts a merged cell or hyperlink rejects with the new `HistoryError` code `invalid-scope`.
  
  Removed: `RevisionCoordinator`, `RevisionAdapter`, `RevisionCoordinatorOptions`, `RevisionCoordinatorEvent`, `RevisionSummary`, `RevisionRestoreRequest` and `RevisionRestoreResponse`; use `HistoryArchive.listVersions`, `HistoryArchive.readVersion` and `HistoryArchive.restoreVersion` with a `HistoryStorageAdapter` instead.
  
  Removed: the `revision-failed` error code and the `revision` error operation; history failures use `HistoryError` codes instead.

- [#378](https://github.com/chh-ay/sheetwrite/pull/378) [`01b8d72`](https://github.com/chh-ay/sheetwrite/commit/01b8d729b92351e46e3f343aa08ca33604ef3284) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort cells in place, as Excel does. `store.sortRange(range, keys, { hasHeader })` moves the rows of a range in one undoable, synced transaction with the new `permuteRows` document operation and the new `"sort"` commit reason.
  
  - Values, formulas, cell styles, notes and one-row hyperlinks move with their row. Row heights, hidden rows, conditional formats, validation rules and protected ranges keep their addresses.
  - A formula in a moved row is adjusted for the move of its own row: relative row references without a sheet name move with the row; absolute rows and references with a sheet name stay. Formulas elsewhere keep their references and read the new values.
  - Hidden and filtered-out rows keep their place. Identically sized merged cells sort as whole records; other merged layouts reject the sort. A spill range that the sort would move only in part rejects the sort. A sort in a table must cover its whole body.
  - The operation carries the row order (one `u32` per row, base64), so every collaborator applies the same order. A concurrent edit inside the sorted range is a rebase conflict. Undo applies the inverse order and restores formulas whose adjusted references left the sheet.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Insert and Delete (Ctrl++ and Ctrl+-) can shift cells, as in Excel.
  
  - The dialog's Shift cells right and Shift cells down (left and up on delete) work, and it starts on them as Excel does: down (up) for a wide range, right (left) for a tall one.
  - The cells after the range in its columns (rows) move with their formats, notes, links, merged cells, validation and conditional-format rules. Formulas, defined names and charts that refer to them follow by Excel's rule for inserted and deleted cells: a range in those columns grows or shrinks, and a reference to a deleted cell becomes `#REF!`. One undo puts everything back.
  - An insert that would push cells that are not blank off the sheet does nothing and says so, and so does a shift that a table, PivotTable or merged cell is in the way of.
  - `grid.actions.insertCells` and `deleteCells` take `shift: "right" | "down"` to shift without the dialog. The `moveCells` operation takes `shift: true` for this; the engine's `moveCells`, `moveCellsLosses` and `moveFormulaCells` take a last `shift` argument.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - **Behaviour change:** XLSX and CSV/TSV aborts reject with `signal.reason`, not with a `SheetwriteError` that has `code: "aborted"`.
  
  - `fromXlsxWorkbook`, `fromXlsxWorkbookFile`, `fromXlsxTable`, `toXlsxWorkbook`, `toXlsxTable`, their streams, `buildXlsxModel`, and the CSV/TSV parse and export functions reject, throw or error with `signal.reason` after the signal fires. An abort is not a failure, so it is never a `SheetwriteError`.
  - `parseCsv`, `parseTsv` and `fromCsv` now check `signal` too: before the scan and once per 1,024 records.
  - The XLSX codec checks the signal once per ZIP entry, worksheet and chunk of cells, also while it builds the snapshot. An aborted import keeps no partial snapshot.
  
  **Upgrade checklist:** if your code tells an aborted XLSX or CSV/TSV call apart with `error.code === "aborted"`, check `signal.aborted` (or `error === signal.reason`) instead. Persistence and IndexedDB storage still use `code: "aborted"`.
  
  Changed: aborted XLSX and CSV/TSV calls reject with `signal.reason`, not a `SheetwriteError` with code `aborted`; check `signal.aborted` instead.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Users can change the grid's keys in a Keyboard shortcuts panel ([#802](https://github.com/chh-ay/sheetwrite/issues/802)). Excel's keys stay the defaults.
  
  - `config.keyboardSettings: true` turns the panel on. It opens from File › Options › Keyboard Shortcuts in the ribbon, from a gear in the compact ribbon, and from `grid.openKeyboardSettings()`. Its code loads on first use.
  - The user searches commands by name or keys, or presses keys to find the command that owns them. Each row shows the keys beside Excel's default.
  - The user records new keys, swaps or replaces keys another command owns, and resets one command or all of them. Undo reverts the last change, and Export and Import move the bindings as JSON. Each change applies at once.
  - Keys that type, move in the sheet, or never reach the page are refused with the reason. Examples: Ctrl+W in Chrome, and ⌘⇧3 on a Mac.
  - The grid emits `key-bindings-change` with the bindings that differ from Excel's. The host stores them and passes them back through `config.keyboard.bindings`. The adapters forward the event as `onKeyBindingsChange` in React and Svelte, and as `@key-bindings-change` in Vue.
  - `keyboardSettings: { locked: [...] }` shows commands read-only. New types: `KeyBindings` and `KeyboardSettingsOptions`.

- [#910](https://github.com/chh-ay/sheetwrite/pull/910) [`681b811`](https://github.com/chh-ay/sheetwrite/commit/681b81171277262a28ecca611fe0e0e9e3528036) Thanks [@chh-ay](https://github.com/chh-ay)! - Find with Look in: Notes and the Replace all preview match Excel's wildcards in time linear in the text. They used a regular expression that backtracks, so crafted cell or note text could make `a*b` take seconds per cell. Text past a step budget, far beyond Excel's cell length, does not match.
  
  - The find bar plans the Replace all preview once typing pauses, not on every key.
  - `grid.previewReplaceAll(replacement, limit?)` returns a `ReplacePreview`: the first `limit` changes (1,000 by default), the `total` Replace all makes and how many of them rewrite a `formulas`. The preview lists the first 1,000 and says how many there are in all.

- [#719](https://github.com/chh-ay/sheetwrite/pull/719) [`3f52cfc`](https://github.com/chh-ay/sheetwrite/commit/3f52cfc5a3eea8ab2d9bee8a9e9d27f09997b25c) Thanks [@chh-ay](https://github.com/chh-ay)! - A dense sheet that would pass the workbook's dense-cell limit now continues in local pages instead of refusing the edit: the engine moves its cells into pages that are never evicted and always loaded, and the sheet still behaves as a dense sheet. A snapshot that places sheets past `maxDenseCells` loads them the same way. Local sheets share a new workbook-wide limit, `maxLocalPagedCells` (20,000,000 cells by default); an insert past it is rejected with a `local-paged-cells` resource-limit issue, which replaces `dense-cells`. The store gives `maxDenseCells` and `maxLocalPagedCells` to the engine, capped at its ceilings of 5,000,000 and 20,000,000, so core and engine place and refuse sheets the same way. With the default limits an untrusted dense-storage snapshot can now make the engine hold up to 25,000,000 cells instead of 5,000,000; `maxLocalPagedCells: 0` keeps the old ceiling. Releasing engine memory now also returns paged pages that evictions, row deletes or a shrinking local sheet left free.

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

- [#870](https://github.com/chh-ay/sheetwrite/pull/870) [`332deb6`](https://github.com/chh-ay/sheetwrite/commit/332deb6ae741a360c5b2446f5ec112a6d9f38a78) Thanks [@chh-ay](https://github.com/chh-ay)! - The merge warning names the values a merge would discard and their cells. After Excel's text it lists them in reading order, as the cells show them: "These values will be discarded: C2: 'Avery', B3: 'South', C3: 12." It lists the first five and counts the rest ("and 7 more"). Excel's warning does not say which values or how many, so a user could lose values in cells out of view. The buttons and keys are unchanged: Enter is OK, Escape is Cancel, and OK keeps the upper-left value.

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

- [#608](https://github.com/chh-ay/sheetwrite/pull/608) [`664609d`](https://github.com/chh-ay/sheetwrite/commit/664609d6e9cc6f139af51d65d14819861c820987) Thanks [@chh-ay](https://github.com/chh-ay)! - Add Alt+Enter line breaks and growing multi-line fields to the cell editor and formula bar, with formula help across lines.

- [#935](https://github.com/chh-ay/sheetwrite/pull/935) [`b360e7d`](https://github.com/chh-ay/sheetwrite/commit/b360e7d7ed997aba40c9879ddc063c91a2cd40cd) Thanks [@chh-ay](https://github.com/chh-ay)! - The Name Box goes to a cell on a row a filter or Hide Rows hides, as Excel's does. Before, it refused the cell. The cell becomes the active cell without a selection on screen. The formula bar shows it, and typing or F2 edits it there. Copy and Cut take it, and Delete clears it. A grid without the shell's formula bar does not edit it from the keyboard. Up, Down, Enter and Shift+Enter go to the nearest row that shows; Left, Right and Tab stay on its row. Once a filter change shows the row, the cell is selected.
  
  New `Grid` methods: `goToCell(addr)` makes a sheet cell the active cell, shown or hidden. `getActiveSheetCell()` returns the active cell in sheet rows. `getActiveCellInput()` returns its editable snapshot. While a hidden cell is active, the `selection` event reports `selection: null` and names the cell in `sheetFocus`.

- [#866](https://github.com/chh-ay/sheetwrite/pull/866) [`fa0be6d`](https://github.com/chh-ay/sheetwrite/commit/fa0be6df09faaabb22493cd0515822afd85dba03) Thanks [@chh-ay](https://github.com/chh-ay)! - New sheets follow Excel.
  
  - The tab bar's add button (+) adds the sheet after the active one, and its name is `Sheet` and the next free number, with no space: `Sheet4` beside three sheets. The sheet menu's Insert and Insert › PivotTable on a new sheet use the same name.
  - A sheet from the add button, Insert or Shift+F11 is an empty sheet with columns A to Z and 1,000 rows, as a new pivot sheet already was, instead of one column and 100 rows.
  - A sheet added or loaded after the grid was created fills the grid's width with empty columns, as the first sheets do. Before, `addSheet` without `columns` showed one column and nothing beside it.
  - Shift+F11 inserts an empty sheet before the active one and makes it active, as in Excel. It is the new rebindable keyboard action `insertSheet`. A host binding that already uses Shift+F11 now raises `shortcut-conflict`.

- [#287](https://github.com/chh-ay/sheetwrite/pull/287) [`dd153bb`](https://github.com/chh-ay/sheetwrite/commit/dd153bb24808b011b90c48cf8d3061a743b7d0e6) Thanks [@chh-ay](https://github.com/chh-ay)! - The toolbar, the full ribbon and a new compact ribbon render one command model. They show the same commands, glyphs, enabled and pressed state, accessible names and keyboard behavior.
  
  - The compact ribbon shows a tab's commands on one row. Set `config.ribbon` to `{ mode: "compact" }`, or to `{ mode: "auto", compactWidth }` to use compact below a width (default 768 px). The **Compact** button beside the tab list switches layout.
  - The toolbar shows the ribbon's commands on one row. Commands that do not fit move into a **More commands** popup. Font Color and Fill Color are palettes, and Borders, Clear and Merge & Center are menus, as in the ribbon.
  - The `GridConfig` command flags (`bold`, `sort`, `export` and the others, typed as `CommandFlags`) now choose commands in the ribbon too. `export: true` adds an Export group with Export CSV and Export XLSX.
  - Every command element has a `data-command` attribute. The old `.sheetwrite-tb-*` classes are gone.
  - The built-in toolbar loads with the ribbon's chunk, so it appears after the grid mounts.
  - The shell toolbar also loads lazily, with its row height reserved. Custom Border, Merge, Unmerge and Clear Formats items keep their one-click behavior.
  
  Removed: the `.sheetwrite-tb-*` toolbar classes; use the `data-command` attribute instead.

- [#885](https://github.com/chh-ay/sheetwrite/pull/885) [`6fd876c`](https://github.com/chh-ay/sheetwrite/commit/6fd876c8fe621decce3bc641e9f04dbfc85be3f1) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste Special, as in Excel: Ctrl+Alt+V (Ctrl+Cmd+V on a Mac), Home › Paste › Paste Special… and the context menu open its dialog, with every Paste choice (All, Formulas, Values, Formats, Comments and Notes, Validation, All using Source theme, All except borders, Column widths, Formulas and number formats, Values and number formats, All merging conditional formats), Operation (None, Add, Subtract, Multiply, Divide), Skip blanks, Transpose and Paste Link, each with its letter key. Home › Paste and the context menu's Paste Options row offer Values, Formulas, Formatting, Transpose and Paste Link in one click. New `grid.actions.pasteSpecial(options)`, keyboard action `pasteSpecial`, context-menu actions `pasteValues`, `pasteFormulas`, `pasteFormatting`, `pasteTranspose`, `pasteLink` and `pasteSpecial`, `ContextMenuItem.inline` for a row of icon buttons, and six glyphs. A paste of cells copied in the same grid now also brings their notes and conditional formats, as Excel's Paste does.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - A paste works as Excel's does with data validation: the pasted values land unchecked, and the cells the paste covers take the copied cells' rules in place of their own, as one undoable step. Before, a paste kept the target's rules and silently refused each value a rule rejected. Paste Values and a paste from outside the grid keep the target's rules. The store no longer checks validation for a commit with the `"paste"` reason.
  
  New `GridConfig.paste.keepValidation`: a paste keeps the target cells' rules instead. A value a `reject` rule refuses is not pasted, a value a `warn` rule refuses lands, and the status bar names both kinds of cell, such as "3 cells refused: B4, B7, B9.", with a Select them button.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Alt+Down on a cell opens Excel's Pick From Drop-down List: the distinct text entries above and below the cell in its column, sorted, in a list under the cell. Arrow keys and typing move in it, Enter or a click puts the entry in the cell, and Escape closes it. The cell's context menu has **Pick from drop-down list…** (the new `pickFromList` action), and `grid.actions.pickFromList()` opens it from code.

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

- [#1145](https://github.com/chh-ay/sheetwrite/pull/1145) [`696d772`](https://github.com/chh-ay/sheetwrite/commit/696d772d20bea746a53798fe140deac2fefe3f6b) Thanks [@chh-ay](https://github.com/chh-ay)! - `@sheetwrite/core/testing` exports the `ShownSuggestion` type: what `shownSuggestion()` returns and `GhostOnScreen.shown` holds, the suggestion's text and the function list entry it starts with. It used to stay unexported because its API page would have shared an address with the `shownSuggestion` page.

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

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The status bar names Excel's cell mode at its start: Ready, Enter, Edit, or Point while an arrow key or a click has just picked a reference for a formula. Hosts read the mode with the new `grid.getCellMode()` and hear changes with the new `cell-mode` event; the `CellMode` type lists the modes.

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

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Undo and redo show what they changed. The changed cells flash for a moment, and the spreadsheet shell's status bar names the step and its cells, such as "Undo: Paste in B2:D9" or "Redo: Insert Rows", until the selection changes. Steps are named as in Excel's undo list: Typing, Paste, Clear, Auto Fill, Replace, Sort, Format Cells, Insert Rows and so on. Excel changes the cells silently, so a change spread over many cells, or one out of view, was hard to check. The new `history-step` grid event, `{ direction, step, range }`, reports each step for a status bar of your own.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - A typed value that a data validation rule rejects now shows Excel's error alert instead of disappearing without a word. A Stop alert offers Retry and Cancel, a Warning alert Yes, No and Cancel, and an Information alert OK and Cancel, as in Excel. Retry and No return to the entry with its text selected; Yes and OK keep the value; Cancel drops it. The alert shows the rule's title and message, or Excel's default text. A formula is checked by its result. A rule whose alert is off (`policy: "allow"`) stores the value without a word.
  
  `DataValidationRule` gains Excel's Error Alert and Input Message fields: `errorStyle` (`"stop"`, `"warning"` or `"information"`), `errorTitle`, `showInputMessage`, `inputTitle` and `inputMessage`. `helpText` is the error message. The input message shows beside a selected cell of the rule, as in Excel, and screen readers hear it as the cell's description.
  
  XLSX import and export keep every one of these fields. Before, a file's input message and error message were reduced to one text, and titles and the Information style were lost.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - A selected cell with a list validation rule shows a dropdown arrow just right of it, as in Excel; clicking the arrow opens the list, and clicking it again closes it. Alt+Down still opens the list.
  
  Typing in a list cell opens the list with the typed text in a box over the cell, and the list keeps only the items that contain the text, ignoring case, as Excel's AutoComplete for dropdown lists does. Typing while the list is open filters it the same way. Down and Up highlight an item; Enter or Tab stores the highlighted item, or else the item the text names, or else the text as typed, which the rule then checks. A formula typed with `=` still starts in the cell editor.
  
  F2 and a double-click on a list cell now edit its text, as in Excel, instead of opening the list.

- [#498](https://github.com/chh-ay/sheetwrite/pull/498) [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557) Thanks [@chh-ay](https://github.com/chh-ay)! - A chart over a worksheet pivot (`ChartDefinition.pivot`) plots the pivot's leaf items, as an Excel PivotChart does. Before, it showed only on dashboards. The categories are the leaf row items, with the outer items joined into each label (`East / Retail`), and each value field, for each column item, is one series. Subtotals and grand totals are never points, in compact and tabular layout. The chart follows the pivot's fields, filters and source edits, `pivotValues` picks the values it plots, and it keeps no values of its own.
  
  - The full engine computes a copy of the pivot for its charts, without totals and without cells: core anchors the copy right of the last column, and a pivot anchored right of the last column of its sheet places no output.
  - The code that reads charts over pivots loads with the first such chart. A change event names the charts when it has loaded; that event has no `epoch`.
  - With the active cell in a worksheet pivot, Insert › Charts › PivotChart adds a chart over that pivot to the right of its output.
  - XLSX export writes the chart with the values it plots, and import reads it back as a chart over the pivot.

- [#462](https://github.com/chh-ay/sheetwrite/pull/462) [`50eb898`](https://github.com/chh-ay/sheetwrite/commit/50eb89857ce7791003eb8a7e200682396ce7fd83) Thanks [@chh-ay](https://github.com/chh-ay)! - Workbooks keep the saved values of linked workbooks, and XLSX files keep their external links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). A snapshot holds them in `workbook.externalLinks`: for each linked workbook, its file name (`book`), its location (`target`) and the saved cells of its sheets (`ExternalLink`, `ExternalLinkSheet`, `ExternalLinkCell`, `ExternalLinkValue`). The store gives them to the engine before formulas load, so `[Budget.xlsx]Annual!C10` shows the saved value in both engines. `validateWorkbookSnapshot` checks the shape of the links only (unique book names, targets, named sheets with cell arrays). The store checks each saved cell when it loads the snapshot, and an invalid cell fails the load with `invalid-snapshot`.
  
  XLSX import reads Excel's external link parts. Formulas that read a link, such as `'[1]Annual Plan'!C10` in the file, stay live as `'[Budget 2024.xlsx]Annual Plan'!C10`; before, they were kept as text. XLSX export writes the `[n]` form back. An unchanged link part is written byte for byte, a changed link is written from its saved values, and a workbook that a formula names without a link gets a link with no values. Formulas that name a defined name of another workbook, and DDE and OLE links, are still kept as text or dropped with a warning, as before.

### Patch Changes

- [#920](https://github.com/chh-ay/sheetwrite/pull/920) [`2578c37`](https://github.com/chh-ay/sheetwrite/commit/2578c373114eaa9e73096f24b02015fd46a7fb02) Thanks [@chh-ay](https://github.com/chh-ay)! - A click on + in the sheet tabs gives the new sheet the keys, as a click on a tab does, so typing goes into its A1, as in Excel. Before, the focus went to the tab that last had it, often another sheet's, and Enter then opened that sheet. From the keyboard, + leaves the focus on the new sheet's tab.

- [#732](https://github.com/chh-ay/sheetwrite/pull/732) [`24483e6`](https://github.com/chh-ay/sheetwrite/commit/24483e652db755884adff40f14614d3264d9eeea) Thanks [@chh-ay](https://github.com/chh-ay)! - Alt+Down on a cell with a list validation rule opens its list, as in Excel and as on a combobox. Before, only Enter, F2 and a double-click opened it. On other cells Alt+Down still moves down one row.

- [#907](https://github.com/chh-ay/sheetwrite/pull/907) [`53785b0`](https://github.com/chh-ay/sheetwrite/commit/53785b0c4272d8954aea09470302d9aeba2537e9) Thanks [@chh-ay](https://github.com/chh-ay)! - On a sheet without notes or validation rules, scrolling and the arrow keys no longer build a screen-reader description for each visible cell.

- [#709](https://github.com/chh-ay/sheetwrite/pull/709) [`72dd2d1`](https://github.com/chh-ay/sheetwrite/commit/72dd2d1f7f01b825775fdf7b818d32641b4e025a) Thanks [@chh-ay](https://github.com/chh-ay)! - Automatic text on an explicit cell or header fill contrasts with that fill: dark on light fills and light on dark fills, in light and dark themes. Before, it always took the theme's foreground, so a light fill in a dark theme showed near-white text.

- [#902](https://github.com/chh-ay/sheetwrite/pull/902) [`38708e5`](https://github.com/chh-ay/sheetwrite/commit/38708e5b0603ebb12d9dab6d5e278e5e4e442878) Thanks [@chh-ay](https://github.com/chh-ay)! - AutoComplete reads the column's entries at the first typed character of an edit. Pasting into the cell editor or deleting text before typing lists no entries and reads nothing, so committing such an edit in a long column stays as fast as any other.

- [#874](https://github.com/chh-ay/sheetwrite/pull/874) [`71a0210`](https://github.com/chh-ay/sheetwrite/commit/71a0210adfec94be382bd9a7ade622b0221e78af) Thanks [@chh-ay](https://github.com/chh-ay)! - The fill handle continues Excel's other built-in series. Quarters wrap after 4 (`Qtr3` fills `Qtr4`, `Qtr1`, `Qtr2`; also `Q3`, `Quarter 3` and `3rd Qtr`). Text that starts with an ordinal counts up (`1st Period` fills `2nd Period`, `3rd Period`). One time steps by an hour, and dates on the same day of the month (or each on the last day of its month) step by months, as `Jan-99, Apr-99` fills `Jul-99, Oct-99`. In a mixed source, each text with a number counts up once per repeat (`text1, textA` fills `text2, textA, text3`).

- [#846](https://github.com/chh-ay/sheetwrite/pull/846) [`86c368b`](https://github.com/chh-ay/sheetwrite/commit/86c368be8bea1e3ba9624a1f28b12db849dd9bd9) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter search has Excel's "Add current selection to filter". Under "(Select All Search Results)", the check box makes OK add the ticked search results to the values the column's filter keeps already, so a filter can be built from several searches. Each new search ticks all of its results, as in Excel.

- [#962](https://github.com/chh-ay/sheetwrite/pull/962) [`9c2cfab`](https://github.com/chh-ay/sheetwrite/commit/9c2cfab1f8f848b311a8faea9ddd5e252c47d626) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter list of a column that is mostly dates groups only the numbers that show as dates by year, month and day; other numbers list as they show (`15%`, `$4.50`, `7`), as in Excel. Before, they showed under the years 1899 and 1900. After **Show them** in a cut notice, the grid keeps the keyboard, so Ctrl+Z undoes it.

- [#855](https://github.com/chh-ay/sheetwrite/pull/855) [`1f2e4ea`](https://github.com/chh-ay/sheetwrite/commit/1f2e4ea0c17f03a9cc9840990590c97c98b2813e) Thanks [@chh-ay](https://github.com/chh-ay)! - After an AutoFilter filters, the spreadsheet shell's status bar says how many rows it keeps, "12 of 48 records found", as Excel's does, until the next edit. While a filter is on, the row numbers of the filtered list are blue (the theme's `selectionBorder`), as in Excel.

- [#694](https://github.com/chh-ay/sheetwrite/pull/694) [`8402ac6`](https://github.com/chh-ay/sheetwrite/commit/8402ac60786091b9ae230a84d7d62f8fa1fc9a68) Thanks [@chh-ay](https://github.com/chh-ay)! - Writing a block with many text cells packs the text for the engine with one UTF-8 encode per 65,536 strings instead of one per cell, which shortens large pastes, imports and received restores of text.

- [#1173](https://github.com/chh-ay/sheetwrite/pull/1173) [`6d5ecdd`](https://github.com/chh-ay/sheetwrite/commit/6d5ecdd23fc1b75a723573c63d30d1c4c7e7b43d) Thanks [@chh-ay](https://github.com/chh-ay)! - Importing an XLSX workbook is about 9% faster: checking the imported snapshot reads each cell's fields directly.

- [#1174](https://github.com/chh-ay/sheetwrite/pull/1174) [`0e1308c`](https://github.com/chh-ay/sheetwrite/commit/0e1308c16dfeca8a24c73bf49ce101bdf3dcfb9f) Thanks [@chh-ay](https://github.com/chh-ay)! - Importing an XLSX workbook is faster: measuring the imported snapshot no longer keeps a set of the objects above each value.

- [#795](https://github.com/chh-ay/sheetwrite/pull/795) [`650c52b`](https://github.com/chh-ay/sheetwrite/commit/650c52b566377885f836d809ce12705ee0910dea) Thanks [@chh-ay](https://github.com/chh-ay)! - Typing a text entry completes it from the column, as Excel's AutoComplete does. When exactly one distinct text entry in the filled cells directly above and below (up to the first empty cell, and at most 100,000 rows each way) begins with the typed text, ignoring letter case, the editor shows the rest of it selected. Enter or Tab stores the entry in its own letter case; Backspace or Delete removes the added text. Formulas, numbers, dates and logical values are never completed, and IME composition completes only once it ends. The engine reads the column's distinct values once per edit, on the first typed key, and the code loads with the first edit. `config: { autoComplete: false }` turns it off, as Excel's "Enable AutoComplete for cell values" does.

- [#639](https://github.com/chh-ay/sheetwrite/pull/639) [`70865bb`](https://github.com/chh-ay/sheetwrite/commit/70865bb498b9533c68ae8bec2f4fe090ee648ac7) Thanks [@chh-ay](https://github.com/chh-ay)! - Chart tracking no longer refreshes every formula-backed chart after unrelated value edits. While a chart tracker is attached, both engines report bounded rectangles of recomputed formulas and changed spill and pivot cells, and core names only charts whose sources intersect them. Overflow and custom stores keep the conservative refresh.

- [#629](https://github.com/chh-ay/sheetwrite/pull/629) [`fbe3a80`](https://github.com/chh-ay/sheetwrite/commit/fbe3a80f511e792cc2d829a8eb776f5da5a7f479) Thanks [@chh-ay](https://github.com/chh-ay)! - Resolving a chart and tracking which charts a commit changes cost less. `resolveChartView` looks sheets up in the store's sheet index instead of building a map of every sheet for each chart, and `ChartView.chart` is now the store's own definition instead of a deep copy, typed with the new `ReadonlyChartDefinition` (read-only all the way down), so TypeScript rejects a write into it. Development builds (`NODE_ENV=development`) freeze it, so a write from JavaScript throws. To edit a chart, copy the definition (for example with `structuredClone`) and commit it with `setChart`. Code that passed `view.chart` where a mutable `ChartDefinition` is expected needs that copy. The change tracker marks each chart once per commit in one array instead of building per-sheet sets.

- [#1072](https://github.com/chh-ay/sheetwrite/pull/1072) [`9ac0a25`](https://github.com/chh-ay/sheetwrite/commit/9ac0a25d35799c30e1fee68c8af645c4285c58a8) Thanks [@chh-ay](https://github.com/chh-ay)! - A chart whose series share one category range reads it once per redraw instead of once per series.

- [#733](https://github.com/chh-ay/sheetwrite/pull/733) [`8114bf1`](https://github.com/chh-ay/sheetwrite/commit/8114bf167400fdc01e586d99cbccb13e5becdd6b) Thanks [@chh-ay](https://github.com/chh-ay)! - Charts and PivotCharts over the cells take their background, text, line and font from the grid's theme, so a `theme` option or `setTheme` reaches them as it does the cells. Before, they kept the stylesheet's colours, such as the dark theme's `#0b0b0c`, on a grid of any other background.

- [#1178](https://github.com/chh-ay/sheetwrite/pull/1178) [`904dfbf`](https://github.com/chh-ay/sheetwrite/commit/904dfbfd8bc79b78e620893e8cee898f4221d6d2) Thanks [@chh-ay](https://github.com/chh-ay)! - Loading columnar data with many numbers is faster: a `Float64Array` column is copied in one call, and a number cell skips the text parsing. Loading the data bench's 100,000 rows takes about 14% less time.

- [#1046](https://github.com/chh-ay/sheetwrite/pull/1046) [`9d2602e`](https://github.com/chh-ay/sheetwrite/commit/9d2602e9fc2b05a5ae2bc3c0af24eed8a955c188) Thanks [@chh-ay](https://github.com/chh-ay)! - The context menu closes when the user scrolls: a mouse wheel, a touch drag, Page Up or Page Down. It stays open through the page's own scrolls. Before, it closed on any scroll. On a slow machine, a right-click on a grid that had just taken the focus could open the menu and close it at once, because the focus's scroll into view arrived after the menu opened.

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

- [#1334](https://github.com/chh-ay/sheetwrite/pull/1334) [`9920a33`](https://github.com/chh-ay/sheetwrite/commit/9920a33beb435d806a13eb6d6bfbdee3aca83667) Thanks [@chh-ay](https://github.com/chh-ay)! - A store whose snapshot fails late in loading, in its pivots or its columnar data, now frees its engine memory before it throws, as earlier failures already did. When a document is replaced, or a collaborator's change leaves the active sheet hidden, the grid now shows the nearest visible sheet next to it, as it does when a grid opens on a hidden sheet, instead of the first visible sheet.

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

- [#1268](https://github.com/chh-ay/sheetwrite/pull/1268) [`ab70b28`](https://github.com/chh-ay/sheetwrite/commit/ab70b2884b65dfb80dad32202e4db50f4dbb9fe7) Thanks [@chh-ay](https://github.com/chh-ay)! - The `SavedQuery.name` docs say names are unique when letter case is ignored in every alphabet, as the check compares them, not only ASCII letter case.

- [#413](https://github.com/chh-ay/sheetwrite/pull/413) [`dc9a6d5`](https://github.com/chh-ay/sheetwrite/commit/dc9a6d5fa145f5044503254b6b54e3c52ebcf866) Thanks [@chh-ay](https://github.com/chh-ay)! - Core data paths use one copy of each shared rule:
  
  - Operation, snapshot and history size checks count JSON bytes with one walker. A `toJSON` field that is not a function is ordinary data, as it is for `JSON.stringify`; symbol-keyed fields, which JSON drops, are rejected.
  - The IndexedDB pending queue rejects a batch of more than 16 versions, and a durable queue record whose version counts have holes is rejected, like every other invalid batch.
  - `grid.hideRows` and `grid.showRows` skip rows that are not whole numbers, as the store's methods do, and `grid.clearView()` or removing a filter that is not set commits nothing.

- [#1226](https://github.com/chh-ay/sheetwrite/pull/1226) [`179481e`](https://github.com/chh-ay/sheetwrite/commit/179481e4cea9487862579aa8b3f4466a6847ecbf) Thanks [@chh-ay](https://github.com/chh-ay)! - Reading CSV and pasted text is faster. The parser that `fromCsv`, `parseCsv` and paste share cleared its list of quoted-field pieces after every field, which costs time even when the list is already empty; it now clears the list only when a quoted field used it. `fromCsv` of 200,000 rows by 10 columns takes about a fifth less time, and parsing a pasted block of 1,000 rows by 10 columns about a third less.

- [#671](https://github.com/chh-ay/sheetwrite/pull/671) [`6b28827`](https://github.com/chh-ay/sheetwrite/commit/6b288270bf5a4340c1bf7d4ad7bc686ec925d9ca) Thanks [@chh-ay](https://github.com/chh-ay)! - `fromCsv` reads a plain number in a number, currency or date column straight from the input text, without building a string for it first. Imported values, quoting, `=` handling and resource errors are unchanged.

- [#1075](https://github.com/chh-ay/sheetwrite/pull/1075) [`fcc8cd7`](https://github.com/chh-ay/sheetwrite/commit/fcc8cd7ce5edde5924e51cb17cf32a0b24384404) Thanks [@chh-ay](https://github.com/chh-ay)! - A cut that waits for a paste ends when a peer sorts, edits, clears or formats its cells, or adds a note, link or merge there, as it ends after a local edit. Before, only a peer's insert, delete or move of rows or columns ended it, so a later paste could move the cells a peer's sort had put there. As in Excel, a change to the cut cells ends the cut, and Paste then does nothing.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - A cut that covers rows a filter or the user hides says so: "This cut includes 12 hidden rows", and its paste "This paste moved 12 hidden rows", with a "Show them" button that clears the filters. Excel moves such rows silently; the cut and paste results are unchanged.

- [#931](https://github.com/chh-ay/sheetwrite/pull/931) [`563cd89`](https://github.com/chh-ay/sheetwrite/commit/563cd89d3cf4d830cdf6f5f474324b70614d11fb) Thanks [@chh-ay](https://github.com/chh-ay)! - Cut and paste moves the cells in Firefox and Safari as it does in Chromium, and a copy inside the grid keeps its formulas and styles there. A grid finds its own copy or cut by a token on the table of the HTML it writes, since those browsers keep no custom clipboard formats; before, the paste fell back to the copied text.

- [#834](https://github.com/chh-ay/sheetwrite/pull/834) [`5567f11`](https://github.com/chh-ay/sheetwrite/commit/5567f11476424676b6a48698fadb464667f40194) Thanks [@chh-ay](https://github.com/chh-ay)! - Cut and paste moves validation and conditional-format rules whose range lies inside the cut cells, as Excel does, and undo puts them back. A conditional-format formula follows the moved cells as a moved formula does, and a rule whose whole range the paste lands on goes. A range down to a sheet's last row or column no longer counts as a whole row or column when a cut moves its edge; only one that reaches Excel's sheet edge does.
  
  The engines add `moveFormulaCells`.

- [#1067](https://github.com/chh-ay/sheetwrite/pull/1067) [`0db57f9`](https://github.com/chh-ay/sheetwrite/commit/0db57f9c6e639c51da5709ee5b642cf099e4720d) Thanks [@chh-ay](https://github.com/chh-ay)! - A dashboard reads each item from the engine once per update, and a slicer click builds the dashboard once. KPI cards and measure pivots compute their measures on every read, so an edit under a dashboard over 100,000 rows takes less than half the time, and a slicer click about 40% less.

- [#502](https://github.com/chh-ay/sheetwrite/pull/502) [`968df36`](https://github.com/chh-ay/sheetwrite/commit/968df36c94d94a615b8b3ef03da24a6a1a0b5be1) Thanks [@chh-ay](https://github.com/chh-ay)! - The dashboard background, secondary widget text and error colors follow the theme. When `--sheetwrite-widget-muted-bg`, `--sheetwrite-widget-muted` or `--sheetwrite-widget-error` is unset, the stylesheet derives it from the widget background and text colors the grid sets, so a dark theme no longer shows a light dashboard background or light-theme greys and reds.

- [#529](https://github.com/chh-ay/sheetwrite/pull/529) [`3c9dac3`](https://github.com/chh-ay/sheetwrite/commit/3c9dac3ffd83f1427a688cde26dc65eeade1f78d) Thanks [@chh-ay](https://github.com/chh-ay)! - Editing a cell in a `date` column keeps it a date. The editor opens on the date text (`2024-02-29`, or `2024-03-01 12:00` when the serial has a time) rather than the raw serial, so committing it unchanged keeps the serial. A number typed into a date column is stored as that serial instead of as text. Custom editors receive the same date text in `CellEditorContext.text`.

- [#523](https://github.com/chh-ay/sheetwrite/pull/523) [`8a543f7`](https://github.com/chh-ay/sheetwrite/commit/8a543f7a11f9d9a9b8df6039c66e99a7c0e9bd5c) Thanks [@chh-ay](https://github.com/chh-ay)! - A date-formatted cell holding serial 60 shows 29 February 1900, as Excel does and as `DAY`, `MONTH` and `TEXT` already did. Every date code agrees: `yyyy-mm-dd` gives `1900-02-29`, `d mmm yyyy` gives `29 Feb 1900`, and `dddd` gives `Wednesday`. Typing `1900-02-29` into a date column stores serial 60. Other serials, including dates from 1904 date system workbooks, display as before.

- [#528](https://github.com/chh-ay/sheetwrite/pull/528) [`3a7e6be`](https://github.com/chh-ay/sheetwrite/commit/3a7e6befde186f767c645c2d3357b05b27aa2039) Thanks [@chh-ay](https://github.com/chh-ay)! - Weekday names (`ddd`, `dddd`) for serials 1–59 (1 January to 28 February 1900) now match Excel and `WEEKDAY`: serial 1 shows Sunday and serial 59 shows Tuesday. These names used to be a day later. Excel counts its fictional 29 February 1900 when it counts weekdays. Weekday names for serial 60 onward are unchanged.

- [#963](https://github.com/chh-ay/sheetwrite/pull/963) [`3a781b5`](https://github.com/chh-ay/sheetwrite/commit/3a781b5db5c6ac049efb0b80378b14614059c544) Thanks [@chh-ay](https://github.com/chh-ay)! - Delete and `grid.actions.clearContents()` clear the cells' values and keep their formats, as Excel's Delete does and as the API docs say. Before, they also removed the number format, bold and the other styles.

- [#720](https://github.com/chh-ay/sheetwrite/pull/720) [`41be35e`](https://github.com/chh-ay/sheetwrite/commit/41be35ed082a72cdc11f48e701aeb1c1a9e6b86a) Thanks [@chh-ay](https://github.com/chh-ay)! - The API reference describes more of `@sheetwrite/core`: the row bridge, number formatting, host functions and formula help, the spreadsheet shell and its pieces, tables, A1 helpers, the store, version history, rebase, pivots, framework adapter helpers, dashboards, external links, offline storage, snapshot validation, presence and comments, resource accounting, cell input and date helpers.

- [#729](https://github.com/chh-ay/sheetwrite/pull/729) [`6872937`](https://github.com/chh-ay/sheetwrite/commit/6872937a8192e800f13b5beff6fdfc0849ffa36b) Thanks [@chh-ay](https://github.com/chh-ay)! - The API reference describes the last undescribed `@sheetwrite/core` chart types, `showRows`, and a few parameters and return values, and several earlier descriptions now read as plain sentences.

- [#718](https://github.com/chh-ay/sheetwrite/pull/718) [`9d82d4f`](https://github.com/chh-ay/sheetwrite/commit/9d82d4ff862ee56c6cc6fe263585a536c6d41e3f) Thanks [@chh-ay](https://github.com/chh-ay)! - The API reference describes the most-used types, fields and functions of `@sheetwrite/core`: cell addresses and ranges, data sources, snapshots, errors, CSV and XLSX helpers, transactions, persistence, sync, and the grid's actions and events.

- [#895](https://github.com/chh-ay/sheetwrite/pull/895) [`e713730`](https://github.com/chh-ay/sheetwrite/commit/e713730a5b054cea23e3e89a673cceec37fbec97) Thanks [@chh-ay](https://github.com/chh-ay)! - The grid's dialogs (Paste Special, Data Validation, Format Cells, Insert, Delete, the merge warning and the keyboard shortcuts) open centred in the window on a page whose CSS reset sets `* { margin: 0 }`. Before, such a reset removed the browser's `margin: auto`, and the dialogs opened at the window's top-left corner.

- [#869](https://github.com/chh-ay/sheetwrite/pull/869) [`584e85a`](https://github.com/chh-ay/sheetwrite/commit/584e85af2ee050b3663bb51a5cb6f6c57b686acb) Thanks [@chh-ay](https://github.com/chh-ay)! - The grid's dialogs (Format Cells, Insert, Delete and the merge warning) open centred in the browser window, as Excel's do, instead of inside the grid's area. They fit any window down to 390 px wide: a short window scrolls the dialog's body, and the title, OK and Cancel stay in view. Before, Format Cells was cut to the grid's height, so at 1280 × 720 OK was below the visible part of the dialog. Each dialog is a modal `<dialog>` element in the browser's top layer, so a host's overflow, transform or stacking cannot cut it, and the rest of the page is inert while it is open.

- [#906](https://github.com/chh-ay/sheetwrite/pull/906) [`447e6b8`](https://github.com/chh-ay/sheetwrite/commit/447e6b821d539e6892fb8b8401d3fd02224b6d51) Thanks [@chh-ay](https://github.com/chh-ay)! - Distinct-value reads hand their texts to JavaScript as one string with each text's length, instead of one string per value, so JavaScript decodes them in one call. AutoComplete's first typed key, the AutoFilter dropdown of a text column and `grid.distinctValues` read many distinct texts faster. `DistinctColumn` gains `takeTextJoined()` and `takeTextLengths()`; `takeTexts()` is unchanged.

- [#1345](https://github.com/chh-ay/sheetwrite/pull/1345) [`be65ef9`](https://github.com/chh-ay/sheetwrite/commit/be65ef91bc833144eea93c6fd3fdfb2819b93af6) Thanks [@chh-ay](https://github.com/chh-ay)! - Committing a cell edit and opening the cell editor read less of the page's layout. Whether a change shows in the painted cells, and whether a move after Enter or Tab needs a scroll, now come from the grid's last frame while nothing has scrolled or resized since, instead of reading the scroller. The editor hands the focus back to the grid before it leaves the page, and the grid takes the focus without a scroll into view. Pressing a key reads the page height only for Page Up and Page Down.

- [#1341](https://github.com/chh-ay/sheetwrite/pull/1341) [`5864745`](https://github.com/chh-ay/sheetwrite/commit/5864745ab9c7dd8fd8b112141e5700f4d1ad2d39) Thanks [@chh-ay](https://github.com/chh-ay)! - Opening and committing the cell editor do less work. The edited cell is read once instead of up to three times. F2 on a one-line cell finds the caret from the editor the browser has just laid out for focus, instead of measuring the text on a canvas. The editor is a scroll box that may show a vertical scrollbar only when its text runs past eight lines, which makes the layout of every shorter edit cheaper.

- [#1177](https://github.com/chh-ay/sheetwrite/pull/1177) [`d088d00`](https://github.com/chh-ay/sheetwrite/commit/d088d00d96be982f0de6f6e1acf55b9350607d19) Thanks [@chh-ay](https://github.com/chh-ay)! - F2 on a cell whose text is wider than the cell now opens the cell editor scrolled to the caret at the end of the text in every browser. In Firefox and Safari the caret used to start out of view until you typed.

- [#1112](https://github.com/chh-ay/sheetwrite/pull/1112) [`9cb040e`](https://github.com/chh-ay/sheetwrite/commit/9cb040e3d7f9b6849f79572594d22de2c43572e6) Thanks [@chh-ay](https://github.com/chh-ay)! - The cell editor keeps the cell's alignment and font while it edits, as Excel's in-cell editor does: right-aligned and centred text stays in place, and the cell's font family, size, bold, italic, colour, underline and strikethrough show in the editor. Under General alignment a number edits at the right, and a formula or a newly typed entry at the left.

- [#1172](https://github.com/chh-ay/sheetwrite/pull/1172) [`ba7a964`](https://github.com/chh-ay/sheetwrite/commit/ba7a96413db34d5e9a1c6ec5129abe4f730e6547) Thanks [@chh-ay](https://github.com/chh-ay)! - The cell editor writes a cell's font, colour, alignment, decoration and padding inline only when they differ from the editor's stylesheet, so opening the editor on an unformatted cell is faster. A host stylesheet that sets `.sheetwrite-editor`'s font applies again to cells without their own font, as before 0.7.0.

- [#1169](https://github.com/chh-ay/sheetwrite/pull/1169) [`2ad3db6`](https://github.com/chh-ay/sheetwrite/commit/2ad3db69ffe8303c897f080f86b9117748c3fb95) Thanks [@chh-ay](https://github.com/chh-ay)! - Opening the cell editor no longer reads the editor's style and layout back. A one-line value takes the cell's height; only text with line breaks measures the editor, once per edit. On a 100,000-row sheet, opening the editor takes about a quarter less time and an edit commit about a seventh less. A long line now scrolls with the caret without a horizontal scrollbar, as in Excel and as before 0.7.0; on systems with classic scrollbars the editor no longer grows by a scrollbar's height.

- [#966](https://github.com/chh-ay/sheetwrite/pull/966) [`564131b`](https://github.com/chh-ay/sheetwrite/commit/564131bf69a064d72c907ad4f44b488ebc8ce64d) Thanks [@chh-ay](https://github.com/chh-ay)! - Number formats show elapsed time, as Excel does: `[h]:mm:ss` shows 1.5 days as `36:00:00`, and `[mm]` and `[ss]` count minutes and seconds. Before, `[h]` showed the hour of the day in brackets, so a typed `25:00` showed as `[1]:00:00`.

- [#922](https://github.com/chh-ay/sheetwrite/pull/922) [`ea36804`](https://github.com/chh-ay/sheetwrite/commit/ea368044005d2adc22430742e54bc3048ee10572) Thanks [@chh-ay](https://github.com/chh-ay)! - Enter after a one-click formula fix that corrects a function name ("Did you mean SUM?") stores the formula, as without a fix. Before, the fix left the caret after the corrected name, the function list opened for it, and Enter went to the list, so the editor stayed open.

- [#848](https://github.com/chh-ay/sheetwrite/pull/848) [`2c4b53c`](https://github.com/chh-ay/sheetwrite/commit/2c4b53c01a1c9b400217af60bcf88492ab8c97de) Thanks [@chh-ay](https://github.com/chh-ay)! - Enter after a run of Tab entries goes to the next row in the column where the run started, as in Excel, so a table can be typed row by row with Tab and Enter. Any other move ends the run.

- [#998](https://github.com/chh-ay/sheetwrite/pull/998) [`919881d`](https://github.com/chh-ay/sheetwrite/commit/919881d788028792d896ac13f5502204852fd7e5) Thanks [@chh-ay](https://github.com/chh-ay)! - `@sheetwrite/core` exports the types that its public methods take or return, so a host can name them: `ClipboardOutcome` (the result of `grid.actions.copy`, `cut`, `paste`, `pasteValues` and `pasteSpecial`), `PasteSpecialOptions`, `SelectionSummary` (`grid.summarizeSelection()`), `AddSheetInput`, `BorderPreset`, `CellRef`, `ClipboardWindowView`, `CompactRangeHistory`, `RangeMutationAllocationStats`, `RestoreProvenance` and `XlsxWorkbookExportContext`. `@sheetwrite/core/history` exports `AtomicHistoryStorage` and `HistoryStorageTransaction`. Before, these types appeared in signatures but could not be imported.

- [#934](https://github.com/chh-ay/sheetwrite/pull/934) [`42d356f`](https://github.com/chh-ay/sheetwrite/commit/42d356f82b79a871da19cc28d449f0b7d30ab07b) Thanks [@chh-ay](https://github.com/chh-ay)! - The fill handle, Ctrl+D and Ctrl+R copy each source cell's data validation rule to the cells they fill, in place of those cells' own rules, and land the filled values unchecked, as Excel's fill does. Fill Formatting Only copies the rules too; Fill Without Formatting keeps the filled cells' own. A copied rule's relative references now shift to where a paste or fill lands it, as Excel's do, and a rule that a paste splits keeps its formulas where its cells are.

- [#930](https://github.com/chh-ay/sheetwrite/pull/930) [`134c325`](https://github.com/chh-ay/sheetwrite/commit/134c32564620f6b06c066f765d736e7d9789cfae) Thanks [@chh-ay](https://github.com/chh-ay)! - The fill handle shows while a filter, hidden rows or a view sort is on, and a drag fills only the rows that show, as Excel's does. Before, the handle was hidden under any view.

- [#1117](https://github.com/chh-ay/sheetwrite/pull/1117) [`d0ba197`](https://github.com/chh-ay/sheetwrite/commit/d0ba197ea7fb071dccf85eaa5b5e520fef45e132) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter button sits as far from the cell's right gridline as the header text sits from its left one, centred in the row, and the header text ends the same distance before the button. A pointer opens the dropdown from an area at least 24 px wide, for touch.

- [#1099](https://github.com/chh-ay/sheetwrite/pull/1099) [`5786305`](https://github.com/chh-ay/sheetwrite/commit/57863055ec046d093637e16888f7af581c63d234) Thanks [@chh-ay](https://github.com/chh-ay)! - An AutoFilter header cell lays out its text in a box that ends before the filter button, for every alignment, as in Excel. A right-aligned header such as "Revenue" no longer runs under the button, long header text clips before it, and the cell editor ends there too.

- [#1164](https://github.com/chh-ay/sheetwrite/pull/1164) [`0af864c`](https://github.com/chh-ay/sheetwrite/commit/0af864ce11132a83f58c06e55e3bf752cbdf7ed0) Thanks [@chh-ay](https://github.com/chh-ay)! - Filtering a large sheet is faster again. Since SUBTOTAL and AGGREGATE learned to skip filtered rows, each filter change listed the rows it hides through a growing JavaScript array; it now writes them straight into one typed array. On 1,000,000 rows a contains filter takes about 38% less time, and two combined filters about 18% less.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - A cut over a filtered range moves every row from the first selected row to the last, the rows the filter hides too, as Excel's cut does. Before, such a cut did nothing. Copy, delete, formatting and the fill handle still act only on the rows the filter shows.

- [#970](https://github.com/chh-ay/sheetwrite/pull/970) [`3e9a404`](https://github.com/chh-ay/sheetwrite/commit/3e9a4049bb78e5378adb66622dade74f2c1e1919) Thanks [@chh-ay](https://github.com/chh-ay)! - Find and Replace match a number in a number format by its text, as Excel does: Look in: Formulas by the formula bar's text (`1/15/2026`, `15%`), Look in: Values by the text the cell shows (`$4.50`). Before, they compared the stored number, so a date or percentage typed in a new sheet could not be found by what was typed, and `0.15` found a cell that shows `15%`. Replace rewrites that text and reads it back as typed. Sheets with no number format keep the engine's scan alone.

- [#839](https://github.com/chh-ay/sheetwrite/pull/839) [`2a786e6`](https://github.com/chh-ay/sheetwrite/commit/2a786e61ed6d37f3d84918471341c50b9e68a31c) Thanks [@chh-ay](https://github.com/chh-ay)! - Find and Replace search only the selection when more than one cell is selected, as Excel does. Before, `grid.search` and the find bar searched the whole sheet, so Replace all also changed cells outside the selection. With one cell selected, or one merged cell, they still search the whole sheet. The selection stays while you step through matches: Find Next moves the active cell inside it.

- [#782](https://github.com/chh-ay/sheetwrite/pull/782) [`445a506`](https://github.com/chh-ay/sheetwrite/commit/445a506993e22be87953b71d37783047d61c6111) Thanks [@chh-ay](https://github.com/chh-ay)! - Find selects the match it shows, as Excel's Find Next does. `search`, `findNext`, `findPrev` and `replaceCurrent` now select the active match on the active sheet and scroll to it, so typing after Find edits that cell.

- [#832](https://github.com/chh-ay/sheetwrite/pull/832) [`95c0853`](https://github.com/chh-ay/sheetwrite/commit/95c0853bead8c1d3075292a3c24eca4967d47cf6) Thanks [@chh-ay](https://github.com/chh-ay)! - New optional package `@sheetwrite/formula-assist`. `formulaAssistAddon()` predicts the rest of the formula typed in the formula bar and shows it as dimmed text after the caret. Tab takes all of it, Ctrl+→ (also ⌥→ on macOS) takes one word, and Esc hides it until the text changes. When no suggestion shows, Tab inside a call that still lacks a required argument (the argument guide shows it) writes `,` and moves to the next argument, where Excel's Tab could only refuse the formula; everywhere else Tab is Excel's. Predictions come from the workbook alone, without network or AI: a neighbouring formula that the cells above and below, or left and right, agree on, moved to the cell; and syntax (the only function or sheet the typed letters can start, closing brackets). A suggestion shows only when the benchmark measured it right at least 90% of the time and it is clearly ahead of the next one. The add-on entry only registers itself; the predictor is a separate chunk that starts loading when the grid mounts, outside the first load of the page.
  
  Core gives add-ons `formulaSuggestions(suggester)` in their grid hook, with the `FormulaSuggester`, `FormulaSuggestionSession`, `FormulaEdit` and `FormulaSheetReads` contracts, and draws the ghost text in the formula bar. The cell editor keeps Excel's AutoComplete, and without a suggester the formula bar's keys are unchanged. `openFormulaEdit`, `shownSuggestion` and `suggestionWordEnds` in `@sheetwrite/core/testing` run a suggester without a grid.

- [#1018](https://github.com/chh-ay/sheetwrite/pull/1018) [`21a2ecf`](https://github.com/chh-ay/sheetwrite/commit/21a2ecf57c54a1bca9e3ff207230de64f8d6b48d) Thanks [@chh-ay](https://github.com/chh-ay)! - The formula bar's argument guide and function list take the grid's theme colours, as the cell editor's do. In a dark grid they were white, because the formula bar sits outside the grid and its help fell back to the light defaults.

- [#695](https://github.com/chh-ay/sheetwrite/pull/695) [`a2c2522`](https://github.com/chh-ay/sheetwrite/commit/a2c252203e6c1a16ea4ba004e029c62ccd517369) Thanks [@chh-ay](https://github.com/chh-ay)! - The cell editor and the shell's formula bar share one draft during an edit, as in Excel: every keystroke, paste, IME step, undo or picked reference in either shows in the other at once, Escape in either restores both, and moving focus between them keeps the edit open.

- [#307](https://github.com/chh-ay/sheetwrite/pull/307) [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste, fill and conditional-format rules now rewrite formula references with the engine's own rules (part of [#246](https://github.com/chh-ay/sheetwrite/issues/246)). `=SUM(A:A)` pasted one column right becomes `=SUM(B:B)`, and a name such as `XYZ1`, past the last column, stays a name instead of becoming `#REF!`. A row or column insert, delete or move rewrites whole columns and rows in conditional-format formulas too. Only the references that change are rewritten, so the rest of the formula keeps its spacing and case.
  
  The engines export `translateFormula`, `shiftFormulaAxis` and `moveFormulaAxis`. `shiftA1Refs` from `@sheetwrite/core` now calls the engine, so it needs `initSheetwrite()` first. `rebaseDocumentOperations` needs it too when it moves a conditional format that has a formula.

- [#847](https://github.com/chh-ay/sheetwrite/pull/847) [`89f4666`](https://github.com/chh-ay/sheetwrite/commit/89f46666470312a52aa0c54aa45dfaa7b641bcb5) Thanks [@chh-ay](https://github.com/chh-ay)! - Enter no longer stores a formula that does not parse, as in Excel. It shows "There's a problem with this formula." with the problem, then keeps the cell editor (or the formula bar) open with the problem selected. When only closing parentheses are missing at the end, Enter adds them: `=SUM(A1:A3` stores `=SUM(A1:A3)`.

- [#1014](https://github.com/chh-ay/sheetwrite/pull/1014) [`b737f5c`](https://github.com/chh-ay/sheetwrite/commit/b737f5c07cc55312b48b718349108fa11e6bbab1) Thanks [@chh-ay](https://github.com/chh-ay)! - The formula bar keeps a suggestion while you type it. After `=` shows `SUM(D2:D11)`, typing `S` leaves `UM(D2:D11)`, and a character that differs takes it away. While the function list is open, a new suggestion shows when it starts with what one entry inserts, and that entry becomes the selected one; before, it showed only when it was exactly that entry's text. Tab takes the suggestion while it shows; once you move to another entry of the list, Tab takes that entry, as in Excel. `shownSuggestion` in `@sheetwrite/core/testing` takes the ghost on screen as an optional fourth argument, and the `GhostOnScreen` type describes it.

- [#915](https://github.com/chh-ay/sheetwrite/pull/915) [`7cfaa3a`](https://github.com/chh-ay/sheetwrite/commit/7cfaa3a0c371c8fbf91b83225b341981d06624b5) Thanks [@chh-ay](https://github.com/chh-ay)! - A new column type, `general`, reads what a user types as Excel's General format does: `42` is a number, `15%` is 0.15 shown as `0%`, `$4.50` is 4.5 shown as `$#,##0.00`, `1/15/2026` is a date shown as `m/d/yyyy`, `9:30 PM` is a time, and `'007` is the text `007`. New sheets, `addSheet` without `columns`, the empty columns right of a sheet's own, XLSX imports without one number format per column, and an adapter's column without `type` are `general`. Before, they were `text`, so a typed number or date in a new sheet or an opened XLSX file stayed text, and `SUM` skipped it. A column typed `text` still keeps typed text.

- [#967](https://github.com/chh-ay/sheetwrite/pull/967) [`528ee8c`](https://github.com/chh-ay/sheetwrite/commit/528ee8c8a440bd30acf63f9dca19dd9a51cc8271) Thanks [@chh-ay](https://github.com/chh-ay)! - In a `general` column, the editor opens a time on the clock of the column's `numberLocale`, as Excel's formula bar does: a typed `9:30 PM` opens as `9:30:00 PM` in `en-US` (the default), not `21:30:00`, and as `21:30:00` in `de-DE` or `en-GB`. Find with Look in: Formulas matches the same text.

- [#939](https://github.com/chh-ay/sheetwrite/pull/939) [`5124ebd`](https://github.com/chh-ay/sheetwrite/commit/5124ebd7d799c2c19048813f6b9ab695092a9496) Thanks [@chh-ay](https://github.com/chh-ay)! - Reading a long entry in a `general` column takes linear time. A pasted or stored string such as a digit, thousands of spaces and a letter made the date-and-time reading backtrack in quadratic time, which froze the grid on paste, on Enter and whenever the formula bar showed the cell. Text longer than 40 characters now skips the fraction, time and date forms, none of which is that long; it stays text, as before.

- [#958](https://github.com/chh-ay/sheetwrite/pull/958) [`03ab3d1`](https://github.com/chh-ay/sheetwrite/commit/03ab3d190f31d3c1e841ef1b616f930feedc3bf6) Thanks [@chh-ay](https://github.com/chh-ay)! - A number with no number format shows as Excel's General format shows it: no thousands separators, up to 11 characters in a cell (the minus sign not counted), and scientific notation for a number whose whole part does not fit or that is below 0.0001. So `2026` shows as `2026`, `0.0001234` as `0.0001234` and `123456789012` as `1.23457E+11`. In a narrow cell, the number takes fewer decimals or scientific notation before it shows `####`. Before, it showed `2,026`, `0` and `123,456,789,012`, and negative zero showed as `-0`.

- [#981](https://github.com/chh-ay/sheetwrite/pull/981) [`173f293`](https://github.com/chh-ay/sheetwrite/commit/173f2934f11ecf5ef149ea21f6e3721fb8e390c3) Thanks [@chh-ay](https://github.com/chh-ay)! - In a `general` column, dates follow the column's `numberLocale`, as Excel follows the region's short date. The editor opens a date as `15.01.2026` in `de-DE`, `15/01/2026` in `en-GB` and `1/15/2026` in `en-US` (the default). Typing reads a date in numbers in the same order, so typing back what the editor shows keeps the value. Before, dates always read and opened month first.

- [#965](https://github.com/chh-ay/sheetwrite/pull/965) [`6f5ab53`](https://github.com/chh-ay/sheetwrite/commit/6f5ab535096d863299ea23442f375677821aa118) Thanks [@chh-ay](https://github.com/chh-ay)! - A `general` column reads a date of two parts as Excel does: first as day and month of this year, then as month and year. `Jan-26` is 26 January of this year, `Feb-30` is February 1930, and `1/99` and `11/95` are January 1999 and November 1995. Before, `Jan-26` was January 2026 and `1/99` stayed text.

- [#415](https://github.com/chh-ay/sheetwrite/pull/415) [`d519828`](https://github.com/chh-ay/sheetwrite/commit/d519828c399b00c0f6a7646633a11853d9bf8eeb) Thanks [@chh-ay](https://github.com/chh-ay)! - The core build generates the built-in function table from the formula contract inventory instead of reading a committed copy. The published table is unchanged; the packed `@sheetwrite/core` manifest gains a `generate` script, and the `@sheetwrite/formulas` README no longer asks contributors to regenerate docs after adding a function.

- [#634](https://github.com/chh-ay/sheetwrite/pull/634) [`eabee8c`](https://github.com/chh-ay/sheetwrite/commit/eabee8c55c03c5a0f1e1f97499070126206e6946) Thanks [@chh-ay](https://github.com/chh-ay)! - Scrolling with the cell editor open and editing a cell make the browser recalculate styles and layout less often. Each paint writes the screen-reader mirror as its last step, after it has read the scroll position and placed the editor, and the cell editor reads its line height, padding and borders once when it opens instead of after every change of its size. A move that keeps the cell's size only sets the editor's position. The mirror and `aria-activedescendant` show the same rows, cells, notes and selection, in the same task as before. One order changes inside a paint: a `scroll` listener now runs before that paint updates the mirror, so it reads the mirror of the previous paint.

- [#447](https://github.com/chh-ay/sheetwrite/pull/447) [`3f5a91f`](https://github.com/chh-ay/sheetwrite/commit/3f5a91f65974b3631efd6cfd6687933effe95be5) Thanks [@chh-ay](https://github.com/chh-ay)! - Document every `Grid` member: `store`, `setActiveSheet`, `scrollToCell`, `getSelection`, `setSelection`, `defineCellRenderer`, the row and column insert and remove methods, sheet rename and move, conditional formats, hyperlinks, validation rules, protected ranges, the protection resolver, notes, `getZoom`, `on` and `refresh` now have doc comments, so editor hovers and the API reference describe them. No behaviour changes.

- [#1029](https://github.com/chh-ay/sheetwrite/pull/1029) [`41deb1b`](https://github.com/chh-ay/sheetwrite/commit/41deb1ba3892449113f9b05eebca1cc534eaaab9) Thanks [@chh-ay](https://github.com/chh-ay)! - The grid's ARIA roles are valid: the `grid` role owns only rows and cells.
  
  - The hidden mirror `div.sheetwrite-aria` now has `role="grid"` and carries `aria-multiselectable`, `aria-rowcount`, `aria-colcount` and `aria-readonly`. It used to be a `rowgroup` inside a host with the `grid` role, and that host also held the toolbar, the sheet tabs and the panels, which a grid may not own. The host keeps its `aria-label`, so a screen reader names the grid once.
  - The host is a labelled `group` that keeps the focus and `aria-activedescendant`. Code that reads `aria-rowcount`, `aria-colcount` or `aria-readonly` from the host reads them from `host.querySelector('[role="grid"]')` instead.
  - `aria-activedescendant` names only a cell the mirror holds. While the active cell is scrolled out of the mirrored window, the host has no `aria-activedescendant`.

- [#936](https://github.com/chh-ay/sheetwrite/pull/936) [`38db3ca`](https://github.com/chh-ay/sheetwrite/commit/38db3ca59931789c768bda4a2d016568a4e7f6d9) Thanks [@chh-ay](https://github.com/chh-ay)! - Copy, the fill handle, Ctrl+D and Ctrl+R take the rows hidden with Hide Rows or a collapsed group between the selected rows, as Excel does; a series counts through them. Rows a filter hides stay out. `Store.getClipboardWindow` takes `{ dataRows: true }` to read data rows in sheet order.

- [#1184](https://github.com/chh-ay/sheetwrite/pull/1184) [`b7e20c5`](https://github.com/chh-ay/sheetwrite/commit/b7e20c551bdaa5df1aa54eb5052b7d8022240f26) Thanks [@chh-ay](https://github.com/chh-ay)! - Changing a filter on a large sheet is faster. The view now hands the engine the rows the filter keeps, which it already has, and the engine lists the rows the filter hides for SUBTOTAL and AGGREGATE itself, instead of JavaScript listing them first.

- [#1325](https://github.com/chh-ay/sheetwrite/pull/1325) [`2f458d1`](https://github.com/chh-ay/sheetwrite/commit/2f458d192c12fff75973305d89797d8a0515efbc) Thanks [@chh-ay](https://github.com/chh-ay)! - Filters are faster in workbooks without SUBTOTAL or AGGREGATE. A filter or hidden row used to send the rows it hides to the engine on every change, for formulas that skip hidden rows. The store now keeps them until a formula that may read them is entered, and sends the latest rows then. On 10,000 rows a column filter takes about 10% less time.

- [#1125](https://github.com/chh-ay/sheetwrite/pull/1125) [`f8dcdcb`](https://github.com/chh-ay/sheetwrite/commit/f8dcdcb7db1f8a1339489a4ce3775c448c12362a) Thanks [@chh-ay](https://github.com/chh-ay)! - `HistoryArchive.diffVersions` reads and rebuilds only the checkpoint pages that can differ between the two versions, so a small change of a large workbook compares in a fraction of a second instead of rebuilding both versions whole (100,000 rows × 4 columns on Linux: 10 changed cells 7.6 s → 0.33 s, 1,000 changed rows 7.9 s → 1.7 s). Pages are matched by content ID through the log's row and column alignment. The result is the same as before. Both versions are still rebuilt whole when a version's log tail holds a structural or other non-cell operation, or when more than a quarter of the pages differ.

- [#1241](https://github.com/chh-ay/sheetwrite/pull/1241) [`1b44c74`](https://github.com/chh-ay/sheetwrite/commit/1b44c7421a83fdc3be920a5071da766daf491fed) Thanks [@chh-ay](https://github.com/chh-ay)! - Version history bounds the mutation, author and restored version IDs of a commit it records by their UTF-8 bytes, at most 256, as sync bounds mutation and author IDs. It counted UTF-16 code units, so it accepted IDs of up to 768 bytes that sync refuses. IDs already in an archive, and document IDs, keep the earlier bound of 256 UTF-16 code units, so archives written by earlier versions still open and replay.

- [#763](https://github.com/chh-ay/sheetwrite/pull/763) [`cc509fe`](https://github.com/chh-ay/sheetwrite/commit/cc509fe8d9f6fe5ec8443431b9f795ab1f300a01) Thanks [@chh-ay](https://github.com/chh-ay)! - The `DEFAULT_HISTORY_LIMITS` doc comment says what the limits are for and that a host can change them, instead of citing an issue number.

- [#793](https://github.com/chh-ay/sheetwrite/pull/793) [`908a05e`](https://github.com/chh-ay/sheetwrite/commit/908a05e9717b603c631baf0cf74fa8f2796f115e) Thanks [@chh-ay](https://github.com/chh-ay)! - Undo, version restore and remote operations can give a sheet back the name History. Only a user's rename refuses it now: `Grid.renameSheet` (and the tab rename) reports the `reserved` issue, while `renameSheet` operations accept the name, as `addSheet` operations already did.

- [#1137](https://github.com/chh-ay/sheetwrite/pull/1137) [`9d175a5`](https://github.com/chh-ay/sheetwrite/commit/9d175a53b29c430101da6e77fd2ffd58c1e48d2f) Thanks [@chh-ay](https://github.com/chh-ay)! - `HistoryArchive.restoreVersion` with a `sync` coordinator at the archive head reads and writes only the checkpoint pages where the version and the head differ, instead of rebuilding the whole version. The restored document and its undo are the same as before.

- [#1056](https://github.com/chh-ay/sheetwrite/pull/1056) [`c5f855f`](https://github.com/chh-ay/sheetwrite/commit/c5f855feff688fdc50a6510ab348148c37245389) Thanks [@chh-ay](https://github.com/chh-ay)! - Comparing, restoring and reading a version validate the rebuilt snapshot once. The replay store takes the checkpoint that history already validated and repeats only the checks that depend on its own options (resource limits and storage), instead of walking every cell again. Results and errors do not change.

- [#1165](https://github.com/chh-ay/sheetwrite/pull/1165) [`7bd6570`](https://github.com/chh-ay/sheetwrite/commit/7bd65702c4c5bdfd724fdd8ea087cde71b8bf197) Thanks [@chh-ay](https://github.com/chh-ay)! - An imported XLSX workbook is freed as soon as the page drops it. Before, checking the imported snapshot could keep the whole workbook in memory for dozens of garbage collections: 35 MB for the XLSX benchmark corpus.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX and CSV failures stay small:
  
  - An XLSX error message keeps at most 8 KiB of text from the file, from the start and the end, and keeps the decoding error as its `cause`.
  - One XLSX conversion reports at most 64 warnings to `onWarning`.
  - `DelimitedTextOptionsError.context` keeps a number option value, or only `valueType` for any other value, never a copy of it.
  - A registered XLSX backend name in a failure context is cut to 256 characters.

- [#1196](https://github.com/chh-ay/sheetwrite/pull/1196) [`85823f3`](https://github.com/chh-ay/sheetwrite/commit/85823f3007b175e66c0111d1bcc98c04335598c1) Thanks [@chh-ay](https://github.com/chh-ay)! - Small transactions are faster. Before a transaction applies, Sheetwrite measures its JSON size and refuses values that JSON cannot carry. That check no longer records the path to each value and the objects above it, which only an error message needs; when it finds a problem, it checks again with them to report it. On 1,000 rows, 1,000 single-cell edits take about 15% less time and a column filter about 5% less.

- [#916](https://github.com/chh-ay/sheetwrite/pull/916) [`43e59d1`](https://github.com/chh-ay/sheetwrite/commit/43e59d1572accf43a5720c2dcc249fb12854d47b) Thanks [@chh-ay](https://github.com/chh-ay)! - The Keyboard shortcuts panel lists Paste Special (Ctrl+Alt+V, and Ctrl+Cmd+V on a Mac) under Clipboard, so a user can see and change its keys, and a conflict with it names it "Paste Special". Before, the panel left it out.

- [#791](https://github.com/chh-ay/sheetwrite/pull/791) [`c499257`](https://github.com/chh-ay/sheetwrite/commit/c4992578fe07b91b6b5e1f3070706c36758ecddb) Thanks [@chh-ay](https://github.com/chh-ay)! - Keys pressed while the find bar, a dialog, a sheet tab panel, the AutoFilter dropdown or the dashboard builder loads its code on first use now act after it opens, in order, where it left the focus. Before, typing right after Ctrl+F could edit the cell instead of filling the find field.

- [#669](https://github.com/chh-ay/sheetwrite/pull/669) [`2099b4d`](https://github.com/chh-ay/sheetwrite/commit/2099b4de3b5b9b84ce37969013ba8af545519021) Thanks [@chh-ay](https://github.com/chh-ay)! - A wrapped cell whose text has combining marks, emoji or other multi-part characters paints in time that follows the lines it shows, not the length of its text. The lines and where they break are unchanged.

- [#506](https://github.com/chh-ay/sheetwrite/pull/506) [`cd6dc20`](https://github.com/chh-ay/sheetwrite/commit/cd6dc204da50474d221f33f634b3e5d097649b51) Thanks [@chh-ay](https://github.com/chh-ay)! - A grid destroyed while optional code loads no longer calls its freed engine. A chart over a pivot that starts loading the pivot views, an XLSX export that loads the pivot export code, Insert › New Dashboard, the panels that the ribbon, Edit Links, Queries & Connections and Version History open, and `updateExternalLinks` waiting on its resolver now check whether the grid or its store is gone when the wait ends. The export and `updateExternalLinks` then reject with an `aborted` error, `loadPanels` rejects with the grid's `AbortError`, and the others do nothing. Before, the engine could fail with "null pointer passed to rust".

- [#375](https://github.com/chh-ay/sheetwrite/pull/375) [`d078939`](https://github.com/chh-ay/sheetwrite/commit/d0789397aa1d91efdb6de0d3e3ccd1e6b03751c6) Thanks [@chh-ay](https://github.com/chh-ay)! - Keep the store and its error helpers out of webpack's initial chunk when an app only initializes core. The lazy XLSX import and export module no longer imports the store; the grid checks that an exported sheet is complete before the lazy module runs.

- [#1108](https://github.com/chh-ay/sheetwrite/pull/1108) [`a181de6`](https://github.com/chh-ay/sheetwrite/commit/a181de67e770c1e0f293c60dd971233adf4ea0f3) Thanks [@chh-ay](https://github.com/chh-ay)! - Updating linked workbooks (Edit Links' Update All, or any `setExternalLinks` change) recalculates only the formulas that read a value that changed. A link that keeps its book, sheet names, names and sheet extents keeps its sheets in the engine, and only its changed cells are written. Before, every update removed and added every link sheet, and each of those steps relinked every formula in the workbook and recalculated every formula on the sheets that read a link. With 10 links read by 10,000 formulas, an update took 450 ms; now it takes 18 ms. A link whose sheets, names or extents change takes the old path. Values do not change.

- [#1100](https://github.com/chh-ay/sheetwrite/pull/1100) [`a130048`](https://github.com/chh-ay/sheetwrite/commit/a1300481a1303703be1234d16e0b3fe165e96068) Thanks [@chh-ay](https://github.com/chh-ay)! - Opening a list validation rule's dropdown (Alt+Down or the cell's arrow) no longer blanks the cell: it keeps showing its value, with that value highlighted in the list, as in Excel. Typed text still replaces the value and filters the list.

- [#330](https://github.com/chh-ay/sheetwrite/pull/330) [`52daf35`](https://github.com/chh-ay/sheetwrite/commit/52daf35c41d27a52d827d87adcb005595ebe1605) Thanks [@chh-ay](https://github.com/chh-ay)! - A workbook or snapshot that loads with hidden rows, collapsed row groups, filters or sort keys now shows its saved view at once. Before, the store view (`hasView`, `viewRowCount`, `viewRowOf`) ignored them until the first row or filter change on that sheet, and `SUBTOTAL` counted the rows that a saved filter hides. A sheet added from a snapshot, for example when you undo a sheet removal, also gets its saved view.

- [#1049](https://github.com/chh-ay/sheetwrite/pull/1049) [`dcfaf3e`](https://github.com/chh-ay/sheetwrite/commit/dcfaf3ef24cf271b2d2214cea3e94318d6561d46) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste Special's default Ctrl+Cmd+V is Excel for Mac's and now applies only on macOS. On Windows and Linux the default is Ctrl+Alt+V alone, so the Keyboard shortcuts panel no longer marks a default the operating system keeps (Ctrl with the Windows or Super key) ([#1044](https://github.com/chh-ay/sheetwrite/issues/1044)).

- [#792](https://github.com/chh-ay/sheetwrite/pull/792) [`9a3f153`](https://github.com/chh-ay/sheetwrite/commit/9a3f153a1b15cad4530bb241596ac29fb40df441) Thanks [@chh-ay](https://github.com/chh-ay)! - Merging a range in which more than one cell holds a value from the toolbar, the ribbon's Merge & Center or the context menu warns first, as Excel does: "Merging cells only keeps the upper-left value and discards other values." OK merges, as one undoable step; Cancel or Escape leaves the cells as they were. From code, `grid.actions.merge()` and `mergeAndCenter()` merge before they return and keep only the upper-left value, as Excel's `Range.Merge` does in a macro with `DisplayAlerts = False`; `merge({ ask: true })` and `mergeAndCenter({ ask: true })` warn first, as the toolbar does. The warning, a modal dialog, loads the first time it opens, and keys pressed meanwhile reach it. Tab stays inside the dialog, Enter chooses OK, Escape cancels, and the grid gets its focus back when it closes. Its styles are in `styles/grid.css`, themed with the widget variables.

- [#1026](https://github.com/chh-ay/sheetwrite/pull/1026) [`7e2efac`](https://github.com/chh-ay/sheetwrite/commit/7e2efacda3cd7a2adc63f1164b166c45acdde5b8) Thanks [@chh-ay](https://github.com/chh-ay)! - A screen reader hears each cell as the grid shows it. The hidden ARIA mirror used to hold the stored value, such as `45351` or `0.125`, where the canvas shows `2024-02-29` or `12.5%`. It now takes the same text as the canvas: the cell's number format from its style or its column, General when it has none, and TRUE or FALSE for a logical. The text comes from the same formatted-text cache, so a paint does no more work.

- [#499](https://github.com/chh-ay/sheetwrite/pull/499) [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11) Thanks [@chh-ay](https://github.com/chh-ay)! - Moving rows or columns (`moveRows`, `moveColumns`) moves the cells, as Excel's Cut and Insert Cut Cells does, and every reference in the workbook follows the cells it names. Before, a move ran as a delete and an insert: references to the moved cells became `#REF!`, and a moved formula read the cells that took its old place. A range loses a moved row or column at its edge and grows by a block that lands inside it, as in Excel, and undo restores the formulas that lost a row or column. A move that would split a table is refused, as in Excel.
  
  The engines add `CellStore.moveRows`, `CellStore.moveCols` and `CellStore.moveLosses`. `CellStore.moveNamedFormulaSource` is removed: the engine moves defined-name formulas itself.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The shell's name box works as Excel's does:
  
  - It takes every cell the grid shows and lets you edit. Before, it refused a cell right of the sheet's own columns, such as `H2` on a sheet with columns A to G, although the grid showed that column and accepted typing in it.
  - It shows and reads the sheet's row numbers, as the row headers do, also while a filter, hidden rows or a view sort change which rows show. Before, it showed and read positions in the view, so under a filter it showed `G3` for the cell in sheet row 6, and `G2:G49` selected 48 shown rows instead of the shown rows among sheet rows 2 to 49. A typed range now selects the rows of it that show; a cell whose row does not show is refused.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The ribbon's Number Format box names the format as Excel does. After Ctrl+Shift+$, %, !, # or @, and after the Percent Style and Comma Style buttons, it shows Currency, Percentage, Number, Date or Time instead of Custom: a code that is not a preset shows the Format Cells category that makes it, and only a code no category makes shows Custom.

- [#734](https://github.com/chh-ay/sheetwrite/pull/734) [`7d12ea7`](https://github.com/chh-ay/sheetwrite/commit/7d12ea7e80c5957289590fe32b6505cb2721d956) Thanks [@chh-ay](https://github.com/chh-ay)! - The ribbon's and toolbar's number-format box shows the format a cell displays: its column's `numberFormat` when no style sets one, as in Excel. Before, a cell in a percentage column showed "General". `getFocusCellStyle()` now includes that column format.

- [#979](https://github.com/chh-ay/sheetwrite/pull/979) [`cc81770`](https://github.com/chh-ay/sheetwrite/commit/cc817704349f299167024fa91702dfa9941a3431) Thanks [@chh-ay](https://github.com/chh-ay)! - A number format's color now paints the number, as in Excel: `#,##0;[Red]-#,##0` shows a negative number in red. The eight color names and `[Color1]` to `[Color56]` from Excel's default palette work, and the color takes priority over the cell's font color. The Sample in Format Cells shows the color too. A condition such as `[Red][<=100]0;[Blue][>100]0` now chooses the section. Before, the color and the condition had no effect.

- [#971](https://github.com/chh-ay/sheetwrite/pull/971) [`2ffafbc`](https://github.com/chh-ay/sheetwrite/commit/2ffafbcd4de32333297370a26fe6ae662a13dbe0) Thanks [@chh-ay](https://github.com/chh-ay)! - A commit does less work when a sync queue holds it and while the grid paints. A sync coordinator without listeners no longer copies each queued commit and its state for events nobody receives, and makes its mutation IDs from a table of hex digits. The undo history keeps a running total of its snapshot bytes instead of adding up all entries on every edit. The screen-reader mirror compares the window with what it wrote last instead of reading every attribute back from the page. Events, IDs, undo limits and the mirror's content do not change.

- [#468](https://github.com/chh-ay/sheetwrite/pull/468) [`8229709`](https://github.com/chh-ay/sheetwrite/commit/82297093792ceda7833750a2896e13fca515b216) Thanks [@chh-ay](https://github.com/chh-ay)! - The pivot field list, dashboard slicers (in the view and in XLSX export), Insert › Chart and the Sort panel's header labels read their source cells in bulk windows instead of one cell at a time. Results are unchanged.

- [#900](https://github.com/chh-ay/sheetwrite/pull/900) [`1e87f54`](https://github.com/chh-ay/sheetwrite/commit/1e87f541ef21ac9f5956a4e4a6b219a38312c66e) Thanks [@chh-ay](https://github.com/chh-ay)! - `SheetwriteError`'s doc comment now says plainly what it is, with the 8 KiB message limit as a note. `createGrid` documents its `opts` parameter, and so do the other exported functions that described only some of their parameters (`createGridFromSnapshot`, `createRibbon`, `createToolbar`, `createNameBox`, `createFormulaBar`, `createSelectionStatus`, `createSpreadsheetShell`, `parseCsv`, `fromCsv`, the XLSX import and export functions, the external link functions, `previewFormula`, `resolveChartView`, `validateWorkbookSnapshot` and `validWorkbookTable`), so editor hovers list every parameter. No behaviour changes.

- [#1228](https://github.com/chh-ay/sheetwrite/pull/1228) [`357de51`](https://github.com/chh-ay/sheetwrite/commit/357de51a2a5b18517fc1e998b4951180fb646e7e) Thanks [@chh-ay](https://github.com/chh-ay)! - Pasting a block of cells is faster. Before a paste applies, Sheetwrite measures the size of the block it builds, and it checked each of the block's values and styles as if a caller might have put a getter on it. The paste built those lists itself, so the measurement now reads them directly, as it already does for `setBlock` input. Pasting 1,000 rows by 10 columns of text takes about half the time.

- [#959](https://github.com/chh-ay/sheetwrite/pull/959) [`6969911`](https://github.com/chh-ay/sheetwrite/commit/696991182d8a891359b891614ee637f3e3c4f22b) Thanks [@chh-ay](https://github.com/chh-ay)! - A paste from Excel keeps the cells in Excel's Text format as text, as Excel does. Excel marks them in the HTML it copies (`mso-number-format:"\@"` or `x:str`); before, a new sheet or an imported column read them as typed entries, so `007` became 7 and a text `1/15/2026` became a date. Such a cell also takes the Text format `@`, except with Paste Values. Plain text from Excel still reads as typed entries, as it does in Excel.

- [#777](https://github.com/chh-ay/sheetwrite/pull/777) [`8811203`](https://github.com/chh-ay/sheetwrite/commit/88112034d5d59304949828810aa7394580a9ae33) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste lands on the top-left cell of the selection, and when the selection is a whole multiple of the copied block the block repeats to fill it, each copy with its own shifted references, as in Excel.

- [#973](https://github.com/chh-ay/sheetwrite/pull/973) [`9d8db5d`](https://github.com/chh-ay/sheetwrite/commit/9d8db5d2fd4bf7e638880707688641c5ef0c0a30) Thanks [@chh-ay](https://github.com/chh-ay)! - A paste that runs past the sheet's last row or column adds the rows and columns it needs, and a moved cut adds the rows it needs, in one undo step, as Excel's sheet holds them. Before, a paste of 2,000 rows into a new sheet of 1,000 rows kept the first 1,000 and dropped the rest without a word, and columns past the last one the grid showed were dropped too. A paste that would end past the sheet's row limit (1,000,000 rows) changes nothing, and the grid says why.

- [#909](https://github.com/chh-ay/sheetwrite/pull/909) [`d8ea533`](https://github.com/chh-ay/sheetwrite/commit/d8ea533663d71ca9892a992a300dac477f0a4a1c) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste and Paste Special apply the limits of pasted text to a table copied as HTML and to a copy from another Sheetwrite grid: 32 MiB, 1,000,000 rows, 16,384 columns and 1,000,000 cells. Before, only plain text had limits, so a web page could put a table of millions of cells on the clipboard.
  
  - The size is checked before the table is parsed, and the rows, columns and cells while it is read.
  - HTML past the limits gives way to the copied text, when the clipboard holds some. Otherwise the paste is refused with `DelimitedTextResourceError`, as too large a text is.
  - A copy from the same grid pastes whatever its size. Its cells are in memory, so only the token at the start of its payload is read.

- [#937](https://github.com/chh-ay/sheetwrite/pull/937) [`7fea1fa`](https://github.com/chh-ay/sheetwrite/commit/7fea1fa40e3e0ce98d9c2cc2180da9f2f6095748) Thanks [@chh-ay](https://github.com/chh-ay)! - A pasted block over a filtered range, or over rows hidden with Hide Rows, writes into consecutive sheet rows from its first cell, the hidden rows included, as Excel's paste does. The grid says "This paste wrote into N hidden rows" with **Show them**. Before, a filter made the block go only into the shown rows, so the same paste changed different cells than in Excel. One copied value pasted over a filtered selection still fills only the shown cells, and under a view sort a block still takes the shown rows.
  
  After such a paste, the context menu's Paste Options row offers **Paste into visible rows only** (new context-menu action `pasteVisibleRows`, `grid.actions.pasteVisibleRows()`, and `grid.canPasteVisibleRows()`): it pastes the same cells again on the shown rows only, as one undo step.
  
  A paste over a filtered range of more than 10,000 cells now writes them all. Before, it wrote nothing and still resolved `"done"`.
  
  A paste the grid refuses (a protected range, the host's admission, or a document limit) now says "Nothing was pasted" and why, and resolves the new `ClipboardOutcome` `"rejected"` instead of `"done"`. Paste into visible rows only is offered only after a paste that applied, and it undoes only that paste.

- [#978](https://github.com/chh-ay/sheetwrite/pull/978) [`16bf225`](https://github.com/chh-ay/sheetwrite/commit/16bf225eddab9cb30e10fa52a8d8c013579759a2) Thanks [@chh-ay](https://github.com/chh-ay)! - Under a view sort, and with Paste into visible rows only, a block taller than the rows left from the selected cell down is refused with a message, instead of being cut off without a word. A refused Paste into visible rows only keeps the paste it would have replaced.

- [#565](https://github.com/chh-ay/sheetwrite/pull/565) [`6525a47`](https://github.com/chh-ay/sheetwrite/commit/6525a470ab709feaa5973916e131782e8dad9e14) Thanks [@chh-ay](https://github.com/chh-ay)! - The pivot field list reads a field's distinct values from the engine in one call over the pivot's source rows, instead of reading the source column in windows. Dashboard pivot outputs and pivot source fields hand their buffers over instead of copying them. Results are unchanged.
  
  - `CellStore.distinctValuesInRows(sheet, col, startRow, endRow, limit)` returns the distinct values of one column over a range of data rows.
  
  Removed: `PivotOutput.kinds()`, `numbers()` and `texts()`; use `takeKinds()`, `takeNumbers()` and `takeTexts()` instead.
  Removed: `PivotFields.names()` and `types()`; use `takeNames()` and `takeTypes()` instead.

- [#1244](https://github.com/chh-ay/sheetwrite/pull/1244) [`9348f26`](https://github.com/chh-ay/sheetwrite/commit/9348f26e6f7adf5fae8cbaac9a163ccdbbc29867) Thanks [@chh-ay](https://github.com/chh-ay)! - Cancel in a pivot value field's Number Format editor gives focus back to the field's menu button. Focus was lost.

- [#670](https://github.com/chh-ay/sheetwrite/pull/670) [`b7d6a66`](https://github.com/chh-ay/sheetwrite/commit/b7d6a66397d7334623c5cd7479a58f53ab0de05b) Thanks [@chh-ay](https://github.com/chh-ay)! - An open PivotTable Fields panel no longer reads the pivot's whole source after every edit. A commit that changes only cells re-reads the source fields only when it writes to a sheet the pivot reads, or when those sheets hold formulas or another pivot's output. Other commits compare the definition and data model as before.

- [#860](https://github.com/chh-ay/sheetwrite/pull/860) [`580ec80`](https://github.com/chh-ay/sheetwrite/commit/580ec80a269124b4cc15b73ee54e6445c7b8a43a) Thanks [@chh-ay](https://github.com/chh-ay)! - Under a filter or sort view, pointing at cells while typing a formula writes sheet references, as Excel does: the cell shown as row 7 is `C7`, not its position in the view. The cell editor's accessible name gives the row number the row header shows.

- [#1032](https://github.com/chh-ay/sheetwrite/pull/1032) [`25f919f`](https://github.com/chh-ay/sheetwrite/commit/25f919f74ce47916dfa2d68f21310e2311595c62) Thanks [@chh-ay](https://github.com/chh-ay)! - The formula preview shows nothing while the formula ends in a name you are still typing, such as `=AVER` while the list offers AVERAGE, instead of `= #NAME?`, as Excel shows no result there.

- [#1329](https://github.com/chh-ay/sheetwrite/pull/1329) [`a06f1c9`](https://github.com/chh-ay/sheetwrite/commit/a06f1c9318a843783a9c149c49b75ca070bb8a81) Thanks [@chh-ay](https://github.com/chh-ay)! - Query column names and query names now count as the same name when they differ only in Unicode form, such as "Ä" typed as one character or as "A" with a combining diaeresis, as table names and headers already do. A query whose output columns differ only that way is refused with `duplicate-column` when it is defined, instead of failing later when a refresh writes its table. Two saved queries named that way are refused as duplicates, and the Power Query export renames the second one.

- [#1052](https://github.com/chh-ay/sheetwrite/pull/1052) [`719ad6e`](https://github.com/chh-ay/sheetwrite/commit/719ad6ea2bcafe607cbae3046ec86e7b0cf830a2) Thanks [@chh-ay](https://github.com/chh-ay)! - Refreshing a saved query writes its table faster. A packed block interns each entry of its style table once, on first use, instead of once per cell, and the queries package lays out the output block without an object per cell. Cells, styles and style ids do not change.

- [#320](https://github.com/chh-ay/sheetwrite/pull/320) [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f) Thanks [@chh-ay](https://github.com/chh-ay)! - Unmounting a React, Vue or Svelte grid destroys it and aborts its pending summaries, lazy chrome, clipboard work and built-in saves without an error event. Late initialization and publication failures from an unmounted or replaced grid are not reported. Shared WASM initialization continues for other mounted grids.
  
  **Upgrade checklist:** treat an `AbortError` from `grid.summarizeSelection()` after unmount as cancellation. Destroy host-created sync and collaboration coordinators yourself when the view is removed.

- [#1086](https://github.com/chh-ay/sheetwrite/pull/1086) [`f6f2ded`](https://github.com/chh-ay/sheetwrite/commit/f6f2dede3688977a9160ed5342ecb430758b2308) Thanks [@chh-ay](https://github.com/chh-ay)! - An edit finds the formulas that read a cell through a range much faster when many ranges share the cell's columns or rows, as a SUM across each row does. The engine's range index now scans the axis that ends first instead of always the columns. On a sheet with a SUM in each of 10,000 rows, one transaction of 300 one-cell edits took 406 ms in the engine before and 3.4 ms after. Results and recalculation order do not change.

- [#628](https://github.com/chh-ay/sheetwrite/pull/628) [`a07effe`](https://github.com/chh-ay/sheetwrite/commit/a07effef4613a3ea6aa7d09189eeaedbb627e320) Thanks [@chh-ay](https://github.com/chh-ay)! - `rebaseDocumentOperations` copies a local operation only when a remote row or column change rewrites it, and the copy shares the cell payloads the rewrite does not touch. Before, it deep-copied every local operation up front, which was almost all of the time it took. The result can now hold your own operation objects, so treat it as read-only. Your operations are still never modified.

- [#974](https://github.com/chh-ay/sheetwrite/pull/974) [`b0745d8`](https://github.com/chh-ay/sheetwrite/commit/b0745d8391375badf5ec0163698c7f1c5e405b0c) Thanks [@chh-ay](https://github.com/chh-ay)! - A paste larger than a paste may be is refused with a plain message that says how large it is, such as "Nothing was pasted: this paste has 16,385 columns, and a paste can have at most 16,384.", and no error reaches the page. `grid.actions.paste()`, `pasteValues()` and `pasteSpecial()` resolve `"rejected"` instead of rejecting, as their docs say.

- [#1240](https://github.com/chh-ay/sheetwrite/pull/1240) [`247cc28`](https://github.com/chh-ay/sheetwrite/commit/247cc28384b3f97f54145471bc562c2b4193e485) Thanks [@chh-ay](https://github.com/chh-ay)! - The Relationships panel checks a relationship's keys before it saves it. It saved the relationship, checked the keys, and undid the save when they did not resolve: that sent the change to collaborators for a moment, left a redo step, and the undo was not tied to the save, so it could undo a different change. A refused relationship is now never committed. The full engine adds `CellStore.relationshipKeyStatus`, which checks the keys of a relationship that is not saved.

- [#1076](https://github.com/chh-ay/sheetwrite/pull/1076) [`8b480d0`](https://github.com/chh-ay/sheetwrite/commit/8b480d03f060628222bad4f0867eae860bb5be8d) Thanks [@chh-ay](https://github.com/chh-ay)! - A remote edit recalculates only the formulas that read the cells it writes. Before, every remote cell edit that a `SyncCoordinator` applied recalculated every formula on its sheet. The engine gains `beginRemoteLoad`, which the store calls for remote operations instead of `beginPageLoad`: their writes still keep cells with an unacknowledged local edit. Snapshot and datasource page loads still recalculate the whole sheet, and so does a remote edit that writes more than about one cell per 64 formulas of its sheet, where that is cheaper. Values do not change.

- [#689](https://github.com/chh-ay/sheetwrite/pull/689) [`04fa4c1`](https://github.com/chh-ay/sheetwrite/commit/04fa4c1008c29d4a2535863f8007aa3a40c95f37) Thanks [@chh-ay](https://github.com/chh-ay)! - Undo of a large clear builds its compressed `restoreBlock` faster: base64 uses the runtime's native `Uint8Array` encoder when it has one, history sizing no longer formats each number as text, and the store no longer re-checks the shape of a block the engine just built. Decoding a received `restoreBlock` also uses native base64 when available and still accepts only the canonical encoding. The wire format and every limit are unchanged.

- [#333](https://github.com/chh-ay/sheetwrite/pull/333) [`8c9bc55`](https://github.com/chh-ay/sheetwrite/commit/8c9bc55a0661ee138e16d7f1594c53bf626c5157) Thanks [@chh-ay](https://github.com/chh-ay)! - Roll back restored pending commits if a later stored record cannot apply. Keep each record's paged acknowledgement revision and preserve user undo history when restore fails.

- [#509](https://github.com/chh-ay/sheetwrite/pull/509) [`21f64aa`](https://github.com/chh-ay/sheetwrite/commit/21f64aa87263d59cb996b0e04da9801a7deceebf) Thanks [@chh-ay](https://github.com/chh-ay)! - A compact or automatic ribbon no longer moves the grid when it arrives. The grid and `createSpreadsheetShell` reserve the height the ribbon will take, compact or full for the host's width, instead of the full height, so on a narrow host the rows below no longer jump up 56 px after the ribbon chunk loads.

- [#1045](https://github.com/chh-ay/sheetwrite/pull/1045) [`fc548cb`](https://github.com/chh-ay/sheetwrite/commit/fc548cbfc5331138197ca7bf0eb90858b214eb87) Thanks [@chh-ay](https://github.com/chh-ay)! - In the full ribbon, a folded group's button names the group on at most two lines, with the same rule as large buttons: a one-letter word or "&" is never left at a line break on its own. At 390 px, "Get & Transform Data" used to wrap onto three lines and run into the caption under it. A folded group no longer shows the caption, as in Excel's narrow ribbon, because the button already names the group. The button's accessible name stays whole.

- [#1142](https://github.com/chh-ay/sheetwrite/pull/1142) [`5e04e20`](https://github.com/chh-ay/sheetwrite/commit/5e04e20b3f6bf60a79abe7b0038591ddfda28d29) Thanks [@chh-ay](https://github.com/chh-ay)! - A ribbon button never shrinks to an icon without its label. As the ribbon narrows, a group's large buttons become small ones with their labels beside them, and a group that still does not fit collapses into one button with the group's icon and name (such as **Show/Hide**), whose dropdown lists its commands in one column with their labels. Groups collapse in the same order as before. If the collapsed groups still do not fit, the last ones move into one **More** button at the end of the row instead of being cut off. The compact ribbon's gear now shows its name, **Shortcuts**, beside the icon. Running a command from a ribbon dropdown closes the dropdown, as in Excel; focus goes where the command leaves it, such as a panel it opens, or else to the grid.

- [#1036](https://github.com/chh-ay/sheetwrite/pull/1036) [`270c1c6`](https://github.com/chh-ay/sheetwrite/commit/270c1c6706ee5e50c7e4fc14fba2b23040df519b) Thanks [@chh-ay](https://github.com/chh-ay)! - Large ribbon buttons no longer leave one letter on a line of its own. A one-letter word is tied to the next word (or to the word before when it ends the label), so Sort A to Z and Sort Z to A break as "Sort" / "A to Z", the way Excel's two-line labels read. Accessible names and tooltips do not change.

- [#901](https://github.com/chh-ay/sheetwrite/pull/901) [`5c1da08`](https://github.com/chh-ay/sheetwrite/commit/5c1da089e5cf34069c34de4bbdde01ef51a67e9e) Thanks [@chh-ay](https://github.com/chh-ay)! - The ribbon no longer cuts a tab label off when the tabs do not fit, as on a 390 px phone. The last tabs move into a **More tabs** menu instead, and picking one brings it into the row. On touch screens (`pointer: coarse`), the ribbon's minimize button, split-button arrows such as Paste options, the sheet tabs with their options and add buttons, and dashboard slicer buttons with Clear are now at least 24 by 24 px (WCAG 2.2 target size). The ribbon and sheet tab bar keep their heights, and mouse layouts keep their density.

- [#1035](https://github.com/chh-ay/sheetwrite/pull/1035) [`7979c26`](https://github.com/chh-ay/sheetwrite/commit/7979c2662d014adec99036f60571b7e39b31bcce) Thanks [@chh-ay](https://github.com/chh-ay)! - The ribbon opens on the Home tab, as Excel does, also when `keyboardSettings` adds the File tab before it. File stays the first tab. It used to open on File and show only Import and Keyboard Shortcuts. When the selected tab disappears, the ribbon also goes back to Home rather than the first tab.

- [#293](https://github.com/chh-ay/sheetwrite/pull/293) [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd) Thanks [@chh-ay](https://github.com/chh-ay)! - In Safari (WebKit), a ribbon or toolbar menu opened from the keyboard stays open. Before, focus on the first menu item scrolled the page, and the scroll closed the menu at once. A page scroll now closes a ribbon or toolbar popup only when its button moves, so a late scroll event for an earlier scroll does not close a menu that just opened.
  
  Ribbon tab and mode changes now finish their layout before the next command can open a menu. A late toolbar size notification no longer closes an open More commands group when its width has not changed. Keyboard menus stay open until dismissed, and Escape returns focus to their button.

- [#474](https://github.com/chh-ay/sheetwrite/pull/474) [`b029afe`](https://github.com/chh-ay/sheetwrite/commit/b029afe02f2a0933a1efb451dcc8cebc4d3773c7) Thanks [@chh-ay](https://github.com/chh-ay)! - At narrow widths the ribbon fades out a tab label cut off by the tab list, so it no longer runs into the Compact button.

- [#776](https://github.com/chh-ay/sheetwrite/pull/776) [`134b277`](https://github.com/chh-ay/sheetwrite/commit/134b2772d91731c18d1d57bb3402342abebfbc09) Thanks [@chh-ay](https://github.com/chh-ay)! - Insert row above or below, Delete row, Insert column left or right, Delete column, Hide rows, Hide columns and Auto-fit rows act on every row or column of the selection, as in Excel, instead of only the active cell's.

- [#1151](https://github.com/chh-ay/sheetwrite/pull/1151) [`aa99f9b`](https://github.com/chh-ay/sheetwrite/commit/aa99f9b3ce6ed2e37febd0391271dd4901fd267d) Thanks [@chh-ay](https://github.com/chh-ay)! - Scrolling a cell into view moves by whole columns and rows, as in Excel and Google Sheets. Arrow keys, Find, the Name Box, a selection change and `grid.scrollToCell` used to stop with the target's far edge at the edge of the view, so the first column or row on screen was cut part way, such as "ger" left of a "Manager" column. Going right or down, they now stop where the first column and row on screen start at their gridlines and the target still shows whole. This holds with frozen panes, hidden columns and rows, and zoom from 50% to 200%. A cell wider or taller than the view shows from its own left or top edge. The scroll area ends up to one column and one row past the last ones, so the last column and row can be reached this way too. Scrolling with a wheel, trackpad or scrollbar still moves by pixels. The visible area now leaves out classic scrollbars, so a target no longer ends under one.

- [#708](https://github.com/chh-ay/sheetwrite/pull/708) [`e031c88`](https://github.com/chh-ay/sheetwrite/commit/e031c884894634abb442915d574a810908e3cd08) Thanks [@chh-ay](https://github.com/chh-ay)! - Paged datasource prefetch follows scroll speed and fetch time. The grid looks ahead by the distance it scrolls during one fetch (from the measured p90 fetch time) plus one view, also sideways when it scrolls across columns, within the paged cache budget. A fling or scrollbar drag fetches around where the view will be when the fetch returns instead of the rows it passes, and cancels requests for rows already passed. The lookahead shrinks as a fling slows down.

- [#1219](https://github.com/chh-ay/sheetwrite/pull/1219) [`00996f2`](https://github.com/chh-ay/sheetwrite/commit/00996f20652e56b91b85629aa7f5b2fdfc24d1e5) Thanks [@chh-ay](https://github.com/chh-ay)! - Selecting a range is faster when a toolbar, a ribbon or an `onCommandStateChange` handler follows the command state. To tell whether Bold, the alignments, Wrap and Border are on, off or mixed, the grid read every selected cell's value and style; on a sheet without a sort, filter or hidden-row view that is not paged, it now asks the engine for the distinct styles of each selected rectangle. Selecting 64 by 64 cells with a command-state handler takes about a third of the time it did.

- [#690](https://github.com/chh-ay/sheetwrite/pull/690) [`b9b17b8`](https://github.com/chh-ay/sheetwrite/commit/b9b17b8f7703f0158be05263ad2e8a8ca2ed3e77) Thanks [@chh-ay](https://github.com/chh-ay)! - `grid.applyTransaction`, `grid.applyRemoteOperations` and `SheetwriteStore.applyTransaction` read each entry of a `setBlock` operation's `block.values` and `block.styleIds` arrays once, by index, into a private copy that validation, the store, history, sync and the `change` event all use. An accessor entry in those two arrays is now read once instead of rejected, and a getter that throws gives a `SheetwriteError` with code `invalid-argument`. Nothing else changes: every other `setBlock` field (including `range`, `formulas`, `refs` and `styleTable`), every other operation type, holes, non-finite numbers and byte limits keep today's validation, and getters there are still rejected without running. Admitting a 1,000,000-cell block no longer reads a property descriptor per cell.

- [#746](https://github.com/chh-ay/sheetwrite/pull/746) [`9e146db`](https://github.com/chh-ay/sheetwrite/commit/9e146db90cee052dabae74e33ca31f57d531cb89) Thanks [@chh-ay](https://github.com/chh-ay)! - A `setBlock` operation taken from a `change` event, an apply result, a permission callback or a sync guard and then sent again is copied again before it is measured. A getter added to an entry of its `block.values` or `block.styleIds` can no longer store a value that `maxEncodedBytes` would reject. A hole in those arrays stays a hole even when `Array.prototype` has that index, and is rejected as before.

- [#683](https://github.com/chh-ay/sheetwrite/pull/683) [`a62346d`](https://github.com/chh-ay/sheetwrite/commit/a62346dc5b6abdcc700ecdae0a5c0aa5a69caab0) Thanks [@chh-ay](https://github.com/chh-ay)! - Row and column inserts are held to the document limits. A transaction whose `addRows` or `addColumns` would pass `maxRowsPerSheet`, `maxColumnsPerSheet`, `maxLogicalCellsPerSheet` or, for a dense sheet, `maxDenseCells` is now rejected with a `resource-limit` issue (`sheet-rows`, `sheet-columns`, `sheet-cells` or `dense-cells`) that names the limit, and nothing changes. Before, a sheet could grow past 1,000,000 rows and then fail to load from its own snapshot, and an insert past the 5,000,000 dense-cell limit was a silent `noop`. Insert Row and Insert Column show the limit in the grid's alert.

- [#784](https://github.com/chh-ay/sheetwrite/pull/784) [`6d0eb4b`](https://github.com/chh-ay/sheetwrite/commit/6d0eb4b53efafe8d5977f6ecc39119741dca3247) Thanks [@chh-ay](https://github.com/chh-ay)! - Renaming a sheet to History, in any case, is refused as in Excel, which reserves that name. `validateSheetName` reports it with the new `SheetNameIssueCode` `reserved`. Adding a sheet still accepts the name, so undo, version restore and workbooks from other programs keep a History sheet.

- [#687](https://github.com/chh-ay/sheetwrite/pull/687) [`7e65201`](https://github.com/chh-ay/sheetwrite/commit/7e652018cbee5a927eaeaf8ac54df3294c74d961) Thanks [@chh-ay](https://github.com/chh-ay)! - `setSheetName` returns whether it named the sheet. Like `renameSheet`, it refuses an empty name, a name another sheet holds in any case, and another sheet's id.

- [#1030](https://github.com/chh-ay/sheetwrite/pull/1030) [`2bd100a`](https://github.com/chh-ay/sheetwrite/commit/2bd100a8f2010cfdd94742df5f19cf433112d862) Thanks [@chh-ay](https://github.com/chh-ay)! - The formula bar's fx label and the shell's status text, with its cell mode, reach 4.5:1 contrast in the light and dark themes. They take the muted text colour (`--sheetwrite-widget-muted`, or the foreground mixed 62% into the background) instead of a lowered opacity, so a host colour for the status is no longer faded further.

- [#1031](https://github.com/chh-ay/sheetwrite/pull/1031) [`54c5ae4`](https://github.com/chh-ay/sheetwrite/commit/54c5ae4134d2d970b4171edf875a553b2337d629) Thanks [@chh-ay](https://github.com/chh-ay)! - On a narrow screen the Add sheet (+) button stays whole and in view. When the sheet tabs and + do not fit, the tab strip scrolls sideways, as Excel's narrow window does: + stays at the strip's right edge, and the active tab scrolls into view beside it. The status keeps its whole word.

- [#932](https://github.com/chh-ay/sheetwrite/pull/932) [`9370965`](https://github.com/chh-ay/sheetwrite/commit/9370965b3fdc3435d72486240a3be547a736014e) Thanks [@chh-ay](https://github.com/chh-ay)! - **Show them** in the notice after a cut over hidden rows also shows the rows Hide Rows hid in the cut and where it landed, not only the rows a filter hides. It is one undo step.

- [#940](https://github.com/chh-ay/sheetwrite/pull/940) [`5afafda`](https://github.com/chh-ay/sheetwrite/commit/5afafdad342a07158d03b896c640fe176846a1f3) Thanks [@chh-ay](https://github.com/chh-ay)! - **Show them**, in the notice after a cut over hidden rows, acts on the sheet of the cut or paste, also after a switch to another sheet. Before, it showed rows on the sheet active at the click.

- [#1063](https://github.com/chh-ay/sheetwrite/pull/1063) [`e1a40e8`](https://github.com/chh-ay/sheetwrite/commit/e1a40e8e7621c429c82a2a83a79773ee92df6018) Thanks [@chh-ay](https://github.com/chh-ay)! - Scrolling sideways does less work per frame, most visibly in Firefox. The canvas reuses the columns still on screen and paints only the ones a scroll brings in, as it already did for rows. While text in view spills into an empty cell or a cell in view has a border, a sideways scroll still repaints the whole canvas, so every frame matches a full repaint pixel for pixel. The screen-reader mirror keeps the cells of the rows and columns that stay in view and only adds and removes the ones that enter or leave, instead of rebuilding or rewriting every cell, and it is laid out on its own (`contain: strict`), so its changes no longer lay out the page around the grid. What the canvas shows and what the mirror holds do not change.

- [#571](https://github.com/chh-ay/sheetwrite/pull/571) [`698c8ae`](https://github.com/chh-ay/sheetwrite/commit/698c8ae546cf11cf40fdf96ce222c1b788800794) Thanks [@chh-ay](https://github.com/chh-ay)! - Snapshot hydration, datasource pages and transaction writes pass a block's text cells to the engine as one UTF-8 buffer instead of one JavaScript string per cell. Results are unchanged.
  
  Removed: the `texts: string[]` argument of `CellStore.setSparseBlock`; pass `textBuf` and `textOffsets`, as `setBlockPacked` takes them, instead.

- [#630](https://github.com/chh-ay/sheetwrite/pull/630) [`b30a7ee`](https://github.com/chh-ay/sheetwrite/commit/b30a7ee367a0fcc5bdfea6a1cc177e29d5c64eb3) Thanks [@chh-ay](https://github.com/chh-ay)! - Resizing a row no longer costs time or memory for every row of the sheet (part of [#625](https://github.com/chh-ay/sheetwrite/issues/625)). Row geometry keeps only the rows whose height differs from the default, so the first resized row of a 1,000,000-row sheet no longer allocates 16 MB. A committed height change, its undo, and a cancelled resize drag update the row index in place instead of rebuilding it. Heights set one row at a time, such as `setRowHeight` in a loop or remote changes arriving one by one, are merged into the index once before it is next read, so setting 100,000 heights one by one takes about 2 seconds instead of 5 minutes. Row positions, hit tests and painted heights are unchanged.

- [#352](https://github.com/chh-ay/sheetwrite/pull/352) [`a1444f0`](https://github.com/chh-ay/sheetwrite/commit/a1444f00af111dd7921130f2e28fd1374a594eee) Thanks [@chh-ay](https://github.com/chh-ay)! - Keep values typed, filled, pasted, or received from collaborators inside a dynamic-array spill. The value blocks the anchor with `#SPILL!`; clearing it restores the array. Preserve source-only undo and redo, and reject child-only cuts before replacing the clipboard. Document spill editing rules and the view-only sort and filter difference from Excel.

- [#1109](https://github.com/chh-ay/sheetwrite/pull/1109) [`965dcaf`](https://github.com/chh-ay/sheetwrite/commit/965dcaf0f897000498f5b6784d1f433ff9b2d115) Thanks [@chh-ay](https://github.com/chh-ay)! - The shell's status bar shows Average and Sum in the number format of the active cell, as Excel does: `Sum: $736,610` for a selection that starts on a `$#,##0` cell. Without a format they stay in Excel's General display, such as `Average: 61384.16667`. Before, they always showed in General.

- [#1123](https://github.com/chh-ay/sheetwrite/pull/1123) [`606b430`](https://github.com/chh-ay/sheetwrite/commit/606b430886853ba74834c1aa4474e1f5c190eb33) Thanks [@chh-ay](https://github.com/chh-ay)! - The shell's status line no longer draws over the sheet tabs or runs out of its row. When the row is too narrow, the tab strip narrows and scrolls first, down to half the row (or its own width, if less). Only then does the status drop whole parts: the selection size first, then the records found and the undo step, then Count, then Average. Sum stays longest, and the cell mode ("Ready") always stays. Screen readers still hear the whole line.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The spreadsheet shell's status bar names a selected row by its sheet row, as the row headers do, under a filter or hidden rows; before, it gave the row's place in the view. `describeSelection(selection, sheetRowOf?)` takes the mapping, such as `grid.sheetRowOf`.

- [#1238](https://github.com/chh-ay/sheetwrite/pull/1238) [`22968a0`](https://github.com/chh-ay/sheetwrite/commit/22968a0aa6220bb540ff71c59da8558d75994dbf) Thanks [@chh-ay](https://github.com/chh-ay)! - A `setSheetMeta` operation whose conditional format has a `stopIfTrue` that is not a boolean is now rejected, as it already was in a snapshot. Snapshots and operations check a conditional format with the same function.

- [#1175](https://github.com/chh-ay/sheetwrite/pull/1175) [`21a79cf`](https://github.com/chh-ay/sheetwrite/commit/21a79cfdc1b273a724c5eda04404565f3741cf67) Thanks [@chh-ay](https://github.com/chh-ay)! - A new store starts faster again: with default limits it no longer copies them, its resource counters are made when first used, it checks the workbook's tables once, and it makes no engine call to set default storage limits or an empty data model. On the paged startup benchmark (1,000,000 rows) the store is now built faster than in 0.6.1.

- [#1167](https://github.com/chh-ay/sheetwrite/pull/1167) [`848acab`](https://github.com/chh-ay/sheetwrite/commit/848acab120e56b4a48b7c4fa373e923e4fe2d68d) Thanks [@chh-ay](https://github.com/chh-ay)! - A new store starts faster. It no longer sends a sheet's spill blockers or hidden rows to the engine when the sheet has none, builds the data validation reads on the first edit that needs them, and resolves its snapshot limits once. On the paged startup benchmark (1,000,000 rows) the store is built about 17% faster than in 0.7.0.

- [#300](https://github.com/chh-ay/sheetwrite/pull/300) [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e) Thanks [@chh-ay](https://github.com/chh-ay)! - A row or column insert that a sheet cannot hold changes nothing. `addRows`, `removeRows`, `insertCols` and `removeCols` return `false` for a dense sheet that would pass its cell limit or a row count that overflows, and the store rejects the operation instead of moving formulas, charts or metadata for cells that did not move. `addPagedSheet` throws for a chunk size above 1048576 rows.

- [#1344](https://github.com/chh-ay/sheetwrite/pull/1344) [`6109cca`](https://github.com/chh-ay/sheetwrite/commit/6109ccad2da26e57ee2d0ddab61c523bf22e26ed) Thanks [@chh-ay](https://github.com/chh-ay)! - The ribbon, toolbar, sheet tab, context menu, chart and panel rules in the stylesheet now end in a class (or, for a host's `<svg>` icon, in `svg`) instead of an `:is()` list or a bare `:disabled`. Browsers checked those rules against every element they restyled, the cell editor included; now only the elements they can match check them, so opening and committing the cell editor restyles less. Every computed style stays the same.

- [#668](https://github.com/chh-ay/sheetwrite/pull/668) [`a955cb7`](https://github.com/chh-ay/sheetwrite/commit/a955cb71183f0797384dd5d43dd03e476207e661) Thanks [@chh-ay](https://github.com/chh-ay)! - Acknowledging a queued commit costs the same at any queue depth. Before, every acknowledgement moved the rest of the pending queue, so draining a deep offline queue grew with the square of its length.

- [#1079](https://github.com/chh-ay/sheetwrite/pull/1079) [`7b3504a`](https://github.com/chh-ay/sheetwrite/commit/7b3504a2e428db4edb2d6116857ba4fbed95b1ce) Thanks [@chh-ay](https://github.com/chh-ay)! - The sheet-tab bar is one step bigger, the same in the shell and in the grid's own tab bar. The tab names, the ⋯ menu, the + button and the shell's status text use the theme's cell font one step up the type scale (13 px cells give 14 px text), the + and ⋯ icons grow with that text, and the bar is 30 px tall instead of 28 px, with the same padding. The grid area above it is 2 px shorter. The shell's bottom row reads the new `--sheetwrite-tab-font` custom property, which the shell and the grid seed from the theme.

- [#1123](https://github.com/chh-ay/sheetwrite/pull/1123) [`606b430`](https://github.com/chh-ay/sheetwrite/commit/606b430886853ba74834c1aa4474e1f5c190eb33) Thanks [@chh-ay](https://github.com/chh-ay)! - The sheet-tab bar's + and ⋯ icons line up with the tab names. They sat high, centred on their button box. Now their centre is the tab text's optical centre, the middle of the lowercase letters, in the shell's bar and the grid's own bar.

- [#1136](https://github.com/chh-ay/sheetwrite/pull/1136) [`18bd1c3`](https://github.com/chh-ay/sheetwrite/commit/18bd1c3742eb5acb3e521ceea63e5fb1ca4289aa) Thanks [@chh-ay](https://github.com/chh-ay)! - When the sheet tabs do not fit their bar, scroll arrows show at its edges, as in Excel. Each arrow brings the next hidden sheet into view, and the one at the end reached is dimmed. A right-click on either, a long press on a touch screen, or the context menu key (Shift+F10) opens a list of every sheet; choosing one activates it. The arrows have accessible names and tooltips and are at least 24 px, in the shell and in the grid's own tab bar.

- [#830](https://github.com/chh-ay/sheetwrite/pull/830) [`74f7c3c`](https://github.com/chh-ay/sheetwrite/commit/74f7c3c560f80f1707b9532c1d4178024b882af3) Thanks [@chh-ay](https://github.com/chh-ay)! - The command toolbar paints its final row from the first frame. When a command it holds was unavailable, such as Import XLSX with no XLSX add-on, the command was hidden at once but its separator stayed until the next animation frame, and then the items after it moved 7 to 9 px: a layout shift on every page that shows the toolbar. The toolbar now fits its row as soon as a command's availability changes.

- [#783](https://github.com/chh-ay/sheetwrite/pull/783) [`1f40b17`](https://github.com/chh-ay/sheetwrite/commit/1f40b173281d416773558b9daa9c926195f50e60) Thanks [@chh-ay](https://github.com/chh-ay)! - Undo and redo select the cells they change on the active sheet and scroll to them, as in Excel. Undoing a row, column or object edit leaves the selection as it was.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Undo and redo show changes on other sheets, as in Excel. A step that changes cells only on another sheet makes that sheet active and selects the cells, instead of changing them out of sight. Each sheet keeps its selection and scroll position when you switch away and back, a sheet shown for the first time has A1 selected, and clicking a sheet tab gives the keyboard to the sheet, so Ctrl+Z works at once.

- [#913](https://github.com/chh-ay/sheetwrite/pull/913) [`12be563`](https://github.com/chh-ay/sheetwrite/commit/12be5639408dc351479b6a9d8fa5366cee533f05) Thanks [@chh-ay](https://github.com/chh-ay)! - Data validation reads each list source once per check. Before, each list rule read its source again, one cell at a time, for each checked cell, and a typed entry was checked twice. With 300 list rules over a column, one entry read about 20 million cells, and a fill took minutes.
  
  - The grid's check of an entry and the store's check when it is written are one check, as are the checks of a paste that keeps the target's rules. Each reads a source with one window read and compares an entry with a set of its items.
  - A sheet holds at most 1,000 validation rules, exported as `MAX_VALIDATION_RULES`. The XLSX reader drops the rules past it with a `validation-loss` warning. Snapshots past it are refused, and so is an operation that would add a rule past it, from this grid or a peer.
  - A transaction's data validation has a budget, counted in rule tests, list cells read and formula results. A transaction that needs more is refused with a `resource-limit` issue whose `resource` is `"validation-checks"`.

- [#1168](https://github.com/chh-ay/sheetwrite/pull/1168) [`96c3f3c`](https://github.com/chh-ay/sheetwrite/commit/96c3f3cf6dfe689aefb18751b827db7b2a312634) Thanks [@chh-ay](https://github.com/chh-ay)! - Filtering a column by a long list of picked values is faster. The picked values are copied one by one instead of through JSON text, and the transaction measures the copy in one pass. On 100,000 rows, a filter that picks 50,000 values takes about 70% less time.

- [#1227](https://github.com/chh-ay/sheetwrite/pull/1227) [`c3f24ed`](https://github.com/chh-ay/sheetwrite/commit/c3f24edf61628d09a523bb4fa7bf9fa09ebdf962) Thanks [@chh-ay](https://github.com/chh-ay)! - Finding the view row of a data row on a sorted or filtered sheet is faster. `viewRowOf` looked up the sheet's view order before its inverse index on every call; it now goes straight to the index, which exists only while the order does. A lookup on a sorted sheet of a million rows takes about a third less time.

- [#545](https://github.com/chh-ay/sheetwrite/pull/545) [`a3f6eed`](https://github.com/chh-ay/sheetwrite/commit/a3f6eeddd43db9bbad23bb4d73ecef1f850d0f4f) Thanks [@chh-ay](https://github.com/chh-ay)! - In Safari, choosing a hidden sheet from the sheet tabs' Unhide menu now unhides it. Safari does not focus a button when you press it, so the press moved focus out of the menu and closed it before the click. The Unhide menu and the sheet options menu now keep focus where it is during a press, and a custom cell editor stays open when you press one of its own buttons.

- [#356](https://github.com/chh-ay/sheetwrite/pull/356) [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e) Thanks [@chh-ay](https://github.com/chh-ay)! - Write cell formulas with Excel's future-function and local-binding prefixes, including LET, LAMBDA, XLOOKUP, FILTER and SORT, and remove those prefixes on import. Cells and defined names now share the engine converter, including the A1# spill spelling.
  
  Convert each workbook's distinct formulas in one batch instead of crossing the JavaScript-to-WASM boundary for every cell. Reuse an initialized engine or retire a temporary conversion instance. Formula-free workbooks, including workbooks with only range names, do not load an engine.

- [#1331](https://github.com/chh-ay/sheetwrite/pull/1331) [`615d45a`](https://github.com/chh-ay/sheetwrite/commit/615d45a7a39487f59d3d0e8eddf5f4662e63bd75) Thanks [@chh-ay](https://github.com/chh-ay)! - Loading `@sheetwrite/xlsx` without the grid is faster and uses less memory: the codec takes the core values it needs from the internal `@sheetwrite/core/codec` entry point instead of the main entry point, so it no longer loads the grid, the canvas painters and the rest of the UI. A process that only converts or refuses XLSX files loads 83 modules instead of 198.

- [#914](https://github.com/chh-ay/sheetwrite/pull/914) [`39467cc`](https://github.com/chh-ay/sheetwrite/commit/39467ccb6246ac0ad1d8e3cc8598ca01ad856185) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export now marks formulas whose result is an array, such as `=SEQUENCE(3)`, `=FILTER(...)` or `=A1:A3`, as Excel dynamic arrays, so Excel spills them instead of showing `=@SEQUENCE(3)` and one value. Each such cell gets `cm="1"` and `<f t="array">`, and the workbook gets the `xl/metadata.xml` part, as Excel 365 writes them. Exporting a grid also writes each spill's range and the values it shows in the cells it covers. Formulas with one value stay plain, and a workbook without array formulas has no metadata part.
  
  XLSX import reads Excel's dynamic arrays as formulas that spill again, without the cached values of the cells they cover. Legacy array formulas (Ctrl+Shift+Enter, `t="array"` without `cm`) are still kept as text with a warning.
  
  The engines have two new exports for this: `xlsxArrayFormulas` and the `CellStore` method `spillRanges`. Core's `XlsxFormulaEngine` has the matching `arrayFormulas(formulas)`.

- [#645](https://github.com/chh-ay/sheetwrite/pull/645) [`e1aee47`](https://github.com/chh-ay/sheetwrite/commit/e1aee47c3fc41125af446ef8223206ec15e94d55) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export and import skip the external-workbook formula scan for formulas that cannot name another workbook or call a live external-data function. Export of 100,000 formulas is about 6% faster ([#624](https://github.com/chh-ay/sheetwrite/issues/624)).

- [#1066](https://github.com/chh-ay/sheetwrite/pull/1066) [`6d8ed2a`](https://github.com/chh-ay/sheetwrite/commit/6d8ed2ae2754752e924af76e934590e80648ae07) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX import parses worksheet XML faster. Text and attribute values are counted against `maxXmlTextBytes` only when they could pass it, and text with only the five predefined XML entities is decoded in one pass. The limits, errors and imported values do not change.

- [#1051](https://github.com/chh-ay/sheetwrite/pull/1051) [`44692b9`](https://github.com/chh-ay/sheetwrite/commit/44692b9f0fe8fa3295aa5d735cef747cd9f0e1fe) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX import is faster: the reader checks the snapshot it builds with direct reads instead of proving every field of its own objects again, with the same schema, reference and size checks. Snapshot validation also accepts plain cells without building paths or reading property descriptors a second time. Core gains an internal `@sheetwrite/core/codec` entry point for Sheetwrite's own codecs, with no compatibility promise.

- [#641](https://github.com/chh-ay/sheetwrite/pull/641) [`0e7fcde`](https://github.com/chh-ay/sheetwrite/commit/0e7fcdeeb5fbd27e9f36b13d7448368b5bc2053b) Thanks [@chh-ay](https://github.com/chh-ay)! - Batch XLSX formula conversion now passes one joined string and cumulative UTF-16 ends into the engine and returns only the changed formulas. Unchanged strings stay in JavaScript, which removes the per-formula WASM string transfer cost on XLSX export ([#624](https://github.com/chh-ay/sheetwrite/issues/624)).
  
  Breaking for direct engine callers: `convertXlsxFormulas(sources, exporting)` becomes `convertXlsxFormulas(sources.join(""), ends, exporting, changedIndices)`. Each end is the sum of JavaScript string lengths through that source, so a surrogate pair counts as two units. `changedIndices` is a `Uint32Array` with at least one slot per source; the call returns only the changed formulas and writes their input positions to the front of `changedIndices`. Empty input passes `""` and empty arrays.
  
  Before:
  
  ```js
  const converted = engine.convertXlsxFormulas(sources, true);
  ```
  
  After:
  
  ```js
  let end = 0;
  const ends = Uint32Array.from(sources, (source) => (end += source.length));
  const changedIndices = new Uint32Array(sources.length);
  const changed = engine.convertXlsxFormulas(sources.join(""), ends, true, changedIndices);
  const converted = sources.slice();
  changed.forEach((formula, position) => { converted[changedIndices[position]] = formula; });
  ```
  
  The scalar `formulaToXlsx` and `formulaFromXlsx` exports are removed. Use the batch call with one source, `exporting` set to `true` or `false`, and keep the source when the result is empty. Core's `XlsxFormulaEngine.convert` keeps its array interface.

- [#496](https://github.com/chh-ay/sheetwrite/pull/496) [`380f3d5`](https://github.com/chh-ay/sheetwrite/commit/380f3d5a3fac92da7e0389c099a8f27d91e5b90e) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes the current output of a pivot it keeps in Sheetwrite metadata, such as a pivot over the data model with measures, as cells at the pivot's place with its number formats, so Excel shows the values ([#495](https://github.com/chh-ay/sheetwrite/issues/495)). Sheetwrite reopens the pivot live, removing those cells on import unless another application changed them. The pivot keeps its one export warning, which now says its values were written as cells.

- [#908](https://github.com/chh-ay/sheetwrite/pull/908) [`4e6989c`](https://github.com/chh-ay/sheetwrite/commit/4e6989c522f02db312f4be99696e7c5c3d18900c) Thanks [@chh-ay](https://github.com/chh-ay)! - An XLSX file with a data validation formula longer than 255 characters now opens. Excel keeps these formulas within 255 characters, but other tools write longer ones. The reader drops such a rule with a `validation-loss` warning, as it drops a conditional format whose formula is too long. Before, the whole import failed with "imported invalid workbook snapshot". `@sheetwrite/core` exports the limit as `MAX_VALIDATION_FORMULA_LENGTH`.

- [#1092](https://github.com/chh-ay/sheetwrite/pull/1092) [`b76badc`](https://github.com/chh-ay/sheetwrite/commit/b76badc89481ced587534f2f7f69480d88d9c118) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export takes a `compression` option. The default, `"deterministic"`, keeps the bundled `fflate` codec and the same bytes as before in every runtime. `"native"` compresses with the runtime's `CompressionStream` where it has one: export is faster, the file holds the same parts, but the compressed bytes differ between runtimes.

- [#322](https://github.com/chh-ay/sheetwrite/pull/322) [`487e7f7`](https://github.com/chh-ay/sheetwrite/commit/487e7f7262f7fccd92f3d8a213be8130ce525861) Thanks [@chh-ay](https://github.com/chh-ay)! - Workbook import expands shared formulas in the engine, with its copy rule, the one that paste and fill use (part of [#250](https://github.com/chh-ay/sheetwrite/issues/250)). Import still works before `initSheetwrite()`: it borrows an initialized engine or uses a temporary one, as formula conversion does. Expanded formulas change where the old rule differed:
  
  - Whole columns and rows move: a shared `=SUM(A:A)` one column right is `=SUM(B:B)`. Before, it stayed `=SUM(A:A)`.
  - A reference moved past `XFD` or row 1048576 is `#REF!`, as is a range with any corner off the sheet: `=SUM(#REF!)` instead of `=SUM(#REF!:A1)`.
  - A name past the last column, such as `XYZ1`, stays a name.
  
  A shared-formula master that the engine's lexer cannot read has no copy rule. Each other cell of its group then keeps the formula text its writer stored on it, if any, and otherwise the master's text. Import reports an `unsupported-feature` warning for each such cell.
  
  `withXlsxFormulaEngine` in `@sheetwrite/core` replaces the unreleased `convertXlsxFormulas`. It runs a callback with the engine's formula conversion, lexer check and copy rule in one engine session.

- [#1335](https://github.com/chh-ay/sheetwrite/pull/1335) [`efa9ffa`](https://github.com/chh-ay/sheetwrite/commit/efa9ffa33ac37f67c3f39bb01500e9358e6660ed) Thanks [@chh-ay](https://github.com/chh-ay)! - An Excel data model whose connection names a worksheet table in another Unicode form, such as "Ä" typed as one character or as "A" with a combining diaeresis, now finds that table, so its relationships are imported. The XLSX reader compares every table name with core's table-name key (NFC, then letter case ignored), which the internal `@sheetwrite/core/codec` entry point now exports.

- [#1131](https://github.com/chh-ay/sheetwrite/pull/1131) [`d5fd97a`](https://github.com/chh-ay/sheetwrite/commit/d5fd97aef4b81146f8f94950f932a49cbd433ba1) Thanks [@chh-ay](https://github.com/chh-ay)! - At zoom, the AutoFilter button, its room to the gridline and to the header text, the list validation arrow, the note marker and the space between cell text and the gridlines scale with the sheet, as in Excel. Before, they kept their 100% size while the text grew. The cell editor keeps the same text padding as the painted cell at every zoom.
- Updated dependencies: @sheetwrite/wasm@0.7.0

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
