---
title: "ChartRendererFactory | @sheetwrite/core"
description: "Creates the chart renderer of one grid."
---
<!-- api-export:@sheetwrite/core|.|ChartRendererFactory -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Creates the chart renderer of one grid. The grid disposes it. It lives next
to `ChartViewProviderFactory` because the chart type domain cannot read `Store`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/store.ts#L28"><code>packages/core/src/types/store.ts#L28</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type ChartRendererFactory = (store: Store) => ChartRenderer;
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>ChartRendererFactory</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/set-chart-renderer-factory/"><code>setChartRendererFactory</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
