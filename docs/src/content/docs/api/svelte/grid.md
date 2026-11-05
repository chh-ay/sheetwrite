---
title: "Grid | @sheetwrite/svelte"
description: "Grid interface in @sheetwrite/svelte: Source summary unavailable; docs:check rejects this omission."
---
<!-- api-export:@sheetwrite/svelte|.|Grid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="interface">interface</span></div>

Source summary unavailable; docs:check rejects this omission.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/dist/types/grid.d.ts#L287"><code>packages/core/dist/types/grid.d.ts#L287</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-store"><code>store</code></a>
<a href="#grid-actions"><code>actions</code></a>
<a href="#grid-get-runtime-resource-snapshot"><code>getRuntimeResourceSnapshot</code></a>
<a href="#grid-get-command-state"><code>getCommandState</code></a>
<a href="#grid-get-focus-cell-style"><code>getFocusCellStyle</code></a>
<a href="#grid-summarize-selection"><code>summarizeSelection</code></a>
<a href="#grid-set-active-sheet"><code>setActiveSheet</code></a>
<a href="#grid-scroll-to-cell"><code>scrollToCell</code></a>
<a href="#grid-get-cell-at-point"><code>getCellAtPoint</code></a>
<a href="#grid-get-active-sheet"><code>getActiveSheet</code></a>
<a href="#grid-get-cell-input"><code>getCellInput</code></a>
<a href="#grid-get-selection"><code>getSelection</code></a>
<a href="#grid-set-selection"><code>setSelection</code></a>
<a href="#grid-get-theme"><code>getTheme</code></a>
<a href="#grid-get-shortcut-label"><code>getShortcutLabel</code></a>
<a href="#grid-set-theme"><code>setTheme</code></a>
<a href="#grid-replace-theme"><code>replaceTheme</code></a>
<a href="#grid-get-effective-theme"><code>getEffectiveTheme</code></a>
<a href="#grid-set-read-only"><code>setReadOnly</code></a>
<a href="#grid-set-config"><code>setConfig</code></a>
<a href="#grid-apply-transaction"><code>applyTransaction</code></a>
<a href="#grid-export-snapshot"><code>exportSnapshot</code></a>
<a href="#grid-apply-remote-operations"><code>applyRemoteOperations</code></a>
<a href="#grid-define-cell-renderer"><code>defineCellRenderer</code></a>
<a href="#grid-aggregate"><code>aggregate</code></a>
<a href="#grid-sort-by"><code>sortBy</code></a>
<a href="#grid-filter-by"><code>filterBy</code></a>
<a href="#grid-set-column-filter"><code>setColumnFilter</code></a>
<a href="#grid-set-view-sort"><code>setViewSort</code></a>
<a href="#grid-sort-range"><code>sortRange</code></a>
<a href="#grid-get-column-filters"><code>getColumnFilters</code></a>
<a href="#grid-distinct-values"><code>distinctValues</code></a>
<a href="#grid-hide-rows"><code>hideRows</code></a>
<a href="#grid-show-rows"><code>showRows</code></a>
<a href="#grid-hidden-rows"><code>hiddenRows</code></a>
<a href="#grid-hide-columns"><code>hideColumns</code></a>
<a href="#grid-show-columns"><code>showColumns</code></a>
<a href="#grid-hidden-columns"><code>hiddenColumns</code></a>
<a href="#grid-group-rows"><code>groupRows</code></a>
<a href="#grid-ungroup-rows"><code>ungroupRows</code></a>
<a href="#grid-set-group-collapsed"><code>setGroupCollapsed</code></a>
<a href="#grid-row-groups"><code>rowGroups</code></a>
<a href="#grid-clear-view"><code>clearView</code></a>
<a href="#grid-undo"><code>undo</code></a>
<a href="#grid-redo"><code>redo</code></a>
<a href="#grid-export-csv"><code>exportCsv</code></a>
<a href="#grid-export-xlsx"><code>exportXlsx</code></a>
<a href="#grid-import-workbook"><code>importWorkbook</code></a>
<a href="#grid-search"><code>search</code></a>
<a href="#grid-find-next"><code>findNext</code></a>
<a href="#grid-find-prev"><code>findPrev</code></a>
<a href="#grid-clear-search"><code>clearSearch</code></a>
<a href="#grid-replace-current"><code>replaceCurrent</code></a>
<a href="#grid-replace-all"><code>replaceAll</code></a>
<a href="#grid-insert-rows"><code>insertRows</code></a>
<a href="#grid-remove-rows"><code>removeRows</code></a>
<a href="#grid-insert-columns"><code>insertColumns</code></a>
<a href="#grid-remove-columns"><code>removeColumns</code></a>
<a href="#grid-add-sheet"><code>addSheet</code></a>
<a href="#grid-remove-sheet"><code>removeSheet</code></a>
<a href="#grid-rename-sheet"><code>renameSheet</code></a>
<a href="#grid-move-sheet"><code>moveSheet</code></a>
<a href="#grid-set-sheet-visibility"><code>setSheetVisibility</code></a>
<a href="#grid-set-conditional-formats"><code>setConditionalFormats</code></a>
<a href="#grid-set-hyperlink"><code>setHyperlink</code></a>
<a href="#grid-remove-hyperlink"><code>removeHyperlink</code></a>
<a href="#grid-get-hyperlink"><code>getHyperlink</code></a>
<a href="#grid-activate-hyperlink"><code>activateHyperlink</code></a>
<a href="#grid-set-validation-rule"><code>setValidationRule</code></a>
<a href="#grid-remove-validation-rule"><code>removeValidationRule</code></a>
<a href="#grid-set-protected-range"><code>setProtectedRange</code></a>
<a href="#grid-remove-protected-range"><code>removeProtectedRange</code></a>
<a href="#grid-get-pivots"><code>getPivots</code></a>
<a href="#grid-set-pivot"><code>setPivot</code></a>
<a href="#grid-remove-pivot"><code>removePivot</code></a>
<a href="#grid-get-pivot-fields"><code>getPivotFields</code></a>
<a href="#grid-get-pivot-result"><code>getPivotResult</code></a>
<a href="#grid-get-charts"><code>getCharts</code></a>
<a href="#grid-set-chart"><code>setChart</code></a>
<a href="#grid-remove-chart"><code>removeChart</code></a>
<a href="#grid-select-chart"><code>selectChart</code></a>
<a href="#grid-open-panel"><code>openPanel</code></a>
<a href="#grid-set-protection-resolver"><code>setProtectionResolver</code></a>
<a href="#grid-set-note"><code>setNote</code></a>
<a href="#grid-get-note"><code>getNote</code></a>
<a href="#grid-set-overscan"><code>setOverscan</code></a>
<a href="#grid-set-min-columns"><code>setMinColumns</code></a>
<a href="#grid-highlight-cells"><code>highlightCells</code></a>
<a href="#grid-set-presence-overlays"><code>setPresenceOverlays</code></a>
<a href="#grid-style-range"><code>styleRange</code></a>
<a href="#grid-begin-edit"><code>beginEdit</code></a>
<a href="#grid-data-edge"><code>dataEdge</code></a>
<a href="#grid-set-row-height"><code>setRowHeight</code></a>
<a href="#grid-set-column-width"><code>setColumnWidth</code></a>
<a href="#grid-auto-fit-rows"><code>autoFitRows</code></a>
<a href="#grid-auto-fit-columns"><code>autoFitColumns</code></a>
<a href="#grid-set-frozen"><code>setFrozen</code></a>
<a href="#grid-set-zoom"><code>setZoom</code></a>
<a href="#grid-get-zoom"><code>getZoom</code></a>
<a href="#grid-renderer-kind"><code>rendererKind</code></a>
<a href="#grid-on"><code>on</code></a>
<a href="#grid-refresh"><code>refresh</code></a>
<a href="#grid-trim-memory"><code>trimMemory</code></a>
<a href="#grid-destroy"><code>destroy</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>104</span>

