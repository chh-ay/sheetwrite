---
title: "IndexedDbPendingCommitStorage | @sheetwrite/core/browser"
description: "Browser-only durable pending queue."
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser/">@sheetwrite/core/browser</a><span class="api-status" data-kind="class">class</span></div>

Browser-only durable pending queue. Import it from `@sheetwrite/core/browser`;
the package's root entrypoint never evaluates IndexedDB globals.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/indexeddb.ts#L62"><code>packages/core/src/indexeddb.ts#L62</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-pending-commit-storage-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(options?: IndexedDbPendingCommitStorageOptions);
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-close" data-pagefind-weight="1">
<summary><code>close</code></summary>

```ts generated
close: () => void;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load: (documentId: string, options: PendingCommitLoadOptions) => Promise<readonly PendingCommit[]>;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-put" data-pagefind-weight="1">
<summary><code>put</code></summary>

```ts generated
put: (commit: PendingCommit, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-remove" data-pagefind-weight="1">
<summary><code>remove</code></summary>

```ts generated
remove: (documentId: string, clientMutationId: string, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-replace" data-pagefind-weight="1">
<summary><code>replace</code> <span class="api-member-summary">Atomically replaces one document queue only if its ordered IDs still match the caller's expected view.</span></summary>

```ts generated
replace: (documentId: string, expectedClientMutationIds: readonly string[], commits: readonly PendingCommit[], signal?: AbortSignal) => Promise<void>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class IndexedDbPendingCommitStorage implements PendingCommitStorage {
  constructor(options?: IndexedDbPendingCommitStorageOptions);
  close: () => void;
  load: (
    documentId: string,
    options: PendingCommitLoadOptions,
  ) => Promise<readonly PendingCommit[]>;
  put: (commit: PendingCommit, signal?: AbortSignal) => Promise<void>;
  remove: (
    documentId: string,
    clientMutationId: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  replace: (
    documentId: string,
    expectedClientMutationIds: readonly string[],
    commits: readonly PendingCommit[],
    signal?: AbortSignal,
  ) => Promise<void>;
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

<p class="api-consumers-label">Public exports naming <code>IndexedDbPendingCommitStorage</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
