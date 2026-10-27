---
title: "ChartViewCache | @sheetwrite/charts"
description: "Resolved chart views for one store, refreshed only by chart-change events."
---
<!-- api-export:@sheetwrite/charts|.|ChartViewCache -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="interface">interface</span></div>

Resolved chart views for one store, refreshed only by chart-change events.

Listeners run after the changed charts are invalidated, so `get` inside a
listener always resolves the committed cell data.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/charts/src/view-cache.ts#L16"><code>packages/charts/src/view-cache.ts#L16</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="chart-view-cache-get" data-pagefind-weight="1">
<summary><code>get</code> <span class="api-member-summary">Resolved view for the chart, or null when the sheet has no chart with that ID.</span></summary>

```ts generated
get(chart: ChartRef): ChartView | null;
```

</details>

<details class="api-member" id="chart-view-cache-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code> <span class="api-member-summary">Observe charts whose cached views were invalidated; returns the unsubscribe function.</span></summary>

```ts generated
subscribe(listener: (event: ChartChangeEvent) => void): () => void;
```

</details>

<details class="api-member" id="chart-view-cache-dispose" data-pagefind-weight="1">
<summary><code>dispose</code> <span class="api-member-summary">Stop observing the store and release every cached view.</span></summary>

```ts generated
dispose(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartViewCache {
  get(chart: ChartRef): ChartView | null;
  subscribe(listener: (event: ChartChangeEvent) => void): () => void;
  dispose(): void;
}
```

</details>

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
