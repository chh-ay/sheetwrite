---
title: "QueryJoinKind | @sheetwrite/core"
description: "QueryJoinKind type in @sheetwrite/core: Join kinds retain duplicate matches and match null keys to null keys."
---
<!-- api-export:@sheetwrite/core|.|QueryJoinKind -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Join kinds retain duplicate matches and match null keys to null keys.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L31"><code>packages/core/src/types/query.ts#L31</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type QueryJoinKind =
  | "inner"
  | "left"
  | "right"
  | "full"
  | "leftSemi"
  | "rightSemi"
  | "leftAnti"
  | "rightAnti";
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryJoinKind</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
