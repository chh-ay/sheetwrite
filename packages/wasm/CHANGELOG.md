# @sheetwrite/wasm

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
