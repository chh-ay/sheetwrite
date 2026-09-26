---
title: "Sheet | @sheetwrite/core"
description: "Workbook sheet schema used when creating a live grid."
---
<!-- api-export:@sheetwrite/core|.|Sheet -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Workbook sheet schema used when creating a live grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L41"><code>packages/core/src/types/document.ts#L41</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheet-id"><code>id</code></a>
<a href="#sheet-name"><code>name</code></a>
<a href="#sheet-visibility"><code>visibility</code></a>
<a href="#sheet-columns"><code>columns</code></a>
<a href="#sheet-row-count"><code>rowCount</code></a>
<a href="#sheet-row-heights"><code>rowHeights</code></a>
<a href="#sheet-hidden-rows"><code>hiddenRows</code></a>
<a href="#sheet-row-groups"><code>rowGroups</code></a>
<a href="#sheet-conditional-formats"><code>conditionalFormats</code></a>
<a href="#sheet-hyperlinks"><code>hyperlinks</code></a>
<a href="#sheet-validation-rules"><code>validationRules</code></a>
<a href="#sheet-protected-ranges"><code>protectedRanges</code></a>
<a href="#sheet-notes"><code>notes</code></a>
<a href="#sheet-sort-keys"><code>sortKeys</code></a>
<a href="#sheet-filters"><code>filters</code></a>
<a href="#sheet-merges"><code>merges</code></a>
<a href="#sheet-frozen-rows"><code>frozenRows</code></a>
<a href="#sheet-frozen-cols"><code>frozenCols</code></a>
<a href="#sheet-tables"><code>tables</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>19</span>

<div class="api-member-list">

<details class="api-member" id="sheet-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable identifier, unique within the workbook and used by every cell address.</span></summary>

```ts generated
id: SheetId;
```

</details>

<details class="api-member" id="sheet-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">User-facing sheet name shown in tabs and workbook exports.</span></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="sheet-visibility" data-pagefind-weight="1">
<summary><code>visibility</code> <span class="api-member-summary">Hidden worksheets remain addressable but are omitted from the tab strip.</span></summary>

```ts generated
visibility?: SheetVisibility;
```

</details>

<details class="api-member" id="sheet-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Ordered schema; array positions are the zero-based column coordinates.</span></summary>

```ts generated
columns: Column[];
```

</details>

<details class="api-member" id="sheet-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code> <span class="api-member-summary">Row count for both in-memory and datasource-backed sheets.</span></summary>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="sheet-row-heights" data-pagefind-weight="1">
<summary><code>rowHeights</code> <span class="api-member-summary">Sparse per-row height overrides; default comes from the theme.</span></summary>

```ts generated
rowHeights?: Map<number, number>;
```

</details>

<details class="api-member" id="sheet-hidden-rows" data-pagefind-weight="1">
<summary><code>hiddenRows</code> <span class="api-member-summary">Persisted hidden data rows; runtime form is sparse and non-JSON.</span></summary>

```ts generated
hiddenRows?: Set<number>;
```

</details>

<details class="api-member" id="sheet-row-groups" data-pagefind-weight="1">
<summary><code>rowGroups</code> <span class="api-member-summary">Persisted collapsible row groups.</span></summary>

```ts generated
rowGroups?: RowGroup[];
```

</details>

<details class="api-member" id="sheet-conditional-formats" data-pagefind-weight="1">
<summary><code>conditionalFormats</code> <span class="api-member-summary">Conditional styles folded into the bulk render-window style dictionary.</span></summary>

```ts generated
conditionalFormats?: ConditionalFormatRule[];
```

</details>

<details class="api-member" id="sheet-hyperlinks" data-pagefind-weight="1">
<summary><code>hyperlinks</code> <span class="api-member-summary">Stable, serializable range hyperlinks; external URLs pass the shared safety policy.</span></summary>

```ts generated
hyperlinks?: CellHyperlink[];
```

</details>

<details class="api-member" id="sheet-validation-rules" data-pagefind-weight="1">
<summary><code>validationRules</code> <span class="api-member-summary">Serializable data-entry rules evaluated at the local mutation barrier.</span></summary>

```ts generated
validationRules?: DataValidationRule[];
```

</details>

<details class="api-member" id="sheet-protected-ranges" data-pagefind-weight="1">
<summary><code>protectedRanges</code> <span class="api-member-summary">Client-side protected-range policy metadata; never server authorization.</span></summary>

```ts generated
protectedRanges?: ProtectedRange[];
```

</details>

<details class="api-member" id="sheet-notes" data-pagefind-weight="1">
<summary><code>notes</code> <span class="api-member-summary">Simple cell notes. Discussion threads live outside the document model.</span></summary>

```ts generated
notes?: CellNote[];
```

</details>

<details class="api-member" id="sheet-sort-keys" data-pagefind-weight="1">
<summary><code>sortKeys</code> <span class="api-member-summary">Persisted sort keys for the sheet's view.</span></summary>

```ts generated
sortKeys?: SortKey[];
```

</details>

<details class="api-member" id="sheet-filters" data-pagefind-weight="1">
<summary><code>filters</code> <span class="api-member-summary">Persisted column filters as JSON-safe index/value tuples.</span></summary>

```ts generated
filters?: Array<[col: number, filter: ColumnFilter]>;
```

</details>

<details class="api-member" id="sheet-merges" data-pagefind-weight="1">
<summary><code>merges</code> <span class="api-member-summary">Persisted merged-cell regions; covered cells render/export from the anchor.</span></summary>

```ts generated
merges?: MergeRange[];
```

</details>

<details class="api-member" id="sheet-frozen-rows" data-pagefind-weight="1">
<summary><code>frozenRows</code> <span class="api-member-summary">Leading view rows pinned above the scrolling body (0/undefined = none).</span></summary>

```ts generated
frozenRows?: number;
```

</details>

<details class="api-member" id="sheet-frozen-cols" data-pagefind-weight="1">
<summary><code>frozenCols</code> <span class="api-member-summary">Leading columns pinned left of the scrolling body (0/undefined = none).</span></summary>

```ts generated
frozenCols?: number;
```

</details>

<details class="api-member" id="sheet-tables" data-pagefind-weight="1">
<summary><code>tables</code> <span class="api-member-summary">Native workbook tables anchored to this stable worksheet identity.</span></summary>

```ts generated
tables?: WorkbookTable[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Sheet {
  id: SheetId;
  name: string;
  visibility?: SheetVisibility;
  columns: Column[];
  rowCount: number;
  rowHeights?: Map<number, number>;
  hiddenRows?: Set<number>;
  rowGroups?: RowGroup[];
  conditionalFormats?: ConditionalFormatRule[];
  hyperlinks?: CellHyperlink[];
  validationRules?: DataValidationRule[];
  protectedRanges?: ProtectedRange[];
  notes?: CellNote[];
  sortKeys?: SortKey[];
  filters?: Array<[col: number, filter: ColumnFilter]>;
  merges?: MergeRange[];
  frozenRows?: number;
  frozenCols?: number;
  tables?: WorkbookTable[];
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

<p class="api-consumers-label">Public exports naming <code>Sheet</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/assert-workbook-tables/"><code>assertWorkbookTables</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-csv/"><code>toCsv</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/valid-workbook-table/"><code>validWorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook/"><code>Workbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
