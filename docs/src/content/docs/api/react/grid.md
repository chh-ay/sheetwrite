---
title: "Grid | @sheetwrite/react"
description: "Imperative grid handle for document commands, events, rendering, and teardown."
---
<!-- api-export:@sheetwrite/react|.|Grid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="interface">interface</span></div>

Imperative grid handle for document commands, events, rendering, and teardown.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L375</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-store"><code>store</code></a>
<a href="#grid-actions"><code>actions</code></a>
<a href="#grid-get-runtime-resource-snapshot"><code>getRuntimeResourceSnapshot</code></a>
<a href="#grid-get-command-state"><code>getCommandState</code></a>
<a href="#grid-set-active-sheet"><code>setActiveSheet</code></a>
<a href="#grid-scroll-to-cell"><code>scrollToCell</code></a>
<a href="#grid-get-cell-at-point"><code>getCellAtPoint</code></a>
<a href="#grid-get-active-sheet"><code>getActiveSheet</code></a>
<a href="#grid-get-cell-input"><code>getCellInput</code></a>
<a href="#grid-get-selection"><code>getSelection</code></a>
<a href="#grid-set-selection"><code>setSelection</code></a>
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
<a href="#grid-sort-by-multi"><code>sortByMulti</code></a>
<a href="#grid-filter-by"><code>filterBy</code></a>
<a href="#grid-set-column-filter"><code>setColumnFilter</code></a>
<a href="#grid-set-sort"><code>setSort</code></a>
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
<a href="#grid-destroy"><code>destroy</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>88</span>

<div class="api-member-list">

<details class="api-member" id="grid-store" data-pagefind-weight="1" open>
<summary><code>store</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly store: Store;" data-pagefind-ignore>Copy</button>

```ts generated
readonly store: Store;
```

</details>

<details class="api-member" id="grid-actions" data-pagefind-weight="1" open>
<summary><code>actions</code> <span class="api-member-summary">Imperative action surface for binding custom toolbars/menus.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly actions: GridActions;" data-pagefind-ignore>Copy</button>

```ts generated
readonly actions: GridActions;
```

</details>

<details class="api-member" id="grid-get-runtime-resource-snapshot" data-pagefind-weight="1">
<summary><code>getRuntimeResourceSnapshot</code> <span class="api-member-summary">Versioned coarse runtime ownership snapshot, including datasource state.</span></summary>

<button class="api-copy" type="button" data-copy-code="getRuntimeResourceSnapshot(operation: RuntimeResourceOperation, phase: RuntimeResourcePhase, runtime?: RuntimeMemoryObservation): RuntimeResourceSnapshot;" data-pagefind-ignore>Copy</button>

```ts generated
getRuntimeResourceSnapshot(operation: RuntimeResourceOperation, phase: RuntimeResourcePhase, runtime?: RuntimeMemoryObservation): RuntimeResourceSnapshot;
```

</details>

<details class="api-member" id="grid-get-command-state" data-pagefind-weight="1" open>
<summary><code>getCommandState</code> <span class="api-member-summary">Query undo/redo availability and formatting active/mixed/disabled state.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCommandState(command: GridCommandName): GridCommandState;" data-pagefind-ignore>Copy</button>

```ts generated
getCommandState(command: GridCommandName): GridCommandState;
```

</details>

<details class="api-member" id="grid-set-active-sheet" data-pagefind-weight="1" open>
<summary><code>setActiveSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="setActiveSheet(id: SheetId): void;" data-pagefind-ignore>Copy</button>

```ts generated
setActiveSheet(id: SheetId): void;
```

</details>

<details class="api-member" id="grid-scroll-to-cell" data-pagefind-weight="1" open>
<summary><code>scrollToCell</code></summary>

<button class="api-copy" type="button" data-copy-code="scrollToCell(addr: CellAddress): void;" data-pagefind-ignore>Copy</button>

```ts generated
scrollToCell(addr: CellAddress): void;
```

</details>

<details class="api-member" id="grid-get-cell-at-point" data-pagefind-weight="1" open>
<summary><code>getCellAtPoint</code> <span class="api-member-summary">Resolve browser viewport coordinates to an active-sheet cell for host-owned menus and interactions.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCellAtPoint(clientX: number, clientY: number): CellAddress | null;" data-pagefind-ignore>Copy</button>

```ts generated
getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
```

<p class="api-member-doc">Resolve browser viewport coordinates to an active-sheet cell for host-owned
menus and interactions. Returns null outside the cell body.</p>
</details>

