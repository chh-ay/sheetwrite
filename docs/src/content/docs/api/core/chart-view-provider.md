---
title: "ChartViewProvider | @sheetwrite/core"
description: "Cached chart views supplied by the optional charts package; renderers do not read cells."
---
<!-- api-export:@sheetwrite/core|.|ChartViewProvider -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Cached chart views supplied by the optional charts package; renderers do not read cells.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/chartProvider.ts#L6"><code>packages/core/src/types/chartProvider.ts#L6</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="chart-view-provider-get" data-pagefind-weight="1">
<summary><code>get</code> <span class="api-member-summary">Resolve on first access; later accesses use the cached committed view.</span></summary>

```ts generated
get(chart: ChartRef): ChartView | null;
```

</details>

<details class="api-member" id="chart-view-provider-subscribe" data-pagefind-weight="1">
<summary><code>subscribe</code> <span class="api-member-summary">Observe invalidation after cached views have been removed.</span></summary>

```ts generated
subscribe(listener: ChartChangeListener): () => void;
```

</details>

<details class="api-member" id="chart-view-provider-dispose" data-pagefind-weight="1">
<summary><code>dispose</code> <span class="api-member-summary">Stop observing the store and release cached views.</span></summary>

```ts generated
dispose(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartViewProvider {
  get(chart: ChartRef): ChartView | null;
  subscribe(listener: ChartChangeListener): () => void;
  dispose(): void;
}
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>ChartViewProvider</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/chart-view-provider-factory/"><code>ChartViewProviderFactory</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/open-chart-views/"><code>openChartViews</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
