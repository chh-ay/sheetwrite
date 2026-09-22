---
title: "SheetwriteStore | @sheetwrite/core"
description: "Stable public facade and the sole transaction, epoch, policy, and event barrier."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteStore -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Stable public facade and the sole transaction, epoch, policy, and event barrier.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/store.ts#L103</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-store-constructor"><code>constructor</code></a>
<a href="#sheetwrite-store-acknowledge-operations"><code>acknowledgeOperations</code></a>
<a href="#sheetwrite-store-aggregate"><code>aggregate</code></a>
<a href="#sheetwrite-store-apply-transaction"><code>applyTransaction</code></a>
<a href="#sheetwrite-store-are-columns-fully-loaded"><code>areColumnsFullyLoaded</code></a>
<a href="#sheetwrite-store-can-apply-locally"><code>canApplyLocally</code></a>
<a href="#sheetwrite-store-capture-range-history"><code>captureRangeHistory</code></a>
<a href="#sheetwrite-store-clear-view"><code>clearView</code></a>
<a href="#sheetwrite-store-column-filters"><code>columnFilters</code></a>
<a href="#sheetwrite-store-data-edge"><code>dataEdge</code></a>
<a href="#sheetwrite-store-data-row-at"><code>dataRowAt</code></a>
<a href="#sheetwrite-store-dispose"><code>dispose</code></a>
<a href="#sheetwrite-store-distinct-values"><code>distinctValues</code></a>
<a href="#sheetwrite-store-ensure-columns"><code>ensureColumns</code></a>
<a href="#sheetwrite-store-export-snapshot"><code>exportSnapshot</code></a>
<a href="#sheetwrite-store-filter-by"><code>filterBy</code></a>
<a href="#sheetwrite-store-get-cell"><code>getCell</code></a>
<a href="#sheetwrite-store-get-cell-load-state"><code>getCellLoadState</code></a>
<a href="#sheetwrite-store-get-clipboard-window"><code>getClipboardWindow</code></a>
<a href="#sheetwrite-store-get-data-window"><code>getDataWindow</code></a>
<a href="#sheetwrite-store-get-formula"><code>getFormula</code></a>
<a href="#sheetwrite-store-get-formula-matrix-resource-peak"><code>getFormulaMatrixResourcePeak</code></a>
<a href="#sheetwrite-store-get-paged-stats"><code>getPagedStats</code></a>
<a href="#sheetwrite-store-get-range-mutation-allocation-stats"><code>getRangeMutationAllocationStats</code></a>
<a href="#sheetwrite-store-get-ref-target"><code>getRefTarget</code></a>
<a href="#sheetwrite-store-get-runtime-resource-snapshot"><code>getRuntimeResourceSnapshot</code></a>
<a href="#sheetwrite-store-get-spill-anchor"><code>getSpillAnchor</code></a>
<a href="#sheetwrite-store-get-visible-window"><code>getVisibleWindow</code></a>
<a href="#sheetwrite-store-get-workbook"><code>getWorkbook</code></a>
<a href="#sheetwrite-store-group-rows"><code>groupRows</code></a>
<a href="#sheetwrite-store-has-view"><code>hasView</code></a>
<a href="#sheetwrite-store-hidden-rows"><code>hiddenRows</code></a>
<a href="#sheetwrite-store-hide-rows"><code>hideRows</code></a>
<a href="#sheetwrite-store-is-paged"><code>isPaged</code></a>
<a href="#sheetwrite-store-is-range-fully-loaded"><code>isRangeFullyLoaded</code></a>
<a href="#sheetwrite-store-load-page"><code>loadPage</code></a>
<a href="#sheetwrite-store-on"><code>on</code></a>
<a href="#sheetwrite-store-query-capability"><code>queryCapability</code></a>
<a href="#sheetwrite-store-recalculate-volatile"><code>recalculateVolatile</code></a>
<a href="#sheetwrite-store-remove-sheet-formula-identity"><code>removeSheetFormulaIdentity</code></a>
<a href="#sheetwrite-store-rename-sheet-formula-identity"><code>renameSheetFormulaIdentity</code></a>
<a href="#sheetwrite-store-reset-formula-matrix-resource-peak"><code>resetFormulaMatrixResourcePeak</code></a>
<a href="#sheetwrite-store-reset-range-mutation-allocation-stats"><code>resetRangeMutationAllocationStats</code></a>
<a href="#sheetwrite-store-reset-runtime-resource-accounting"><code>resetRuntimeResourceAccounting</code></a>
<a href="#sheetwrite-store-row-groups"><code>rowGroups</code></a>
<a href="#sheetwrite-store-search-cells"><code>searchCells</code></a>
<a href="#sheetwrite-store-search-cells-flat"><code>searchCellsFlat</code></a>
<a href="#sheetwrite-store-set-column-filter"><code>setColumnFilter</code></a>
<a href="#sheetwrite-store-set-detailed-change-capture"><code>setDetailedChangeCapture</code></a>
<a href="#sheetwrite-store-set-group-collapsed"><code>setGroupCollapsed</code></a>
<a href="#sheetwrite-store-set-protection-resolver"><code>setProtectionResolver</code></a>
<a href="#sheetwrite-store-show-rows"><code>showRows</code></a>
<a href="#sheetwrite-store-sort-by"><code>sortBy</code></a>
<a href="#sheetwrite-store-sort-by-multi"><code>sortByMulti</code></a>
<a href="#sheetwrite-store-ungroup-rows"><code>ungroupRows</code></a>
<a href="#sheetwrite-store-view-row-count"><code>viewRowCount</code></a>
<a href="#sheetwrite-store-view-row-of"><code>viewRowOf</code></a>
<a href="#sheetwrite-store-with-resource-operation"><code>withResourceOperation</code></a>
<a href="#sheetwrite-store-from-snapshot"><code>fromSnapshot</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>59</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-store-constructor" data-pagefind-weight="1" open>
<summary><code>constructor</code></summary>

