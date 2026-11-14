# @sheetwrite/xlsx

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

- [#480](https://github.com/chh-ay/sheetwrite/pull/480) [`8298eda`](https://github.com/chh-ay/sheetwrite/commit/8298edad91dc51947941284785a83a2a662cecb1) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). Excel has no dashboard sheet, so each dashboard becomes a worksheet of its current values: pivot results, slicer selections and KPI values from the top-left of each item's box, and PivotCharts as native charts with literal data. The dashboard is saved in the Sheetwrite metadata and opens as a dashboard again. Core passes the computed values to the backend in the export context (`DashboardExport`, `DashboardItemExport`).

- [#408](https://github.com/chh-ay/sheetwrite/pull/408) [`03a98d7`](https://github.com/chh-ay/sheetwrite/commit/03a98d7ea5119b5b030a77bb69678e2dc63491f3) Thanks [@chh-ay](https://github.com/chh-ay)! - Keep the data model in XLSX files ([#229](https://github.com/chh-ay/sheetwrite/issues/229)). Relationships between workbook tables now round-trip through Sheetwrite metadata, with pivots over related tables. Import also reads the active relationships of an Excel data model (`x15:dataModel`) whose model tables load worksheet tables, matched through their workbook connections by table and column name; each other relationship is reported with a warning. Sheetwrite does not write an Excel data model, so Excel opens an exported file without one.

- [#343](https://github.com/chh-ay/sheetwrite/pull/343) [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911) Thanks [@chh-ay](https://github.com/chh-ay)! - Add defined-name formulas and a lazy Name Manager under Formulas › Defined Names in the ribbon, compact ribbon, and toolbar. Names can hold constants, calculated values, references, or a reusable LAMBDA. Saves and deletes use document transactions, undo/redo, and collaboration.
  
  Plain named formulas evaluate in both engines. Named LAMBDA calls require the full engine; the default engine keeps and round-trips definitions but returns `#NAME?` when called. Recursive calls stop at 64 nested calls with `#NUM!`, below Excel's parameter-dependent allowance.
  
  A concurrent structural edit and a named-formula edit conflict and force a document reload. The pending edit remains available for host recovery; it is not rewritten across the remote structural edit.
  
  Keep defined-name formulas and scope in native XLSX. The engine converts Excel's future-function, LET binding, and LAMBDA parameter prefixes without changing quoted text or reference names. Formula-name conversion reuses the document engine or releases a temporary instance; range-only workbooks do not load one.

- [#500](https://github.com/chh-ay/sheetwrite/pull/500) [`6ec955a`](https://github.com/chh-ay/sheetwrite/commit/6ec955a0d74c229dfc7eeeb61631b02f69b101d4) Thanks [@chh-ay](https://github.com/chh-ay)! - Formulas can use the defined names of a linked workbook, as Excel does: `Budget.xlsx!Total`, `'C:\Reports\Budget.xlsx'!Total`, or `[Budget.xlsx]Annual!Total` for a name of one sheet. A name shows the saved values of the cells it refers to, and `#REF!` when the link does not hold it.
  
  - `ExternalLink.names` (type `ExternalLinkName`: `name`, `refersTo` and an optional `sheet`) keeps the names of a link in snapshots. `validateWorkbookSnapshot` checks their shape.
  - The store gives each name to the engine as a defined name spelled as formulas write it (`'[Budget.xlsx]'!Total`), whose references name the link's sheets. Both engines resolve every spelling of a link name to it, without case or folder.
  - XLSX import reads the `definedNames` of each external link part and turns `[1]!Total` into `Budget.xlsx!Total`; before, such formulas were kept as text. Export writes `[1]!Total` and the names back.
  - Change Source and Break Link also cover formulas that use a name of the link.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - **Behaviour change:** XLSX and CSV/TSV aborts reject with `signal.reason`, not with a `SheetwriteError` that has `code: "aborted"`.
  
  - `fromXlsxWorkbook`, `fromXlsxWorkbookFile`, `fromXlsxTable`, `toXlsxWorkbook`, `toXlsxTable`, their streams, `buildXlsxModel`, and the CSV/TSV parse and export functions reject, throw or error with `signal.reason` after the signal fires. An abort is not a failure, so it is never a `SheetwriteError`.
  - `parseCsv`, `parseTsv` and `fromCsv` now check `signal` too: before the scan and once per 1,024 records.
  - The XLSX codec checks the signal once per ZIP entry, worksheet and chunk of cells, also while it builds the snapshot. An aborted import keeps no partial snapshot.
  
  **Upgrade checklist:** if your code tells an aborted XLSX or CSV/TSV call apart with `error.code === "aborted"`, check `signal.aborted` (or `error === signal.reason`) instead. Persistence and IndexedDB storage still use `code: "aborted"`.
  
  Changed: aborted XLSX and CSV/TSV calls reject with `signal.reason`, not a `SheetwriteError` with code `aborted`; check `signal.aborted` instead.

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

- [#398](https://github.com/chh-ay/sheetwrite/pull/398) [`d59c5e6`](https://github.com/chh-ay/sheetwrite/commit/d59c5e693a45fd51392d3f1fa48f91548c4e1b7e) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort round trips with XLSX as in Excel.
  
  - An in-place sort of a table body records the table `sortState` in the same transaction, so Excel shows the sort on the table.
  - An imported worksheet `sortState` is kept as `Sheet.sortState` and written back on export, but no longer applied as a view sort: Excel writes it after a sort whose cells it already moved. A live view sort comes only from Sheetwrite's own metadata.
  - Removed: the "sortState did not cover every Sheetwrite data row" import warning; an imported worksheet `sortState` is now kept whatever rows it covers.
  - On export, a kept worksheet `sortState` that no longer fits the sheet is dropped with an `unsupported-feature` warning.

- [#462](https://github.com/chh-ay/sheetwrite/pull/462) [`50eb898`](https://github.com/chh-ay/sheetwrite/commit/50eb89857ce7791003eb8a7e200682396ce7fd83) Thanks [@chh-ay](https://github.com/chh-ay)! - Workbooks keep the saved values of linked workbooks, and XLSX files keep their external links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). A snapshot holds them in `workbook.externalLinks`: for each linked workbook, its file name (`book`), its location (`target`) and the saved cells of its sheets (`ExternalLink`, `ExternalLinkSheet`, `ExternalLinkCell`, `ExternalLinkValue`). The store gives them to the engine before formulas load, so `[Budget.xlsx]Annual!C10` shows the saved value in both engines. `validateWorkbookSnapshot` checks the shape of the links only (unique book names, targets, named sheets with cell arrays). The store checks each saved cell when it loads the snapshot, and an invalid cell fails the load with `invalid-snapshot`.
  
  XLSX import reads Excel's external link parts. Formulas that read a link, such as `'[1]Annual Plan'!C10` in the file, stay live as `'[Budget 2024.xlsx]Annual Plan'!C10`; before, they were kept as text. XLSX export writes the `[n]` form back. An unchanged link part is written byte for byte, a changed link is written from its saved values, and a workbook that a formula names without a link gets a link with no values. Formulas that name a defined name of another workbook, and DDE and OLE links, are still kept as text or dropped with a warning, as before.

- [#288](https://github.com/chh-ay/sheetwrite/pull/288) [`d0262cd`](https://github.com/chh-ay/sheetwrite/commit/d0262cd7dabe4e886aa2e0234b6e1ee8c6e6507e) Thanks [@chh-ay](https://github.com/chh-ay)! - Read and write Excel charts. `fromXlsxWorkbook` reads column, bar, line, area, pie, doughnut and scatter charts into `Sheet.charts`, with their series ranges, titles, axis titles, legend and anchor. `toXlsxWorkbook` writes `Sheet.charts` as chart parts that Excel and LibreOffice open. Cell edits keep these charts. Charts that the chart model cannot hold, for example 3-D or stacked charts, stay kept parts and emit an `unsupported-feature` warning.
  
  Chart import reads each part once per drawing and stops reading chart parts when the sheet reaches its chart limit. Repeated frames and frames beyond the limit stay preserved with a warning. Two-cell anchor sizing uses the defined column widths and row heights instead of walking every cell in the span.

### Patch Changes

- [#318](https://github.com/chh-ay/sheetwrite/pull/318) [`3644d27`](https://github.com/chh-ay/sheetwrite/commit/3644d278220a06a4701bb53e9ad98efb5a108353) Thanks [@chh-ay](https://github.com/chh-ay)! - Remove redundant formula-transfer work, share criteria aggregation rules, and remove unused XLSX and declaration code. Correct engine safety and XLSX ownership comments without changing public behavior.

- [#481](https://github.com/chh-ay/sheetwrite/pull/481) [`7a7ba88`](https://github.com/chh-ay/sheetwrite/commit/7a7ba88f7c7f17b9527aa4384a4073899e0372b7) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can update, re-point and break external workbook links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). The commands load only from `@sheetwrite/core/external-links`, so an application that does not import them carries none of their code:
  
  - `updateExternalLinks(grid, resolve, books?)` asks the host's `ExternalLinkResolver` for the current values of each link, as Excel's "Update Values" does. It saves them in one undoable change and returns a status per link: `updated`, `unavailable` (the resolver gave `null`) or `failed`.
  - `changeExternalLinkSource(grid, book, { book, target })` points the formulas that name a workbook at another one, as "Change Source" does, and keeps the saved values until the next update.
  - `breakExternalLinks(grid, books)` replaces the formulas that read those workbooks with their values and removes the links, as "Break Link" does.
  - `listExternalLinks(grid)` returns the links. The entry also exports the formula-text helpers for external references (`rewriteExternalSheets`, `externalSheetText`, `formulaContainsExternalReference`, `formulaCallsExternalData`), which the XLSX codec now uses.
  
  A new document operation, `{ op: "setExternalLinks"; links }`, replaces the saved values of all links. It is undoable, syncs to collaborators, persists, and is restored with a workbook version. Excel clears Undo after "Update Values" and "Break Link"; Sheetwrite keeps them undoable, and an undo restores both the links and the formulas.
  
  In both engines, a formula that names a linked workbook reads the link as soon as it is added, also when the formula was entered first. `CellStore.removeExternalSheet(book, sheet)` removes a link sheet, and formulas that read it show `#REF!` and keep their text.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX and CSV failures stay small:
  
  - An XLSX error message keeps at most 8 KiB of text from the file, from the start and the end, and keeps the decoding error as its `cause`.
  - One XLSX conversion reports at most 64 warnings to `onWarning`.
  - `DelimitedTextOptionsError.context` keeps a number option value, or only `valueType` for any other value, never a copy of it.
  - A registered XLSX backend name in a failure context is cut to 256 characters.

- [#388](https://github.com/chh-ay/sheetwrite/pull/388) [`b549147`](https://github.com/chh-ay/sheetwrite/commit/b549147b27a46393ececb62accbac54a8ca0d5a6) Thanks [@chh-ay](https://github.com/chh-ay)! - Pivot tables can use fields from related tables ([#229](https://github.com/chh-ay/sheetwrite/issues/229)).
  
  - New pivot source `{ model: { table, fields } }`. `table` is the base (many-side) table; each field names a table and column by stable IDs. A field's table must be the base table or a table that the base reaches through many-to-one relationships.
  - The output equals a pivot over the lookup-flattened table: an unmatched or blank key gives a blank related value, and an error in a many-side key carries that error. A duplicate one-side key or a key type mismatch shows `#VALUE!`; a missing table, column or relationship shows `#REF!`.
  - The full engine reads related values through sorted key indexes built for each pivot rebuild, and keeps no index or row map between recomputes. An edit in a related table rebuilds the pivot.
  - XLSX export keeps a model pivot in Sheetwrite metadata and warns, because Excel needs a data-model binary for it.

- [#498](https://github.com/chh-ay/sheetwrite/pull/498) [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557) Thanks [@chh-ay](https://github.com/chh-ay)! - A chart over a worksheet pivot (`ChartDefinition.pivot`) plots the pivot's leaf items, as an Excel PivotChart does. Before, it showed only on dashboards. The categories are the leaf row items, with the outer items joined into each label (`East / Retail`), and each value field, for each column item, is one series. Subtotals and grand totals are never points, in compact and tabular layout. The chart follows the pivot's fields, filters and source edits, `pivotValues` picks the values it plots, and it keeps no values of its own.
  
  - The full engine computes a copy of the pivot for its charts, without totals and without cells: core anchors the copy right of the last column, and a pivot anchored right of the last column of its sheet places no output.
  - The code that reads charts over pivots loads with the first such chart. A change event names the charts when it has loaded; that event has no `epoch`.
  - With the active cell in a worksheet pivot, Insert › Charts › PivotChart adds a chart over that pivot to the right of its output.
  - XLSX export writes the chart with the values it plots, and import reads it back as a chart over the pivot.

- [#356](https://github.com/chh-ay/sheetwrite/pull/356) [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e) Thanks [@chh-ay](https://github.com/chh-ay)! - Write cell formulas with Excel's future-function and local-binding prefixes, including LET, LAMBDA, XLOOKUP, FILTER and SORT, and remove those prefixes on import. Cells and defined names now share the engine converter, including the A1# spill spelling.
  
  Convert each workbook's distinct formulas in one batch instead of crossing the JavaScript-to-WASM boundary for every cell. Reuse an initialized engine or retire a temporary conversion instance. Formula-free workbooks, including workbooks with only range names, do not load an engine.

- [#439](https://github.com/chh-ay/sheetwrite/pull/439) [`2493222`](https://github.com/chh-ay/sheetwrite/commit/2493222a57c88440c474988c15496329423a29d1) Thanks [@chh-ay](https://github.com/chh-ay)! - Read worksheets with very many outlined rows or column declarations in linear time. An outline over every sheet row no longer throws `RangeError`, isolated outlined rows no longer cost one scan of all outlined rows per group, and overlapping `<col>` declarations resolve each column once instead of expanding every declaration to all its columns.

- [#437](https://github.com/chh-ay/sheetwrite/pull/437) [`3cae550`](https://github.com/chh-ay/sheetwrite/commit/3cae550ebd662fec0dfba8ab76f906364de4b7c4) Thanks [@chh-ay](https://github.com/chh-ay)! - Import a workbook that Excel re-saved after a sheet was inserted before a known sheet. Each worksheet first takes the Sheetwrite metadata of the same name, and only unclaimed metadata is matched by position, so the inserted sheet gets a new identity instead of sharing one with the known sheet. Generated sheet IDs avoid every ID that the metadata keeps, and cell fields are restored from the same metadata sheet as the identity.

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

- [#488](https://github.com/chh-ay/sheetwrite/pull/488) [`3c3508b`](https://github.com/chh-ay/sheetwrite/commit/3c3508b3bc3c6182b53c3fd68c92d0c66035ca2f) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX import keeps a data model that has measures but no relationships ([#230](https://github.com/chh-ay/sheetwrite/issues/230)). Such a model is written to the Sheetwrite metadata part; on import, its measures were dropped.

- [#631](https://github.com/chh-ay/sheetwrite/pull/631) [`7bae879`](https://github.com/chh-ay/sheetwrite/commit/7bae879e80547096da9703d4112818a68e1babcd) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export no longer sends plain formulas (only cell and range references, numbers, quoted text and operators) through the formula engine to write their Excel spelling, since the engine returns them unchanged. This brings back most of the export time lost in 0.7.0 on workbooks with many formulas ([#624](https://github.com/chh-ay/sheetwrite/issues/624)).

- [#616](https://github.com/chh-ay/sheetwrite/pull/616) [`333e25e`](https://github.com/chh-ay/sheetwrite/commit/333e25e93ad773995feb137154dcddc4d170fa1a) Thanks [@chh-ay](https://github.com/chh-ay)! - The XLSX reader and writer are split into internal modules by job, with no change to the public interface or to conversion results (part of [#251](https://github.com/chh-ay/sheetwrite/issues/251), [#252](https://github.com/chh-ay/sheetwrite/issues/252), [#253](https://github.com/chh-ay/sheetwrite/issues/253) and [#254](https://github.com/chh-ay/sheetwrite/issues/254)). Workbook loading, worksheet row streaming, worksheet metadata, tables, hyperlinks, validation and conditional formats, sidecar restore and sheet assembly each have their own module; `readWorkbook` and `writeSheet` now only run the stages in order. Index lookups that used non-null assertions now bind checked records, and the defined-name parser is named `parseNativeDefinedNames`.

- [#439](https://github.com/chh-ay/sheetwrite/pull/439) [`2493222`](https://github.com/chh-ay/sheetwrite/commit/2493222a57c88440c474988c15496329423a29d1) Thanks [@chh-ay](https://github.com/chh-ay)! - Escape the content type of each retained part in `[Content_Types].xml`, so a type such as `application/x-a&b` saves as valid XML. A persisted part graph whose relationships do not parse or point outside the package is dropped with a warning on save, as a graph with a bad checksum is, instead of failing the save.

- [#440](https://github.com/chh-ay/sheetwrite/pull/440) [`9cb1efc`](https://github.com/chh-ay/sheetwrite/commit/9cb1efc8dfc7a029a9e37c1bde052b8db314bf46) Thanks [@chh-ay](https://github.com/chh-ay)! - One owner inside the XLSX package for each format rule that the reader, writer, pivot, Power Query and preservation code shared as copies (part of [#250](https://github.com/chh-ay/sheetwrite/issues/250)): OOXML namespaces, the metadata sheet markers and column width units (`format.ts`), A1 cell and range parsing and formatting (`cell-reference.ts`, on core's `cellA1` and `rangeA1`), ISO 8601 date serials, OPC relationship part names, sheet growth and column keys. Pivot `d` items now read with the cell rule: only a date-time without a zone gets UTC, so a date-only item no longer depends on a runtime accepting `2024-01-01Z`. Pivot ranges accept any row number the reader accepts.
  
  `buildXlsxModel` now reads the same table projection as the bounded table writer (visible columns, merges, header row and styles), in bounded windows instead of one window over the whole sheet, and applies the writer's `maxMerges` limit.

- [#322](https://github.com/chh-ay/sheetwrite/pull/322) [`487e7f7`](https://github.com/chh-ay/sheetwrite/commit/487e7f7262f7fccd92f3d8a213be8130ce525861) Thanks [@chh-ay](https://github.com/chh-ay)! - Workbook import expands shared formulas in the engine, with its copy rule, the one that paste and fill use (part of [#250](https://github.com/chh-ay/sheetwrite/issues/250)). Import still works before `initSheetwrite()`: it borrows an initialized engine or uses a temporary one, as formula conversion does. Expanded formulas change where the old rule differed:
  
  - Whole columns and rows move: a shared `=SUM(A:A)` one column right is `=SUM(B:B)`. Before, it stayed `=SUM(A:A)`.
  - A reference moved past `XFD` or row 1048576 is `#REF!`, as is a range with any corner off the sheet: `=SUM(#REF!)` instead of `=SUM(#REF!:A1)`.
  - A name past the last column, such as `XYZ1`, stays a name.
  
  A shared-formula master that the engine's lexer cannot read has no copy rule. Each other cell of its group then keeps the formula text its writer stored on it, if any, and otherwise the master's text. Import reports an `unsupported-feature` warning for each such cell.
  
  `withXlsxFormulaEngine` in `@sheetwrite/core` replaces the unreleased `convertXlsxFormulas`. It runs a callback with the engine's formula conversion, lexer check and copy rule in one engine session.

- [#437](https://github.com/chh-ay/sheetwrite/pull/437) [`3cae550`](https://github.com/chh-ay/sheetwrite/commit/3cae550ebd662fec0dfba8ab76f906364de4b7c4) Thanks [@chh-ay](https://github.com/chh-ay)! - Keep formulas whose table columns have numeric or file-like names, such as `=SUM(Sales[2023])` or `Sales[report.xlsx]`, as formulas on import and export. Before, any `[digits]` or `[name.xlsx]` counted as a reference to another workbook, so the cell became inert text and table formulas were dropped. External-workbook references (`[1]Data!A1`, `[Budget.xlsx]Data!A1`, `'C:\Books\[Budget.xlsx]Data'!A1`) are still neutralized.
- Updated dependencies [[`5ddb4b4`](https://github.com/chh-ay/sheetwrite/commit/5ddb4b458a11733138ec0a8eb9b48f9522aeb400), [`2800304`](https://github.com/chh-ay/sheetwrite/commit/28003040e4c0eed510d19bf960f65021bb522239), [`72dd2d1`](https://github.com/chh-ay/sheetwrite/commit/72dd2d1f7f01b825775fdf7b818d32641b4e025a), [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f), [`55bffb1`](https://github.com/chh-ay/sheetwrite/commit/55bffb17ed553f16f652aaed03f2cbd87b27970d), [`70865bb`](https://github.com/chh-ay/sheetwrite/commit/70865bb498b9533c68ae8bec2f4fe090ee648ac7), [`fbe3a80`](https://github.com/chh-ay/sheetwrite/commit/fbe3a80f511e792cc2d829a8eb776f5da5a7f479), [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd), [`f8bce6b`](https://github.com/chh-ay/sheetwrite/commit/f8bce6bcea2f4bcedfacf38ec22ad64fc52fcd8a), [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53), [`c267c94`](https://github.com/chh-ay/sheetwrite/commit/c267c94ebc4f2c6d4f83e361b28d44fee5956f53), [`b98d86b`](https://github.com/chh-ay/sheetwrite/commit/b98d86b61c767e0ba037723b9802ea855b2c8837), [`9fcc918`](https://github.com/chh-ay/sheetwrite/commit/9fcc918cbf03bbf1f66767afb2b4753605fb9b54), [`dc9a6d5`](https://github.com/chh-ay/sheetwrite/commit/dc9a6d5fa145f5044503254b6b54e3c52ebcf866), [`94242d0`](https://github.com/chh-ay/sheetwrite/commit/94242d0eb3617f966a7df596bbfdb63c15349746), [`9a85f26`](https://github.com/chh-ay/sheetwrite/commit/9a85f26aecb57b42ff10f8f4702d2f833c5ea259), [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b), [`1aada28`](https://github.com/chh-ay/sheetwrite/commit/1aada28341741ee998205962f203179a87c6c5b9), [`4b705e2`](https://github.com/chh-ay/sheetwrite/commit/4b705e28bf9a003192d234b7e3becd385fe1481b), [`9669e3c`](https://github.com/chh-ay/sheetwrite/commit/9669e3c83b42c23c9705477295baacc0b4c421fa), [`acbd1e2`](https://github.com/chh-ay/sheetwrite/commit/acbd1e2864bfe552c30efd5303ec3ee9e215e721), [`afa9bcc`](https://github.com/chh-ay/sheetwrite/commit/afa9bcc25a08321681187f8c300ff05b5e863271), [`968df36`](https://github.com/chh-ay/sheetwrite/commit/968df36c94d94a615b8b3ef03da24a6a1a0b5be1), [`8298eda`](https://github.com/chh-ay/sheetwrite/commit/8298edad91dc51947941284785a83a2a662cecb1), [`b59c0af`](https://github.com/chh-ay/sheetwrite/commit/b59c0afccb201c5fb5d22584d311543e717ef71b), [`3c9dac3`](https://github.com/chh-ay/sheetwrite/commit/3c9dac3ffd83f1427a688cde26dc65eeade1f78d), [`8a543f7`](https://github.com/chh-ay/sheetwrite/commit/8a543f7a11f9d9a9b8df6039c66e99a7c0e9bd5c), [`3a7e6be`](https://github.com/chh-ay/sheetwrite/commit/3a7e6befde186f767c645c2d3357b05b27aa2039), [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911), [`ea18b3e`](https://github.com/chh-ay/sheetwrite/commit/ea18b3e1dceab79231f8df7aa21895f80ef556a3), [`50a75e6`](https://github.com/chh-ay/sheetwrite/commit/50a75e6b993b75c1ca8c63ec261dd24e49d6ebe7), [`df99575`](https://github.com/chh-ay/sheetwrite/commit/df9957517d2f9f513d9da546fa6b9e2f7752f17f), [`9667e81`](https://github.com/chh-ay/sheetwrite/commit/9667e815c363f3ae03f5896273c3559a2a8aceda), [`466708a`](https://github.com/chh-ay/sheetwrite/commit/466708a5b45ab4774e6eafd27a79f824ea8a9591), [`19ac121`](https://github.com/chh-ay/sheetwrite/commit/19ac1213c5f1323b339d05e8a0dcb32cbdeb7307), [`c67bb48`](https://github.com/chh-ay/sheetwrite/commit/c67bb489582f6920810aeba2f020ae5d4bec6266), [`cc07fea`](https://github.com/chh-ay/sheetwrite/commit/cc07fea9c9c6d2781fa829cafae4c0bfb40f4079), [`27bb47b`](https://github.com/chh-ay/sheetwrite/commit/27bb47bd95cfa5f8b35df9add770486b48a0b754), [`b08cb80`](https://github.com/chh-ay/sheetwrite/commit/b08cb80b3d3a29e34336b2c9cf65f4b8fae74840), [`916b452`](https://github.com/chh-ay/sheetwrite/commit/916b452044664a2753150a7e061c6d08b369f5f4), [`5474c76`](https://github.com/chh-ay/sheetwrite/commit/5474c76349cf2bfa491893be1548ef274ca94904), [`9968bc5`](https://github.com/chh-ay/sheetwrite/commit/9968bc5511decc2a7aa7ce2f9c06861d0c52ae4f), [`675dd15`](https://github.com/chh-ay/sheetwrite/commit/675dd15b224763ebda96f5f0e06bceee908efcee), [`6ec955a`](https://github.com/chh-ay/sheetwrite/commit/6ec955a0d74c229dfc7eeeb61631b02f69b101d4), [`7a7ba88`](https://github.com/chh-ay/sheetwrite/commit/7a7ba88f7c7f17b9527aa4384a4073899e0372b7), [`a2c2522`](https://github.com/chh-ay/sheetwrite/commit/a2c252203e6c1a16ea4ba004e029c62ccd517369), [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457), [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d), [`4c3de4c`](https://github.com/chh-ay/sheetwrite/commit/4c3de4c4d0b72742ea61d07465a7c1b24f23c316), [`d519828`](https://github.com/chh-ay/sheetwrite/commit/d519828c399b00c0f6a7646633a11853d9bf8eeb), [`eabee8c`](https://github.com/chh-ay/sheetwrite/commit/eabee8c55c03c5a0f1e1f97499070126206e6946), [`cc9a143`](https://github.com/chh-ay/sheetwrite/commit/cc9a1430bea2f7e1bfdf56f883612c4aacdad42b), [`3f5a91f`](https://github.com/chh-ay/sheetwrite/commit/3f5a91f65974b3631efd6cfd6687933effe95be5), [`3c57cb9`](https://github.com/chh-ay/sheetwrite/commit/3c57cb9e038c94cd17c7fac9a7fff2d01344b03e), [`3890a7a`](https://github.com/chh-ay/sheetwrite/commit/3890a7abdc2ce352119ef73cd62e4782206b438a), [`c0b2ac0`](https://github.com/chh-ay/sheetwrite/commit/c0b2ac0ee506b2ff4e57ae6012da0cbaaf6ceb1c), [`4727a3d`](https://github.com/chh-ay/sheetwrite/commit/4727a3de909c0645d11a0dc74196fecfea68008c), [`3310e7e`](https://github.com/chh-ay/sheetwrite/commit/3310e7eeb14684e1386903d1462b3eb977b84106), [`19fd4b5`](https://github.com/chh-ay/sheetwrite/commit/19fd4b541cbdc6343513c21f8c16b05e0efdea10), [`01b8d72`](https://github.com/chh-ay/sheetwrite/commit/01b8d729b92351e46e3f343aa08ca33604ef3284), [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5), [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5), [`cd6dc20`](https://github.com/chh-ay/sheetwrite/commit/cd6dc204da50474d221f33f634b3e5d097649b51), [`d078939`](https://github.com/chh-ay/sheetwrite/commit/d0789397aa1d91efdb6de0d3e3ccd1e6b03751c6), [`52daf35`](https://github.com/chh-ay/sheetwrite/commit/52daf35c41d27a52d827d87adcb005595ebe1605), [`3ef2323`](https://github.com/chh-ay/sheetwrite/commit/3ef2323d90d26e6f2be276b4ad799259ccb7b45f), [`969dc82`](https://github.com/chh-ay/sheetwrite/commit/969dc8211886ca106bac441ff5f8e6a6254fcbdd), [`17664a9`](https://github.com/chh-ay/sheetwrite/commit/17664a95da5d137a5e0863f9434ffa5d6ccbc771), [`c4933f9`](https://github.com/chh-ay/sheetwrite/commit/c4933f93d43e82e7613482e80fd8c822ff13fdaa), [`b0668a3`](https://github.com/chh-ay/sheetwrite/commit/b0668a31e8074c494d42889ed0d078683d0f89c5), [`444420c`](https://github.com/chh-ay/sheetwrite/commit/444420ccc6c529d21c9712ef6c2a55d10f7b61e7), [`b549147`](https://github.com/chh-ay/sheetwrite/commit/b549147b27a46393ececb62accbac54a8ca0d5a6), [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11), [`664609d`](https://github.com/chh-ay/sheetwrite/commit/664609d6e9cc6f139af51d65d14819861c820987), [`dd153bb`](https://github.com/chh-ay/sheetwrite/commit/dd153bb24808b011b90c48cf8d3061a743b7d0e6), [`8229709`](https://github.com/chh-ay/sheetwrite/commit/82297093792ceda7833750a2896e13fca515b216), [`6525a47`](https://github.com/chh-ay/sheetwrite/commit/6525a470ab709feaa5973916e131782e8dad9e14), [`d83d1bc`](https://github.com/chh-ay/sheetwrite/commit/d83d1bc1c43941523448322e04de2f190ca4d9e7), [`2251d6e`](https://github.com/chh-ay/sheetwrite/commit/2251d6eab0951e556c13fa9a5c8bf1639608dd0d), [`1d49097`](https://github.com/chh-ay/sheetwrite/commit/1d49097901768723e2bd0e880ee0e33256e0a958), [`5409cb5`](https://github.com/chh-ay/sheetwrite/commit/5409cb525b6a0946f890b2c4cf3b897512b3ce9f), [`a07effe`](https://github.com/chh-ay/sheetwrite/commit/a07effef4613a3ea6aa7d09189eeaedbb627e320), [`d0b34a7`](https://github.com/chh-ay/sheetwrite/commit/d0b34a770f74e2f42ab4bf67b3a9387b158537bf), [`04fa4c1`](https://github.com/chh-ay/sheetwrite/commit/04fa4c1008c29d4a2535863f8007aa3a40c95f37), [`8c9bc55`](https://github.com/chh-ay/sheetwrite/commit/8c9bc55a0661ee138e16d7f1594c53bf626c5157), [`21f64aa`](https://github.com/chh-ay/sheetwrite/commit/21f64aa87263d59cb996b0e04da9801a7deceebf), [`9ef07fe`](https://github.com/chh-ay/sheetwrite/commit/9ef07fea96dd5491352ad9ffe54aa5270dc61ff1), [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd), [`b029afe`](https://github.com/chh-ay/sheetwrite/commit/b029afe02f2a0933a1efb451dcc8cebc4d3773c7), [`72fb51c`](https://github.com/chh-ay/sheetwrite/commit/72fb51c15c49a625e726d8f110e48dfdedd0d7ef), [`5e9ba79`](https://github.com/chh-ay/sheetwrite/commit/5e9ba79d2fc0eb562fde68a2261f3633d678bd3a), [`a62346d`](https://github.com/chh-ay/sheetwrite/commit/a62346dc5b6abdcc700ecdae0a5c0aa5a69caab0), [`7e65201`](https://github.com/chh-ay/sheetwrite/commit/7e652018cbee5a927eaeaf8ac54df3294c74d961), [`1c41081`](https://github.com/chh-ay/sheetwrite/commit/1c410818c95bf1f27ed5fa3744e580cf7c9bc7b5), [`b7cef92`](https://github.com/chh-ay/sheetwrite/commit/b7cef927b5223a57f2f5fd08d1a4b4749f0fa31a), [`d59c5e6`](https://github.com/chh-ay/sheetwrite/commit/d59c5e693a45fd51392d3f1fa48f91548c4e1b7e), [`698c8ae`](https://github.com/chh-ay/sheetwrite/commit/698c8ae546cf11cf40fdf96ce222c1b788800794), [`b30a7ee`](https://github.com/chh-ay/sheetwrite/commit/b30a7ee367a0fcc5bdfea6a1cc177e29d5c64eb3), [`a1444f0`](https://github.com/chh-ay/sheetwrite/commit/a1444f00af111dd7921130f2e28fd1374a594eee), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f), [`a955cb7`](https://github.com/chh-ay/sheetwrite/commit/a955cb71183f0797384dd5d43dd03e476207e661), [`97796fe`](https://github.com/chh-ay/sheetwrite/commit/97796fe66ab5551a95b5fea9253e73b08d683646), [`a3f6eed`](https://github.com/chh-ay/sheetwrite/commit/a3f6eeddd43db9bbad23bb4d73ecef1f850d0f4f), [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557), [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e), [`e1aee47`](https://github.com/chh-ay/sheetwrite/commit/e1aee47c3fc41125af446ef8223206ec15e94d55), [`50eb898`](https://github.com/chh-ay/sheetwrite/commit/50eb89857ce7791003eb8a7e200682396ce7fd83), [`0e7fcde`](https://github.com/chh-ay/sheetwrite/commit/0e7fcdeeb5fbd27e9f36b13d7448368b5bc2053b), [`380f3d5`](https://github.com/chh-ay/sheetwrite/commit/380f3d5a3fac92da7e0389c099a8f27d91e5b90e), [`487e7f7`](https://github.com/chh-ay/sheetwrite/commit/487e7f7262f7fccd92f3d8a213be8130ce525861)]:
  - @sheetwrite/core@0.7.0

## 0.6.1

### Patch Changes

- [#233](https://github.com/chh-ay/sheetwrite/pull/233) [`724f4ab`](https://github.com/chh-ay/sheetwrite/commit/724f4ab6578cf5e8f324ddaf26e050f3d2d57075) Thanks [@chh-ay](https://github.com/chh-ay)! - Reduce temporary allocations during XLSX export and reject excessive archive expansion before reading local file headers.

- [#233](https://github.com/chh-ay/sheetwrite/pull/233) [`724f4ab`](https://github.com/chh-ay/sheetwrite/commit/724f4ab6578cf5e8f324ddaf26e050f3d2d57075) Thanks [@chh-ay](https://github.com/chh-ay)! - Parse worksheets of 64 KiB or less in one step, so imports and rejects of small workbooks take less time.
- Updated dependencies [[`c29a25a`](https://github.com/chh-ay/sheetwrite/commit/c29a25a65c4ff01ae32ad89fc6b32dde4798ffde)]:
  - @sheetwrite/core@0.6.1

## 0.6.0

### Minor Changes

- 81e45e3: Add three cell style fields: `fontFamily` (with the theme font as fallback), `verticalAlign` (`top`, `middle` or `bottom`), and a per-cell `numberFormat` that overrides the column's format; `General` opts a cell out of it. Paint, column auto-fit, snapshots, clipboard and hyperlink styles all honor them, and `isCellFontFamily` exposes the font-name rule. XLSX import and export round-trip all three: a column that mixes number formats keeps each cell's format instead of dropping them, and only fonts other than the workbook default become a cell `fontFamily`.
- 0b5cc2d: Add iterative calculation for circular references, as in Excel. The new `setCalculation` document operation sets `{ iterate, maxIterations, maxChange }`. The defaults are the Excel defaults: off, 100 iterations, and a maximum change of 0.001. When iteration is off, a circular reference shows `#CYCLE!`, as before. When it is on, the engine calculates each circular reference again until no value changes by more than `maxChange`, or until `maxIterations` passes are done. A cycle that does not settle keeps the values of its last pass. Formulas that read a cycle calculate once, after it settles. `OFFSET`, `INDIRECT` and volatile functions work inside a cycle, and a cycle that only `OFFSET` or `INDIRECT` closes also iterates.
  
  The setting is undoable and is part of the workbook snapshot as `workbook.calculation`. Snapshots of workbooks with the default setting do not change. XLSX import reads `iterate`, `iterateCount` and `iterateDelta` from `<calcPr>`, and export writes them. The WASM `CellStore` has the new `setIterativeCalculation` method. Core exports `CalculationSettings`, `DEFAULT_MAX_ITERATIONS`, `DEFAULT_MAX_CHANGE` and `MAX_ITERATIONS`.
  
  The engine finds circular references once per recalculation, only when the dependency check finds a cycle, so workbooks without one do no extra work.
- b6f333c: XLSX import now reads pivot tables into pivot definitions on the sheet that holds them. The reader reads the source range, table or workbook range name, the row, column and value fields, hidden items and page fields as filters, grand totals, subtotals, a descending sort and the compact or tabular layout. Excel `count` becomes `COUNTA` and `countNums` becomes `COUNT`. The reader captures Excel's rendered values as saved pivot output before removing them from ordinary source cells. The default engine shows those values and makes them available to formulas. The full engine calculates fresh output. XLSX export writes saved output back when no fresh rendered values replace it.
  
  When a pivot uses a feature that a pivot definition cannot hold, for example "show values as", Show All Items, a product summary, calculated or grouped fields, value filters, a custom manual item order or the outline layout, the reader keeps the pivot as an opaque part, as before, and gives an `unsupported-feature` warning.
  
  XLSX export writes each pivot as a pivot table part and a pivot cache definition. The cache lists the field names and items from the source cells, has no records and has `refreshOnLoad="1"`, so Excel and LibreOffice calculate the output when they open the file. A pivot that OOXML cannot express, such as a `DISTINCTCOUNT` value or a deleted source, stays only in the Sheetwrite metadata and gives a warning. A workbook without pivots has no extra export cost.
- 5308206: Opening and saving an XLSX file now keeps the parts Sheetwrite does not model: charts, pivot tables, images, VBA projects, customXml, XML maps, data connections, themes and document properties. They are kept as their original compressed bytes in the new `WorkbookSnapshot.workbook.xlsxSource` and written back unchanged. Charts and pivots are dropped with a warning once a cell changes, images once their sheet's rows or columns move, and VBA and customXml always survive. The new `maxPreservedBytes` resource limit (64 MiB by default) bounds the kept data.
  
  Table autofilter rules, sort state, calculated-column formulas and totals-row functions now round-trip through XLSX.
  
  New streaming functions `toCsvStream`, `toTsvStream`, `toXlsxTableStream` and `toXlsxWorkbookStream` return a `ReadableStream<Uint8Array>`, and `fromXlsxWorkbookFile` imports a `Blob` without buffering every part. The existing functions are unchanged.
  
  Import no longer writes the workbook's default font size onto every cell; only cells with a different size get a `fontSize` style.

### Patch Changes

- 8d70aae: Package READMEs and API doc comments link to the restructured documentation pages.
- 60590f9: Keep workbook layout and link text stable when another spreadsheet app saves an XLSX file.
  
  Import cells with no XLSX vertical alignment at the bottom, as Excel shows them. Import centered cells with the Sheetwrite default alignment. Export the Sheetwrite default as centered alignment. This changes how imported Excel cells with no alignment setting appear.
  
  Use the OOXML column width conversion. Keep automatic row heights automatic. Use cell text when a hyperlink has no display text. Export hyperlink colors and underlines in cell styles so other apps can keep them.
  
  Native fixture widths now match what Excel shows. Remove the old extra 5 pixels. The changed widths, in pixels, are: 19 → 14, 25 → 20, 26 → 21, 40 → 35, 44 → 39, 52 → 47, 53 → 48, 60 → 55, 64 → 59, 78 → 73, 85 → 80, 86 → 81, 94 → 89, 107 → 102, 114 → 109, 116 → 111, 119 → 114, 132 → 127, 154 → 149, 156 → 151, 162 → 157, and 171 → 166.
  
  Keep explicit cell font colors and underline settings when a hyperlink has no style. Use the default link look only for font properties the cell does not set.
- 3bdb073: The packages are smaller to install. The code is not minified and stays readable.
  
  - `@sheetwrite/core` is 1.83 MB → 1.55 MB unpacked (387 KB → 350 KB packed), with 214 → 157 files.
  - The packages publish only the type declarations that their entry points use. Core no longer ships 57 internal declaration files (117 KB), and `@sheetwrite/xlsx` no longer ships 8. You cannot import these files through the package `exports`, so no types change.
  - The published JavaScript uses 2-space indentation instead of 4. This saves 155 KB in core and 20 KB in `@sheetwrite/xlsx`.
  - `@sheetwrite/wasm` and `@sheetwrite/formulas` no longer publish `pkg/sheetwrite_wasm_bg.wasm.d.ts` (14 KB each). No entry point refers to it, and `sheetwrite_wasm.d.ts` has the same types.
- 2984b0b: XLSX import now builds the snapshot cells while it reads the worksheet rows, so each cell has one representation in memory instead of two. Restoring Sheetwrite sidecar fields now indexes only the sidecar cells, not all cells. Snapshot validation now finds duplicate cells with sorted numeric keys instead of a set of text keys, builds cell paths only for cells that fail, and counts the bytes of integers without making text. Validation results are the same. On generated 200,000 × 8 and 1,000,000 × 8 workbooks, over seven interleaved rounds for each side, the median import peak RSS went from 1,095 MiB to 800 MiB and from 5,061 MiB to 3,352 MiB (buffered). With `fromXlsxWorkbookFile`, it went from 1,112 MiB to 779 MiB and from 4,475 MiB to 3,336 MiB. The highest candidate run was lower than the median baseline run in all four cases, and the median import time decreased by about 20%.
- 5308206: XLSX import now parses each worksheet from bounded inflated chunks instead of building a whole-worksheet XML tree, and releases parsed cells as soon as the snapshot holds them. On a generated 200,000 × 8 workbook, five interleaved rounds against a baseline given the same early cell release measured median peak RSS 1,254 MiB → 994 MiB (buffered) and 1,068 MiB (`fromXlsxWorkbookFile`); single runs varied by up to about 400 MiB, and the highest candidate run (1,491 MiB) was above the highest baseline run. Character references longer than 31 characters are now rejected wherever they fall in the file.
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

## 0.5.4

### Patch Changes

- cb8a609: Remove `sourceMappingURL` comments that pointed to source map files the packages do not publish. Debuggers and bundlers no longer try to load missing maps.
- Updated dependencies [cb8a609]
  - @sheetwrite/core@0.5.4

## 0.5.3

### Patch Changes

- 222a3f8: Publish readable JavaScript again. 0.5.2 removed whitespace from the published files, so stack traces pointed into one long line and the code in `node_modules` was hard to read and debug. Your bundler still minifies your app build. Module paths, exports, and type documentation do not change.
- Updated dependencies [885b764]
- Updated dependencies [222a3f8]
  - @sheetwrite/core@0.5.3

## 0.5.2

### Patch Changes

- 2e4231c: Remove comments and extra whitespace from published JavaScript to reduce package download and installed sizes. Keep module paths, exported names, type documentation, and WebAssembly binaries unchanged.
- Updated dependencies [e09f014]
- Updated dependencies [f836aba]
- Updated dependencies [2e4231c]
  - @sheetwrite/core@0.5.2

## 0.5.1

### Patch Changes

- 7d9b52a: Add checked API examples and links for grid setup, data, synchronization, framework components, engine selection, and XLSX import and export.
- Updated dependencies [1f50d09]
- Updated dependencies [7d9b52a]
- Updated dependencies [edb091d]
  - @sheetwrite/core@0.5.1

## 0.5.0

### Minor Changes

- 4e5b8e2: Align the framework adapters and XLSX integration with the coordinated Sheetwrite 0.5.0 release.

### Patch Changes

- fb505d4: Faster XLSX import with lower peak memory. Worksheet rows and shared strings are read as they are parsed instead of being kept in a full XML tree, start tags and attributes are scanned without regular expressions or temporary arrays, the ZIP checksum loop no longer goes through the iterator protocol, and each cell style is copied once instead of twice. On the 1 MB benchmark workbook, a same-process A/B measured a 38% median improvement (1,675 ms to 1,039 ms) and peak memory fell from 476 MiB to 312 MiB. The imported snapshot is unchanged.
- cb78a4b: Exclude source maps from published library packages to reduce download and install size. Keep maps in local builds for development and size analysis.
  
  Declare only CSS files as side effects in the React, Vue, and Svelte adapters. Bundlers can remove unused JavaScript and keep imported stylesheets.
- e725d98: Support spill references such as `A1#`. A spill reference refers to the current spill of its anchor cell and follows it when the spill changes size. It returns `#REF!` when the anchor holds no spill. Row and column edits move the reference with its anchor. XLSX import and export convert it to and from `_xlfn.ANCHORARRAY`.
- Updated dependencies [a490186]
- Updated dependencies [b2379eb]
- Updated dependencies [fca4622]
- Updated dependencies [be6b618]
- Updated dependencies [ed66b6d]
- Updated dependencies [a9a3c5f]
- Updated dependencies [9915236]
- Updated dependencies [11e9336]
- Updated dependencies [b8dbb50]
- Updated dependencies [a767c8b]
- Updated dependencies [26a3552]
- Updated dependencies [0f4b9da]
- Updated dependencies [d1d34b9]
- Updated dependencies [cf1a10c]
- Updated dependencies [48be92d]
- Updated dependencies [ef2b0f5]
- Updated dependencies [2c03528]
- Updated dependencies [2b5f1eb]
- Updated dependencies [cb12daa]
- Updated dependencies [73cb52a]
- Updated dependencies [4d4b204]
- Updated dependencies [be093cd]
- Updated dependencies [43b0e9c]
- Updated dependencies [7221484]
- Updated dependencies [b54b29a]
- Updated dependencies [e6b6dbb]
- Updated dependencies [e725d98]
- Updated dependencies [eb1c786]
- Updated dependencies [bc7bc53]
- Updated dependencies [59e8d1a]
- Updated dependencies [fdc14ce]
- Updated dependencies [99435f8]
  - @sheetwrite/core@0.5.0

## 0.4.0

### Minor Changes

- Align the framework adapters and XLSX integration with the coordinated Sheetwrite 0.4.0 release.

### Patch Changes

- 55b1f35: Stop exporting implementation-only helpers and types from internal modules, and gate package workspaces against new unused internal exports.
- Updated dependencies [8457eca]
- Updated dependencies [dac694a]
- Updated dependencies [0e09ecc]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [55b1f35]
- Updated dependencies [b225783]
- Updated dependencies [41f6749]
- Updated dependencies [ce1e404]
  - @sheetwrite/core@0.4.0

## 0.3.1

### Patch Changes

- Correct the XLSX package release metadata and package-specific changelog without changing runtime behavior.
- Updated dependencies
  - @sheetwrite/core@0.3.1

## 0.3.0

### Minor Changes

- e551eb0: Normalize XLSX import, export, option, and resource-limit failures into canonical `SheetwriteError` values, and preserve each `AbortSignal` reason as the cancellation cause.

### Patch Changes

- Updated dependencies [e551eb0]
  - @sheetwrite/core@0.3.0

## 0.2.0

### Minor Changes

- 6ed7572: Harden collaboration, persistence, paged datasource, snapshot, and spreadsheet interchange boundaries; add bounded XLSX import/export with independent producer coverage; improve large-dataset cache behavior and browser rendering; and ship complete framework, database, collaboration, interoperability, and performance showcases.
- 87fadb7: Strengthen collaboration recovery, bounded persistence and paging, snapshot resource enforcement, and framework adapter contracts.

  Replace the optional XLSX implementation with a bounded OOXML codec, broaden workbook fidelity and producer conformance, and add deterministic performance evidence.

  Ship searchable capability-owned evaluation surfaces for framework integration, database lifecycle, collaboration, interoperability, and million-row performance.

### Patch Changes

- Updated dependencies [6ed7572]
- Updated dependencies [87fadb7]
  - @sheetwrite/core@0.2.0
