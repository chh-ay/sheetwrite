---
title: "ChartView | @sheetwrite/charts"
description: "ChartView interface in @sheetwrite/charts: One immutable-by-convention rendering input, refreshed on chart-change events."
---
<!-- api-export:@sheetwrite/charts|.|ChartView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="interface">interface</span></div>

One immutable-by-convention rendering input, refreshed on chart-change events.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/dist/types/chart.d.ts#L58"><code>packages/core/dist/types/chart.d.ts#L58</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="chart-view-chart" data-pagefind-weight="1">
<summary><code>chart</code></summary>

```ts generated
chart: ChartDefinition;
```

</details>

<details class="api-member" id="chart-view-series" data-pagefind-weight="1">
<summary><code>series</code></summary>

```ts generated
series: ChartSeriesView[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartView {
  chart: ChartDefinition;
  series: ChartSeriesView[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>ChartView</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/render-chart-svg/"><code>renderChartSvg</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-view-provider/"><code>ChartViewProvider</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/resolve-chart-view/"><code>resolveChartView</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
