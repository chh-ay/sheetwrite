---
title: "PackedCellBlock | @sheetwrite/core"
description: "Dense row-major mutation payload."
---
<!-- api-export:@sheetwrite/core|.|PackedCellBlock -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Dense row-major mutation payload. Primitive arrays keep large paste/fill
operations JSON-safe without allocating one operation object per cell.
Formula/reference tuples are sparse exceptions keyed by row-major offset.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L320"><code>packages/core/src/types/document.ts#L320</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#packed-cell-block-row-count"><code>rowCount</code></a>
<a href="#packed-cell-block-col-count"><code>colCount</code></a>
<a href="#packed-cell-block-values"><code>values</code></a>
<a href="#packed-cell-block-formulas"><code>formulas</code></a>
<a href="#packed-cell-block-refs"><code>refs</code></a>
<a href="#packed-cell-block-style-table"><code>styleTable</code></a>
<a href="#packed-cell-block-style-ids"><code>styleIds</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="packed-cell-block-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
rowCount: number;
```

</details>

<details class="api-member" id="packed-cell-block-col-count" data-pagefind-weight="1">
<summary><code>colCount</code></summary>

```ts generated
colCount: number;
```

</details>

<details class="api-member" id="packed-cell-block-values" data-pagefind-weight="1">
<summary><code>values</code></summary>

```ts generated
values: CellScalar[];
```

</details>

<details class="api-member" id="packed-cell-block-formulas" data-pagefind-weight="1">
<summary><code>formulas</code></summary>

```ts generated
formulas?: Array<[offset: number, source: string]>;
```

</details>

<details class="api-member" id="packed-cell-block-refs" data-pagefind-weight="1">
<summary><code>refs</code></summary>

```ts generated
refs?: Array<[offset: number, target: CellAddress]>;
```

</details>

<details class="api-member" id="packed-cell-block-style-table" data-pagefind-weight="1">
<summary><code>styleTable</code></summary>

```ts generated
styleTable?: CellStyle[];
```

</details>

<details class="api-member" id="packed-cell-block-style-ids" data-pagefind-weight="1">
<summary><code>styleIds</code></summary>

```ts generated
styleIds?: number[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PackedCellBlock {
  rowCount: number;
  colCount: number;
  values: CellScalar[];
  formulas?: Array<[offset: number, source: string]>;
  refs?: Array<[offset: number, target: CellAddress]>;
  styleTable?: CellStyle[];
  styleIds?: number[];
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

<p class="api-consumers-label">Public exports naming <code>PackedCellBlock</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