<div class="api-member-list">

<details class="api-member" id="grid-store" data-pagefind-weight="1">
<summary><code>store</code></summary>

```ts generated
readonly store: Store;
```

</details>

<details class="api-member" id="grid-actions" data-pagefind-weight="1">
<summary><code>actions</code></summary>

```ts generated
readonly actions: GridActions;
```

</details>

<details class="api-member" id="grid-get-runtime-resource-snapshot" data-pagefind-weight="1">
<summary><code>getRuntimeResourceSnapshot</code></summary>

```ts generated
getRuntimeResourceSnapshot(operation: RuntimeResourceOperation, phase: RuntimeResourcePhase, runtime?: RuntimeMemoryObservation): RuntimeResourceSnapshot;
```

</details>

<details class="api-member" id="grid-get-command-state" data-pagefind-weight="1">
<summary><code>getCommandState</code></summary>

```ts generated
getCommandState(command: GridCommandName): GridCommandState;
```

</details>

<details class="api-member" id="grid-get-focus-cell-style" data-pagefind-weight="1">
<summary><code>getFocusCellStyle</code></summary>

```ts generated
getFocusCellStyle(): CellStyle;
```

</details>

<details class="api-member" id="grid-summarize-selection" data-pagefind-weight="1">
<summary><code>summarizeSelection</code></summary>

