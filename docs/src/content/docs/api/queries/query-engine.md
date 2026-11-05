---
title: "QueryEngine | @sheetwrite/queries"
description: "QueryEngine interface in @sheetwrite/queries: Rust performs parsing and every step; this interface does no source fetching."
---
<!-- api-export:@sheetwrite/queries|.|QueryEngine -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Rust performs parsing and every step; this interface does no source fetching.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L156"><code>packages/queries/src/types.ts#L156</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="query-engine-parse" data-pagefind-weight="1">
<summary><code>parse</code> <span class="api-member-summary">Parse host-provided bytes; fatal failures throw QueryError.</span></summary>

```ts generated
parse(bytes: Uint8Array, source: QuerySource, limits?: Partial<QueryLimits>): QueryBatch;
```

</details>

<details class="api-member" id="query-engine-execute" data-pagefind-weight="1">
<summary><code>execute</code> <span class="api-member-summary">Execute an ordered plan; cell errors stay in the typed output buffers.</span></summary>

```ts generated
execute( source: QueryBatch, steps: readonly QueryStep[], inputs?: readonly QueryInput[], limits?: Partial<QueryLimits>, ): QueryBatch;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryEngine {
  parse(
    bytes: Uint8Array,
    source: QuerySource,
    limits?: Partial<QueryLimits>,
  ): QueryBatch;
  execute(
    source: QueryBatch,
    steps: readonly QueryStep[],
    inputs?: readonly QueryInput[],
    limits?: Partial<QueryLimits>,
  ): QueryBatch;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryEngine</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/load-query-engine/"><code>loadQueryEngine</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