<details class="api-member" id="grid-get-active-sheet" data-pagefind-weight="1" open>
<summary><code>getActiveSheet</code> <span class="api-member-summary">Id of the currently visible sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="getActiveSheet(): SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
getActiveSheet(): SheetId;
```

</details>

<details class="api-member" id="grid-get-cell-input" data-pagefind-weight="1" open>
<summary><code>getCellInput</code> <span class="api-member-summary">Editable snapshot of the cell at a view position on the active sheet, or null when out of bounds.</span></summary>

<button class="api-copy" type="button" data-copy-code="getCellInput(row: number, col: number): CellInputSnapshot | null;" data-pagefind-ignore>Copy</button>

```ts generated
getCellInput(row: number, col: number): CellInputSnapshot | null;
```

<p class="api-member-doc">Editable snapshot of the cell at a view position on the active sheet, or
null when out of bounds. See <a href="/docs/api/core/cell-input-snapshot/"><code>CellInputSnapshot</code></a>.</p>
</details>

<details class="api-member" id="grid-get-selection" data-pagefind-weight="1" open>
<summary><code>getSelection</code></summary>

<button class="api-copy" type="button" data-copy-code="getSelection(): Selection | null;" data-pagefind-ignore>Copy</button>

```ts generated
getSelection(): Selection | null;
```

</details>

<details class="api-member" id="grid-set-selection" data-pagefind-weight="1" open>
<summary><code>setSelection</code></summary>

<button class="api-copy" type="button" data-copy-code="setSelection(sel: Selection | null): void;" data-pagefind-ignore>Copy</button>

```ts generated
setSelection(sel: Selection | null): void;
```

</details>

<details class="api-member" id="grid-set-theme" data-pagefind-weight="1" open>
<summary><code>setTheme</code> <span class="api-member-summary">Imperative patch: merge theme into the accumulated base theme.</span></summary>

<button class="api-copy" type="button" data-copy-code="setTheme(theme: Partial&lt;Theme&gt;): void;" data-pagefind-ignore>Copy</button>

```ts generated
setTheme(theme: Partial<Theme>): void;
```

</details>

<details class="api-member" id="grid-replace-theme" data-pagefind-weight="1" open>
<summary><code>replaceTheme</code> <span class="api-member-summary">Option-level replacement: re-run construction-time resolution (DEFAULTTHEME &lt; CSS custom properties &lt; theme) with the new partial.</span></summary>

<button class="api-copy" type="button" data-copy-code="replaceTheme(theme: Partial&lt;Theme&gt; | undefined): void;" data-pagefind-ignore>Copy</button>

```ts generated
replaceTheme(theme: Partial<Theme> | undefined): void;
```

<p class="api-member-doc">Option-level replacement: re-run construction-time resolution
(`DEFAULT_THEME &lt; CSS custom properties &lt; theme`) with the new partial.
`undefined` restores the CSS-variable/default resolution. Adapters call
this for their declarative `theme` prop; imperative patching stays on
<a href="/docs/api/react/grid/#grid-set-theme"><code>setTheme</code></a>.</p>
</details>

<details class="api-member" id="grid-get-effective-theme" data-pagefind-weight="1" open>
<summary><code>getEffectiveTheme</code> <span class="api-member-summary">The effective (post-zoom) theme the renderer is currently painting with.</span></summary>

<button class="api-copy" type="button" data-copy-code="getEffectiveTheme(): Theme;" data-pagefind-ignore>Copy</button>

```ts generated
getEffectiveTheme(): Theme;
```

</details>

<details class="api-member" id="grid-set-read-only" data-pagefind-weight="1" open>
<summary><code>setReadOnly</code> <span class="api-member-summary">Update editability without replacing the Grid or clearing session state.</span></summary>

<button class="api-copy" type="button" data-copy-code="setReadOnly(readOnly: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
setReadOnly(readOnly: boolean): void;
```

</details>

<details class="api-member" id="grid-set-config" data-pagefind-weight="1" open>
<summary><code>setConfig</code> <span class="api-member-summary">Reconfigure built-in chrome and keyboard handling without replacing the Grid or clearing selection/history.</span></summary>

<button class="api-copy" type="button" data-copy-code="setConfig(config: GridConfig | undefined): void;" data-pagefind-ignore>Copy</button>

```ts generated
setConfig(config: GridConfig | undefined): void;
```

<p class="api-member-doc">Reconfigure built-in chrome and keyboard handling without replacing the
Grid or clearing selection/history. Construction-bound GridOptions are not
accepted here.</p>
</details>

<details class="api-member" id="grid-apply-transaction" data-pagefind-weight="1" open>
<summary><code>applyTransaction</code> <span class="api-member-summary">Apply arbitrary patches as one undoable Grid commit.</span></summary>

<button class="api-copy" type="button" data-copy-code="applyTransaction(transaction: GridTransaction): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
applyTransaction(transaction: GridTransaction): ApplyTransactionResult;
```

<p class="api-member-doc">Apply arbitrary patches as one undoable Grid commit. No-op when read-only.
Use `Store.applyTransaction` only for low-level writes that intentionally
bypass Grid history and policy.</p>
</details>

<details class="api-member" id="grid-export-snapshot" data-pagefind-weight="1" open>
<summary><code>exportSnapshot</code> <span class="api-member-summary">Deterministically export the complete authoritative workbook document.</span></summary>

<button class="api-copy" type="button" data-copy-code="exportSnapshot(): WorkbookSnapshot;" data-pagefind-ignore>Copy</button>

```ts generated
exportSnapshot(): WorkbookSnapshot;
```

</details>

<details class="api-member" id="grid-apply-remote-operations" data-pagefind-weight="1">
<summary><code>applyRemoteOperations</code> <span class="api-member-summary">Apply host-supplied operations without undo history or outgoing dirty state.</span></summary>

<button class="api-copy" type="button" data-copy-code="applyRemoteOperations(operations: readonly DocumentOp[], options?: RemoteOperationOptions): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
applyRemoteOperations(operations: readonly DocumentOp[], options?: RemoteOperationOptions): ApplyTransactionResult;
```

<p class="api-member-doc">Apply host-supplied operations without undo history or outgoing dirty state.
The resulting change event has `source: &quot;remote&quot;`.</p>
</details>

<details class="api-member" id="grid-define-cell-renderer" data-pagefind-weight="1" open>
<summary><code>defineCellRenderer</code></summary>

<button class="api-copy" type="button" data-copy-code="defineCellRenderer(name: string, renderer: CellRenderer): void;" data-pagefind-ignore>Copy</button>

```ts generated
defineCellRenderer(name: string, renderer: CellRenderer): void;
```

