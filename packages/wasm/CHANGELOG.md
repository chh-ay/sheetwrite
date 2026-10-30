# @sheetwrite/wasm

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
