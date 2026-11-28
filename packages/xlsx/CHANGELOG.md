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

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter treats a date column as Excel does. A number whose cell has a date format is a date, and a column of mostly dates offers Date Filters. The value list groups dates by year, month and day, and each value shows as its cell shows it (`$39.50`, not `39.5`). Before, only the column's own type and format counted.
  
  Date Filters adds Excel's periods: Tomorrow, Today, Yesterday, the next, this and last week, month, quarter and year, Year to Date, and All Dates in the Period. They are the new `ColumnFilter` kind `{ kind: "dynamic", type }`, typed `DynamicDateFilter`, with Excel's XLSX `dynamicFilter` names; `isDynamicDateFilter(name)` checks a name. XLSX import and export keep them, and export names a value list's numbers by their cells' text.

- [#736](https://github.com/chh-ay/sheetwrite/pull/736) [`2c06012`](https://github.com/chh-ay/sheetwrite/commit/2c0601238ee6b574f66bb10fab3e8a6515a2002b) Thanks [@chh-ay](https://github.com/chh-ay)! - Excel's AutoFilter, in the document model. `Grid.setAutoFilter(range)` turns filter buttons on for a range whose first row is the header, and `setAutoFilter(null)` turns them off; with an AutoFilter, column filters hide only the range's rows below the header, so the header, and rows above and below the range, always show. `getAutoFilter()` reads it and `reapplyFilter()` filters again after edits, as Excel's Reapply. The sheet's `autoFilter` saves with the snapshot, syncs to collaborators, follows inserted and deleted rows and columns, and is one undo step.
  
  A new column filter, `{ kind: "custom", join, conditions }`, holds Excel's custom AutoFilter: one or two conditions (equals, does not equal, greater or less than, begins with, ends with, contains, does not contain), joined by AND or OR. They match as COUNTIF criteria do, wildcards and blanks included.
  
  Column filters now keep through inserted and deleted rows, and move with their columns when columns are inserted, deleted or moved; before, any row or column edit cleared them.
  
  XLSX import reads a worksheet `<autoFilter>`, with value lists, custom filters and non-blank filters, instead of dropping it with a warning; rows the filter hid in Excel become filtered rows, not hidden ones. Export writes `<autoFilter>`, the `_xlnm._FilterDatabase` name and, when it comes from a grid or store, the rows the filter hides, so Excel opens the file filtered.

- [#503](https://github.com/chh-ay/sheetwrite/pull/503) [`55bffb1`](https://github.com/chh-ay/sheetwrite/commit/55bffb17ed553f16f652aaed03f2cbd87b27970d) Thanks [@chh-ay](https://github.com/chh-ay)! - Charts draw multi-level category labels, as Excel does ([#501](https://github.com/chh-ay/sheetwrite/issues/501)).
  
  - A category range of several rows and several columns holds one category level per column (per row when the values run along a row). The last column labels each point. `ChartSeriesView.categoryLevels` holds the outer levels, outermost first, each with `labels` and `formats`; a blank cell continues the group above it. `categories` stays the innermost level, so charts with one level do not change.
  - A chart over a pivot with more than one row field gets its outer row fields as outer levels. `categories` holds the leaf items, not the joined `East / Retail` label.
  - The renderer draws one row of labels per level: each outer label once, centered under its group, with lines between categories and groups. Crowded inner labels turn to read upward, and outer labels wrap. In bar charts the outer labels stand left of the inner labels and read upward.
  - `ChartDefinition.axes.multiLevelLabels: false` draws one row of labels, each the text of its levels from the outside in (Excel's Format Axis › Multi-level Category Labels, cleared). The Chart panel has a **Multi-level category labels** check box when the categories have levels.
  - XLSX writes category levels as `c:multiLvlStrRef` and reads them back; `c:noMultiLvlLbl` round trips. A chart over a pivot now reads the cells that hold the pivot's values, with the values as its cache: over a native worksheet PivotTable it is that table's PivotChart (`c:pivotSource`), and over a dashboard pivot item it reads the item's cells. Without such cells it keeps literal data; category levels then have the formula `#REF!` and the labels in their cache.

- [#480](https://github.com/chh-ay/sheetwrite/pull/480) [`8298eda`](https://github.com/chh-ay/sheetwrite/commit/8298edad91dc51947941284785a83a2a662cecb1) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes dashboards ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). Excel has no dashboard sheet, so each dashboard becomes a worksheet of its current values: pivot results, slicer selections and KPI values from the top-left of each item's box, and PivotCharts as native charts with literal data. The dashboard is saved in the Sheetwrite metadata and opens as a dashboard again. Core passes the computed values to the backend in the export context (`DashboardExport`, `DashboardItemExport`).

- [#408](https://github.com/chh-ay/sheetwrite/pull/408) [`03a98d7`](https://github.com/chh-ay/sheetwrite/commit/03a98d7ea5119b5b030a77bb69678e2dc63491f3) Thanks [@chh-ay](https://github.com/chh-ay)! - Keep the data model in XLSX files ([#229](https://github.com/chh-ay/sheetwrite/issues/229)). Relationships between workbook tables now round-trip through Sheetwrite metadata, with pivots over related tables. Import also reads the active relationships of an Excel data model (`x15:dataModel`) whose model tables load worksheet tables, matched through their workbook connections by table and column name; each other relationship is reported with a warning. Sheetwrite does not write an Excel data model, so Excel opens an exported file without one.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Data › Data Validation opens Excel's Data Validation dialog for the selection, with Settings, Input Message and Error Alert tabs, Clear All, and "Apply these changes to all other cells with the same settings". OK applies the rule to the selected cells as one undoable step; a larger rule keeps its other cells. When the selection holds several kinds of rule, or cells with and without one, Excel's question comes first. The command is also `grid.actions.dataValidation()`.
  
  `DataValidationCondition` gains Excel's other Allow choices: `{ kind: "any" }`, `{ kind: "time" }`, `{ kind: "custom", formula }`, and a list whose items come from a range or a defined name, `{ kind: "list", source: "=$H$2:$H$5" }` or `"=Regions"`; the list shows the cells' current values. Comparison bounds may be formulas, such as `"=TODAY()"`. `DataValidationRule.inCellDropdown: false` hides a list's arrow and list, as Excel's "In-cell dropdown" does. Formulas are relative to the rule's top-left cell and follow inserted and deleted rows and columns. A list compares text without case, and a text length rule measures numbers too, as in Excel.
  
  XLSX import and export keep every Data Validation type, formula sources and bounds, and the dropdown flag. Before, formula-based rules and the time, custom and any-value types were dropped.
  
  The engine's `previewFormulaWith` evaluates a formula as if a cell held a given value, without changing the store; a custom rule checks a typed value with it before the value is stored.

- [#343](https://github.com/chh-ay/sheetwrite/pull/343) [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911) Thanks [@chh-ay](https://github.com/chh-ay)! - Add defined-name formulas and a lazy Name Manager under Formulas › Defined Names in the ribbon, compact ribbon, and toolbar. Names can hold constants, calculated values, references, or a reusable LAMBDA. Saves and deletes use document transactions, undo/redo, and collaboration.
  
  Plain named formulas evaluate in both engines. Named LAMBDA calls require the full engine; the default engine keeps and round-trips definitions but returns `#NAME?` when called. Recursive calls stop at 64 nested calls with `#NUM!`, below Excel's parameter-dependent allowance.
  
  A concurrent structural edit and a named-formula edit conflict and force a document reload. The pending edit remains available for host recovery; it is not rewritten across the remote structural edit.
  
  Keep defined-name formulas and scope in native XLSX. The engine converts Excel's future-function, LET binding, and LAMBDA parameter prefixes without changing quoted text or reference names. Formula-name conversion reuses the document engine or releases a temporary instance; range-only workbooks do not load one.

- [#794](https://github.com/chh-ay/sheetwrite/pull/794) [`591b0a7`](https://github.com/chh-ay/sheetwrite/commit/591b0a75626aad87d4e7b6447602883088d5e8e2) Thanks [@chh-ay](https://github.com/chh-ay)! - The sheet tab menu follows Excel's: Insert, Rename, Move or Copy…, Tab color, Hide and Remove.
  
  - **Insert** adds a sheet before the tab. `AddSheetInput.index` sets the position of a new sheet.
  - **Move or Copy…** opens a dialog that moves a sheet before another one, or copies it with "Create a copy". The new `grid.copySheet(id, { index?, name? })` makes the copy and returns its result, whose `sheet` is the copy's ID, as `addSheet` does: it is named like `Sales (2)`, references to the sheet itself refer to the copy, its tables get new names (`Sales` becomes `Sales2`) and its sheet-scoped names come along.
  - **Tab color** colors a tab with one of Excel's standard colors, or No Color. The new `grid.setSheetTabColor(id, color)`, `Sheet.tabColor` and `SheetSnapshot.tabColor` hold it, the `setSheetMeta` operation takes `tabColor`, and XLSX files read and write it.
  - Ctrl+PageDown and Ctrl+PageUp switch to the next and previous visible sheet, and so do Excel for the web's Ctrl+Alt+PageDown and Ctrl+Alt+PageUp, because browsers keep Ctrl+PageDown and Ctrl+PageUp for their own tabs. They are the new rebindable keyboard actions `nextSheet` and `previousSheet`. A host binding that already uses these keys now raises `shortcut-conflict`.

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

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - A typed value that a data validation rule rejects now shows Excel's error alert instead of disappearing without a word. A Stop alert offers Retry and Cancel, a Warning alert Yes, No and Cancel, and an Information alert OK and Cancel, as in Excel. Retry and No return to the entry with its text selected; Yes and OK keep the value; Cancel drops it. The alert shows the rule's title and message, or Excel's default text. A formula is checked by its result. A rule whose alert is off (`policy: "allow"`) stores the value without a word.
  
  `DataValidationRule` gains Excel's Error Alert and Input Message fields: `errorStyle` (`"stop"`, `"warning"` or `"information"`), `errorTitle`, `showInputMessage`, `inputTitle` and `inputMessage`. `helpText` is the error message. The input message shows beside a selected cell of the rule, as in Excel, and screen readers hear it as the cell's description.
  
  XLSX import and export keep every one of these fields. Before, a file's input message and error message were reduced to one text, and titles and the Information style were lost.

- [#462](https://github.com/chh-ay/sheetwrite/pull/462) [`50eb898`](https://github.com/chh-ay/sheetwrite/commit/50eb89857ce7791003eb8a7e200682396ce7fd83) Thanks [@chh-ay](https://github.com/chh-ay)! - Workbooks keep the saved values of linked workbooks, and XLSX files keep their external links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). A snapshot holds them in `workbook.externalLinks`: for each linked workbook, its file name (`book`), its location (`target`) and the saved cells of its sheets (`ExternalLink`, `ExternalLinkSheet`, `ExternalLinkCell`, `ExternalLinkValue`). The store gives them to the engine before formulas load, so `[Budget.xlsx]Annual!C10` shows the saved value in both engines. `validateWorkbookSnapshot` checks the shape of the links only (unique book names, targets, named sheets with cell arrays). The store checks each saved cell when it loads the snapshot, and an invalid cell fails the load with `invalid-snapshot`.
  
  XLSX import reads Excel's external link parts. Formulas that read a link, such as `'[1]Annual Plan'!C10` in the file, stay live as `'[Budget 2024.xlsx]Annual Plan'!C10`; before, they were kept as text. XLSX export writes the `[n]` form back. An unchanged link part is written byte for byte, a changed link is written from its saved values, and a workbook that a formula names without a link gets a link with no values. Formulas that name a defined name of another workbook, and DDE and OLE links, are still kept as text or dropped with a warning, as before.

- [#288](https://github.com/chh-ay/sheetwrite/pull/288) [`d0262cd`](https://github.com/chh-ay/sheetwrite/commit/d0262cd7dabe4e886aa2e0234b6e1ee8c6e6507e) Thanks [@chh-ay](https://github.com/chh-ay)! - Read and write Excel charts. `fromXlsxWorkbook` reads column, bar, line, area, pie, doughnut and scatter charts into `Sheet.charts`, with their series ranges, titles, axis titles, legend and anchor. `toXlsxWorkbook` writes `Sheet.charts` as chart parts that Excel and LibreOffice open. Cell edits keep these charts. Charts that the chart model cannot hold, for example 3-D or stacked charts, stay kept parts and emit an `unsupported-feature` warning.
  
  Chart import reads each part once per drawing and stops reading chart parts when the sheet reaches its chart limit. Repeated frames and frames beyond the limit stay preserved with a warning. Two-cell anchor sizing uses the defined column widths and row heights instead of walking every cell in the span.

### Patch Changes

- [#318](https://github.com/chh-ay/sheetwrite/pull/318) [`3644d27`](https://github.com/chh-ay/sheetwrite/commit/3644d278220a06a4701bb53e9ad98efb5a108353) Thanks [@chh-ay](https://github.com/chh-ay)! - Remove redundant formula-transfer work, share criteria aggregation rules, and remove unused XLSX and declaration code. Correct engine safety and XLSX ownership comments without changing public behavior.

- [#722](https://github.com/chh-ay/sheetwrite/pull/722) [`33ebd56`](https://github.com/chh-ay/sheetwrite/commit/33ebd56cc16a131f4e6055a43185e8166e40fe0d) Thanks [@chh-ay](https://github.com/chh-ay)! - The API reference describes the fields of `XlsxModel` and `XlsxModelCell`, and what `buildXlsxModel` returns and throws.

- [#481](https://github.com/chh-ay/sheetwrite/pull/481) [`7a7ba88`](https://github.com/chh-ay/sheetwrite/commit/7a7ba88f7c7f17b9527aa4384a4073899e0372b7) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can update, re-point and break external workbook links ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). The commands load only from `@sheetwrite/core/external-links`, so an application that does not import them carries none of their code:
  
  - `updateExternalLinks(grid, resolve, books?)` asks the host's `ExternalLinkResolver` for the current values of each link, as Excel's "Update Values" does. It saves them in one undoable change and returns a status per link: `updated`, `unavailable` (the resolver gave `null`) or `failed`.
  - `changeExternalLinkSource(grid, book, { book, target })` points the formulas that name a workbook at another one, as "Change Source" does, and keeps the saved values until the next update.
  - `breakExternalLinks(grid, books)` replaces the formulas that read those workbooks with their values and removes the links, as "Break Link" does.
  - `listExternalLinks(grid)` returns the links. The entry also exports the formula-text helpers for external references (`rewriteExternalSheets`, `externalSheetText`, `formulaContainsExternalReference`, `formulaCallsExternalData`), which the XLSX codec now uses.
  
  A new document operation, `{ op: "setExternalLinks"; links }`, replaces the saved values of all links. It is undoable, syncs to collaborators, persists, and is restored with a workbook version. Excel clears Undo after "Update Values" and "Break Link"; Sheetwrite keeps them undoable, and an undo restores both the links and the formulas.
  
  In both engines, a formula that names a linked workbook reads the link as soon as it is added, also when the formula was entered first. `CellStore.removeExternalSheet(book, sheet)` removes a link sheet, and formulas that read it show `#REF!` and keep their text.

- [#915](https://github.com/chh-ay/sheetwrite/pull/915) [`7cfaa3a`](https://github.com/chh-ay/sheetwrite/commit/7cfaa3a0c371c8fbf91b83225b341981d06624b5) Thanks [@chh-ay](https://github.com/chh-ay)! - A new column type, `general`, reads what a user types as Excel's General format does: `42` is a number, `15%` is 0.15 shown as `0%`, `$4.50` is 4.5 shown as `$#,##0.00`, `1/15/2026` is a date shown as `m/d/yyyy`, `9:30 PM` is a time, and `'007` is the text `007`. New sheets, `addSheet` without `columns`, the empty columns right of a sheet's own, XLSX imports without one number format per column, and an adapter's column without `type` are `general`. Before, they were `text`, so a typed number or date in a new sheet or an opened XLSX file stayed text, and `SUM` skipped it. A column typed `text` still keeps typed text.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX and CSV failures stay small:
  
  - An XLSX error message keeps at most 8 KiB of text from the file, from the start and the end, and keeps the decoding error as its `cause`.
  - One XLSX conversion reports at most 64 warnings to `onWarning`.
  - `DelimitedTextOptionsError.context` keeps a number option value, or only `valueType` for any other value, never a copy of it.
  - A registered XLSX backend name in a failure context is cut to 256 characters.

- [#1336](https://github.com/chh-ay/sheetwrite/pull/1336) [`412c995`](https://github.com/chh-ay/sheetwrite/commit/412c995674becd8a3d4916a3b42edb85f7eb2ea8) Thanks [@chh-ay](https://github.com/chh-ay)! - An add-on whose code chunk fails to load, for example after a dropped network request, now loads it again on the next use instead of failing for the rest of the page's life. The XLSX call that started the failed load rejects with the load error, and the next XLSX call loads the codec again. The charts add-on reports the failure with a console warning instead of an unhandled promise rejection; the chart mounted during the failed load stays empty, and the next chart loads the drawing code again.

- [#388](https://github.com/chh-ay/sheetwrite/pull/388) [`b549147`](https://github.com/chh-ay/sheetwrite/commit/b549147b27a46393ececb62accbac54a8ca0d5a6) Thanks [@chh-ay](https://github.com/chh-ay)! - Pivot tables can use fields from related tables ([#229](https://github.com/chh-ay/sheetwrite/issues/229)).
  
  - New pivot source `{ model: { table, fields } }`. `table` is the base (many-side) table; each field names a table and column by stable IDs. A field's table must be the base table or a table that the base reaches through many-to-one relationships.
  - The output equals a pivot over the lookup-flattened table: an unmatched or blank key gives a blank related value, and an error in a many-side key carries that error. A duplicate one-side key or a key type mismatch shows `#VALUE!`; a missing table, column or relationship shows `#REF!`.
  - The full engine reads related values through sorted key indexes built for each pivot rebuild, and keeps no index or row map between recomputes. An edit in a related table rebuilds the pivot.
  - XLSX export keeps a model pivot in Sheetwrite metadata and warns, because Excel needs a data-model binary for it.

- [#913](https://github.com/chh-ay/sheetwrite/pull/913) [`12be563`](https://github.com/chh-ay/sheetwrite/commit/12be5639408dc351479b6a9d8fa5366cee533f05) Thanks [@chh-ay](https://github.com/chh-ay)! - Data validation reads each list source once per check. Before, each list rule read its source again, one cell at a time, for each checked cell, and a typed entry was checked twice. With 300 list rules over a column, one entry read about 20 million cells, and a fill took minutes.
  
  - The grid's check of an entry and the store's check when it is written are one check, as are the checks of a paste that keeps the target's rules. Each reads a source with one window read and compares an entry with a set of its items.
  - A sheet holds at most 1,000 validation rules, exported as `MAX_VALIDATION_RULES`. The XLSX reader drops the rules past it with a `validation-loss` warning. Snapshots past it are refused, and so is an operation that would add a rule past it, from this grid or a peer.
  - A transaction's data validation has a budget, counted in rule tests, list cells read and formula results. A transaction that needs more is refused with a `resource-limit` issue whose `resource` is `"validation-checks"`.

- [#498](https://github.com/chh-ay/sheetwrite/pull/498) [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557) Thanks [@chh-ay](https://github.com/chh-ay)! - A chart over a worksheet pivot (`ChartDefinition.pivot`) plots the pivot's leaf items, as an Excel PivotChart does. Before, it showed only on dashboards. The categories are the leaf row items, with the outer items joined into each label (`East / Retail`), and each value field, for each column item, is one series. Subtotals and grand totals are never points, in compact and tabular layout. The chart follows the pivot's fields, filters and source edits, `pivotValues` picks the values it plots, and it keeps no values of its own.
  
  - The full engine computes a copy of the pivot for its charts, without totals and without cells: core anchors the copy right of the last column, and a pivot anchored right of the last column of its sheet places no output.
  - The code that reads charts over pivots loads with the first such chart. A change event names the charts when it has loaded; that event has no `epoch`.
  - With the active cell in a worksheet pivot, Insert › Charts › PivotChart adds a chart over that pivot to the right of its output.
  - XLSX export writes the chart with the values it plots, and import reads it back as a chart over the pivot.

- [#356](https://github.com/chh-ay/sheetwrite/pull/356) [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e) Thanks [@chh-ay](https://github.com/chh-ay)! - Write cell formulas with Excel's future-function and local-binding prefixes, including LET, LAMBDA, XLOOKUP, FILTER and SORT, and remove those prefixes on import. Cells and defined names now share the engine converter, including the A1# spill spelling.
  
  Convert each workbook's distinct formulas in one batch instead of crossing the JavaScript-to-WASM boundary for every cell. Reuse an initialized engine or retire a temporary conversion instance. Formula-free workbooks, including workbooks with only range names, do not load an engine.

- [#1331](https://github.com/chh-ay/sheetwrite/pull/1331) [`615d45a`](https://github.com/chh-ay/sheetwrite/commit/615d45a7a39487f59d3d0e8eddf5f4662e63bd75) Thanks [@chh-ay](https://github.com/chh-ay)! - Loading `@sheetwrite/xlsx` without the grid is faster and uses less memory: the codec takes the core values it needs from the internal `@sheetwrite/core/codec` entry point instead of the main entry point, so it no longer loads the grid, the canvas painters and the rest of the UI. A process that only converts or refuses XLSX files loads 83 modules instead of 198.

- [#914](https://github.com/chh-ay/sheetwrite/pull/914) [`39467cc`](https://github.com/chh-ay/sheetwrite/commit/39467ccb6246ac0ad1d8e3cc8598ca01ad856185) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export now marks formulas whose result is an array, such as `=SEQUENCE(3)`, `=FILTER(...)` or `=A1:A3`, as Excel dynamic arrays, so Excel spills them instead of showing `=@SEQUENCE(3)` and one value. Each such cell gets `cm="1"` and `<f t="array">`, and the workbook gets the `xl/metadata.xml` part, as Excel 365 writes them. Exporting a grid also writes each spill's range and the values it shows in the cells it covers. Formulas with one value stay plain, and a workbook without array formulas has no metadata part.
  
  XLSX import reads Excel's dynamic arrays as formulas that spill again, without the cached values of the cells they cover. Legacy array formulas (Ctrl+Shift+Enter, `t="array"` without `cm`) are still kept as text with a warning.
  
  The engines have two new exports for this: `xlsxArrayFormulas` and the `CellStore` method `spillRanges`. Core's `XlsxFormulaEngine` has the matching `arrayFormulas(formulas)`.

- [#1333](https://github.com/chh-ay/sheetwrite/pull/1333) [`6338fa3`](https://github.com/chh-ay/sheetwrite/commit/6338fa3e40d61bd9b36db7582ba1504b8e932cbe) Thanks [@chh-ay](https://github.com/chh-ay)! - `toXlsxWorkbook` deflates a worksheet longer than 1 MiB as it writes it, instead of keeping the whole sheet XML and a copy of it until the archive is assembled. Export uses less memory and writes the same bytes.

- [#1048](https://github.com/chh-ay/sheetwrite/pull/1048) [`aea012c`](https://github.com/chh-ay/sheetwrite/commit/aea012ca6e384e968257292746b97f9635a364be) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes cells faster. Each cell style is looked up once per column and style, and text that needs no XML escaping is not copied. The output bytes do not change.

- [#1066](https://github.com/chh-ay/sheetwrite/pull/1066) [`6d8ed2a`](https://github.com/chh-ay/sheetwrite/commit/6d8ed2ae2754752e924af76e934590e80648ae07) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX import parses worksheet XML faster. Text and attribute values are counted against `maxXmlTextBytes` only when they could pass it, and text with only the five predefined XML entities is decoded in one pass. The limits, errors and imported values do not change.

- [#789](https://github.com/chh-ay/sheetwrite/pull/789) [`309acef`](https://github.com/chh-ay/sheetwrite/commit/309aceff9b9c2c9675dcabf5d740153c68593751) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX files with a sheet named History open and save again. Since 0.7.0 refuses History as a new sheet name, reading or writing such a file failed with `reserved`; only a rename refuses the name now, as in Excel.

- [#439](https://github.com/chh-ay/sheetwrite/pull/439) [`2493222`](https://github.com/chh-ay/sheetwrite/commit/2493222a57c88440c474988c15496329423a29d1) Thanks [@chh-ay](https://github.com/chh-ay)! - Read worksheets with very many outlined rows or column declarations in linear time. An outline over every sheet row no longer throws `RangeError`, isolated outlined rows no longer cost one scan of all outlined rows per group, and overlapping `<col>` declarations resolve each column once instead of expanding every declaration to all its columns.

- [#1051](https://github.com/chh-ay/sheetwrite/pull/1051) [`44692b9`](https://github.com/chh-ay/sheetwrite/commit/44692b9f0fe8fa3295aa5d735cef747cd9f0e1fe) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX import is faster: the reader checks the snapshot it builds with direct reads instead of proving every field of its own objects again, with the same schema, reference and size checks. Snapshot validation also accepts plain cells without building paths or reading property descriptors a second time. Core gains an internal `@sheetwrite/core/codec` entry point for Sheetwrite's own codecs, with no compatibility promise.

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

- [#908](https://github.com/chh-ay/sheetwrite/pull/908) [`4e6989c`](https://github.com/chh-ay/sheetwrite/commit/4e6989c522f02db312f4be99696e7c5c3d18900c) Thanks [@chh-ay](https://github.com/chh-ay)! - An XLSX file with a data validation formula longer than 255 characters now opens. Excel keeps these formulas within 255 characters, but other tools write longer ones. The reader drops such a rule with a `validation-loss` warning, as it drops a conditional format whose formula is too long. Before, the whole import failed with "imported invalid workbook snapshot". `@sheetwrite/core` exports the limit as `MAX_VALIDATION_FORMULA_LENGTH`.

- [#488](https://github.com/chh-ay/sheetwrite/pull/488) [`3c3508b`](https://github.com/chh-ay/sheetwrite/commit/3c3508b3bc3c6182b53c3fd68c92d0c66035ca2f) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX import keeps a data model that has measures but no relationships ([#230](https://github.com/chh-ay/sheetwrite/issues/230)). Such a model is written to the Sheetwrite metadata part; on import, its measures were dropped.

- [#1092](https://github.com/chh-ay/sheetwrite/pull/1092) [`b76badc`](https://github.com/chh-ay/sheetwrite/commit/b76badc89481ced587534f2f7f69480d88d9c118) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export takes a `compression` option. The default, `"deterministic"`, keeps the bundled `fflate` codec and the same bytes as before in every runtime. `"native"` compresses with the runtime's `CompressionStream` where it has one: export is faster, the file holds the same parts, but the compressed bytes differ between runtimes.

- [#1047](https://github.com/chh-ay/sheetwrite/pull/1047) [`18128e0`](https://github.com/chh-ay/sheetwrite/commit/18128e07f9b430185c62ec6342e5013a8c842f49) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX import inflates ZIP entries with the runtime's `DecompressionStream` when it has one and checks CRC-32 eight bytes at a time. The files that import, the errors and the limits stay the same.

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

- [#1337](https://github.com/chh-ay/sheetwrite/pull/1337) [`8f2014a`](https://github.com/chh-ay/sheetwrite/commit/8f2014af7c478e5ac51a457573b2b879ac110291) Thanks [@chh-ay](https://github.com/chh-ay)! - An XLSX file with a broken style part (a style attribute that is not a whole number, a custom number format without an id or code, a style that names a missing font, fill or border, or a cell that names a missing style) is now refused with the same "invalid XLSX workbook" error as every other malformed part, instead of an error worded differently.

- [#1335](https://github.com/chh-ay/sheetwrite/pull/1335) [`efa9ffa`](https://github.com/chh-ay/sheetwrite/commit/efa9ffa33ac37f67c3f39bb01500e9358e6660ed) Thanks [@chh-ay](https://github.com/chh-ay)! - An Excel data model whose connection names a worksheet table in another Unicode form, such as "Ä" typed as one character or as "A" with a combining diaeresis, now finds that table, so its relationships are imported. The XLSX reader compares every table name with core's table-name key (NFC, then letter case ignored), which the internal `@sheetwrite/core/codec` entry point now exports.

- [#968](https://github.com/chh-ay/sheetwrite/pull/968) [`75cbd4c`](https://github.com/chh-ay/sheetwrite/commit/75cbd4c97d2385584da1b65f0ad4772044fa303a) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export writes a `text` column in Excel's Text format `@`, and import reads a column in `@` as a `text` column. Before, a `text` column came back from a round trip as `general`, so a typed `007` became the number 7.
- Updated dependencies: @sheetwrite/core@0.7.0

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
