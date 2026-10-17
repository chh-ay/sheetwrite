---
title: "VersionedOperation | @sheetwrite/core"
description: "Remote document operations paired with a contiguous server version."
---
<!-- api-export:@sheetwrite/core|.|VersionedOperation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Remote document operations paired with a contiguous server version.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L112"><code>packages/core/src/types/transaction.ts#L112</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="versioned-operation-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version: number;
```

</details>

<details class="api-member" id="versioned-operation-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>

```ts generated
readonly operations: readonly DocumentOp[];
```

</details>

<details class="api-member" id="versioned-operation-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId?: string;
```

</details>

<details class="api-member" id="versioned-operation-batch" data-pagefind-weight="1">
<summary><code>batch</code> <span class="api-member-summary">Present when this version is one member of an atomic batch.</span></summary>

```ts generated
batch?: VersionBatchMember;
```

<p class="api-member-doc">Present when this version is one member of an atomic batch. Every member
carries the same `clientMutationId` and `count`. Receivers apply the batch
only after its last member arrives.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface VersionedOperation {
  version: number;
  readonly operations: readonly DocumentOp[];
  clientMutationId?: string;
  batch?: VersionBatchMember;
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

<p class="api-consumers-label">Public exports naming <code>VersionedOperation</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/persistence-commit-response/"><code>PersistenceCommitResponse</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/remote-operation-source/"><code>RemoteOperationSource</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-event/"><code>SyncCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-options/"><code>SyncCoordinatorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
