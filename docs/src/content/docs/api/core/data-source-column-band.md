---
title: "DataSourceColumnBand | @sheetwrite/core"
description: "One half-open run of workbook columns, in stable sheet order."
---
<!-- api-export:@sheetwrite/core|.|DataSourceColumnBand -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One half-open run of workbook columns, in stable sheet order.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/data.ts#L23"><code>packages/core/src/types/data.ts#L23</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="data-source-column-band-start" data-pagefind-weight="1">
<summary><code>start</code> <span class="api-member-summary">Zero-based workbook column index of the first key.</span></summary>

```ts generated
start: number;
```

</details>

<details class="api-member" id="data-source-column-band-end" data-pagefind-weight="1">
<summary><code>end</code> <span class="api-member-summary">Exclusive workbook column index after the last key.</span></summary>

```ts generated
end: number;
```

</details>

<details class="api-member" id="data-source-column-band-keys" data-pagefind-weight="1">
<summary><code>keys</code> <span class="api-member-summary">Stable workbook column keys for every index in [start, end).</span></summary>

```ts generated
keys: readonly string[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceColumnBand {
  start: number;
  end: number;
  keys: readonly string[];
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

<p class="api-consumers-label">Public exports naming <code>DataSourceColumnBand</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-source-page/"><code>DataSourcePage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/data-source-request/"><code>DataSourceRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
