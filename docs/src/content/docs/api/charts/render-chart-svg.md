---
title: "renderChartSvg | @sheetwrite/charts"
description: "renderChartSvg function in @sheetwrite/charts: Draws a chart view as a standalone SVG element of size CSS pixels."
---
<!-- api-export:@sheetwrite/charts|.|renderChartSvg -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="function">function</span></div>

Draws a chart view as a standalone SVG element of `size` CSS pixels.

Series colors read `--sheetwrite-chart-1` to `--sheetwrite-chart-8`, and text
reads the grid theme variables, so the chart follows the host theme. The
function reads no cells and keeps no state.

## Examples

```ts compile
import { renderChartSvg, type ChartView } from "@sheetwrite/charts";

function showChart(host: HTMLElement, view: ChartView) {
  host.replaceChildren(renderChartSvg(view, { width: 320, height: 200 }));
}
```

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/charts/src/chart-svg.ts#L982"><code>packages/charts/src/chart-svg.ts#L982</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function renderChartSvg(
  view: ChartView,
  size: ChartSize,
  options?: ChartSvgOptions,
): SVGSVGElement
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>renderChartSvg</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