</details>

<details class="api-member" id="grid-aggregate" data-pagefind-weight="1" open>
<summary><code>aggregate</code> <span class="api-member-summary">Column aggregate over the active sheet's data.</span></summary>

<button class="api-copy" type="button" data-copy-code="aggregate(col: number, op: AggregateOp): number;" data-pagefind-ignore>Copy</button>

```ts generated
aggregate(col: number, op: AggregateOp): number;
```

</details>

<details class="api-member" id="grid-sort-by" data-pagefind-weight="1" open>
<summary><code>sortBy</code> <span class="api-member-summary">Sort the displayed rows by a column (does not mutate stored data).</span></summary>

<button class="api-copy" type="button" data-copy-code="sortBy(col: number, ascending?: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
sortBy(col: number, ascending?: boolean): void;
```

</details>

<details class="api-member" id="grid-sort-by-multi" data-pagefind-weight="1" open>
<summary><code>sortByMulti</code> <span class="api-member-summary">Multi-key sort of the displayed rows (first key primary; stable).</span></summary>

<button class="api-copy" type="button" data-copy-code="sortByMulti(keys: readonly SortKey[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
sortByMulti(keys: readonly SortKey[]): void;
```

</details>

<details class="api-member" id="grid-filter-by" data-pagefind-weight="1" open>
<summary><code>filterBy</code> <span class="api-member-summary">Filter the displayed rows to those whose column text contains needle.</span></summary>

<button class="api-copy" type="button" data-copy-code="filterBy(col: number, needle: string): void;" data-pagefind-ignore>Copy</button>

```ts generated
filterBy(col: number, needle: string): void;
```

</details>

<details class="api-member" id="grid-set-column-filter" data-pagefind-weight="1" open>
<summary><code>setColumnFilter</code> <span class="api-member-summary">Set or clear (null) one column's filter.</span></summary>

<button class="api-copy" type="button" data-copy-code="setColumnFilter(col: number, filter: ColumnFilter | null): void;" data-pagefind-ignore>Copy</button>

```ts generated
setColumnFilter(col: number, filter: ColumnFilter | null): void;
```

<p class="api-member-doc">Set or clear (null) one column's filter. All column filters AND together
and compose with the active sort and hidden rows.</p>
</details>

<details class="api-member" id="grid-set-sort" data-pagefind-weight="1" open>
<summary><code>setSort</code> <span class="api-member-summary">Persisted multi-key sort of the active sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="setSort(keys: readonly SortKey[]): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
setSort(keys: readonly SortKey[]): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-column-filters" data-pagefind-weight="1" open>
<summary><code>getColumnFilters</code> <span class="api-member-summary">Active column filters on the active sheet, keyed by column index.</span></summary>

<button class="api-copy" type="button" data-copy-code="getColumnFilters(): ReadonlyMap&lt;number, ColumnFilter&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
getColumnFilters(): ReadonlyMap<number, ColumnFilter>;
```

</details>

<details class="api-member" id="grid-distinct-values" data-pagefind-weight="1" open>
<summary><code>distinctValues</code> <span class="api-member-summary">Distinct resolved values of a column in first-seen order.</span></summary>

<button class="api-copy" type="button" data-copy-code="distinctValues(col: number, limit?: number): CellScalar[];" data-pagefind-ignore>Copy</button>

```ts generated
distinctValues(col: number, limit?: number): CellScalar[];
```

<p class="api-member-doc">Distinct resolved values of a column in first-seen order. Defaults to
1,000 values for bounded filter menus; pass 0 to request an uncapped scan.</p>
</details>

<details class="api-member" id="grid-hide-rows" data-pagefind-weight="1" open>
<summary><code>hideRows</code> <span class="api-member-summary">Hide the given data rows (composes with filters/sort).</span></summary>

<button class="api-copy" type="button" data-copy-code="hideRows(rows: readonly number[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
hideRows(rows: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-show-rows" data-pagefind-weight="1" open>
<summary><code>showRows</code> <span class="api-member-summary">Show the given data rows again, or every hidden row when omitted.</span></summary>

<button class="api-copy" type="button" data-copy-code="showRows(rows?: readonly number[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
showRows(rows?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-hidden-rows" data-pagefind-weight="1" open>
<summary><code>hiddenRows</code> <span class="api-member-summary">Currently hidden data rows on the active sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="hiddenRows(): readonly number[];" data-pagefind-ignore>Copy</button>

```ts generated
hiddenRows(): readonly number[];
```

</details>

<details class="api-member" id="grid-hide-columns" data-pagefind-weight="1" open>
<summary><code>hideColumns</code> <span class="api-member-summary">Hide columns through one bulk-safe metadata transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="hideColumns(cols?: readonly number[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
hideColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-show-columns" data-pagefind-weight="1" open>
<summary><code>showColumns</code> <span class="api-member-summary">Show columns through one bulk-safe metadata transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="showColumns(cols?: readonly number[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
showColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-hidden-columns" data-pagefind-weight="1" open>
<summary><code>hiddenColumns</code> <span class="api-member-summary">Currently hidden columns on the active sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="hiddenColumns(): readonly number[];" data-pagefind-ignore>Copy</button>

```ts generated
hiddenColumns(): readonly number[];
```

</details>

<details class="api-member" id="grid-group-rows" data-pagefind-weight="1" open>
<summary><code>groupRows</code> <span class="api-member-summary">Define a collapsible row group over a data-row range (end-inclusive).</span></summary>

<button class="api-copy" type="button" data-copy-code="groupRows(start: number, end: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
groupRows(start: number, end: number): void;
```

