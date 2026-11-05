---
title: "QueryPredicate | @sheetwrite/core"
description: "QueryPredicate type in @sheetwrite/core: Data-only predicate trees use M null logic; only logical true selects a row."
---
<!-- api-export:@sheetwrite/core|.|QueryPredicate -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Data-only predicate trees use M null logic; only logical true selects a row.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L18"><code>packages/core/src/types/query.ts#L18</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly kind: "compare";
  readonly column: string;
  readonly op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
  readonly value: string | number | boolean | null;
}
```

</div>
<div class="api-variant">

```ts generated
{ readonly kind: "isNull"; readonly column: string }
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "contains";
  readonly column: string;
  readonly text: string;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "and" | "or";
  readonly predicates: readonly QueryPredicate[];
}
```

</div>
<div class="api-variant">

```ts generated
{ readonly kind: "not"; readonly predicate: QueryPredicate }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type QueryPredicate =
  | {
      readonly kind: "compare";
      readonly column: string;
      readonly op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
      readonly value: string | number | boolean | null;
    }
  | {
      readonly kind: "isNull";
      readonly column: string;
    }
  | {
      readonly kind: "contains";
      readonly column: string;
      readonly text: string;
    }
  | {
      readonly kind: "and" | "or";
      readonly predicates: readonly QueryPredicate[];
    }
  | {
      readonly kind: "not";
      readonly predicate: QueryPredicate;
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

<p class="api-consumers-label">Public exports naming <code>QueryPredicate</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
