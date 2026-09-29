---
title: "WorkbookTable | @sheetwrite/core"
description: "Serializable canonical workbook table."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable canonical workbook table. Its range includes header/totals rows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/table.ts#L38"><code>packages/core/src/types/table.ts#L38</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#workbook-table-id"><code>id</code></a>
<a href="#workbook-table-name"><code>name</code></a>
<a href="#workbook-table-range"><code>range</code></a>
<a href="#workbook-table-columns"><code>columns</code></a>
<a href="#workbook-table-header-row"><code>headerRow</code></a>
<a href="#workbook-table-totals-row"><code>totalsRow</code></a>
<a href="#workbook-table-style"><code>style</code></a>
<a href="#workbook-table-unsupported-features"><code>unsupportedFeatures</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: WorkbookTableId;
```

</details>

<details class="api-member" id="workbook-table-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Workbook-global, case-insensitively unique structured-reference name.</span></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="workbook-table-range" data-pagefind-weight="1">
<summary><code>range</code> <span class="api-member-summary">Inclusive table rectangle on one stable sheet ID.</span></summary>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="workbook-table-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Ordered stable columns; length is exactly the table rectangle width.</span></summary>

```ts generated
columns: WorkbookTableColumn[];
```

</details>

<details class="api-member" id="workbook-table-header-row" data-pagefind-weight="1">
<summary><code>headerRow</code> <span class="api-member-summary">Whether the first range row is the structured-reference header row.</span></summary>

```ts generated
headerRow: boolean;
```

</details>

<details class="api-member" id="workbook-table-totals-row" data-pagefind-weight="1">
<summary><code>totalsRow</code> <span class="api-member-summary">Whether the last range row is the structured-reference totals row.</span></summary>

```ts generated
totalsRow: boolean;
```

</details>

<details class="api-member" id="workbook-table-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: WorkbookTableStyle;
```

</details>

<details class="api-member" id="workbook-table-unsupported-features" data-pagefind-weight="1">
<summary><code>unsupportedFeatures</code></summary>

```ts generated
unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface WorkbookTable {
  id: WorkbookTableId;
  name: string;
  range: Range;
  columns: WorkbookTableColumn[];
  headerRow: boolean;
  totalsRow: boolean;
  style?: WorkbookTableStyle;
  unsupportedFeatures?: WorkbookTableUnsupportedFeature[];
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTable</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/valid-workbook-table/"><code>validWorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
