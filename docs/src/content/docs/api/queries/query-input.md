---
title: "QueryInput | @sheetwrite/queries"
description: "QueryInput interface in @sheetwrite/queries: One execution-local named input, consumed by join steps without a result cache."
---
<!-- api-export:@sheetwrite/queries|.|QueryInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

One execution-local named input, consumed by join steps without a result cache.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L91"><code>packages/queries/src/types.ts#L91</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="query-input-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
readonly id: string;
```

</details>

<details class="api-member" id="query-input-batch" data-pagefind-weight="1">
<summary><code>batch</code></summary>

```ts generated
readonly batch: QueryBatch;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryInput {
  readonly id: string;
  readonly batch: QueryBatch;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryInput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-engine/"><code>QueryEngine</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
