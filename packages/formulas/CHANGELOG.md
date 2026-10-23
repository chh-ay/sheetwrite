# @sheetwrite/formulas

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
