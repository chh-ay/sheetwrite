---
title: "InitOutput | @sheetwrite/formulas"
description: "Result of module initialization: the instantiated exports plus the shared linear memory."
---
<!-- api-export:@sheetwrite/formulas|.|InitOutput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="interface">interface</span></div>

Result of module initialization: the instantiated exports plus the shared linear memory.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/formulas/pkg/sheetwrite_wasm.d.ts#L465"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L465</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#init-output-memory"><code>memory</code></a>
<a href="#init-output-wbg-cellout-free"><code>__wbg_cellout_free</code></a>
<a href="#init-output-wbg-cellsnapshot-free"><code>__wbg_cellsnapshot_free</code></a>
<a href="#init-output-wbg-cellstore-free"><code>__wbg_cellstore_free</code></a>
<a href="#init-output-wbg-distinctcolumn-free"><code>__wbg_distinctcolumn_free</code></a>
<a href="#init-output-wbg-rangesnapshot-free"><code>__wbg_rangesnapshot_free</code></a>
<a href="#init-output-wbg-sourcesnapshot-free"><code>__wbg_sourcesnapshot_free</code></a>
<a href="#init-output-wbg-windowview-free"><code>__wbg_windowview_free</code></a>
<a href="#init-output-cellout-kind"><code>cellout_kind</code></a>
<a href="#init-output-cellout-num"><code>cellout_num</code></a>
<a href="#init-output-cellout-string"><code>cellout_string</code></a>
<a href="#init-output-cellout-style"><code>cellout_style</code></a>
<a href="#init-output-cellsnapshot-kinds"><code>cellsnapshot_kinds</code></a>
<a href="#init-output-cellsnapshot-numbers"><code>cellsnapshot_numbers</code></a>
<a href="#init-output-cellsnapshot-strings"><code>cellsnapshot_strings</code></a>
<a href="#init-output-cellsnapshot-styles"><code>cellsnapshot_styles</code></a>
<a href="#init-output-cellsnapshot-text-index"><code>cellsnapshot_textIndex</code></a>
<a href="#init-output-cellstore-acknowledge-revision"><code>cellstore_acknowledgeRevision</code></a>
<a href="#init-output-cellstore-add-paged-sheet"><code>cellstore_addPagedSheet</code></a>
<a href="#init-output-cellstore-add-rows"><code>cellstore_addRows</code></a>
<a href="#init-output-cellstore-add-sheet"><code>cellstore_addSheet</code></a>
<a href="#init-output-cellstore-aggregate"><code>cellstore_aggregate</code></a>
<a href="#init-output-cellstore-begin-mutation"><code>cellstore_beginMutation</code></a>
<a href="#init-output-cellstore-begin-page-load"><code>cellstore_beginPageLoad</code></a>
<a href="#init-output-cellstore-can-dirty-cell"><code>cellstore_canDirtyCell</code></a>
<a href="#init-output-cellstore-capture-range"><code>cellstore_captureRange</code></a>
<a href="#init-output-cellstore-capture-references"><code>cellstore_captureReferences</code></a>
<a href="#init-output-cellstore-capture-sources"><code>cellstore_captureSources</code></a>
<a href="#init-output-cellstore-capture-sources-for-rows"><code>cellstore_captureSourcesForRows</code></a>
<a href="#init-output-cellstore-cell-snapshots"><code>cellstore_cellSnapshots</code></a>
<a href="#init-output-cellstore-cell-state"><code>cellstore_cellState</code></a>
<a href="#init-output-cellstore-clear-cell"><code>cellstore_clearCell</code></a>
<a href="#init-output-cellstore-clear-range"><code>cellstore_clearRange</code></a>
<a href="#init-output-cellstore-col-count"><code>cellstore_colCount</code></a>
<a href="#init-output-cellstore-columns-fully-loaded"><code>cellstore_columnsFullyLoaded</code></a>
<a href="#init-output-cellstore-compact-string-storage"><code>cellstore_compactStringStorage</code></a>
<a href="#init-output-cellstore-data-edge"><code>cellstore_dataEdge</code></a>
<a href="#init-output-cellstore-data-edge-ordered"><code>cellstore_dataEdgeOrdered</code></a>
<a href="#init-output-cellstore-dirty-revision"><code>cellstore_dirtyRevision</code></a>
<a href="#init-output-cellstore-distinct-values"><code>cellstore_distinctValues</code></a>
<a href="#init-output-cellstore-end-mutation"><code>cellstore_endMutation</code></a>
<a href="#init-output-cellstore-end-page-load"><code>cellstore_endPageLoad</code></a>
<a href="#init-output-cellstore-filter-rows"><code>cellstore_filterRows</code></a>
<a href="#init-output-cellstore-filter-rows-multi"><code>cellstore_filterRowsMulti</code></a>
<a href="#init-output-cellstore-formula-matrix-resource-stats"><code>cellstore_formulaMatrixResourceStats</code></a>
<a href="#init-output-cellstore-formula-read-bands"><code>cellstore_formulaReadBands</code></a>
<a href="#init-output-cellstore-formula-source"><code>cellstore_formulaSource</code></a>
<a href="#init-output-cellstore-get-cell"><code>cellstore_getCell</code></a>
<a href="#init-output-cellstore-get-window"><code>cellstore_getWindow</code></a>
<a href="#init-output-cellstore-get-window-rows"><code>cellstore_getWindowRows</code></a>
<a href="#init-output-cellstore-hydrate-page-numbers"><code>cellstore_hydratePageNumbers</code></a>
<a href="#init-output-cellstore-hydrate-page-strings-packed"><code>cellstore_hydratePageStringsPacked</code></a>
<a href="#init-output-cellstore-insert-cols"><code>cellstore_insertCols</code></a>
<a href="#init-output-cellstore-is-fully-loaded"><code>cellstore_isFullyLoaded</code></a>
<a href="#init-output-cellstore-is-paged"><code>cellstore_isPaged</code></a>
<a href="#init-output-cellstore-is-sheet-alive"><code>cellstore_isSheetAlive</code></a>
<a href="#init-output-cellstore-loaded-spans"><code>cellstore_loadedSpans</code></a>
<a href="#init-output-cellstore-mark-cell-clean-revision"><code>cellstore_markCellCleanRevision</code></a>
<a href="#init-output-cellstore-mark-range-clean"><code>cellstore_markRangeClean</code></a>
<a href="#init-output-cellstore-memory-stats"><code>cellstore_memoryStats</code></a>
<a href="#init-output-cellstore-new"><code>cellstore_new</code></a>
<a href="#init-output-cellstore-paged-dirty-coordinates"><code>cellstore_pagedDirtyCoordinates</code></a>
<a href="#init-output-cellstore-paged-stats"><code>cellstore_pagedStats</code></a>
<a href="#init-output-cellstore-persisted-cell-data"><code>cellstore_persistedCellData</code></a>
<a href="#init-output-cellstore-pin-range"><code>cellstore_pinRange</code></a>
<a href="#init-output-cellstore-pool-strings"><code>cellstore_poolStrings</code></a>
<a href="#init-output-cellstore-query-resource-stats"><code>cellstore_queryResourceStats</code></a>
<a href="#init-output-cellstore-range-fully-loaded"><code>cellstore_rangeFullyLoaded</code></a>
<a href="#init-output-cellstore-range-style-ids"><code>cellstore_rangeStyleIds</code></a>
<a href="#init-output-cellstore-recompute"><code>cellstore_recompute</code></a>
<a href="#init-output-cellstore-recompute-changed"><code>cellstore_recomputeChanged</code></a>
<a href="#init-output-cellstore-recompute-volatile"><code>cellstore_recomputeVolatile</code></a>
<a href="#init-output-cellstore-reference-target"><code>cellstore_referenceTarget</code></a>
<a href="#init-output-cellstore-references-targeting"><code>cellstore_referencesTargeting</code></a>
<a href="#init-output-cellstore-remap-range-styles"><code>cellstore_remapRangeStyles</code></a>
<a href="#init-output-cellstore-remove-cols"><code>cellstore_removeCols</code></a>
<a href="#init-output-cellstore-remove-named-range"><code>cellstore_removeNamedRange</code></a>
<a href="#init-output-cellstore-remove-rows"><code>cellstore_removeRows</code></a>
<a href="#init-output-cellstore-remove-sheet"><code>cellstore_removeSheet</code></a>
<a href="#init-output-cellstore-remove-table"><code>cellstore_removeTable</code></a>
<a href="#init-output-cellstore-rename-sheet"><code>cellstore_renameSheet</code></a>
<a href="#init-output-cellstore-reset-formula-matrix-resource-stats"><code>cellstore_resetFormulaMatrixResourceStats</code></a>
<a href="#init-output-cellstore-reset-query-resource-stats"><code>cellstore_resetQueryResourceStats</code></a>
<a href="#init-output-cellstore-restore-range"><code>cellstore_restoreRange</code></a>
<a href="#init-output-cellstore-row-count"><code>cellstore_rowCount</code></a>
<a href="#init-output-cellstore-search"><code>cellstore_search</code></a>
<a href="#init-output-cellstore-set-block-packed"><code>cellstore_setBlockPacked</code></a>
<a href="#init-output-cellstore-set-bool"><code>cellstore_setBool</code></a>
<a href="#init-output-cellstore-set-column-block-packed"><code>cellstore_setColumnBlockPacked</code></a>
<a href="#init-output-cellstore-set-column-numbers"><code>cellstore_setColumnNumbers</code></a>
<a href="#init-output-cellstore-set-column-strings"><code>cellstore_setColumnStrings</code></a>
<a href="#init-output-cellstore-set-column-strings-packed"><code>cellstore_setColumnStringsPacked</code></a>
<a href="#init-output-cellstore-set-conditional-rules"><code>cellstore_setConditionalRules</code></a>
<a href="#init-output-cellstore-set-formula"><code>cellstore_setFormula</code></a>
<a href="#init-output-cellstore-set-named-range"><code>cellstore_setNamedRange</code></a>
<a href="#init-output-cellstore-set-number"><code>cellstore_setNumber</code></a>
<a href="#init-output-cellstore-set-sheet-name"><code>cellstore_setSheetName</code></a>
<a href="#init-output-cellstore-set-sparse-block"><code>cellstore_setSparseBlock</code></a>
<a href="#init-output-cellstore-set-spill-blockers"><code>cellstore_setSpillBlockers</code></a>
<a href="#init-output-cellstore-set-string"><code>cellstore_setString</code></a>
<a href="#init-output-cellstore-set-table"><code>cellstore_setTable</code></a>
<a href="#init-output-cellstore-snapshot-numbers"><code>cellstore_snapshotNumbers</code></a>
<a href="#init-output-cellstore-snapshot-texts"><code>cellstore_snapshotTexts</code></a>
<a href="#init-output-cellstore-sort-rows"><code>cellstore_sortRows</code></a>
<a href="#init-output-cellstore-sort-rows-multi"><code>cellstore_sortRowsMulti</code></a>
<a href="#init-output-cellstore-spill-anchor-col"><code>cellstore_spillAnchorCol</code></a>
<a href="#init-output-cellstore-spill-anchor-row"><code>cellstore_spillAnchorRow</code></a>
<a href="#init-output-cellstore-spill-derived-mask"><code>cellstore_spillDerivedMask</code></a>
<a href="#init-output-cellstore-spill-owner-coordinates"><code>cellstore_spillOwnerCoordinates</code></a>
<a href="#init-output-cellstore-style-id-at"><code>cellstore_styleIdAt</code></a>
<a href="#init-output-cellstore-wasm-committed-bytes"><code>cellstore_wasmCommittedBytes</code></a>
<a href="#init-output-distinctcolumn-take-kinds"><code>distinctcolumn_takeKinds</code></a>
<a href="#init-output-distinctcolumn-take-numbers"><code>distinctcolumn_takeNumbers</code></a>
<a href="#init-output-distinctcolumn-take-texts"><code>distinctcolumn_takeTexts</code></a>
<a href="#init-output-function-names"><code>functionNames</code></a>
<a href="#init-output-rangesnapshot-byte-length"><code>rangesnapshot_byteLength</code></a>
<a href="#init-output-rangesnapshot-formula-offsets"><code>rangesnapshot_formulaOffsets</code></a>
<a href="#init-output-rangesnapshot-formula-sources"><code>rangesnapshot_formulaSources</code></a>
<a href="#init-output-rangesnapshot-kinds"><code>rangesnapshot_kinds</code></a>
<a href="#init-output-rangesnapshot-reference-offsets"><code>rangesnapshot_referenceOffsets</code></a>
<a href="#init-output-rangesnapshot-reference-targets"><code>rangesnapshot_referenceTargets</code></a>
<a href="#init-output-rangesnapshot-style-ids"><code>rangesnapshot_styleIds</code></a>
<a href="#init-output-sourcesnapshot-byte-length"><code>sourcesnapshot_byteLength</code></a>
<a href="#init-output-sourcesnapshot-formula-offsets"><code>sourcesnapshot_formulaOffsets</code></a>
<a href="#init-output-sourcesnapshot-formula-sources"><code>sourcesnapshot_formulaSources</code></a>
<a href="#init-output-sourcesnapshot-reference-offsets"><code>sourcesnapshot_referenceOffsets</code></a>
<a href="#init-output-sourcesnapshot-reference-targets"><code>sourcesnapshot_referenceTargets</code></a>
<a href="#init-output-sourcesnapshot-spill-derived"><code>sourcesnapshot_spillDerived</code></a>
<a href="#init-output-windowview-n-cols"><code>windowview_nCols</code></a>
<a href="#init-output-windowview-take-strings"><code>windowview_takeStrings</code></a>
<a href="#init-output-windowview-n-rows"><code>windowview_nRows</code></a>
<a href="#init-output-windowview-take-packed"><code>windowview_takePacked</code></a>
<a href="#init-output-wbindgen-malloc"><code>__wbindgen_malloc</code></a>
<a href="#init-output-wbindgen-realloc"><code>__wbindgen_realloc</code></a>
<a href="#init-output-wbindgen-externrefs"><code>__wbindgen_externrefs</code></a>
<a href="#init-output-wbindgen-free"><code>__wbindgen_free</code></a>
<a href="#init-output-externref-drop-slice"><code>__externref_drop_slice</code></a>
<a href="#init-output-externref-table-alloc"><code>__externref_table_alloc</code></a>
<a href="#init-output-wbindgen-start"><code>__wbindgen_start</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>139</span>

