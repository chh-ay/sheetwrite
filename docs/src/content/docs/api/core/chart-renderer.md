---
title: "ChartRenderer | @sheetwrite/core"
description: "Draws charts into host elements that the grid's object layer owns."
---
<!-- api-export:@sheetwrite/core|.|ChartRenderer -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Draws charts into host elements that the grid's object layer owns.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/chart.ts#L109"><code>packages/core/src/types/chart.ts#L109</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="chart-renderer-mount" data-pagefind-weight="1">
<summary><code>mount</code> <span class="api-member-summary">host is an empty element that core owns, positions and clips.</span></summary>

```ts generated
mount(host: HTMLElement, chart: ChartRef, size: { width: number; height: number }): MountedChart;
```

</details>

<details class="api-member" id="chart-renderer-dispose" data-pagefind-weight="1">
<summary><code>dispose</code></summary>

```ts generated
dispose(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartRenderer {
  mount(
    host: HTMLElement,
    chart: ChartRef,
    size: {
      width: number;
      height: number;
    },
  ): MountedChart;
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

<p class="api-consumers-label">Public exports naming <code>ChartRenderer</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/create-chart-renderer/"><code>createChartRenderer</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-renderer-factory/"><code>ChartRendererFactory</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
