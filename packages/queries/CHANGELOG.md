# @sheetwrite/queries

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

- [#370](https://github.com/chh-ay/sheetwrite/pull/370) [`033843c`](https://github.com/chh-ay/sheetwrite/commit/033843c35626fbad5bc21a8a1173983ebcd585cc) Thanks [@chh-ay](https://github.com/chh-ay)! - Add the optional headless query engine. Rust parses host-owned CSV and JSON bytes
  and runs filter, select, rename, change type, sort-merge join, sorted grouping,
  and mixed-type unpivot steps over typed column arrays.
  
  The query artifact loads only on demand. Typed buffers preserve nulls and cell
  errors, fatal failures return structured diagnostics, and expanding operations
  check resource limits. The engine does not fetch data or store credentials. The
  default and full formula engine artifacts are unchanged.

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

- [#383](https://github.com/chh-ay/sheetwrite/pull/383) [`5e9ba79`](https://github.com/chh-ay/sheetwrite/commit/5e9ba79d2fc0eb562fde68a2261f3633d678bd3a) Thanks [@chh-ay](https://github.com/chh-ay)! - Save refreshable queries in the workbook. `workbook.queries` holds each query's
  source, steps and output table. The undoable, synced `setQuery` and `removeQuery`
  operations change them. `createQuerySession(grid, { fetchSource })` checks
  definitions in the query engine. It refreshes one query, or all queries, as one
  undoable transaction that writes the output tables. Sources load only through the
  host callback. CSV records with fewer fields than the declared columns have null
  in the missing columns, and extra fields are ignored, as in Power Query's
  `Csv.Document`.

### Patch Changes

- [#724](https://github.com/chh-ay/sheetwrite/pull/724) [`e4890e6`](https://github.com/chh-ay/sheetwrite/commit/e4890e6389937780f9a237cbbf3f9f6e6fcf59ed) Thanks [@chh-ay](https://github.com/chh-ay)! - The API reference describes the query limits and their defaults, diagnostics, mixed-column lanes, batches, inputs, `QueryError`, the session and fetch options, and what the loaders return.

- [#1052](https://github.com/chh-ay/sheetwrite/pull/1052) [`719ad6e`](https://github.com/chh-ay/sheetwrite/commit/719ad6ea2bcafe607cbae3046ec86e7b0cf830a2) Thanks [@chh-ay](https://github.com/chh-ay)! - Refreshing a saved query writes its table faster. A packed block interns each entry of its style table once, on first use, instead of once per cell, and the queries package lays out the output block without an object per cell. Cells, styles and style ids do not change.
- Updated dependencies: @sheetwrite/core@0.7.0
