---
title: "SimpleGridInput | @sheetwrite/core/adapter"
description: "Normalized workbook and columnar data produced from simple adapter props."
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleGridInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Normalized workbook and columnar data produced from simple adapter props.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/adapter.ts#L273"><code>packages/core/src/adapter.ts#L273</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="simple-grid-input-workbook" data-pagefind-weight="1">
<summary><code>workbook</code></summary>

```ts generated
workbook: Workbook;
```

</details>

<details class="api-member" id="simple-grid-input-data" data-pagefind-weight="1">
<summary><code>data</code></summary>

```ts generated
data: ColumnarData;
```

</details>

<details class="api-member" id="simple-grid-input-presentation" data-pagefind-weight="1">
<summary><code>presentation</code> <span class="api-member-summary">Simple row-object input always opts into semantic data-grid presentation.</span></summary>

```ts generated
presentation: "data-grid";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SimpleGridInput {
  workbook: Workbook;
  data: ColumnarData;
  presentation: "data-grid";
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

<p class="api-consumers-label">Public exports naming <code>SimpleGridInput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/create-simple-grid-input/"><code>createSimpleGridInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
