---
title: "CellStore | @sheetwrite/wasm"
description: "The workbook-wide store: every sheet, one string pool."
---
<!-- api-export:@sheetwrite/wasm|.|CellStore -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

The workbook-wide store: every sheet, one string pool.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/pkg/sheetwrite_wasm.d.ts#L20"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L20</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#cell-store-acknowledge-revision"><code>acknowledgeRevision</code></a>
<a href="#cell-store-add-paged-sheet"><code>addPagedSheet</code></a>
<a href="#cell-store-add-rows"><code>addRows</code></a>
<a href="#cell-store-add-sheet"><code>addSheet</code></a>
<a href="#cell-store-aggregate"><code>aggregate</code></a>
<a href="#cell-store-begin-mutation"><code>beginMutation</code></a>
<a href="#cell-store-begin-page-load"><code>beginPageLoad</code></a>
<a href="#cell-store-can-dirty-cell"><code>canDirtyCell</code></a>
<a href="#cell-store-capture-range"><code>captureRange</code></a>
<a href="#cell-store-capture-references"><code>captureReferences</code></a>
<a href="#cell-store-capture-sources"><code>captureSources</code></a>
<a href="#cell-store-capture-sources-for-rows"><code>captureSourcesForRows</code></a>
<a href="#cell-store-cell-state"><code>cellState</code></a>
<a href="#cell-store-clear-cell"><code>clearCell</code></a>
<a href="#cell-store-clear-range"><code>clearRange</code></a>
<a href="#cell-store-col-count"><code>colCount</code></a>
<a href="#cell-store-columns-fully-loaded"><code>columnsFullyLoaded</code></a>
<a href="#cell-store-compact-string-storage"><code>compactStringStorage</code></a>
<a href="#cell-store-data-edge"><code>dataEdge</code></a>
<a href="#cell-store-data-edge-ordered"><code>dataEdgeOrdered</code></a>
<a href="#cell-store-dirty-revision"><code>dirtyRevision</code></a>
<a href="#cell-store-distinct-values"><code>distinctValues</code></a>
<a href="#cell-store-end-mutation"><code>endMutation</code></a>
<a href="#cell-store-end-page-load"><code>endPageLoad</code></a>
<a href="#cell-store-filter-rows"><code>filterRows</code></a>
<a href="#cell-store-filter-rows-multi"><code>filterRowsMulti</code></a>
<a href="#cell-store-formula-matrix-resource-stats"><code>formulaMatrixResourceStats</code></a>
<a href="#cell-store-formula-source"><code>formulaSource</code></a>
<a href="#cell-store-free"><code>free</code></a>
<a href="#cell-store-get-cell"><code>getCell</code></a>
<a href="#cell-store-get-window"><code>getWindow</code></a>
<a href="#cell-store-get-window-rows"><code>getWindowRows</code></a>
<a href="#cell-store-hydrate-page-numbers"><code>hydratePageNumbers</code></a>
<a href="#cell-store-hydrate-page-strings-packed"><code>hydratePageStringsPacked</code></a>
<a href="#cell-store-insert-cols"><code>insertCols</code></a>
<a href="#cell-store-is-fully-loaded"><code>isFullyLoaded</code></a>
<a href="#cell-store-is-paged"><code>isPaged</code></a>
<a href="#cell-store-is-sheet-alive"><code>isSheetAlive</code></a>
<a href="#cell-store-mark-cell-clean-revision"><code>markCellCleanRevision</code></a>
<a href="#cell-store-mark-range-clean"><code>markRangeClean</code></a>
<a href="#cell-store-memory-stats"><code>memoryStats</code></a>
<a href="#cell-store-paged-dirty-coordinates"><code>pagedDirtyCoordinates</code></a>
<a href="#cell-store-paged-stats"><code>pagedStats</code></a>
<a href="#cell-store-persisted-cell-data"><code>persistedCellData</code></a>
<a href="#cell-store-pin-range"><code>pinRange</code></a>
<a href="#cell-store-pool-strings"><code>poolStrings</code></a>
<a href="#cell-store-query-resource-stats"><code>queryResourceStats</code></a>
<a href="#cell-store-range-fully-loaded"><code>rangeFullyLoaded</code></a>
<a href="#cell-store-range-style-ids"><code>rangeStyleIds</code></a>
<a href="#cell-store-recompute"><code>recompute</code></a>
<a href="#cell-store-recompute-changed"><code>recomputeChanged</code></a>
<a href="#cell-store-recompute-volatile"><code>recomputeVolatile</code></a>
<a href="#cell-store-reference-target"><code>referenceTarget</code></a>
<a href="#cell-store-references-targeting"><code>referencesTargeting</code></a>
<a href="#cell-store-remap-range-styles"><code>remapRangeStyles</code></a>
<a href="#cell-store-remove-cols"><code>removeCols</code></a>
<a href="#cell-store-remove-named-range"><code>removeNamedRange</code></a>
<a href="#cell-store-remove-rows"><code>removeRows</code></a>
<a href="#cell-store-remove-sheet"><code>removeSheet</code></a>
<a href="#cell-store-remove-table"><code>removeTable</code></a>
<a href="#cell-store-rename-sheet"><code>renameSheet</code></a>
<a href="#cell-store-reset-formula-matrix-resource-stats"><code>resetFormulaMatrixResourceStats</code></a>
<a href="#cell-store-reset-query-resource-stats"><code>resetQueryResourceStats</code></a>
<a href="#cell-store-restore-range"><code>restoreRange</code></a>
<a href="#cell-store-row-count"><code>rowCount</code></a>
<a href="#cell-store-search"><code>search</code></a>
<a href="#cell-store-set-block"><code>setBlock</code></a>
<a href="#cell-store-set-bool"><code>setBool</code></a>
<a href="#cell-store-set-column-numbers"><code>setColumnNumbers</code></a>
<a href="#cell-store-set-column-strings"><code>setColumnStrings</code></a>
<a href="#cell-store-set-column-strings-packed"><code>setColumnStringsPacked</code></a>
<a href="#cell-store-set-conditional-rules"><code>setConditionalRules</code></a>
<a href="#cell-store-set-formula"><code>setFormula</code></a>
<a href="#cell-store-set-named-range"><code>setNamedRange</code></a>
<a href="#cell-store-set-number"><code>setNumber</code></a>
<a href="#cell-store-set-sheet-name"><code>setSheetName</code></a>
<a href="#cell-store-set-sparse-block"><code>setSparseBlock</code></a>
<a href="#cell-store-set-spill-blockers"><code>setSpillBlockers</code></a>
<a href="#cell-store-set-string"><code>setString</code></a>
<a href="#cell-store-set-table"><code>setTable</code></a>
<a href="#cell-store-snapshot-numbers"><code>snapshotNumbers</code></a>
<a href="#cell-store-snapshot-texts"><code>snapshotTexts</code></a>
<a href="#cell-store-sort-rows"><code>sortRows</code></a>
<a href="#cell-store-sort-rows-multi"><code>sortRowsMulti</code></a>
<a href="#cell-store-spill-anchor-col"><code>spillAnchorCol</code></a>
<a href="#cell-store-spill-anchor-row"><code>spillAnchorRow</code></a>
<a href="#cell-store-spill-derived-mask"><code>spillDerivedMask</code></a>
<a href="#cell-store-spill-owner-coordinates"><code>spillOwnerCoordinates</code></a>
<a href="#cell-store-style-id-at"><code>styleIdAt</code></a>
<a href="#cell-store-wasm-committed-bytes"><code>wasmCommittedBytes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>90</span>

