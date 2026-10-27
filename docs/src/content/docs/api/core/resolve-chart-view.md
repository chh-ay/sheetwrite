---
title: "resolveChartView | @sheetwrite/core"
description: "Resolve one chart to plain data the renderer draws without reading cells."
---
<!-- api-export:@sheetwrite/core|.|resolveChartView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Resolve one chart to plain data the renderer draws without reading cells.
Values that are not numbers (text, booleans, errors, empty cells) become
`null`. Each series range costs one bulk window read of at most
`MAX_CHART_POINTS` cells. Returns `null` when the chart does not exist.

Call it after a [`subscribeChartChanges`](/docs/api/core/subscribe-chart-changes/) event names the chart, not per frame.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/charts-live.ts#L154"><code>packages/core/src/charts-live.ts#L154</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function resolveChartView(
  store: Store,
  sheet: SheetId,
  id: string,
): ChartView | null
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>resolveChartView</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