<div class="api-member-list">

<details class="api-member" id="init-output-memory" data-pagefind-weight="1">
<summary><code>memory</code></summary>

```ts generated
readonly memory: WebAssembly.Memory;
```

</details>

<details class="api-member" id="init-output-wbg-cellout-free" data-pagefind-weight="1">
<summary><code>__wbg_cellout_free</code></summary>

```ts generated
readonly __wbg_cellout_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-cellsnapshot-free" data-pagefind-weight="1">
<summary><code>__wbg_cellsnapshot_free</code></summary>

```ts generated
readonly __wbg_cellsnapshot_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-cellstore-free" data-pagefind-weight="1">
<summary><code>__wbg_cellstore_free</code></summary>

```ts generated
readonly __wbg_cellstore_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-distinctcolumn-free" data-pagefind-weight="1">
<summary><code>__wbg_distinctcolumn_free</code></summary>

```ts generated
readonly __wbg_distinctcolumn_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-rangesnapshot-free" data-pagefind-weight="1">
<summary><code>__wbg_rangesnapshot_free</code></summary>

```ts generated
readonly __wbg_rangesnapshot_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-sourcesnapshot-free" data-pagefind-weight="1">
<summary><code>__wbg_sourcesnapshot_free</code></summary>

```ts generated
readonly __wbg_sourcesnapshot_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-windowview-free" data-pagefind-weight="1">
<summary><code>__wbg_windowview_free</code></summary>