<button class="api-copy" type="button" data-copy-code="constructor(workbook: Workbook, data?: ColumnarData, options?: SheetwriteStoreOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(workbook: Workbook, data?: ColumnarData, options?: SheetwriteStoreOptions);
```

</details>

<details class="api-member" id="sheetwrite-store-acknowledge-operations" data-pagefind-weight="1" open>
<summary><code>acknowledgeOperations</code> <span class="api-member-summary">Release sparse paged edits after server acknowledgement.</span></summary>

<button class="api-copy" type="button" data-copy-code="acknowledgeOperations: (operations: readonly DocumentOp[], storageRevision?: bigint) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
acknowledgeOperations: (operations: readonly DocumentOp[], storageRevision?: bigint) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-aggregate" data-pagefind-weight="1" open>
<summary><code>aggregate</code></summary>

<button class="api-copy" type="button" data-copy-code="aggregate: (sheet: SheetId, col: number, op: AggregateOp) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
aggregate: (sheet: SheetId, col: number, op: AggregateOp) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code> <span class="api-member-summary">Apply a low-level storage transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="applyTransaction: (tx: Transaction, reasonOrOptions?: CommitReason | TransactionApplicationOptions) =&gt; ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
applyTransaction: (tx: Transaction, reasonOrOptions?: CommitReason | TransactionApplicationOptions) => ApplyTransactionResult;
```

<p class="api-member-doc">Apply a low-level storage transaction.

This bypasses Grid read-only checks and Grid undo/redo history. Use
`Grid.applyTransaction` for normal host-driven edits.
Queued and flushed at a barrier — never reentrant.</p>
</details>

<details class="api-member" id="sheetwrite-store-are-columns-fully-loaded" data-pagefind-weight="1">
<summary><code>areColumnsFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="areColumnsFullyLoaded: (sheet: SheetId, startRow: number, endRow: number, columns: readonly number[]) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
areColumnsFullyLoaded: (sheet: SheetId, startRow: number, endRow: number, columns: readonly number[]) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-can-apply-locally" data-pagefind-weight="1" open>
<summary><code>canApplyLocally</code></summary>

<button class="api-copy" type="button" data-copy-code="canApplyLocally: (patch: DocumentOp) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
canApplyLocally: (patch: DocumentOp) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-capture-range-history" data-pagefind-weight="1" open>
<summary><code>captureRangeHistory</code></summary>

<button class="api-copy" type="button" data-copy-code="captureRangeHistory: (input: Range) =&gt; CompactRangeHistory | null;" data-pagefind-ignore>Copy</button>

```ts generated
captureRangeHistory: (input: Range) => CompactRangeHistory | null;
```

</details>

<details class="api-member" id="sheetwrite-store-clear-view" data-pagefind-weight="1" open>
<summary><code>clearView</code></summary>

<button class="api-copy" type="button" data-copy-code="clearView: (sheet: SheetId) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
clearView: (sheet: SheetId) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-column-filters" data-pagefind-weight="1" open>
<summary><code>columnFilters</code></summary>

<button class="api-copy" type="button" data-copy-code="columnFilters: (sheet: SheetId) =&gt; ReadonlyMap&lt;number, ColumnFilter&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
columnFilters: (sheet: SheetId) => ReadonlyMap<number, ColumnFilter>;
```

</details>

<details class="api-member" id="sheetwrite-store-data-edge" data-pagefind-weight="1" open>
<summary><code>dataEdge</code></summary>

<button class="api-copy" type="button" data-copy-code="dataEdge: (sheet: SheetId, row: number, col: number, dRow: number, dCol: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
dataEdge: (sheet: SheetId, row: number, col: number, dRow: number, dCol: number) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-data-row-at" data-pagefind-weight="1" open>
<summary><code>dataRowAt</code></summary>

<button class="api-copy" type="button" data-copy-code="dataRowAt: (sheet: SheetId, viewRow: number) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
dataRowAt: (sheet: SheetId, viewRow: number) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-dispose" data-pagefind-weight="1" open>
<summary><code>dispose</code></summary>

<button class="api-copy" type="button" data-copy-code="dispose: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
dispose: () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-distinct-values" data-pagefind-weight="1" open>
<summary><code>distinctValues</code></summary>

<button class="api-copy" type="button" data-copy-code="distinctValues: (sheet: SheetId, col: number, limit?: number) =&gt; CellScalar[];" data-pagefind-ignore>Copy</button>

```ts generated
distinctValues: (sheet: SheetId, col: number, limit?: number) => CellScalar[];
```

</details>

<details class="api-member" id="sheetwrite-store-ensure-columns" data-pagefind-weight="1" open>
<summary><code>ensureColumns</code> <span class="api-member-summary">Ensure a sheet can address at least columns.length columns without producing user changes or dirty patches.</span></summary>

<button class="api-copy" type="button" data-copy-code="ensureColumns: (sheet: SheetId, columns: readonly Column[]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
ensureColumns: (sheet: SheetId, columns: readonly Column[]) => void;
```

