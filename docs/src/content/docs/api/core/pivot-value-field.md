---
title: "PivotValueField | @sheetwrite/core"
description: "One aggregated value field."
---
<!-- api-export:@sheetwrite/core|.|PivotValueField -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One aggregated value field. `name` replaces the default caption.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/pivot.ts#L35"><code>packages/core/src/types/pivot.ts#L35</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="pivot-value-field-field" data-pagefind-weight="1">
<summary><code>field</code> <span class="api-member-summary">Source field index that the value aggregates.</span></summary>

```ts generated
field: number;
```

</details>

<details class="api-member" id="pivot-value-field-aggregation" data-pagefind-weight="1">
<summary><code>aggregation</code> <span class="api-member-summary">How the field's values in each output cell combine.</span></summary>

```ts generated
aggregation: PivotAggregation;
```

</details>

<details class="api-member" id="pivot-value-field-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Custom caption; without it the output shows the default caption.</span></summary>

```ts generated
name?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PivotValueField {
  field: number;
  aggregation: PivotAggregation;
  name?: string;
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

<p class="api-consumers-label">Public exports naming <code>PivotValueField</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pivot-definition/"><code>PivotDefinition</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
