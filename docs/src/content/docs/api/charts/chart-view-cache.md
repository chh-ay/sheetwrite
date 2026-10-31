---
title: "ChartViewCache | @sheetwrite/charts"
description: "ChartViewCache type in @sheetwrite/charts: Resolved chart views for one store, refreshed only by chart-change events."
---
<!-- api-export:@sheetwrite/charts|.|ChartViewCache -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="type">type</span></div>

Resolved chart views for one store, refreshed only by chart-change events.

Listeners run after the changed charts are invalidated, so `get` inside a
listener always resolves the committed cell data.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/charts/src/view-cache.ts#L18"><code>packages/charts/src/view-cache.ts#L18</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type ChartViewCache = ChartViewProvider;
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>ChartViewCache</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/create-chart-view-cache/"><code>createChartViewCache</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
</ul>
</div>