</details>

<details class="api-member" id="grid-ungroup-rows" data-pagefind-weight="1" open>
<summary><code>ungroupRows</code> <span class="api-member-summary">Remove a row group (rows become visible if the group was collapsed).</span></summary>

<button class="api-copy" type="button" data-copy-code="ungroupRows(start: number, end: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
ungroupRows(start: number, end: number): void;
```

</details>

<details class="api-member" id="grid-set-group-collapsed" data-pagefind-weight="1" open>
<summary><code>setGroupCollapsed</code> <span class="api-member-summary">Collapse/expand a row group; collapsing hides its rows.</span></summary>

<button class="api-copy" type="button" data-copy-code="setGroupCollapsed(start: number, collapsed: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
setGroupCollapsed(start: number, collapsed: boolean): void;
```

</details>

<details class="api-member" id="grid-row-groups" data-pagefind-weight="1" open>
<summary><code>rowGroups</code> <span class="api-member-summary">Row groups on the active sheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowGroups(): readonly RowGroup[];" data-pagefind-ignore>Copy</button>

```ts generated
rowGroups(): readonly RowGroup[];
```

</details>

<details class="api-member" id="grid-clear-view" data-pagefind-weight="1" open>
<summary><code>clearView</code> <span class="api-member-summary">Clear any active sort/filter view.</span></summary>

<button class="api-copy" type="button" data-copy-code="clearView(): void;" data-pagefind-ignore>Copy</button>

```ts generated
clearView(): void;
```

</details>

<details class="api-member" id="grid-undo" data-pagefind-weight="1" open>
<summary><code>undo</code> <span class="api-member-summary">Undo the last recorded cell edit.</span></summary>

<button class="api-copy" type="button" data-copy-code="undo(): void;" data-pagefind-ignore>Copy</button>

```ts generated
undo(): void;
```

</details>

<details class="api-member" id="grid-redo" data-pagefind-weight="1" open>
<summary><code>redo</code> <span class="api-member-summary">Redo the last undone cell edit.</span></summary>

<button class="api-copy" type="button" data-copy-code="redo(): void;" data-pagefind-ignore>Copy</button>

```ts generated
redo(): void;
```

</details>

<details class="api-member" id="grid-export-csv" data-pagefind-weight="1" open>
<summary><code>exportCsv</code></summary>

<button class="api-copy" type="button" data-copy-code="exportCsv(filename: string): void;" data-pagefind-ignore>Copy</button>

```ts generated
exportCsv(filename: string): void;
```

</details>

<details class="api-member" id="grid-export-xlsx" data-pagefind-weight="1" open>
<summary><code>exportXlsx</code></summary>

<button class="api-copy" type="button" data-copy-code="exportXlsx(filename: string): Promise&lt;void&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
exportXlsx(filename: string): Promise<void>;
```

</details>

<details class="api-member" id="grid-search" data-pagefind-weight="1" open>
<summary><code>search</code> <span class="api-member-summary">Find cells matching query; highlights matches, emits search, returns the result.</span></summary>

<button class="api-copy" type="button" data-copy-code="search(query: string, opts?: SearchOptions): SearchResult;" data-pagefind-ignore>Copy</button>

```ts generated
search(query: string, opts?: SearchOptions): SearchResult;
```

</details>

<details class="api-member" id="grid-find-next" data-pagefind-weight="1" open>
<summary><code>findNext</code> <span class="api-member-summary">Move the active match to the next match and scroll it into view.</span></summary>

<button class="api-copy" type="button" data-copy-code="findNext(): SearchResult;" data-pagefind-ignore>Copy</button>

```ts generated
findNext(): SearchResult;
```

</details>

<details class="api-member" id="grid-find-prev" data-pagefind-weight="1" open>
<summary><code>findPrev</code> <span class="api-member-summary">Move the active match to the previous match and scroll it into view.</span></summary>

<button class="api-copy" type="button" data-copy-code="findPrev(): SearchResult;" data-pagefind-ignore>Copy</button>

```ts generated
findPrev(): SearchResult;
```

</details>

<details class="api-member" id="grid-clear-search" data-pagefind-weight="1" open>
<summary><code>clearSearch</code> <span class="api-member-summary">Clear the current search and its highlights.</span></summary>

<button class="api-copy" type="button" data-copy-code="clearSearch(): void;" data-pagefind-ignore>Copy</button>

```ts generated
clearSearch(): void;
```

</details>

<details class="api-member" id="grid-replace-current" data-pagefind-weight="1" open>
<summary><code>replaceCurrent</code> <span class="api-member-summary">Replace the active match with replacement, then advance to the next match (re-scanning against the new data).</span></summary>

<button class="api-copy" type="button" data-copy-code="replaceCurrent(replacement: string): SearchResult;" data-pagefind-ignore>Copy</button>

```ts generated
replaceCurrent(replacement: string): SearchResult;
```

<p class="api-member-doc">Replace the active match with `replacement`, then advance to the next match
(re-scanning against the new data). Only literal text/number cells are
eligible; formula and ref cells are skipped (formula source is never
rewritten). Honors the active <a href="/docs/api/core/search-options/"><code>SearchOptions</code></a> (matchCase; `wholeCell`
swaps the entire cell). The write flows through the grid's commit path as
one undoable step. No-op when read-only or when there is no active match.</p>
</details>

<details class="api-member" id="grid-replace-all" data-pagefind-weight="1" open>
<summary><code>replaceAll</code> <span class="api-member-summary">Replace every current match in a single undoable transaction (one undo() restores them all), then re-scan.</span></summary>

<button class="api-copy" type="button" data-copy-code="replaceAll(replacement: string): ReplaceResult;" data-pagefind-ignore>Copy</button>

```ts generated
replaceAll(replacement: string): ReplaceResult;
```

<p class="api-member-doc">Replace every current match in a single undoable transaction (one
`undo()` restores them all), then re-scan. Formula/ref cells are skipped
and not counted. No-op when read-only.</p>
</details>

<details class="api-member" id="grid-insert-rows" data-pagefind-weight="1" open>
<summary><code>insertRows</code></summary>

<button class="api-copy" type="button" data-copy-code="insertRows(at: number, count?: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
insertRows(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-remove-rows" data-pagefind-weight="1" open>
<summary><code>removeRows</code></summary>

<button class="api-copy" type="button" data-copy-code="removeRows(at: number, count?: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
removeRows(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-insert-columns" data-pagefind-weight="1" open>
<summary><code>insertColumns</code></summary>

<button class="api-copy" type="button" data-copy-code="insertColumns(at: number, count?: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
insertColumns(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-remove-columns" data-pagefind-weight="1" open>
<summary><code>removeColumns</code></summary>

<button class="api-copy" type="button" data-copy-code="removeColumns(at: number, count?: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
removeColumns(at: number, count?: number): void;
```

