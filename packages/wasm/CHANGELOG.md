# @sheetwrite/wasm

## 0.4.1

### Patch Changes

- 5bdff6a: Rebuild the columnar store on the pinned Rust 1.98.1 toolchain. The source now follows the new rustfmt style, and clippy-selected rewrites replace `unwrap` calls after `is_some` in the paged setters, use the newer `is_multiple_of`, `as_chunks`, and `slice::from_ref` standard-library forms, and drop redundant counters and conversions.

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