<p class="api-member-doc">Ensure a sheet can address at least `columns.length` columns without
producing user changes or dirty patches. Used for presentation padding.</p>
</details>

<details class="api-member" id="sheetwrite-store-export-snapshot" data-pagefind-weight="1" open>
<summary><code>exportSnapshot</code> <span class="api-member-summary">Deterministic, JSON-safe authoritative runtime document.</span></summary>

<button class="api-copy" type="button" data-copy-code="exportSnapshot: () =&gt; WorkbookSnapshot;" data-pagefind-ignore>Copy</button>

```ts generated
exportSnapshot: () => WorkbookSnapshot;
```

</details>

<details class="api-member" id="sheetwrite-store-filter-by" data-pagefind-weight="1" open>
<summary><code>filterBy</code></summary>

<button class="api-copy" type="button" data-copy-code="filterBy: (sheet: SheetId, col: number, needle: string) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
filterBy: (sheet: SheetId, col: number, needle: string) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-get-cell" data-pagefind-weight="1" open>
<summary><code>getCell</code> <span class="api-member-summary">Single-cell read for interactions, API reads, and tests.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCell: (addr: CellAddress) =&gt; ResolvedCell;" data-pagefind-ignore>Copy</button>

```ts generated
getCell: (addr: CellAddress) => ResolvedCell;
```

<p class="api-member-doc">Single-cell read for interactions, API reads, and tests.
NOT for the render hot path — renderers use `getVisibleWindow`.</p>
</details>

<details class="api-member" id="sheetwrite-store-get-cell-load-state" data-pagefind-weight="1" open>
<summary><code>getCellLoadState</code> <span class="api-member-summary">Loaded/empty/local state; dense stores always return a loaded state.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCellLoadState: (addr: CellAddress) =&gt; CellLoadState;" data-pagefind-ignore>Copy</button>

```ts generated
getCellLoadState: (addr: CellAddress) => CellLoadState;
```

</details>

<details class="api-member" id="sheetwrite-store-get-clipboard-window" data-pagefind-weight="1">
<summary><code>getClipboardWindow</code> <span class="api-member-summary">Optional packed clipboard read.</span></summary>

<button class="api-copy" type="button" data-copy-code="getClipboardWindow: (sheet: SheetId, viewRows: { start: number; end: number; }, cols: readonly number[]) =&gt; ClipboardWindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getClipboardWindow: (sheet: SheetId, viewRows: { start: number; end: number; }, cols: readonly number[]) => ClipboardWindowView;
```

<p class="api-member-doc">Optional packed clipboard read. Custom stores may omit it; the controller
preserves the per-cell Store fallback contract.</p>
</details>

<details class="api-member" id="sheetwrite-store-get-data-window" data-pagefind-weight="1">
<summary><code>getDataWindow</code> <span class="api-member-summary">Optional packed canonical data-row window used by file export.</span></summary>

<button class="api-copy" type="button" data-copy-code="getDataWindow: (sheet: SheetId, rows: { start: number; end: number; }, cols: readonly number[]) =&gt; VisibleWindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getDataWindow: (sheet: SheetId, rows: { start: number; end: number; }, cols: readonly number[]) => VisibleWindowView;
```

<p class="api-member-doc">Optional packed canonical data-row window used by file export. Unlike
`getVisibleWindow`, sort/filter state never remaps `rows`.</p>
</details>

<details class="api-member" id="sheetwrite-store-get-formula" data-pagefind-weight="1" open>
<summary><code>getFormula</code> <span class="api-member-summary">Formula source at addr, or null when the cell is not a formula.</span></summary>

<button class="api-copy" type="button" data-copy-code="getFormula: (addr: CellAddress) =&gt; string | null;" data-pagefind-ignore>Copy</button>

```ts generated
getFormula: (addr: CellAddress) => string | null;
```

</details>

<details class="api-member" id="sheetwrite-store-get-formula-matrix-resource-peak" data-pagefind-weight="1" open>
<summary><code>getFormulaMatrixResourcePeak</code></summary>

<button class="api-copy" type="button" data-copy-code="getFormulaMatrixResourcePeak: () =&gt; TransientResourcePeak;" data-pagefind-ignore>Copy</button>

```ts generated
getFormulaMatrixResourcePeak: () => TransientResourcePeak;
```

</details>

<details class="api-member" id="sheetwrite-store-get-paged-stats" data-pagefind-weight="1" open>
<summary><code>getPagedStats</code></summary>

<button class="api-copy" type="button" data-copy-code="getPagedStats: (sheet: SheetId) =&gt; PagedStoreStats;" data-pagefind-ignore>Copy</button>

```ts generated
getPagedStats: (sheet: SheetId) => PagedStoreStats;
```

</details>

<details class="api-member" id="sheetwrite-store-get-range-mutation-allocation-stats" data-pagefind-weight="1" open>
<summary><code>getRangeMutationAllocationStats</code></summary>

<button class="api-copy" type="button" data-copy-code="getRangeMutationAllocationStats: () =&gt; RangeMutationAllocationStats;" data-pagefind-ignore>Copy</button>

```ts generated
getRangeMutationAllocationStats: () => RangeMutationAllocationStats;
```

</details>