</details>

<details class="api-member" id="grid-add-sheet" data-pagefind-weight="1" open>
<summary><code>addSheet</code> <span class="api-member-summary">Add a sheet with a stable ID and return its actionable transaction outcome.</span></summary>

<button class="api-copy" type="button" data-copy-code="addSheet(input: AddSheetInput): SheetLifecycleResult;" data-pagefind-ignore>Copy</button>

```ts generated
addSheet(input: AddSheetInput): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-remove-sheet" data-pagefind-weight="1" open>
<summary><code>removeSheet</code> <span class="api-member-summary">Remove a sheet while preserving at least one visible worksheet.</span></summary>

<button class="api-copy" type="button" data-copy-code="removeSheet(id: SheetId): SheetLifecycleResult;" data-pagefind-ignore>Copy</button>

```ts generated
removeSheet(id: SheetId): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-rename-sheet" data-pagefind-weight="1" open>
<summary><code>renameSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="renameSheet(id: SheetId, name: string): SheetLifecycleResult;" data-pagefind-ignore>Copy</button>

```ts generated
renameSheet(id: SheetId, name: string): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-move-sheet" data-pagefind-weight="1" open>
<summary><code>moveSheet</code></summary>

<button class="api-copy" type="button" data-copy-code="moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;" data-pagefind-ignore>Copy</button>

```ts generated
moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-set-sheet-visibility" data-pagefind-weight="1" open>
<summary><code>setSheetVisibility</code> <span class="api-member-summary">Set host-visible worksheet state; stock UI never offers veryHidden.</span></summary>

<button class="api-copy" type="button" data-copy-code="setSheetVisibility(id: SheetId, visibility: SheetVisibility): SheetLifecycleResult;" data-pagefind-ignore>Copy</button>

```ts generated
setSheetVisibility(id: SheetId, visibility: SheetVisibility): SheetLifecycleResult;
```

</details>

<details class="api-member" id="grid-set-conditional-formats" data-pagefind-weight="1" open>
<summary><code>setConditionalFormats</code></summary>

<button class="api-copy" type="button" data-copy-code="setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;
```

</details>

<details class="api-member" id="grid-set-hyperlink" data-pagefind-weight="1" open>
<summary><code>setHyperlink</code></summary>

<button class="api-copy" type="button" data-copy-code="setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-hyperlink" data-pagefind-weight="1" open>
<summary><code>removeHyperlink</code></summary>

<button class="api-copy" type="button" data-copy-code="removeHyperlink(id: string): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
removeHyperlink(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-hyperlink" data-pagefind-weight="1" open>
<summary><code>getHyperlink</code></summary>

<button class="api-copy" type="button" data-copy-code="getHyperlink(addr: CellAddress): CellHyperlink | null;" data-pagefind-ignore>Copy</button>

```ts generated
getHyperlink(addr: CellAddress): CellHyperlink | null;
```

</details>

<details class="api-member" id="grid-activate-hyperlink" data-pagefind-weight="1" open>
<summary><code>activateHyperlink</code> <span class="api-member-summary">Validate and emit a host-owned activation event.</span></summary>

<button class="api-copy" type="button" data-copy-code="activateHyperlink(addr: CellAddress): boolean;" data-pagefind-ignore>Copy</button>

```ts generated
activateHyperlink(addr: CellAddress): boolean;
```

<p class="api-member-doc">Validate and emit a host-owned activation event. External targets are never
opened by Sheetwrite; internal navigation occurs only under the explicit policy.</p>
</details>

<details class="api-member" id="grid-set-validation-rule" data-pagefind-weight="1" open>
<summary><code>setValidationRule</code></summary>

<button class="api-copy" type="button" data-copy-code="setValidationRule(rule: DataValidationRule): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
setValidationRule(rule: DataValidationRule): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-validation-rule" data-pagefind-weight="1" open>
<summary><code>removeValidationRule</code></summary>

<button class="api-copy" type="button" data-copy-code="removeValidationRule(id: string): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
removeValidationRule(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-set-protected-range" data-pagefind-weight="1" open>
<summary><code>setProtectedRange</code></summary>

<button class="api-copy" type="button" data-copy-code="setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-remove-protected-range" data-pagefind-weight="1" open>
<summary><code>removeProtectedRange</code></summary>

<button class="api-copy" type="button" data-copy-code="removeProtectedRange(id: string): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
removeProtectedRange(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-set-protection-resolver" data-pagefind-weight="1" open>
<summary><code>setProtectionResolver</code></summary>

<button class="api-copy" type="button" data-copy-code="setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;" data-pagefind-ignore>Copy</button>

```ts generated
setProtectionResolver(resolver: ProtectionResolver | undefined, mode?: MutationPolicyMode): void;
```

</details>

<details class="api-member" id="grid-set-note" data-pagefind-weight="1" open>
<summary><code>setNote</code></summary>

<button class="api-copy" type="button" data-copy-code="setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;" data-pagefind-ignore>Copy</button>

```ts generated
setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;
```

</details>

<details class="api-member" id="grid-get-note" data-pagefind-weight="1" open>
<summary><code>getNote</code></summary>

<button class="api-copy" type="button" data-copy-code="getNote(addr: CellAddress): string | null;" data-pagefind-ignore>Copy</button>

```ts generated
getNote(addr: CellAddress): string | null;
```

</details>

<details class="api-member" id="grid-set-overscan" data-pagefind-weight="1" open>
<summary><code>setOverscan</code> <span class="api-member-summary">Live-update the render window overscan (row/column positions painted past each edge); undefined restores the default of 6.</span></summary>

<button class="api-copy" type="button" data-copy-code="setOverscan(overscan?: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
setOverscan(overscan?: number): void;
```

