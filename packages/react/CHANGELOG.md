# @sheetwrite/react

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
- e6b6dbb: Share adapter initialization, reset classification, Grid generation publication, and retirement through `createAdapterGridController` in `@sheetwrite/core/adapter`. Apply pending live options before readiness, retire a new Grid when publication or readiness callbacks throw, preserve first-source loader diagnostics without replacing healthy Grids, and treat omitted and canvas renderers as the same input.

### Patch Changes

- ed66b6d: Faster large edits, scrolling and collaboration paths. Results are unchanged; numbers are medians from alternating runs.
  
  - A large `setBlock` measures its payload once per commit instead of three times: a 1,000,000-cell block write is 60% faster (1,364 ms to 545 ms), 50% faster with detailed change capture.
  - Number and date cells reuse their formatted text, and wrapped text stops laying out lines that cannot be drawn: wrapped-text scrolling is 39% faster and number-format scrolling 14% faster.
  - Inserting rows with a row bridge checks duplicate IDs with a set: inserting 10,000 rows into 1,000,000 fell from 34.7 s to 5 ms.
  - Framework adapters subscribe to command state only while a command-state handler exists, so selection skips the per-cell summary otherwise (24% faster selection without a handler).
  - Rebasing operations no longer clones them a second time (98% faster for a large block), and sparse writes skip validation rules outside the written area (22% faster with 100 unrelated rules).
  - A search highlight or note on a partly visible top row is no longer dropped, and a command-state handler installed inside a selection or change callback now receives the following emission.
- cb78a4b: Exclude source maps from published library packages to reduce download and install size. Keep maps in local builds for development and size analysis.
  
  Declare only CSS files as side effects in the React, Vue, and Svelte adapters. Bundlers can remove unused JavaScript and keep imported stylesheets.
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

- Correct the React adapter release metadata and package-specific changelog without changing runtime behavior.
- Updated dependencies
  - @sheetwrite/core@0.3.1

## 0.3.0

### Minor Changes

- e551eb0: Expose typed `SheetwriteError` failures through `onInitializationError` while preserving React grid readiness and input-reset lifecycle behavior.

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
