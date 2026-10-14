---
title: "SyncConflictRecovery | @sheetwrite/core"
description: "Outcome of SyncCoordinator.recoverConflict."
---
<!-- api-export:@sheetwrite/core|.|SyncConflictRecovery -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Outcome of `SyncCoordinator.recoverConflict`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/sync.ts#L288"><code>packages/core/src/sync.ts#L288</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ status: "recovered"; serverVersion: number }
```

</div>
<div class="api-variant">

```ts generated
{
  status: "reload-required";
  reason: SyncConflictReloadReason;
  conflict?: RebaseConflict;
}
```

</div>
<div class="api-variant">

```ts generated
{ status: "no-conflict" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type SyncConflictRecovery =
  | {
      status: "recovered";
      serverVersion: number;
    }
  | {
      status: "reload-required";
      reason: SyncConflictReloadReason;
      conflict?: RebaseConflict;
    }
  | {
      status: "no-conflict";
    };
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>SyncConflictRecovery</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
