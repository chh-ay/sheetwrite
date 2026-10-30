---
title: "ChartDefinition | @sheetwrite/core"
description: "Persisted chart definition; IDs are unique within the owning sheet."
---
<!-- api-export:@sheetwrite/core|.|ChartDefinition -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Persisted chart definition; IDs are unique within the owning sheet.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/chart.ts#L30"><code>packages/core/src/types/chart.ts#L30</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#chart-definition-id"><code>id</code></a>
<a href="#chart-definition-kind"><code>kind</code></a>
<a href="#chart-definition-title"><code>title</code></a>
<a href="#chart-definition-axes"><code>axes</code></a>
<a href="#chart-definition-legend"><code>legend</code></a>
<a href="#chart-definition-anchor"><code>anchor</code></a>
<a href="#chart-definition-series"><code>series</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="chart-definition-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="chart-definition-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: ChartKind;
```

</details>

<details class="api-member" id="chart-definition-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Text above the chart; undefined shows no title.</span></summary>

```ts generated
title?: string;
```

</details>

<details class="api-member" id="chart-definition-axes" data-pagefind-weight="1">
<summary><code>axes</code> <span class="api-member-summary">Axis titles; undefined shows no axis titles.</span></summary>

```ts generated
axes?: { xTitle?: string; yTitle?: string };
```

</details>

<details class="api-member" id="chart-definition-legend" data-pagefind-weight="1">
<summary><code>legend</code> <span class="api-member-summary">Legend position; undefined lets the renderer use its default position.</span></summary>

```ts generated
legend?: "none" | "top" | "right" | "bottom" | "left";
```

</details>

<details class="api-member" id="chart-definition-anchor" data-pagefind-weight="1">
<summary><code>anchor</code></summary>

```ts generated
anchor: ChartAnchor;
```

</details>

<details class="api-member" id="chart-definition-series" data-pagefind-weight="1">
<summary><code>series</code></summary>

```ts generated
series: ChartSeries[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartDefinition {
  id: string;
  kind: ChartKind;
  title?: string;
  axes?: {
    xTitle?: string;
    yTitle?: string;
  };
  legend?: "none" | "top" | "right" | "bottom" | "left";
  anchor: ChartAnchor;
  series: ChartSeries[];
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

<p class="api-consumers-label">Public exports naming <code>ChartDefinition</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/chart-view/"><code>ChartView</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-view/"><code>ChartView</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
