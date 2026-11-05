---
title: "QueryDefinitionResult | @sheetwrite/queries"
description: "QueryDefinitionResult type in @sheetwrite/queries: A definition the engine rejects, or the store's transaction result."
---
<!-- api-export:@sheetwrite/queries|.|QueryDefinitionResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

A definition the engine rejects, or the store's transaction result.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L65"><code>packages/queries/src/session.ts#L65</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly status: "invalid";
  readonly diagnostic: QueryDiagnostic;
}
```

</div>
<div class="api-variant">

```ts generated
ApplyTransactionResult
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type QueryDefinitionResult =
  | {
      readonly status: "invalid";
      readonly diagnostic: QueryDiagnostic;
    }
  | ApplyTransactionResult;
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryDefinitionResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-session/"><code>QuerySession</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
