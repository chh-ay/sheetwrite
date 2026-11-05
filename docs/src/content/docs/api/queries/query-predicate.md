---
title: "QueryPredicate | @sheetwrite/queries"
description: "QueryPredicate type in @sheetwrite/queries: Source summary unavailable; docs:check rejects this omission."
---
<!-- api-export:@sheetwrite/queries|.|QueryPredicate -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

Source summary unavailable; docs:check rejects this omission.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/dist/types/query.d.ts#L9"><code>packages/core/dist/types/query.d.ts#L9</code></a></dd></div>
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
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryPredicate</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
