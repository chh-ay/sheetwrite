---
title: "openChartViews | @sheetwrite/core"
description: "Open cached chart views through the optional backend."
---
<!-- api-export:@sheetwrite/core|.|openChartViews -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Open cached chart views through the optional backend. Import
`@sheetwrite/charts/register` or call its `registerChartsBackend` first.
Throws a `SheetwriteError` with code `"optional-backend-unavailable"` if no
provider is registered. The caller must dispose the result.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/chart-backend.ts#L18"><code>packages/core/src/chart-backend.ts#L18</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function openChartViews(store: Store): ChartViewProvider
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>openChartViews</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
