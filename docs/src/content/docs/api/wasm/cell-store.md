---
title: "CellStore | @sheetwrite/wasm"
description: "The workbook-wide store: every sheet, one string pool."
---
<!-- api-export:@sheetwrite/wasm|.|CellStore -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

The workbook-wide store: every sheet, one string pool.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L20</code></dd></div>
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

<details class="api-member" id="cell-store-acknowledge-revision" data-pagefind-weight="1" open>
<summary><code>acknowledgeRevision</code></summary>

<button class="api-copy" type="button" data-copy-code="acknowledgeRevision: (revision: bigint) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
acknowledgeRevision: (revision: bigint) => void;
```

</details>

<details class="api-member" id="cell-store-add-paged-sheet" data-pagefind-weight="1">
<summary><code>addPagedSheet</code> <span class="api-member-summary">Allocate a logical sheet whose cell chunks materialize on page load or edit.</span></summary>

<button class="api-copy" type="button" data-copy-code="addPagedSheet: (n_cols: number, row_count: number, chunk_rows: number, byte_budget: number, max_dirty_cells: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
addPagedSheet: (n_cols: number, row_count: number, chunk_rows: number, byte_budget: number, max_dirty_cells: number) => number;
```

</details>

<details class="api-member" id="cell-store-add-rows" data-pagefind-weight="1" open>
<summary><code>addRows</code></summary>

<button class="api-copy" type="button" data-copy-code="addRows: (sheet: number, at: number, count: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
addRows: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-add-sheet" data-pagefind-weight="1" open>
<summary><code>addSheet</code> <span class="api-member-summary">Allocate a sheet grid and return its numeric handle.</span></summary>

<button class="api-copy" type="button" data-copy-code="addSheet: (n_cols: number, row_count: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
addSheet: (n_cols: number, row_count: number) => number;
```

</details>

<details class="api-member" id="cell-store-aggregate" data-pagefind-weight="1" open>
<summary><code>aggregate</code> <span class="api-member-summary">Column aggregate over numeric cells.</span></summary>

<button class="api-copy" type="button" data-copy-code="aggregate: (sheet: number, col: number, op: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
aggregate: (sheet: number, col: number, op: number) => number;
```

<p class="api-member-doc">Column aggregate over numeric cells. op: 0 sum, 1 avg, 2 min, 3 max, 4 count.</p>
</details>

<details class="api-member" id="cell-store-begin-mutation" data-pagefind-weight="1" open>
<summary><code>beginMutation</code></summary>

<button class="api-copy" type="button" data-copy-code="beginMutation: () =&gt; bigint;" data-pagefind-ignore>Copy</button>

```ts generated
beginMutation: () => bigint;
```

</details>

<details class="api-member" id="cell-store-begin-page-load" data-pagefind-weight="1" open>
<summary><code>beginPageLoad</code></summary>

<button class="api-copy" type="button" data-copy-code="beginPageLoad: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
beginPageLoad: () => void;
```

</details>

<details class="api-member" id="cell-store-can-dirty-cell" data-pagefind-weight="1" open>
<summary><code>canDirtyCell</code></summary>

<button class="api-copy" type="button" data-copy-code="canDirtyCell: (sheet: number, row: number, col: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
canDirtyCell: (sheet: number, row: number, col: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-capture-range" data-pagefind-weight="1">
<summary><code>captureRange</code> <span class="api-member-summary">Capture a dense rectangle into an opaque store-local history resource.</span></summary>

<button class="api-copy" type="button" data-copy-code="captureRange: (sheet: number, r0: number, c0: number, rows: number, cols: number) =&gt; RangeSnapshot | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
captureRange: (sheet: number, r0: number, c0: number, rows: number, cols: number) => RangeSnapshot | undefined;
```

</details>

<details class="api-member" id="cell-store-capture-references" data-pagefind-weight="1" open>
<summary><code>captureReferences</code> <span class="api-member-summary">Capture only persisted references for one sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="captureReferences: (sheet: number, max_entries: number) =&gt; SourceSnapshot | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
captureReferences: (sheet: number, max_entries: number) => SourceSnapshot | undefined;
```

<p class="api-member-doc">Capture only persisted references for one sheet. The explicit entry cap
bounds allocation for host-side structural admission simulation.</p>
</details>

<details class="api-member" id="cell-store-capture-sources" data-pagefind-weight="1">
<summary><code>captureSources</code> <span class="api-member-summary">Capture only persisted formula/reference sources in a rectangle.</span></summary>

<button class="api-copy" type="button" data-copy-code="captureSources: (sheet: number, r0: number, c0: number, rows: number, cols: number) =&gt; SourceSnapshot | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
captureSources: (sheet: number, r0: number, c0: number, rows: number, cols: number) => SourceSnapshot | undefined;
```

<p class="api-member-doc">Capture only persisted formula/reference sources in a rectangle. The
returned opaque object is compact in source cardinality, not cell count.</p>
</details>

<details class="api-member" id="cell-store-capture-sources-for-rows" data-pagefind-weight="1">
<summary><code>captureSourcesForRows</code> <span class="api-member-summary">Capture persisted formula/reference sources and derived-spill identity for arbitrary row/column coordinates in one boundary crossing.</span></summary>

<button class="api-copy" type="button" data-copy-code="captureSourcesForRows: (sheet: number, rows: Uint32Array, cols: Uint32Array) =&gt; SourceSnapshot | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
captureSourcesForRows: (sheet: number, rows: Uint32Array, cols: Uint32Array) => SourceSnapshot | undefined;
```

<p class="api-member-doc">Capture persisted formula/reference sources and derived-spill identity
for arbitrary row/column coordinates in one boundary crossing. Offsets
follow the caller's row-major coordinate order.</p>
</details>

<details class="api-member" id="cell-store-cell-state" data-pagefind-weight="1" open>
<summary><code>cellState</code> <span class="api-member-summary">0 unloaded, 1 loaded-empty, 2 loaded-value, 3 dirty local edit.</span></summary>

<button class="api-copy" type="button" data-copy-code="cellState: (sheet: number, row: number, col: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
cellState: (sheet: number, row: number, col: number) => number;
```

</details>

<details class="api-member" id="cell-store-clear-cell" data-pagefind-weight="1" open>
<summary><code>clearCell</code></summary>

