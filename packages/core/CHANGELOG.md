# @sheetwrite/core

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
