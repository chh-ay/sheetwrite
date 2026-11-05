---
title: "QuerySessionOptions | @sheetwrite/queries"
description: "QuerySessionOptions interface in @sheetwrite/queries: Host I/O for a session; the engine limits apply to every parse and execution."
---
<!-- api-export:@sheetwrite/queries|.|QuerySessionOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Host I/O for a session; the engine limits apply to every parse and execution.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L56"><code>packages/queries/src/session.ts#L56</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="query-session-options-fetch-source" data-pagefind-weight="1">
<summary><code>fetchSource</code></summary>

```ts generated
readonly fetchSource: QueryFetchSource;
```

</details>

<details class="api-member" id="query-session-options-limits" data-pagefind-weight="1">
<summary><code>limits</code></summary>

```ts generated
readonly limits?: Partial<QueryLimits>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QuerySessionOptions {
  readonly fetchSource: QueryFetchSource;
  readonly limits?: Partial<QueryLimits>;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QuerySessionOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/create-query-session/"><code>createQuerySession</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
