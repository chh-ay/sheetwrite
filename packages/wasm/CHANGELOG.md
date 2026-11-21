# @sheetwrite/wasm

## 0.7.0

### Minor Changes

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter dropdown counts rows. Each value shows how many rows hold it ("North 12"), as do a date column's years, months and days, and OK counts the rows the choice keeps, live: "OK (12 of 48 rows)". The engine returns the counts with the distinct values, in the same scan. A column whose own filter is a value list no longer scans the column a second time to tick its values.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - The AutoFilter treats a date column as Excel does. A number whose cell has a date format is a date, and a column of mostly dates offers Date Filters. The value list groups dates by year, month and day, and each value shows as its cell shows it (`$39.50`, not `39.5`). Before, only the column's own type and format counted.
  
  Date Filters adds Excel's periods: Tomorrow, Today, Yesterday, the next, this and last week, month, quarter and year, Year to Date, and All Dates in the Period. They are the new `ColumnFilter` kind `{ kind: "dynamic", type }`, typed `DynamicDateFilter`, with Excel's XLSX `dynamicFilter` names; `isDynamicDateFilter(name)` checks a name. XLSX import and export keep them, and export names a value list's numbers by their cells' text.

- [#736](https://github.com/chh-ay/sheetwrite/pull/736) [`2c06012`](https://github.com/chh-ay/sheetwrite/commit/2c0601238ee6b574f66bb10fab3e8a6515a2002b) Thanks [@chh-ay](https://github.com/chh-ay)! - Excel's AutoFilter, in the document model. `Grid.setAutoFilter(range)` turns filter buttons on for a range whose first row is the header, and `setAutoFilter(null)` turns them off; with an AutoFilter, column filters hide only the range's rows below the header, so the header, and rows above and below the range, always show. `getAutoFilter()` reads it and `reapplyFilter()` filters again after edits, as Excel's Reapply. The sheet's `autoFilter` saves with the snapshot, syncs to collaborators, follows inserted and deleted rows and columns, and is one undo step.
  
  A new column filter, `{ kind: "custom", join, conditions }`, holds Excel's custom AutoFilter: one or two conditions (equals, does not equal, greater or less than, begins with, ends with, contains, does not contain), joined by AND or OR. They match as COUNTIF criteria do, wildcards and blanks included.
  
  Column filters now keep through inserted and deleted rows, and move with their columns when columns are inserted, deleted or moved; before, any row or column edit cleared them.
  
  XLSX import reads a worksheet `<autoFilter>`, with value lists, custom filters and non-blank filters, instead of dropping it with a warning; rows the filter hid in Excel become filtered rows, not hidden ones. Export writes `<autoFilter>`, the `_xlnm._FilterDatabase` name and, when it comes from a grid or store, the rows the filter hides, so Excel opens the file filtered.

- [#743](https://github.com/chh-ay/sheetwrite/pull/743) [`4b5d9d2`](https://github.com/chh-ay/sheetwrite/commit/4b5d9d22f92abbab7acf55f95ed9f08f5d40bb1b) Thanks [@chh-ay](https://github.com/chh-ay)! - Excel's AutoFilter in the grid. Data › Filter, Ctrl+Shift+L and `grid.actions.toggleAutoFilter()` turn filter buttons on for the table, selected range or current region around the focus cell, and off again. Each header cell of the range shows a button, a funnel when its column is filtered. The button, or Alt+Down on the header cell, opens a dropdown: sort, Clear Filter From, Number, Text or Date Filters with Excel's Custom AutoFilter dialog, and a searchable value list with (Select All) and (Blanks). It lists the values of the rows the other columns' filters keep, as Excel does. The dropdown is a labelled dialog with a multi-select listbox, fully usable from the keyboard, and loads on first open.
  
  Data › Clear and Reapply, `clearFilters()`, `reapplyFilter()` and `filterBySelection()` join the ribbon, and a Filter submenu (filter by the selected cell's value, reapply, clear the column's filter) joins the cell context menu. Filtering keeps the selection on the header, and while a filter or hidden rows hide rows, row headers show the sheet's row numbers, as in Excel.

- [#286](https://github.com/chh-ay/sheetwrite/pull/286) [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can register synchronous JavaScript functions that formulas call, on the full engine (`@sheetwrite/formulas`). Import `registerFunction(store, metadata, implementation)` and `unregisterFunction(store, name)` from `@sheetwrite/core/functions`; an application that does not import that entry carries none of its JavaScript, and the default engine binary does not change. On the default engine, `registerFunction` throws a `SheetwriteError` with code `optional-backend-unavailable`. A thrown error or a result that is not a number, text, boolean or `null` shows `#VALUE!`. A workbook that calls a function that is not registered shows `#NAME?`. `listFunctions(store)` returns the metadata of the built-in functions of the active engine and of the host functions in one list.

- [#797](https://github.com/chh-ay/sheetwrite/pull/797) [`9571bc1`](https://github.com/chh-ay/sheetwrite/commit/9571bc1cc57ceb07fbb5aef41f6bb50d46003b41) Thanks [@chh-ay](https://github.com/chh-ay)! - Cut and paste moves cells, as Excel's Cut and Paste does. Cut no longer empties its cells: it marks them with a moving dashed border, and the next paste moves their values, formulas, formats, notes, hyperlinks and merged cells with one new `moveCells` document operation. Every formula, defined name and chart that refers to a moved cell follows it, on the same sheet or to another one, and a reference to a cell the paste replaces becomes `#REF!`, as in Excel. A formula inside the moved block keeps pointing at the same cells. Esc, an edit, another copy or a structural change ends the cut. The move is one undo step and syncs as one operation; rebase treats it like a row move. The `"cut"` commit reason is no longer emitted.
  
  The engines add `CellStore.moveCells` and `CellStore.moveCellsLosses`.

- [#834](https://github.com/chh-ay/sheetwrite/pull/834) [`5567f11`](https://github.com/chh-ay/sheetwrite/commit/5567f11476424676b6a48698fadb464667f40194) Thanks [@chh-ay](https://github.com/chh-ay)! - Cut and paste moves validation and conditional-format rules whose range lies inside the cut cells, as Excel does, and undo puts them back. A conditional-format formula follows the moved cells as a moved formula does, and a rule whose whole range the paste lands on goes. A range down to a sheet's last row or column no longer counts as a whole row or column when a cut moves its edge; only one that reaches Excel's sheet edge does.
  
  The engines add `moveFormulaCells`.

- [#478](https://github.com/chh-ay/sheetwrite/pull/478) [`4b705e2`](https://github.com/chh-ay/sheetwrite/commit/4b705e28bf9a003192d234b7e3becd385fe1481b) Thanks [@chh-ay](https://github.com/chh-ay)! - Dashboards show PivotCharts ([#231](https://github.com/chh-ay/sheetwrite/issues/231)). `ChartDefinition.pivot` names a pivot on the same sheet; the chart shows its row items as categories and each value field, for each column item, as a series, without subtotals or totals, as an Excel PivotChart does. The new `DashboardChartItem` (`kind: "chart"`) shows such a chart in a dashboard box, and **Insert › Charts › PivotChart** adds both in one undo step. Slicers filter the chart with its pivot.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Data › Data Validation opens Excel's Data Validation dialog for the selection, with Settings, Input Message and Error Alert tabs, Clear All, and "Apply these changes to all other cells with the same settings". OK applies the rule to the selected cells as one undoable step; a larger rule keeps its other cells. When the selection holds several kinds of rule, or cells with and without one, Excel's question comes first. The command is also `grid.actions.dataValidation()`.
  
  `DataValidationCondition` gains Excel's other Allow choices: `{ kind: "any" }`, `{ kind: "time" }`, `{ kind: "custom", formula }`, and a list whose items come from a range or a defined name, `{ kind: "list", source: "=$H$2:$H$5" }` or `"=Regions"`; the list shows the cells' current values. Comparison bounds may be formulas, such as `"=TODAY()"`. `DataValidationRule.inCellDropdown: false` hides a list's arrow and list, as Excel's "In-cell dropdown" does. Formulas are relative to the rule's top-left cell and follow inserted and deleted rows and columns. A list compares text without case, and a text length rule measures numbers too, as in Excel.
  
  XLSX import and export keep every Data Validation type, formula sources and bounds, and the dropdown flag. Before, formula-based rules and the time, custom and any-value types were dropped.
  
  The engine's `previewFormulaWith` evaluates a formula as if a cell held a given value, without changing the store; a custom rule checks a typed value with it before the value is stored.

- [#343](https://github.com/chh-ay/sheetwrite/pull/343) [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911) Thanks [@chh-ay](https://github.com/chh-ay)! - Add defined-name formulas and a lazy Name Manager under Formulas › Defined Names in the ribbon, compact ribbon, and toolbar. Names can hold constants, calculated values, references, or a reusable LAMBDA. Saves and deletes use document transactions, undo/redo, and collaboration.
  
  Plain named formulas evaluate in both engines. Named LAMBDA calls require the full engine; the default engine keeps and round-trips definitions but returns `#NAME?` when called. Recursive calls stop at 64 nested calls with `#NUM!`, below Excel's parameter-dependent allowance.
  
  A concurrent structural edit and a named-formula edit conflict and force a document reload. The pending edit remains available for host recovery; it is not rewritten across the remote structural edit.
  
  Keep defined-name formulas and scope in native XLSX. The engine converts Excel's future-function, LET binding, and LAMBDA parameter prefixes without changing quoted text or reference names. Formula-name conversion reuses the document engine or releases a temporary instance; range-only workbooks do not load one.

- [#609](https://github.com/chh-ay/sheetwrite/pull/609) [`d0a0d35`](https://github.com/chh-ay/sheetwrite/commit/d0a0d35b07be55eee33a7fdefe95890989386b75) Thanks [@chh-ay](https://github.com/chh-ay)! - Remove superseded column writers and unused history methods. CI now rejects an engine binding with no package, test or benchmark caller unless its Rust docs give an intentional public-API reason. The scalar setters and `clearCell`, sheet dimensions and window dimensions stay public. Query resource counters stay public because benchmark probes check cache construction and owned-string counts.
  
  Removed: `CellStore.setColumnNumbers`, `CellStore.setColumnStrings` and `CellStore.setColumnStringsPacked`; use `setColumnBlockPacked`, `setBlockPacked` or `setSparseBlock` instead.
  
  Removed: `DiffKernel.clearPage`; consume the page arrays, then call `compare` to start the next page instead. Removed: `DiffKernel.pageLength`; use the length of a returned page array instead.

- [#392](https://github.com/chh-ay/sheetwrite/pull/392) [`c67bb48`](https://github.com/chh-ay/sheetwrite/commit/c67bb489582f6920810aeba2f020ae5d4bec6266) Thanks [@chh-ay](https://github.com/chh-ay)! - More Excel statistics functions ([#277](https://github.com/chh-ay/sheetwrite/issues/277)):
  
  - Both engines add `AVERAGEA`, `MAXA`, `MINA`, `STDEVA`, `STDEVPA`, `VARA` and `VARPA`. A logical value counts as 1 or 0 and text in a reference counts as 0. Text typed as an argument is read as a number. Empty cells are skipped.
  - The full engine adds `BINOM.DIST.RANGE`, `BINOM.INV`, `HYPGEOM.DIST` and `NEGBINOM.DIST` (with the cumulative form), `GAMMALN.PRECISE`, and the current test names `CHISQ.TEST`, `F.TEST`, `T.TEST` and `Z.TEST`.

- [#399](https://github.com/chh-ay/sheetwrite/pull/399) [`b08cb80`](https://github.com/chh-ay/sheetwrite/commit/b08cb80b3d3a29e34336b2c9cf65f4b8fae74840) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines add Excel's information functions `ERROR.TYPE`, `INFO`, `ISEVEN`, `ISODD`, `ISNONTEXT`, `ISREF`, `SHEET` and `SHEETS` ([#278](https://github.com/chh-ay/sheetwrite/issues/278)). `SHEET` and `SHEETS` count every sheet in tab order, hidden sheets too, and recompute when a sheet is added, removed, renamed or moved.
  
  `INFO` returns the sheet count for `"numfile"` and `"Automatic"` for `"recalc"`. It returns `#N/A` for `"directory"`, `"origin"`, `"osversion"`, `"release"` and `"system"`, which describe the desktop program. `STOCKHISTORY` stays unsupported by design, with the other external data functions.

- [#401](https://github.com/chh-ay/sheetwrite/pull/401) [`916b452`](https://github.com/chh-ay/sheetwrite/commit/916b452044664a2753150a7e061c6d08b369f5f4) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines add `LOOKUP` and `TRIMRANGE` ([#280](https://github.com/chh-ay/sheetwrite/issues/280)). `LOOKUP` has the vector form and the array form, which searches the first row of an array wider than it is tall and the first column otherwise. `TRIMRANGE` removes leading and trailing blank rows and columns; a range with no value is `#REF!`, as in Excel.
  
  `GETPIVOTDATA` is not added yet: formulas cannot read pivot results until the pivot API can answer a field and item query.

- [#377](https://github.com/chh-ay/sheetwrite/pull/377) [`d5af8e5`](https://github.com/chh-ay/sheetwrite/commit/d5af8e520ba50789eb70a6eca50c37691a8f3615) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort rows in Excel's sort order. Text compares without case, in Excel's documented character order, and skips apostrophes and hyphens. Errors sort after `FALSE` and `TRUE` and are equal to each other. Blank cells are last in both directions. This changes the order of existing view sorts that have mixed-case text, errors, or blank cells in a descending sort.

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

- [#451](https://github.com/chh-ay/sheetwrite/pull/451) [`2ef581a`](https://github.com/chh-ay/sheetwrite/commit/2ef581aa7730a70b86f5a1c4887c777f48b233b0) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines hold the cached values of linked workbooks ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). `CellStore.addExternalSheet(book, sheet, columns, rows)` adds a sheet of a linked workbook and returns its handle; the cell setters on that handle set its values. References such as `[Budget.xlsx]Annual!C10` and `SUM('C:\Reports\[Budget.xlsx]Annual'!C10:C25)` read those values. The folder and letter case do not matter. A change to the values recalculates the formulas that read them. A link sheet is not a tab: `SHEETS`, 3-D references and the tab order do not include it. A reference to a link the store does not hold is still `#REF!`.
  
  A quoted reference with a drive in its path, such as `'C:\Reports\[Budget.xlsx]Annual'!C10`, is no longer read as a 3-D reference.

- [#430](https://github.com/chh-ay/sheetwrite/pull/430) [`8a75714`](https://github.com/chh-ay/sheetwrite/commit/8a7571407979f2c6b347335c949b8b0ad366b5cd) Thanks [@chh-ay](https://github.com/chh-ay)! - Formulas accept references to cells in other workbooks, in Excel's forms: `[Budget.xlsx]Annual!C10`, `SUM([Budget.xlsx]Annual!C10:C25)`, `'[Budget 2024.xlsx]Annual Plan'!C10` and `'C:\Reports\[Budget.xlsx]Annual'!C10` ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). Before, the unquoted form was a syntax error, and a quoted form made the whole formula `#REF!`. The formula text now stays as written. A copy moves relative references, as in Excel. Row, column and sheet edits in this workbook do not change them. Without values for the other workbook, a reference shows `#REF!`; `IFERROR` and the other error functions handle it as an error value. A sheet of the same name in this workbook is never read in its place.

- [#788](https://github.com/chh-ay/sheetwrite/pull/788) [`abbd833`](https://github.com/chh-ay/sheetwrite/commit/abbd833c1b778fd542e498183c9cae15a80b61f0) Thanks [@chh-ay](https://github.com/chh-ay)! - Find takes Excel's wildcards and looks in formulas by default, as Excel's Find does.
  
  - `*` matches any run of characters, `?` one character, and `~` makes the next `*`, `?` or `~` literal. A search for a literal `*` or `?` now needs `~*` or `~?`.
  - A formula cell is searched by its formula text unless the new `SearchOptions.lookIn` is `"values"`. `grid.search("A1")` finds `=A1*2`, and a search that used to match a formula's result needs `lookIn: "values"`.
  - Replace rewrites formula text when looking in formulas, and replaces what a wildcard pattern matches. A replacement that would leave a formula the engine cannot read leaves that cell unchanged.
  - `SheetwriteStore.searchCells` and `searchCellsFlat` take the same `lookIn` option, and the engine's `search` takes a sixth argument, `formulas`.

- [#644](https://github.com/chh-ay/sheetwrite/pull/644) [`4c3de4c`](https://github.com/chh-ay/sheetwrite/commit/4c3de4c4d0b72742ea61d07465a7c1b24f23c316) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula help previews the result of a formula while you type. The engines add `previewFormula`, which evaluates a formula text in a cell without changing the store, and `@sheetwrite/core/functions` exports `previewFormula` for host editors. RAND, RANDBETWEEN and host functions are never run for a preview, and a preview that would read or build too much returns `cost-limit`. A range read is charged before its cells are scanned, so once a preview passes a limit no later range read scans any cells, even where `IFERROR` catches the refusal.

- [#301](https://github.com/chh-ay/sheetwrite/pull/301) [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines export `formulaTokens(text)` and `checkFormulaSyntax(text)`. `formulaTokens` returns the tokens of formula text from the engine's own lexer as a `Uint32Array`, four numbers per token: the kind, the start and end as UTF-16 offsets, and 1 when whitespace comes before the token. It does not stop at an error: an open quote or bracket becomes one bad token to the end of the text. `checkFormulaSyntax` returns the first error of the engine's parser with its span, its message and an `incomplete` flag for a formula that ends too early, or `undefined`. Formula help in `@sheetwrite/core` uses them, so it marks exactly the formulas that the engine rejects. The parser's error messages are now sentences that a user can act on, such as "Add ) to close the (.".

- [#405](https://github.com/chh-ay/sheetwrite/pull/405) [`4727a3d`](https://github.com/chh-ay/sheetwrite/commit/4727a3de909c0645d11a0dc74196fecfea68008c) Thanks [@chh-ay](https://github.com/chh-ay)! - Compare two history versions ([#228](https://github.com/chh-ay/sheetwrite/issues/228)). `HistoryArchive.diffVersions({ from, to, cursor, maxEntries, signal, kernel })` from `@sheetwrite/core/history` returns one page of at most 1,000 changes: changed cells as typed columns (`HistoryDiffCells`: sheet, row, column, earlier position, `HistoryDiffFlag` bits and last writer), the before and after of each cell (`HistoryDiffDetail`), sheets added, removed or changed outside their cells (`HistoryDiffSheet`), changed workbook fields and a `cursor` for the next page. Sources and styles are compared by content, not calculated values. Rows and columns are aligned through the structural operations of the log, and each change names the last person whose write reached the cell. The comparison runs in a separate history-only WASM kernel, `@sheetwrite/wasm/history` (16.6 KB gzip, no formula engine), that loads on the first diff; the default and full engines do not change. `HistoryVersion.checkpoints` and `HistoryHead.checkpoints` list the checkpoints made since the previous marker, so the log between two retained versions stays readable.

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

- [#499](https://github.com/chh-ay/sheetwrite/pull/499) [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11) Thanks [@chh-ay](https://github.com/chh-ay)! - Moving rows or columns (`moveRows`, `moveColumns`) moves the cells, as Excel's Cut and Insert Cut Cells does, and every reference in the workbook follows the cells it names. Before, a move ran as a delete and an insert: references to the moved cells became `#REF!`, and a moved formula read the cells that took its old place. A range loses a moved row or column at its edge and grows by a block that lands inside it, as in Excel, and undo restores the formulas that lost a row or column. A move that would split a table is refused, as in Excel.
  
  The engines add `CellStore.moveRows`, `CellStore.moveCols` and `CellStore.moveLosses`. `CellStore.moveNamedFormulaSource` is removed: the engine moves defined-name formulas itself.

- [#565](https://github.com/chh-ay/sheetwrite/pull/565) [`6525a47`](https://github.com/chh-ay/sheetwrite/commit/6525a470ab709feaa5973916e131782e8dad9e14) Thanks [@chh-ay](https://github.com/chh-ay)! - The pivot field list reads a field's distinct values from the engine in one call over the pivot's source rows, instead of reading the source column in windows. Dashboard pivot outputs and pivot source fields hand their buffers over instead of copying them. Results are unchanged.
  
  - `CellStore.distinctValuesInRows(sheet, col, startRow, endRow, limit)` returns the distinct values of one column over a range of data rows.
  
  Removed: `PivotOutput.kinds()`, `numbers()` and `texts()`; use `takeKinds()`, `takeNumbers()` and `takeTexts()` instead.
  Removed: `PivotFields.names()` and `types()`; use `takeNames()` and `takeTypes()` instead.

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

- [#571](https://github.com/chh-ay/sheetwrite/pull/571) [`698c8ae`](https://github.com/chh-ay/sheetwrite/commit/698c8ae546cf11cf40fdf96ce222c1b788800794) Thanks [@chh-ay](https://github.com/chh-ay)! - Snapshot hydration, datasource pages and transaction writes pass a block's text cells to the engine as one UTF-8 buffer instead of one JavaScript string per cell. Results are unchanged.
  
  Removed: the `texts: string[]` argument of `CellStore.setSparseBlock`; pass `textBuf` and `textOffsets`, as `setBlockPacked` takes them, instead.

- [#306](https://github.com/chh-ay/sheetwrite/pull/306) [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUBTOTAL` and `AGGREGATE` skip hidden rows, as in Excel:
  
  - `SUBTOTAL` accepts codes 101 to 111. All codes skip the rows that a filter hides. Codes 101 to 111 also skip the rows that you hide (`hideRows`) and the rows of a collapsed row group. Before, codes 101 to 111 returned `#VALUE!`.
  - `SUBTOTAL` reads a cell argument, such as `A2` in `=SUBTOTAL(9,A2)`, as a reference: text in the cell is ignored, as in Excel, and the cell's row can be hidden.
  - `SUBTOTAL` skips cells whose formula calls `SUBTOTAL` or `AGGREGATE`, as `AGGREGATE` already did, so a subtotal is not counted two times.
  - `AGGREGATE` options 1, 3, 5 and 7 skip hidden rows. Before, they had no effect.
  - When you hide or show rows, collapse or expand a row group, or change a filter, only the `SUBTOTAL` and `AGGREGATE` formulas that read the sheet calculate again. Core sends the hidden rows of a sheet in one engine call per transaction.
  - New engine export `CellStore.setHiddenRows(sheet, manual, filtered)` sets the hidden rows of a sheet as packed `[first, last]` row ranges. A sheet without hidden rows uses no extra memory.

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

### Patch Changes

- [#574](https://github.com/chh-ay/sheetwrite/pull/574) [`9617540`](https://github.com/chh-ay/sheetwrite/commit/961754098df68b2eca3a04e3368beff7a63fbf72) Thanks [@chh-ay](https://github.com/chh-ay)! - Array formulas whose size comes from a cell, such as `=SEQUENCE(C1)`, now spill in every formula of a recalculation; the third and later ones no longer show `#NUM!`.

- [#666](https://github.com/chh-ay/sheetwrite/pull/666) [`4d3db35`](https://github.com/chh-ay/sheetwrite/commit/4d3db355df092c6843fbb33252a5b81e776ed276) Thanks [@chh-ay](https://github.com/chh-ay)! - Defining, changing or removing a defined name is faster in workbooks with many formulas: only the formulas that use the name, directly or through another name, are read again, instead of every formula of the workbook. The same holds when a row or column edit, a moved block, a removed sheet or a table edit changes a name.

- [#637](https://github.com/chh-ay/sheetwrite/pull/637) [`5dde259`](https://github.com/chh-ay/sheetwrite/commit/5dde259b3d674b471d8a5aae435f6ff84b9cee0d) Thanks [@chh-ay](https://github.com/chh-ay)! - Formulas use less memory: each node of a parsed formula is 24 bytes instead of 48 in WebAssembly, and references to other sheets are bound to the sheet while the formula is parsed. A formula that names a sheet that does not exist yet shows `#REF!` until that sheet is added or renamed to that name; then only the formulas that name it are updated, without parsing every formula again. References to other workbooks keep their exact text.

- [#648](https://github.com/chh-ay/sheetwrite/pull/648) [`8c22120`](https://github.com/chh-ay/sheetwrite/commit/8c22120da1f132be97be059eb99b536f1ba6c380) Thanks [@chh-ay](https://github.com/chh-ay)! - Editing a table is faster in workbooks with many formulas: table references are bound to the table while the formula is parsed, and the table's names are kept once, in the table, instead of in every formula. Adding, resizing, renaming or removing a table updates only the formulas that use it, without parsing every formula again, and appending rows leaves `[@Column]` formulas alone. A formula that names a table that does not exist yet shows `#NAME?` until that table is added, and keeps the text it was written with.

- [#603](https://github.com/chh-ay/sheetwrite/pull/603) [`e60813b`](https://github.com/chh-ay/sheetwrite/commit/e60813bde81fe58fe38afbe1098f4155a4356ea6) Thanks [@chh-ay](https://github.com/chh-ay)! - Text functions and the `&` operator read their text arguments in place instead of copying each one first, and `LEFT`, `RIGHT` and `MID` copy only the part they return. Formulas such as `=A1&" "&B1` or `=MID(A1,5,1)` recalculate about a quarter faster. Results do not change.

- [#639](https://github.com/chh-ay/sheetwrite/pull/639) [`70865bb`](https://github.com/chh-ay/sheetwrite/commit/70865bb498b9533c68ae8bec2f4fe090ee648ac7) Thanks [@chh-ay](https://github.com/chh-ay)! - Chart tracking no longer refreshes every formula-backed chart after unrelated value edits. While a chart tracker is attached, both engines report bounded rectangles of recomputed formulas and changed spill and pivot cells, and core names only charts whose sources intersect them. Overflow and custom stores keep the conservative refresh.

- [#318](https://github.com/chh-ay/sheetwrite/pull/318) [`3644d27`](https://github.com/chh-ay/sheetwrite/commit/3644d278220a06a4701bb53e9ad98efb5a108353) Thanks [@chh-ay](https://github.com/chh-ay)! - Remove redundant formula-transfer work, share criteria aggregation rules, and remove unused XLSX and declaration code. Correct engine safety and XLSX ownership comments without changing public behavior.

- [#562](https://github.com/chh-ay/sheetwrite/pull/562) [`af73fea`](https://github.com/chh-ay/sheetwrite/commit/af73fea9d637ff76cfc0ce6757d9098216011405) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUM`, `AVERAGE`, `COUNT` and `COUNTA` over a column of numbers read the column in one pass that keeps only what each needs, so they are faster on every machine; on Apple Silicon the previous column fold was slower than reading cell by cell. `MIN` and `MAX` keep their speed. Results do not change.

- [#702](https://github.com/chh-ay/sheetwrite/pull/702) [`045ded3`](https://github.com/chh-ay/sheetwrite/commit/045ded3ab9d4e288952a5eaf965b05457deb4337) Thanks [@chh-ay](https://github.com/chh-ay)! - Conditional-format formula rules evaluate their parsed formula in place at each visible cell instead of copying it for every cell. A window read no longer allocates for the formula at each cell. Results do not change.

- [#517](https://github.com/chh-ay/sheetwrite/pull/517) [`a13996c`](https://github.com/chh-ay/sheetwrite/commit/a13996cdbdfc503da1105a7f43716e0817d5b1fa) Thanks [@chh-ay](https://github.com/chh-ay)! - `COUNTIF(S)`, `SUMIF(S)`, `AVERAGEIF(S)`, `MAXIFS` and `MINIFS` over single columns of typed-in values test each criterion down its whole column into a row mask, then read only the matched rows. Checking that a range holds only typed-in values, which these functions and `SUMPRODUCT`, `PERCENTILE.INC`, `CORREL` and `COVARIANCE` do first, reads the column in one pass without a branch per cell. No formula result changes.

- [#642](https://github.com/chh-ay/sheetwrite/pull/642) [`de829a5`](https://github.com/chh-ay/sheetwrite/commit/de829a5b93c79d197bd12262d610797fd518fb25) Thanks [@chh-ay](https://github.com/chh-ay)! - Criteria functions and `SUMPRODUCT` share the range view's borrowed literal columns. Criteria folds use one row-major reader for formula and paged cells, preserving error and loading order without materializing whole ranges.

- [#889](https://github.com/chh-ay/sheetwrite/pull/889) [`9144766`](https://github.com/chh-ay/sheetwrite/commit/9144766700cebc78f635b041c4136e81018cf367) Thanks [@chh-ay](https://github.com/chh-ay)! - A formula that uses a defined name now holds the name's id instead of a copy of its formula. Defining, changing or removing a name, and row and column edits in workbooks with names, are about twice as fast, and workbooks with many name uses keep less memory. A name whose formula has relative references is read in place for each cell that uses it instead of in a copy.

- [#425](https://github.com/chh-ay/sheetwrite/pull/425) [`85f214a`](https://github.com/chh-ay/sheetwrite/commit/85f214a1e3b5467a3fede1516e273eb6dff396dd) Thanks [@chh-ay](https://github.com/chh-ay)! - Defined names that hold a formula are resolved once for every formula that uses them, not cached per using sheet. A name whose expansion depends on the using cell or sheet is still expanded where it is used. Name results do not change.

- [#385](https://github.com/chh-ay/sheetwrite/pull/385) [`0975f07`](https://github.com/chh-ay/sheetwrite/commit/0975f07912d62896d239adf449b3552944728c24) Thanks [@chh-ay](https://github.com/chh-ay)! - `COUNTIF` with a number criterion (`=COUNTIF(A1:A100000,">5")`) is now 11–18 times faster when its range holds only number values. It compares the stored numbers directly instead of reading each cell. Ranges with text, blanks, formulas or paged storage, and text or wildcard criteria, use the cell reader as before. No formula result changes.

- [#367](https://github.com/chh-ay/sheetwrite/pull/367) [`2270082`](https://github.com/chh-ay/sheetwrite/commit/2270082dd02bf5fc3f9e5452776991a54831bc27) Thanks [@chh-ay](https://github.com/chh-ay)! - Store formula entries in workbook-owned slots with stable numeric ids. Recalculation collects affected ids in a bitset and one flat worklist. Indexed pass state replaces the formula result map and visiting set. Row and column edits keep surviving formula ids, and memory transfers continue to use cell addresses.
  
  Vacant slots hold the free-list links without separate list allocations.
  
  Entry storage grows in small pages, so loading formulas does not repeatedly move the whole formula table.

- [#725](https://github.com/chh-ay/sheetwrite/pull/725) [`3138c97`](https://github.com/chh-ay/sheetwrite/commit/3138c979d68adde57754390dd5f5a0b4633e042f) Thanks [@chh-ay](https://github.com/chh-ay)! - The API reference describes the snapshot getters, the parameters and results of the formula functions, and the loaders' `source` parameter.

- [#972](https://github.com/chh-ay/sheetwrite/pull/972) [`8f3a85b`](https://github.com/chh-ay/sheetwrite/commit/8f3a85b42ef9696c57a7309d655d16cf31304510) Thanks [@chh-ay](https://github.com/chh-ay)! - Distinct-value reads over a column range run several times faster on a column of repeated text: `distinctValues`, AutoComplete's column read, the pivot field list and the AutoFilter dropdown's values and counts. Text that was met before is skipped or counted in one small loop over the column's stored kinds and string ids. The values, their order, counts and formats do not change.

- [#924](https://github.com/chh-ay/sheetwrite/pull/924) [`a435a3c`](https://github.com/chh-ay/sheetwrite/commit/a435a3c2f9a1e7ff031d19fbb7d0d189111be5e3) Thanks [@chh-ay](https://github.com/chh-ay)! - Distinct-value reads that only list values (`distinctValues`, AutoComplete, the pivot field list) mark text with one bit per string again and skip the counts and styles that only the AutoFilter dropdown reads.

- [#906](https://github.com/chh-ay/sheetwrite/pull/906) [`447e6b8`](https://github.com/chh-ay/sheetwrite/commit/447e6b821d539e6892fb8b8401d3fd02224b6d51) Thanks [@chh-ay](https://github.com/chh-ay)! - Distinct-value reads hand their texts to JavaScript as one string with each text's length, instead of one string per value, so JavaScript decodes them in one call. AutoComplete's first typed key, the AutoFilter dropdown of a text column and `grid.distinctValues` read many distinct texts faster. `DistinctColumn` gains `takeTextJoined()` and `takeTextLengths()`; `takeTexts()` is unchanged.

- [#339](https://github.com/chh-ay/sheetwrite/pull/339) [`663d875`](https://github.com/chh-ay/sheetwrite/commit/663d8758dc8a9a12da4b4424b2f028fa61ca4cd6) Thanks [@chh-ay](https://github.com/chh-ay)! - Engine builds now fail if an optimized WebAssembly function exceeds 75,000 bytes, below JavaScriptCore's 100,000-byte optimizing-compiler limit. Build output lists the ten largest functions by name and explains how to split an oversized evaluator. Function names are removed before packaging, so the published WebAssembly bytes do not change.

- [#457](https://github.com/chh-ay/sheetwrite/pull/457) [`c8f462a`](https://github.com/chh-ay/sheetwrite/commit/c8f462a7a867e3c0a5d728bae017462a97636fe3) Thanks [@chh-ay](https://github.com/chh-ay)! - The formula rewrites that follow tab moves, row and column edits, sheet renames, table changes and sheet removal share one walk over a formula's child expressions, which lists every node kind (part of [#250](https://github.com/chh-ay/sheetwrite/issues/250)). A new kind of formula node can no longer be skipped silently by a catch-all arm.

- [#335](https://github.com/chh-ay/sheetwrite/pull/335) [`2c386ac`](https://github.com/chh-ay/sheetwrite/commit/2c386ac3af54cee76c983ee5c4dee4d80a822e17) Thanks [@chh-ay](https://github.com/chh-ay)! - Every function reads number text and wildcard patterns with one rule (part of [#250](https://github.com/chh-ay/sheetwrite/issues/250)):
  
  - Arithmetic and number arguments read text the way `VALUE` does: `="1,000"+0` is 1000, `="50%"*2` is 1 and `="2024-01-31"+0` is 45322. Before, they gave `#VALUE!`. Excel converts text "in a format that would usually be accepted for a number" wherever an operator expects one, and reads date text the same way (`="6/1/2001"-"5/1/2001"` is 31): see Microsoft's [Calculation operators and precedence in Excel](https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel), "How Excel converts values in formulas".
  - Date text must be the whole text, or a date followed by a time: `="2024-01-31 12:00"+0` is 45322.5 and `=VALUE("2024-01-31T06:00")` is 45322.25, but `="2024-01-31 notes"+0`, `=VALUE("2024-01-31 notes")` and `=DAY("2024-01-31 notes")` are `#VALUE!`. Before, `VALUE` and date arguments read the date and ignored the rest of the text.
  - A space inside a number is text, as in Excel: `=VALUE("1 234")` is `#VALUE!`; before, it was 1234. `NUMBERVALUE` still ignores spaces, as documented.
  - A criterion of `inf` or `nan` is text, as in Excel: `=COUNTIF(A1,"inf")` counts a cell with the text `inf`. Before, it compared with an infinite number and counted nothing.
  - In criteria (`COUNTIF`, `SUMIFS`, the database functions) and wildcard lookups (`XLOOKUP` and `XMATCH` match mode 2), `?` matches one character as written, and case folds one character at a time, as in `SEARCH`: `=COUNTIF(A1,"?")` counts `İ`, and `=XMATCH("CAFÉ",A1:A9,2)` finds `café`.

- [#452](https://github.com/chh-ay/sheetwrite/pull/452) [`bebc860`](https://github.com/chh-ay/sheetwrite/commit/bebc860402ca104fa8ebe1c657c41f6af529d371) Thanks [@chh-ay](https://github.com/chh-ay)! - One owner in the engine for each rule that several places copied (part of [#250](https://github.com/chh-ay/sheetwrite/issues/250)): column letters (`ADDRESS`, `INDIRECT` R1C1 text and formula text), transferred error slots, and the walk over a formula's child expressions for the checks that only read a formula (volatile functions, LET, spill references, 3-D references). That walk lists every node kind, so a new kind cannot be skipped by a catch-all. Analysis functions follow one depth rule: a context holds the depth of its call, and arguments evaluate one level deeper.

- [#439](https://github.com/chh-ay/sheetwrite/pull/439) [`2493222`](https://github.com/chh-ay/sheetwrite/commit/2493222a57c88440c474988c15496329423a29d1) Thanks [@chh-ay](https://github.com/chh-ay)! - Engine memory transfer rejects malformed data with an error instead of aborting the engine or panicking later. An array longer than engine memory can hold is an error, not an allocation abort. A range transfer checks its cell kinds, that each string names its own string pool, and that each formula lies inside the range. A store transfer checks that the tab order lists each live sheet once and that sheet lookups, defined names, named ranges, tables and formula read sets name transferred sheets.

- [#329](https://github.com/chh-ay/sheetwrite/pull/329) [`48c8639`](https://github.com/chh-ay/sheetwrite/commit/48c86395551d8fe8db453e65c55b775c6c6d1a31) Thanks [@chh-ay](https://github.com/chh-ay)! - The formula evaluator now keeps most function families (references, conditionals, information, volatile, criteria, lookup, math, statistics, financial) in their own out-of-line handlers; text and date stay inline because moving them out slowed text formulas. Before, wasm-opt folded the evaluator's single-caller helpers into `CellStore::eval_ast`, which grew to 99,911 bytes in the default engine. JavaScriptCore (Bun, Safari) never compiles a WebAssembly function of 100,000 bytes or more with its optimizing tier, so one more small change would have slowed every formula. No formula result changes.

- [#1114](https://github.com/chh-ay/sheetwrite/pull/1114) [`05817a8`](https://github.com/chh-ay/sheetwrite/commit/05817a809a71232ced574b099963d33cb87a75ea) Thanks [@chh-ay](https://github.com/chh-ay)! - Formulas load faster: the engine reads tokens, cell references and whole numbers in formula text with fewer steps. Loading 100,000 formulas takes about 7% less time.

- [#389](https://github.com/chh-ay/sheetwrite/pull/389) [`f25e99a`](https://github.com/chh-ay/sheetwrite/commit/f25e99a640d4291e44c12524c3674d40f647a760) Thanks [@chh-ay](https://github.com/chh-ay)! - Store formula dependency edges in flat arrays with numeric formula ids instead of hash maps of cell lists. Exact readers are kept per source column in row bands, range readers in one array, and the depth and cycle checks use indexed state. Dependency memory is smaller, and small formula edits patch the index in place.

- [#484](https://github.com/chh-ay/sheetwrite/pull/484) [`6bf7d02`](https://github.com/chh-ay/sheetwrite/commit/6bf7d0212f2abea022e63846730722b867abc186) Thanks [@chh-ay](https://github.com/chh-ay)! - Cells waiting for the next recalculation are kept in a flat sorted list instead of a hash set. Formulas made only of values, cell references and operators (`=A1+1`) skip the four metadata walks over their parsed tree that other formulas still need. Loading and editing such formulas, and small edits that start a recalculation, do less work. No formula result changes.

- [#307](https://github.com/chh-ay/sheetwrite/pull/307) [`5620780`](https://github.com/chh-ay/sheetwrite/commit/56207806761765cf486187dd1e72851813f75457) Thanks [@chh-ay](https://github.com/chh-ay)! - Paste, fill and conditional-format rules now rewrite formula references with the engine's own rules (part of [#246](https://github.com/chh-ay/sheetwrite/issues/246)). `=SUM(A:A)` pasted one column right becomes `=SUM(B:B)`, and a name such as `XYZ1`, past the last column, stays a name instead of becoming `#REF!`. A row or column insert, delete or move rewrites whole columns and rows in conditional-format formulas too. Only the references that change are rewritten, so the rest of the formula keeps its spacing and case.
  
  The engines export `translateFormula`, `shiftFormulaAxis` and `moveFormulaAxis`. `shiftA1Refs` from `@sheetwrite/core` now calls the engine, so it needs `initSheetwrite()` first. `rebaseDocumentOperations` needs it too when it moves a conditional format that has a formula.

- [#300](https://github.com/chh-ay/sheetwrite/pull/300) [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e) Thanks [@chh-ay](https://github.com/chh-ay)! - More functions give the Excel result:
  
  - `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `FIXED` and `DOLLAR` round the decimal value that Excel shows: `=ROUND(1.005,2)` is 1.01.
  - A number becomes text with 15 significant digits, as in Excel: `=(0.1+0.2)&""` is `0.3`.
  - `TEXT` applies number format codes: percent, thousands separators, digit placeholders, scientific notation, quoted text and sections (`=TEXT(0.5,"0%")` is `50%`).
  - `CHOOSE`, `INDEX`, `ADDRESS` and other position arguments ignore a fraction: `=CHOOSE(1.5,"a","b")` is `a`. `INDEX` with a zero row or column returns the whole column or row.
  - `ADDRESS`, `MATCH`, `XMATCH` and `XLOOKUP` return an error from an argument instead of `#VALUE!`.
  - `COUNTIF(range,"<>")` and other not-equal criteria count values of another type.
  - `SUMIF` and `AVERAGEIF` read as many sum cells as the criteria range has, from the top-left sum cell.
  - `YEAR(0)`, `MONTH(0)` and `DAY(0)` are 1900, 1 and 0. `DATE` before serial 0 and date parts of a negative serial are `#NUM!`.
  - `FLOOR` and `CEILING` need two arguments, give `#NUM!` for a positive number with a negative significance, and `FLOOR(0.3,0.1)` is 0.3. `CEILING(x,0)` is 0.
  - `REPLACE` with a start past the end appends the new text. `TRIM` removes only spaces, as in Excel.
  - In the full engine, an error argument of a `LAMBDA` reaches its body, so `=LAMBDA(x,IFERROR(x,0))(1/0)` is 0.

- [#387](https://github.com/chh-ay/sheetwrite/pull/387) [`bbd90b0`](https://github.com/chh-ay/sheetwrite/commit/bbd90b0ab1c7f401ec2d0b2d63b0b6250b74b1f7) Thanks [@chh-ay](https://github.com/chh-ay)! - Loading formulas in address order appends to the formula index without a search, and reads the stored entry by its id. Dense columns and large workbooks reserve whole index and slot pages, so loading copies less.

- [#300](https://github.com/chh-ay/sheetwrite/pull/300) [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e) Thanks [@chh-ay](https://github.com/chh-ay)! - Formulas accept more Excel syntax:
  
  - Numbers with an exponent, such as `=1E3` and `=SUM(1.5E-3)`.
  - Whole columns and rows, such as `=SUM(A:A)`, `=SUM($A:$C)` and `=SUM(Sheet2!1:1)`. They read only the rows and columns that the sheet has, keep their column or row through row and column edits and copies, and are written back in this short form. `ROWS(A:A)` is 1048576.
  - A name such as `XYZ1` that is past column XFD or row 1048576 is a name, not a cell.
  - A row or column edit keeps the text of a formula whose references it does not move, so `=A1+B1*2` stays as written.

- [#497](https://github.com/chh-ay/sheetwrite/pull/497) [`c9fc2a8`](https://github.com/chh-ay/sheetwrite/commit/c9fc2a81017afcdb958f5748ac71789a255ad5c2) Thanks [@chh-ay](https://github.com/chh-ay)! - A sheet rename, a sheet delete, a row or column insert or delete, a tab move and a table change keep the formula text as the user wrote it, as Excel does: only the references change. Before, the engine wrote the whole formula again with parentheses around every operator, so `=Sales!A1+1` became `=('Sales Data'!A1+1)`. The same holds for defined-name formulas. The engine writes the new references when the text is read, so a rename over 100,000 formulas takes 116 ms instead of 189 ms, and a row insert 24 ms instead of 88 ms.

- [#888](https://github.com/chh-ay/sheetwrite/pull/888) [`202525e`](https://github.com/chh-ay/sheetwrite/commit/202525e5609ff968522c4171a874cce1ca76f067) Thanks [@chh-ay](https://github.com/chh-ay)! - Fraction and Text number formats work as in Excel.
  
  - Fraction codes such as `# ?/?`, `# ??/??`, `# ???/???`, `# ?/4`, `# ??/16` and `# ??/100` show the closest fraction (or the fixed number of parts) in cells and in `TEXT()`: `5.25` with `# ?/?` shows `5 1/4`. They used to show a rounded whole number in cells and stray digits in `TEXT()`.
  - The Text format `@` shows a number as General would; a cell used to show nothing. What you type into a cell formatted as Text stays text exactly as typed, so `0123` keeps its zero and `=A1` is not a formula.
  - An entry typed into a cell keeps the cell's formatting, as in Excel, with Enter, Tab and Ctrl+Enter alike. It used to clear the cell's style, bold and number format included.
  - Format Cells has the Fraction and Text categories, and the Home number format list has Fraction and Text.
  - `parseCellInput` takes the cell's effective number format as an optional third argument, so a formula bar keeps Text cells' input as text too.

- [#607](https://github.com/chh-ay/sheetwrite/pull/607) [`6f20ac0`](https://github.com/chh-ay/sheetwrite/commit/6f20ac05643466e166490000661d1fcb27ec136b) Thanks [@chh-ay](https://github.com/chh-ay)! - Comparing two versions in version history is faster. The diff kernel finds the last writer of the changed cells in one pass over the write log for each window it compares, instead of one pass per changed cell, and hands each page column to JavaScript without copying it. Pages, their order and the cells they show are unchanged.

- [#1104](https://github.com/chh-ay/sheetwrite/pull/1104) [`1e8ba7d`](https://github.com/chh-ay/sheetwrite/commit/1e8ba7d8701029cb4999de1598a60133ee9be54c) Thanks [@chh-ay](https://github.com/chh-ay)! - `IF` without a `value_if_false` argument now returns `FALSE` when the condition is false, as in Excel: `=IF(1>2,"yes")` shows `FALSE`, not `0`. An empty branch, as in `=IF(TRUE,)` or `=IF(FALSE,1,)`, now shows `0` instead of an empty cell.

- [#594](https://github.com/chh-ay/sheetwrite/pull/594) [`7c3e738`](https://github.com/chh-ay/sheetwrite/commit/7c3e738bda70c72c344514bc33ec2d6fb93e720f) Thanks [@chh-ay](https://github.com/chh-ay)! - Read scalar INDEX results directly from their ranges without constructing a full value matrix. On paged sheets, INDEX now waits only for its selected cell and position arguments, not for unrelated unloaded cells in the area. Its text budget applies only to the selected result, so a short result is no longer rejected because unrelated text exceeds the array-copy budget. The whole-area shape limit remains unchanged. Materialized ranges read in column order through the same range view and retain their text-copy budget.

- [#721](https://github.com/chh-ay/sheetwrite/pull/721) [`c9c24cb`](https://github.com/chh-ay/sheetwrite/commit/c9c24cbca3c8cd6c9cf82787b2abfeebe624f8ca) Thanks [@chh-ay](https://github.com/chh-ay)! - `InitOutput` is described as the raw module output the loader uses, not API to call.

- [#540](https://github.com/chh-ay/sheetwrite/pull/540) [`8ab14dc`](https://github.com/chh-ay/sheetwrite/commit/8ab14dc16bf0d86550b38cda302f0687866aa149) Thanks [@chh-ay](https://github.com/chh-ay)! - LET bindings that are function calls with a single-value result, such as `SUM`, `ROUND` or `XLOOKUP`, now also read from slots resolved when the formula is entered, instead of being copied into every use on every recalculation. Calls that can return a reference or an array (`INDEX`, `CHOOSE`, `OFFSET`, `INDIRECT`, the array functions) keep the previous path; results do not change.

- [#537](https://github.com/chh-ay/sheetwrite/pull/537) [`d41651f`](https://github.com/chh-ay/sheetwrite/commit/d41651fc4865a1602c84b1f635c0df6a16ace46b) Thanks [@chh-ay](https://github.com/chh-ay)! - A LET whose bindings are plain calculations (constants, operators, cells and other bindings) reads its bindings from slots resolved when the formula is entered, instead of copying each binding's expression into every use on every recalculation. Such a LET recalculates with about a quarter of the work and no heap allocation per formula; formulas, written text and results do not change.

- [#449](https://github.com/chh-ay/sheetwrite/pull/449) [`45a0b1f`](https://github.com/chh-ay/sheetwrite/commit/45a0b1f2977df891203bf7685f6e81ee852c2820) Thanks [@chh-ay](https://github.com/chh-ay)! - `COUNTIF`, `COUNTIFS`, `SUMIF`, `SUMIFS`, `AVERAGEIF`, `AVERAGEIFS`, `MAXIFS` and `MINIFS` are now 4–8 times faster over ranges of typed-in values, such as `=SUMIFS(D1:D100000,A1:A100000,">=50000",C1:C100000,"keep")`. They read each cell's stored number, text or logical value in place instead of building a value, and a text copy, for every cell. Ranges with formulas, spilled values or paged storage use the cell reader as before. No formula result changes.

- [#454](https://github.com/chh-ay/sheetwrite/pull/454) [`85367f4`](https://github.com/chh-ay/sheetwrite/commit/85367f46bbbfe784732f4dcad5cb5cc2385118b1) Thanks [@chh-ay](https://github.com/chh-ay)! - `PERCENTILE.INC` with a number as its fraction (`=PERCENTILE.INC(A1:A100000,0.9)`), `CORREL`, `COVARIANCE.S` and `COVARIANCE.P` read ranges of typed-in values in place instead of copying them into lists first. Ranges with formulas, spilled values or paged storage, and computed fractions, use the existing path. No formula result changes.

- [#453](https://github.com/chh-ay/sheetwrite/pull/453) [`725732b`](https://github.com/chh-ay/sheetwrite/commit/725732bbd8767ba6abd1e862a4af88a1acf01228) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUMPRODUCT` over ranges of typed-in values, such as `=SUMPRODUCT(A1:A100000,B1:B100000)`, is now about 4 times faster and no longer copies its ranges into lists first (about 10 MB less temporary memory for two 100,000-row ranges). Ranges with formulas, spilled values or paged storage, and computed arguments, use the existing path. No formula result changes.

- [#719](https://github.com/chh-ay/sheetwrite/pull/719) [`3f52cfc`](https://github.com/chh-ay/sheetwrite/commit/3f52cfc5a3eea8ab2d9bee8a9e9d27f09997b25c) Thanks [@chh-ay](https://github.com/chh-ay)! - A dense sheet that would pass the workbook's dense-cell limit now continues in local pages instead of refusing the edit: the engine moves its cells into pages that are never evicted and always loaded, and the sheet still behaves as a dense sheet. A snapshot that places sheets past `maxDenseCells` loads them the same way. Local sheets share a new workbook-wide limit, `maxLocalPagedCells` (20,000,000 cells by default); an insert past it is rejected with a `local-paged-cells` resource-limit issue, which replaces `dense-cells`. The store gives `maxDenseCells` and `maxLocalPagedCells` to the engine, capped at its ceilings of 5,000,000 and 20,000,000, so core and engine place and refuse sheets the same way. With the default limits an untrusted dense-storage snapshot can now make the engine hold up to 25,000,000 cells instead of 5,000,000; `maxLocalPagedCells: 0` keeps the old ceiling. Releasing engine memory now also returns paged pages that evictions, row deletes or a shrinking local sheet left free.

- [#520](https://github.com/chh-ay/sheetwrite/pull/520) [`cf90c45`](https://github.com/chh-ay/sheetwrite/commit/cf90c45b95e123ea984e06d3361981e76668b9a2) Thanks [@chh-ay](https://github.com/chh-ay)! - An exact `XLOOKUP`, `XMATCH`, `MATCH`, `VLOOKUP` or `HLOOKUP` for a number in a range of typed-in values compares the stored numbers directly instead of building a value per cell. Checking that a lookup range holds only typed-in values reads each column in one pass and counts text sizes only when the column holds text. No formula result changes.

- [#428](https://github.com/chh-ay/sheetwrite/pull/428) [`2625510`](https://github.com/chh-ay/sheetwrite/commit/26255105d445edb7e862ba738654e4cad0b4202d) Thanks [@chh-ay](https://github.com/chh-ay)! - `MATCH`, `XMATCH`, `VLOOKUP`, `HLOOKUP` and `XLOOKUP` search ranges of plain values where they are stored instead of copying them into decoded tables. Formulas that search the same range in one recalculation share one sorted position index, which also covers key columns that mix numbers, text and logical values. The lookup table, list, result, sortedness, type and bucket caches are removed. Results are unchanged.

- [#1113](https://github.com/chh-ay/sheetwrite/pull/1113) [`62aa7f7`](https://github.com/chh-ay/sheetwrite/commit/62aa7f75d802012243bfb1f5a3bf3dc320a8e3a4) Thanks [@chh-ay](https://github.com/chh-ay)! - Defining a chain of names over a name that one sheet redefines, and entering a formula that uses the chain, no longer take time that doubles with each link. A workbook could freeze a tab this way.

- [#431](https://github.com/chh-ay/sheetwrite/pull/431) [`143a647`](https://github.com/chh-ay/sheetwrite/commit/143a647c610af9955e719f8be818a9609ed6d1d9) Thanks [@chh-ay](https://github.com/chh-ay)! - Fix a hang when a chain of defined names uses each next name more than once. Each name is expanded once per formula again, and definitions are resolved in dependency order.

- [#969](https://github.com/chh-ay/sheetwrite/pull/969) [`20d59af`](https://github.com/chh-ay/sheetwrite/commit/20d59af852c8ca82e48c8c80c46e5ba2922b6d60) Thanks [@chh-ay](https://github.com/chh-ay)! - In Node, `initSheetwrite()` and `createEngine()` read the bundled engine file synchronously. The asynchronous read waited on Node's thread pool four times (open, size, read, close) before the engine could compile, which made a cold start about 2 ms slower in the median and up to 20 ms slower in its slowest runs on a busy core.

- [#473](https://github.com/chh-ay/sheetwrite/pull/473) [`1d0cf59`](https://github.com/chh-ay/sheetwrite/commit/1d0cf59764de8ab436a9f9506fad52694cba6d76) Thanks [@chh-ay](https://github.com/chh-ay)! - Search and filter skip writing a number cell out as text when the search text has a character no number's text contains, such as a letter, so searching numeric columns for text is several times faster. Numbers with many significant digits are also written as text faster in formula text, search and filter. Results and matches are unchanged.

- [#436](https://github.com/chh-ay/sheetwrite/pull/436) [`872c448`](https://github.com/chh-ay/sheetwrite/commit/872c448a05577d8b0ed7e00bad48838886980468) Thanks [@chh-ay](https://github.com/chh-ay)! - Write number text with a purpose-built decimal digit writer instead of Rust's float formatting, so both engines download less: about 7 KB less for the default engine and 5.5 KB less for the full engine after Brotli compression. Results are unchanged: ROUND, ROUNDUP, ROUNDDOWN, FLOOR, CEILING, TEXT, `&`, FIXED, DOLLAR and BAHTTEXT, formulas written back after an edit, and search and filter matches on numbers.

- [#476](https://github.com/chh-ay/sheetwrite/pull/476) [`3938183`](https://github.com/chh-ay/sheetwrite/commit/3938183a5454a08b431bacd060bf2c7eff59d6ce) Thanks [@chh-ay](https://github.com/chh-ay)! - A recalculation in which no formula reads another formula writes each result straight to its cell, without a pass result table or a second write loop. Results are unchanged.

- [#482](https://github.com/chh-ay/sheetwrite/pull/482) [`4a50582`](https://github.com/chh-ay/sheetwrite/commit/4a50582a04d3084915a97565e9f5703c9b64f048) Thanks [@chh-ay](https://github.com/chh-ay)! - Recalculation evaluates formulas in dependency order and writes each result straight to its cell. The per-pass result table is gone, which saves about 4.5 B of retained memory per formula, and formula chains recalculate up to 1.15× faster. Results are unchanged.

- [#677](https://github.com/chh-ay/sheetwrite/pull/677) [`7943738`](https://github.com/chh-ay/sheetwrite/commit/794373859a388ae8e880f83b96a6d4b4e736a45a) Thanks [@chh-ay](https://github.com/chh-ay)! - Reading a paged cell now only stamps its page. The eviction order is kept up to date when pages load, are unpinned or are evicted, so paged reads are cheaper while the same pages are evicted in the same order.

- [#712](https://github.com/chh-ay/sheetwrite/pull/712) [`bcf6344`](https://github.com/chh-ay/sheetwrite/commit/bcf63449cc24a98bf5b1af58106b3bd4fd76d7a7) Thanks [@chh-ay](https://github.com/chh-ay)! - Page loads write paged columns a page at a time instead of one cell at a time. Inserting or deleting columns on a paged sheet renumbers its pages in place, keeping local edits, page pins and access order instead of rebuilding every loaded cell.

- [#717](https://github.com/chh-ay/sheetwrite/pull/717) [`34a78aa`](https://github.com/chh-ay/sheetwrite/commit/34a78aaee4de34a70513cd3f59e9e6fcb3c26768) Thanks [@chh-ay](https://github.com/chh-ay)! - Lookups and single-column folds read a paged sheet's loaded cells in place, as they do on a dense sheet. `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `MATCH`, `XMATCH` and `INDEX` over a fully loaded range of literal values use the shared search index and binary search instead of evaluating the range cell by cell (1,000 exact `VLOOKUP`s over a paged table went from about 377 ms to 0.7 ms), and `SUM`, `COUNT`, `COUNTA`, `AVERAGE`, `MIN` and `MAX` over one paged column fold its clean pages a slice at a time. Results are unchanged.

- [#640](https://github.com/chh-ay/sheetwrite/pull/640) [`468bf60`](https://github.com/chh-ay/sheetwrite/commit/468bf6097784953226fcd916bd2c542bcbfe50e8) Thanks [@chh-ay](https://github.com/chh-ay)! - Move loaded paged rows in place when inserting or deleting rows, retaining local edits, page pins and access order instead of rebuilding every loaded cell. Range load checks scan loaded bits without reading cell values or changing eviction order.

- [#698](https://github.com/chh-ay/sheetwrite/pull/698) [`6bd6ed2`](https://github.com/chh-ay/sheetwrite/commit/6bd6ed27ae829859f09e681b987e781fe84b5012) Thanks [@chh-ay](https://github.com/chh-ay)! - A formula reading one cell of a paged sheet looks the cell up once instead of three times.

- [#423](https://github.com/chh-ay/sheetwrite/pull/423) [`e8f34cd`](https://github.com/chh-ay/sheetwrite/commit/e8f34cde93187376d1c0a2855ef4246aaeaba37a) Thanks [@chh-ay](https://github.com/chh-ay)! - Store paged sheets in flat page, dirty-block and calculated-block directories instead of hash maps. Paged edits, acknowledgements, cache eviction and range reads through formulas get faster. Edit, acknowledgement, eviction and unloaded-cell behavior is unchanged.

- [#533](https://github.com/chh-ay/sheetwrite/pull/533) [`22c6721`](https://github.com/chh-ay/sheetwrite/commit/22c672182ec0c52981e7988705706c82c1825cac) Thanks [@chh-ay](https://github.com/chh-ay)! - Recalculation does less work per formula: marking a formula selected, being evaluated or settled no longer calls out of line, and the cell whose formula is being evaluated (read by `ROW()`, `COLUMN()` and R1C1 references) is kept in one value instead of a list. No formula result changes.

- [#1135](https://github.com/chh-ay/sheetwrite/pull/1135) [`711675e`](https://github.com/chh-ay/sheetwrite/commit/711675e441c3ad4293068e8cb805978ebfeda704) Thanks [@chh-ay](https://github.com/chh-ay)! - A recalculation reports each changed pivot table cell once to chart tracking. Before, every changed output cell was reported twice, so a commit that changed a large pivot did twice the chart matching work and reached the report's limit sooner, which made every chart refresh.

- [#1086](https://github.com/chh-ay/sheetwrite/pull/1086) [`f6f2ded`](https://github.com/chh-ay/sheetwrite/commit/f6f2dede3688977a9160ed5342ecb430758b2308) Thanks [@chh-ay](https://github.com/chh-ay)! - An edit finds the formulas that read a cell through a range much faster when many ranges share the cell's columns or rows, as a SUM across each row does. The engine's range index now scans the axis that ends first instead of always the columns. On a sheet with a SUM in each of 10,000 rows, one transaction of 300 one-cell edits took 406 ms in the engine before and 3.4 ms after. Results and recalculation order do not change.

- [#1076](https://github.com/chh-ay/sheetwrite/pull/1076) [`8b480d0`](https://github.com/chh-ay/sheetwrite/commit/8b480d03f060628222bad4f0867eae860bb5be8d) Thanks [@chh-ay](https://github.com/chh-ay)! - A remote edit recalculates only the formulas that read the cells it writes. Before, every remote cell edit that a `SyncCoordinator` applied recalculated every formula on its sheet. The engine gains `beginRemoteLoad`, which the store calls for remote operations instead of `beginPageLoad`: their writes still keep cells with an unacknowledged local edit. Snapshot and datasource page loads still recalculate the whole sheet, and so does a remote edit that writes more than about one cell per 64 formulas of its sheet, where that is cheaper. Values do not change.

- [#659](https://github.com/chh-ay/sheetwrite/pull/659) [`20807c7`](https://github.com/chh-ay/sheetwrite/commit/20807c767aabf2947595e3d9c9d277a0daca728b) Thanks [@chh-ay](https://github.com/chh-ay)! - A batch of formula edits no longer leaves a removed dependency behind. When one recalculation followed more than 16 formula changes reading cells in the same 256-row block of a column, a formula that stopped reading a cell below the others could still be recalculated whenever that cell changed.

- [#593](https://github.com/chh-ay/sheetwrite/pull/593) [`36b9872`](https://github.com/chh-ay/sheetwrite/commit/36b98722374c4a583b331124807c3a3d453701be) Thanks [@chh-ay](https://github.com/chh-ay)! - Single-cell named ranges and table references now return scalar results without creating a one-cell spill owner. References spanning several cells still spill.

- [#711](https://github.com/chh-ay/sheetwrite/pull/711) [`f88abe8`](https://github.com/chh-ay/sheetwrite/commit/f88abe8f838e4205516e9a7801f91d1589a1f238) Thanks [@chh-ay](https://github.com/chh-ay)! - The engine is smaller: the dependency index and the recalculation bookkeeping sort through the shared sorts instead of a copy of the sort for each list. Results and memory use are unchanged.

- [#696](https://github.com/chh-ay/sheetwrite/pull/696) [`7b92775`](https://github.com/chh-ay/sheetwrite/commit/7b92775e23f6aa4d4ecb6bca844f6dc916c55324) Thanks [@chh-ay](https://github.com/chh-ay)! - Sorting rows is about twice as fast for text, mixed and multi-column keys, and for number columns under 4,096 rows, and the engine is about 5 KB smaller (Brotli). Rows keep the same order. A NaN stored with `setNumber` now sorts after every other number; before, its place depended on the sort.

- [#643](https://github.com/chh-ay/sheetwrite/pull/643) [`e7dc14e`](https://github.com/chh-ay/sheetwrite/commit/e7dc14e5184d672b77e8f278ab8d224776705803) Thanks [@chh-ay](https://github.com/chh-ay)! - Formula string literals share their text with evaluated values instead of allocating and copying it on each recalculation. This makes formulas such as `=A1&" "&B1` faster without changing their results. Formula memory accounting includes the shared string's reference counts.

- [#737](https://github.com/chh-ay/sheetwrite/pull/737) [`a4e9d2d`](https://github.com/chh-ay/sheetwrite/commit/a4e9d2d27d05371c5737b4eb9d57d93f962477cf) Thanks [@chh-ay](https://github.com/chh-ay)! - The full engine is about 2 KB smaller (Brotli): SORTBY, GROUPBY, PIVOTBY, FREQUENCY, MODE.MULT and pivot tables sort through the shared sorts instead of their own copies. Results are unchanged, except that pivot child groups which compare equal now keep the order they were first seen in.

- [#687](https://github.com/chh-ay/sheetwrite/pull/687) [`7e65201`](https://github.com/chh-ay/sheetwrite/commit/7e652018cbee5a927eaeaf8ac54df3294c74d961) Thanks [@chh-ay](https://github.com/chh-ay)! - `setSheetName` returns whether it named the sheet. Like `renameSheet`, it refuses an empty name, a name another sheet holds in any case, and another sheet's id.

- [#463](https://github.com/chh-ay/sheetwrite/pull/463) [`dd49f28`](https://github.com/chh-ay/sheetwrite/commit/dd49f284abd25aefae57d78abdde762ac26aedf5) Thanks [@chh-ay](https://github.com/chh-ay)! - Parse formulas in one pass: the parser reads tokens as it lexes them and climbs operator precedence in one loop, and ingest resolves sheets, defined names and table references only for formulas that hold them. Formula loading gets faster; parsed formulas, errors and formula-help messages are unchanged.

- [#586](https://github.com/chh-ay/sheetwrite/pull/586) [`4dc6ace`](https://github.com/chh-ay/sheetwrite/commit/4dc6ace23ba8d3136d533df3fb7d1ef7e7a7dc53) Thanks [@chh-ay](https://github.com/chh-ay)! - `SORT` and `UNIQUE` over a `FILTER` or `UNIQUE` that returns fewer rows than its range, such as `=SORT(UNIQUE(A1:A100))` with repeated values or `=SORT(FILTER(…))`, now return the sorted or distinct rows instead of `#REF!`.

- [#595](https://github.com/chh-ay/sheetwrite/pull/595) [`117bd24`](https://github.com/chh-ay/sheetwrite/commit/117bd242fe39eba7e13a358fad5c01464b342956) Thanks [@chh-ay](https://github.com/chh-ay)! - Loading a snapshot, pasting or writing a block of cells, and loading pages from a datasource with the default dense storage are faster: plain values (numbers, text, `TRUE`/`FALSE` and blanks) are now written one column at a time instead of one cell at a time. Results are unchanged. Writes that include formulas or cell references, sheets that show spilled formula results, and paged datasources still write one cell at a time.

- [#592](https://github.com/chh-ay/sheetwrite/pull/592) [`805b9a7`](https://github.com/chh-ay/sheetwrite/commit/805b9a75f4691f6f3f98095ac621a376bd093312) Thanks [@chh-ay](https://github.com/chh-ay)! - Spilled arrays record which cells they own as one row run per column instead of one entry per cell, so installing, clearing and resizing a spill does less work and a large spill keeps a few bytes of ownership state instead of megabytes. Results do not change.

- [#647](https://github.com/chh-ay/sheetwrite/pull/647) [`b4f1387`](https://github.com/chh-ay/sheetwrite/commit/b4f13873c3caf5439556a9540add5f1f1a8520ce) Thanks [@chh-ay](https://github.com/chh-ay)! - A dynamic array that grows or shrinks, such as a `FILTER` whose condition changes for one row, now wakes only the formulas that read a cell whose value changed. Before, every formula that read any spilled cell recalculated. A 100,000-row `FILTER` that gains or loses one row recalculates about twice as fast. Results do not change.

- [#665](https://github.com/chh-ay/sheetwrite/pull/665) [`18c3ae4`](https://github.com/chh-ay/sheetwrite/commit/18c3ae455fdd94cce074275c5e69abaab92540f5) Thanks [@chh-ay](https://github.com/chh-ay)! - `FILTER`, `SORT`, `UNIQUE`, `TAKE`, `DROP` and `CHOOSEROWS` now pick rows of the array they read instead of copying it, so a chain of these functions copies its result once, when it spills. Array constants such as `{1,2;3,4}` are no longer copied when a formula reads them. Formulas that chain these functions over large ranges recalculate a few percent faster and allocate less. Results do not change.

- [#355](https://github.com/chh-ay/sheetwrite/pull/355) [`5ea7336`](https://github.com/chh-ay/sheetwrite/commit/5ea7336d7602697a123a5f6594e6c77924e5a415) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort spill rows by their displayed values instead of treating projected children as blank sources. Preserve stable ties, multi-key ordering, and filter-then-sort behavior without adding a sort cache or per-row ownership lookup.

- [#621](https://github.com/chh-ay/sheetwrite/pull/621) [`02ce5a8`](https://github.com/chh-ay/sheetwrite/commit/02ce5a8049aaabf34b5533356676f0dedbe81b39) Thanks [@chh-ay](https://github.com/chh-ay)! - MEDIAN, MODE.SNGL, LARGE, SMALL, RANK.EQ, PERCENTILE.INC, QUARTILE.INC, STDEV, VAR, GEOMEAN, CORREL and COVARIANCE read the numbers of their range arguments in place, without copying each cell first. Results are unchanged.

- [#300](https://github.com/chh-ay/sheetwrite/pull/300) [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e) Thanks [@chh-ay](https://github.com/chh-ay)! - A row or column insert that a sheet cannot hold changes nothing. `addRows`, `removeRows`, `insertCols` and `removeCols` return `false` for a dense sheet that would pass its cell limit or a row count that overflows, and the store rejects the operation instead of moving formulas, charts or metadata for cells that did not move. `addPagedSheet` throws for a chunk size above 1048576 rows.

- [#638](https://github.com/chh-ay/sheetwrite/pull/638) [`1061433`](https://github.com/chh-ay/sheetwrite/commit/1061433bdafaa0650661a8986ec3d32149854b2f) Thanks [@chh-ay](https://github.com/chh-ay)! - SUBTOTAL over references is faster on sheets with hidden or filtered rows: it steps over hidden rows a block at a time and only checks formula cells for a nested SUBTOTAL. AGGREGATE skips hidden rows the same way. Results are unchanged.

- [#518](https://github.com/chh-ay/sheetwrite/pull/518) [`3978341`](https://github.com/chh-ay/sheetwrite/commit/3978341c92da5578cccd166568eb7dfcddf7d17e) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and `COUNTA` over a single column of typed-in numbers and empty cells read the column as one slice, with one check for the whole column, instead of cell by cell. The sum still adds in row order, so results do not change.

- [#521](https://github.com/chh-ay/sheetwrite/pull/521) [`2d17ed1`](https://github.com/chh-ay/sheetwrite/commit/2d17ed18937ce2c832517d67d18de166b7a9f3b2) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUMPRODUCT` over single columns of typed-in numbers and empty cells multiplies the columns as slices, with one check of each column's cell types and one check of the total, instead of checks on every product. The products and the total add in the same order, so results do not change.

- [#471](https://github.com/chh-ay/sheetwrite/pull/471) [`9ba077c`](https://github.com/chh-ay/sheetwrite/commit/9ba077c00fa532b1a7264952606d36cd361d5fae) Thanks [@chh-ay](https://github.com/chh-ay)! - TEXT returns `#NUM!` when a percent code takes the number past the largest double, for example `=TEXT(1.7E+308,"0%")`. The engine stopped with an error before.

- [#684](https://github.com/chh-ay/sheetwrite/pull/684) [`b368152`](https://github.com/chh-ay/sheetwrite/commit/b368152d58a0e6b1facb0878bee2951c363284e0) Thanks [@chh-ay](https://github.com/chh-ay)! - Restoring engine memory refuses a cell kind the store cannot hold in paged storage too, as it already did for dense storage.

- [#402](https://github.com/chh-ay/sheetwrite/pull/402) [`bc7ca0d`](https://github.com/chh-ay/sheetwrite/commit/bc7ca0deddf6ee4b054123a7480f36211e8ffd77) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and `COUNTA` read range cells from the stored kind and payload arrays instead of building a value per cell. `SUM` over several ranges, or ranges mixed with scalar arguments, folds every argument in order into one running sum, with the same text, logical and error rules. Formulas that sum the same range of plain values in one recalculation share one scan. The range sum cache that lived across recalculations is removed.

- [#519](https://github.com/chh-ay/sheetwrite/pull/519) [`411f4e4`](https://github.com/chh-ay/sheetwrite/commit/411f4e4131907e2fe0108beaf3a5ec8ea2b5801b) Thanks [@chh-ay](https://github.com/chh-ay)! - Ordering a recalculation of formulas that read other formulas no longer looks up the address of every formula it orders. A formula that a row or column insert would move onto another formula's cell is now removed instead of being left behind outside the sheet's formula list. No formula result changes.

- [#356](https://github.com/chh-ay/sheetwrite/pull/356) [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e) Thanks [@chh-ay](https://github.com/chh-ay)! - Write cell formulas with Excel's future-function and local-binding prefixes, including LET, LAMBDA, XLOOKUP, FILTER and SORT, and remove those prefixes on import. Cells and defined names now share the engine converter, including the A1# spill spelling.
  
  Convert each workbook's distinct formulas in one batch instead of crossing the JavaScript-to-WASM boundary for every cell. Reuse an initialized engine or retire a temporary conversion instance. Formula-free workbooks, including workbooks with only range names, do not load an engine.

- [#914](https://github.com/chh-ay/sheetwrite/pull/914) [`39467cc`](https://github.com/chh-ay/sheetwrite/commit/39467ccb6246ac0ad1d8e3cc8598ca01ad856185) Thanks [@chh-ay](https://github.com/chh-ay)! - XLSX export now marks formulas whose result is an array, such as `=SEQUENCE(3)`, `=FILTER(...)` or `=A1:A3`, as Excel dynamic arrays, so Excel spills them instead of showing `=@SEQUENCE(3)` and one value. Each such cell gets `cm="1"` and `<f t="array">`, and the workbook gets the `xl/metadata.xml` part, as Excel 365 writes them. Exporting a grid also writes each spill's range and the values it shows in the cells it covers. Formulas with one value stay plain, and a workbook without array formulas has no metadata part.
  
  XLSX import reads Excel's dynamic arrays as formulas that spill again, without the cached values of the cells they cover. Legacy array formulas (Ctrl+Shift+Enter, `t="array"` without `cm`) are still kept as text with a warning.
  
  The engines have two new exports for this: `xlsxArrayFormulas` and the `CellStore` method `spillRanges`. Core's `XlsxFormulaEngine` has the matching `arrayFormulas(formulas)`.

## 0.6.1

### Patch Changes

- [#234](https://github.com/chh-ay/sheetwrite/pull/234) [`1ceb09a`](https://github.com/chh-ay/sheetwrite/commit/1ceb09a7567a99292744d8b4fd459ffc0c73b3fb) Thanks [@chh-ay](https://github.com/chh-ay)! - Recalculate faster after many single-cell writes followed by a bulk write.

- [#235](https://github.com/chh-ay/sheetwrite/pull/235) [`3df2d80`](https://github.com/chh-ay/sheetwrite/commit/3df2d80d6b670d41ba5b18954befe281694a2ddd) Thanks [@chh-ay](https://github.com/chh-ay)! - Value edits in a workbook without formulas or pivot tables no longer run the formula recalculation pass. The pass is the largest function of the engine, and the WebAssembly runtime compiled it while the first edits ran, so the first thousands of edits of a data grid were slower than in 0.5.4. Calculated values and edit results do not change.

## 0.6.0

### Minor Changes

- 9dc3ab1: Add reference-valued `OFFSET(reference, rows, cols, [height], [width])` and `INDIRECT(text, [a1])` in both engines and formula autocomplete. Their results can feed reference-taking functions, `LAMBDA`, `MAP` and the other array helpers, or spill multiple cells; a one-cell result is a plain value, not a spill. Both functions are volatile and recalculate with their dependents after every source-changing edit; runtime dependency cycles return `#CYCLE!`.
  
  `OFFSET` inherits omitted dimensions from its source reference and requires positive height and width. Out-of-grid bounds return `#REF!`; nonpositive dimensions, nonnumeric offsets or a non-reference first argument return `#VALUE!`. `INDIRECT` accepts A1 or R1C1 notation, including relative R1C1 coordinates, sheet-qualified references, defined names and table references. Invalid targets and external workbook references return `#REF!`. Reference text is not rewritten by fill, copy or structural edits. Existing sheet, range and spill limits still apply.
  
  OFFSET and INDIRECT are volatile, as in Excel. The engine does not record the cells they read as graph edges. Each edit recalculates them again, so a moved or edited target always shows. Workbooks without these functions do not pay this cost. `recompute(sheet)` on a sheet with volatile formulas also recalculates the volatile formulas on every other sheet, because Excel recalculates volatile functions for the whole workbook. A reference to another sheet then stays current.
- 0b5cc2d: Add iterative calculation for circular references, as in Excel. The new `setCalculation` document operation sets `{ iterate, maxIterations, maxChange }`. The defaults are the Excel defaults: off, 100 iterations, and a maximum change of 0.001. When iteration is off, a circular reference shows `#CYCLE!`, as before. When it is on, the engine calculates each circular reference again until no value changes by more than `maxChange`, or until `maxIterations` passes are done. A cycle that does not settle keeps the values of its last pass. Formulas that read a cycle calculate once, after it settles. `OFFSET`, `INDIRECT` and volatile functions work inside a cycle, and a cycle that only `OFFSET` or `INDIRECT` closes also iterates.
  
  The setting is undoable and is part of the workbook snapshot as `workbook.calculation`. Snapshots of workbooks with the default setting do not change. XLSX import reads `iterate`, `iterateCount` and `iterateDelta` from `<calcPr>`, and export writes them. The WASM `CellStore` has the new `setIterativeCalculation` method. Core exports `CalculationSettings`, `DEFAULT_MAX_ITERATIONS`, `DEFAULT_MAX_CHANGE` and `MAX_ITERATIONS`.
  
  The engine finds circular references once per recalculation, only when the dependency check finds a cycle, so workbooks without one do no extra work.
- 34bdcba: The engine exports 10 fewer `CellStore` methods. Sheetwrite did not call them, so the grid and store APIs do not change. Removed: `canDirtyCell`, `dirtyRevision`, `markCellCleanRevision`, `hydratePageNumbers`, `hydratePageStringsPacked`, `spillOwnerCoordinates`, `isSheetAlive`, `pinRange`, `styleIdAt` and `sortRows`. If you call the engine directly, use `sortRowsMulti` with one key instead of `sortRows`, `getCell(...).style` instead of `styleIdAt`, and `setSparseBlock` inside `beginPageLoad`/`commitSources` instead of `hydratePage*`. Paged sheets no longer keep caller-owned `pinRange` pins. Viewport and read-window pins work as before.
  
  Remove the unused `SourceSnapshot.byteLength()` metric too. Source snapshots still expose all formula, reference and spill arrays. `RangeSnapshot.byteLength()` is unchanged.
- 0f36fda: Add the Excel reference operators. A space between two references is the intersection operator: `=SUM(A1:C3 B2:D4)` adds the cells that both ranges cover. When the references share no cell, or are on different sheets, the result is `#NULL!`. Spaces around other operators, after commas and before `)` do not change.
  
  A comma inside parentheses that are not a function call is the union operator: `=SUM((A1:A2,C1:C2))`. `SUM`, `COUNT`, `AVERAGE`, `MAX`, `MIN`, `SMALL`, `LARGE` and the other functions that read lists of values accept a union. `INDEX` has the optional `area_num` argument, which selects one area of a union. The new `AREAS` function counts the areas of a reference. A union in a position that needs one range, such as a `VLOOKUP` table, returns `#VALUE!`.
  
  A 3-D reference such as `=SUM(Jan:Mar!B2)` or `=SUM('Jan:Q1 Close'!A1:B2)` reads the same cells on every sheet from the first to the last sheet in tab order. `SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MAX`, `MIN`, `PRODUCT`, `STDEV.S`, `STDEV.P`, `VAR.S` and `VAR.P` accept 3-D references; other positions return `#VALUE!`. When you insert, move or delete a sheet inside the span, the result changes as in Excel. When you delete or move an endpoint sheet, the formula moves to the nearest sheet inside the span. A rename keeps the formula valid. When every sheet of the span is deleted, the reference becomes `#REF!`. Row and column edits on one sheet do not change a 3-D reference.
  
  The three operators record only the cells they read, so an edit recalculates only the formulas that it can change. A tab move updates the dependencies of the affected formulas only. When a tab move rewrites a 3-D reference, undo restores the original formula text. XLSX import and export keep these formulas as Excel text. The WASM `CellStore` has the new `setSheetOrder` and `sheetSpanFormulaCells` methods; core calls them when tabs are added, moved or restored.
- bcfe991: Add `RAND` and `RANDBETWEEN`, and make volatile formulas recalculate after each edit. `RAND`, `RANDBETWEEN`, `TODAY` and `NOW`, and the formulas that read them, now recalculate in every transaction that changes a cell, as in Excel. Before, they recalculated only when the host called `recalculateVolatile`. A transaction without cell changes recalculates nothing. Workbooks without volatile formulas do no extra work, and the extra work of an edit grows only with the number of volatile formulas and their dependents.
  
  `RANDBETWEEN(bottom, top)` rounds `bottom` up and `top` down. It returns `#NUM!` for an empty interval and `#VALUE!` for a bound that is not a number.
  
  Add `FORMULATEXT`, `ISFORMULA`, `HYPERLINK` and `CELL`. `FORMULATEXT` returns the formula of a cell, or `#N/A` when the cell holds no formula. `HYPERLINK` returns its friendly name, or the link when there is no friendly name; the grid does not open the link. `CELL` supports the info types `address`, `col`, `contents`, `row` and `type`; other info types return `#VALUE!`. Formula autocomplete offers all six functions.
- bcfe991: `TODAY` and `NOW` now read the clock once in each recalculation, as in Excel. Every `TODAY` and `NOW` in one recalculation uses the same time. Before, they used only the time from the last `recalculateVolatile` call. `recalculateVolatile(date)` still uses the time you give it, until the next edit.

### Patch Changes

- 34bdcba: Column aggregates (`SheetwriteStore.aggregate`, the engine's `aggregate`, used by grid aggregates and status totals) now give the same result on dense sheets as on paged sheets, as Excel does. On a dense sheet, a formula that returns TRUE or FALSE counted as 1 or 0, and a formula that returns a blank counted as 0; both are now ignored. Values that a formula spills into other cells were skipped; they now count.
- 34bdcba: Dense column readers now skip the general paged-cell path where it is not needed. Style scans skip equal adjacent ids. Ordered data-edge scans classify literal kinds without resolving each cell. Text filters and numeric sort-key scans use dense slices. Paged sheets keep their load checks and eviction order. Values, style ids, sorting and navigation results do not change.
- 8d70aae: Package READMEs and API doc comments link to the restructured documentation pages.
- 34bdcba: Column aggregates (`SheetwriteStore.aggregate`, the engine's `aggregate`) on dense sheets are fast again. Since the cell storage split, they read each cell through the general cell reader. On a 100,000-row column, SUM was 2.6× slower than in 0.5.4, and COUNT over mixed values was 6× slower. They now scan the column directly. Results do not change.
- b6f333c: Add saved pivot-table calculation to the full engine. Share grouping rules with PIVOTBY. Update only affected groups after source edits, and keep MIN, MAX, and DISTINCTCOUNT correct when values are removed. Add SUM and AVERAGE values exactly and round them one time, so edits give the same result as a new calculation. Include pivot caches in memory statistics.
  
  Keep pivot output in spill state, not in formula sources. Retry output after a blocker is cleared. Recalculate formula sources and dependent formulas, retain colliding anchors after structural edits, and rebuild caches after engine memory transfer. The default engine does not include pivot calculation.
- ec8e0ee: Large undo restores the saved range directly from its packed engine snapshot instead of decoding and re-applying a JSON block, and the restore payload sent to listeners and sync is measured once instead of being walked at every layer. In local runs, undo of a 1,000,000-cell clear was 2–6× faster and the memory it added during undo fell from about 310 MiB to about 190 MiB. Undo history now also drops its oldest entries once retained range snapshots pass 256 MiB (about twenty million-cell clears); the newest entry always stays undoable. `restoreRange` now applies the same source, reference and dirty-capacity rules as a packed block write, so a local undo and its replay on another peer give the same state.
  
  The 256 MiB policy uses engine-reported snapshot payload bytes, not total retained process memory. It excludes cloned formula ASTs and JavaScript patch/redo payloads, which remain bounded only by the 200-entry limit.
  
  Formula-free packed writes and restores select their source-free cell loop once per range, avoiding repeated formula-map checks and kind normalization during large imports.
- 957b82f: Use coordinate-keyed hashing for engine cell indexes while retaining randomized hashing for workbook text. Content clears, packed writes, and column writes retain unrelated calculated values and spills and recalculate only their dependent formulas, including cross-sheet and range readers. Large rectangles use bounded range dirty tracking instead of whole-sheet invalidation; style-only clears do not invalidate calculations.
  
  Consolidate engine ownership: CellStorage owns paged storage and local dirty overlays; graph owns formula entries, the dependency index, and recompute dirty state; spill admission accesses cells through storage; window owns conditional-rule caching. Dirty-state memory accounting and internal memory transfers preserve the active cell, rectangle, or whole-sheet representation.
  
  Pack formula source errors, volatility, spill-reference and array-production predicates, and persisted source kind into one byte of per-formula metadata. Parsed formula entries retain the owned source string without copying it; persisted engine-transfer bytes remain unchanged.
  
  Formula edits, clears, column loads and range restores patch the dependency index in place instead of rebuilding it for the whole workbook; only structural edits or a batch that rewrites a large share of the formulas rebuild it.
  
  Circular-reference and nesting-depth checks no longer overflow the stack on long formula chains, and many formulas reading the same large overlapping ranges no longer take quadratic memory.
  
  Release oversized dependency-reader allocations after topology edits. Dense streamed ranges use their existing source slices without a per-column page cache, and paged readers cap their temporary run cache.
  
  Literal-only block writes and history restores on dense sheets write storage column by column instead of cell by cell, and `SUM` reads literal cells without resolving their calculated kind.
- 3bdb073: The packages are smaller to install. The code is not minified and stays readable.
  
  - `@sheetwrite/core` is 1.83 MB → 1.55 MB unpacked (387 KB → 350 KB packed), with 214 → 157 files.
  - The packages publish only the type declarations that their entry points use. Core no longer ships 57 internal declaration files (117 KB), and `@sheetwrite/xlsx` no longer ships 8. You cannot import these files through the package `exports`, so no types change.
  - The published JavaScript uses 2-space indentation instead of 4. This saves 155 KB in core and 20 KB in `@sheetwrite/xlsx`.
  - `@sheetwrite/wasm` and `@sheetwrite/formulas` no longer publish `pkg/sheetwrite_wasm_bg.wasm.d.ts` (14 KB each). No entry point refers to it, and `sheetwrite_wasm.d.ts` has the same types.
- 064fe74: Fix render windows that painted columns past the sheet's last column, rows past its end, and unloaded cells with the first styled cell's fill and borders. Those cells now read as unstyled.

## 0.5.4

### Patch Changes

- aba7c92: Release with the other packages so all seven share one version. The engine does not change.

## 0.5.3

### Patch Changes

- 885b764: Package READMEs show npm, pnpm, Yarn, and Bun install commands, and the core and WASM READMEs explain how to select the full formula engine.
- 222a3f8: Publish readable JavaScript again. 0.5.2 removed whitespace from the published files, so stack traces pointed into one long line and the code in `node_modules` was hard to read and debug. Your bundler still minifies your app build. Module paths, exports, and type documentation do not change.

## 0.5.2

### Patch Changes

- 2e4231c: Remove comments and extra whitespace from published JavaScript to reduce package download and installed sizes. Keep module paths, exported names, type documentation, and WebAssembly binaries unchanged.

## 0.5.1

### Patch Changes

- 7d9b52a: Add checked API examples and links for grid setup, data, synchronization, framework components, engine selection, and XLSX import and export.
- c8db125: Read literal cell values directly to restore column sum performance and reduce sort overhead. Skip unused count and minimum/maximum work when computing a column sum. Keep calculated values on the formula-aware read path.

## 0.5.0

### Minor Changes

- a320510: Apply formula operators to each array element. Scalars and single rows or columns expand to match the other operand. Array results spill into adjacent cells and work as arguments to functions that accept arrays.
- 9915236: Add `releaseEngineMemory()`. Call it when the app is idle, for example after a large clear or after a big sheet closes. It moves every live store into a fresh WASM instance and lets the browser free the old instance's memory, which a WASM instance never gives back by itself. Cached formula results, loaded datasource pages, unsaved edits and undo/redo history move with the stores. If any store cannot move, all stores stay on the old instance and nothing changes. The returned report gives the WASM bytes before and after and the pause.
  
  After a three-column, million-row sheet is cleared down to ten rows, WASM memory drops from 173 MiB to 38 MiB, the size of a freshly built store with the same content. Release never makes WASM memory larger. The pause grows with the live data: about 50 ms in that case, and up to about 270 ms when undo history for the cleared million rows is kept.
  
  Both engine loaders can create independent instances from shared compiled code. For direct engine use, `load()`, `isLoaded()`, `initSync()` and the synchronous exports keep working. The default engine grows by about 9 KB (Brotli).
  
  **Breaking:** core now owns its own engine instance, so `await initSheetwrite()` is required before you create a Grid or a `SheetwriteStore`. Calling only `load()` from `@sheetwrite/wasm` or `@sheetwrite/formulas` no longer initializes core; the error message now says so. Apps that already call `initSheetwrite()` need no change.
- 11e9336: Keep calculated formula values and spill output separate from written cell sources. Hydrating a source into spill output now preserves the source and reports `#SPILL!`; paged formulas request unknown spill destinations as calculation prerequisites. History captures source cells rather than calculated output, including fallback history for custom stores.
  
  For direct `CellStore` users, finish staged edits or page loads with `commitSources()`, which completes recalculation and collects eligible string-pool garbage after local edits. Page loads retain the existing deferred-collection policy. This replaces `endMutation()`, `endPageLoad()`, and `recomputeChanged()`. `admitSourceRange()` checks spill admission in Rust without transferring an owner window.
  
  Bulk source loads invalidate calculated output once per range, avoiding per-cell spill teardown and redundant dirty-cell tracking before whole-sheet recalculation.
  
  Formula range evaluation decodes literal source payloads directly, keeping calculated-overlay resolution off literal scans while retaining source precedence for spill output.
  
  Calculated errors share the same tagged overlay slots as other formula results, avoiding a separate error hash table and its per-result allocation and lookup costs.
  
  Engine memory release transfers calculated overlay slots and spill ownership independently of source storage, preserving cached volatile values, calculated errors, blocked spills, and compact undo history without recalculation.
- cf1a10c: Load the off-screen cells that visible formulas read. With a windowed datasource, a formula that read a column outside the visible columns showed `#LOADING!` forever, because nothing requested that column for those rows. The Grid now asks the engine which same-sheet cells the visible formulas read, including cells reached through other formulas, and loads them with the window. A cell budget equal to the prefetch byte limit bounds this work, so a whole-column read cannot make one window load the full column. Reads from other sheets are not loaded.
  
  `CellStore` in `@sheetwrite/wasm` adds `formulaReadBands`.
- 2b5f1eb: Faster bulk loading through packed block writes.
  
  - **Breaking for direct `@sheetwrite/wasm` users:** `CellStore.setBlock` is removed. Use `CellStore.setBlockPacked`, which takes the text of every string cell as one UTF-8 buffer plus byte offsets instead of one JavaScript string per cell. `setColumnBlockPacked` takes the same input in column-major order. Code that uses Sheetwrite through `@sheetwrite/core` or a framework adapter needs no change.
  - New engine exports: `setBlockPacked`, `setColumnBlockPacked`, `loadedSpans` (loaded row runs of one column) and `cellSnapshots` with its `CellSnapshot` result (packed old values for detailed change events).
  - Core loads columnar data column by column without a row-major copy, reads old values in bulk when detailed change capture is on, and reconciles paged residency with one call per column.
  
  Measured in alternating runs: loading 100,000 to 1,000,000 rows is 26–35% faster, number-only loading is 56–59% faster, a detailed-capture block write is 10% faster, and revisiting an evicted paged band needs 108 residency checks instead of 1,026.
- bc7bc53: Reclaim obsolete text after committed edit transactions when dead storage exceeds the collection thresholds. History snapshots own their text, and raw string IDs and worker frames carry a pool epoch so caches remain correct after collection. Explicit string compaction now also reclaims unreachable text.

### Patch Changes

- f25513a: Support array constants in formulas. Preserve their row and column shape for spills and array arguments, and preserve their values through formula edits and XLSX round trips.
- 0241abd: Allocate dense calculated values in lazy 512-cell chunks instead of reserving an entire sheet on its first formula. Empty chunks are released when spills shrink, and memory-release transfers retain only populated chunks.
  
  Track live chunks so empty-overlay reads and source writes keep their fast paths. Resolve scalar spill kinds and payloads together to avoid repeated chunk lookups. Avoid wide range-cache allocations for single-row scans, and check paged-cell load state before reading its payload.
- 837eb95: Store analysis function names as compact registry identifiers. This keeps function values small when the full engine is selected. Formula names and results do not change.
- 1240c84: Reduce repeated indexing in matrix calculations and avoid allocation in sums of squares.
- ed66b6d: Faster formulas, queries and builds on Rust 1.99.0. Results are unchanged; numbers are medians from alternating runs.
  
  - Rewriting a formula whose cell and range reads stay the same keeps the dependency index: changing one constant among 100,000 formulas went from 35 ms to 0.03 ms.
  - Each `LET` binding is evaluated at most once per evaluation (`LET(x, lookup, x+x+x)` 87% faster).
  - Plain value cells are read without formula and spill-error lookups, which speeds up range formulas such as `SUMPRODUCT`, `COUNTIF`, `SUMIFS` and `PERCENTILE` by 27–59%.
  - Distinct values dedupe by string-pool ID (30–90% faster), value-list filters use a per-column lookup (1,000 picks over 1,000,000 rows: 2.9 s to 28 ms), and multi-key sorts build each key once (34–38% faster).
  - The engine now builds with the pinned Rust 1.99.0 toolchain.
- c6674f9: Reduce memory allocation in formula array operations.
- d137ff0: Reduce calculation time for text, calendar, and financial formulas without changing their results.
- 7f73dc7: Reduce the time to calculate WORKDAY, UNIQUE, and SEARCH formulas.
- b771aa0: Reduce calculation work for statistical formulas without changing results.
- ddaac0d: Fix FILTER in debug builds when its input array has fewer cells than its static size bound. FILTER uses the evaluated array size for its result.
- d63ac3d: An edit that changes only formula constants keeps the dependency index, so the
  next recompute does not rebuild it for the whole workbook. Sparse, packed, and
  scalar writes now share one source-replacement module.
- 64aebd9: Release decoded lookup ranges when recalculation ends, including early returns. Lookup results do not change.
- 2dcfc2e: Reuse a decoded lookup range for every lookup against it in one recalculation.
  `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `MATCH` and `XMATCH` used to read their whole
  range per formula; they now read it once per recalculation and share the sorted
  flags, the exact-match index and the search across later lookups. Text keys
  compare without building lowercase copies on every candidate, and reductions
  (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA` over any number of ranges,
  plus `SUMIF(S)`, `COUNTIF(S)` and `AVERAGEIF(S)`) walk their ranges instead of
  materializing every cell first.
- 2c26d4c: Skip spill and formula metadata lookups when the metadata is empty. This reduces the time to load one million rows by 35% in the measured mixed-column workload. The default WebAssembly file grows by 718 bytes (0.09%) for this improvement.
- 11e8edd: Fix a spill that reads another spill showing the previous values. When the spill it reads is placed later in the same recalculation, the reading spill is now calculated again. Spills that read each other show #CYCLE!.
- e725d98: Support spill references such as `A1#`. A spill reference refers to the current spill of its anchor cell and follows it when the spill changes size. It returns `#REF!` when the anchor holds no spill. Row and column edits move the reference with its anchor. XLSX import and export convert it to and from `_xlfn.ANCHORARRAY`.
- 5bdff6a: Adopt the current rustfmt style and clippy-selected rewrites in the columnar store: replace `unwrap` calls after `is_some` in the paged setters, use the newer `is_multiple_of`, `as_chunks`, and `slice::from_ref` standard-library forms, and drop redundant counters and conversions.
- 99435f8: Keep painted and frozen cells resident during unrelated bulk reads. Load the same-sheet formula dependencies of frozen cells and reached merge anchors, and retain the bounded formula closure while its window is visible. Give bulk reads transient pins separate from viewport protection and caller-owned WASM `pinRange` pins.

## 0.4.0

### Minor Changes

- 41f6749: Pack visible-window numeric, kind, style, string-index, and conditional-format data into one validated transfer buffer, reducing ordinary window reads from seven output allocations to one.

### Patch Changes

- 41f6749: Reuse each visible formula entry while decoding render windows, avoiding redundant formula-map probes without changing resolved values or error precedence.

## 0.3.1

### Patch Changes

- Align the published WASM artifact with the corrected v0.3.1 release set.

## 0.3.0

### Minor Changes

- e551eb0: Expand the WASM formula engine with bounded array, criteria, date, financial, matrix, statistical, and text evaluation while preserving deterministic dependency and recomputation behavior.

## 0.2.0

### Minor Changes

- 6ed7572: Harden collaboration, persistence, paged datasource, snapshot, and spreadsheet interchange boundaries; add bounded XLSX import/export with independent producer coverage; improve large-dataset cache behavior and browser rendering; and ship complete framework, database, collaboration, interoperability, and performance showcases.
- 87fadb7: Strengthen collaboration recovery, bounded persistence and paging, snapshot resource enforcement, and framework adapter contracts.

  Replace the optional XLSX implementation with a bounded OOXML codec, broaden workbook fidelity and producer conformance, and add deterministic performance evidence.

  Ship searchable capability-owned evaluation surfaces for framework integration, database lifecycle, collaboration, interoperability, and million-row performance.
