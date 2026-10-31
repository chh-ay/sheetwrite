---
title: "subscribeChartChanges | @sheetwrite/core"
description: "subscribeChartChanges function in @sheetwrite/core: Listen for commits that change any chart's ChartView."
---
<!-- api-export:@sheetwrite/core|.|subscribeChartChanges -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Listen for commits that change any chart's `ChartView`. Edited rectangles are
matched against an index of series ranges, so edits outside every series
range cost no chart work. Charts that read formulas, references or spills
also change on any commit that changes cell values. Returns an unsubscribe
function; the index is dropped with the last listener.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/charts-live.ts#L525"><code>packages/core/src/charts-live.ts#L525</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function subscribeChartChanges(
  store: Store,
  listener: ChartChangeListener,
): () => void
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

<p class="api-consumers-label">Public exports naming <code>subscribeChartChanges</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