```ts generated
readonly __wbg_windowview_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-cellout-kind" data-pagefind-weight="1">
<summary><code>cellout_kind</code></summary>

```ts generated
readonly cellout_kind: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellout-num" data-pagefind-weight="1">
<summary><code>cellout_num</code></summary>

```ts generated
readonly cellout_num: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellout-string" data-pagefind-weight="1">
<summary><code>cellout_string</code></summary>

```ts generated
readonly cellout_string: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellout-style" data-pagefind-weight="1">
<summary><code>cellout_style</code></summary>

```ts generated
readonly cellout_style: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellsnapshot-kinds" data-pagefind-weight="1">
<summary><code>cellsnapshot_kinds</code></summary>

```ts generated
readonly cellsnapshot_kinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellsnapshot-numbers" data-pagefind-weight="1">
<summary><code>cellsnapshot_numbers</code></summary>

```ts generated
readonly cellsnapshot_numbers: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellsnapshot-strings" data-pagefind-weight="1">
<summary><code>cellsnapshot_strings</code></summary>

```ts generated
readonly cellsnapshot_strings: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellsnapshot-styles" data-pagefind-weight="1">
<summary><code>cellsnapshot_styles</code></summary>

```ts generated
readonly cellsnapshot_styles: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellsnapshot-text-index" data-pagefind-weight="1">
<summary><code>cellsnapshot_textIndex</code></summary>

```ts generated
readonly cellsnapshot_textIndex: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-acknowledge-revision" data-pagefind-weight="1">
<summary><code>cellstore_acknowledgeRevision</code></summary>