<div class="api-member-list">

<details class="api-member" id="cell-store-acknowledge-revision" data-pagefind-weight="1">
<summary><code>acknowledgeRevision</code></summary>

```ts generated
acknowledgeRevision: (revision: bigint) => void;
```

</details>

<details class="api-member" id="cell-store-add-paged-sheet" data-pagefind-weight="1">
<summary><code>addPagedSheet</code> <span class="api-member-summary">Allocate a logical sheet whose cell chunks materialize on page load or edit.</span></summary>

```ts generated
addPagedSheet: (n_cols: number, row_count: number, chunk_rows: number, byte_budget: number, max_dirty_cells: number) => number;
```

</details>

<details class="api-member" id="cell-store-add-rows" data-pagefind-weight="1">
<summary><code>addRows</code></summary>

```ts generated
addRows: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-add-sheet" data-pagefind-weight="1">
<summary><code>addSheet</code> <span class="api-member-summary">Allocate a sheet grid and return its numeric handle.</span></summary>

```ts generated
addSheet: (n_cols: number, row_count: number) => number;
```

</details>

<details class="api-member" id="cell-store-aggregate" data-pagefind-weight="1">
<summary><code>aggregate</code> <span class="api-member-summary">Column aggregate over numeric cells.</span></summary>

```ts generated
aggregate: (sheet: number, col: number, op: number) => number;
```

<p class="api-member-doc">Column aggregate over numeric cells. op: 0 sum, 1 avg, 2 min, 3 max, 4 count.</p>
</details>

<details class="api-member" id="cell-store-begin-mutation" data-pagefind-weight="1">
<summary><code>beginMutation</code></summary>

```ts generated
beginMutation: () => bigint;
```

</details>

<details class="api-member" id="cell-store-begin-page-load" data-pagefind-weight="1">
<summary><code>beginPageLoad</code></summary>

```ts generated
beginPageLoad: () => void;
```

</details>

<details class="api-member" id="cell-store-can-dirty-cell" data-pagefind-weight="1">
<summary><code>canDirtyCell</code></summary>

```ts generated
canDirtyCell: (sheet: number, row: number, col: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-capture-range" data-pagefind-weight="1">
<summary><code>captureRange</code> <span class="api-member-summary">Capture a dense rectangle into an opaque store-local history resource.</span></summary>

```ts generated
captureRange: (sheet: number, r0: number, c0: number, rows: number, cols: number) => RangeSnapshot | undefined;
```

</details>

<details class="api-member" id="cell-store-capture-references" data-pagefind-weight="1">
<summary><code>captureReferences</code> <span class="api-member-summary">Capture only persisted references for one sheet.</span></summary>

```ts generated
captureReferences: (sheet: number, max_entries: number) => SourceSnapshot | undefined;
```

<p class="api-member-doc">Capture only persisted references for one sheet. The explicit entry cap
bounds allocation for host-side structural admission simulation.</p>
</details>

<details class="api-member" id="cell-store-capture-sources" data-pagefind-weight="1">
<summary><code>captureSources</code> <span class="api-member-summary">Capture only persisted formula/reference sources in a rectangle.</span></summary>

```ts generated
captureSources: (sheet: number, r0: number, c0: number, rows: number, cols: number) => SourceSnapshot | undefined;
```

<p class="api-member-doc">Capture only persisted formula/reference sources in a rectangle. The
returned opaque object is compact in source cardinality, not cell count.</p>
</details>

<details class="api-member" id="cell-store-capture-sources-for-rows" data-pagefind-weight="1">
<summary><code>captureSourcesForRows</code> <span class="api-member-summary">Capture persisted formula/reference sources and derived-spill identity for arbitrary row/column coordinates in one boundary crossing.</span></summary>

```ts generated
captureSourcesForRows: (sheet: number, rows: Uint32Array, cols: Uint32Array) => SourceSnapshot | undefined;
```

<p class="api-member-doc">Capture persisted formula/reference sources and derived-spill identity
for arbitrary row/column coordinates in one boundary crossing. Offsets
follow the caller's row-major coordinate order.</p>
</details>

<details class="api-member" id="cell-store-cell-state" data-pagefind-weight="1">
<summary><code>cellState</code> <span class="api-member-summary">0 unloaded, 1 loaded-empty, 2 loaded-value, 3 dirty local edit.</span></summary>

```ts generated
cellState: (sheet: number, row: number, col: number) => number;
```

</details>

<details class="api-member" id="cell-store-clear-cell" data-pagefind-weight="1">
<summary><code>clearCell</code></summary>

```ts generated
clearCell: (sheet: number, row: number, col: number, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-clear-range" data-pagefind-weight="1">
<summary><code>clearRange</code> <span class="api-member-summary">Clear a rectangle while independently controlling contents and style.</span></summary>

```ts generated
clearRange: (sheet: number, r0: number, c0: number, r1: number, c1: number, contents: boolean, style: boolean) => boolean;
```

</details>

<details class="api-member" id="cell-store-col-count" data-pagefind-weight="1">
<summary><code>colCount</code></summary>

```ts generated
colCount: (sheet: number) => number;
```

</details>

<details class="api-member" id="cell-store-columns-fully-loaded" data-pagefind-weight="1">
<summary><code>columnsFullyLoaded</code></summary>

```ts generated
columnsFullyLoaded: (sheet: number, start_row: number, end_row: number, cols: Uint32Array) => boolean;
```

</details>

<details class="api-member" id="cell-store-compact-string-storage" data-pagefind-weight="1">
<summary><code>compactStringStorage</code> <span class="api-member-summary">Release geometric growth slack after a bounded bulk ingest.</span></summary>

```ts generated
compactStringStorage: () => void;
```

</details>

<details class="api-member" id="cell-store-data-edge" data-pagefind-weight="1">
<summary><code>dataEdge</code> <span class="api-member-summary">Ctrl+Arrow destination: from (row, col) stepping by (drow, dcol) (exactly one of them ±1), return the destination row (vertical moves) or column (horizontal moves), Google Sheets semantics: - current and adjacent…</span></summary>

```ts generated
dataEdge: (sheet: number, row: number, col: number, d_row: number, d_col: number) => number;
```

<p class="api-member-doc">Ctrl+Arrow destination: from `(row, col)` stepping by `(d_row, d_col)`
(exactly one of them ±1), return the destination row (vertical moves) or
column (horizontal moves), Google Sheets semantics:

- current and adjacent cell non-empty → end of the contiguous non-empty
  run;
- otherwise → the next non-empty cell in that direction;
- nothing ahead → the sheet edge.</p>
</details>

<details class="api-member" id="cell-store-data-edge-ordered" data-pagefind-weight="1">
<summary><code>dataEdgeOrdered</code></summary>

```ts generated
dataEdgeOrdered: (sheet: number, order: Uint32Array, row: number, col: number, d_row: number, d_col: number) => number;
```

</details>

<details class="api-member" id="cell-store-dirty-revision" data-pagefind-weight="1">
<summary><code>dirtyRevision</code></summary>

```ts generated
dirtyRevision: (sheet: number, row: number, col: number) => bigint;
```

</details>

<details class="api-member" id="cell-store-distinct-values" data-pagefind-weight="1">
<summary><code>distinctValues</code></summary>

```ts generated
distinctValues: (sheet: number, col: number, limit: number) => DistinctColumn;
```

</details>

<details class="api-member" id="cell-store-end-mutation" data-pagefind-weight="1">
<summary><code>endMutation</code></summary>

```ts generated
endMutation: () => void;
```

</details>

<details class="api-member" id="cell-store-end-page-load" data-pagefind-weight="1">
<summary><code>endPageLoad</code></summary>

```ts generated
endPageLoad: () => void;
```

</details>

<details class="api-member" id="cell-store-filter-rows" data-pagefind-weight="1">
<summary><code>filterRows</code> <span class="api-member-summary">Data-row indices whose column text contains needle (case-insensitive).</span></summary>

```ts generated
filterRows: (sheet: number, col: number, needle: string) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-filter-rows-multi" data-pagefind-weight="1">
<summary><code>filterRowsMulti</code></summary>

```ts generated
filterRowsMulti: (sheet: number, cols: Uint32Array, kinds: Uint8Array, flags: Uint8Array, nums: Float64Array, num_counts: Uint32Array, text_counts: Uint32Array, value_nums: Float64Array, value_texts: string[]) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-formula-matrix-resource-stats" data-pagefind-weight="1">
<summary><code>formulaMatrixResourceStats</code> <span class="api-member-summary">Benchmark diagnostic: [current matrix bytes, peak matrix bytes, allocations].</span></summary>

```ts generated
formulaMatrixResourceStats: () => Float64Array;
```

</details>

<details class="api-member" id="cell-store-formula-source" data-pagefind-weight="1">
<summary><code>formulaSource</code></summary>

```ts generated
formulaSource: (sheet: number, row: number, col: number) => string | undefined;
```

</details>

<details class="api-member" id="cell-store-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="cell-store-get-cell" data-pagefind-weight="1">
<summary><code>getCell</code> <span class="api-member-summary">Single-cell read for interactions/tests — never the render hot path.</span></summary>

```ts generated
getCell: (sheet: number, row: number, col: number) => CellOut;
```

</details>

<details class="api-member" id="cell-store-get-window" data-pagefind-weight="1">
<summary><code>getWindow</code> <span class="api-member-summary">One bulk read of a rectangular window for the renderer.</span></summary>

```ts generated
getWindow: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) => WindowView;
```

<p class="api-member-doc">One bulk read of a rectangular window for the renderer. Returns
contiguous packed cell data (row-major over `rows x cols`) plus the
unique strings referenced by the window, so the host paints without
crossing the boundary per cell.</p>
</details>

<details class="api-member" id="cell-store-get-window-rows" data-pagefind-weight="1">
<summary><code>getWindowRows</code> <span class="api-member-summary">Bulk read of an explicit row list (sorted/filtered views) — same output shape as getwindow, rows taken from rows rather than a range.</span></summary>

```ts generated
getWindowRows: (sheet: number, rows: Uint32Array, cols: Uint32Array) => WindowView;
```

<p class="api-member-doc">Bulk read of an explicit row list (sorted/filtered views) — same output
shape as `get_window`, rows taken from `rows` rather than a range.</p>
</details>

<details class="api-member" id="cell-store-hydrate-page-numbers" data-pagefind-weight="1">
<summary><code>hydratePageNumbers</code> <span class="api-member-summary">Hydrate one datasource page column while retaining local dirty cells and request-revision exceptions.</span></summary>

```ts generated
hydratePageNumbers: (sheet: number, col: number, start_row: number, values: Float64Array, style: number, protected_offsets: Uint32Array) => void;
```

<p class="api-member-doc">Hydrate one datasource page column while retaining local dirty cells and
request-revision exceptions. `protected_offsets` is sorted and relative
to `start_row`.</p>
</details>

<details class="api-member" id="cell-store-hydrate-page-strings-packed" data-pagefind-weight="1">
<summary><code>hydratePageStringsPacked</code> <span class="api-member-summary">Packed-string counterpart to [CellStore::hydratepagenumbers].</span></summary>

```ts generated
hydratePageStringsPacked: (sheet: number, col: number, start_row: number, buf: string, utf16_lens: Uint32Array, style: number, protected_offsets: Uint32Array) => void;
```

<p class="api-member-doc">Packed-string counterpart to [`CellStore::hydrate_page_numbers`].</p>
</details>

<details class="api-member" id="cell-store-insert-cols" data-pagefind-weight="1">
<summary><code>insertCols</code></summary>

```ts generated
insertCols: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-is-fully-loaded" data-pagefind-weight="1">
<summary><code>isFullyLoaded</code></summary>

