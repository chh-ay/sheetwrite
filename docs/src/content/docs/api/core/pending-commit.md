---
title: "PendingCommit | @sheetwrite/core"
description: "PendingCommit interface in @sheetwrite/core: Immutable local operation batch awaiting a host acknowledgement."
---
<!-- api-export:@sheetwrite/core|.|PendingCommit -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Immutable local operation batch awaiting a host acknowledgement.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/transaction.ts#L96"><code>packages/core/src/types/transaction.ts#L96</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#pending-commit-document-id"><code>documentId</code></a>
<a href="#pending-commit-base-version"><code>baseVersion</code></a>
<a href="#pending-commit-client-mutation-id"><code>clientMutationId</code></a>
<a href="#pending-commit-operations"><code>operations</code></a>
<a href="#pending-commit-version-operation-counts"><code>versionOperationCounts</code></a>
<a href="#pending-commit-author-id"><code>authorId</code></a>
<a href="#pending-commit-restore"><code>restore</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="pending-commit-base-version" data-pagefind-weight="1">
<summary><code>baseVersion</code></summary>

```ts generated
baseVersion: number;
```

</details>

<details class="api-member" id="pending-commit-client-mutation-id" data-pagefind-weight="1">
<summary><code>clientMutationId</code></summary>

```ts generated
clientMutationId: string;
```

</details>

<details class="api-member" id="pending-commit-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>

```ts generated
readonly operations: readonly DocumentOp[];
```

</details>

<details class="api-member" id="pending-commit-version-operation-counts" data-pagefind-weight="1">
<summary><code>versionOperationCounts</code> <span class="api-member-summary">Present only when the operations are too large for one server version.</span></summary>

```ts generated
readonly versionOperationCounts?: readonly number[];
```

<p class="api-member-doc">Present only when the operations are too large for one server version.
Each entry is the operation count of one consecutive version of an atomic
batch, in order; the counts add up to `operations.length`. A server
applies and publishes all of these versions, or none of them.</p>
</details>

<details class="api-member" id="pending-commit-author-id" data-pagefind-weight="1">
<summary><code>authorId</code> <span class="api-member-summary">Authenticated ID of the person who made the change, from SyncCoordinatorOptions.authorId.</span></summary>

```ts generated
readonly authorId?: string;
```

<p class="api-member-doc">Authenticated ID of the person who made the change, from
`SyncCoordinatorOptions.authorId`. The authority confirms or replaces it
before it records history. At most `maxMutationIdBytes` UTF-8 bytes.</p>
</details>

<details class="api-member" id="pending-commit-restore" data-pagefind-weight="1">
<summary><code>restore</code> <span class="api-member-summary">Present when the commit restores a history version.</span></summary>

```ts generated
readonly restore?: RestoreProvenance;
```

<p class="api-member-doc">Present when the commit restores a history version. A restore is never
rebased: a conflicting restore makes the client reload and restore again.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PendingCommit {
  documentId: string;
  baseVersion: number;
  clientMutationId: string;
  readonly operations: readonly DocumentOp[];
  readonly versionOperationCounts?: readonly number[];
  readonly authorId?: string;
  readonly restore?: RestoreProvenance;
}
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>PendingCommit</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pending-commit-storage/"><code>PendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-browser/indexed-db-pending-commit-storage/"><code>IndexedDbPendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
