# @sheetwrite/formulas

## 0.7.0

### Minor Changes

- [#286](https://github.com/chh-ay/sheetwrite/pull/286) [`a6eefc5`](https://github.com/chh-ay/sheetwrite/commit/a6eefc5842d994b1ebf3ed699c74cc762c87377b) Thanks [@chh-ay](https://github.com/chh-ay)! - Hosts can register synchronous JavaScript functions that formulas call, on the full engine (`@sheetwrite/formulas`). Import `registerFunction(store, metadata, implementation)` and `unregisterFunction(store, name)` from `@sheetwrite/core/functions`; an application that does not import that entry carries none of its JavaScript, and the default engine binary does not change. On the default engine, `registerFunction` throws a `SheetwriteError` with code `optional-backend-unavailable`. A thrown error or a result that is not a number, text, boolean or `null` shows `#VALUE!`. A workbook that calls a function that is not registered shows `#NAME?`. `listFunctions(store)` returns the metadata of the built-in functions of the active engine and of the host functions in one list.

- [#343](https://github.com/chh-ay/sheetwrite/pull/343) [`1f2c4b0`](https://github.com/chh-ay/sheetwrite/commit/1f2c4b004364b864901c70303a661146c8e45911) Thanks [@chh-ay](https://github.com/chh-ay)! - Add defined-name formulas and a lazy Name Manager under Formulas › Defined Names in the ribbon, compact ribbon, and toolbar. Names can hold constants, calculated values, references, or a reusable LAMBDA. Saves and deletes use document transactions, undo/redo, and collaboration.
  
  Plain named formulas evaluate in both engines. Named LAMBDA calls require the full engine; the default engine keeps and round-trips definitions but returns `#NAME?` when called. Recursive calls stop at 64 nested calls with `#NUM!`, below Excel's parameter-dependent allowance.
  
  A concurrent structural edit and a named-formula edit conflict and force a document reload. The pending edit remains available for host recovery; it is not rewritten across the remote structural edit.
  
  Keep defined-name formulas and scope in native XLSX. The engine converts Excel's future-function, LET binding, and LAMBDA parameter prefixes without changing quoted text or reference names. Formula-name conversion reuses the document engine or releases a temporary instance; range-only workbooks do not load one.

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

- [#377](https://github.com/chh-ay/sheetwrite/pull/377) [`d5af8e5`](https://github.com/chh-ay/sheetwrite/commit/d5af8e520ba50789eb70a6eca50c37691a8f3615) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort rows in Excel's sort order. Text compares without case, in Excel's documented character order, and skips apostrophes and hyphens. Errors sort after `FALSE` and `TRUE` and are equal to each other. Blank cells are last in both directions. This changes the order of existing view sorts that have mixed-case text, errors, or blank cells in a descending sort.

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

- [#451](https://github.com/chh-ay/sheetwrite/pull/451) [`2ef581a`](https://github.com/chh-ay/sheetwrite/commit/2ef581aa7730a70b86f5a1c4887c777f48b233b0) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines hold the cached values of linked workbooks ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). `CellStore.addExternalSheet(book, sheet, columns, rows)` adds a sheet of a linked workbook and returns its handle; the cell setters on that handle set its values. References such as `[Budget.xlsx]Annual!C10` and `SUM('C:\Reports\[Budget.xlsx]Annual'!C10:C25)` read those values. The folder and letter case do not matter. A change to the values recalculates the formulas that read them. A link sheet is not a tab: `SHEETS`, 3-D references and the tab order do not include it. A reference to a link the store does not hold is still `#REF!`.
  
  A quoted reference with a drive in its path, such as `'C:\Reports\[Budget.xlsx]Annual'!C10`, is no longer read as a 3-D reference.

- [#430](https://github.com/chh-ay/sheetwrite/pull/430) [`8a75714`](https://github.com/chh-ay/sheetwrite/commit/8a7571407979f2c6b347335c949b8b0ad366b5cd) Thanks [@chh-ay](https://github.com/chh-ay)! - Formulas accept references to cells in other workbooks, in Excel's forms: `[Budget.xlsx]Annual!C10`, `SUM([Budget.xlsx]Annual!C10:C25)`, `'[Budget 2024.xlsx]Annual Plan'!C10` and `'C:\Reports\[Budget.xlsx]Annual'!C10` ([#226](https://github.com/chh-ay/sheetwrite/issues/226)). Before, the unquoted form was a syntax error, and a quoted form made the whole formula `#REF!`. The formula text now stays as written. A copy moves relative references, as in Excel. Row, column and sheet edits in this workbook do not change them. Without values for the other workbook, a reference shows `#REF!`; `IFERROR` and the other error functions handle it as an error value. A sheet of the same name in this workbook is never read in its place.

- [#301](https://github.com/chh-ay/sheetwrite/pull/301) [`08fbebf`](https://github.com/chh-ay/sheetwrite/commit/08fbebfd3b654070de6edbd15d4d72398eb5198d) Thanks [@chh-ay](https://github.com/chh-ay)! - Both engines export `formulaTokens(text)` and `checkFormulaSyntax(text)`. `formulaTokens` returns the tokens of formula text from the engine's own lexer as a `Uint32Array`, four numbers per token: the kind, the start and end as UTF-16 offsets, and 1 when whitespace comes before the token. It does not stop at an error: an open quote or bracket becomes one bad token to the end of the text. `checkFormulaSyntax` returns the first error of the engine's parser with its span, its message and an `incomplete` flag for a formula that ends too early, or `undefined`. Formula help in `@sheetwrite/core` uses them, so it marks exactly the formulas that the engine rejects. The parser's error messages are now sentences that a user can act on, such as "Add ) to close the (.".

- [#378](https://github.com/chh-ay/sheetwrite/pull/378) [`01b8d72`](https://github.com/chh-ay/sheetwrite/commit/01b8d729b92351e46e3f343aa08ca33604ef3284) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort cells in place, as Excel does. `store.sortRange(range, keys, { hasHeader })` moves the rows of a range in one undoable, synced transaction with the new `permuteRows` document operation and the new `"sort"` commit reason.
  
  - Values, formulas, cell styles, notes and one-row hyperlinks move with their row. Row heights, hidden rows, conditional formats, validation rules and protected ranges keep their addresses.
  - A formula in a moved row is adjusted for the move of its own row: relative row references without a sheet name move with the row; absolute rows and references with a sheet name stay. Formulas elsewhere keep their references and read the new values.
  - Hidden and filtered-out rows keep their place. Identically sized merged cells sort as whole records; other merged layouts reject the sort. A spill range that the sort would move only in part rejects the sort. A sort in a table must cover its whole body.
  - The operation carries the row order (one `u32` per row, base64), so every collaborator applies the same order. A concurrent edit inside the sorted range is a rebase conflict. Undo applies the inverse order and restores formulas whose adjusted references left the sheet.

- [#477](https://github.com/chh-ay/sheetwrite/pull/477) [`3ef2323`](https://github.com/chh-ay/sheetwrite/commit/3ef2323d90d26e6f2be276b4ad799259ccb7b45f) Thanks [@chh-ay](https://github.com/chh-ay)! - Measures can use `CALCULATE(expression, filter, …)` to evaluate an expression in a changed filter context ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).
  
  - A filter compares one model column with a value (`Customers[Region]="West"`, `Orders[Month]>=3`) and replaces the cell's row items, column items and report filter on that column, or is `ALL(Table[Column])` and removes them. Filters on other columns stay, and filters still flow from the one side to the many side only.
  - Other filters (`ALL(Table)`, `FILTER`, a comparison of two columns) and a `CALCULATE` inside another show `#VALUE!`. In cell formulas `CALCULATE` and `ALL` stay unknown functions (`#NAME?`), as in Excel.

- [#458](https://github.com/chh-ay/sheetwrite/pull/458) [`17664a9`](https://github.com/chh-ay/sheetwrite/commit/17664a95da5d137a5e0863f9434ffa5d6ccbc771) Thanks [@chh-ay](https://github.com/chh-ay)! - Measures read related tables, refer to other measures, and follow renames ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).
  
  - A measure reads qualified columns of any model table. Another table than the pivot's base sees its rows that match the cell's row items, column items and report filters on the fields it reaches through many-to-one relationships; other fields put no condition on it, so filters flow from the one side to the many side only.
  - `[Name]` in a measure formula refers to another measure, ignoring case. An unknown name shows `#REF!`; measures that refer to each other in a cycle show `#VALUE!`.
  - Renaming a table or a table column with `updateTable` rewrites the measure formulas that name it, and renaming a measure with `setMeasure` rewrites the `[Name]` references to it, within the same undo step. `rebaseDocumentOperations` reports a pending `setMeasure` and a concurrent `updateTable` that renames the table or its columns as an `overlapping-edit` conflict, in either order, so collaborating peers reload and converge on the renamed formulas.
  - New engine function `renameStructuredReference(source, table, column, to)` renames a table (empty `column`) or a table column in the structured references of formula text, keeping the rest of the text.
  - `GETPIVOTDATA` reads measure values by the measure name.

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

- [#499](https://github.com/chh-ay/sheetwrite/pull/499) [`01b399c`](https://github.com/chh-ay/sheetwrite/commit/01b399ccf838032efe327e3dd63e301b7678ad11) Thanks [@chh-ay](https://github.com/chh-ay)! - Moving rows or columns (`moveRows`, `moveColumns`) moves the cells, as Excel's Cut and Insert Cut Cells does, and every reference in the workbook follows the cells it names. Before, a move ran as a delete and an insert: references to the moved cells became `#REF!`, and a moved formula read the cells that took its old place. A range loses a moved row or column at its edge and grows by a block that lands inside it, as in Excel, and undo restores the formulas that lost a row or column. A move that would split a table is refused, as in Excel.
  
  The engines add `CellStore.moveRows`, `CellStore.moveCols` and `CellStore.moveLosses`. `CellStore.moveNamedFormulaSource` is removed: the engine moves defined-name formulas itself.

- [#373](https://github.com/chh-ay/sheetwrite/pull/373) [`d0b34a7`](https://github.com/chh-ay/sheetwrite/commit/d0b34a770f74e2f42ab4bf67b3a9387b158537bf) Thanks [@chh-ay](https://github.com/chh-ay)! - Check the keys of table relationships in the full engine ([#229](https://github.com/chh-ay/sheetwrite/issues/229)).
  
  - New `SheetwriteStore.getRelationshipStatus(id)` returns a `RelationshipStatus`: `ok` with the count of unmatched many-side keys, `missingTable`, `missingColumn`, `typeMismatch` (side and row), `duplicateKey` (both one-side rows), or `unavailable` on the default engine and for an unknown ID.
  - Keys match as pivot group keys do: numbers by value and text without case. A blank key matches nothing. The one-side keys must be unique, and both columns must hold only numbers or only text.
  - The engine checks keys with a sorted index of the one-side keys: one sort, then one binary search per many-side key. It builds the index for each check and keeps nothing between checks, so a workbook with relationships holds only their IDs in the engine.

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

- [#306](https://github.com/chh-ay/sheetwrite/pull/306) [`e0c3655`](https://github.com/chh-ay/sheetwrite/commit/e0c3655b1fec3b8dd5771e234d8280a7bdf9cc4f) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUBTOTAL` and `AGGREGATE` skip hidden rows, as in Excel:
  
  - `SUBTOTAL` accepts codes 101 to 111. All codes skip the rows that a filter hides. Codes 101 to 111 also skip the rows that you hide (`hideRows`) and the rows of a collapsed row group. Before, codes 101 to 111 returned `#VALUE!`.
  - `SUBTOTAL` reads a cell argument, such as `A2` in `=SUBTOTAL(9,A2)`, as a reference: text in the cell is ignored, as in Excel, and the cell's row can be hidden.
  - `SUBTOTAL` skips cells whose formula calls `SUBTOTAL` or `AGGREGATE`, as `AGGREGATE` already did, so a subtotal is not counted two times.
  - `AGGREGATE` options 1, 3, 5 and 7 skip hidden rows. Before, they had no effect.
  - When you hide or show rows, collapse or expand a row group, or change a filter, only the `SUBTOTAL` and `AGGREGATE` formulas that read the sheet calculate again. Core sends the hidden rows of a sheet in one engine call per transaction.
  - New engine export `CellStore.setHiddenRows(sheet, manual, filtered)` sets the hidden rows of a sheet as packed `[first, last]` row ranges. A sheet without hidden rows uses no extra memory.

### Patch Changes

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

- [#318](https://github.com/chh-ay/sheetwrite/pull/318) [`3644d27`](https://github.com/chh-ay/sheetwrite/commit/3644d278220a06a4701bb53e9ad98efb5a108353) Thanks [@chh-ay](https://github.com/chh-ay)! - Remove redundant formula-transfer work, share criteria aggregation rules, and remove unused XLSX and declaration code. Correct engine safety and XLSX ownership comments without changing public behavior.

- [#517](https://github.com/chh-ay/sheetwrite/pull/517) [`a13996c`](https://github.com/chh-ay/sheetwrite/commit/a13996cdbdfc503da1105a7f43716e0817d5b1fa) Thanks [@chh-ay](https://github.com/chh-ay)! - `COUNTIF(S)`, `SUMIF(S)`, `AVERAGEIF(S)`, `MAXIFS` and `MINIFS` over single columns of typed-in values test each criterion down its whole column into a row mask, then read only the matched rows. Checking that a range holds only typed-in values, which these functions and `SUMPRODUCT`, `PERCENTILE.INC`, `CORREL` and `COVARIANCE` do first, reads the column in one pass without a branch per cell. No formula result changes.

- [#425](https://github.com/chh-ay/sheetwrite/pull/425) [`85f214a`](https://github.com/chh-ay/sheetwrite/commit/85f214a1e3b5467a3fede1516e273eb6dff396dd) Thanks [@chh-ay](https://github.com/chh-ay)! - Defined names that hold a formula are resolved once for every formula that uses them, not cached per using sheet. A name whose expansion depends on the using cell or sheet is still expanded where it is used. Name results do not change.

- [#385](https://github.com/chh-ay/sheetwrite/pull/385) [`0975f07`](https://github.com/chh-ay/sheetwrite/commit/0975f07912d62896d239adf449b3552944728c24) Thanks [@chh-ay](https://github.com/chh-ay)! - `COUNTIF` with a number criterion (`=COUNTIF(A1:A100000,">5")`) is now 11–18 times faster when its range holds only number values. It compares the stored numbers directly instead of reading each cell. Ranges with text, blanks, formulas or paged storage, and text or wildcard criteria, use the cell reader as before. No formula result changes.

- [#367](https://github.com/chh-ay/sheetwrite/pull/367) [`2270082`](https://github.com/chh-ay/sheetwrite/commit/2270082dd02bf5fc3f9e5452776991a54831bc27) Thanks [@chh-ay](https://github.com/chh-ay)! - Store formula entries in workbook-owned slots with stable numeric ids. Recalculation collects affected ids in a bitset and one flat worklist. Indexed pass state replaces the formula result map and visiting set. Row and column edits keep surviving formula ids, and memory transfers continue to use cell addresses.
  
  Vacant slots hold the free-list links without separate list allocations.
  
  Entry storage grows in small pages, so loading formulas does not repeatedly move the whole formula table.

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

- [#422](https://github.com/chh-ay/sheetwrite/pull/422) [`156537a`](https://github.com/chh-ay/sheetwrite/commit/156537aa46ca669659366b0dce519e0e1342c8bb) Thanks [@chh-ay](https://github.com/chh-ay)! - The `@sheetwrite/formulas` README's steps for adding a function no longer regenerate and commit the compatibility test set, which is now generated from the formula contract inventory when it runs.

- [#415](https://github.com/chh-ay/sheetwrite/pull/415) [`d519828`](https://github.com/chh-ay/sheetwrite/commit/d519828c399b00c0f6a7646633a11853d9bf8eeb) Thanks [@chh-ay](https://github.com/chh-ay)! - The core build generates the built-in function table from the formula contract inventory instead of reading a committed copy. The published table is unchanged; the packed `@sheetwrite/core` manifest gains a `generate` script, and the `@sheetwrite/formulas` README no longer asks contributors to regenerate docs after adding a function.

- [#537](https://github.com/chh-ay/sheetwrite/pull/537) [`d41651f`](https://github.com/chh-ay/sheetwrite/commit/d41651fc4865a1602c84b1f635c0df6a16ace46b) Thanks [@chh-ay](https://github.com/chh-ay)! - A LET whose bindings are plain calculations (constants, operators, cells and other bindings) reads its bindings from slots resolved when the formula is entered, instead of copying each binding's expression into every use on every recalculation. Such a LET recalculates with about a quarter of the work and no heap allocation per formula; formulas, written text and results do not change.

- [#449](https://github.com/chh-ay/sheetwrite/pull/449) [`45a0b1f`](https://github.com/chh-ay/sheetwrite/commit/45a0b1f2977df891203bf7685f6e81ee852c2820) Thanks [@chh-ay](https://github.com/chh-ay)! - `COUNTIF`, `COUNTIFS`, `SUMIF`, `SUMIFS`, `AVERAGEIF`, `AVERAGEIFS`, `MAXIFS` and `MINIFS` are now 4–8 times faster over ranges of typed-in values, such as `=SUMIFS(D1:D100000,A1:A100000,">=50000",C1:C100000,"keep")`. They read each cell's stored number, text or logical value in place instead of building a value, and a text copy, for every cell. Ranges with formulas, spilled values or paged storage use the cell reader as before. No formula result changes.

- [#454](https://github.com/chh-ay/sheetwrite/pull/454) [`85367f4`](https://github.com/chh-ay/sheetwrite/commit/85367f46bbbfe784732f4dcad5cb5cc2385118b1) Thanks [@chh-ay](https://github.com/chh-ay)! - `PERCENTILE.INC` with a number as its fraction (`=PERCENTILE.INC(A1:A100000,0.9)`), `CORREL`, `COVARIANCE.S` and `COVARIANCE.P` read ranges of typed-in values in place instead of copying them into lists first. Ranges with formulas, spilled values or paged storage, and computed fractions, use the existing path. No formula result changes.

- [#453](https://github.com/chh-ay/sheetwrite/pull/453) [`725732b`](https://github.com/chh-ay/sheetwrite/commit/725732bbd8767ba6abd1e862a4af88a1acf01228) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUMPRODUCT` over ranges of typed-in values, such as `=SUMPRODUCT(A1:A100000,B1:B100000)`, is now about 4 times faster and no longer copies its ranges into lists first (about 10 MB less temporary memory for two 100,000-row ranges). Ranges with formulas, spilled values or paged storage, and computed arguments, use the existing path. No formula result changes.

- [#520](https://github.com/chh-ay/sheetwrite/pull/520) [`cf90c45`](https://github.com/chh-ay/sheetwrite/commit/cf90c45b95e123ea984e06d3361981e76668b9a2) Thanks [@chh-ay](https://github.com/chh-ay)! - An exact `XLOOKUP`, `XMATCH`, `MATCH`, `VLOOKUP` or `HLOOKUP` for a number in a range of typed-in values compares the stored numbers directly instead of building a value per cell. Checking that a lookup range holds only typed-in values reads each column in one pass and counts text sizes only when the column holds text. No formula result changes.

- [#428](https://github.com/chh-ay/sheetwrite/pull/428) [`2625510`](https://github.com/chh-ay/sheetwrite/commit/26255105d445edb7e862ba738654e4cad0b4202d) Thanks [@chh-ay](https://github.com/chh-ay)! - `MATCH`, `XMATCH`, `VLOOKUP`, `HLOOKUP` and `XLOOKUP` search ranges of plain values where they are stored instead of copying them into decoded tables. Formulas that search the same range in one recalculation share one sorted position index, which also covers key columns that mix numbers, text and logical values. The lookup table, list, result, sortedness, type and bucket caches are removed. Results are unchanged.

- [#483](https://github.com/chh-ay/sheetwrite/pull/483) [`13fc035`](https://github.com/chh-ay/sheetwrite/commit/13fc035f09844a953371af0ccfc4d7f24aa8fdea) Thanks [@chh-ay](https://github.com/chh-ay)! - Measures evaluate each `CALCULATE` once per distinct filter context in a pivot update, so cells that see the same rows share one evaluation, such as every region of a quarter under `ALL` of the region ([#230](https://github.com/chh-ay/sheetwrite/issues/230)).

- [#431](https://github.com/chh-ay/sheetwrite/pull/431) [`143a647`](https://github.com/chh-ay/sheetwrite/commit/143a647c610af9955e719f8be818a9609ed6d1d9) Thanks [@chh-ay](https://github.com/chh-ay)! - Fix a hang when a chain of defined names uses each next name more than once. Each name is expanded once per formula again, and definitions are resolved in dependency order.

- [#473](https://github.com/chh-ay/sheetwrite/pull/473) [`1d0cf59`](https://github.com/chh-ay/sheetwrite/commit/1d0cf59764de8ab436a9f9506fad52694cba6d76) Thanks [@chh-ay](https://github.com/chh-ay)! - Search and filter skip writing a number cell out as text when the search text has a character no number's text contains, such as a letter, so searching numeric columns for text is several times faster. Numbers with many significant digits are also written as text faster in formula text, search and filter. Results and matches are unchanged.

- [#436](https://github.com/chh-ay/sheetwrite/pull/436) [`872c448`](https://github.com/chh-ay/sheetwrite/commit/872c448a05577d8b0ed7e00bad48838886980468) Thanks [@chh-ay](https://github.com/chh-ay)! - Write number text with a purpose-built decimal digit writer instead of Rust's float formatting, so both engines download less: about 7 KB less for the default engine and 5.5 KB less for the full engine after Brotli compression. Results are unchanged: ROUND, ROUNDUP, ROUNDDOWN, FLOOR, CEILING, TEXT, `&`, FIXED, DOLLAR and BAHTTEXT, formulas written back after an edit, and search and filter matches on numbers.

- [#476](https://github.com/chh-ay/sheetwrite/pull/476) [`3938183`](https://github.com/chh-ay/sheetwrite/commit/3938183a5454a08b431bacd060bf2c7eff59d6ce) Thanks [@chh-ay](https://github.com/chh-ay)! - A recalculation in which no formula reads another formula writes each result straight to its cell, without a pass result table or a second write loop. Results are unchanged.

- [#482](https://github.com/chh-ay/sheetwrite/pull/482) [`4a50582`](https://github.com/chh-ay/sheetwrite/commit/4a50582a04d3084915a97565e9f5703c9b64f048) Thanks [@chh-ay](https://github.com/chh-ay)! - Recalculation evaluates formulas in dependency order and writes each result straight to its cell. The per-pass result table is gone, which saves about 4.5 B of retained memory per formula, and formula chains recalculate up to 1.15× faster. Results are unchanged.

- [#423](https://github.com/chh-ay/sheetwrite/pull/423) [`e8f34cd`](https://github.com/chh-ay/sheetwrite/commit/e8f34cde93187376d1c0a2855ef4246aaeaba37a) Thanks [@chh-ay](https://github.com/chh-ay)! - Store paged sheets in flat page, dirty-block and calculated-block directories instead of hash maps. Paged edits, acknowledgements, cache eviction and range reads through formulas get faster. Edit, acknowledgement, eviction and unloaded-cell behavior is unchanged.

- [#533](https://github.com/chh-ay/sheetwrite/pull/533) [`22c6721`](https://github.com/chh-ay/sheetwrite/commit/22c672182ec0c52981e7988705706c82c1825cac) Thanks [@chh-ay](https://github.com/chh-ay)! - Recalculation does less work per formula: marking a formula selected, being evaluated or settled no longer calls out of line, and the cell whose formula is being evaluated (read by `ROW()`, `COLUMN()` and R1C1 references) is kept in one value instead of a list. No formula result changes.

- [#410](https://github.com/chh-ay/sheetwrite/pull/410) [`7f8c8c4`](https://github.com/chh-ay/sheetwrite/commit/7f8c8c4db5bb745ad4fe1367e6930ee2961cffc7) Thanks [@chh-ay](https://github.com/chh-ay)! - `REGEXTEST`, `REGEXEXTRACT` and `REGEXREPLACE` compile their patterns within one recalculation. The recalculation keeps up to four compiled patterns, each keyed on its exact text and case mode, and shares them with the step that sizes a `REGEXEXTRACT` spill. It drops them when it ends. The engine-wide store of recently compiled patterns is removed, so no compiled pattern stays in memory after a recalculation or after the workbook that used it is gone.

- [#429](https://github.com/chh-ay/sheetwrite/pull/429) [`0daf848`](https://github.com/chh-ay/sheetwrite/commit/0daf84878296b61e84ad44db992955048386e9a8) Thanks [@chh-ay](https://github.com/chh-ay)! - `REGEXTEST`, `REGEXEXTRACT` and `REGEXREPLACE` compile a pattern written in the formula once, not in every recalculation. Formulas in one workbook with the same pattern text share the compiled pattern, and it is freed when the last of them is removed. Patterns computed from cells are compiled within each recalculation.

- [#463](https://github.com/chh-ay/sheetwrite/pull/463) [`dd49f28`](https://github.com/chh-ay/sheetwrite/commit/dd49f284abd25aefae57d78abdde762ac26aedf5) Thanks [@chh-ay](https://github.com/chh-ay)! - Parse formulas in one pass: the parser reads tokens as it lexes them and climbs operator precedence in one loop, and ingest resolves sheets, defined names and table references only for formulas that hold them. Formula loading gets faster; parsed formulas, errors and formula-help messages are unchanged.

- [#355](https://github.com/chh-ay/sheetwrite/pull/355) [`5ea7336`](https://github.com/chh-ay/sheetwrite/commit/5ea7336d7602697a123a5f6594e6c77924e5a415) Thanks [@chh-ay](https://github.com/chh-ay)! - Sort spill rows by their displayed values instead of treating projected children as blank sources. Preserve stable ties, multi-key ordering, and filter-then-sort behavior without adding a sort cache or per-row ownership lookup.

- [#300](https://github.com/chh-ay/sheetwrite/pull/300) [`cfc6d1f`](https://github.com/chh-ay/sheetwrite/commit/cfc6d1fae12c8e3fd6b68db0b93af83a1ccb531e) Thanks [@chh-ay](https://github.com/chh-ay)! - A row or column insert that a sheet cannot hold changes nothing. `addRows`, `removeRows`, `insertCols` and `removeCols` return `false` for a dense sheet that would pass its cell limit or a row count that overflows, and the store rejects the operation instead of moving formulas, charts or metadata for cells that did not move. `addPagedSheet` throws for a chunk size above 1048576 rows.

- [#518](https://github.com/chh-ay/sheetwrite/pull/518) [`3978341`](https://github.com/chh-ay/sheetwrite/commit/3978341c92da5578cccd166568eb7dfcddf7d17e) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and `COUNTA` over a single column of typed-in numbers and empty cells read the column as one slice, with one check for the whole column, instead of cell by cell. The sum still adds in row order, so results do not change.

- [#521](https://github.com/chh-ay/sheetwrite/pull/521) [`2d17ed1`](https://github.com/chh-ay/sheetwrite/commit/2d17ed18937ce2c832517d67d18de166b7a9f3b2) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUMPRODUCT` over single columns of typed-in numbers and empty cells multiplies the columns as slices, with one check of each column's cell types and one check of the total, instead of checks on every product. The products and the total add in the same order, so results do not change.

- [#471](https://github.com/chh-ay/sheetwrite/pull/471) [`9ba077c`](https://github.com/chh-ay/sheetwrite/commit/9ba077c00fa532b1a7264952606d36cd361d5fae) Thanks [@chh-ay](https://github.com/chh-ay)! - TEXT returns `#NUM!` when a percent code takes the number past the largest double, for example `=TEXT(1.7E+308,"0%")`. The engine stopped with an error before.

- [#402](https://github.com/chh-ay/sheetwrite/pull/402) [`bc7ca0d`](https://github.com/chh-ay/sheetwrite/commit/bc7ca0deddf6ee4b054123a7480f36211e8ffd77) Thanks [@chh-ay](https://github.com/chh-ay)! - `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT` and `COUNTA` read range cells from the stored kind and payload arrays instead of building a value per cell. `SUM` over several ranges, or ranges mixed with scalar arguments, folds every argument in order into one running sum, with the same text, logical and error rules. Formulas that sum the same range of plain values in one recalculation share one scan. The range sum cache that lived across recalculations is removed.

- [#519](https://github.com/chh-ay/sheetwrite/pull/519) [`411f4e4`](https://github.com/chh-ay/sheetwrite/commit/411f4e4131907e2fe0108beaf3a5ec8ea2b5801b) Thanks [@chh-ay](https://github.com/chh-ay)! - Ordering a recalculation of formulas that read other formulas no longer looks up the address of every formula it orders. A formula that a row or column insert would move onto another formula's cell is now removed instead of being left behind outside the sheet's formula list. No formula result changes.

- [#498](https://github.com/chh-ay/sheetwrite/pull/498) [`0069438`](https://github.com/chh-ay/sheetwrite/commit/006943813203de185a6167146506d4647e581557) Thanks [@chh-ay](https://github.com/chh-ay)! - A chart over a worksheet pivot (`ChartDefinition.pivot`) plots the pivot's leaf items, as an Excel PivotChart does. Before, it showed only on dashboards. The categories are the leaf row items, with the outer items joined into each label (`East / Retail`), and each value field, for each column item, is one series. Subtotals and grand totals are never points, in compact and tabular layout. The chart follows the pivot's fields, filters and source edits, `pivotValues` picks the values it plots, and it keeps no values of its own.
  
  - The full engine computes a copy of the pivot for its charts, without totals and without cells: core anchors the copy right of the last column, and a pivot anchored right of the last column of its sheet places no output.
  - The code that reads charts over pivots loads with the first such chart. A change event names the charts when it has loaded; that event has no `epoch`.
  - With the active cell in a worksheet pivot, Insert › Charts › PivotChart adds a chart over that pivot to the right of its output.
  - XLSX export writes the chart with the values it plots, and import reads it back as a chart over the pivot.

- [#356](https://github.com/chh-ay/sheetwrite/pull/356) [`8ebfd62`](https://github.com/chh-ay/sheetwrite/commit/8ebfd62869f3bce4eb86123520ea0e155247707e) Thanks [@chh-ay](https://github.com/chh-ay)! - Write cell formulas with Excel's future-function and local-binding prefixes, including LET, LAMBDA, XLOOKUP, FILTER and SORT, and remove those prefixes on import. Cells and defined names now share the engine converter, including the A1# spill spelling.
  
  Convert each workbook's distinct formulas in one batch instead of crossing the JavaScript-to-WASM boundary for every cell. Reuse an initialized engine or retire a temporary conversion instance. Formula-free workbooks, including workbooks with only range names, do not load an engine.

## 0.6.1

### Patch Changes

- [#234](https://github.com/chh-ay/sheetwrite/pull/234) [`1ceb09a`](https://github.com/chh-ay/sheetwrite/commit/1ceb09a7567a99292744d8b4fd459ffc0c73b3fb) Thanks [@chh-ay](https://github.com/chh-ay)! - Recalculate faster after many single-cell writes followed by a bulk write.

- [#235](https://github.com/chh-ay/sheetwrite/pull/235) [`3df2d80`](https://github.com/chh-ay/sheetwrite/commit/3df2d80d6b670d41ba5b18954befe281694a2ddd) Thanks [@chh-ay](https://github.com/chh-ay)! - Value edits in a workbook without formulas or pivot tables no longer run the formula recalculation pass. The pass is the largest function of the engine, and the WebAssembly runtime compiled it while the first edits ran, so the first thousands of edits of a data grid were slower than in 0.5.4. Calculated values and edit results do not change.

## 0.6.0

### Minor Changes

- 9dc3ab1: Add reference-valued `OFFSET(reference, rows, cols, [height], [width])` and `INDIRECT(text, [a1])` in both engines and formula autocomplete. Their results can feed reference-taking functions, `LAMBDA`, `MAP` and the other array helpers, or spill multiple cells; a one-cell result is a plain value, not a spill. Both functions are volatile and recalculate with their dependents after every source-changing edit; runtime dependency cycles return `#CYCLE!`.
  
  `OFFSET` inherits omitted dimensions from its source reference and requires positive height and width. Out-of-grid bounds return `#REF!`; nonpositive dimensions, nonnumeric offsets or a non-reference first argument return `#VALUE!`. `INDIRECT` accepts A1 or R1C1 notation, including relative R1C1 coordinates, sheet-qualified references, defined names and table references. Invalid targets and external workbook references return `#REF!`. Reference text is not rewritten by fill, copy or structural edits. Existing sheet, range and spill limits still apply.
  
  OFFSET and INDIRECT are volatile, as in Excel. The engine does not record the cells they read as graph edges. Each edit recalculates them again, so a moved or edited target always shows. Workbooks without these functions do not pay this cost. `recompute(sheet)` on a sheet with volatile formulas also recalculates the volatile formulas on every other sheet, because Excel recalculates volatile functions for the whole workbook. A reference to another sheet then stays current.
- b6f333c: Add saved pivot-table calculation to the full engine. Share grouping rules with PIVOTBY. Update only affected groups after source edits, and keep MIN, MAX, and DISTINCTCOUNT correct when values are removed. Add SUM and AVERAGE values exactly and round them one time, so edits give the same result as a new calculation. Include pivot caches in memory statistics.
  
  Keep pivot output in spill state, not in formula sources. Retry output after a blocker is cleared. Recalculate formula sources and dependent formulas, retain colliding anchors after structural edits, and rebuild caches after engine memory transfer. The default engine does not include pivot calculation.
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

## 0.5.4

### Patch Changes

- aba7c92: Release with the other packages so all seven share one version. The engine does not change.

## 0.5.3

### Patch Changes

- 222a3f8: Publish readable JavaScript again. 0.5.2 removed whitespace from the published files, so stack traces pointed into one long line and the code in `node_modules` was hard to read and debug. Your bundler still minifies your app build. Module paths, exports, and type documentation do not change.

## 0.5.2

### Patch Changes

- 2e4231c: Remove comments and extra whitespace from published JavaScript to reduce package download and installed sizes. Keep module paths, exported names, type documentation, and WebAssembly binaries unchanged.

## 0.5.1

### Patch Changes

- 7d9b52a: Add checked API examples and links for grid setup, data, synchronization, framework components, engine selection, and XLSX import and export.

## 0.5.0

### Minor Changes

- a320510: Apply formula operators to each array element. Scalars and single rows or columns expand to match the other operand. Array results spill into adjacent cells and work as arguments to functions that accept arrays.
- 87a5085: Add DATEDIF, ISOWEEKNUM, NETWORKDAYS.INTL, and WORKDAY.INTL. Add 15 financial functions for cash flows, loan totals, interest rates, and depreciation. The default engine does not change.
- a779932: Add descriptive statistics, ranking and simple linear regression to the full formula engine: `AVEDEV`, `DEVSQ`, `HARMEAN`, `KURT`, `SKEW`, `SKEW.P`, `TRIMMEAN`, `PERCENTILE.EXC`, `QUARTILE.EXC`, `PERCENTRANK.INC`, `PERCENTRANK.EXC`, `RANK.AVG`, `PEARSON`, `RSQ`, `SLOPE`, `INTERCEPT`, `STEYX`, and `FORECAST.LINEAR` (also spelled `FORECAST`). They use the Excel argument rules: a cell argument is a reference, so text in that cell is ignored, and regression functions skip pairs where either value is not a number. `PERCENTRANK` results are truncated to the requested significant digits, as in Excel. The default `@sheetwrite/wasm` engine does not change.
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
- b8dbb50: Add `@sheetwrite/formulas`, an optional full formula engine. It is the same Rust engine as `@sheetwrite/wasm`, built with more functions, and it has the same API and loaders. The full engine is a separate build: it adds nothing to the function set or binary of the default `@sheetwrite/wasm` engine.
  
  - Select the full engine one time, before the app creates a grid or a store: `import * as formulas from "@sheetwrite/formulas"; await initSheetwrite(undefined, formulas);`. A call that selects a different engine after this rejects. Calls without an engine keep the selected engine, so framework adapters work with both engines.
  - The full engine adds 36 statistical distribution functions: `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `F.DIST`, `F.DIST.RT`, `F.INV`, `F.INV.RT`, `BINOM.DIST`, `POISSON.DIST`, `EXPON.DIST`, `GAMMA`, `GAMMALN`, `GAMMA.DIST`, `GAMMA.INV`, `BETA.DIST`, `BETA.INV`, `LOGNORM.DIST`, `LOGNORM.INV`, `WEIBULL.DIST`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `STANDARDIZE`, `FISHER`, `FISHERINV`, `PHI`, and `GAUSS`. They use the Excel argument rules and error values.
  - Formula assist suggests only the functions of the selected engine. With the default engine, these functions return `#NAME?`.
  - In this release, the full engine binary is 1,074,934 bytes (326,278 bytes with Brotli) and the default engine binary is 791,937 bytes (238,071 bytes with Brotli).
- b072a35: Add GROUPBY, PIVOTBY, and PERCENTOF to the full engine. Summaries support multiple fields, headers, filters, totals, subtotals, field and value sorting, and single built-in or LAMBDA aggregators. Vectors of aggregator functions are not supported. Grouping and output use the existing spill and work limits. The default engine does not include these functions.
- 2deec77: Add LAMBDA, MAP, REDUCE, SCAN, BYROW, BYCOL, MAKEARRAY, and ISOMITTED to the full formula engine. Support immediate invocation, lexical parameters, LET-bound functions, and bounded recursion. Keep the default engine unchanged.
- 2ea968e: Add database criteria functions and more math functions to the full engine. Add matrix multiplication, inverse, determinant, and identity arrays. Keep the default engine unchanged.
- ee4d45a: Add MODE.MULT and SORTBY to the full formula engine. MODE.MULT returns every most frequent value as a column, in the order of first occurrence. SORTBY sorts the rows or columns of an array by one or more key arrays, each ascending or descending, and keeps equal items in their order.
- dad4691: Add the LINEST, LOGEST, TREND, GROWTH, and FREQUENCY array functions to the full engine. Regression supports more than one predictor, the `const` argument, five rows of fit statistics, and removal of collinear predictors. With `const=FALSE`, linear fits use an intercept of zero and exponential fits use a multiplier of one. Add PROB and the legacy PERCENTILE, PERCENTRANK, QUARTILE, and RANK names. The default engine does not change.
- 2af5b21: Add TOCOL, TOROW, WRAPROWS, WRAPCOLS, EXPAND, HSTACK, and VSTACK to the full formula engine. The functions support scan order, blank and error filtering, padding, and dynamic spill sizes. The default engine is unchanged.
- 35e8450: Add TEXTBEFORE, TEXTAFTER, TEXTSPLIT, FIXED, DOLLAR, VALUETOTEXT, ARRAYTOTEXT, REGEXTEST, REGEXEXTRACT, and REGEXREPLACE to the full engine. TEXTSPLIT and regex extraction can spill results. Regex uses the regex-lite syntax. Patterns that require lookaround, backreferences, or Unicode classes return #VALUE!. Case-insensitive matching folds ASCII letters only. The default engine does not include regex.

### Patch Changes

- f25513a: Support array constants in formulas. Preserve their row and column shape for spills and array arguments, and preserve their values through formula edits and XLSX round trips.
- 0241abd: Allocate dense calculated values in lazy 512-cell chunks instead of reserving an entire sheet on its first formula. Empty chunks are released when spills shrink, and memory-release transfers retain only populated chunks.
  
  Track live chunks so empty-overlay reads and source writes keep their fast paths. Resolve scalar spill kinds and payloads together to avoid repeated chunk lookups. Avoid wide range-cache allocations for single-row scans, and check paged-cell load state before reading its payload.
- 837eb95: Store analysis function names as compact registry identifiers. This keeps function values small when the full engine is selected. Formula names and results do not change.
- 1240c84: Reduce repeated indexing in matrix calculations and avoid allocation in sums of squares.
- c6674f9: Reduce memory allocation in formula array operations.
- d137ff0: Reduce calculation time for text, calendar, and financial formulas without changing their results.
- 7f73dc7: Reduce the time to calculate WORKDAY, UNIQUE, and SEARCH formulas.
- b771aa0: Reduce calculation work for statistical formulas without changing results.
- ddaac0d: Fix FILTER in debug builds when its input array has fewer cells than its static size bound. FILTER uses the evaluated array size for its result.
- d63ac3d: An edit that changes only formula constants keeps the dependency index, so the
  next recompute does not rebuild it for the whole workbook. Sparse, packed, and
  scalar writes now share one source-replacement module.
- 64aebd9: Release decoded lookup ranges when recalculation ends, including early returns. Lookup results do not change.
- 2c26d4c: Skip spill and formula metadata lookups when the metadata is empty. This reduces the time to load one million rows by 35% in the measured mixed-column workload. The default WebAssembly file grows by 718 bytes (0.09%) for this improvement.
- 11e8edd: Fix a spill that reads another spill showing the previous values. When the spill it reads is placed later in the same recalculation, the reading spill is now calculated again. Spills that read each other show #CYCLE!.
- e725d98: Support spill references such as `A1#`. A spill reference refers to the current spill of its anchor cell and follows it when the spill changes size. It returns `#REF!` when the anchor holds no spill. Row and column edits move the reference with its anchor. XLSX import and export convert it to and from `_xlfn.ANCHORARRAY`.
- 99435f8: Keep painted and frozen cells resident during unrelated bulk reads. Load the same-sheet formula dependencies of frozen cells and reached merge anchors, and retain the bounded formula closure while its window is visible. Give bulk reads transient pins separate from viewport protection and caller-owned WASM `pinRange` pins.
