---
title: "InitOutput | @sheetwrite/wasm"
description: "Result of module initialization: the instantiated exports plus the shared linear memory."
---
<!-- api-export:@sheetwrite/wasm|.|InitOutput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="interface">interface</span></div>

Result of module initialization: the instantiated exports plus the shared linear memory.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L386</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#init-output-memory"><code>memory</code></a>
<a href="#init-output-wbg-cellout-free"><code>__wbg_cellout_free</code></a>
<a href="#init-output-wbg-cellstore-free"><code>__wbg_cellstore_free</code></a>
<a href="#init-output-wbg-distinctcolumn-free"><code>__wbg_distinctcolumn_free</code></a>
<a href="#init-output-wbg-rangesnapshot-free"><code>__wbg_rangesnapshot_free</code></a>
<a href="#init-output-wbg-sourcesnapshot-free"><code>__wbg_sourcesnapshot_free</code></a>
<a href="#init-output-wbg-windowview-free"><code>__wbg_windowview_free</code></a>
<a href="#init-output-cellout-kind"><code>cellout_kind</code></a>
<a href="#init-output-cellout-num"><code>cellout_num</code></a>
<a href="#init-output-cellout-string"><code>cellout_string</code></a>
<a href="#init-output-cellout-style"><code>cellout_style</code></a>
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
<a href="#init-output-cellstore-set-block"><code>cellstore_setBlock</code></a>
<a href="#init-output-cellstore-set-bool"><code>cellstore_setBool</code></a>
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
<a href="#init-output-windowview-take-packed"><code>windowview_takePacked</code></a>
<a href="#init-output-windowview-n-rows"><code>windowview_nRows</code></a>
<a href="#init-output-wbindgen-malloc"><code>__wbindgen_malloc</code></a>
<a href="#init-output-wbindgen-realloc"><code>__wbindgen_realloc</code></a>
<a href="#init-output-wbindgen-externrefs"><code>__wbindgen_externrefs</code></a>
<a href="#init-output-wbindgen-free"><code>__wbindgen_free</code></a>
<a href="#init-output-externref-table-alloc"><code>__externref_table_alloc</code></a>
<a href="#init-output-externref-drop-slice"><code>__externref_drop_slice</code></a>
<a href="#init-output-wbindgen-start"><code>__wbindgen_start</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>128</span>

<div class="api-member-list">

<details class="api-member" id="init-output-memory" data-pagefind-weight="1" open>
<summary><code>memory</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly memory: WebAssembly.Memory;" data-pagefind-ignore>Copy</button>

```ts generated
readonly memory: WebAssembly.Memory;
```

</details>