```ts generated
summarizeSelection(signal?: AbortSignal): Promise<SelectionSummary | null>;
```

</details>

<details class="api-member" id="grid-set-active-sheet" data-pagefind-weight="1">
<summary><code>setActiveSheet</code></summary>

```ts generated
setActiveSheet(id: SheetId): void;
```

</details>

<details class="api-member" id="grid-scroll-to-cell" data-pagefind-weight="1">
<summary><code>scrollToCell</code></summary>

```ts generated
scrollToCell(addr: CellAddress): void;
```

</details>

<details class="api-member" id="grid-get-cell-at-point" data-pagefind-weight="1">
<summary><code>getCellAtPoint</code></summary>

```ts generated
getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
```

</details>

<details class="api-member" id="grid-get-active-sheet" data-pagefind-weight="1">
<summary><code>getActiveSheet</code></summary>

```ts generated
getActiveSheet(): SheetId;
```

</details>

<details class="api-member" id="grid-get-cell-input" data-pagefind-weight="1">
<summary><code>getCellInput</code></summary>

```ts generated
getCellInput(row: number, col: number): CellInputSnapshot | null;
```

</details>

<details class="api-member" id="grid-get-selection" data-pagefind-weight="1">
<summary><code>getSelection</code></summary>

```ts generated
getSelection(): Selection | null;
```

</details>

<details class="api-member" id="grid-set-selection" data-pagefind-weight="1">
<summary><code>setSelection</code></summary>

```ts generated
setSelection(sel: Selection | null): void;
```

</details>

<details class="api-member" id="grid-get-theme" data-pagefind-weight="1">
<summary><code>getTheme</code></summary>

```ts generated
getTheme(): Theme;
```

</details>

<details class="api-member" id="grid-get-shortcut-label" data-pagefind-weight="1">
<summary><code>getShortcutLabel</code></summary>

```ts generated
getShortcutLabel(action: KeyboardAction): string;
```

</details>

<details class="api-member" id="grid-set-theme" data-pagefind-weight="1">
<summary><code>setTheme</code></summary>

```ts generated
setTheme(theme: Partial<Theme>): void;
```

</details>

<details class="api-member" id="grid-replace-theme" data-pagefind-weight="1">
<summary><code>replaceTheme</code></summary>

```ts generated
replaceTheme(theme: Partial<Theme> | undefined): void;
```

</details>

<details class="api-member" id="grid-get-effective-theme" data-pagefind-weight="1">
<summary><code>getEffectiveTheme</code></summary>

```ts generated
getEffectiveTheme(): Theme;
```

</details>

<details class="api-member" id="grid-set-read-only" data-pagefind-weight="1">
<summary><code>setReadOnly</code></summary>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="grid-set-config" data-pagefind-weight="1">
<summary><code>setConfig</code></summary>

```ts generated
setConfig(config: GridConfig | undefined): void;
```

</details>

<details class="api-member" id="grid-apply-transaction" data-pagefind-weight="1">
<summary><code>applyTransaction</code></summary>

