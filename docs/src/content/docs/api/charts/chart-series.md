---
title: "ChartSeries | @sheetwrite/charts"
description: "Sources are read in row-major order."
---
<!-- api-export:@sheetwrite/charts|.|ChartSeries -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="interface">interface</span></div>

Sources are read in row-major order.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/dist/types/chart.d.ts#L16"><code>packages/core/dist/types/chart.d.ts#L16</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="chart-series-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name?: string;
```

</details>

<details class="api-member" id="chart-series-name-range" data-pagefind-weight="1">
<summary><code>nameRange</code></summary>

```ts generated
nameRange?: ChartRange;
```

</details>

<details class="api-member" id="chart-series-values" data-pagefind-weight="1">
<summary><code>values</code></summary>

```ts generated
values: ChartRange;
```

</details>

<details class="api-member" id="chart-series-categories" data-pagefind-weight="1">
<summary><code>categories</code></summary>

```ts generated
categories?: ChartRange;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartSeries {
  name?: string;
  nameRange?: ChartRange;
  values: ChartRange;
  categories?: ChartRange;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>ChartSeries</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/chart-definition/"><code>ChartDefinition</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-definition/"><code>ChartDefinition</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
