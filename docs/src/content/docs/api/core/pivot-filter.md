---
title: "PivotFilter | @sheetwrite/core"
description: "PivotFilter interface in @sheetwrite/core: Keep-list filter: only source rows whose field value is in values contribute."
---
<!-- api-export:@sheetwrite/core|.|PivotFilter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Keep-list filter: only source rows whose `field` value is in `values` contribute.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/pivot.ts#L45"><code>packages/core/src/types/pivot.ts#L45</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="pivot-filter-field" data-pagefind-weight="1">
<summary><code>field</code></summary>

```ts generated
field: number;
```

</details>

<details class="api-member" id="pivot-filter-values" data-pagefind-weight="1">
<summary><code>values</code></summary>

```ts generated
values: CellScalar[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PivotFilter {
  field: number;
  values: CellScalar[];
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

<p class="api-consumers-label">Public exports naming <code>PivotFilter</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pivot-definition/"><code>PivotDefinition</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
