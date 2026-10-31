# @sheetwrite/core

## 0.7.0

### Minor Changes

- [#309](https://github.com/chh-ay/sheetwrite/pull/309) [`f8bce6b`](https://github.com/chh-ay/sheetwrite/commit/f8bce6bcea2f4bcedfacf38ec22ad64fc52fcd8a) Thanks [@chh-ay](https://github.com/chh-ay)! - Core failures have one shape. Bad host input and passed limits on public paths now throw a `SheetwriteError` with a code instead of a plain `Error`, `TypeError` or `RangeError`: simple columns, row bridge options and row IDs, `CellRenderer.dom()` results, store options, resource reports, restore blocks, transaction limits, datasource pages and unknown sheet IDs. `isSheetwriteError` checks the shape only, so it also accepts codes from a newer release. A failure stays small: its message and the strings in its `context` are cut to 8 KiB, a `context` over 1,024 entries becomes `{ truncated: true }` instead of making the constructor throw, and `SnapshotValidationError.errors` keeps the first 64 issues. `SyncProtocolError` keeps the original failure as its `cause`.
  
  Upgrade checklist:
  
  - If you catch `RangeError` or `TypeError` from `resolveTransactionResourceLimits`, `validateTransactionResources`, `createRowBridge`, `createSimpleGridInput`, `legacyFullWidthDataSource`, `decodeStoreMemoryStats`, `assertRuntimeResourceSnapshot` or a custom `CellRenderer`, check `isSheetwriteError(error)` and `error.code` instead. The new code is `invalid-argument`; the new operations are `store`, `transaction`, `render`, `row-bridge` and `resource-diagnostics`.
  - An unknown sheet ID throws `not-found` with operation `store` and `context.sheet`. Do not match the message.
  - A bad limit override throws `invalid-limits` everywhere, also from `IndexedDbPendingCommitStorage.load` (was `limit`) and direct workbook allocation (was `TypeError`).
  - The operation `comments` is now `comment`, and the grid export operation `export-xlsx` is now `xlsx-export`.
  - `datasource-error` contexts no longer copy column keys: they hold `columnBandCount` and the `start` and `end` of the first 64 bands. Read the keys from `event.request`.
  - If you `switch` over `SheetwriteErrorCode` or `SheetwriteErrorOperation` without a default case, add the new values.

- [#286](https://github.com/chh-ay/sheetwrite/pull/286) [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can register synchronous JavaScript functions that formulas call, on the full engine (`@sheetwrite/formulas`). Import `registerFunction(store, metadata, implementation)` and `unregisterFunction(store, name)` from `@sheetwrite/core/functions`; an application that does not import that entry carries none of its JavaScript, and the default engine binary does not change. On the default engine, `registerFunction` throws a `SheetwriteError` with code `optional-backend-unavailable`. A thrown error or a result that is not a number, text, boolean or `null` shows `#VALUE!`. A workbook that calls a function that is not registered shows `#NAME?`. `listFunctions(store)` returns the metadata of the built-in functions of the active engine and of the host functions in one list.

- [#296](https://github.com/chh-ay/sheetwrite/pull/296) [`50a75e6`](https://github.com/chh-ay/sheetwrite/commit/50a75e6b993b75c1ca8c63ec261dd24e49d6ebe7) Thanks [@chh-ay](https://github.com/chh-ay)! - A WASM trap in the engine now stops the engine with the new error code `engine-failed` (operation `engine`) instead of an untyped `RuntimeError`. The call that trapped throws it. Every grid on that engine emits the new `engine-failed` grid event once, keeps its last frame and becomes read-only; `setReadOnly(false)` does not undo this. Stores on that engine refuse `applyTransaction`, `recalculateVolatile` and `loadPage` with the same code. Call `initSheetwrite()` again and create a new grid from a saved document to continue. The restart uses the compiled module again.
  
  Worker renderer failures are now typed `renderer-fallback` errors with `context.failure`: `spawn`, `crash`, `protocol`, `timeout` or `fatal`. A reply or request that one side cannot read stops the worker and falls back to the canvas renderer, where it was ignored before.
  
  Engine loading and memory release failures are typed too: `getEngine` before `initSheetwrite()` reports `initialization-required`, an engine change or a concurrent source reports `initialization-failed`, and a `releaseEngineMemory()` preparation that runs out of memory reports `resource-limit` (a trap reports `engine-failed`).
  
  Upgrade checklist:
  
  - If you catch errors from grid or store calls, handle `error.code === "engine-failed"`: destroy the grid, `await initSheetwrite()` and create a new grid from your last saved document. Do not read the failed grid or store for the document.
  - If you check `renderer-fallback` errors by message, use `error.context.failure` instead.
  - If you `switch` over `SheetwriteErrorCode` or `SheetwriteErrorOperation` without a default case, add `engine-failed` and `engine`.

- [#301](https://github.com/chh-ay/sheetwrite/pull/301) [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula help in the cell editor and the formula bar. Autocomplete lists the built-in functions of the active engine and the store's custom functions; an argument guide shows the signature of the function around the caret with the current argument in bold; syntax errors, unknown names and wrong argument counts are underlined while you type; and each reference gets a colour in the text and the same colour on its range in the grid. **Formulas › Formula Auditing › Explain Formula** opens a side panel that describes the formula in the focus cell from function metadata. The function list is an ARIA listbox, and the guide is a polite live region. Formula help loads on the first formula edit, and the panel on first use, so they add almost nothing to the grid's first download. Host editors can use the same analysis: `analyzeFormula(text, cursor, functions)` from `@sheetwrite/core/functions` returns the tokens, references, call at the cursor, completions and problems of a formula. The Formulas tab now always shows; Insert Function in it still needs custom functions.

- [#313](https://github.com/chh-ay/sheetwrite/pull/313) [`3c57cb9`](https://github.com/chh-ay/sheetwrite/commit/3c57cb9e038c94cd17c7fac9a7fff2d01344b03e) Thanks [@chh-ay](https://github.com/chh-ay)! - New `grid.trimMemory()` gives back the memory that an open grid can build again: decoded cell strings, rendered number text, compiled number formats, text measurement and unused overlay nodes, in the grid and in its worker renderer. Document data, undo history and the visible output do not change; the next frame builds only what it paints. Call it on a memory signal or when the page goes to the background. The number format caches are shared by all grids on the page, so a trim drops them for every grid. It does nothing after `destroy()`, and it does not shrink WebAssembly memory (use `releaseEngineMemory()` for that).
  
  The find bar code is now in its own chunk. The grid loads it and builds the find bar DOM when the find bar first opens, not when the grid is created. A grid that never opens the find bar does not download its code and has no `.sheetwrite-find` element. The first Ctrl+F, Ctrl+H or `grid.actions.find()` shows the bar after its chunk loads.
  
  Upgrade checklist:
  
  - If your code or tests look for `.sheetwrite-find` before the find bar opens, open it first with `grid.actions.find()` or Ctrl+F, then wait for the element to appear.
  - If your bundler setup lists the grid's lazy chunks (as for the ribbon and the panels), expect one more chunk for the find bar.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - **Behaviour change:** XLSX and CSV/TSV aborts reject with `signal.reason`, not with a `SheetwriteError` that has `code: "aborted"`.
  
  - `fromXlsxWorkbook`, `fromXlsxWorkbookFile`, `fromXlsxTable`, `toXlsxWorkbook`, `toXlsxTable`, their streams, `buildXlsxModel`, and the CSV/TSV parse and export functions reject, throw or error with `signal.reason` after the signal fires. An abort is not a failure, so it is never a `SheetwriteError`.
  - `parseCsv`, `parseTsv` and `fromCsv` now check `signal` too: before the scan and once per 1,024 records.
  - The XLSX codec checks the signal once per ZIP entry, worksheet and chunk of cells, also while it builds the snapshot. An aborted import keeps no partial snapshot.
  
  **Upgrade checklist:** if your code tells an aborted XLSX or CSV/TSV call apart with `error.code === "aborted"`, check `signal.aborted` (or `error === signal.reason`) instead. Persistence and IndexedDB storage still use `code: "aborted"`.

- [#287](https://github.com/chh-ay/sheetwrite/pull/287) [`dd153bb`](https://github.com/chh-ay/sheetwrite/commit/dd153bb24808b011b90c48cf8d3061a743b7d0e6) Thanks [@chh-ay](https://github.com/chh-ay)! - The toolbar, the full ribbon and a new compact ribbon render one command model. They show the same commands, glyphs, enabled and pressed state, accessible names and keyboard behavior.
  
  - The compact ribbon shows a tab's commands on one row. Set `config.ribbon` to `{ mode: "compact" }`, or to `{ mode: "auto", compactWidth }` to use compact below a width (default 768 px). The **Compact** button beside the tab list switches layout.
  - The toolbar shows the ribbon's commands on one row. Commands that do not fit move into a **More commands** popup. Font Color and Fill Color are palettes, and Borders, Clear and Merge & Center are menus, as in the ribbon.
  - The `GridConfig` command flags (`bold`, `sort`, `export` and the others, typed as `CommandFlags`) now choose commands in the ribbon too. `export: true` adds an Export group with Export CSV and Export XLSX.
  - Every command element has a `data-command` attribute. The old `.sheetwrite-tb-*` classes are gone.
  - The built-in toolbar loads with the ribbon's chunk, so it appears after the grid mounts.
  - The shell toolbar also loads lazily, with its row height reserved. Custom Border, Merge, Unmerge and Clear Formats items keep their one-click behavior.

- [#295](https://github.com/chh-ay/sheetwrite/pull/295) [`9ef07fe`](https://github.com/chh-ay/sheetwrite/commit/9ef07fea96dd5491352ad9ffe54aa5270dc61ff1) Thanks [@chh-ay](https://github.com/chh-ay)! - The ribbon and the toolbar get **Formulas › Insert Function** for custom functions, 16 new glyphs for the 0.7 features, a tab row that scrolls when it is narrow, and new group dividers.
  
  - **Insert Function** lists the functions registered with `registerFunction` (full engine), each with its signature and description as the tooltip. Picking one starts `=NAME(` in the focus cell's editor. The Formulas tab, and the command in the toolbar, show only while the store has a registered function.
  - New glyphs: `insertFunction`, `defineName`, `nameManager`, `explainFormula`, `getData`, `refreshAll`, `queries`, `editLinks`, `relationships`, `dataModel`, `measure`, `dashboard`, `slicer`, `kpiCard`, `versionHistory` and `saveVersion`. `ICON_NAMES`, `IconName` and `@sheetwrite/core/icons.json` list them. They take new rows on the sheet; no published glyph moves, so a replacement sheet drawn for 0.6 still lines up.
  - When the tabs do not fit, the tab row scrolls sideways instead of running under the **Compact** button. Focusing a tab with the keyboard scrolls it into view.
  - The divider between ribbon groups stops short of the panel edges, so each group label reads as the caption of its controls.

- [#306](https://github.com/chh-ay/sheetwrite/pull/306) [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUBTOTAL` and `AGGREGATE` skip hidden rows, as in Excel:
  
  - `SUBTOTAL` accepts codes 101 to 111. All codes skip the rows that a filter hides. Codes 101 to 111 also skip the rows that you hide (`hideRows`) and the rows of a collapsed row group. Before, codes 101 to 111 returned `#VALUE!`.
  - `SUBTOTAL` reads a cell argument, such as `A2` in `=SUBTOTAL(9,A2)`, as a reference: text in the cell is ignored, as in Excel, and the cell's row can be hidden.
  - `SUBTOTAL` skips cells whose formula calls `SUBTOTAL` or `AGGREGATE`, as `AGGREGATE` already did, so a subtotal is not counted two times.
  - `AGGREGATE` options 1, 3, 5 and 7 skip hidden rows. Before, they had no effect.
  - When you hide or show rows, collapse or expand a row group, or change a filter, only the `SUBTOTAL` and `AGGREGATE` formulas that read the sheet calculate again. Core sends the hidden rows of a sheet in one engine call per transaction.
  - New engine export `CellStore.setHiddenRows(sheet, manual, filtered)` sets the hidden rows of a sheet as packed `[first, last]` row ranges. A sheet without hidden rows uses no extra memory.

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

- [#307](https://github.com/chh-ay/sheetwrite/pull/307) [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste, fill and conditional-format rules now rewrite formula references with the engine's own rules (part of [#246](https://github.com/chh-ay/sheetwrite/issues/246)). `=SUM(A:A)` pasted one column right becomes `=SUM(B:B)`, and a name such as `XYZ1`, past the last column, stays a name instead of becoming `#REF!`. A row or column insert, delete or move rewrites whole columns and rows in conditional-format formulas too. Only the references that change are rewritten, so the rest of the formula keeps its spacing and case.
  
  The engines export `translateFormula`, `shiftFormulaAxis` and `moveFormulaAxis`. `shiftA1Refs` from `@sheetwrite/core` now calls the engine, so it needs `initSheetwrite()` first. `rebaseDocumentOperations` needs it too when it moves a conditional format that has a formula.

- [#294](https://github.com/chh-ay/sheetwrite/pull/294) [`f1609ee`](https://github.com/chh-ay/sheetwrite/commit/f1609ee5e6ffb6a77226780a94827e2fcc493ec5) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX and CSV failures stay small:
  
  - An XLSX error message keeps at most 8 KiB of text from the file, from the start and the end, and keeps the decoding error as its `cause`.
  - One XLSX conversion reports at most 64 warnings to `onWarning`.
  - `DelimitedTextOptionsError.context` keeps a number option value, or only `valueType` for any other value, never a copy of it.
  - A registered XLSX backend name in a failure context is cut to 256 characters.

- [#293](https://github.com/chh-ay/sheetwrite/pull/293) [`2db15ef`](https://github.com/chh-ay/sheetwrite/commit/2db15efe6fa4d9d2948528d504281af9d72d16cd) Thanks [@chh-ay](https://github.com/chh-ay)! - In Safari (WebKit), a ribbon or toolbar menu opened from the keyboard stays open. Before, focus on the first menu item scrolled the page, and the scroll closed the menu at once. A page scroll now closes a ribbon or toolbar popup only when its button moves, so a late scroll event for an earlier scroll does not close a menu that just opened.

- [#300](https://github.com/chh-ay/sheetwrite/pull/300) [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e) Thanks [@chh-ay](https://github.com/chh-ay)! - A row or column insert that a sheet cannot hold changes nothing. `addRows`, `removeRows`, `insertCols` and `removeCols` return `false` for a dense sheet that would pass its cell limit or a row count that overflows, and the store rejects the operation instead of moving formulas, charts or metadata for cells that did not move. `addPagedSheet` throws for a chunk size above 1048576 rows.
- Updated dependencies [[`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b), [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e), [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f)]:
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