```ts generated
applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-export-snapshot" data-pagefind-weight="1">
<summary><code>exportSnapshot</code></summary>

```ts generated
exportSnapshot(): WorkbookSnapshot;
```

</details>

<details class="api-member" id="grid-apply-remote-operations" data-pagefind-weight="1">
<summary><code>applyRemoteOperations</code></summary>

```ts generated
applyRemoteOperations(operations: readonly DocumentOp[], options?: RemoteOperationOptions): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-define-cell-renderer" data-pagefind-weight="1">
<summary><code>defineCellRenderer</code></summary>

```ts generated
defineCellRenderer(name: string, renderer: CellRenderer): void;
```

</details>

<details class="api-member" id="grid-aggregate" data-pagefind-weight="1">
<summary><code>aggregate</code></summary>

```ts generated
aggregate(col: number, op: AggregateOp): number;
```

</details>

<details class="api-member" id="grid-sort-by" data-pagefind-weight="1">
<summary><code>sortBy</code></summary>

```ts generated
sortBy(col: number, ascending?: boolean): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-filter-by" data-pagefind-weight="1">
<summary><code>filterBy</code></summary>

```ts generated
filterBy(col: number, needle: string): void;
```

</details>

<details class="api-member" id="grid-set-column-filter" data-pagefind-weight="1">
<summary><code>setColumnFilter</code></summary>

```ts generated
setColumnFilter(col: number, filter: ColumnFilter | null): void;
```

</details>

<details class="api-member" id="grid-set-view-sort" data-pagefind-weight="1">
<summary><code>setViewSort</code></summary>

```ts generated
setViewSort(keys: readonly SortKey[]): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-sort-range" data-pagefind-weight="1">
<summary><code>sortRange</code></summary>