</details>

<details class="api-member" id="grid-set-min-columns" data-pagefind-weight="1" open>
<summary><code>setMinColumns</code> <span class="api-member-summary">Live-update the minimum rendered column count.</span></summary>

<button class="api-copy" type="button" data-copy-code="setMinColumns(minColumns?: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
setMinColumns(minColumns?: number): void;
```

<p class="api-member-doc">Live-update the minimum rendered column count. Increasing the minimum
silently extends presentation padding; `undefined` restores the default.</p>
</details>

<details class="api-member" id="grid-highlight-cells" data-pagefind-weight="1" open>
<summary><code>highlightCells</code> <span class="api-member-summary">Highlight arbitrary cell ranges (null clears).</span></summary>

<button class="api-copy" type="button" data-copy-code="highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;" data-pagefind-ignore>Copy</button>

```ts generated
highlightCells(ranges: readonly HighlightRange[] | null, color?: string): void;
```

<p class="api-member-doc">Highlight arbitrary cell ranges (null clears). Per-range `color` wins over the call color.</p>
</details>

<details class="api-member" id="grid-set-presence-overlays" data-pagefind-weight="1" open>
<summary><code>setPresenceOverlays</code> <span class="api-member-summary">Replace ephemeral remote-presence overlays; null clears every collaborator.</span></summary>

<button class="api-copy" type="button" data-copy-code="setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;" data-pagefind-ignore>Copy</button>

```ts generated
setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;
```

</details>

<details class="api-member" id="grid-style-range" data-pagefind-weight="1" open>
<summary><code>styleRange</code> <span class="api-member-summary">Merge style into every cell of range (null clears cell styles) as one undoable transaction.</span></summary>

<button class="api-copy" type="button" data-copy-code="styleRange(range: Range, style: Partial&lt;CellStyle&gt; | null): void;" data-pagefind-ignore>Copy</button>

```ts generated
styleRange(range: Range, style: Partial<CellStyle> | null): void;
```

<p class="api-member-doc">Merge `style` into every cell of `range` (null clears cell styles) as one
undoable transaction. Styles land in the store and paint in the canvas —
unlike <a href="/docs/api/react/grid/#grid-highlight-cells"><code>highlightCells</code></a>, which draws a translucent overlay above it.</p>
</details>

<details class="api-member" id="grid-begin-edit" data-pagefind-weight="1" open>
<summary><code>beginEdit</code> <span class="api-member-summary">Open the cell editor at a view cell, optionally seeding text / selecting all.</span></summary>

<button class="api-copy" type="button" data-copy-code="beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;" data-pagefind-ignore>Copy</button>

```ts generated
beginEdit(row: number, col: number, initial?: string, selectAll?: boolean): void;
```

</details>

<details class="api-member" id="grid-data-edge" data-pagefind-weight="1" open>
<summary><code>dataEdge</code> <span class="api-member-summary">Ctrl+Arrow-style jump target: the data-run edge from (row, col) on the moved axis (row for vertical moves, col for horizontal), or null when the store is not columnar.</span></summary>

<button class="api-copy" type="button" data-copy-code="dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;" data-pagefind-ignore>Copy</button>

```ts generated
dataEdge(row: number, col: number, dRow: number, dCol: number): number | null;
```

<p class="api-member-doc">Ctrl+Arrow-style jump target: the data-run edge from (row, col) on the
moved axis (row for vertical moves, col for horizontal), or null when the
store is not columnar. Under an active sort/filter view, `row` is a view
position and vertical moves return view positions. For hosts building
their own keymaps (`config.keyboard`).</p>
</details>

<details class="api-member" id="grid-set-row-height" data-pagefind-weight="1" open>
<summary><code>setRowHeight</code> <span class="api-member-summary">Set one row's persistent display height through document history.</span></summary>

<button class="api-copy" type="button" data-copy-code="setRowHeight(row: number, height: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
setRowHeight(row: number, height: number): void;
```

</details>

<details class="api-member" id="grid-set-column-width" data-pagefind-weight="1" open>
<summary><code>setColumnWidth</code> <span class="api-member-summary">Set one column's width via an undoable setColumn patch.</span></summary>

