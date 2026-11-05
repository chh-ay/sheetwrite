---
title: "QueryFetchSource | @sheetwrite/queries"
description: "QueryFetchSource type in @sheetwrite/queries: The only path to source data; the session never calls a global fetch."
---
<!-- api-export:@sheetwrite/queries|.|QueryFetchSource -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

The only path to source data; the session never calls a global `fetch`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L50"><code>packages/queries/src/session.ts#L50</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type QueryFetchSource = (
  request: QueryFetchRequest,
  context: QueryFetchContext,
) => Promise<QueryFetchResult>;
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryFetchSource</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-session-options/"><code>QuerySessionOptions</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
