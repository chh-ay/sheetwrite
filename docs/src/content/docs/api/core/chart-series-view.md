---
title: "ChartSeriesView | @sheetwrite/core"
description: "Resolved plain data; the renderer does not read cells."
---
<!-- api-export:@sheetwrite/core|.|ChartSeriesView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resolved plain data; the renderer does not read cells. Arrays follow source cells in row-major order.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/chart.ts#L44"><code>packages/core/src/types/chart.ts#L44</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#chart-series-view-name"><code>name</code></a>
<a href="#chart-series-view-values"><code>values</code></a>
<a href="#chart-series-view-categories"><code>categories</code></a>
<a href="#chart-series-view-number-formats"><code>numberFormats</code></a>
<a href="#chart-series-view-category-formats"><code>categoryFormats</code></a>
<a href="#chart-series-view-number-locale"><code>numberLocale</code></a>
<a href="#chart-series-view-truncated"><code>truncated</code></a>
<a href="#chart-series-view-reference-error"><code>referenceError</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="chart-series-view-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="chart-series-view-values" data-pagefind-weight="1">
<summary><code>values</code> <span class="api-member-summary">Numeric cells; text, booleans, errors and empty cells are null (a gap).</span></summary>

```ts generated
values: Array<number | null>;
```

</details>

<details class="api-member" id="chart-series-view-categories" data-pagefind-weight="1">
<summary><code>categories</code></summary>

```ts generated
categories: Array<string | number | boolean | null>;
```

</details>

<details class="api-member" id="chart-series-view-number-formats" data-pagefind-weight="1">
<summary><code>numberFormats</code> <span class="api-member-summary">Excel format code per value, as the grid paints it: cell style, then column style, then column format.</span></summary>

```ts generated
numberFormats: Array<string | null>;
```

</details>

<details class="api-member" id="chart-series-view-category-formats" data-pagefind-weight="1">
<summary><code>categoryFormats</code> <span class="api-member-summary">Format code per category; date categories are serial numbers and need it to show as dates.</span></summary>

```ts generated
categoryFormats: Array<string | null>;
```

</details>

<details class="api-member" id="chart-series-view-number-locale" data-pagefind-weight="1">
<summary><code>numberLocale</code> <span class="api-member-summary">BCP 47 locale of the first value column, for separators; null keeps the default.</span></summary>

```ts generated
numberLocale: string | null;
```

</details>

<details class="api-member" id="chart-series-view-truncated" data-pagefind-weight="1">
<summary><code>truncated</code> <span class="api-member-summary">A source had more than MAXCHARTPOINTS cells and its tail was dropped.</span></summary>

```ts generated
truncated: boolean;
```

<p class="api-member-doc">A source had more than `MAX_CHART_POINTS` cells and its tail was dropped.</p>
</details>

<details class="api-member" id="chart-series-view-reference-error" data-pagefind-weight="1">
<summary><code>referenceError</code> <span class="api-member-summary">A source was deleted; that source reads as empty.</span></summary>

```ts generated
referenceError: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartSeriesView {
  name: string;
  values: Array<number | null>;
  categories: Array<string | number | boolean | null>;
  numberFormats: Array<string | null>;
  categoryFormats: Array<string | null>;
  numberLocale: string | null;
  truncated: boolean;
  referenceError: boolean;
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

<p class="api-consumers-label">Public exports naming <code>ChartSeriesView</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/chart-view/"><code>ChartView</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-view/"><code>ChartView</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
