---
title: "QueryStep | @sheetwrite/core"
description: "QueryStep type in @sheetwrite/core: Saved step order is execution order; each column reference is a stable identity."
---
<!-- api-export:@sheetwrite/core|.|QueryStep -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Saved step order is execution order; each column reference is a stable identity.
In a saved query, a join `input` is the ID of another saved query.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L53"><code>packages/core/src/types/query.ts#L53</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly kind: "filter";
  readonly predicate: QueryPredicate;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "select";
  readonly columns: readonly string[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "rename";
  readonly columns: readonly (readonly [id: string, name: string])[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "changeType";
  readonly column: string;
  readonly type: QueryColumnType;
  readonly onError: "error" | "null";
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "join";
  readonly input: string;
  readonly keys: readonly (readonly [left: string, right: string])[];
  readonly join: QueryJoinKind;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "group";
  readonly keys: readonly string[];
  readonly aggregates: readonly QueryAggregate[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "unpivot";
  readonly columns: readonly string[];
  readonly attribute: { readonly id: string; readonly name: string };
  readonly value: { readonly id: string; readonly name: string };
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type QueryStep =
  | {
      readonly kind: "filter";
      readonly predicate: QueryPredicate;
    }
  | {
      readonly kind: "select";
      readonly columns: readonly string[];
    }
  | {
      readonly kind: "rename";
      readonly columns: readonly (readonly [id: string, name: string])[];
    }
  | {
      readonly kind: "changeType";
      readonly column: string;
      readonly type: QueryColumnType;
      readonly onError: "error" | "null";
    }
  | {
      readonly kind: "join";
      readonly input: string;
      readonly keys: readonly (readonly [left: string, right: string])[];
      readonly join: QueryJoinKind;
    }
  | {
      readonly kind: "group";
      readonly keys: readonly string[];
      readonly aggregates: readonly QueryAggregate[];
    }
  | {
      readonly kind: "unpivot";
      readonly columns: readonly string[];
      readonly attribute: {
        readonly id: string;
        readonly name: string;
      };
      readonly value: {
        readonly id: string;
        readonly name: string;
      };
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

<p class="api-consumers-label">Public exports naming <code>QueryStep</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/saved-query/"><code>SavedQuery</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/query-engine/"><code>QueryEngine</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
