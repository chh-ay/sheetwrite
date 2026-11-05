---
title: "QuerySession | @sheetwrite/queries"
description: "QuerySession interface in @sheetwrite/queries: Defines, removes and refreshes the saved queries of one grid."
---
<!-- api-export:@sheetwrite/queries|.|QuerySession -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Defines, removes and refreshes the saved queries of one grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L86"><code>packages/queries/src/session.ts#L86</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="query-session-define" data-pagefind-weight="1">
<summary><code>define</code> <span class="api-member-summary">Checks the plan in the engine, then saves it as one undoable change.</span></summary>

```ts generated
define(query: SavedQuery): QueryDefinitionResult;
```

</details>

<details class="api-member" id="query-session-remove" data-pagefind-weight="1">
<summary><code>remove</code> <span class="api-member-summary">Removes a saved query; its output table and values stay.</span></summary>

```ts generated
remove(id: string): ApplyTransactionResult;
```

</details>

<details class="api-member" id="query-session-refresh" data-pagefind-weight="1">
<summary><code>refresh</code> <span class="api-member-summary">Refreshes one query and the queries it joins, as one undoable change.</span></summary>

```ts generated
refresh(id: string, options?: QueryRefreshOptions): Promise<QueryRefreshResult>;
```

</details>

<details class="api-member" id="query-session-refresh-all" data-pagefind-weight="1">
<summary><code>refreshAll</code> <span class="api-member-summary">Refreshes every query with an output table, as one undoable change.</span></summary>

```ts generated
refreshAll(options?: QueryRefreshOptions): Promise<QueryRefreshResult>;
```

</details>

<details class="api-member" id="query-session-dispose" data-pagefind-weight="1">
<summary><code>dispose</code> <span class="api-member-summary">Aborts pending refreshes; later calls are rejected.</span></summary>

```ts generated
dispose(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QuerySession {
  define(query: SavedQuery): QueryDefinitionResult;
  remove(id: string): ApplyTransactionResult;
  refresh(
    id: string,
    options?: QueryRefreshOptions,
  ): Promise<QueryRefreshResult>;
  refreshAll(options?: QueryRefreshOptions): Promise<QueryRefreshResult>;
  dispose(): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QuerySession</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/create-query-session/"><code>createQuerySession</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