```ts generated
readonly cellstore_acknowledgeRevision: (a: number, b: bigint) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-add-paged-sheet" data-pagefind-weight="1">
<summary><code>cellstore_addPagedSheet</code></summary>

```ts generated
readonly cellstore_addPagedSheet: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-add-rows" data-pagefind-weight="1">
<summary><code>cellstore_addRows</code></summary>

```ts generated
readonly cellstore_addRows: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-add-sheet" data-pagefind-weight="1">
<summary><code>cellstore_addSheet</code></summary>

```ts generated
readonly cellstore_addSheet: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-aggregate" data-pagefind-weight="1">
<summary><code>cellstore_aggregate</code></summary>

```ts generated
readonly cellstore_aggregate: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-begin-mutation" data-pagefind-weight="1">
<summary><code>cellstore_beginMutation</code></summary>

```ts generated
readonly cellstore_beginMutation: (a: number) => bigint;
```

</details>

<details class="api-member" id="init-output-cellstore-begin-page-load" data-pagefind-weight="1">
<summary><code>cellstore_beginPageLoad</code></summary>

```ts generated
readonly cellstore_beginPageLoad: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-can-dirty-cell" data-pagefind-weight="1">
<summary><code>cellstore_canDirtyCell</code></summary>

```ts generated
readonly cellstore_canDirtyCell: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-range" data-pagefind-weight="1">
<summary><code>cellstore_captureRange</code></summary>

```ts generated
readonly cellstore_captureRange: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-references" data-pagefind-weight="1">
<summary><code>cellstore_captureReferences</code></summary>

```ts generated
readonly cellstore_captureReferences: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-sources" data-pagefind-weight="1">
<summary><code>cellstore_captureSources</code></summary>

```ts generated
readonly cellstore_captureSources: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-sources-for-rows" data-pagefind-weight="1">
<summary><code>cellstore_captureSourcesForRows</code></summary>

```ts generated
readonly cellstore_captureSourcesForRows: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-cell-snapshots" data-pagefind-weight="1">
<summary><code>cellstore_cellSnapshots</code></summary>

```ts generated
readonly cellstore_cellSnapshots: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-cell-state" data-pagefind-weight="1">
<summary><code>cellstore_cellState</code></summary>

