---
title: "DataSourcePage | @sheetwrite/core"
description: "One resolved rectangular page returned by a DataSource."
---
<!-- api-export:@sheetwrite/core|.|DataSourcePage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One resolved rectangular page returned by a DataSource.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/data.ts#L48"><code>packages/core/src/types/data.ts#L48</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="data-source-page-protocol" data-pagefind-weight="1">
<summary><code>protocol</code> <span class="api-member-summary">Paging contract version.</span></summary>

```ts generated
protocol: 2;
```

</details>

<details class="api-member" id="data-source-page-start" data-pagefind-weight="1">
<summary><code>start</code> <span class="api-member-summary">Inclusive row index of the first returned row.</span></summary>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-page-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Exact column runs represented by every returned row.</span></summary>

```ts generated
columns: readonly DataSourceColumnBand[];
```

</details>

<details class="api-member" id="data-source-page-rows" data-pagefind-weight="1">
<summary><code>rows</code></summary>

```ts generated
rows: RowData[];
```

</details>

<details class="api-member" id="data-source-page-revision" data-pagefind-weight="1">
<summary><code>revision</code></summary>

```ts generated
revision?: string | number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourcePage {
  protocol: 2;
  start: number;
  columns: readonly DataSourceColumnBand[];
  rows: RowData[];
  revision?: string | number;
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

<p class="api-consumers-label">Public exports naming <code>DataSourcePage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-source/"><code>DataSource</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
