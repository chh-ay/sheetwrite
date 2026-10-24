# @sheetwrite/xlsx

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
