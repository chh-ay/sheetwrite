---
title: "QueryFetchResult | @sheetwrite/queries"
description: "QueryFetchResult type in @sheetwrite/queries: CSV and JSON sources return bytes; host sources return typed batches."
---
<!-- api-export:@sheetwrite/queries|.|QueryFetchResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

CSV and JSON sources return bytes; host sources return typed batches.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L40"><code>packages/queries/src/session.ts#L40</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ readonly kind: "bytes"; readonly bytes: Uint8Array }
```

</div>
<div class="api-variant">

```ts generated
{ readonly kind: "batch"; readonly batch: QueryBatch }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type QueryFetchResult =
  | {
      readonly kind: "bytes";
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: "batch";
      readonly batch: QueryBatch;
    };
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryFetchResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-fetch-source/"><code>QueryFetchSource</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
