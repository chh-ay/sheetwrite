---
title: "createChartViewCache | @sheetwrite/charts"
description: "createChartViewCache function in @sheetwrite/charts: Creates the per-store chart view cache a chart renderer reads from."
---
<!-- api-export:@sheetwrite/charts|.|createChartViewCache -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="function">function</span></div>

Creates the per-store chart view cache a chart renderer reads from.

Views resolve lazily on first `get` and stay cached until a chart-change
event names that chart, so repeated frames never reread cells.

## Examples

```ts compile
import { createChartViewCache, type ChartView } from "@sheetwrite/charts";
import type { SheetId, Store } from "@sheetwrite/core";

function watchChart(
  store: Store,
  sheet: SheetId,
  id: string,
  render: (view: ChartView | null) => void,
) {
  const charts = createChartViewCache(store);
  render(charts.get({ sheet, id }));
  const unsubscribe = charts.subscribe((event) => {
    if (event.charts.some((chart) => chart.sheet === sheet && chart.id === id)) {
      render(charts.get({ sheet, id }));
    }
  });
  return () => {
    unsubscribe();
    charts.dispose();
  };
}
```

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/charts/src/view-cache.ts#L51"><code>packages/charts/src/view-cache.ts#L51</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createChartViewCache(store: Store): ChartViewCache
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>createChartViewCache</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
