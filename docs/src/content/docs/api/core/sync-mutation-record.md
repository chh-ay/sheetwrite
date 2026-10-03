---
title: "SyncMutationRecord | @sheetwrite/core"
description: "Pending commit paired with its current synchronization status."
---
<!-- api-export:@sheetwrite/core|.|SyncMutationRecord -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pending commit paired with its current synchronization status.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L99"><code>packages/core/src/types/transaction.ts#L99</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="sync-mutation-record-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
status: SyncMutationStatus;
```

</details>

<details class="api-member" id="sync-mutation-record-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-mutation-record-base-version" data-pagefind-weight="1">
<summary><code>baseVersion</code></summary>

```ts generated
baseVersion: number;
```

</details>

<details class="api-member" id="sync-mutation-record-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId: string;
```

</details>

<details class="api-member" id="sync-mutation-record-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>

```ts generated
readonly operations: readonly DocumentOp[];
```

</details>

<details class="api-member" id="sync-mutation-record-version-operation-counts" data-pagefind-weight="1">
<summary><code>versionOperationCounts</code> <span class="api-member-summary">Present only when the operations are too large for one server version.</span></summary>

```ts generated
readonly versionOperationCounts?: readonly number[];
```

<p class="api-member-doc">Present only when the operations are too large for one server version.
Each entry is the operation count of one consecutive version of an atomic
batch, in order; the counts add up to `operations.length`. A server
applies and publishes all of these versions, or none of them.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncMutationRecord {
  status: SyncMutationStatus;
  documentId: string;
  baseVersion: number;
  clientMutationId: string;
  readonly operations: readonly DocumentOp[];
  readonly versionOperationCounts?: readonly number[];
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

<p class="api-consumers-label">Public exports naming <code>SyncMutationRecord</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-event/"><code>SyncCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
