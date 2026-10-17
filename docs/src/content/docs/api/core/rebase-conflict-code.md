---
title: "RebaseConflictCode | @sheetwrite/core"
description: "Stable conservative-rebase conflict category."
---
<!-- api-export:@sheetwrite/core|.|RebaseConflictCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable conservative-rebase conflict category.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/rebase.ts#L8"><code>packages/core/src/rebase.ts#L8</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type RebaseConflictCode =
  | "overlapping-edit"
  | "sheet-removed"
  | "sheet-lifecycle"
  | "formula-structural"
  | "structural-overlap"
  | "unsupported-structural";
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>RebaseConflictCode</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/rebase-conflict/"><code>RebaseConflict</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
