---
title: "registerChartsBackend | @sheetwrite/charts/register"
description: "Register the chart view cache as the core chart view provider, so openChartViews(store) returns live chart views."
---
<!-- api-export:@sheetwrite/charts|./register|registerChartsBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts-register/">@sheetwrite/charts/register</a><span class="api-status" data-kind="function">function</span></div>

Register the chart view cache as the core chart view provider, so
`openChartViews(store)` returns live chart views.

### Examples

```ts compile
import { registerChartsBackend } from "@sheetwrite/charts";
import { openChartViews, type Store } from "@sheetwrite/core";

registerChartsBackend();

function salesChartValues(store: Store) {
  const charts = openChartViews(store);
  const values = charts.get({ sheet: "s", id: "sales" })?.series[0]?.values ?? [];
  charts.dispose();
  return values;
}
```

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/charts/src/registration.ts#L24"><code>packages/charts/src/registration.ts#L24</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function registerChartsBackend(): void
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>registerChartsBackend</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
