---
title: "QueryRefreshOptions | @sheetwrite/queries"
description: "QueryRefreshOptions interface in @sheetwrite/queries: The signal cancels a pending refresh before it writes anything."
---
<!-- api-export:@sheetwrite/queries|.|QueryRefreshOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

The signal cancels a pending refresh before it writes anything.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L79"><code>packages/queries/src/session.ts#L79</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="query-refresh-options-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
readonly signal?: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryRefreshOptions {
  readonly signal?: AbortSignal;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryRefreshOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-session/"><code>QuerySession</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
