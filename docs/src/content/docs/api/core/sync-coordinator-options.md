---
title: "SyncCoordinatorOptions | @sheetwrite/core"
description: "Document, version, durability, and online options for synchronization."
---
<!-- api-export:@sheetwrite/core|.|SyncCoordinatorOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Document, version, durability, and online options for synchronization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/sync.ts#L224"><code>packages/core/src/sync.ts#L224</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sync-coordinator-options-document-id"><code>documentId</code></a>
<a href="#sync-coordinator-options-server-version"><code>serverVersion</code></a>
<a href="#sync-coordinator-options-create-mutation-id"><code>createMutationId</code></a>
<a href="#sync-coordinator-options-pending-storage"><code>pendingStorage</code></a>
<a href="#sync-coordinator-options-initial-connection"><code>initialConnection</code></a>
<a href="#sync-coordinator-options-recover-version-gap"><code>recoverVersionGap</code></a>
<a href="#sync-coordinator-options-limits"><code>limits</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sync-coordinator-options-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-coordinator-options-server-version" data-pagefind-weight="1">
<summary><code>serverVersion</code></summary>

```ts generated
serverVersion: number;
```

</details>

<details class="api-member" id="sync-coordinator-options-create-mutation-id" data-pagefind-weight="1">
<summary><code>createMutationId</code></summary>

```ts generated
createMutationId?: () => string;
```

</details>

<details class="api-member" id="sync-coordinator-options-pending-storage" data-pagefind-weight="1">
<summary><code>pendingStorage</code></summary>

```ts generated
pendingStorage?: PendingCommitStorage;
```

</details>

<details class="api-member" id="sync-coordinator-options-initial-connection" data-pagefind-weight="1">
<summary><code>initialConnection</code></summary>

```ts generated
initialConnection?: "offline" | "online";
```

</details>

<details class="api-member" id="sync-coordinator-options-recover-version-gap" data-pagefind-weight="1">
<summary><code>recoverVersionGap</code> <span class="api-member-summary">Optional host recovery hook.</span></summary>

```ts generated
recoverVersionGap?: ( request: SyncVersionGapRequest, ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
```

<p class="api-member-doc">Optional host recovery hook. Return the missing ordered operations, or a
snapshot for the host to remount before calling `resumeAfterReload`.</p>
</details>

<details class="api-member" id="sync-coordinator-options-limits" data-pagefind-weight="1">
<summary><code>limits</code> <span class="api-member-summary">Positive safe-integer overrides merged over DEFAULTSYNCCOORDINATORLIMITS.</span></summary>

```ts generated
limits?: Partial<SyncCoordinatorLimits>;
```

<p class="api-member-doc">Positive safe-integer overrides merged over `DEFAULT_SYNC_COORDINATOR_LIMITS`.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncCoordinatorOptions {
  documentId: string;
  serverVersion: number;
  createMutationId?: () => string;
  pendingStorage?: PendingCommitStorage;
  initialConnection?: "offline" | "online";
  recoverVersionGap?: (
    request: SyncVersionGapRequest,
  ) => Promise<readonly VersionedOperation[] | WorkbookSnapshot>;
  limits?: Partial<SyncCoordinatorLimits>;
}
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

<p class="api-consumers-label">Public exports naming <code>SyncCoordinatorOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