```ts generated
sortRange(range: Range, keys: readonly SortKey[], options?: { hasHeader?: boolean; }): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-column-filters" data-pagefind-weight="1">
<summary><code>getColumnFilters</code></summary>

```ts generated
getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
```

</details>

<details class="api-member" id="grid-distinct-values" data-pagefind-weight="1">
<summary><code>distinctValues</code></summary>

```ts generated
distinctValues(col: number, limit?: number): CellScalar[];
```

</details>

<details class="api-member" id="grid-hide-rows" data-pagefind-weight="1">
<summary><code>hideRows</code></summary>

```ts generated
hideRows(rows: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-show-rows" data-pagefind-weight="1">
<summary><code>showRows</code></summary>

```ts generated
showRows(rows?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-hidden-rows" data-pagefind-weight="1">
<summary><code>hiddenRows</code></summary>

```ts generated
hiddenRows(): readonly number[];
```

</details>

<details class="api-member" id="grid-hide-columns" data-pagefind-weight="1">
<summary><code>hideColumns</code></summary>

```ts generated
hideColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-show-columns" data-pagefind-weight="1">
<summary><code>showColumns</code></summary>

```ts generated
showColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-hidden-columns" data-pagefind-weight="1">
<summary><code>hiddenColumns</code></summary>

```ts generated
hiddenColumns(): readonly number[];
```

</details>

<details class="api-member" id="grid-group-rows" data-pagefind-weight="1">
<summary><code>groupRows</code></summary>

```ts generated
groupRows(start: number, end: number): void;
```

</details>

<details class="api-member" id="grid-ungroup-rows" data-pagefind-weight="1">
<summary><code>ungroupRows</code></summary>

```ts generated
ungroupRows(start: number, end: number): void;
```

</details>

<details class="api-member" id="grid-set-group-collapsed" data-pagefind-weight="1">
<summary><code>setGroupCollapsed</code></summary>

```ts generated
setGroupCollapsed(start: number, collapsed: boolean): void;
```

</details>

<details class="api-member" id="grid-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code></summary>

```ts generated
rowGroups(): readonly RowGroup[];
```

</details>

<details class="api-member" id="grid-clear-view" data-pagefind-weight="1">
<summary><code>clearView</code></summary>

```ts generated
clearView(): void;
```

</details>

<details class="api-member" id="grid-undo" data-pagefind-weight="1">
<summary><code>undo</code></summary>

```ts generated
undo(): void;
```

</details>

<details class="api-member" id="grid-redo" data-pagefind-weight="1">
<summary><code>redo</code></summary>

```ts generated
redo(): void;
```

</details>

<details class="api-member" id="grid-export-csv" data-pagefind-weight="1">
<summary><code>exportCsv</code></summary>

```ts generated
exportCsv(filename: string): void;
```

</details>

<details class="api-member" id="grid-export-xlsx" data-pagefind-weight="1">
<summary><code>exportXlsx</code></summary>

```ts generated
exportXlsx(filename: string): Promise<void>;
```

</details>

<details class="api-member" id="grid-import-workbook" data-pagefind-weight="1">
<summary><code>importWorkbook</code></summary>

```ts generated
importWorkbook(source: WorkbookSnapshot | ((signal: AbortSignal) => Promise<WorkbookSnapshot>), options?: { signal?: AbortSignal; }): Promise<void>;
```

</details>

<details class="api-member" id="grid-search" data-pagefind-weight="1">
<summary><code>search</code></summary>

```ts generated
search(query: string, opts?: SearchOptions): SearchResult;
```

</details>

<details class="api-member" id="grid-find-next" data-pagefind-weight="1">
<summary><code>findNext</code></summary>

```ts generated
findNext(): SearchResult;
```

</details>

<details class="api-member" id="grid-find-prev" data-pagefind-weight="1">
<summary><code>findPrev</code></summary>

```ts generated
findPrev(): SearchResult;
```

</details>

<details class="api-member" id="grid-clear-search" data-pagefind-weight="1">
<summary><code>clearSearch</code></summary>

```ts generated
clearSearch(): void;
```

</details>

<details class="api-member" id="grid-replace-current" data-pagefind-weight="1">
<summary><code>replaceCurrent</code></summary>

```ts generated
replaceCurrent(replacement: string): SearchResult;
```

</details>

<details class="api-member" id="grid-replace-all" data-pagefind-weight="1">
<summary><code>replaceAll</code></summary>

```ts generated
replaceAll(replacement: string): ReplaceResult;
```

</details>

<details class="api-member" id="grid-insert-rows" data-pagefind-weight="1">
<summary><code>insertRows</code></summary>

```ts generated
insertRows(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-remove-rows" data-pagefind-weight="1">
<summary><code>removeRows</code></summary>

```ts generated
removeRows(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-insert-columns" data-pagefind-weight="1">
<summary><code>insertColumns</code></summary>

```ts generated
insertColumns(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-remove-columns" data-pagefind-weight="1">
<summary><code>removeColumns</code></summary>

```ts generated
removeColumns(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-add-sheet" data-pagefind-weight="1">
<summary><code>addSheet</code></summary>

```ts generated
addSheet(input: AddSheetInput): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-remove-sheet" data-pagefind-weight="1">
<summary><code>removeSheet</code></summary>

```ts generated
removeSheet(id: SheetId): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-rename-sheet" data-pagefind-weight="1">
<summary><code>renameSheet</code></summary>

```ts generated
renameSheet(id: SheetId, name: string): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-move-sheet" data-pagefind-weight="1">
<summary><code>moveSheet</code></summary>

```ts generated
moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-set-sheet-visibility" data-pagefind-weight="1">
<summary><code>setSheetVisibility</code></summary>

```ts generated
setSheetVisibility(id: SheetId, visibility: SheetVisibility): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-set-conditional-formats" data-pagefind-weight="1">
<summary><code>setConditionalFormats</code></summary>

```ts generated
setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
```

</details>

<details class="api-member" id="grid-set-hyperlink" data-pagefind-weight="1">
<summary><code>setHyperlink</code></summary>

```ts generated
setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-hyperlink" data-pagefind-weight="1">
<summary><code>removeHyperlink</code></summary>

```ts generated
removeHyperlink(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-hyperlink" data-pagefind-weight="1">
<summary><code>getHyperlink</code></summary>

```ts generated
getHyperlink(addr: CellAddress): CellHyperlink | null;
```

</details>

<details class="api-member" id="grid-activate-hyperlink" data-pagefind-weight="1">
<summary><code>activateHyperlink</code></summary>

```ts generated
activateHyperlink(addr: CellAddress): boolean;
```

</details>

<details class="api-member" id="grid-set-validation-rule" data-pagefind-weight="1">
<summary><code>setValidationRule</code></summary>

```ts generated
setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-validation-rule" data-pagefind-weight="1">
<summary><code>removeValidationRule</code></summary>

```ts generated
removeValidationRule(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-set-protected-range" data-pagefind-weight="1">
<summary><code>setProtectedRange</code></summary>

```ts generated
setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-protected-range" data-pagefind-weight="1">
<summary><code>removeProtectedRange</code></summary>

```ts generated
removeProtectedRange(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-pivots" data-pagefind-weight="1">
<summary><code>getPivots</code></summary>

```ts generated
getPivots(sheet?: SheetId): PivotDefinition[];
```

</details>

<details class="api-member" id="grid-set-pivot" data-pagefind-weight="1">
<summary><code>setPivot</code></summary>

```ts generated
setPivot(pivot: PivotDefinition, sheet?: SheetId): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-pivot" data-pagefind-weight="1">
<summary><code>removePivot</code></summary>

```ts generated
removePivot(id: string, sheet?: SheetId): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-pivot-fields" data-pagefind-weight="1">
<summary><code>getPivotFields</code></summary>

```ts generated
getPivotFields(sheet: SheetId, id: string): PivotSourceField[];
```

</details>

<details class="api-member" id="grid-get-pivot-result" data-pagefind-weight="1">
<summary><code>getPivotResult</code></summary>

```ts generated
getPivotResult(sheet: SheetId, id: string): PivotResultView | null;
```

</details>

<details class="api-member" id="grid-get-charts" data-pagefind-weight="1">
<summary><code>getCharts</code></summary>

```ts generated
getCharts(sheet?: SheetId): readonly ChartDefinition[];
```

</details>

<details class="api-member" id="grid-set-chart" data-pagefind-weight="1">
<summary><code>setChart</code></summary>

```ts generated
setChart(chart: ChartDefinition, sheet?: SheetId): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-chart" data-pagefind-weight="1">
<summary><code>removeChart</code></summary>

```ts generated
removeChart(id: string, sheet?: SheetId): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-select-chart" data-pagefind-weight="1">
<summary><code>selectChart</code></summary>

```ts generated
selectChart(id: string | null, sheet?: SheetId): void;
```

</details>

<details class="api-member" id="grid-open-panel" data-pagefind-weight="1">
<summary><code>openPanel</code></summary>

```ts generated
openPanel(panel: GridPanel | null): void;
```

</details>

<details class="api-member" id="grid-set-protection-resolver" data-pagefind-weight="1">
<summary><code>setProtectionResolver</code></summary>

```ts generated
setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
```

</details>

<details class="api-member" id="grid-set-note" data-pagefind-weight="1">
<summary><code>setNote</code></summary>

```ts generated
setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-note" data-pagefind-weight="1">
<summary><code>getNote</code></summary>

```ts generated
getNote(addr: CellAddress): string | null;
```

</details>

<details class="api-member" id="grid-set-overscan" data-pagefind-weight="1">
<summary><code>setOverscan</code></summary>

```ts generated
setOverscan(overscan?: number): void;
```

</details>

<details class="api-member" id="grid-set-min-columns" data-pagefind-weight="1">
<summary><code>setMinColumns</code></summary>

```ts generated
setMinColumns(minColumns?: number): void;
```

</details>

<details class="api-member" id="grid-highlight-cells" data-pagefind-weight="1">
<summary><code>highlightCells</code></summary>

```ts generated
highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
```

</details>

<details class="api-member" id="grid-set-presence-overlays" data-pagefind-weight="1">
<summary><code>setPresenceOverlays</code></summary>

```ts generated
setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
```

</details>

<details class="api-member" id="grid-style-range" data-pagefind-weight="1">
<summary><code>styleRange</code></summary>

```ts generated
styleRange(range: Range, style: Partial<CellStyle> | null): void;
```

</details>

<details class="api-member" id="grid-begin-edit" data-pagefind-weight="1">
<summary><code>beginEdit</code></summary>

```ts generated
beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
```

</details>

<details class="api-member" id="grid-data-edge" data-pagefind-weight="1">
<summary><code>dataEdge</code></summary>

```ts generated
dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
```

</details>

<details class="api-member" id="grid-set-row-height" data-pagefind-weight="1">
<summary><code>setRowHeight</code></summary>

```ts generated
setRowHeight(row: number, height: number): void;
```

</details>

<details class="api-member" id="grid-set-column-width" data-pagefind-weight="1">
<summary><code>setColumnWidth</code></summary>

```ts generated
setColumnWidth(col: number, width: number): void;
```

</details>

<details class="api-member" id="grid-auto-fit-rows" data-pagefind-weight="1">
<summary><code>autoFitRows</code></summary>

```ts generated
autoFitRows(range?: Range): void;
```

</details>

<details class="api-member" id="grid-auto-fit-columns" data-pagefind-weight="1">
<summary><code>autoFitColumns</code></summary>

```ts generated
autoFitColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-set-frozen" data-pagefind-weight="1">
<summary><code>setFrozen</code></summary>

```ts generated
setFrozen(rows: number, cols?: number): void;
```

</details>

<details class="api-member" id="grid-set-zoom" data-pagefind-weight="1">
<summary><code>setZoom</code></summary>

```ts generated
setZoom(zoom: number): void;
```

</details>

<details class="api-member" id="grid-get-zoom" data-pagefind-weight="1">
<summary><code>getZoom</code></summary>

```ts generated
getZoom(): number;
```

</details>

<details class="api-member" id="grid-renderer-kind" data-pagefind-weight="1">
<summary><code>rendererKind</code></summary>

```ts generated
rendererKind(): "canvas" | "worker";
```

</details>

<details class="api-member" id="grid-on" data-pagefind-weight="1">
<summary><code>on</code></summary>

```ts generated
on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
```

</details>

<details class="api-member" id="grid-refresh" data-pagefind-weight="1">
<summary><code>refresh</code></summary>

```ts generated
refresh(): void;
```

</details>

<details class="api-member" id="grid-trim-memory" data-pagefind-weight="1">
<summary><code>trimMemory</code></summary>

```ts generated
trimMemory(): void;
```

</details>

<details class="api-member" id="grid-destroy" data-pagefind-weight="1">
<summary><code>destroy</code></summary>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Grid {
  readonly store: Store;
  readonly actions: GridActions;
  getRuntimeResourceSnapshot(
    operation: RuntimeResourceOperation,
    phase: RuntimeResourcePhase,
    runtime?: RuntimeMemoryObservation,
  ): RuntimeResourceSnapshot;
  getCommandState(command: GridCommandName): GridCommandState;
  getFocusCellStyle(): CellStyle;
  summarizeSelection(signal?: AbortSignal): Promise<SelectionSummary | null>;
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
  getActiveSheet(): SheetId;
  getCellInput(row: number, col: number): CellInputSnapshot | null;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
  getTheme(): Theme;
  getShortcutLabel(action: KeyboardAction): string;
  setTheme(theme: Partial<Theme>): void;
  replaceTheme(theme: Partial<Theme> | undefined): void;
  getEffectiveTheme(): Theme;
  setReadOnly(readOnly: boolean): void;
  setConfig(config: GridConfig | undefined): void;
  applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
  exportSnapshot(): WorkbookSnapshot;
  applyRemoteOperations(
    operations: readonly DocumentOp[],
    options?: RemoteOperationOptions,
  ): ApplyTransactionResult;
  defineCellRenderer(name: string, renderer: CellRenderer): void;
  aggregate(col: number, op: AggregateOp): number;
  sortBy(col: number, ascending?: boolean): ApplyTransactionResult;
  filterBy(col: number, needle: string): void;
  setColumnFilter(col: number, filter: ColumnFilter | null): void;
  setViewSort(keys: readonly SortKey[]): ApplyTransactionResult;
  sortRange(
    range: Range,
    keys: readonly SortKey[],
    options?: {
      hasHeader?: boolean;
    },
  ): ApplyTransactionResult;
  getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
  distinctValues(col: number, limit?: number): CellScalar[];
  hideRows(rows: readonly number[]): void;
  showRows(rows?: readonly number[]): void;
  hiddenRows(): readonly number[];
  hideColumns(cols?: readonly number[]): void;
  showColumns(cols?: readonly number[]): void;
  hiddenColumns(): readonly number[];
  groupRows(start: number, end: number): void;
  ungroupRows(start: number, end: number): void;
  setGroupCollapsed(start: number, collapsed: boolean): void;
  rowGroups(): readonly RowGroup[];
  clearView(): void;
  undo(): void;
  redo(): void;
  exportCsv(filename: string): void;
  exportXlsx(filename: string): Promise<void>;
  importWorkbook(
    source:
      WorkbookSnapshot | ((signal: AbortSignal) => Promise<WorkbookSnapshot>),
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<void>;
  search(query: string, opts?: SearchOptions): SearchResult;
  findNext(): SearchResult;
  findPrev(): SearchResult;
  clearSearch(): void;
  replaceCurrent(replacement: string): SearchResult;
  replaceAll(replacement: string): ReplaceResult;
  insertRows(at: number, count?: number): void;
  removeRows(at: number, count?: number): void;
  insertColumns(at: number, count?: number): void;
  removeColumns(at: number, count?: number): void;
  addSheet(input: AddSheetInput): SheetLifecycleResult;
  removeSheet(id: SheetId): SheetLifecycleResult;
  renameSheet(id: SheetId, name: string): SheetLifecycleResult;
  moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;
  setSheetVisibility(
    id: SheetId,
    visibility: SheetVisibility,
  ): SheetLifecycleResult;
  setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
  setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;
  removeHyperlink(id: string): ApplyTransactionResult;
  getHyperlink(addr: CellAddress): CellHyperlink | null;
  activateHyperlink(addr: CellAddress): boolean;
  setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
  removeValidationRule(id: string): ApplyTransactionResult;
  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
  removeProtectedRange(id: string): ApplyTransactionResult;
  getPivots(sheet?: SheetId): PivotDefinition[];
  setPivot(pivot: PivotDefinition, sheet?: SheetId): ApplyTransactionResult;
  removePivot(id: string, sheet?: SheetId): ApplyTransactionResult;
  getPivotFields(sheet: SheetId, id: string): PivotSourceField[];
  getPivotResult(sheet: SheetId, id: string): PivotResultView | null;
  getCharts(sheet?: SheetId): readonly ChartDefinition[];
  setChart(chart: ChartDefinition, sheet?: SheetId): ApplyTransactionResult;
  removeChart(id: string, sheet?: SheetId): ApplyTransactionResult;
  selectChart(id: string | null, sheet?: SheetId): void;
  openPanel(panel: GridPanel | null): void;
  setProtectionResolver(
    resolver: ProtectionResolver | undefined,
    mode?: MutationPolicyMode,
  ): void;
  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
  getNote(addr: CellAddress): string | null;
  setOverscan(overscan?: number): void;
  setMinColumns(minColumns?: number): void;
  highlightCells(
    ranges: readonly HighlightRange[] | null,
    color?: string,
  ): void;
  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
  styleRange(range: Range, style: Partial<CellStyle> | null): void;
  beginEdit(
    row: number,
    col: number,
    initial?: string,
    selectAll?: boolean,
  ): void;
  dataEdge(
    row: number,
    col: number,
    dRow: number,
    dCol: number,
  ): number | null;
  setRowHeight(row: number, height: number): void;
  setColumnWidth(col: number, width: number): void;
  autoFitRows(range?: Range): void;
  autoFitColumns(cols?: readonly number[]): void;
  setFrozen(rows: number, cols?: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  rendererKind(): "canvas" | "worker";
  on<E extends keyof GridEvents>(
    evt: E,
    fn: (e: GridEvents[E]) => void,
  ): () => void;
  refresh(): void;
  trimMemory(): void;
  destroy(): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>Grid</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-editor-context/"><code>CellEditorContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/context-menu-item/"><code>ContextMenuItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/create-grid/"><code>createGrid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/create-grid-from-snapshot/"><code>createGridFromSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-config/"><code>GridConfig</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-coordinator/"><code>PresenceCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/toolbar-item/"><code>ToolbarItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-workbook/"><code>toXlsxWorkbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-workbook-stream/"><code>toXlsxWorkbookStream</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller/"><code>GridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-publication-adapter/"><code>GridPublicationAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 20 more</li>
</ul>
</div>
