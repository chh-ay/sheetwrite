---
title: "PivotAggregation | @sheetwrite/core"
description: "PivotAggregation type in @sheetwrite/core: Aggregation applied to one value field."
---
<!-- api-export:@sheetwrite/core|.|PivotAggregation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Aggregation applied to one value field. Semantics match PIVOTBY's aggregations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/pivot.ts#L9"><code>packages/core/src/types/pivot.ts#L9</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type PivotAggregation =
  "SUM" | "COUNT" | "AVERAGE" | "MIN" | "MAX" | "COUNTA" | "DISTINCTCOUNT";
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

<p class="api-consumers-label">Public exports naming <code>PivotAggregation</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pivot-value-field/"><code>PivotValueField</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
