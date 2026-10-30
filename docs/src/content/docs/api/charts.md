---
title: "@sheetwrite/charts"
description: "API reference for @sheetwrite/charts."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/charts`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/index.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>18</dd></div>
</dl>

Source entry: `packages/charts/src/index.ts`

## Exported symbols

### Functions <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/charts/create-chart-renderer/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createChartRenderer</code></span><span class="api-symbol-card__desc">Creates the SVG chart renderer for one store.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/create-chart-view-cache/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>createChartViewCache</code></span><span class="api-symbol-card__desc">Creates the per-store chart view cache a chart renderer reads from.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/register-charts-backend/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>registerChartsBackend</code></span><span class="api-symbol-card__desc">Register the chart view cache as the core chart view provider, so openChartViews(store) returns live chart views, and the SVG chart renderer, so grids created after this call draw their charts.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/render-chart-svg/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>renderChartSvg</code></span><span class="api-symbol-card__desc">Draws a chart view as a standalone SVG element of size CSS pixels.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>11</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/charts/chart-anchor/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartAnchor</code></span><span class="api-symbol-card__desc">Position in worksheet coordinates; dimensions and offsets use CSS pixels.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-change-event/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartChangeEvent</code></span><span class="api-symbol-card__desc">Charts whose ChartView may differ after one store commit.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-definition/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartDefinition</code></span><span class="api-symbol-card__desc">Persisted chart definition; IDs are unique within the owning sheet.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-ref/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartRef</code></span><span class="api-symbol-card__desc">Stable identity of one chart: the sheet that owns it and its ID on that sheet.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-renderer/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartRenderer</code></span><span class="api-symbol-card__desc">Draws charts into host elements that the grid's object layer owns.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-series/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartSeries</code></span><span class="api-symbol-card__desc">Sources are read in row-major order.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-series-view/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartSeriesView</code></span><span class="api-symbol-card__desc">Resolved plain data; the renderer does not read cells.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-size/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartSize</code></span><span class="api-symbol-card__desc">Box size in CSS pixels.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-svg-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartSvgOptions</code></span><span class="api-symbol-card__desc">Options for renderChartSvg.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-view/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>ChartView</code></span><span class="api-symbol-card__desc">One immutable-by-convention rendering input, refreshed on chart-change events.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/mounted-chart/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>MountedChart</code></span><span class="api-symbol-card__desc">Draws one chart into a box that core places and sizes.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/charts/chart-kind/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>ChartKind</code></span><span class="api-symbol-card__desc">Chart families that the document model supports.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-range/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>ChartRange</code></span><span class="api-symbol-card__desc">A deleted source remains explicit instead of silently reading another cell.</span></a>
<a class="api-symbol-card" href="/docs/api/charts/chart-view-cache/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>ChartViewCache</code></span><span class="api-symbol-card__desc">Resolved chart views for one store, refreshed only by chart-change events.</span></a>
</div>