<button class="api-copy" type="button" data-copy-code="setColumnWidth(col: number, width: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
setColumnWidth(col: number, width: number): void;
```

</details>

<details class="api-member" id="grid-auto-fit-rows" data-pagefind-weight="1" open>
<summary><code>autoFitRows</code> <span class="api-member-summary">Explicitly resize rows to fit wrapped content; never runs during paint.</span></summary>

<button class="api-copy" type="button" data-copy-code="autoFitRows(range?: Range): void;" data-pagefind-ignore>Copy</button>

```ts generated
autoFitRows(range?: Range): void;
```

</details>

<details class="api-member" id="grid-auto-fit-columns" data-pagefind-weight="1" open>
<summary><code>autoFitColumns</code> <span class="api-member-summary">Explicitly resize columns from a bulk worksheet read.</span></summary>

<button class="api-copy" type="button" data-copy-code="autoFitColumns(cols?: readonly number[]): void;" data-pagefind-ignore>Copy</button>

```ts generated
autoFitColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-set-frozen" data-pagefind-weight="1" open>
<summary><code>setFrozen</code> <span class="api-member-summary">Pin the first rows view rows and cols columns; they stay visible while the body scrolls (0 = unfreeze that axis).</span></summary>

<button class="api-copy" type="button" data-copy-code="setFrozen(rows: number, cols?: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
setFrozen(rows: number, cols?: number): void;
```

<p class="api-member-doc">Pin the first `rows` view rows and `cols` columns; they stay visible while
the body scrolls (0 = unfreeze that axis). Persisted on the active sheet.</p>
</details>

<details class="api-member" id="grid-set-zoom" data-pagefind-weight="1" open>
<summary><code>setZoom</code> <span class="api-member-summary">Content zoom factor (0.5–2): scales row/column geometry and fonts.</span></summary>

<button class="api-copy" type="button" data-copy-code="setZoom(zoom: number): void;" data-pagefind-ignore>Copy</button>

```ts generated
setZoom(zoom: number): void;
```

</details>

<details class="api-member" id="grid-get-zoom" data-pagefind-weight="1" open>
<summary><code>getZoom</code></summary>

<button class="api-copy" type="button" data-copy-code="getZoom(): number;" data-pagefind-ignore>Copy</button>

```ts generated
getZoom(): number;
```

</details>

<details class="api-member" id="grid-renderer-kind" data-pagefind-weight="1" open>
<summary><code>rendererKind</code> <span class="api-member-summary">Which renderer is actually active: &quot;worker&quot; when the OffscreenCanvas worker constructed successfully, &quot;canvas&quot; otherwise (including after a renderer-fallback).</span></summary>

<button class="api-copy" type="button" data-copy-code="rendererKind(): &quot;canvas&quot; | &quot;worker&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
rendererKind(): "canvas" | "worker";
```

</details>

<details class="api-member" id="grid-on" data-pagefind-weight="1" open>
<summary><code>on</code></summary>

