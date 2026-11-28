# @sheetwrite/charts

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

- [#503](https://github.com/chh-ay/sheetwrite/pull/503) [`55bffb1`](https://github.com/chh-ay/sheetwrite/commit/55bffb17ed553f16f652aaed03f2cbd87b27970d) Thanks [@chh-ay](https://github.com/chh-ay)! - Charts draw multi-level category labels, as Excel does ([#501](https://github.com/chh-ay/sheetwrite/issues/501)).
  
  - A category range of several rows and several columns holds one category level per column (per row when the values run along a row). The last column labels each point. `ChartSeriesView.categoryLevels` holds the outer levels, outermost first, each with `labels` and `formats`; a blank cell continues the group above it. `categories` stays the innermost level, so charts with one level do not change.
  - A chart over a pivot with more than one row field gets its outer row fields as outer levels. `categories` holds the leaf items, not the joined `East / Retail` label.
  - The renderer draws one row of labels per level: each outer label once, centered under its group, with lines between categories and groups. Crowded inner labels turn to read upward, and outer labels wrap. In bar charts the outer labels stand left of the inner labels and read upward.
  - `ChartDefinition.axes.multiLevelLabels: false` draws one row of labels, each the text of its levels from the outside in (Excel's Format Axis › Multi-level Category Labels, cleared). The Chart panel has a **Multi-level category labels** check box when the categories have levels.
  - XLSX writes category levels as `c:multiLvlStrRef` and reads them back; `c:noMultiLvlLbl` round trips. A chart over a pivot now reads the cells that hold the pivot's values, with the values as its cache: over a native worksheet PivotTable it is that table's PivotChart (`c:pivotSource`), and over a dashboard pivot item it reads the item's cells. Without such cells it keeps literal data; category levels then have the formula `#REF!` and the labels in their cache.

### Patch Changes

- [#715](https://github.com/chh-ay/sheetwrite/pull/715) [`453b5c5`](https://github.com/chh-ay/sheetwrite/commit/453b5c5a8864771c7eeb03df279b9899bb28f227) Thanks [@chh-ay](https://github.com/chh-ay)! - Bar charts and scatter charts space the labels on their horizontal value axis by the width of the widest label, so neighbouring labels no longer overlap on wide charts. A horizontal axis with long labels, such as currency amounts in millions, gets fewer ticks; on a chart too small for even that, only every n-th label is drawn, as on category axes. Scatter charts also leave room for their last x-axis label.

- [#486](https://github.com/chh-ay/sheetwrite/pull/486) [`17a6846`](https://github.com/chh-ay/sheetwrite/commit/17a6846fff10713dcc50171c9a67cd1e2a4fc997) Thanks [@chh-ay](https://github.com/chh-ay)! - The value axis uses the number format of the first series, as Excel's "linked to source" axis does. A General first series keeps General ticks when a later series is a percentage.

- [#1019](https://github.com/chh-ay/sheetwrite/pull/1019) [`c4eadd7`](https://github.com/chh-ay/sheetwrite/commit/c4eadd78d65860b9f07b4d715b27c11dab85027b) Thanks [@chh-ay](https://github.com/chh-ay)! - A column, line or area chart keeps its first and last category labels over the plot. When a label is wider than its category, the first one used to run left into the value axis's lowest label ($0). The labels shown keep one spacing along the axis.

- [#629](https://github.com/chh-ay/sheetwrite/pull/629) [`fbe3a80`](https://github.com/chh-ay/sheetwrite/commit/fbe3a80f511e792cc2d829a8eb776f5da5a7f479) Thanks [@chh-ay](https://github.com/chh-ay)! - Resolving a chart and tracking which charts a commit changes cost less. `resolveChartView` looks sheets up in the store's sheet index instead of building a map of every sheet for each chart, and `ChartView.chart` is now the store's own definition instead of a deep copy, typed with the new `ReadonlyChartDefinition` (read-only all the way down), so TypeScript rejects a write into it. Development builds (`NODE_ENV=development`) freeze it, so a write from JavaScript throws. To edit a chart, copy the definition (for example with `structuredClone`) and commit it with `setChart`. Code that passed `view.chart` where a mutable `ChartDefinition` is expected needs that copy. The change tracker marks each chart once per commit in one array instead of building per-sheet sets.

- [#1064](https://github.com/chh-ay/sheetwrite/pull/1064) [`a7203bf`](https://github.com/chh-ay/sheetwrite/commit/a7203bf0848ef54a106869e1144fc87e011a348d) Thanks [@chh-ay](https://github.com/chh-ay)! - A column or bar chart with more categories than pixels along its category axis draws each series as one path that holds all its bars, with the same geometry. A chart of three 10,000-point series redraws after an edit in a fraction of the time, because the page holds three shapes instead of 30,000 rectangles.

- [#723](https://github.com/chh-ay/sheetwrite/pull/723) [`1005f29`](https://github.com/chh-ay/sheetwrite/commit/1005f295db87041f47ceb762629bcb9160bf4e68) Thanks [@chh-ay](https://github.com/chh-ay)! - The API reference describes `ChartSize` and what `renderChartSvg` returns.

- [#1336](https://github.com/chh-ay/sheetwrite/pull/1336) [`412c995`](https://github.com/chh-ay/sheetwrite/commit/412c995674becd8a3d4916a3b42edb85f7eb2ea8) Thanks [@chh-ay](https://github.com/chh-ay)! - An add-on whose code chunk fails to load, for example after a dropped network request, now loads it again on the next use instead of failing for the rest of the page's life. The XLSX call that started the failed load rejects with the load error, and the next XLSX call loads the codec again. The charts add-on reports the failure with a console warning instead of an unhandled promise rejection; the chart mounted during the failed load stays empty, and the next chart loads the drawing code again.

- [#728](https://github.com/chh-ay/sheetwrite/pull/728) [`e229d06`](https://github.com/chh-ay/sheetwrite/commit/e229d066d96bef3b78f4eabf19e2d2a903d10f40) Thanks [@chh-ay](https://github.com/chh-ay)! - Scatter charts no longer draw their first x-axis label into the lowest y-axis label where the two axes meet. The first x label starts at the left edge of the plot, and is left out when it would then reach the next x label.
- Updated dependencies: @sheetwrite/core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`c29a25a`](https://github.com/chh-ay/sheetwrite/commit/c29a25a65c4ff01ae32ad89fc6b32dde4798ffde)]:
  - @sheetwrite/core@0.6.1

## 0.6.0

### Minor Changes

- b159a35: Draw charts as SVG: column, bar, line, area, pie, doughnut and scatter, with axes in the source cells' number formats, titles and a legend. Empty and non-numeric cells are gaps; a truncated or deleted source shows a note. Dense line, area and scatter series keep the lowest and highest value in each pixel, so 10,000 points draw fast. Each chart is an image named by its title and kind, and it redraws only when its own data changes. `registerChartsBackend()` now registers the renderer as well as the live views.
- d99f762: Add the optional `@sheetwrite/charts` package. `createChartViewCache(store)` gives a chart renderer the resolved data for the charts in a workbook. `get({ sheet, id })` returns the `ChartView` for a chart, or `null` when the sheet has no chart with that ID. The cache reads the cells on the first `get` only, and keeps the view until an edit changes that chart. `subscribe(listener)` tells you which charts changed. The cache removes the old views before it calls the listeners, so `get` in a listener returns the new data. Edits to other cells do not call the listener. `dispose()` stops the cache. Core does not depend on this package, and the package does not draw charts.
  
  Import `@sheetwrite/charts/register`, or call `registerChartsBackend()`, to make core's `openChartViews(store)` return these chart views. The root entry does not register anything.

### Patch Changes

- Updated dependencies [cbcf0b8]
- Updated dependencies [81e45e3]
- Updated dependencies [92dcd37]
- Updated dependencies [d99f762]
- Updated dependencies [b159a35]
- Updated dependencies [b159a35]
- Updated dependencies [b159a35]
- Updated dependencies [92dcd37]
- Updated dependencies [92dcd37]
- Updated dependencies [b6f333c]
- Updated dependencies [8d70aae]
- Updated dependencies [9dc3ab1]
- Updated dependencies [03ad409]
- Updated dependencies [286ac93]
- Updated dependencies [ec8e0ee]
- Updated dependencies [0b5cc2d]
- Updated dependencies [ec8e0ee]
- Updated dependencies [78665d3]
- Updated dependencies [60590f9]
- Updated dependencies [c56a350]
- Updated dependencies [c0f9c00]
- Updated dependencies [0f36fda]
- Updated dependencies [92dcd37]
- Updated dependencies [c56a350]
- Updated dependencies [3bdb073]
- Updated dependencies [ec8e0ee]
- Updated dependencies [bcfe991]
- Updated dependencies [bcfe991]
- Updated dependencies [2984b0b]
- Updated dependencies [5308206]
  - @sheetwrite/core@0.6.0