<details class="api-member" id="sheetwrite-store-get-ref-target" data-pagefind-weight="1" open>
<summary><code>getRefTarget</code> <span class="api-member-summary">Plain-reference target at addr, or null when the cell is not a ref.</span></summary>

<button class="api-copy" type="button" data-copy-code="getRefTarget: (addr: CellAddress) =&gt; CellAddress | null;" data-pagefind-ignore>Copy</button>

```ts generated
getRefTarget: (addr: CellAddress) => CellAddress | null;
```

</details>

<details class="api-member" id="sheetwrite-store-get-runtime-resource-snapshot" data-pagefind-weight="1">
<summary><code>getRuntimeResourceSnapshot</code></summary>

<button class="api-copy" type="button" data-copy-code="getRuntimeResourceSnapshot: (operation: RuntimeResourceOperation, phase: RuntimeResourcePhase, runtime?: RuntimeMemoryObservation) =&gt; RuntimeResourceSnapshot;" data-pagefind-ignore>Copy</button>

```ts generated
getRuntimeResourceSnapshot: (operation: RuntimeResourceOperation, phase: RuntimeResourcePhase, runtime?: RuntimeMemoryObservation) => RuntimeResourceSnapshot;
```

</details>

<details class="api-member" id="sheetwrite-store-get-spill-anchor" data-pagefind-weight="1" open>
<summary><code>getSpillAnchor</code> <span class="api-member-summary">Owning dynamic-array formula cell, or null when addr is not spilled.</span></summary>

<button class="api-copy" type="button" data-copy-code="getSpillAnchor: (addr: CellAddress) =&gt; CellAddress | null;" data-pagefind-ignore>Copy</button>

```ts generated
getSpillAnchor: (addr: CellAddress) => CellAddress | null;
```

</details>

<details class="api-member" id="sheetwrite-store-get-visible-window" data-pagefind-weight="1">
<summary><code>getVisibleWindow</code> <span class="api-member-summary">Bulk read of a visible window; the only read a renderer should use per frame.</span></summary>

<button class="api-copy" type="button" data-copy-code="getVisibleWindow: (sheet: SheetId, rows: { start: number; end: number; }, cols: readonly number[]) =&gt; VisibleWindowView;" data-pagefind-ignore>Copy</button>

```ts generated
getVisibleWindow: (sheet: SheetId, rows: { start: number; end: number; }, cols: readonly number[]) => VisibleWindowView;
```

</details>

<details class="api-member" id="sheetwrite-store-get-workbook" data-pagefind-weight="1" open>
<summary><code>getWorkbook</code></summary>

<button class="api-copy" type="button" data-copy-code="getWorkbook: () =&gt; Workbook;" data-pagefind-ignore>Copy</button>

```ts generated
getWorkbook: () => Workbook;
```

</details>

<details class="api-member" id="sheetwrite-store-group-rows" data-pagefind-weight="1" open>
<summary><code>groupRows</code></summary>

<button class="api-copy" type="button" data-copy-code="groupRows: (sheet: SheetId, start: number, end: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
groupRows: (sheet: SheetId, start: number, end: number) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-has-view" data-pagefind-weight="1" open>
<summary><code>hasView</code></summary>

<button class="api-copy" type="button" data-copy-code="hasView: (sheet: SheetId) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
hasView: (sheet: SheetId) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-hidden-rows" data-pagefind-weight="1" open>
<summary><code>hiddenRows</code></summary>

<button class="api-copy" type="button" data-copy-code="hiddenRows: (sheet: SheetId) =&gt; number[];" data-pagefind-ignore>Copy</button>

```ts generated
hiddenRows: (sheet: SheetId) => number[];
```

</details>

<details class="api-member" id="sheetwrite-store-hide-rows" data-pagefind-weight="1" open>
<summary><code>hideRows</code></summary>

<button class="api-copy" type="button" data-copy-code="hideRows: (sheet: SheetId, rows: readonly number[]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
hideRows: (sheet: SheetId, rows: readonly number[]) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-is-paged" data-pagefind-weight="1" open>
<summary><code>isPaged</code></summary>

<button class="api-copy" type="button" data-copy-code="isPaged: (sheet: SheetId) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
isPaged: (sheet: SheetId) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-is-range-fully-loaded" data-pagefind-weight="1" open>
<summary><code>isRangeFullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="isRangeFullyLoaded: (input: Range) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
isRangeFullyLoaded: (input: Range) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-load-page" data-pagefind-weight="1">
<summary><code>loadPage</code></summary>

<button class="api-copy" type="button" data-copy-code="loadPage: (sheet: SheetId, start: number, columns: readonly DataSourceColumnBand[], rows: readonly RowData[], protect?: (addr: CellAddress) =&gt; boolean) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
loadPage: (sheet: SheetId, start: number, columns: readonly DataSourceColumnBand[], rows: readonly RowData[], protect?: (addr: CellAddress) => boolean) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-on" data-pagefind-weight="1" open>
<summary><code>on</code></summary>

<button class="api-copy" type="button" data-copy-code="on: (_evt: &quot;change&quot;, fn: ChangeListener) =&gt; () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
on: (_evt: "change", fn: ChangeListener) => () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-query-capability" data-pagefind-weight="1" open>
<summary><code>queryCapability</code> <span class="api-member-summary">Explicit partial-data state for paged datasource stores.</span></summary>

<button class="api-copy" type="button" data-copy-code="queryCapability: (sheet: SheetId) =&gt; QueryCapability;" data-pagefind-ignore>Copy</button>