<button class="api-copy" type="button" data-copy-code="clearCell: (sheet: number, row: number, col: number, style: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
clearCell: (sheet: number, row: number, col: number, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-clear-range" data-pagefind-weight="1">
<summary><code>clearRange</code> <span class="api-member-summary">Clear a rectangle while independently controlling contents and style.</span></summary>

<button class="api-copy" type="button" data-copy-code="clearRange: (sheet: number, r0: number, c0: number, r1: number, c1: number, contents: boolean, style: boolean) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
clearRange: (sheet: number, r0: number, c0: number, r1: number, c1: number, contents: boolean, style: boolean) => boolean;
```

</details>

<details class="api-member" id="cell-store-col-count" data-pagefind-weight="1" open>
<summary><code>colCount</code></summary>

<button class="api-copy" type="button" data-copy-code="colCount: (sheet: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
colCount: (sheet: number) => number;
```

</details>

<details class="api-member" id="cell-store-columns-fully-loaded" data-pagefind-weight="1">
<summary><code>columnsFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="columnsFullyLoaded: (sheet: number, start_row: number, end_row: number, cols: Uint32Array) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
columnsFullyLoaded: (sheet: number, start_row: number, end_row: number, cols: Uint32Array) => boolean;
```

</details>

<details class="api-member" id="cell-store-compact-string-storage" data-pagefind-weight="1" open>
<summary><code>compactStringStorage</code> <span class="api-member-summary">Release geometric growth slack after a bounded bulk ingest.</span></summary>

<button class="api-copy" type="button" data-copy-code="compactStringStorage: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
compactStringStorage: () => void;
```

</details>

<details class="api-member" id="cell-store-data-edge" data-pagefind-weight="1" open>
<summary><code>dataEdge</code> <span class="api-member-summary">Ctrl+Arrow destination: from (row, col) stepping by (drow, dcol) (exactly one of them ±1), return the destination row (vertical moves) or column (horizontal moves), Google Sheets semantics: - current and adjacent…</span></summary>

<button class="api-copy" type="button" data-copy-code="dataEdge: (sheet: number, row: number, col: number, d_row: number, d_col: number) =&gt; number;" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="dataEdgeOrdered: (sheet: number, order: Uint32Array, row: number, col: number, d_row: number, d_col: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
dataEdgeOrdered: (sheet: number, order: Uint32Array, row: number, col: number, d_row: number, d_col: number) => number;
```

</details>

<details class="api-member" id="cell-store-dirty-revision" data-pagefind-weight="1" open>
<summary><code>dirtyRevision</code></summary>

<button class="api-copy" type="button" data-copy-code="dirtyRevision: (sheet: number, row: number, col: number) =&gt; bigint;" data-pagefind-ignore>Copy</button>

```ts generated
dirtyRevision: (sheet: number, row: number, col: number) => bigint;
```

</details>

<details class="api-member" id="cell-store-distinct-values" data-pagefind-weight="1" open>
<summary><code>distinctValues</code></summary>

<button class="api-copy" type="button" data-copy-code="distinctValues: (sheet: number, col: number, limit: number) =&gt; DistinctColumn;" data-pagefind-ignore>Copy</button>

```ts generated
distinctValues: (sheet: number, col: number, limit: number) => DistinctColumn;
```

</details>

<details class="api-member" id="cell-store-end-mutation" data-pagefind-weight="1" open>
<summary><code>endMutation</code></summary>

<button class="api-copy" type="button" data-copy-code="endMutation: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
endMutation: () => void;
```

</details>

<details class="api-member" id="cell-store-end-page-load" data-pagefind-weight="1" open>
<summary><code>endPageLoad</code></summary>

<button class="api-copy" type="button" data-copy-code="endPageLoad: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
endPageLoad: () => void;
```

</details>

<details class="api-member" id="cell-store-filter-rows" data-pagefind-weight="1" open>
<summary><code>filterRows</code> <span class="api-member-summary">Data-row indices whose column text contains needle (case-insensitive).</span></summary>

<button class="api-copy" type="button" data-copy-code="filterRows: (sheet: number, col: number, needle: string) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
filterRows: (sheet: number, col: number, needle: string) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-filter-rows-multi" data-pagefind-weight="1">
<summary><code>filterRowsMulti</code></summary>

<button class="api-copy" type="button" data-copy-code="filterRowsMulti: (sheet: number, cols: Uint32Array, kinds: Uint8Array, flags: Uint8Array, nums: Float64Array, num_counts: Uint32Array, text_counts: Uint32Array, value_nums: Float64Array, value_texts: string[]) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
filterRowsMulti: (sheet: number, cols: Uint32Array, kinds: Uint8Array, flags: Uint8Array, nums: Float64Array, num_counts: Uint32Array, text_counts: Uint32Array, value_nums: Float64Array, value_texts: string[]) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-formula-matrix-resource-stats" data-pagefind-weight="1" open>
<summary><code>formulaMatrixResourceStats</code> <span class="api-member-summary">Benchmark diagnostic: [current matrix bytes, peak matrix bytes, allocations].</span></summary>

<button class="api-copy" type="button" data-copy-code="formulaMatrixResourceStats: () =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
formulaMatrixResourceStats: () => Float64Array;
```

</details>

<details class="api-member" id="cell-store-formula-source" data-pagefind-weight="1" open>
<summary><code>formulaSource</code></summary>

<button class="api-copy" type="button" data-copy-code="formulaSource: (sheet: number, row: number, col: number) =&gt; string | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
formulaSource: (sheet: number, row: number, col: number) => string | undefined;
```

</details>

<details class="api-member" id="cell-store-free" data-pagefind-weight="1" open>
<summary><code>free</code></summary>

<button class="api-copy" type="button" data-copy-code="free: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="cell-store-get-cell" data-pagefind-weight="1" open>
<summary><code>getCell</code> <span class="api-member-summary">Single-cell read for interactions/tests — never the render hot path.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCell: (sheet: number, row: number, col: number) =&gt; CellOut;" data-pagefind-ignore>Copy</button>

```ts generated
getCell: (sheet: number, row: number, col: number) => CellOut;
```

</details>

<details class="api-member" id="cell-store-get-window" data-pagefind-weight="1" open>
<summary><code>getWindow</code> <span class="api-member-summary">One bulk read of a rectangular window for the renderer.</span></summary>

<button class="api-copy" type="button" data-copy-code="getWindow: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) =&gt; WindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getWindow: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) => WindowView;
```

<p class="api-member-doc">One bulk read of a rectangular window for the renderer. Returns
contiguous packed cell data (row-major over `rows x cols`) plus the
unique strings referenced by the window, so the host paints without
crossing the boundary per cell.</p>
</details>

<details class="api-member" id="cell-store-get-window-rows" data-pagefind-weight="1" open>
<summary><code>getWindowRows</code> <span class="api-member-summary">Bulk read of an explicit row list (sorted/filtered views) — same output shape as getwindow, rows taken from rows rather than a range.</span></summary>

<button class="api-copy" type="button" data-copy-code="getWindowRows: (sheet: number, rows: Uint32Array, cols: Uint32Array) =&gt; WindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getWindowRows: (sheet: number, rows: Uint32Array, cols: Uint32Array) => WindowView;
```

<p class="api-member-doc">Bulk read of an explicit row list (sorted/filtered views) — same output
shape as `get_window`, rows taken from `rows` rather than a range.</p>
</details>

<details class="api-member" id="cell-store-hydrate-page-numbers" data-pagefind-weight="1">
<summary><code>hydratePageNumbers</code> <span class="api-member-summary">Hydrate one datasource page column while retaining local dirty cells and request-revision exceptions.</span></summary>

<button class="api-copy" type="button" data-copy-code="hydratePageNumbers: (sheet: number, col: number, start_row: number, values: Float64Array, style: number, protected_offsets: Uint32Array) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
hydratePageNumbers: (sheet: number, col: number, start_row: number, values: Float64Array, style: number, protected_offsets: Uint32Array) => void;
```

<p class="api-member-doc">Hydrate one datasource page column while retaining local dirty cells and
request-revision exceptions. `protected_offsets` is sorted and relative
to `start_row`.</p>
</details>

<details class="api-member" id="cell-store-hydrate-page-strings-packed" data-pagefind-weight="1">
<summary><code>hydratePageStringsPacked</code> <span class="api-member-summary">Packed-string counterpart to [CellStore::hydratepagenumbers].</span></summary>

<button class="api-copy" type="button" data-copy-code="hydratePageStringsPacked: (sheet: number, col: number, start_row: number, buf: string, utf16_lens: Uint32Array, style: number, protected_offsets: Uint32Array) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
hydratePageStringsPacked: (sheet: number, col: number, start_row: number, buf: string, utf16_lens: Uint32Array, style: number, protected_offsets: Uint32Array) => void;
```

<p class="api-member-doc">Packed-string counterpart to [`CellStore::hydrate_page_numbers`].</p>
</details>

<details class="api-member" id="cell-store-insert-cols" data-pagefind-weight="1" open>
<summary><code>insertCols</code></summary>

<button class="api-copy" type="button" data-copy-code="insertCols: (sheet: number, at: number, count: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
insertCols: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-is-fully-loaded" data-pagefind-weight="1" open>
<summary><code>isFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="isFullyLoaded: (sheet: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
isFullyLoaded: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-is-paged" data-pagefind-weight="1" open>
<summary><code>isPaged</code></summary>

<button class="api-copy" type="button" data-copy-code="isPaged: (sheet: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
isPaged: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-is-sheet-alive" data-pagefind-weight="1" open>
<summary><code>isSheetAlive</code></summary>

<button class="api-copy" type="button" data-copy-code="isSheetAlive: (sheet: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
isSheetAlive: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-mark-cell-clean-revision" data-pagefind-weight="1" open>
<summary><code>markCellCleanRevision</code></summary>

<button class="api-copy" type="button" data-copy-code="markCellCleanRevision: (sheet: number, row: number, col: number, revision: bigint) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
markCellCleanRevision: (sheet: number, row: number, col: number, revision: bigint) => boolean;
```

</details>

<details class="api-member" id="cell-store-mark-range-clean" data-pagefind-weight="1">
<summary><code>markRangeClean</code></summary>

<button class="api-copy" type="button" data-copy-code="markRangeClean: (sheet: number, start_row: number, end_row: number, start_col: number, end_col: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
markRangeClean: (sheet: number, start_row: number, end_row: number, start_col: number, end_col: number) => void;
```

</details>

<details class="api-member" id="cell-store-memory-stats" data-pagefind-weight="1" open>
<summary><code>memoryStats</code></summary>

<button class="api-copy" type="button" data-copy-code="memoryStats: () =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
memoryStats: () => Float64Array;
```

</details>

<details class="api-member" id="cell-store-paged-dirty-coordinates" data-pagefind-weight="1" open>
<summary><code>pagedDirtyCoordinates</code></summary>

<button class="api-copy" type="button" data-copy-code="pagedDirtyCoordinates: (sheet: number) =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
pagedDirtyCoordinates: (sheet: number) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-paged-stats" data-pagefind-weight="1" open>
<summary><code>pagedStats</code> <span class="api-member-summary">[chunks, loaded cells, dirty cells, clean chunk bytes, fully loaded, dirty bytes].</span></summary>

<button class="api-copy" type="button" data-copy-code="pagedStats: (sheet: number) =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
pagedStats: (sheet: number) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-persisted-cell-data" data-pagefind-weight="1" open>
<summary><code>persistedCellData</code> <span class="api-member-summary">Sparse persisted-cell records.</span></summary>

<button class="api-copy" type="button" data-copy-code="persistedCellData: (sheet: number) =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
persistedCellData: (sheet: number) => Float64Array;
```

<p class="api-member-doc">Sparse persisted-cell records. Each record starts with
`[row, col, kind, number, style, string_id, source_kind, source_length]`.
Formula UTF-8 is packed into little-endian u32 words; references append
one `[sheet, row, col]` triple. The allocation scales with serialized
cells and source bytes, never the logical sheet rectangle.</p>
</details>

<details class="api-member" id="cell-store-pin-range" data-pagefind-weight="1" open>
<summary><code>pinRange</code></summary>

<button class="api-copy" type="button" data-copy-code="pinRange: (sheet: number, start_row: number, end_row: number, cols: Uint32Array) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
pinRange: (sheet: number, start_row: number, end_row: number, cols: Uint32Array) => void;
```

</details>

<details class="api-member" id="cell-store-pool-strings" data-pagefind-weight="1" open>
<summary><code>poolStrings</code></summary>

<button class="api-copy" type="button" data-copy-code="poolStrings: (ids: Uint32Array) =&gt; string[];" data-pagefind-ignore>Copy</button>

```ts generated
poolStrings: (ids: Uint32Array) => string[];
```

</details>

<details class="api-member" id="cell-store-query-resource-stats" data-pagefind-weight="1" open>
<summary><code>queryResourceStats</code> <span class="api-member-summary">[contains cache constructions, owned distinct strings].</span></summary>

<button class="api-copy" type="button" data-copy-code="queryResourceStats: () =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
queryResourceStats: () => Float64Array;
```

</details>

<details class="api-member" id="cell-store-range-fully-loaded" data-pagefind-weight="1" open>
<summary><code>rangeFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="rangeFullyLoaded: (sheet: number, r0: number, c0: number, r1: number, c1: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
rangeFullyLoaded: (sheet: number, r0: number, c0: number, r1: number, c1: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-range-style-ids" data-pagefind-weight="1" open>
<summary><code>rangeStyleIds</code> <span class="api-member-summary">Unique style ids present in a rectangle; cost stays inside WASM.</span></summary>

<button class="api-copy" type="button" data-copy-code="rangeStyleIds: (sheet: number, r0: number, c0: number, r1: number, c1: number) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
rangeStyleIds: (sheet: number, r0: number, c0: number, r1: number, c1: number) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-recompute" data-pagefind-weight="1" open>
<summary><code>recompute</code> <span class="api-member-summary">Recompute formulas affected by cells changed since the last call.</span></summary>

<button class="api-copy" type="button" data-copy-code="recompute: (sheet: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
recompute: (sheet: number) => void;
```

<p class="api-member-doc">Recompute formulas affected by cells changed since the last call.

The pass first grows the dirty cell set through formula read-sets to find
all dependent formulas. It then evaluates only those formulas, using a
per-pass memo table so each formula cell is evaluated at most once even
when many downstream formulas reference it.</p>
</details>

<details class="api-member" id="cell-store-recompute-changed" data-pagefind-weight="1" open>
<summary><code>recomputeChanged</code> <span class="api-member-summary">Recompute the union of every dirty sheet once at the host transaction barrier, including cross-sheet formula and plain-reference dependents.</span></summary>

<button class="api-copy" type="button" data-copy-code="recomputeChanged: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
recomputeChanged: () => void;
```

</details>

<details class="api-member" id="cell-store-recompute-volatile" data-pagefind-weight="1" open>
<summary><code>recomputeVolatile</code> <span class="api-member-summary">Explicit volatile barrier.</span></summary>

<button class="api-copy" type="button" data-copy-code="recomputeVolatile: (serial: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
recomputeVolatile: (serial: number) => boolean;
```

<p class="api-member-doc">Explicit volatile barrier. `serial` is a UTC spreadsheet serial using
the 1899-12-30 epoch; only TODAY/NOW formulas and their dependents dirty.</p>
</details>

<details class="api-member" id="cell-store-reference-target" data-pagefind-weight="1" open>
<summary><code>referenceTarget</code></summary>

<button class="api-copy" type="button" data-copy-code="referenceTarget: (sheet: number, row: number, col: number) =&gt; Uint32Array | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
referenceTarget: (sheet: number, row: number, col: number) => Uint32Array | undefined;
```

</details>

<details class="api-member" id="cell-store-references-targeting" data-pagefind-weight="1" open>
<summary><code>referencesTargeting</code> <span class="api-member-summary">Return packed [sourcesheet, sourcerow, sourcecol, ...] references targeting one sheet, bounded before crossing into the host.</span></summary>

<button class="api-copy" type="button" data-copy-code="referencesTargeting: (target_sheet: number, max_entries: number) =&gt; Uint32Array | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
referencesTargeting: (target_sheet: number, max_entries: number) => Uint32Array | undefined;
```

<p class="api-member-doc">Return packed `[source_sheet, source_row, source_col, ...]` references
targeting one sheet, bounded before crossing into the host.</p>
</details>

<details class="api-member" id="cell-store-remap-range-styles" data-pagefind-weight="1">
<summary><code>remapRangeStyles</code> <span class="api-member-summary">Remap styles over a rectangle using parallel old/new id tables.</span></summary>

<button class="api-copy" type="button" data-copy-code="remapRangeStyles: (sheet: number, r0: number, c0: number, r1: number, c1: number, old_ids: Uint32Array, new_ids: Uint32Array) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
remapRangeStyles: (sheet: number, r0: number, c0: number, r1: number, c1: number, old_ids: Uint32Array, new_ids: Uint32Array) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-cols" data-pagefind-weight="1" open>
<summary><code>removeCols</code></summary>

<button class="api-copy" type="button" data-copy-code="removeCols: (sheet: number, at: number, count: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
removeCols: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-remove-named-range" data-pagefind-weight="1" open>
<summary><code>removeNamedRange</code></summary>

<button class="api-copy" type="button" data-copy-code="removeNamedRange: (name: string, scope: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
removeNamedRange: (name: string, scope: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-rows" data-pagefind-weight="1" open>
<summary><code>removeRows</code></summary>

<button class="api-copy" type="button" data-copy-code="removeRows: (sheet: number, at: number, count: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
removeRows: (sheet: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="cell-store-remove-sheet" data-pagefind-weight="1" open>
<summary><code>removeSheet</code> <span class="api-member-summary">Tombstone a stable sheet handle and invalidate every formula reference to it.</span></summary>

<button class="api-copy" type="button" data-copy-code="removeSheet: (sheet: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
removeSheet: (sheet: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-remove-table" data-pagefind-weight="1" open>
<summary><code>removeTable</code></summary>

<button class="api-copy" type="button" data-copy-code="removeTable: (id: string) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
removeTable: (id: string) => boolean;
```

</details>

<details class="api-member" id="cell-store-rename-sheet" data-pagefind-weight="1" open>
<summary><code>renameSheet</code> <span class="api-member-summary">Rename a live stable sheet handle and rewrite every resolved formula AST reference.</span></summary>

<button class="api-copy" type="button" data-copy-code="renameSheet: (sheet: number, id: string, name: string) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
renameSheet: (sheet: number, id: string, name: string) => boolean;
```

</details>

<details class="api-member" id="cell-store-reset-formula-matrix-resource-stats" data-pagefind-weight="1" open>
<summary><code>resetFormulaMatrixResourceStats</code></summary>

<button class="api-copy" type="button" data-copy-code="resetFormulaMatrixResourceStats: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
resetFormulaMatrixResourceStats: () => void;
```

</details>

<details class="api-member" id="cell-store-reset-query-resource-stats" data-pagefind-weight="1" open>
<summary><code>resetQueryResourceStats</code></summary>

<button class="api-copy" type="button" data-copy-code="resetQueryResourceStats: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
resetQueryResourceStats: () => void;
```

</details>

<details class="api-member" id="cell-store-restore-range" data-pagefind-weight="1" open>
<summary><code>restoreRange</code> <span class="api-member-summary">Restore a captured block at a destination of the same dimensions.</span></summary>

<button class="api-copy" type="button" data-copy-code="restoreRange: (sheet: number, r0: number, c0: number, snapshot: RangeSnapshot) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
restoreRange: (sheet: number, r0: number, c0: number, snapshot: RangeSnapshot) => boolean;
```

</details>

<details class="api-member" id="cell-store-row-count" data-pagefind-weight="1" open>
<summary><code>rowCount</code></summary>

<button class="api-copy" type="button" data-copy-code="rowCount: (sheet: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
rowCount: (sheet: number) => number;
```

</details>

<details class="api-member" id="cell-store-search" data-pagefind-weight="1">
<summary><code>search</code> <span class="api-member-summary">Cell coordinates whose text matches query, as a flat [row, col, ...] list.</span></summary>

<button class="api-copy" type="button" data-copy-code="search: (sheet: number, cols: Uint32Array, query: string, case_insensitive: boolean, whole_cell: boolean) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
search: (sheet: number, cols: Uint32Array, query: string, case_insensitive: boolean, whole_cell: boolean) => Uint32Array;
```

<p class="api-member-doc">Cell coordinates whose text matches `query`, as a flat `[row, col, ...]`
list. Scans the requested columns column-major (cache-local), then sorts
row-major so search navigation runs top-to-bottom, left-to-right.</p>
</details>

<details class="api-member" id="cell-store-set-block" data-pagefind-weight="1">
<summary><code>setBlock</code> <span class="api-member-summary">Atomically write one row-major mixed literal/formula/reference block.</span></summary>

<button class="api-copy" type="button" data-copy-code="setBlock: (sheet: number, start_row: number, start_col: number, rows: number, cols: number, kinds: Uint8Array, numbers: Float64Array, texts: string[], styles: Uint32Array, formula_offsets: Uint32Array, formula_sources: string[], reference_offsets: Uint32Array, reference_targets: Uint32Array) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
setBlock: (sheet: number, start_row: number, start_col: number, rows: number, cols: number, kinds: Uint8Array, numbers: Float64Array, texts: string[], styles: Uint32Array, formula_offsets: Uint32Array, formula_sources: string[], reference_offsets: Uint32Array, reference_targets: Uint32Array) => number;
```

<p class="api-member-doc">Atomically write one row-major mixed literal/formula/reference block.
Formula/reference offsets are sparse row-major exceptions. Reference
targets are packed `[sheet_handle, row, col]` triples. The compact
status is `0` success, `1` invalid shape/bounds, `2` invalid or duplicate
source metadata, and `3` paged dirty-capacity rejection.</p>
</details>

<details class="api-member" id="cell-store-set-bool" data-pagefind-weight="1" open>
<summary><code>setBool</code></summary>

<button class="api-copy" type="button" data-copy-code="setBool: (sheet: number, row: number, col: number, value: boolean, style: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setBool: (sheet: number, row: number, col: number, value: boolean, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-column-numbers" data-pagefind-weight="1">
<summary><code>setColumnNumbers</code> <span class="api-member-summary">Bulk-load one column with numbers starting at startrow.</span></summary>

<button class="api-copy" type="button" data-copy-code="setColumnNumbers: (sheet: number, col: number, start_row: number, values: Float64Array, style: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setColumnNumbers: (sheet: number, col: number, start_row: number, values: Float64Array, style: number) => void;
```

<p class="api-member-doc">Bulk-load one column with numbers starting at `start_row`.</p>
</details>

<details class="api-member" id="cell-store-set-column-strings" data-pagefind-weight="1">
<summary><code>setColumnStrings</code> <span class="api-member-summary">Bulk-load one column with strings starting at startrow.</span></summary>

<button class="api-copy" type="button" data-copy-code="setColumnStrings: (sheet: number, col: number, start_row: number, values: string[], style: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setColumnStrings: (sheet: number, col: number, start_row: number, values: string[], style: number) => void;
```

<p class="api-member-doc">Bulk-load one column with strings starting at `start_row`.</p>
</details>

<details class="api-member" id="cell-store-set-column-strings-packed" data-pagefind-weight="1">
<summary><code>setColumnStringsPacked</code> <span class="api-member-summary">Bulk-load one column of strings from a single concatenated buffer plus per-row lengths in UTF-16 code units (the JS string.length unit).</span></summary>

<button class="api-copy" type="button" data-copy-code="setColumnStringsPacked: (sheet: number, col: number, start_row: number, buf: string, utf16_lens: Uint32Array, style: number) =&gt; void;" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="setConditionalRules: (sheet: number, kinds: Uint8Array, bounds: Uint32Array, nums: Float64Array, strs: string[], flags: Uint8Array) =&gt; void;" data-pagefind-ignore>Copy</button>

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

<details class="api-member" id="cell-store-set-formula" data-pagefind-weight="1" open>
<summary><code>setFormula</code> <span class="api-member-summary">Parse and store an arithmetic formula at (row, col).</span></summary>

<button class="api-copy" type="button" data-copy-code="setFormula: (sheet: number, row: number, col: number, src: string, style: number) =&gt; number;" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="setNamedRange: (name: string, scope: number, sheet: number, row_start: number, col_start: number, row_end: number, col_end: number) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
setNamedRange: (name: string, scope: number, sheet: number, row_start: number, col_start: number, row_end: number, col_end: number) => boolean;
```

</details>

<details class="api-member" id="cell-store-set-number" data-pagefind-weight="1" open>
<summary><code>setNumber</code></summary>

<button class="api-copy" type="button" data-copy-code="setNumber: (sheet: number, row: number, col: number, value: number, style: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setNumber: (sheet: number, row: number, col: number, value: number, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-sheet-name" data-pagefind-weight="1" open>
<summary><code>setSheetName</code></summary>

<button class="api-copy" type="button" data-copy-code="setSheetName: (sheet: number, id: string, name: string) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setSheetName: (sheet: number, id: string, name: string) => void;
```

</details>

<details class="api-member" id="cell-store-set-sparse-block" data-pagefind-weight="1">
<summary><code>setSparseBlock</code> <span class="api-member-summary">Write one sparse mixed transaction/page/snapshot block without allocating by logical rectangle size.</span></summary>

<button class="api-copy" type="button" data-copy-code="setSparseBlock: (sheet: number, start_row: number, start_col: number, rows: number, cols: number, offsets: Uint32Array, kinds: Uint8Array, numbers: Float64Array, texts: string[], styles: Uint32Array, formula_offsets: Uint32Array, formula_sources: string[], reference_offsets: Uint32Array, reference_targets: Uint32Array) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
setSparseBlock: (sheet: number, start_row: number, start_col: number, rows: number, cols: number, offsets: Uint32Array, kinds: Uint8Array, numbers: Float64Array, texts: string[], styles: Uint32Array, formula_offsets: Uint32Array, formula_sources: string[], reference_offsets: Uint32Array, reference_targets: Uint32Array) => number;
```

<p class="api-member-doc">Write one sparse mixed transaction/page/snapshot block without
allocating by logical rectangle size. Inside `beginPageLoad`, dirty
paged cells are skipped; otherwise the whole sparse write is preflighted.</p>
</details>

<details class="api-member" id="cell-store-set-spill-blockers" data-pagefind-weight="1" open>
<summary><code>setSpillBlockers</code> <span class="api-member-summary">Replace the host-owned merge/protection collision ranges.</span></summary>

<button class="api-copy" type="button" data-copy-code="setSpillBlockers: (sheet: number, bounds: Uint32Array) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
setSpillBlockers: (sheet: number, bounds: Uint32Array) => boolean;
```

<p class="api-member-doc">Replace the host-owned merge/protection collision ranges. Packed as
`[row_start, col_start, row_end, col_end, ...]`; invalid input fails
without weakening the old gate.</p>
</details>

<details class="api-member" id="cell-store-set-string" data-pagefind-weight="1" open>
<summary><code>setString</code></summary>

<button class="api-copy" type="button" data-copy-code="setString: (sheet: number, row: number, col: number, value: string, style: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setString: (sheet: number, row: number, col: number, value: string, style: number) => void;
```

</details>

<details class="api-member" id="cell-store-set-table" data-pagefind-weight="1">
<summary><code>setTable</code></summary>

<button class="api-copy" type="button" data-copy-code="setTable: (id: string, name: string, sheet: number, row_start: number, col_start: number, row_end: number, col_end: number, header_row: boolean, totals_row: boolean, column_ids: string[], column_names: string[]) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
setTable: (id: string, name: string, sheet: number, row_start: number, col_start: number, row_end: number, col_end: number, header_row: boolean, totals_row: boolean, column_ids: string[], column_names: string[]) => boolean;
```

</details>

<details class="api-member" id="cell-store-snapshot-numbers" data-pagefind-weight="1" open>
<summary><code>snapshotNumbers</code></summary>

<button class="api-copy" type="button" data-copy-code="snapshotNumbers: (snapshot: RangeSnapshot) =&gt; Float64Array;" data-pagefind-ignore>Copy</button>

```ts generated
snapshotNumbers: (snapshot: RangeSnapshot) => Float64Array;
```

</details>

<details class="api-member" id="cell-store-snapshot-texts" data-pagefind-weight="1" open>
<summary><code>snapshotTexts</code></summary>

<button class="api-copy" type="button" data-copy-code="snapshotTexts: (snapshot: RangeSnapshot) =&gt; string[];" data-pagefind-ignore>Copy</button>

```ts generated
snapshotTexts: (snapshot: RangeSnapshot) => string[];
```

</details>

<details class="api-member" id="cell-store-sort-rows" data-pagefind-weight="1" open>
<summary><code>sortRows</code> <span class="api-member-summary">Stable row order sorted by a column.</span></summary>

<button class="api-copy" type="button" data-copy-code="sortRows: (sheet: number, col: number, ascending: boolean) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
sortRows: (sheet: number, col: number, ascending: boolean) => Uint32Array;
```

<p class="api-member-doc">Stable row order sorted by a column. Returns a data-row permutation.</p>
</details>

<details class="api-member" id="cell-store-sort-rows-multi" data-pagefind-weight="1">
<summary><code>sortRowsMulti</code></summary>

<button class="api-copy" type="button" data-copy-code="sortRowsMulti: (sheet: number, cols: Uint32Array, ascending: Uint8Array, candidates: Uint32Array) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
sortRowsMulti: (sheet: number, cols: Uint32Array, ascending: Uint8Array, candidates: Uint32Array) => Uint32Array;
```

</details>

<details class="api-member" id="cell-store-spill-anchor-col" data-pagefind-weight="1" open>
<summary><code>spillAnchorCol</code></summary>

<button class="api-copy" type="button" data-copy-code="spillAnchorCol: (sheet: number, row: number, col: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
spillAnchorCol: (sheet: number, row: number, col: number) => number;
```

</details>

<details class="api-member" id="cell-store-spill-anchor-row" data-pagefind-weight="1" open>
<summary><code>spillAnchorRow</code> <span class="api-member-summary">Stable spill owner coordinate, or u32::MAX when cell is not part of a materialized spill.</span></summary>

<button class="api-copy" type="button" data-copy-code="spillAnchorRow: (sheet: number, row: number, col: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
spillAnchorRow: (sheet: number, row: number, col: number) => number;
```

</details>

<details class="api-member" id="cell-store-spill-derived-mask" data-pagefind-weight="1">
<summary><code>spillDerivedMask</code> <span class="api-member-summary">Row-major mask aligned with render-window layout; 1 marks a derived spill cell and deliberately excludes the anchor.</span></summary>

<button class="api-copy" type="button" data-copy-code="spillDerivedMask: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) =&gt; Uint8Array;" data-pagefind-ignore>Copy</button>

```ts generated
spillDerivedMask: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) => Uint8Array;
```

</details>

<details class="api-member" id="cell-store-spill-owner-coordinates" data-pagefind-weight="1">
<summary><code>spillOwnerCoordinates</code> <span class="api-member-summary">Packed row-major [anchorrow, anchorcol, ...] owner coordinates.</span></summary>

<button class="api-copy" type="button" data-copy-code="spillOwnerCoordinates: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
spillOwnerCoordinates: (sheet: number, row_start: number, row_end: number, cols: Uint32Array) => Uint32Array;
```

<p class="api-member-doc">Packed row-major `[anchor_row, anchor_col, ...]` owner coordinates.</p>
</details>

<details class="api-member" id="cell-store-style-id-at" data-pagefind-weight="1" open>
<summary><code>styleIdAt</code> <span class="api-member-summary">Current style-dictionary id at a cell; 0 when out of bounds.</span></summary>

<button class="api-copy" type="button" data-copy-code="styleIdAt: (sheet: number, row: number, col: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
styleIdAt: (sheet: number, row: number, col: number) => number;
```

<p class="api-member-doc">Current style-dictionary id at a cell; `0` when out of bounds. Used by
the host to write derived (reference-shadow) values without disturbing
the cell's style.</p>
</details>

<details class="api-member" id="cell-store-wasm-committed-bytes" data-pagefind-weight="1" open>
<summary><code>wasmCommittedBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="wasmCommittedBytes: () =&gt; number" data-pagefind-ignore>Copy</button>

```ts generated
wasmCommittedBytes: () => number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class CellStore {&#10;  acknowledgeRevision: (revision: bigint) =&gt; void;&#10;  addPagedSheet: (&#10;    n_cols: number,&#10;    row_count: number,&#10;    chunk_rows: number,&#10;    byte_budget: number,&#10;    max_dirty_cells: number,&#10;  ) =&gt; number;&#10;  addRows: (sheet: number, at: number, count: number) =&gt; void;&#10;  addSheet: (n_cols: number, row_count: number) =&gt; number;&#10;  aggregate: (sheet: number, col: number, op: number) =&gt; number;&#10;  beginMutation: () =&gt; bigint;&#10;  beginPageLoad: () =&gt; void;&#10;  canDirtyCell: (sheet: number, row: number, col: number) =&gt; boolean;&#10;  captureRange: (&#10;    sheet: number,&#10;    r0: number,&#10;    c0: number,&#10;    rows: number,&#10;    cols: number,&#10;  ) =&gt; RangeSnapshot | undefined;&#10;  captureReferences: (&#10;    sheet: number,&#10;    max_entries: number,&#10;  ) =&gt; SourceSnapshot | undefined;&#10;  captureSources: (&#10;    sheet: number,&#10;    r0: number,&#10;    c0: number,&#10;    rows: number,&#10;    cols: number,&#10;  ) =&gt; SourceSnapshot | undefined;&#10;  captureSourcesForRows: (&#10;    sheet: number,&#10;    rows: Uint32Array,&#10;    cols: Uint32Array,&#10;  ) =&gt; SourceSnapshot | undefined;&#10;  cellState: (sheet: number, row: number, col: number) =&gt; number;&#10;  clearCell: (sheet: number, row: number, col: number, style: number) =&gt; void;&#10;  clearRange: (&#10;    sheet: number,&#10;    r0: number,&#10;    c0: number,&#10;    r1: number,&#10;    c1: number,&#10;    contents: boolean,&#10;    style: boolean,&#10;  ) =&gt; boolean;&#10;  colCount: (sheet: number) =&gt; number;&#10;  columnsFullyLoaded: (&#10;    sheet: number,&#10;    start_row: number,&#10;    end_row: number,&#10;    cols: Uint32Array,&#10;  ) =&gt; boolean;&#10;  compactStringStorage: () =&gt; void;&#10;  dataEdge: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;    d_row: number,&#10;    d_col: number,&#10;  ) =&gt; number;&#10;  dataEdgeOrdered: (&#10;    sheet: number,&#10;    order: Uint32Array,&#10;    row: number,&#10;    col: number,&#10;    d_row: number,&#10;    d_col: number,&#10;  ) =&gt; number;&#10;  dirtyRevision: (sheet: number, row: number, col: number) =&gt; bigint;&#10;  distinctValues: (&#10;    sheet: number,&#10;    col: number,&#10;    limit: number,&#10;  ) =&gt; DistinctColumn;&#10;  endMutation: () =&gt; void;&#10;  endPageLoad: () =&gt; void;&#10;  filterRows: (sheet: number, col: number, needle: string) =&gt; Uint32Array;&#10;  filterRowsMulti: (&#10;    sheet: number,&#10;    cols: Uint32Array,&#10;    kinds: Uint8Array,&#10;    flags: Uint8Array,&#10;    nums: Float64Array,&#10;    num_counts: Uint32Array,&#10;    text_counts: Uint32Array,&#10;    value_nums: Float64Array,&#10;    value_texts: string[],&#10;  ) =&gt; Uint32Array;&#10;  formulaMatrixResourceStats: () =&gt; Float64Array;&#10;  formulaSource: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;  ) =&gt; string | undefined;&#10;  free: () =&gt; void;&#10;  getCell: (sheet: number, row: number, col: number) =&gt; CellOut;&#10;  getWindow: (&#10;    sheet: number,&#10;    row_start: number,&#10;    row_end: number,&#10;    cols: Uint32Array,&#10;  ) =&gt; WindowView;&#10;  getWindowRows: (&#10;    sheet: number,&#10;    rows: Uint32Array,&#10;    cols: Uint32Array,&#10;  ) =&gt; WindowView;&#10;  hydratePageNumbers: (&#10;    sheet: number,&#10;    col: number,&#10;    start_row: number,&#10;    values: Float64Array,&#10;    style: number,&#10;    protected_offsets: Uint32Array,&#10;  ) =&gt; void;&#10;  hydratePageStringsPacked: (&#10;    sheet: number,&#10;    col: number,&#10;    start_row: number,&#10;    buf: string,&#10;    utf16_lens: Uint32Array,&#10;    style: number,&#10;    protected_offsets: Uint32Array,&#10;  ) =&gt; void;&#10;  insertCols: (sheet: number, at: number, count: number) =&gt; void;&#10;  isFullyLoaded: (sheet: number) =&gt; boolean;&#10;  isPaged: (sheet: number) =&gt; boolean;&#10;  isSheetAlive: (sheet: number) =&gt; boolean;&#10;  markCellCleanRevision: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;    revision: bigint,&#10;  ) =&gt; boolean;&#10;  markRangeClean: (&#10;    sheet: number,&#10;    start_row: number,&#10;    end_row: number,&#10;    start_col: number,&#10;    end_col: number,&#10;  ) =&gt; void;&#10;  memoryStats: () =&gt; Float64Array;&#10;  pagedDirtyCoordinates: (sheet: number) =&gt; Float64Array;&#10;  pagedStats: (sheet: number) =&gt; Float64Array;&#10;  persistedCellData: (sheet: number) =&gt; Float64Array;&#10;  pinRange: (&#10;    sheet: number,&#10;    start_row: number,&#10;    end_row: number,&#10;    cols: Uint32Array,&#10;  ) =&gt; void;&#10;  poolStrings: (ids: Uint32Array) =&gt; string[];&#10;  queryResourceStats: () =&gt; Float64Array;&#10;  rangeFullyLoaded: (&#10;    sheet: number,&#10;    r0: number,&#10;    c0: number,&#10;    r1: number,&#10;    c1: number,&#10;  ) =&gt; boolean;&#10;  rangeStyleIds: (&#10;    sheet: number,&#10;    r0: number,&#10;    c0: number,&#10;    r1: number,&#10;    c1: number,&#10;  ) =&gt; Uint32Array;&#10;  recompute: (sheet: number) =&gt; void;&#10;  recomputeChanged: () =&gt; void;&#10;  recomputeVolatile: (serial: number) =&gt; boolean;&#10;  referenceTarget: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;  ) =&gt; Uint32Array | undefined;&#10;  referencesTargeting: (&#10;    target_sheet: number,&#10;    max_entries: number,&#10;  ) =&gt; Uint32Array | undefined;&#10;  remapRangeStyles: (&#10;    sheet: number,&#10;    r0: number,&#10;    c0: number,&#10;    r1: number,&#10;    c1: number,&#10;    old_ids: Uint32Array,&#10;    new_ids: Uint32Array,&#10;  ) =&gt; boolean;&#10;  removeCols: (sheet: number, at: number, count: number) =&gt; void;&#10;  removeNamedRange: (name: string, scope: number) =&gt; boolean;&#10;  removeRows: (sheet: number, at: number, count: number) =&gt; void;&#10;  removeSheet: (sheet: number) =&gt; boolean;&#10;  removeTable: (id: string) =&gt; boolean;&#10;  renameSheet: (sheet: number, id: string, name: string) =&gt; boolean;&#10;  resetFormulaMatrixResourceStats: () =&gt; void;&#10;  resetQueryResourceStats: () =&gt; void;&#10;  restoreRange: (&#10;    sheet: number,&#10;    r0: number,&#10;    c0: number,&#10;    snapshot: RangeSnapshot,&#10;  ) =&gt; boolean;&#10;  rowCount: (sheet: number) =&gt; number;&#10;  search: (&#10;    sheet: number,&#10;    cols: Uint32Array,&#10;    query: string,&#10;    case_insensitive: boolean,&#10;    whole_cell: boolean,&#10;  ) =&gt; Uint32Array;&#10;  setBlock: (&#10;    sheet: number,&#10;    start_row: number,&#10;    start_col: number,&#10;    rows: number,&#10;    cols: number,&#10;    kinds: Uint8Array,&#10;    numbers: Float64Array,&#10;    texts: string[],&#10;    styles: Uint32Array,&#10;    formula_offsets: Uint32Array,&#10;    formula_sources: string[],&#10;    reference_offsets: Uint32Array,&#10;    reference_targets: Uint32Array,&#10;  ) =&gt; number;&#10;  setBool: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;    value: boolean,&#10;    style: number,&#10;  ) =&gt; void;&#10;  setColumnNumbers: (&#10;    sheet: number,&#10;    col: number,&#10;    start_row: number,&#10;    values: Float64Array,&#10;    style: number,&#10;  ) =&gt; void;&#10;  setColumnStrings: (&#10;    sheet: number,&#10;    col: number,&#10;    start_row: number,&#10;    values: string[],&#10;    style: number,&#10;  ) =&gt; void;&#10;  setColumnStringsPacked: (&#10;    sheet: number,&#10;    col: number,&#10;    start_row: number,&#10;    buf: string,&#10;    utf16_lens: Uint32Array,&#10;    style: number,&#10;  ) =&gt; void;&#10;  setConditionalRules: (&#10;    sheet: number,&#10;    kinds: Uint8Array,&#10;    bounds: Uint32Array,&#10;    nums: Float64Array,&#10;    strs: string[],&#10;    flags: Uint8Array,&#10;  ) =&gt; void;&#10;  setFormula: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;    src: string,&#10;    style: number,&#10;  ) =&gt; number;&#10;  setNamedRange: (&#10;    name: string,&#10;    scope: number,&#10;    sheet: number,&#10;    row_start: number,&#10;    col_start: number,&#10;    row_end: number,&#10;    col_end: number,&#10;  ) =&gt; boolean;&#10;  setNumber: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;    value: number,&#10;    style: number,&#10;  ) =&gt; void;&#10;  setSheetName: (sheet: number, id: string, name: string) =&gt; void;&#10;  setSparseBlock: (&#10;    sheet: number,&#10;    start_row: number,&#10;    start_col: number,&#10;    rows: number,&#10;    cols: number,&#10;    offsets: Uint32Array,&#10;    kinds: Uint8Array,&#10;    numbers: Float64Array,&#10;    texts: string[],&#10;    styles: Uint32Array,&#10;    formula_offsets: Uint32Array,&#10;    formula_sources: string[],&#10;    reference_offsets: Uint32Array,&#10;    reference_targets: Uint32Array,&#10;  ) =&gt; number;&#10;  setSpillBlockers: (sheet: number, bounds: Uint32Array) =&gt; boolean;&#10;  setString: (&#10;    sheet: number,&#10;    row: number,&#10;    col: number,&#10;    value: string,&#10;    style: number,&#10;  ) =&gt; void;&#10;  setTable: (&#10;    id: string,&#10;    name: string,&#10;    sheet: number,&#10;    row_start: number,&#10;    col_start: number,&#10;    row_end: number,&#10;    col_end: number,&#10;    header_row: boolean,&#10;    totals_row: boolean,&#10;    column_ids: string[],&#10;    column_names: string[],&#10;  ) =&gt; boolean;&#10;  snapshotNumbers: (snapshot: RangeSnapshot) =&gt; Float64Array;&#10;  snapshotTexts: (snapshot: RangeSnapshot) =&gt; string[];&#10;  sortRows: (sheet: number, col: number, ascending: boolean) =&gt; Uint32Array;&#10;  sortRowsMulti: (&#10;    sheet: number,&#10;    cols: Uint32Array,&#10;    ascending: Uint8Array,&#10;    candidates: Uint32Array,&#10;  ) =&gt; Uint32Array;&#10;  spillAnchorCol: (sheet: number, row: number, col: number) =&gt; number;&#10;  spillAnchorRow: (sheet: number, row: number, col: number) =&gt; number;&#10;  spillDerivedMask: (&#10;    sheet: number,&#10;    row_start: number,&#10;    row_end: number,&#10;    cols: Uint32Array,&#10;  ) =&gt; Uint8Array;&#10;  spillOwnerCoordinates: (&#10;    sheet: number,&#10;    row_start: number,&#10;    row_end: number,&#10;    cols: Uint32Array,&#10;  ) =&gt; Uint32Array;&#10;  styleIdAt: (sheet: number, row: number, col: number) =&gt; number;&#10;  wasmCommittedBytes: () =&gt; number;&#10;}" data-pagefind-ignore>Copy</button>

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

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