<details class="api-member" id="init-output-wbg-cellout-free" data-pagefind-weight="1" open>
<summary><code>__wbg_cellout_free</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbg_cellout_free: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbg_cellout_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-cellstore-free" data-pagefind-weight="1" open>
<summary><code>__wbg_cellstore_free</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbg_cellstore_free: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbg_cellstore_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-distinctcolumn-free" data-pagefind-weight="1" open>
<summary><code>__wbg_distinctcolumn_free</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbg_distinctcolumn_free: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbg_distinctcolumn_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-rangesnapshot-free" data-pagefind-weight="1" open>
<summary><code>__wbg_rangesnapshot_free</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbg_rangesnapshot_free: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbg_rangesnapshot_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-sourcesnapshot-free" data-pagefind-weight="1" open>
<summary><code>__wbg_sourcesnapshot_free</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbg_sourcesnapshot_free: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbg_sourcesnapshot_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbg-windowview-free" data-pagefind-weight="1" open>
<summary><code>__wbg_windowview_free</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbg_windowview_free: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbg_windowview_free: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-cellout-kind" data-pagefind-weight="1" open>
<summary><code>cellout_kind</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellout_kind: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellout_kind: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellout-num" data-pagefind-weight="1" open>
<summary><code>cellout_num</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellout_num: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellout_num: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellout-string" data-pagefind-weight="1" open>
<summary><code>cellout_string</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellout_string: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellout_string: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellout-style" data-pagefind-weight="1" open>
<summary><code>cellout_style</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellout_style: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellout_style: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-acknowledge-revision" data-pagefind-weight="1" open>
<summary><code>cellstore_acknowledgeRevision</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_acknowledgeRevision: (a: number, b: bigint) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_acknowledgeRevision: (a: number, b: bigint) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-add-paged-sheet" data-pagefind-weight="1">
<summary><code>cellstore_addPagedSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_addPagedSheet: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_addPagedSheet: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-add-rows" data-pagefind-weight="1" open>
<summary><code>cellstore_addRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_addRows: (a: number, b: number, c: number, d: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_addRows: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-add-sheet" data-pagefind-weight="1" open>
<summary><code>cellstore_addSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_addSheet: (a: number, b: number, c: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_addSheet: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-aggregate" data-pagefind-weight="1" open>
<summary><code>cellstore_aggregate</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_aggregate: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_aggregate: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-begin-mutation" data-pagefind-weight="1" open>
<summary><code>cellstore_beginMutation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_beginMutation: (a: number) =&gt; bigint;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_beginMutation: (a: number) => bigint;
```

</details>

<details class="api-member" id="init-output-cellstore-begin-page-load" data-pagefind-weight="1" open>
<summary><code>cellstore_beginPageLoad</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_beginPageLoad: (a: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_beginPageLoad: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-can-dirty-cell" data-pagefind-weight="1" open>
<summary><code>cellstore_canDirtyCell</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_canDirtyCell: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_canDirtyCell: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-range" data-pagefind-weight="1">
<summary><code>cellstore_captureRange</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_captureRange: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_captureRange: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-references" data-pagefind-weight="1" open>
<summary><code>cellstore_captureReferences</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_captureReferences: (a: number, b: number, c: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_captureReferences: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-sources" data-pagefind-weight="1">
<summary><code>cellstore_captureSources</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_captureSources: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_captureSources: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-capture-sources-for-rows" data-pagefind-weight="1">
<summary><code>cellstore_captureSourcesForRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_captureSourcesForRows: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_captureSourcesForRows: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-cell-state" data-pagefind-weight="1" open>
<summary><code>cellstore_cellState</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_cellState: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_cellState: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-clear-cell" data-pagefind-weight="1" open>
<summary><code>cellstore_clearCell</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_clearCell: (a: number, b: number, c: number, d: number, e: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_clearCell: (a: number, b: number, c: number, d: number, e: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-clear-range" data-pagefind-weight="1">
<summary><code>cellstore_clearRange</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_clearRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_clearRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-col-count" data-pagefind-weight="1" open>
<summary><code>cellstore_colCount</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_colCount: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_colCount: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-columns-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_columnsFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_columnsFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_columnsFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-compact-string-storage" data-pagefind-weight="1" open>
<summary><code>cellstore_compactStringStorage</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_compactStringStorage: (a: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_compactStringStorage: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-data-edge" data-pagefind-weight="1">
<summary><code>cellstore_dataEdge</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_dataEdge: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_dataEdge: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-data-edge-ordered" data-pagefind-weight="1">
<summary><code>cellstore_dataEdgeOrdered</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_dataEdgeOrdered: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_dataEdgeOrdered: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-dirty-revision" data-pagefind-weight="1" open>
<summary><code>cellstore_dirtyRevision</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_dirtyRevision: (a: number, b: number, c: number, d: number) =&gt; bigint;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_dirtyRevision: (a: number, b: number, c: number, d: number) => bigint;
```

</details>

<details class="api-member" id="init-output-cellstore-distinct-values" data-pagefind-weight="1" open>
<summary><code>cellstore_distinctValues</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_distinctValues: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_distinctValues: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-end-mutation" data-pagefind-weight="1" open>
<summary><code>cellstore_endMutation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_endMutation: (a: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_endMutation: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-end-page-load" data-pagefind-weight="1" open>
<summary><code>cellstore_endPageLoad</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_endPageLoad: (a: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_endPageLoad: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-filter-rows" data-pagefind-weight="1">
<summary><code>cellstore_filterRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_filterRows: (a: number, b: number, c: number, d: number, e: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_filterRows: (a: number, b: number, c: number, d: number, e: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-filter-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_filterRowsMulti</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_filterRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_filterRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-formula-matrix-resource-stats" data-pagefind-weight="1" open>
<summary><code>cellstore_formulaMatrixResourceStats</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_formulaMatrixResourceStats: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_formulaMatrixResourceStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-formula-source" data-pagefind-weight="1" open>
<summary><code>cellstore_formulaSource</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_formulaSource: (a: number, b: number, c: number, d: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_formulaSource: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-get-cell" data-pagefind-weight="1" open>
<summary><code>cellstore_getCell</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_getCell: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_getCell: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-get-window" data-pagefind-weight="1">
<summary><code>cellstore_getWindow</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_getWindow: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_getWindow: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-get-window-rows" data-pagefind-weight="1">
<summary><code>cellstore_getWindowRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_getWindowRows: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_getWindowRows: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-hydrate-page-numbers" data-pagefind-weight="1">
<summary><code>cellstore_hydratePageNumbers</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_hydratePageNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_hydratePageNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-hydrate-page-strings-packed" data-pagefind-weight="1">
<summary><code>cellstore_hydratePageStringsPacked</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_hydratePageStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_hydratePageStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-insert-cols" data-pagefind-weight="1" open>
<summary><code>cellstore_insertCols</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_insertCols: (a: number, b: number, c: number, d: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_insertCols: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-is-fully-loaded" data-pagefind-weight="1" open>
<summary><code>cellstore_isFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_isFullyLoaded: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_isFullyLoaded: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-is-paged" data-pagefind-weight="1" open>
<summary><code>cellstore_isPaged</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_isPaged: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_isPaged: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-is-sheet-alive" data-pagefind-weight="1" open>
<summary><code>cellstore_isSheetAlive</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_isSheetAlive: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_isSheetAlive: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-mark-cell-clean-revision" data-pagefind-weight="1">
<summary><code>cellstore_markCellCleanRevision</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_markCellCleanRevision: (a: number, b: number, c: number, d: number, e: bigint) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_markCellCleanRevision: (a: number, b: number, c: number, d: number, e: bigint) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-mark-range-clean" data-pagefind-weight="1">
<summary><code>cellstore_markRangeClean</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_markRangeClean: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_markRangeClean: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-memory-stats" data-pagefind-weight="1" open>
<summary><code>cellstore_memoryStats</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_memoryStats: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_memoryStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-new" data-pagefind-weight="1" open>
<summary><code>cellstore_new</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_new: () =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_new: () => number;
```

</details>

<details class="api-member" id="init-output-cellstore-paged-dirty-coordinates" data-pagefind-weight="1" open>
<summary><code>cellstore_pagedDirtyCoordinates</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_pagedDirtyCoordinates: (a: number, b: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_pagedDirtyCoordinates: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-paged-stats" data-pagefind-weight="1" open>
<summary><code>cellstore_pagedStats</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_pagedStats: (a: number, b: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_pagedStats: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-persisted-cell-data" data-pagefind-weight="1" open>
<summary><code>cellstore_persistedCellData</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_persistedCellData: (a: number, b: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_persistedCellData: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-pin-range" data-pagefind-weight="1">
<summary><code>cellstore_pinRange</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_pinRange: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_pinRange: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-pool-strings" data-pagefind-weight="1" open>
<summary><code>cellstore_poolStrings</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_poolStrings: (a: number, b: number, c: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_poolStrings: (a: number, b: number, c: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-query-resource-stats" data-pagefind-weight="1" open>
<summary><code>cellstore_queryResourceStats</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_queryResourceStats: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_queryResourceStats: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-range-fully-loaded" data-pagefind-weight="1">
<summary><code>cellstore_rangeFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_rangeFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_rangeFullyLoaded: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-range-style-ids" data-pagefind-weight="1">
<summary><code>cellstore_rangeStyleIds</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_rangeStyleIds: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_rangeStyleIds: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-recompute" data-pagefind-weight="1" open>
<summary><code>cellstore_recompute</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_recompute: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_recompute: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-recompute-changed" data-pagefind-weight="1" open>
<summary><code>cellstore_recomputeChanged</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_recomputeChanged: (a: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_recomputeChanged: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-recompute-volatile" data-pagefind-weight="1" open>
<summary><code>cellstore_recomputeVolatile</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_recomputeVolatile: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_recomputeVolatile: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-reference-target" data-pagefind-weight="1">
<summary><code>cellstore_referenceTarget</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_referenceTarget: (a: number, b: number, c: number, d: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_referenceTarget: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-references-targeting" data-pagefind-weight="1" open>
<summary><code>cellstore_referencesTargeting</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_referencesTargeting: (a: number, b: number, c: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_referencesTargeting: (a: number, b: number, c: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-remap-range-styles" data-pagefind-weight="1">
<summary><code>cellstore_remapRangeStyles</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_remapRangeStyles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_remapRangeStyles: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-cols" data-pagefind-weight="1" open>
<summary><code>cellstore_removeCols</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_removeCols: (a: number, b: number, c: number, d: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_removeCols: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-named-range" data-pagefind-weight="1" open>
<summary><code>cellstore_removeNamedRange</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_removeNamedRange: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_removeNamedRange: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-rows" data-pagefind-weight="1" open>
<summary><code>cellstore_removeRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_removeRows: (a: number, b: number, c: number, d: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_removeRows: (a: number, b: number, c: number, d: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-sheet" data-pagefind-weight="1" open>
<summary><code>cellstore_removeSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_removeSheet: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_removeSheet: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-remove-table" data-pagefind-weight="1" open>
<summary><code>cellstore_removeTable</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_removeTable: (a: number, b: number, c: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_removeTable: (a: number, b: number, c: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-rename-sheet" data-pagefind-weight="1">
<summary><code>cellstore_renameSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_renameSheet: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_renameSheet: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-reset-formula-matrix-resource-stats" data-pagefind-weight="1" open>
<summary><code>cellstore_resetFormulaMatrixResourceStats</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_resetFormulaMatrixResourceStats: (a: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_resetFormulaMatrixResourceStats: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-reset-query-resource-stats" data-pagefind-weight="1" open>
<summary><code>cellstore_resetQueryResourceStats</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_resetQueryResourceStats: (a: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_resetQueryResourceStats: (a: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-restore-range" data-pagefind-weight="1" open>
<summary><code>cellstore_restoreRange</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_restoreRange: (a: number, b: number, c: number, d: number, e: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_restoreRange: (a: number, b: number, c: number, d: number, e: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-row-count" data-pagefind-weight="1" open>
<summary><code>cellstore_rowCount</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_rowCount: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_rowCount: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-search" data-pagefind-weight="1">
<summary><code>cellstore_search</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_search: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-set-block" data-pagefind-weight="1">
<summary><code>cellstore_setBlock</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-bool" data-pagefind-weight="1">
<summary><code>cellstore_setBool</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setBool: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setBool: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-numbers" data-pagefind-weight="1">
<summary><code>cellstore_setColumnNumbers</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setColumnNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setColumnNumbers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-strings" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStrings</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setColumnStrings: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setColumnStrings: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-column-strings-packed" data-pagefind-weight="1">
<summary><code>cellstore_setColumnStringsPacked</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setColumnStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setColumnStringsPacked: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-conditional-rules" data-pagefind-weight="1">
<summary><code>cellstore_setConditionalRules</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setConditionalRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setConditionalRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-formula" data-pagefind-weight="1">
<summary><code>cellstore_setFormula</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setFormula: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setFormula: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-named-range" data-pagefind-weight="1">
<summary><code>cellstore_setNamedRange</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setNamedRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setNamedRange: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-number" data-pagefind-weight="1">
<summary><code>cellstore_setNumber</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setNumber: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setNumber: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-sheet-name" data-pagefind-weight="1">
<summary><code>cellstore_setSheetName</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setSheetName: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setSheetName: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-sparse-block" data-pagefind-weight="1">
<summary><code>cellstore_setSparseBlock</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setSparseBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setSparseBlock: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-spill-blockers" data-pagefind-weight="1" open>
<summary><code>cellstore_setSpillBlockers</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setSpillBlockers: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setSpillBlockers: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-set-string" data-pagefind-weight="1">
<summary><code>cellstore_setString</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setString: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setString: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
```

</details>

<details class="api-member" id="init-output-cellstore-set-table" data-pagefind-weight="1">
<summary><code>cellstore_setTable</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_setTable: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_setTable: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-snapshot-numbers" data-pagefind-weight="1" open>
<summary><code>cellstore_snapshotNumbers</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_snapshotNumbers: (a: number, b: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_snapshotNumbers: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-snapshot-texts" data-pagefind-weight="1" open>
<summary><code>cellstore_snapshotTexts</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_snapshotTexts: (a: number, b: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_snapshotTexts: (a: number, b: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-sort-rows" data-pagefind-weight="1" open>
<summary><code>cellstore_sortRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_sortRows: (a: number, b: number, c: number, d: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_sortRows: (a: number, b: number, c: number, d: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-sort-rows-multi" data-pagefind-weight="1">
<summary><code>cellstore_sortRowsMulti</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_sortRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_sortRowsMulti: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-spill-anchor-col" data-pagefind-weight="1" open>
<summary><code>cellstore_spillAnchorCol</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_spillAnchorCol: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_spillAnchorCol: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-spill-anchor-row" data-pagefind-weight="1" open>
<summary><code>cellstore_spillAnchorRow</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_spillAnchorRow: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_spillAnchorRow: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-spill-derived-mask" data-pagefind-weight="1">
<summary><code>cellstore_spillDerivedMask</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_spillDerivedMask: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_spillDerivedMask: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-spill-owner-coordinates" data-pagefind-weight="1">
<summary><code>cellstore_spillOwnerCoordinates</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_spillOwnerCoordinates: (a: number, b: number, c: number, d: number, e: number, f: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_spillOwnerCoordinates: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-cellstore-style-id-at" data-pagefind-weight="1" open>
<summary><code>cellstore_styleIdAt</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_styleIdAt: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_styleIdAt: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-cellstore-wasm-committed-bytes" data-pagefind-weight="1" open>
<summary><code>cellstore_wasmCommittedBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cellstore_wasmCommittedBytes: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cellstore_wasmCommittedBytes: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-kinds" data-pagefind-weight="1" open>
<summary><code>distinctcolumn_takeKinds</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly distinctcolumn_takeKinds: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly distinctcolumn_takeKinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-numbers" data-pagefind-weight="1" open>
<summary><code>distinctcolumn_takeNumbers</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly distinctcolumn_takeNumbers: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly distinctcolumn_takeNumbers: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-distinctcolumn-take-texts" data-pagefind-weight="1" open>
<summary><code>distinctcolumn_takeTexts</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly distinctcolumn_takeTexts: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly distinctcolumn_takeTexts: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-byte-length" data-pagefind-weight="1" open>
<summary><code>rangesnapshot_byteLength</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rangesnapshot_byteLength: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly rangesnapshot_byteLength: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-rangesnapshot-formula-offsets" data-pagefind-weight="1" open>
<summary><code>rangesnapshot_formulaOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rangesnapshot_formulaOffsets: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly rangesnapshot_formulaOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-formula-sources" data-pagefind-weight="1" open>
<summary><code>rangesnapshot_formulaSources</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rangesnapshot_formulaSources: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly rangesnapshot_formulaSources: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-kinds" data-pagefind-weight="1" open>
<summary><code>rangesnapshot_kinds</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rangesnapshot_kinds: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly rangesnapshot_kinds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-reference-offsets" data-pagefind-weight="1" open>
<summary><code>rangesnapshot_referenceOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rangesnapshot_referenceOffsets: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly rangesnapshot_referenceOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-reference-targets" data-pagefind-weight="1" open>
<summary><code>rangesnapshot_referenceTargets</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rangesnapshot_referenceTargets: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly rangesnapshot_referenceTargets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-rangesnapshot-style-ids" data-pagefind-weight="1" open>
<summary><code>rangesnapshot_styleIds</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rangesnapshot_styleIds: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly rangesnapshot_styleIds: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-byte-length" data-pagefind-weight="1" open>
<summary><code>sourcesnapshot_byteLength</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sourcesnapshot_byteLength: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly sourcesnapshot_byteLength: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-formula-offsets" data-pagefind-weight="1" open>
<summary><code>sourcesnapshot_formulaOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sourcesnapshot_formulaOffsets: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly sourcesnapshot_formulaOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-formula-sources" data-pagefind-weight="1" open>
<summary><code>sourcesnapshot_formulaSources</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sourcesnapshot_formulaSources: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly sourcesnapshot_formulaSources: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-reference-offsets" data-pagefind-weight="1" open>
<summary><code>sourcesnapshot_referenceOffsets</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sourcesnapshot_referenceOffsets: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly sourcesnapshot_referenceOffsets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-reference-targets" data-pagefind-weight="1" open>
<summary><code>sourcesnapshot_referenceTargets</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sourcesnapshot_referenceTargets: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly sourcesnapshot_referenceTargets: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-sourcesnapshot-spill-derived" data-pagefind-weight="1" open>
<summary><code>sourcesnapshot_spillDerived</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sourcesnapshot_spillDerived: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly sourcesnapshot_spillDerived: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-n-cols" data-pagefind-weight="1" open>
<summary><code>windowview_nCols</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly windowview_nCols: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly windowview_nCols: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-windowview-take-strings" data-pagefind-weight="1" open>
<summary><code>windowview_takeStrings</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly windowview_takeStrings: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly windowview_takeStrings: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-take-packed" data-pagefind-weight="1" open>
<summary><code>windowview_takePacked</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly windowview_takePacked: (a: number) =&gt; [number, number];" data-pagefind-ignore>Copy</button>

```ts generated
readonly windowview_takePacked: (a: number) => [number, number];
```

</details>

<details class="api-member" id="init-output-windowview-n-rows" data-pagefind-weight="1" open>
<summary><code>windowview_nRows</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly windowview_nRows: (a: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly windowview_nRows: (a: number) => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-malloc" data-pagefind-weight="1" open>
<summary><code>__wbindgen_malloc</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbindgen_malloc: (a: number, b: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbindgen_malloc: (a: number, b: number) => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-realloc" data-pagefind-weight="1" open>
<summary><code>__wbindgen_realloc</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
```

</details>

<details class="api-member" id="init-output-wbindgen-externrefs" data-pagefind-weight="1" open>
<summary><code>__wbindgen_externrefs</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbindgen_externrefs: WebAssembly.Table;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbindgen_externrefs: WebAssembly.Table;
```

</details>

<details class="api-member" id="init-output-wbindgen-free" data-pagefind-weight="1" open>
<summary><code>__wbindgen_free</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbindgen_free: (a: number, b: number, c: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbindgen_free: (a: number, b: number, c: number) => void;
```

</details>

<details class="api-member" id="init-output-externref-table-alloc" data-pagefind-weight="1" open>
<summary><code>__externref_table_alloc</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __externref_table_alloc: () =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __externref_table_alloc: () => number;
```

</details>

<details class="api-member" id="init-output-externref-drop-slice" data-pagefind-weight="1" open>
<summary><code>__externref_drop_slice</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __externref_drop_slice: (a: number, b: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __externref_drop_slice: (a: number, b: number) => void;
```

</details>

<details class="api-member" id="init-output-wbindgen-start" data-pagefind-weight="1" open>
<summary><code>__wbindgen_start</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly __wbindgen_start: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
readonly __wbindgen_start: () => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface InitOutput {&#10;  readonly memory: WebAssembly.Memory;&#10;  readonly __wbg_cellout_free: (a: number, b: number) =&gt; void;&#10;  readonly __wbg_cellstore_free: (a: number, b: number) =&gt; void;&#10;  readonly __wbg_distinctcolumn_free: (a: number, b: number) =&gt; void;&#10;  readonly __wbg_rangesnapshot_free: (a: number, b: number) =&gt; void;&#10;  readonly __wbg_sourcesnapshot_free: (a: number, b: number) =&gt; void;&#10;  readonly __wbg_windowview_free: (a: number, b: number) =&gt; void;&#10;  readonly cellout_kind: (a: number) =&gt; number;&#10;  readonly cellout_num: (a: number) =&gt; number;&#10;  readonly cellout_string: (a: number) =&gt; [number, number];&#10;  readonly cellout_style: (a: number) =&gt; number;&#10;  readonly cellstore_acknowledgeRevision: (a: number, b: bigint) =&gt; void;&#10;  readonly cellstore_addPagedSheet: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_addRows: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_addSheet: (a: number, b: number, c: number) =&gt; number;&#10;  readonly cellstore_aggregate: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_beginMutation: (a: number) =&gt; bigint;&#10;  readonly cellstore_beginPageLoad: (a: number) =&gt; void;&#10;  readonly cellstore_canDirtyCell: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_captureRange: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_captureReferences: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_captureSources: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_captureSourcesForRows: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_cellState: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_clearCell: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_clearRange: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_colCount: (a: number, b: number) =&gt; number;&#10;  readonly cellstore_columnsFullyLoaded: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_compactStringStorage: (a: number) =&gt; void;&#10;  readonly cellstore_dataEdge: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_dataEdgeOrdered: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_dirtyRevision: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; bigint;&#10;  readonly cellstore_distinctValues: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_endMutation: (a: number) =&gt; void;&#10;  readonly cellstore_endPageLoad: (a: number) =&gt; void;&#10;  readonly cellstore_filterRows: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_filterRowsMulti: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;    j: number,&#10;    k: number,&#10;    l: number,&#10;    m: number,&#10;    n: number,&#10;    o: number,&#10;    p: number,&#10;    q: number,&#10;    r: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_formulaMatrixResourceStats: (&#10;    a: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_formulaSource: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_getCell: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_getWindow: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_getWindowRows: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_hydratePageNumbers: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_hydratePageStringsPacked: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;    j: number,&#10;    k: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_insertCols: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_isFullyLoaded: (a: number, b: number) =&gt; number;&#10;  readonly cellstore_isPaged: (a: number, b: number) =&gt; number;&#10;  readonly cellstore_isSheetAlive: (a: number, b: number) =&gt; number;&#10;  readonly cellstore_markCellCleanRevision: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: bigint,&#10;  ) =&gt; number;&#10;  readonly cellstore_markRangeClean: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_memoryStats: (a: number) =&gt; [number, number];&#10;  readonly cellstore_new: () =&gt; number;&#10;  readonly cellstore_pagedDirtyCoordinates: (&#10;    a: number,&#10;    b: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_pagedStats: (a: number, b: number) =&gt; [number, number];&#10;  readonly cellstore_persistedCellData: (&#10;    a: number,&#10;    b: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_pinRange: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_poolStrings: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_queryResourceStats: (a: number) =&gt; [number, number];&#10;  readonly cellstore_rangeFullyLoaded: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_rangeStyleIds: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_recompute: (a: number, b: number) =&gt; void;&#10;  readonly cellstore_recomputeChanged: (a: number) =&gt; void;&#10;  readonly cellstore_recomputeVolatile: (a: number, b: number) =&gt; number;&#10;  readonly cellstore_referenceTarget: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_referencesTargeting: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_remapRangeStyles: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;    j: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_removeCols: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_removeNamedRange: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_removeRows: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_removeSheet: (a: number, b: number) =&gt; number;&#10;  readonly cellstore_removeTable: (a: number, b: number, c: number) =&gt; number;&#10;  readonly cellstore_renameSheet: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_resetFormulaMatrixResourceStats: (a: number) =&gt; void;&#10;  readonly cellstore_resetQueryResourceStats: (a: number) =&gt; void;&#10;  readonly cellstore_restoreRange: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_rowCount: (a: number, b: number) =&gt; number;&#10;  readonly cellstore_search: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_setBlock: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;    j: number,&#10;    k: number,&#10;    l: number,&#10;    m: number,&#10;    n: number,&#10;    o: number,&#10;    p: number,&#10;    q: number,&#10;    r: number,&#10;    s: number,&#10;    t: number,&#10;    u: number,&#10;    v: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_setBool: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setColumnNumbers: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setColumnStrings: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setColumnStringsPacked: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setConditionalRules: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;    j: number,&#10;    k: number,&#10;    l: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setFormula: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_setNamedRange: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_setNumber: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setSheetName: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setSparseBlock: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;    j: number,&#10;    k: number,&#10;    l: number,&#10;    m: number,&#10;    n: number,&#10;    o: number,&#10;    p: number,&#10;    q: number,&#10;    r: number,&#10;    s: number,&#10;    t: number,&#10;    u: number,&#10;    v: number,&#10;    w: number,&#10;    x: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_setSpillBlockers: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_setString: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;  ) =&gt; void;&#10;  readonly cellstore_setTable: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;    i: number,&#10;    j: number,&#10;    k: number,&#10;    l: number,&#10;    m: number,&#10;    n: number,&#10;    o: number,&#10;    p: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_snapshotNumbers: (&#10;    a: number,&#10;    b: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_snapshotTexts: (&#10;    a: number,&#10;    b: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_sortRows: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_sortRowsMulti: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;    g: number,&#10;    h: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_spillAnchorCol: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_spillAnchorRow: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_spillDerivedMask: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_spillOwnerCoordinates: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;    e: number,&#10;    f: number,&#10;  ) =&gt; [number, number];&#10;  readonly cellstore_styleIdAt: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly cellstore_wasmCommittedBytes: (a: number) =&gt; number;&#10;  readonly distinctcolumn_takeKinds: (a: number) =&gt; [number, number];&#10;  readonly distinctcolumn_takeNumbers: (a: number) =&gt; [number, number];&#10;  readonly distinctcolumn_takeTexts: (a: number) =&gt; [number, number];&#10;  readonly rangesnapshot_byteLength: (a: number) =&gt; number;&#10;  readonly rangesnapshot_formulaOffsets: (a: number) =&gt; [number, number];&#10;  readonly rangesnapshot_formulaSources: (a: number) =&gt; [number, number];&#10;  readonly rangesnapshot_kinds: (a: number) =&gt; [number, number];&#10;  readonly rangesnapshot_referenceOffsets: (a: number) =&gt; [number, number];&#10;  readonly rangesnapshot_referenceTargets: (a: number) =&gt; [number, number];&#10;  readonly rangesnapshot_styleIds: (a: number) =&gt; [number, number];&#10;  readonly sourcesnapshot_byteLength: (a: number) =&gt; number;&#10;  readonly sourcesnapshot_formulaOffsets: (a: number) =&gt; [number, number];&#10;  readonly sourcesnapshot_formulaSources: (a: number) =&gt; [number, number];&#10;  readonly sourcesnapshot_referenceOffsets: (a: number) =&gt; [number, number];&#10;  readonly sourcesnapshot_referenceTargets: (a: number) =&gt; [number, number];&#10;  readonly sourcesnapshot_spillDerived: (a: number) =&gt; [number, number];&#10;  readonly windowview_nCols: (a: number) =&gt; number;&#10;  readonly windowview_takeStrings: (a: number) =&gt; [number, number];&#10;  readonly windowview_takePacked: (a: number) =&gt; [number, number];&#10;  readonly windowview_nRows: (a: number) =&gt; number;&#10;  readonly __wbindgen_malloc: (a: number, b: number) =&gt; number;&#10;  readonly __wbindgen_realloc: (&#10;    a: number,&#10;    b: number,&#10;    c: number,&#10;    d: number,&#10;  ) =&gt; number;&#10;  readonly __wbindgen_externrefs: WebAssembly.Table;&#10;  readonly __wbindgen_free: (a: number, b: number, c: number) =&gt; void;&#10;  readonly __externref_table_alloc: () =&gt; number;&#10;  readonly __externref_drop_slice: (a: number, b: number) =&gt; void;&#10;  readonly __wbindgen_start: () =&gt; void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_cellout_free: (a: number, b: number) => void;
  readonly __wbg_cellstore_free: (a: number, b: number) => void;
  readonly __wbg_distinctcolumn_free: (a: number, b: number) => void;
  readonly __wbg_rangesnapshot_free: (a: number, b: number) => void;
  readonly __wbg_sourcesnapshot_free: (a: number, b: number) => void;
  readonly __wbg_windowview_free: (a: number, b: number) => void;
  readonly cellout_kind: (a: number) => number;
  readonly cellout_num: (a: number) => number;
  readonly cellout_string: (a: number) => [number, number];
  readonly cellout_style: (a: number) => number;
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
  readonly cellstore_setBlock: (
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
  ) => number;
  readonly cellstore_setBool: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) => void;
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
  readonly windowview_takePacked: (a: number) => [number, number];
  readonly windowview_nRows: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_start: () => void;
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

<p class="api-consumers-label">Public exports naming <code>InitOutput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/wasm/init-sync/"><code>initSync</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
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
