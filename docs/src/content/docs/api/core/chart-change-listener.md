---
title: "ChartChangeListener | @sheetwrite/core"
description: "ChartChangeListener type in @sheetwrite/core: Listener for subscribeChartChanges and ChartViewProvider.subscribe."
---
<!-- api-export:@sheetwrite/core|.|ChartChangeListener -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Listener for `subscribeChartChanges` and `ChartViewProvider.subscribe`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/chart.ts#L89"><code>packages/core/src/types/chart.ts#L89</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type ChartChangeListener = (event: ChartChangeEvent) => void;
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

<p class="api-consumers-label">Public exports naming <code>ChartChangeListener</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/chart-view-provider/"><code>ChartViewProvider</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/subscribe-chart-changes/"><code>subscribeChartChanges</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