```ts generated
queryCapability: (sheet: SheetId) => QueryCapability;
```

</details>

<details class="api-member" id="sheetwrite-store-recalculate-volatile" data-pagefind-weight="1" open>
<summary><code>recalculateVolatile</code> <span class="api-member-summary">Recompute volatile formulas (TODAY/NOW) from one captured instant.</span></summary>

<button class="api-copy" type="button" data-copy-code="recalculateVolatile: (now?: Date) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
recalculateVolatile: (now?: Date) => void;
```

<p class="api-member-doc">Recompute volatile formulas (`TODAY`/`NOW`) from one captured instant.
The supplied Date is interpreted as an absolute UTC instant.</p>
</details>

<details class="api-member" id="sheetwrite-store-remove-sheet-formula-identity" data-pagefind-weight="1" open>
<summary><code>removeSheetFormulaIdentity</code></summary>

<button class="api-copy" type="button" data-copy-code="removeSheetFormulaIdentity: (sheet: SheetId) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
removeSheetFormulaIdentity: (sheet: SheetId) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-rename-sheet-formula-identity" data-pagefind-weight="1" open>
<summary><code>renameSheetFormulaIdentity</code></summary>

<button class="api-copy" type="button" data-copy-code="renameSheetFormulaIdentity: (sheet: SheetId, name: string) =&gt; boolean;" data-pagefind-ignore>Copy</button>

```ts generated
renameSheetFormulaIdentity: (sheet: SheetId, name: string) => boolean;
```

</details>

<details class="api-member" id="sheetwrite-store-reset-formula-matrix-resource-peak" data-pagefind-weight="1" open>
<summary><code>resetFormulaMatrixResourcePeak</code></summary>

<button class="api-copy" type="button" data-copy-code="resetFormulaMatrixResourcePeak: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
resetFormulaMatrixResourcePeak: () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-reset-range-mutation-allocation-stats" data-pagefind-weight="1" open>
<summary><code>resetRangeMutationAllocationStats</code></summary>

<button class="api-copy" type="button" data-copy-code="resetRangeMutationAllocationStats: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
resetRangeMutationAllocationStats: () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-reset-runtime-resource-accounting" data-pagefind-weight="1" open>
<summary><code>resetRuntimeResourceAccounting</code></summary>

<button class="api-copy" type="button" data-copy-code="resetRuntimeResourceAccounting: () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
resetRuntimeResourceAccounting: () => void;
```

</details>

<details class="api-member" id="sheetwrite-store-row-groups" data-pagefind-weight="1" open>
<summary><code>rowGroups</code></summary>

<button class="api-copy" type="button" data-copy-code="rowGroups: (sheet: SheetId) =&gt; readonly RowGroup[];" data-pagefind-ignore>Copy</button>

```ts generated
rowGroups: (sheet: SheetId) => readonly RowGroup[];
```

</details>

<details class="api-member" id="sheetwrite-store-search-cells" data-pagefind-weight="1">
<summary><code>searchCells</code></summary>

<button class="api-copy" type="button" data-copy-code="searchCells: (sheet: SheetId, query: string, opts?: { matchCase?: boolean; wholeCell?: boolean; columns?: number[]; }) =&gt; CellAddress[];" data-pagefind-ignore>Copy</button>

```ts generated
searchCells: (sheet: SheetId, query: string, opts?: { matchCase?: boolean; wholeCell?: boolean; columns?: number[]; }) => CellAddress[];
```

</details>

<details class="api-member" id="sheetwrite-store-search-cells-flat" data-pagefind-weight="1">
<summary><code>searchCellsFlat</code></summary>

<button class="api-copy" type="button" data-copy-code="searchCellsFlat: (sheet: SheetId, query: string, opts?: { matchCase?: boolean; wholeCell?: boolean; columns?: number[]; }) =&gt; Uint32Array;" data-pagefind-ignore>Copy</button>

```ts generated
searchCellsFlat: (sheet: SheetId, query: string, opts?: { matchCase?: boolean; wholeCell?: boolean; columns?: number[]; }) => Uint32Array;
```

</details>

<details class="api-member" id="sheetwrite-store-set-column-filter" data-pagefind-weight="1" open>
<summary><code>setColumnFilter</code></summary>

<button class="api-copy" type="button" data-copy-code="setColumnFilter: (sheet: SheetId, col: number, filter: ColumnFilter | null) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setColumnFilter: (sheet: SheetId, col: number, filter: ColumnFilter | null) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-set-detailed-change-capture" data-pagefind-weight="1" open>
<summary><code>setDetailedChangeCapture</code> <span class="api-member-summary">Opt in to per-cell before/after capture for packed and clear operations.</span></summary>

<button class="api-copy" type="button" data-copy-code="setDetailedChangeCapture: (enabled: boolean) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setDetailedChangeCapture: (enabled: boolean) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-set-group-collapsed" data-pagefind-weight="1" open>
<summary><code>setGroupCollapsed</code></summary>

<button class="api-copy" type="button" data-copy-code="setGroupCollapsed: (sheet: SheetId, start: number, collapsed: boolean) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setGroupCollapsed: (sheet: SheetId, start: number, collapsed: boolean) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-set-protection-resolver" data-pagefind-weight="1">
<summary><code>setProtectionResolver</code> <span class="api-member-summary">Configure host-owned protected-range permissions.</span></summary>