<button class="api-copy" type="button" data-copy-code="on&lt;E extends keyof GridEvents&gt;(evt: E, fn: (e: GridEvents[E]) =&gt; void): () =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
on<E extends keyof GridEvents>(evt: E, fn: (e: GridEvents[E]) => void): () => void;
```

</details>

<details class="api-member" id="grid-refresh" data-pagefind-weight="1" open>
<summary><code>refresh</code></summary>

<button class="api-copy" type="button" data-copy-code="refresh(): void;" data-pagefind-ignore>Copy</button>

```ts generated
refresh(): void;
```

</details>

<details class="api-member" id="grid-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code></summary>

<button class="api-copy" type="button" data-copy-code="destroy(): void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface Grid {&#10;  readonly store: Store;&#10;  readonly actions: GridActions;&#10;  getRuntimeResourceSnapshot(&#10;    operation: RuntimeResourceOperation,&#10;    phase: RuntimeResourcePhase,&#10;    runtime?: RuntimeMemoryObservation,&#10;  ): RuntimeResourceSnapshot;&#10;  getCommandState(command: GridCommandName): GridCommandState;&#10;  setActiveSheet(id: SheetId): void;&#10;  scrollToCell(addr: CellAddress): void;&#10;  getCellAtPoint(clientX: number, clientY: number): CellAddress | null;&#10;  getActiveSheet(): SheetId;&#10;  getCellInput(row: number, col: number): CellInputSnapshot | null;&#10;  getSelection(): Selection | null;&#10;  setSelection(sel: Selection | null): void;&#10;  setTheme(theme: Partial&lt;Theme&gt;): void;&#10;  replaceTheme(theme: Partial&lt;Theme&gt; | undefined): void;&#10;  getEffectiveTheme(): Theme;&#10;  setReadOnly(readOnly: boolean): void;&#10;  setConfig(config: GridConfig | undefined): void;&#10;  applyTransaction(transaction: GridTransaction): ApplyTransactionResult;&#10;  exportSnapshot(): WorkbookSnapshot;&#10;  applyRemoteOperations(&#10;    operations: readonly DocumentOp[],&#10;    options?: RemoteOperationOptions,&#10;  ): ApplyTransactionResult;&#10;  defineCellRenderer(name: string, renderer: CellRenderer): void;&#10;  aggregate(col: number, op: AggregateOp): number;&#10;  sortBy(col: number, ascending?: boolean): void;&#10;  sortByMulti(keys: readonly SortKey[]): void;&#10;  filterBy(col: number, needle: string): void;&#10;  setColumnFilter(col: number, filter: ColumnFilter | null): void;&#10;  setSort(keys: readonly SortKey[]): ApplyTransactionResult;&#10;  getColumnFilters(): ReadonlyMap&lt;number, ColumnFilter&gt;;&#10;  distinctValues(col: number, limit?: number): CellScalar[];&#10;  hideRows(rows: readonly number[]): void;&#10;  showRows(rows?: readonly number[]): void;&#10;  hiddenRows(): readonly number[];&#10;  hideColumns(cols?: readonly number[]): void;&#10;  showColumns(cols?: readonly number[]): void;&#10;  hiddenColumns(): readonly number[];&#10;  groupRows(start: number, end: number): void;&#10;  ungroupRows(start: number, end: number): void;&#10;  setGroupCollapsed(start: number, collapsed: boolean): void;&#10;  rowGroups(): readonly RowGroup[];&#10;  clearView(): void;&#10;  undo(): void;&#10;  redo(): void;&#10;  exportCsv(filename: string): void;&#10;  exportXlsx(filename: string): Promise&lt;void&gt;;&#10;  search(query: string, opts?: SearchOptions): SearchResult;&#10;  findNext(): SearchResult;&#10;  findPrev(): SearchResult;&#10;  clearSearch(): void;&#10;  replaceCurrent(replacement: string): SearchResult;&#10;  replaceAll(replacement: string): ReplaceResult;&#10;  insertRows(at: number, count?: number): void;&#10;  removeRows(at: number, count?: number): void;&#10;  insertColumns(at: number, count?: number): void;&#10;  removeColumns(at: number, count?: number): void;&#10;  addSheet(input: AddSheetInput): SheetLifecycleResult;&#10;  removeSheet(id: SheetId): SheetLifecycleResult;&#10;  renameSheet(id: SheetId, name: string): SheetLifecycleResult;&#10;  moveSheet(id: SheetId, toIndex: number): SheetLifecycleResult;&#10;  setSheetVisibility(&#10;    id: SheetId,&#10;    visibility: SheetVisibility,&#10;  ): SheetLifecycleResult;&#10;  setConditionalFormats(rules: readonly ConditionalFormatRule[]): void;&#10;  setHyperlink(hyperlink: CellHyperlink): ApplyTransactionResult;&#10;  removeHyperlink(id: string): ApplyTransactionResult;&#10;  getHyperlink(addr: CellAddress): CellHyperlink | null;&#10;  activateHyperlink(addr: CellAddress): boolean;&#10;  setValidationRule(rule: DataValidationRule): ApplyTransactionResult;&#10;  removeValidationRule(id: string): ApplyTransactionResult;&#10;  setProtectedRange(protectedRange: ProtectedRange): ApplyTransactionResult;&#10;  removeProtectedRange(id: string): ApplyTransactionResult;&#10;  setProtectionResolver(&#10;    resolver: ProtectionResolver | undefined,&#10;    mode?: MutationPolicyMode,&#10;  ): void;&#10;  setNote(addr: CellAddress, text: string | null): ApplyTransactionResult;&#10;  getNote(addr: CellAddress): string | null;&#10;  setOverscan(overscan?: number): void;&#10;  setMinColumns(minColumns?: number): void;&#10;  highlightCells(&#10;    ranges: readonly HighlightRange[] | null,&#10;    color?: string,&#10;  ): void;&#10;  setPresenceOverlays(overlays: readonly PresenceOverlay[] | null): void;&#10;  styleRange(range: Range, style: Partial&lt;CellStyle&gt; | null): void;&#10;  beginEdit(&#10;    row: number,&#10;    col: number,&#10;    initial?: string,&#10;    selectAll?: boolean,&#10;  ): void;&#10;  dataEdge(&#10;    row: number,&#10;    col: number,&#10;    dRow: number,&#10;    dCol: number,&#10;  ): number | null;&#10;  setRowHeight(row: number, height: number): void;&#10;  setColumnWidth(col: number, width: number): void;&#10;  autoFitRows(range?: Range): void;&#10;  autoFitColumns(cols?: readonly number[]): void;&#10;  setFrozen(rows: number, cols?: number): void;&#10;  setZoom(zoom: number): void;&#10;  getZoom(): number;&#10;  rendererKind(): &quot;canvas&quot; | &quot;worker&quot;;&#10;  on&lt;E extends keyof GridEvents&gt;(&#10;    evt: E,&#10;    fn: (e: GridEvents[E]) =&gt; void,&#10;  ): () =&gt; void;&#10;  refresh(): void;&#10;  destroy(): void;&#10;}" data-pagefind-ignore>Copy</button>

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
  setActiveSheet(id: SheetId): void;
  scrollToCell(addr: CellAddress): void;
  getCellAtPoint(clientX: number, clientY: number): CellAddress | null;
  getActiveSheet(): SheetId;
  getCellInput(row: number, col: number): CellInputSnapshot | null;
  getSelection(): Selection | null;
  setSelection(sel: Selection | null): void;
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
  sortBy(col: number, ascending?: boolean): void;
  sortByMulti(keys: readonly SortKey[]): void;
  filterBy(col: number, needle: string): void;
  setColumnFilter(col: number, filter: ColumnFilter | null): void;
  setSort(keys: readonly SortKey[]): ApplyTransactionResult;
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
  destroy(): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/react</code></p>

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
<li><a href="/docs/api/core/revision-coordinator/"><code>RevisionCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/toolbar-item/"><code>ToolbarItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-workbook/"><code>toXlsxWorkbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller/"><code>GridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-ready-event/"><code>GridReadyEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 16 more</li>
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
