---
title: "SyncConflictReloadReason | @sheetwrite/core"
description: "Why a conflict cannot be recovered in place; the host reloads the document instead."
---
<!-- api-export:@sheetwrite/core|.|SyncConflictReloadReason -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Why a conflict cannot be recovered in place; the host reloads the document instead.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/sync.ts#L273"><code>packages/core/src/sync.ts#L273</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SyncConflictReloadReason =
  | "missing-operations"
  | "structural-change"
  | "overlapping-work"
  | "version-advanced"
  | "own-mutation"
  | "rejected";
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

<p class="api-consumers-label">Public exports naming <code>SyncConflictReloadReason</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-conflict-recovery/"><code>SyncConflictRecovery</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