<button class="api-copy" type="button" data-copy-code="setProtectionResolver: (resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
setProtectionResolver: (resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode) => void;
```

<p class="api-member-doc">Configure host-owned protected-range permissions. The resolver is synchronous
so every local mutation ingress shares one atomic commit barrier.</p>
</details>

<details class="api-member" id="sheetwrite-store-show-rows" data-pagefind-weight="1" open>
<summary><code>showRows</code></summary>

<button class="api-copy" type="button" data-copy-code="showRows: (sheet: SheetId, rows?: readonly number[]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
showRows: (sheet: SheetId, rows?: readonly number[]) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-sort-by" data-pagefind-weight="1" open>
<summary><code>sortBy</code></summary>

<button class="api-copy" type="button" data-copy-code="sortBy: (sheet: SheetId, col: number, ascending: boolean) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
sortBy: (sheet: SheetId, col: number, ascending: boolean) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-sort-by-multi" data-pagefind-weight="1" open>
<summary><code>sortByMulti</code></summary>

<button class="api-copy" type="button" data-copy-code="sortByMulti: (sheet: SheetId, keys: readonly SortKey[]) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
sortByMulti: (sheet: SheetId, keys: readonly SortKey[]) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-ungroup-rows" data-pagefind-weight="1" open>
<summary><code>ungroupRows</code></summary>

<button class="api-copy" type="button" data-copy-code="ungroupRows: (sheet: SheetId, start: number, end: number) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
ungroupRows: (sheet: SheetId, start: number, end: number) => void;
```

</details>

<details class="api-member" id="sheetwrite-store-view-row-count" data-pagefind-weight="1" open>
<summary><code>viewRowCount</code> <span class="api-member-summary">Displayed row count after any active sort/filter view.</span></summary>

<button class="api-copy" type="button" data-copy-code="viewRowCount: (sheet: SheetId) =&gt; number;" data-pagefind-ignore>Copy</button>

```ts generated
viewRowCount: (sheet: SheetId) => number;
```

</details>

<details class="api-member" id="sheetwrite-store-view-row-of" data-pagefind-weight="1" open>
<summary><code>viewRowOf</code></summary>

<button class="api-copy" type="button" data-copy-code="viewRowOf: (sheet: SheetId, dataRow: number) =&gt; number | null;" data-pagefind-ignore>Copy</button>

```ts generated
viewRowOf: (sheet: SheetId, dataRow: number) => number | null;
```

</details>

<details class="api-member" id="sheetwrite-store-with-resource-operation" data-pagefind-weight="1" open>
<summary><code>withResourceOperation</code></summary>

<button class="api-copy" type="button" data-copy-code="withResourceOperation: &lt;T&gt;(operation: RuntimeResourceOperation, run: () =&gt; T) =&gt; T;" data-pagefind-ignore>Copy</button>

```ts generated
withResourceOperation: <T>(operation: RuntimeResourceOperation, run: () => T) => T;
```

</details>

<details class="api-member" id="sheetwrite-store-from-snapshot" data-pagefind-weight="1" open>
<summary><code>fromSnapshot</code></summary>

<button class="api-copy" type="button" data-copy-code="static fromSnapshot: (input: unknown, options?: SheetwriteStoreOptions) =&gt; SheetwriteStore" data-pagefind-ignore>Copy</button>

