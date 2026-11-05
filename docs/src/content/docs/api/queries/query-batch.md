---
title: "QueryBatch | @sheetwrite/queries"
description: "QueryBatch interface in @sheetwrite/queries: Equal-length columns with a u32 row count; returned buffers are owned by the caller."
---
<!-- api-export:@sheetwrite/queries|.|QueryBatch -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Equal-length columns with a u32 row count; returned buffers are owned by the caller.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L144"><code>packages/queries/src/types.ts#L144</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="query-batch-row-count" data-pagefind-weight="1">
<summary><code>rowCount</code></summary>

```ts generated
readonly rowCount: number;
```

</details>

<details class="api-member" id="query-batch-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
readonly columns: readonly QueryColumn[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryBatch {
  readonly rowCount: number;
  readonly columns: readonly QueryColumn[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryBatch</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-engine/"><code>QueryEngine</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
<li><a href="/docs/api/queries/query-input/"><code>QueryInput</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
