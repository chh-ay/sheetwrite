---
title: "WorkbookTablePatch | @sheetwrite/core"
description: "Mutable table fields accepted by the explicit update operation."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTablePatch -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Mutable table fields accepted by the explicit update operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/table.ts#L55"><code>packages/core/src/types/table.ts#L55</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#workbook-table-patch-name"><code>name</code></a>
<a href="#workbook-table-patch-range"><code>range</code></a>
<a href="#workbook-table-patch-columns"><code>columns</code></a>
<a href="#workbook-table-patch-header-row"><code>headerRow</code></a>
<a href="#workbook-table-patch-totals-row"><code>totalsRow</code></a>
<a href="#workbook-table-patch-style"><code>style</code></a>
<a href="#workbook-table-patch-unsupported-features"><code>unsupportedFeatures</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-patch-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name?: string;
```

</details>

<details class="api-member" id="workbook-table-patch-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range?: Range;
```

</details>

<details class="api-member" id="workbook-table-patch-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
columns?: WorkbookTableColumn[];
```

</details>

<details class="api-member" id="workbook-table-patch-header-row" data-pagefind-weight="1">
<summary><code>headerRow</code></summary>

```ts generated
headerRow?: boolean;
```

</details>

<details class="api-member" id="workbook-table-patch-totals-row" data-pagefind-weight="1">
<summary><code>totalsRow</code></summary>

```ts generated
totalsRow?: boolean;
```

</details>

<details class="api-member" id="workbook-table-patch-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: WorkbookTableStyle | null;
```

</details>

<details class="api-member" id="workbook-table-patch-unsupported-features" data-pagefind-weight="1">
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
export interface WorkbookTablePatch {
  name?: string;
  range?: Range;
  columns?: WorkbookTableColumn[];
  headerRow?: boolean;
  totalsRow?: boolean;
  style?: WorkbookTableStyle | null;
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTablePatch</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
