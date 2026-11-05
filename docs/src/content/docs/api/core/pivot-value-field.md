---
title: "PivotValueField | @sheetwrite/core"
description: "PivotValueField type in @sheetwrite/core: One implicit aggregation or saved measure; name overrides its caption."
---
<!-- api-export:@sheetwrite/core|.|PivotValueField -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

One implicit aggregation or saved measure; `name` overrides its caption.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/pivot.ts#L40"><code>packages/core/src/types/pivot.ts#L40</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  field: number;
  aggregation: PivotAggregation;
  name?: string;
}
```

</div>
<div class="api-variant">

```ts generated
{ measure: string; name?: string }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type PivotValueField =
  | {
      field: number;
      aggregation: PivotAggregation;
      name?: string;
    }
  | {
      measure: string;
      name?: string;
    };
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>PivotValueField</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pivot-definition/"><code>PivotDefinition</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