```ts generated
static fromSnapshot: (input: unknown, options?: SheetwriteStoreOptions) => SheetwriteStore
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class SheetwriteStore implements Store {&#10;  constructor(&#10;    workbook: Workbook,&#10;    data?: ColumnarData,&#10;    options?: SheetwriteStoreOptions,&#10;  );&#10;  acknowledgeOperations: (&#10;    operations: readonly DocumentOp[],&#10;    storageRevision?: bigint,&#10;  ) =&gt; void;&#10;  aggregate: (sheet: SheetId, col: number, op: AggregateOp) =&gt; number;&#10;  applyTransaction: (&#10;    tx: Transaction,&#10;    reasonOrOptions?: CommitReason | TransactionApplicationOptions,&#10;  ) =&gt; ApplyTransactionResult;&#10;  areColumnsFullyLoaded: (&#10;    sheet: SheetId,&#10;    startRow: number,&#10;    endRow: number,&#10;    columns: readonly number[],&#10;  ) =&gt; boolean;&#10;  canApplyLocally: (patch: DocumentOp) =&gt; boolean;&#10;  captureRangeHistory: (input: Range) =&gt; CompactRangeHistory | null;&#10;  clearView: (sheet: SheetId) =&gt; void;&#10;  columnFilters: (sheet: SheetId) =&gt; ReadonlyMap&lt;number, ColumnFilter&gt;;&#10;  dataEdge: (&#10;    sheet: SheetId,&#10;    row: number,&#10;    col: number,&#10;    dRow: number,&#10;    dCol: number,&#10;  ) =&gt; number;&#10;  dataRowAt: (sheet: SheetId, viewRow: number) =&gt; number;&#10;  dispose: () =&gt; void;&#10;  distinctValues: (&#10;    sheet: SheetId,&#10;    col: number,&#10;    limit?: number,&#10;  ) =&gt; CellScalar[];&#10;  ensureColumns: (sheet: SheetId, columns: readonly Column[]) =&gt; void;&#10;  exportSnapshot: () =&gt; WorkbookSnapshot;&#10;  filterBy: (sheet: SheetId, col: number, needle: string) =&gt; void;&#10;  getCell: (addr: CellAddress) =&gt; ResolvedCell;&#10;  getCellLoadState: (addr: CellAddress) =&gt; CellLoadState;&#10;  getClipboardWindow: (&#10;    sheet: SheetId,&#10;    viewRows: {&#10;      start: number;&#10;      end: number;&#10;    },&#10;    cols: readonly number[],&#10;  ) =&gt; ClipboardWindowView;&#10;  getDataWindow: (&#10;    sheet: SheetId,&#10;    rows: {&#10;      start: number;&#10;      end: number;&#10;    },&#10;    cols: readonly number[],&#10;  ) =&gt; VisibleWindowView;&#10;  getFormula: (addr: CellAddress) =&gt; string | null;&#10;  getFormulaMatrixResourcePeak: () =&gt; TransientResourcePeak;&#10;  getPagedStats: (sheet: SheetId) =&gt; PagedStoreStats;&#10;  getRangeMutationAllocationStats: () =&gt; RangeMutationAllocationStats;&#10;  getRefTarget: (addr: CellAddress) =&gt; CellAddress | null;&#10;  getRuntimeResourceSnapshot: (&#10;    operation: RuntimeResourceOperation,&#10;    phase: RuntimeResourcePhase,&#10;    runtime?: RuntimeMemoryObservation,&#10;  ) =&gt; RuntimeResourceSnapshot;&#10;  getSpillAnchor: (addr: CellAddress) =&gt; CellAddress | null;&#10;  getVisibleWindow: (&#10;    sheet: SheetId,&#10;    rows: {&#10;      start: number;&#10;      end: number;&#10;    },&#10;    cols: readonly number[],&#10;  ) =&gt; VisibleWindowView;&#10;  getWorkbook: () =&gt; Workbook;&#10;  groupRows: (sheet: SheetId, start: number, end: number) =&gt; void;&#10;  hasView: (sheet: SheetId) =&gt; boolean;&#10;  hiddenRows: (sheet: SheetId) =&gt; number[];&#10;  hideRows: (sheet: SheetId, rows: readonly number[]) =&gt; void;&#10;  isPaged: (sheet: SheetId) =&gt; boolean;&#10;  isRangeFullyLoaded: (input: Range) =&gt; boolean;&#10;  loadPage: (&#10;    sheet: SheetId,&#10;    start: number,&#10;    columns: readonly DataSourceColumnBand[],&#10;    rows: readonly RowData[],&#10;    protect?: (addr: CellAddress) =&gt; boolean,&#10;  ) =&gt; void;&#10;  on: (_evt: &quot;change&quot;, fn: ChangeListener) =&gt; () =&gt; void;&#10;  queryCapability: (sheet: SheetId) =&gt; QueryCapability;&#10;  recalculateVolatile: (now?: Date) =&gt; void;&#10;  removeSheetFormulaIdentity: (sheet: SheetId) =&gt; boolean;&#10;  renameSheetFormulaIdentity: (sheet: SheetId, name: string) =&gt; boolean;&#10;  resetFormulaMatrixResourcePeak: () =&gt; void;&#10;  resetRangeMutationAllocationStats: () =&gt; void;&#10;  resetRuntimeResourceAccounting: () =&gt; void;&#10;  rowGroups: (sheet: SheetId) =&gt; readonly RowGroup[];&#10;  searchCells: (&#10;    sheet: SheetId,&#10;    query: string,&#10;    opts?: {&#10;      matchCase?: boolean;&#10;      wholeCell?: boolean;&#10;      columns?: number[];&#10;    },&#10;  ) =&gt; CellAddress[];&#10;  searchCellsFlat: (&#10;    sheet: SheetId,&#10;    query: string,&#10;    opts?: {&#10;      matchCase?: boolean;&#10;      wholeCell?: boolean;&#10;      columns?: number[];&#10;    },&#10;  ) =&gt; Uint32Array;&#10;  setColumnFilter: (&#10;    sheet: SheetId,&#10;    col: number,&#10;    filter: ColumnFilter | null,&#10;  ) =&gt; void;&#10;  setDetailedChangeCapture: (enabled: boolean) =&gt; void;&#10;  setGroupCollapsed: (&#10;    sheet: SheetId,&#10;    start: number,&#10;    collapsed: boolean,&#10;  ) =&gt; void;&#10;  setProtectionResolver: (&#10;    resolver: ProtectionResolver | undefined,&#10;    mode?: MutationPolicyMode,&#10;  ) =&gt; void;&#10;  showRows: (sheet: SheetId, rows?: readonly number[]) =&gt; void;&#10;  sortBy: (sheet: SheetId, col: number, ascending: boolean) =&gt; void;&#10;  sortByMulti: (sheet: SheetId, keys: readonly SortKey[]) =&gt; void;&#10;  ungroupRows: (sheet: SheetId, start: number, end: number) =&gt; void;&#10;  viewRowCount: (sheet: SheetId) =&gt; number;&#10;  viewRowOf: (sheet: SheetId, dataRow: number) =&gt; number | null;&#10;  withResourceOperation: &lt;T&gt;(&#10;    operation: RuntimeResourceOperation,&#10;    run: () =&gt; T,&#10;  ) =&gt; T;&#10;  static fromSnapshot: (&#10;    input: unknown,&#10;    options?: SheetwriteStoreOptions,&#10;  ) =&gt; SheetwriteStore;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
class SheetwriteStore implements Store {
  constructor(
    workbook: Workbook,
    data?: ColumnarData,
    options?: SheetwriteStoreOptions,
  );
  acknowledgeOperations: (
    operations: readonly DocumentOp[],
    storageRevision?: bigint,
  ) => void;
  aggregate: (sheet: SheetId, col: number, op: AggregateOp) => number;
  applyTransaction: (
    tx: Transaction,
    reasonOrOptions?: CommitReason | TransactionApplicationOptions,
  ) => ApplyTransactionResult;
  areColumnsFullyLoaded: (
    sheet: SheetId,
    startRow: number,
    endRow: number,
    columns: readonly number[],
  ) => boolean;
  canApplyLocally: (patch: DocumentOp) => boolean;
  captureRangeHistory: (input: Range) => CompactRangeHistory | null;
  clearView: (sheet: SheetId) => void;
  columnFilters: (sheet: SheetId) => ReadonlyMap<number, ColumnFilter>;
  dataEdge: (
    sheet: SheetId,
    row: number,
    col: number,
    dRow: number,
    dCol: number,
  ) => number;
  dataRowAt: (sheet: SheetId, viewRow: number) => number;
  dispose: () => void;
  distinctValues: (
    sheet: SheetId,
    col: number,
    limit?: number,
  ) => CellScalar[];
  ensureColumns: (sheet: SheetId, columns: readonly Column[]) => void;
  exportSnapshot: () => WorkbookSnapshot;
  filterBy: (sheet: SheetId, col: number, needle: string) => void;
  getCell: (addr: CellAddress) => ResolvedCell;
  getCellLoadState: (addr: CellAddress) => CellLoadState;
  getClipboardWindow: (
    sheet: SheetId,
    viewRows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ) => ClipboardWindowView;
  getDataWindow: (
    sheet: SheetId,
    rows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ) => VisibleWindowView;
  getFormula: (addr: CellAddress) => string | null;
  getFormulaMatrixResourcePeak: () => TransientResourcePeak;
  getPagedStats: (sheet: SheetId) => PagedStoreStats;
  getRangeMutationAllocationStats: () => RangeMutationAllocationStats;
  getRefTarget: (addr: CellAddress) => CellAddress | null;
  getRuntimeResourceSnapshot: (
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ) => RuntimeResourceSnapshot;
  getSpillAnchor: (addr: CellAddress) => CellAddress | null;
  getVisibleWindow: (
    sheet: SheetId,
    rows: {
      start: number;
      end: number;
    },
    cols: readonly number[],
  ) => VisibleWindowView;
  getWorkbook: () => Workbook;
  groupRows: (sheet: SheetId, start: number, end: number) => void;
  hasView: (sheet: SheetId) => boolean;
  hiddenRows: (sheet: SheetId) => number[];
  hideRows: (sheet: SheetId, rows: readonly number[]) => void;
  isPaged: (sheet: SheetId) => boolean;
  isRangeFullyLoaded: (input: Range) => boolean;
  loadPage: (
    sheet: SheetId,
    start: number,
    columns: readonly DataSourceColumnBand[],
    rows: readonly RowData[],
    protect?: (addr: CellAddress) => boolean,
  ) => void;
  on: (_evt: "change", fn: ChangeListener) => () => void;
  queryCapability: (sheet: SheetId) => QueryCapability;
  recalculateVolatile: (now?: Date) => void;
  removeSheetFormulaIdentity: (sheet: SheetId) => boolean;
  renameSheetFormulaIdentity: (sheet: SheetId, name: string) => boolean;
  resetFormulaMatrixResourcePeak: () => void;
  resetRangeMutationAllocationStats: () => void;
  resetRuntimeResourceAccounting: () => void;
  rowGroups: (sheet: SheetId) => readonly RowGroup[];
  searchCells: (
    sheet: SheetId,
    query: string,
    opts?: {
      matchCase?: boolean;
      wholeCell?: boolean;
      columns?: number[];
    },
  ) => CellAddress[];
  searchCellsFlat: (
    sheet: SheetId,
    query: string,
    opts?: {
      matchCase?: boolean;
      wholeCell?: boolean;
      columns?: number[];
    },
  ) => Uint32Array;
  setColumnFilter: (
    sheet: SheetId,
    col: number,
    filter: ColumnFilter | null,
  ) => void;
  setDetailedChangeCapture: (enabled: boolean) => void;
  setGroupCollapsed: (
    sheet: SheetId,
    start: number,
    collapsed: boolean,
  ) => void;
  setProtectionResolver: (
    resolver: ProtectionResolver | undefined,
    mode?: MutationPolicyMode,
  ) => void;
  showRows: (sheet: SheetId, rows?: readonly number[]) => void;
  sortBy: (sheet: SheetId, col: number, ascending: boolean) => void;
  sortByMulti: (sheet: SheetId, keys: readonly SortKey[]) => void;
  ungroupRows: (sheet: SheetId, start: number, end: number) => void;
  viewRowCount: (sheet: SheetId) => number;
  viewRowOf: (sheet: SheetId, dataRow: number) => number | null;
  withResourceOperation: <T>(
    operation: RuntimeResourceOperation,
    run: () => T,
  ) => T;
  static fromSnapshot: (
    input: unknown,
    options?: SheetwriteStoreOptions,
  ) => SheetwriteStore;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteStore</code></p>

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