```ts generated
isFullyLoaded: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-is-paged" data-pagefind-weight="1">
<summary><code>isPaged</code></summary>

```ts generated
isPaged: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-is-sheet-alive" data-pagefind-weight="1">
<summary><code>isSheetAlive</code></summary>

```ts generated
isSheetAlive: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-mark-cell-clean-revision" data-pagefind-weight="1">
<summary><code>markCellCleanRevision</code></summary>

```ts generated
markCellCleanRevision: (sheet: number, row: number, col: number, revision: bigint) => boolean;
```

</details>

<details class="api-member" id="cell-store-mark-range-clean" data-pagefind-weight="1">
<summary><code>markRangeClean</code></summary>

```ts generated
markRangeClean: (sheet: number, start_row: number, end_row: number, start_col: number, end_col: number) => void;
```

</details>

<details class="api-member" id="cell-store-memory-stats" data-pagefind-weight="1">
<summary><code>memoryStats</code></summary>

```ts generated
memoryStats: () => Float64Array;
```

</details>

<details class="api-member" id="cell-store-paged-dirty-coordinates" data-pagefind-weight="1">
<summary><code>pagedDirtyCoordinates</code></summary>

```ts generated
pagedDirtyCoordinates: (sheet: number) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-paged-stats" data-pagefind-weight="1">
<summary><code>pagedStats</code> <span class="api-member-summary">[chunks, loaded cells, dirty cells, clean chunk bytes, fully loaded, dirty bytes].</span></summary>

