---
title: "QueryOutputBlock | @sheetwrite/queries"
description: "QueryOutputBlock type in @sheetwrite/queries: Why an output table could not be written without touching unrelated cells."
---
<!-- api-export:@sheetwrite/queries|.|QueryOutputBlock -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

Why an output table could not be written without touching unrelated cells.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L60"><code>packages/queries/src/session.ts#L60</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type QueryOutputBlock = "missing-sheet" | "too-wide" | "occupied";
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryOutputBlock</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-refresh-result/"><code>QueryRefreshResult</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
