---
title: "DataCell | @sheetwrite/core"
description: "Datasource cell value with optional cell-specific styling."
---
<!-- api-export:@sheetwrite/core|.|DataCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Datasource cell value with optional cell-specific styling.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/data.ts#L11"><code>packages/core/src/types/data.ts#L11</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
CellScalar
```

</div>
<div class="api-variant">

```ts generated
CellValue
```

</div>
<div class="api-variant">

```ts generated
{ value: CellValue; style?: CellStyle }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DataCell =
  | CellScalar
  | CellValue
  | {
      value: CellValue;
      style?: CellStyle;
    };
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

<p class="api-consumers-label">Public exports naming <code>DataCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-data/"><code>RowData</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
