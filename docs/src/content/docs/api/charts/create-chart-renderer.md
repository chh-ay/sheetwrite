---
title: "createChartRenderer | @sheetwrite/charts"
description: "Creates the SVG chart renderer for one store."
---
<!-- api-export:@sheetwrite/charts|.|createChartRenderer -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="function">function</span></div>

Creates the SVG chart renderer for one store. All mounted charts share one
view cache. A chart redraws after a chart-change event names it, or after a
resize, at most once per animation frame. Scrolling never redraws a chart.

### Examples

```ts compile
import { createChartRenderer } from "@sheetwrite/charts";
import type { ChartRef, Store } from "@sheetwrite/core";

function showChart(store: Store, host: HTMLElement, chart: ChartRef) {
  const renderer = createChartRenderer(store);
  const mounted = renderer.mount(host, chart, { width: 320, height: 200 });
  return () => {
    mounted.dispose();
    renderer.dispose();
  };
}
```

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/charts/src/chart-renderer.ts#L26"><code>packages/charts/src/chart-renderer.ts#L26</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createChartRenderer(store: Store): ChartRenderer
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>createChartRenderer</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