```ts generated
pagedStats: (sheet: number) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-persisted-cell-data" data-pagefind-weight="1">
<summary><code>persistedCellData</code> <span class="api-member-summary">Sparse persisted-cell records.</span></summary>

```ts generated
persistedCellData: (sheet: number) => Float64Array;
```

<p class="api-member-doc">Sparse persisted-cell records. Each record starts with
`[row, col, kind, number, style, string_id, source_kind, source_length]`.
Formula UTF-8 is packed into little-endian u32 words; references append
one `[sheet, row, col]` triple. The allocation scales with serialized
cells and source bytes, never the logical sheet rectangle.</p>
</details>

<details class="api-member" id="cell-store-pin-range" data-pagefind-weight="1">
<summary><code>pinRange</code></summary>

```ts generated
pinRange: (sheet: number, start_row: number, end_row: number, cols: Uint32Array) => void;
```

</details>

<details class="api-member" id="cell-store-pool-strings" data-pagefind-weight="1">
<summary><code>poolStrings</code></summary>

```ts generated
poolStrings: (ids: Uint32Array) => string[];
```

</details>

<details class="api-member" id="cell-store-query-resource-stats" data-pagefind-weight="1">
<summary><code>queryResourceStats</code> <span class="api-member-summary">[contains cache constructions, owned distinct strings].</span></summary>

```ts generated
queryResourceStats: () => Float64Array;
```

</details>

<details class="api-member" id="cell-store-range-fully-loaded" data-pagefind-weight="1">
<summary><code>rangeFullyLoaded</code></summary>

```ts generated
rangeFullyLoaded: (sheet: number, r0: number, c0: number, r1: number, c1: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-range-style-ids" data-pagefind-weight="1">
<summary><code>rangeStyleIds</code> <span class="api-member-summary">Unique style ids present in a rectangle; cost stays inside WASM.</span></summary>

```ts generated
rangeStyleIds: (sheet: number, r0: number, c0: number, r1: number, c1: number) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-recompute" data-pagefind-weight="1">
<summary><code>recompute</code> <span class="api-member-summary">Recompute formulas affected by cells changed since the last call.</span></summary>

```ts generated
recompute: (sheet: number) => void;
```

<p class="api-member-doc">Recompute formulas affected by cells changed since the last call.

The pass first grows the dirty cell set through formula read-sets to find
all dependent formulas. It then evaluates only those formulas, using a
per-pass memo table so each formula cell is evaluated at most once even
when many downstream formulas reference it.</p>
</details>

<details class="api-member" id="cell-store-recompute-changed" data-pagefind-weight="1">
<summary><code>recomputeChanged</code> <span class="api-member-summary">Recompute the union of every dirty sheet once at the host transaction barrier, including cross-sheet formula and plain-reference dependents.</span></summary>

```ts generated
recomputeChanged: () => void;
```

</details>

<details class="api-member" id="cell-store-recompute-volatile" data-pagefind-weight="1">
<summary><code>recomputeVolatile</code> <span class="api-member-summary">Explicit volatile barrier.</span></summary>

```ts generated
recomputeVolatile: (serial: number) => boolean;
```

<p class="api-member-doc">Explicit volatile barrier. `serial` is a UTC spreadsheet serial using
the 1899-12-30 epoch; only TODAY/NOW formulas and their dependents dirty.</p>
</details>

<details class="api-member" id="cell-store-reference-target" data-pagefind-weight="1">
<summary><code>referenceTarget</code></summary>

```ts generated
referenceTarget: (sheet: number, row: number, col: number) => Uint32Array | undefined;
```

</details>

<details class="api-member" id="cell-store-references-targeting" data-pagefind-weight="1">
<summary><code>referencesTargeting</code> <span class="api-member-summary">Return packed [sourcesheet, sourcerow, sourcecol, ...] references targeting one sheet, bounded before crossing into the host.</span></summary>

```ts generated
referencesTargeting: (target_sheet: number, max_entries: number) => Uint32Array | undefined;
```

<p class="api-member-doc">Return packed `[source_sheet, source_row, source_col, ...]` references
targeting one sheet, bounded before crossing into the host.</p>
</details>

<details class="api-member" id="cell-store-remap-range-styles" data-pagefind-weight="1">
<summary><code>remapRangeStyles</code> <span class="api-member-summary">Remap styles over a rectangle using parallel old/new id tables.</span></summary>

```ts generated
remapRangeStyles: (sheet: number, r0: number, c0: number, r1: number, c1: number, old_ids: Uint32Array, new_ids: Uint32Array) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-cols" data-pagefind-weight="1">
<summary><code>removeCols</code></summary>

```ts generated
removeCols: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-remove-named-range" data-pagefind-weight="1">
<summary><code>removeNamedRange</code></summary>

```ts generated
removeNamedRange: (name: string, scope: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-rows" data-pagefind-weight="1">
<summary><code>removeRows</code></summary>

```ts generated
removeRows: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-remove-sheet" data-pagefind-weight="1">
<summary><code>removeSheet</code> <span class="api-member-summary">Tombstone a stable sheet handle and invalidate every formula reference to it.</span></summary>

```ts generated
removeSheet: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-table" data-pagefind-weight="1">
<summary><code>removeTable</code></summary>

```ts generated
removeTable: (id: string) => boolean;
```

</details>

<details class="api-member" id="cell-store-rename-sheet" data-pagefind-weight="1">
<summary><code>renameSheet</code> <span class="api-member-summary">Rename a live stable sheet handle and rewrite every resolved formula AST reference.</span></summary>

```ts generated
renameSheet: (sheet: number, id: string, name: string) => boolean;
```

</details>

<details class="api-member" id="cell-store-reset-formula-matrix-resource-stats" data-pagefind-weight="1">
<summary><code>resetFormulaMatrixResourceStats</code></summary>

```ts generated
resetFormulaMatrixResourceStats: () => void;
```

</details>

<details class="api-member" id="cell-store-reset-query-resource-stats" data-pagefind-weight="1">
<summary><code>resetQueryResourceStats</code></summary>

```ts generated
resetQueryResourceStats: () => void;
```

</details>

<details class="api-member" id="cell-store-restore-range" data-pagefind-weight="1">
<summary><code>restoreRange</code> <span class="api-member-summary">Restore a captured block at a destination of the same dimensions.</span></summary>

```ts generated
restoreRange: (sheet: number, r0: number, c0: number, snapshot: RangeSnapshot) => boolean;
```

</details>

<details class="api-member" id="cell-store-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
rowCount: (sheet: number) => number;
```

</details>

<details class="api-member" id="cell-store-search" data-pagefind-weight="1">
<summary><code>search</code> <span class="api-member-summary">Cell coordinates whose text matches query, as a flat [row, col, ...] list.</span></summary>

```ts generated
search: (sheet: number, cols: Uint32Array, query: string, case_insensitive: boolean, whole_cell: boolean) => Uint32Array;
```

<p class="api-member-doc">Cell coordinates whose text matches `query`, as a flat `[row, col, ...]`
list. Scans the requested columns column-major (cache-local), then sorts
row-major so search navigation runs top-to-bottom, left-to-right.</p>
</details>

<details class="api-member" id="cell-store-set-block" data-pagefind-weight="1">
<summary><code>setBlock</code> <span class="api-member-summary">Atomically write one row-major mixed literal/formula/reference block.</span></summary>

```ts generated
setBlock: (sheet: number, start_row: number, start_col: number, rows: number, cols: number, kinds: Uint8Array, numbers: Float64Array, texts: string[], styles: Uint32Array, formula_offsets: Uint32Array, formula_sources: string[], reference_offsets: Uint32Array, reference_targets: Uint32Array) => number;
```

<p class="api-member-doc">Atomically write one row-major mixed literal/formula/reference block.
Formula/reference offsets are sparse row-major exceptions. Reference
targets are packed `[sheet_handle, row, col]` triples. The compact
status is `0` success, `1` invalid shape/bounds, `2` invalid or duplicate
source metadata, and `3` paged dirty-capacity rejection.</p>
</details>

<details class="api-member" id="cell-store-set-bool" data-pagefind-weight="1">
<summary><code>setBool</code></summary>

```ts generated
setBool: (sheet: number, row: number, col: number, value: boolean, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-column-numbers" data-pagefind-weight="1">
<summary><code>setColumnNumbers</code> <span class="api-member-summary">Bulk-load one column with numbers starting at startrow.</span></summary>

```ts generated
setColumnNumbers: (sheet: number, col: number, start_row: number, values: Float64Array, style: number) => void;
```

<p class="api-member-doc">Bulk-load one column with numbers starting at `start_row`.</p>
</details>

<details class="api-member" id="cell-store-set-column-strings" data-pagefind-weight="1">
<summary><code>setColumnStrings</code> <span class="api-member-summary">Bulk-load one column with strings starting at startrow.</span></summary>

```ts generated
setColumnStrings: (sheet: number, col: number, start_row: number, values: string[], style: number) => void;
```

<p class="api-member-doc">Bulk-load one column with strings starting at `start_row`.</p>
</details>

<details class="api-member" id="cell-store-set-column-strings-packed" data-pagefind-weight="1">
<summary><code>setColumnStringsPacked</code> <span class="api-member-summary">Bulk-load one column of strings from a single concatenated buffer plus per-row lengths in UTF-16 code units (the JS string.length unit).</span></summary>

```ts generated
setColumnStringsPacked: (sheet: number, col: number, start_row: number, buf: string, utf16_lens: Uint32Array, style: number) => void;
```

<p class="api-member-doc">Bulk-load one column of strings from a single concatenated buffer plus
per-row lengths in UTF-16 code units (the JS `string.length` unit).
One boundary decode and one Rust allocation for the whole column,
instead of one per row — the dominant ingest cost for text columns.</p>
</details>

<details class="api-member" id="cell-store-set-conditional-rules" data-pagefind-weight="1">
<summary><code>setConditionalRules</code> <span class="api-member-summary">Replace a sheet's conditional-format rules.</span></summary>

```ts generated
setConditionalRules: (sheet: number, kinds: Uint8Array, bounds: Uint32Array, nums: Float64Array, strs: string[], flags: Uint8Array) => void;
```

<p class="api-member-doc">Replace a sheet's conditional-format rules. Packed columnar encoding,
one entry per rule: `kinds` 0 gt / 1 lt / 2 eqNum / 3 eqStr / 4 eqEmpty /
5 contains / 6 boolean formula; `bounds` = normalized `[r0, c0, r1, c1]`
per rule; `nums` carries the numeric operand; `strs` the text/formula
operand; `flags` bit 0 = match-case for `contains`, bit 1 = stop-if-true.
Formula strings are parsed once here, never once per visible cell.</p>
</details>

<details class="api-member" id="cell-store-set-formula" data-pagefind-weight="1">
<summary><code>setFormula</code> <span class="api-member-summary">Parse and store an arithmetic formula at (row, col).</span></summary>

```ts generated
setFormula: (sheet: number, row: number, col: number, src: string, style: number) => number;
```

<p class="api-member-doc">Parse and store an arithmetic formula at `(row, col)`.

Setters only mark cells dirty; they do not recompute formulas. The host
calls `recompute(sheet)` once at the transaction barrier so a multi-cell
edit performs one dependency-scoped pass instead of one full-sheet pass
per setter. The returned value is the previous cached value until that
barrier recompute runs, and the store facade ignores it for batched edits.</p>
</details>

<details class="api-member" id="cell-store-set-named-range" data-pagefind-weight="1">
<summary><code>setNamedRange</code></summary>

```ts generated
setNamedRange: (name: string, scope: number, sheet: number, row_start: number, col_start: number, row_end: number, col_end: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-set-number" data-pagefind-weight="1">
<summary><code>setNumber</code></summary>

```ts generated
setNumber: (sheet: number, row: number, col: number, value: number, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-sheet-name" data-pagefind-weight="1">
<summary><code>setSheetName</code></summary>

```ts generated
setSheetName: (sheet: number, id: string, name: string) => void;
```

</details>

<details class="api-member" id="cell-store-set-sparse-block" data-pagefind-weight="1">
<summary><code>setSparseBlock</code> <span class="api-member-summary">Write one sparse mixed transaction/page/snapshot block without allocating by logical rectangle size.</span></summary>

```ts generated
setSparseBlock: (sheet: number, start_row: number, start_col: number, rows: number, cols: number, offsets: Uint32Array, kinds: Uint8Array, numbers: Float64Array, texts: string[], styles: Uint32Array, formula_offsets: Uint32Array, formula_sources: string[], reference_offsets: Uint32Array, reference_targets: Uint32Array) => number;
```

<p class="api-member-doc">Write one sparse mixed transaction/page/snapshot block without
allocating by logical rectangle size. Inside `beginPageLoad`, dirty
paged cells are skipped; otherwise the whole sparse write is preflighted.</p>
</details>

<details class="api-member" id="cell-store-set-spill-blockers" data-pagefind-weight="1">
<summary><code>setSpillBlockers</code> <span class="api-member-summary">Replace the host-owned merge/protection collision ranges.</span></summary>

```ts generated
setSpillBlockers: (sheet: number, bounds: Uint32Array) => boolean;
```

<p class="api-member-doc">Replace the host-owned merge/protection collision ranges. Packed as
`[row_start, col_start, row_end, col_end, ...]`; invalid input fails
without weakening the old gate.</p>
</details>

<details class="api-member" id="cell-store-set-string" data-pagefind-weight="1">
<summary><code>setString</code></summary>

```ts generated
setString: (sheet: number, row: number, col: number, value: string, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-table" data-pagefind-weight="1">
<summary><code>setTable</code></summary>

```ts generated
setTable: (id: string, name: string, sheet: number, row_start: number, col_start: number, row_end: number, col_end: number, header_row: boolean, totals_row: boolean, column_ids: string[], column_names: string[]) => boolean;
```

</details>

<details class="api-member" id="cell-store-snapshot-numbers" data-pagefind-weight="1">
<summary><code>snapshotNumbers</code></summary>

```ts generated
snapshotNumbers: (snapshot: RangeSnapshot) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-snapshot-texts" data-pagefind-weight="1">
<summary><code>snapshotTexts</code></summary>

```ts generated
snapshotTexts: (snapshot: RangeSnapshot) => string[];
```

</details>

<details class="api-member" id="cell-store-sort-rows" data-pagefind-weight="1">
<summary><code>sortRows</code> <span class="api-member-summary">Stable row order sorted by a column.</span></summary>

```ts generated
sortRows: (sheet: number, col: number, ascending: boolean) => Uint32Array;
```

<p class="api-member-doc">Stable row order sorted by a column. Returns a data-row permutation.</p>
</details>

<details class="api-member" id="cell-store-sort-rows-multi" data-pagefind-weight="1">
<summary><code>sortRowsMulti</code></summary>

```ts generated
sortRowsMulti: (sheet: number, cols: Uint32Array, ascending: Uint8Array, candidates: Uint32Array) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-spill-anchor-col" data-pagefind-weight="1">
<summary><code>spillAnchorCol</code></summary>

```ts generated
spillAnchorCol: (sheet: number, row: number, col: number) => number;
```

</details>

<details class="api-member" id="cell-store-spill-anchor-row" data-pagefind-weight="1">
<summary><code>spillAnchorRow</code> <span class="api-member-summary">Stable spill owner coordinate, or u32::MAX when cell is not part of a materialized spill.</span></summary>

```ts generated
spillAnchorRow: (sheet: number, row: number, col: number) => number;
```

</details>

<details class="api-member" id="cell-store-spill-derived-mask" data-pagefind-weight="1">
<summary><code>spillDerivedMask</code> <span class="api-member-summary">Row-major mask aligned with render-window layout; 1 marks a derived spill cell and deliberately excludes the anchor.</span></summary>

```ts generated
spillDerivedMask: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) => Uint8Array;
```

</details>

<details class="api-member" id="cell-store-spill-owner-coordinates" data-pagefind-weight="1">
<summary><code>spillOwnerCoordinates</code> <span class="api-member-summary">Packed row-major [anchorrow, anchorcol, ...] owner coordinates.</span></summary>

```ts generated
spillOwnerCoordinates: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) => Uint32Array;
```

<p class="api-member-doc">Packed row-major `[anchor_row, anchor_col, ...]` owner coordinates.</p>
</details>

<details class="api-member" id="cell-store-style-id-at" data-pagefind-weight="1">
<summary><code>styleIdAt</code> <span class="api-member-summary">Current style-dictionary id at a cell; 0 when out of bounds.</span></summary>

```ts generated
styleIdAt: (sheet: number, row: number, col: number) => number;
```

<p class="api-member-doc">Current style-dictionary id at a cell; `0` when out of bounds. Used by
the host to write derived (reference-shadow) values without disturbing
the cell's style.</p>
</details>

<details class="api-member" id="cell-store-wasm-committed-bytes" data-pagefind-weight="1">
<summary><code>wasmCommittedBytes</code></summary>

```ts generated
wasmCommittedBytes: () => number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class CellStore {
  acknowledgeRevision: (revision: bigint) => void;
  addPagedSheet: (
    n_cols: number,
    row_count: number,
    chunk_rows: number,
    byte_budget: number,
    max_dirty_cells: number,
  ) => number;
  addRows: (sheet: number, at: number, count: number) => void;
  addSheet: (n_cols: number, row_count: number) => number;
  aggregate: (sheet: number, col: number, op: number) => number;
  beginMutation: () => bigint;
  beginPageLoad: () => void;
  canDirtyCell: (sheet: number, row: number, col: number) => boolean;
  captureRange: (
    sheet: number,
    r0: number,
    c0: number,
    rows: number,
    cols: number,
  ) => RangeSnapshot | undefined;
  captureReferences: (
    sheet: number,
    max_entries: number,
  ) => SourceSnapshot | undefined;
  captureSources: (
    sheet: number,
    r0: number,
    c0: number,
    rows: number,
    cols: number,
  ) => SourceSnapshot | undefined;
  captureSourcesForRows: (
    sheet: number,
    rows: Uint32Array,
    cols: Uint32Array,
  ) => SourceSnapshot | undefined;
  cellState: (sheet: number, row: number, col: number) => number;
  clearCell: (sheet: number, row: number, col: number, style: number) => void;
  clearRange: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    contents: boolean,
    style: boolean,
  ) => boolean;
  colCount: (sheet: number) => number;
  columnsFullyLoaded: (
    sheet: number,
    start_row: number,
    end_row: number,
    cols: Uint32Array,
  ) => boolean;
  compactStringStorage: () => void;
  dataEdge: (
    sheet: number,
    row: number,
    col: number,
    d_row: number,
    d_col: number,
  ) => number;
  dataEdgeOrdered: (
    sheet: number,
    order: Uint32Array,
    row: number,
    col: number,
    d_row: number,
    d_col: number,
  ) => number;
  dirtyRevision: (sheet: number, row: number, col: number) => bigint;
  distinctValues: (
    sheet: number,
    col: number,
    limit: number,
  ) => DistinctColumn;
  endMutation: () => void;
  endPageLoad: () => void;
  filterRows: (sheet: number, col: number, needle: string) => Uint32Array;
  filterRowsMulti: (
    sheet: number,
    cols: Uint32Array,
    kinds: Uint8Array,
    flags: Uint8Array,
    nums: Float64Array,
    num_counts: Uint32Array,
    text_counts: Uint32Array,
    value_nums: Float64Array,
    value_texts: string[],
  ) => Uint32Array;
  formulaMatrixResourceStats: () => Float64Array;
  formulaSource: (
    sheet: number,
    row: number,
    col: number,
  ) => string | undefined;
  free: () => void;
  getCell: (sheet: number, row: number, col: number) => CellOut;
  getWindow: (
    sheet: number,
    row_start: number,
    row_end: number,
    cols: Uint32Array,
  ) => WindowView;
  getWindowRows: (
    sheet: number,
    rows: Uint32Array,
    cols: Uint32Array,
  ) => WindowView;
  hydratePageNumbers: (
    sheet: number,
    col: number,
    start_row: number,
    values: Float64Array,
    style: number,
    protected_offsets: Uint32Array,
  ) => void;
  hydratePageStringsPacked: (
    sheet: number,
    col: number,
    start_row: number,
    buf: string,
    utf16_lens: Uint32Array,
    style: number,
    protected_offsets: Uint32Array,
  ) => void;
  insertCols: (sheet: number, at: number, count: number) => void;
  isFullyLoaded: (sheet: number) => boolean;
  isPaged: (sheet: number) => boolean;
  isSheetAlive: (sheet: number) => boolean;
  markCellCleanRevision: (
    sheet: number,
    row: number,
    col: number,
    revision: bigint,
  ) => boolean;
  markRangeClean: (
    sheet: number,
    start_row: number,
    end_row: number,
    start_col: number,
    end_col: number,
  ) => void;
  memoryStats: () => Float64Array;
  pagedDirtyCoordinates: (sheet: number) => Float64Array;
  pagedStats: (sheet: number) => Float64Array;
  persistedCellData: (sheet: number) => Float64Array;
  pinRange: (
    sheet: number,
    start_row: number,
    end_row: number,
    cols: Uint32Array,
  ) => void;
  poolStrings: (ids: Uint32Array) => string[];
  queryResourceStats: () => Float64Array;
  rangeFullyLoaded: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
  ) => boolean;
  rangeStyleIds: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
  ) => Uint32Array;
  recompute: (sheet: number) => void;
  recomputeChanged: () => void;
  recomputeVolatile: (serial: number) => boolean;
  referenceTarget: (
    sheet: number,
    row: number,
    col: number,
  ) => Uint32Array | undefined;
  referencesTargeting: (
    target_sheet: number,
    max_entries: number,
  ) => Uint32Array | undefined;
  remapRangeStyles: (
    sheet: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    old_ids: Uint32Array,
    new_ids: Uint32Array,
  ) => boolean;
  removeCols: (sheet: number, at: number, count: number) => void;
  removeNamedRange: (name: string, scope: number) => boolean;
  removeRows: (sheet: number, at: number, count: number) => void;
  removeSheet: (sheet: number) => boolean;
  removeTable: (id: string) => boolean;
  renameSheet: (sheet: number, id: string, name: string) => boolean;
  resetFormulaMatrixResourceStats: () => void;
  resetQueryResourceStats: () => void;
  restoreRange: (
    sheet: number,
    r0: number,
    c0: number,
    snapshot: RangeSnapshot,
  ) => boolean;
  rowCount: (sheet: number) => number;
  search: (
    sheet: number,
    cols: Uint32Array,
    query: string,
    case_insensitive: boolean,
    whole_cell: boolean,
  ) => Uint32Array;
  setBlock: (
    sheet: number,
    start_row: number,
    start_col: number,
    rows: number,
    cols: number,
    kinds: Uint8Array,
    numbers: Float64Array,
    texts: string[],
    styles: Uint32Array,
    formula_offsets: Uint32Array,
    formula_sources: string[],
    reference_offsets: Uint32Array,
    reference_targets: Uint32Array,
  ) => number;
  setBool: (
    sheet: number,
    row: number,
    col: number,
    value: boolean,
    style: number,
  ) => void;
  setColumnNumbers: (
    sheet: number,
    col: number,
    start_row: number,
    values: Float64Array,
    style: number,
  ) => void;
  setColumnStrings: (
    sheet: number,
    col: number,
    start_row: number,
    values: string[],
    style: number,
  ) => void;
  setColumnStringsPacked: (
    sheet: number,
    col: number,
    start_row: number,
    buf: string,
    utf16_lens: Uint32Array,
    style: number,
  ) => void;
  setConditionalRules: (
    sheet: number,
    kinds: Uint8Array,
    bounds: Uint32Array,
    nums: Float64Array,
    strs: string[],
    flags: Uint8Array,
  ) => void;
  setFormula: (
    sheet: number,
    row: number,
    col: number,
    src: string,
    style: number,
  ) => number;
  setNamedRange: (
    name: string,
    scope: number,
    sheet: number,
    row_start: number,
    col_start: number,
    row_end: number,
    col_end: number,
  ) => boolean;
  setNumber: (
    sheet: number,
    row: number,
    col: number,
    value: number,
    style: number,
  ) => void;
  setSheetName: (sheet: number, id: string, name: string) => void;
  setSparseBlock: (
    sheet: number,
    start_row: number,
    start_col: number,
    rows: number,
    cols: number,
    offsets: Uint32Array,
    kinds: Uint8Array,
    numbers: Float64Array,
    texts: string[],
    styles: Uint32Array,
    formula_offsets: Uint32Array,
    formula_sources: string[],
    reference_offsets: Uint32Array,
    reference_targets: Uint32Array,
  ) => number;
  setSpillBlockers: (sheet: number, bounds: Uint32Array) => boolean;
  setString: (
    sheet: number,
    row: number,
    col: number,
    value: string,
    style: number,
  ) => void;
  setTable: (
    id: string,
    name: string,
    sheet: number,
    row_start: number,
    col_start: number,
    row_end: number,
    col_end: number,
    header_row: boolean,
    totals_row: boolean,
    column_ids: string[],
    column_names: string[],
  ) => boolean;
  snapshotNumbers: (snapshot: RangeSnapshot) => Float64Array;
  snapshotTexts: (snapshot: RangeSnapshot) => string[];
  sortRows: (sheet: number, col: number, ascending: boolean) => Uint32Array;
  sortRowsMulti: (
    sheet: number,
    cols: Uint32Array,
    ascending: Uint8Array,
    candidates: Uint32Array,
  ) => Uint32Array;
  spillAnchorCol: (sheet: number, row: number, col: number) => number;
  spillAnchorRow: (sheet: number, row: number, col: number) => number;
  spillDerivedMask: (
    sheet: number,
    row_start: number,
    row_end: number,
    cols: Uint32Array,
  ) => Uint8Array;
  spillOwnerCoordinates: (
    sheet: number,
    row_start: number,
    row_end: number,
    cols: Uint32Array,
  ) => Uint32Array;
  styleIdAt: (sheet: number, row: number, col: number) => number;
  wasmCommittedBytes: () => number;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>CellStore</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
