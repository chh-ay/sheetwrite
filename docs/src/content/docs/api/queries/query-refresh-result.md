---
title: "QueryRefreshResult | @sheetwrite/queries"
description: "QueryRefreshResult type in @sheetwrite/queries: One refresh commits every requested output in one transaction, or none."
---
<!-- api-export:@sheetwrite/queries|.|QueryRefreshResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

One refresh commits every requested output in one transaction, or none.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L68"><code>packages/queries/src/session.ts#L68</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly status: "applied";
  readonly transaction: ApplyTransactionResult;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly status: "failed";
  readonly queryId: string;
  readonly diagnostic: QueryDiagnostic;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly status: "blocked";
  readonly queryId: string;
  readonly reason: QueryOutputBlock;
}
```

</div>
<div class="api-variant">

```ts generated
{ readonly status: "missing"; readonly queryId: string }
```

</div>
<div class="api-variant">

```ts generated
{ readonly status: "stale" }
```

</div>
<div class="api-variant">

```ts generated
{ readonly status: "aborted" }
```

</div>
<div class="api-variant">

```ts generated
{
  readonly status: "rejected";
  readonly transaction: ApplyTransactionResult;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type QueryRefreshResult =
  | {
      readonly status: "applied";
      readonly transaction: ApplyTransactionResult;
    }
  | {
      readonly status: "failed";
      readonly queryId: string;
      readonly diagnostic: QueryDiagnostic;
    }
  | {
      readonly status: "blocked";
      readonly queryId: string;
      readonly reason: QueryOutputBlock;
    }
  | {
      readonly status: "missing";
      readonly queryId: string;
    }
  | {
      readonly status: "stale";
    }
  | {
      readonly status: "aborted";
    }
  | {
      readonly status: "rejected";
      readonly transaction: ApplyTransactionResult;
    };
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryRefreshResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-session/"><code>QuerySession</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