```ts generated
readonly cellstore_cellState: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-clear-cell" data-pagefind-weight="1">
<summary><code>cellstore_clearCell</code></summary>

```ts generated
readonly cellstore_clearCell: (a: number, b: number, c: number, d: number, e: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-clear-range" data-pagefind-weight="1">
<summary><code>cellstore_clearRange</code></summary>

```ts generated
readonly cellstore_clearRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-col-count" data-pagefind-weight="1">
<summary><code>cellstore_colCount</code></summary>

```ts generated
readonly cellstore_colCount: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-columns-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_columnsFullyLoaded</code></summary>

```ts generated
readonly cellstore_columnsFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-compact-string-storage" data-pagefind-weight="1">
<summary><code>cellstore_compactStringStorage</code></summary>

```ts generated
readonly cellstore_compactStringStorage: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-data-edge" data-pagefind-weight="1">
<summary><code>cellstore_dataEdge</code></summary>

```ts generated
readonly cellstore_dataEdge: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-data-edge-ordered" data-pagefind-weight="1">
<summary><code>cellstore_dataEdgeOrdered</code></summary>

```ts generated
readonly cellstore_dataEdgeOrdered: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-dirty-revision" data-pagefind-weight="1">
<summary><code>cellstore_dirtyRevision</code></summary>

```ts generated
readonly cellstore_dirtyRevision: (a: number, b: number, c: number, d: number) => bigint;
```

</details>

<details class="api-member" id="init-output-cellstore-distinct-values" data-pagefind-weight="1">
<summary><code>cellstore_distinctValues</code></summary>

```ts generated
readonly cellstore_distinctValues: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-end-mutation" data-pagefind-weight="1">
<summary><code>cellstore_endMutation</code></summary>

```ts generated
readonly cellstore_endMutation: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-end-page-load" data-pagefind-weight="1">
<summary><code>cellstore_endPageLoad</code></summary>

```ts generated
readonly cellstore_endPageLoad: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-filter-rows" data-pagefind-weight="1">
<summary><code>cellstore_filterRows</code></summary>

```ts generated
readonly cellstore_filterRows: (a: number, b: number, c: number, d: number, e: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-filter-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_filterRowsMulti</code></summary>

```ts generated
readonly cellstore_filterRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-formula-matrix-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_formulaMatrixResourceStats</code></summary>

```ts generated
readonly cellstore_formulaMatrixResourceStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-formula-read-bands" data-pagefind-weight="1">
<summary><code>cellstore_formulaReadBands</code></summary>

```ts generated
readonly cellstore_formulaReadBands: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-formula-source" data-pagefind-weight="1">
<summary><code>cellstore_formulaSource</code></summary>

```ts generated
readonly cellstore_formulaSource: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-get-cell" data-pagefind-weight="1">
<summary><code>cellstore_getCell</code></summary>

```ts generated
readonly cellstore_getCell: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-get-window" data-pagefind-weight="1">
<summary><code>cellstore_getWindow</code></summary>

```ts generated
readonly cellstore_getWindow: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-get-window-rows" data-pagefind-weight="1">
<summary><code>cellstore_getWindowRows</code></summary>

```ts generated
readonly cellstore_getWindowRows: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-hydrate-page-numbers" data-pagefind-weight="1">
<summary><code>cellstore_hydratePageNumbers</code></summary>

```ts generated
readonly cellstore_hydratePageNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-hydrate-page-strings-packed" data-pagefind-weight="1">
<summary><code>cellstore_hydratePageStringsPacked</code></summary>

```ts generated
readonly cellstore_hydratePageStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-insert-cols" data-pagefind-weight="1">
<summary><code>cellstore_insertCols</code></summary>

```ts generated
readonly cellstore_insertCols: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-is-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_isFullyLoaded</code></summary>

```ts generated
readonly cellstore_isFullyLoaded: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-is-paged" data-pagefind-weight="1">
<summary><code>cellstore_isPaged</code></summary>

```ts generated
readonly cellstore_isPaged: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-is-sheet-alive" data-pagefind-weight="1">
<summary><code>cellstore_isSheetAlive</code></summary>

```ts generated
readonly cellstore_isSheetAlive: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-loaded-spans" data-pagefind-weight="1">
<summary><code>cellstore_loadedSpans</code></summary>

```ts generated
readonly cellstore_loadedSpans: (a: number, b: number, c: number, d: number, e: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-mark-cell-clean-revision" data-pagefind-weight="1">
<summary><code>cellstore_markCellCleanRevision</code></summary>

```ts generated
readonly cellstore_markCellCleanRevision: (a: number, b: number, c: number, d: number, e: bigint) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-mark-range-clean" data-pagefind-weight="1">
<summary><code>cellstore_markRangeClean</code></summary>

```ts generated
readonly cellstore_markRangeClean: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-memory-stats" data-pagefind-weight="1">
<summary><code>cellstore_memoryStats</code></summary>

```ts generated
readonly cellstore_memoryStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-new" data-pagefind-weight="1">
<summary><code>cellstore_new</code></summary>

```ts generated
readonly cellstore_new: () => number;
```

</details>

<details class="api-member" id="init-output-cellstore-paged-dirty-coordinates" data-pagefind-weight="1">
<summary><code>cellstore_pagedDirtyCoordinates</code></summary>

```ts generated
readonly cellstore_pagedDirtyCoordinates: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-paged-stats" data-pagefind-weight="1">
<summary><code>cellstore_pagedStats</code></summary>

```ts generated
readonly cellstore_pagedStats: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-persisted-cell-data" data-pagefind-weight="1">
<summary><code>cellstore_persistedCellData</code></summary>

```ts generated
readonly cellstore_persistedCellData: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-pin-range" data-pagefind-weight="1">
<summary><code>cellstore_pinRange</code></summary>

```ts generated
readonly cellstore_pinRange: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-pool-strings" data-pagefind-weight="1">
<summary><code>cellstore_poolStrings</code></summary>

```ts generated
readonly cellstore_poolStrings: (a: number, b: number, c: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-query-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_queryResourceStats</code></summary>

```ts generated
readonly cellstore_queryResourceStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-range-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_rangeFullyLoaded</code></summary>

```ts generated
readonly cellstore_rangeFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-range-style-ids" data-pagefind-weight="1">
<summary><code>cellstore_rangeStyleIds</code></summary>

```ts generated
readonly cellstore_rangeStyleIds: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-recompute" data-pagefind-weight="1">
<summary><code>cellstore_recompute</code></summary>

```ts generated
readonly cellstore_recompute: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-recompute-changed" data-pagefind-weight="1">
<summary><code>cellstore_recomputeChanged</code></summary>

```ts generated
readonly cellstore_recomputeChanged: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-recompute-volatile" data-pagefind-weight="1">
<summary><code>cellstore_recomputeVolatile</code></summary>

```ts generated
readonly cellstore_recomputeVolatile: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-reference-target" data-pagefind-weight="1">
<summary><code>cellstore_referenceTarget</code></summary>

```ts generated
readonly cellstore_referenceTarget: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-references-targeting" data-pagefind-weight="1">
<summary><code>cellstore_referencesTargeting</code></summary>

```ts generated
readonly cellstore_referencesTargeting: (a: number, b: number, c: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-remap-range-styles" data-pagefind-weight="1">
<summary><code>cellstore_remapRangeStyles</code></summary>

```ts generated
readonly cellstore_remapRangeStyles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-cols" data-pagefind-weight="1">
<summary><code>cellstore_removeCols</code></summary>

```ts generated
readonly cellstore_removeCols: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-named-range" data-pagefind-weight="1">
<summary><code>cellstore_removeNamedRange</code></summary>

```ts generated
readonly cellstore_removeNamedRange: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-rows" data-pagefind-weight="1">
<summary><code>cellstore_removeRows</code></summary>

```ts generated
readonly cellstore_removeRows: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-sheet" data-pagefind-weight="1">
<summary><code>cellstore_removeSheet</code></summary>

```ts generated
readonly cellstore_removeSheet: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-table" data-pagefind-weight="1">
<summary><code>cellstore_removeTable</code></summary>

```ts generated
readonly cellstore_removeTable: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-rename-sheet" data-pagefind-weight="1">
<summary><code>cellstore_renameSheet</code></summary>

```ts generated
readonly cellstore_renameSheet: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-reset-formula-matrix-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_resetFormulaMatrixResourceStats</code></summary>

```ts generated
readonly cellstore_resetFormulaMatrixResourceStats: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-reset-query-resource-stats" data-pagefind-weight="1">
<summary><code>cellstore_resetQueryResourceStats</code></summary>

```ts generated
readonly cellstore_resetQueryResourceStats: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-restore-range" data-pagefind-weight="1">
<summary><code>cellstore_restoreRange</code></summary>

```ts generated
readonly cellstore_restoreRange: (a: number, b: number, c: number, d: number, e: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-row-count" data-pagefind-weight="1">
<summary><code>cellstore_rowCount</code></summary>

```ts generated
readonly cellstore_rowCount: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-search" data-pagefind-weight="1">
<summary><code>cellstore_search</code></summary>

```ts generated
readonly cellstore_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-set-block-packed" data-pagefind-weight="1">
<summary><code>cellstore_setBlockPacked</code></summary>

```ts generated
readonly cellstore_setBlockPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-bool" data-pagefind-weight="1">
<summary><code>cellstore_setBool</code></summary>

```ts generated
readonly cellstore_setBool: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-block-packed" data-pagefind-weight="1">
<summary><code>cellstore_setColumnBlockPacked</code></summary>

```ts generated
readonly cellstore_setColumnBlockPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-numbers" data-pagefind-weight="1">
<summary><code>cellstore_setColumnNumbers</code></summary>

```ts generated
readonly cellstore_setColumnNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-strings" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStrings</code></summary>

```ts generated
readonly cellstore_setColumnStrings: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-strings-packed" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStringsPacked</code></summary>

```ts generated
readonly cellstore_setColumnStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-conditional-rules" data-pagefind-weight="1">
<summary><code>cellstore_setConditionalRules</code></summary>

```ts generated
readonly cellstore_setConditionalRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-formula" data-pagefind-weight="1">
<summary><code>cellstore_setFormula</code></summary>

```ts generated
readonly cellstore_setFormula: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-named-range" data-pagefind-weight="1">
<summary><code>cellstore_setNamedRange</code></summary>

```ts generated
readonly cellstore_setNamedRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-number" data-pagefind-weight="1">
<summary><code>cellstore_setNumber</code></summary>

```ts generated
readonly cellstore_setNumber: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-sheet-name" data-pagefind-weight="1">
<summary><code>cellstore_setSheetName</code></summary>

```ts generated
readonly cellstore_setSheetName: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-sparse-block" data-pagefind-weight="1">
<summary><code>cellstore_setSparseBlock</code></summary>

```ts generated
readonly cellstore_setSparseBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-spill-blockers" data-pagefind-weight="1">
<summary><code>cellstore_setSpillBlockers</code></summary>

```ts generated
readonly cellstore_setSpillBlockers: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-string" data-pagefind-weight="1">
<summary><code>cellstore_setString</code></summary>

```ts generated
readonly cellstore_setString: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-table" data-pagefind-weight="1">
<summary><code>cellstore_setTable</code></summary>

```ts generated
readonly cellstore_setTable: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-snapshot-numbers" data-pagefind-weight="1">
<summary><code>cellstore_snapshotNumbers</code></summary>

```ts generated
readonly cellstore_snapshotNumbers: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-snapshot-texts" data-pagefind-weight="1">
<summary><code>cellstore_snapshotTexts</code></summary>

```ts generated
readonly cellstore_snapshotTexts: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-sort-rows" data-pagefind-weight="1">
<summary><code>cellstore_sortRows</code></summary>

```ts generated
readonly cellstore_sortRows: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-sort-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_sortRowsMulti</code></summary>

```ts generated
readonly cellstore_sortRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-spill-anchor-col" data-pagefind-weight="1">
<summary><code>cellstore_spillAnchorCol</code></summary>

```ts generated
readonly cellstore_spillAnchorCol: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-spill-anchor-row" data-pagefind-weight="1">
<summary><code>cellstore_spillAnchorRow</code></summary>

```ts generated
readonly cellstore_spillAnchorRow: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-spill-derived-mask" data-pagefind-weight="1">
<summary><code>cellstore_spillDerivedMask</code></summary>

```ts generated
readonly cellstore_spillDerivedMask: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-spill-owner-coordinates" data-pagefind-weight="1">
<summary><code>cellstore_spillOwnerCoordinates</code></summary>

```ts generated
readonly cellstore_spillOwnerCoordinates: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-style-id-at" data-pagefind-weight="1">
<summary><code>cellstore_styleIdAt</code></summary>

```ts generated
readonly cellstore_styleIdAt: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-wasm-committed-bytes" data-pagefind-weight="1">
<summary><code>cellstore_wasmCommittedBytes</code></summary>

```ts generated
readonly cellstore_wasmCommittedBytes: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-kinds" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeKinds</code></summary>

```ts generated
readonly distinctcolumn_takeKinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-numbers" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeNumbers</code></summary>

```ts generated
readonly distinctcolumn_takeNumbers: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-texts" data-pagefind-weight="1">
<summary><code>distinctcolumn_takeTexts</code></summary>

```ts generated
readonly distinctcolumn_takeTexts: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-function-names" data-pagefind-weight="1">
<summary><code>functionNames</code></summary>

```ts generated
readonly functionNames: () => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-byte-length" data-pagefind-weight="1">
<summary><code>rangesnapshot_byteLength</code></summary>

```ts generated
readonly rangesnapshot_byteLength: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-rangesnapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>rangesnapshot_formulaOffsets</code></summary>

```ts generated
readonly rangesnapshot_formulaOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-formula-sources" data-pagefind-weight="1">
<summary><code>rangesnapshot_formulaSources</code></summary>

```ts generated
readonly rangesnapshot_formulaSources: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-kinds" data-pagefind-weight="1">
<summary><code>rangesnapshot_kinds</code></summary>

```ts generated
readonly rangesnapshot_kinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>rangesnapshot_referenceOffsets</code></summary>

```ts generated
readonly rangesnapshot_referenceOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-reference-targets" data-pagefind-weight="1">
<summary><code>rangesnapshot_referenceTargets</code></summary>

```ts generated
readonly rangesnapshot_referenceTargets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-style-ids" data-pagefind-weight="1">
<summary><code>rangesnapshot_styleIds</code></summary>

```ts generated
readonly rangesnapshot_styleIds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-byte-length" data-pagefind-weight="1">
<summary><code>sourcesnapshot_byteLength</code></summary>

```ts generated
readonly sourcesnapshot_byteLength: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>sourcesnapshot_formulaOffsets</code></summary>

```ts generated
readonly sourcesnapshot_formulaOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-formula-sources" data-pagefind-weight="1">
<summary><code>sourcesnapshot_formulaSources</code></summary>

```ts generated
readonly sourcesnapshot_formulaSources: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>sourcesnapshot_referenceOffsets</code></summary>

```ts generated
readonly sourcesnapshot_referenceOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-reference-targets" data-pagefind-weight="1">
<summary><code>sourcesnapshot_referenceTargets</code></summary>

```ts generated
readonly sourcesnapshot_referenceTargets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-spill-derived" data-pagefind-weight="1">
<summary><code>sourcesnapshot_spillDerived</code></summary>

```ts generated
readonly sourcesnapshot_spillDerived: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-n-cols" data-pagefind-weight="1">
<summary><code>windowview_nCols</code></summary>

```ts generated
readonly windowview_nCols: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-windowview-take-strings" data-pagefind-weight="1">
<summary><code>windowview_takeStrings</code></summary>

```ts generated
readonly windowview_takeStrings: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-n-rows" data-pagefind-weight="1">
<summary><code>windowview_nRows</code></summary>

```ts generated
readonly windowview_nRows: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-windowview-take-packed" data-pagefind-weight="1">
<summary><code>windowview_takePacked</code></summary>

```ts generated
readonly windowview_takePacked: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-wbindgen-malloc" data-pagefind-weight="1">
<summary><code>__wbindgen_malloc</code></summary>

```ts generated
readonly __wbindgen_malloc: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-realloc" data-pagefind-weight="1">
<summary><code>__wbindgen_realloc</code></summary>

```ts generated
readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-externrefs" data-pagefind-weight="1">
<summary><code>__wbindgen_externrefs</code></summary>

```ts generated
readonly __wbindgen_externrefs: WebAssembly.Table;
```

</details>

<details class="api-member" id="init-output-wbindgen-free" data-pagefind-weight="1">
<summary><code>__wbindgen_free</code></summary>

```ts generated
readonly __wbindgen_free: (a: number, b: number, c: number) => void;
```

</details>

<details class="api-member" id="init-output-externref-drop-slice" data-pagefind-weight="1">
<summary><code>__externref_drop_slice</code></summary>

```ts generated
readonly __externref_drop_slice: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-externref-table-alloc" data-pagefind-weight="1">
<summary><code>__externref_table_alloc</code></summary>

```ts generated
readonly __externref_table_alloc: () => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-start" data-pagefind-weight="1">
<summary><code>__wbindgen_start</code></summary>

```ts generated
readonly __wbindgen_start: () => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_cellout_free: (a: number, b: number) => void;
  readonly __wbg_cellsnapshot_free: (a: number, b: number) => void;
  readonly __wbg_cellstore_free: (a: number, b: number) => void;
  readonly __wbg_distinctcolumn_free: (a: number, b: number) => void;
  readonly __wbg_rangesnapshot_free: (a: number, b: number) => void;
  readonly __wbg_sourcesnapshot_free: (a: number, b: number) => void;
  readonly __wbg_windowview_free: (a: number, b: number) => void;
  readonly cellout_kind: (a: number) => number;
  readonly cellout_num: (a: number) => number;
  readonly cellout_string: (a: number) => [number, number];
  readonly cellout_style: (a: number) => number;
  readonly cellsnapshot_kinds: (a: number) => [number, number];
  readonly cellsnapshot_numbers: (a: number) => [number, number];
  readonly cellsnapshot_strings: (a: number) => [number, number];
  readonly cellsnapshot_styles: (a: number) => [number, number];
  readonly cellsnapshot_textIndex: (a: number) => [number, number];
  readonly cellstore_acknowledgeRevision: (a: number, b: bigint) => void;
  readonly cellstore_addPagedSheet: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_addRows: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_addSheet: (a: number, b: number, c: number) => number;
  readonly cellstore_aggregate: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_beginMutation: (a: number) => bigint;
  readonly cellstore_beginPageLoad: (a: number) => void;
  readonly cellstore_canDirtyCell: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_captureRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_captureReferences: (
    a: number,
    b: number,
    c: number,
  ) => number;
  readonly cellstore_captureSources: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_captureSourcesForRows: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_cellSnapshots: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_cellState: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_clearCell: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => void;
  readonly cellstore_clearRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => number;
  readonly cellstore_colCount: (a: number, b: number) => number;
  readonly cellstore_columnsFullyLoaded: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_compactStringStorage: (a: number) => void;
  readonly cellstore_dataEdge: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_dataEdgeOrdered: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => number;
  readonly cellstore_dirtyRevision: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => bigint;
  readonly cellstore_distinctValues: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_endMutation: (a: number) => void;
  readonly cellstore_endPageLoad: (a: number) => void;
  readonly cellstore_filterRows: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => [number, number];
  readonly cellstore_filterRowsMulti: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
  ) => [number, number];
  readonly cellstore_formulaMatrixResourceStats: (
    a: number,
  ) => [number, number];
  readonly cellstore_formulaReadBands: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => [number, number];
  readonly cellstore_formulaSource: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number];
  readonly cellstore_getCell: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_getWindow: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_getWindowRows: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_hydratePageNumbers: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => void;
  readonly cellstore_hydratePageStringsPacked: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
  ) => void;
  readonly cellstore_insertCols: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_isFullyLoaded: (a: number, b: number) => number;
  readonly cellstore_isPaged: (a: number, b: number) => number;
  readonly cellstore_isSheetAlive: (a: number, b: number) => number;
  readonly cellstore_loadedSpans: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => [number, number];
  readonly cellstore_markCellCleanRevision: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: bigint,
  ) => number;
  readonly cellstore_markRangeClean: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_memoryStats: (a: number) => [number, number];
  readonly cellstore_new: () => number;
  readonly cellstore_pagedDirtyCoordinates: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_pagedStats: (a: number, b: number) => [number, number];
  readonly cellstore_persistedCellData: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_pinRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_poolStrings: (
    a: number,
    b: number,
    c: number,
  ) => [number, number];
  readonly cellstore_queryResourceStats: (a: number) => [number, number];
  readonly cellstore_rangeFullyLoaded: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_rangeStyleIds: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => [number, number];
  readonly cellstore_recompute: (a: number, b: number) => void;
  readonly cellstore_recomputeChanged: (a: number) => void;
  readonly cellstore_recomputeVolatile: (a: number, b: number) => number;
  readonly cellstore_referenceTarget: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number];
  readonly cellstore_referencesTargeting: (
    a: number,
    b: number,
    c: number,
  ) => [number, number];
  readonly cellstore_remapRangeStyles: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
  ) => number;
  readonly cellstore_removeCols: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_removeNamedRange: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_removeRows: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => void;
  readonly cellstore_removeSheet: (a: number, b: number) => number;
  readonly cellstore_removeTable: (a: number, b: number, c: number) => number;
  readonly cellstore_renameSheet: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => number;
  readonly cellstore_resetFormulaMatrixResourceStats: (a: number) => void;
  readonly cellstore_resetQueryResourceStats: (a: number) => void;
  readonly cellstore_restoreRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
  ) => number;
  readonly cellstore_rowCount: (a: number, b: number) => number;
  readonly cellstore_search: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => [number, number];
  readonly cellstore_setBlockPacked: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
    x: number,
  ) => number;
  readonly cellstore_setBool: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_setColumnBlockPacked: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
    x: number,
  ) => number;
  readonly cellstore_setColumnNumbers: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly cellstore_setColumnStrings: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly cellstore_setColumnStringsPacked: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => void;
  readonly cellstore_setConditionalRules: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
  ) => void;
  readonly cellstore_setFormula: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => number;
  readonly cellstore_setNamedRange: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ) => number;
  readonly cellstore_setNumber: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_setSheetName: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
  readonly cellstore_setSparseBlock: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
    q: number,
    r: number,
    s: number,
    t: number,
    u: number,
    v: number,
    w: number,
    x: number,
  ) => number;
  readonly cellstore_setSpillBlockers: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_setString: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
  ) => void;
  readonly cellstore_setTable: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: number,
  ) => number;
  readonly cellstore_snapshotNumbers: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_snapshotTexts: (
    a: number,
    b: number,
  ) => [number, number];
  readonly cellstore_sortRows: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => [number, number];
  readonly cellstore_sortRowsMulti: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
  ) => [number, number];
  readonly cellstore_spillAnchorCol: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_spillAnchorRow: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_spillDerivedMask: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => [number, number];
  readonly cellstore_spillOwnerCoordinates: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => [number, number];
  readonly cellstore_styleIdAt: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly cellstore_wasmCommittedBytes: (a: number) => number;
  readonly distinctcolumn_takeKinds: (a: number) => [number, number];
  readonly distinctcolumn_takeNumbers: (a: number) => [number, number];
  readonly distinctcolumn_takeTexts: (a: number) => [number, number];
  readonly functionNames: () => [number, number];
  readonly rangesnapshot_byteLength: (a: number) => number;
  readonly rangesnapshot_formulaOffsets: (a: number) => [number, number];
  readonly rangesnapshot_formulaSources: (a: number) => [number, number];
  readonly rangesnapshot_kinds: (a: number) => [number, number];
  readonly rangesnapshot_referenceOffsets: (a: number) => [number, number];
  readonly rangesnapshot_referenceTargets: (a: number) => [number, number];
  readonly rangesnapshot_styleIds: (a: number) => [number, number];
  readonly sourcesnapshot_byteLength: (a: number) => number;
  readonly sourcesnapshot_formulaOffsets: (a: number) => [number, number];
  readonly sourcesnapshot_formulaSources: (a: number) => [number, number];
  readonly sourcesnapshot_referenceOffsets: (a: number) => [number, number];
  readonly sourcesnapshot_referenceTargets: (a: number) => [number, number];
  readonly sourcesnapshot_spillDerived: (a: number) => [number, number];
  readonly windowview_nCols: (a: number) => number;
  readonly windowview_takeStrings: (a: number) => [number, number];
  readonly windowview_nRows: (a: number) => number;
  readonly windowview_takePacked: (a: number) => [number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_start: () => void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>InitOutput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-sync/"><code>initSync</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-sync/"><code>initSync</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
