---
title: "HistoryArchive | @sheetwrite/core/history"
description: "HistoryArchive class in @sheetwrite/core/history: Opt-in archive of named and automatic versions for one document."
---
<!-- api-export:@sheetwrite/core|./history|HistoryArchive -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="class">class</span></div>

Opt-in archive of named and automatic versions for one document. It stores
content-addressed checkpoints plus the committed transactions since each
one, through a host `HistoryStorageAdapter`. A grid that never imports this
module has no history state.

Calls that change the archive run one at a time. Each publishes atomically,
so a failure or abort leaves the last durable version readable.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/history-archive.ts#L402"><code>packages/core/src/history-archive.ts#L402</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-archive-constructor"><code>constructor</code></a>
<a href="#history-archive-delete-version"><code>deleteVersion</code></a>
<a href="#history-archive-initialize"><code>initialize</code></a>
<a href="#history-archive-list-versions"><code>listVersions</code></a>
<a href="#history-archive-prune"><code>prune</code></a>
<a href="#history-archive-read-version"><code>readVersion</code></a>
<a href="#history-archive-record"><code>record</code></a>
<a href="#history-archive-save-version"><code>saveVersion</code></a>
<a href="#history-archive-storage-usage"><code>storageUsage</code></a>
<a href="#history-archive-open"><code>open</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>10</span>

<div class="api-member-list">

<details class="api-member" id="history-archive-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(options: HistoryArchiveOptions, limits: Readonly<HistoryLimits>, manifest: HistoryManifest);
```

</details>

<details class="api-member" id="history-archive-delete-version" data-pagefind-weight="1">
<summary><code>deleteVersion</code> <span class="api-member-summary">Delete one version. Records it shares with other versions stay.</span></summary>

```ts generated
deleteVersion: (id: string, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="history-archive-initialize" data-pagefind-weight="1">
<summary><code>initialize</code> <span class="api-member-summary">Store the first checkpoint: a complete, committed snapshot of the document at time.</span></summary>

```ts generated
initialize: (snapshot: WorkbookSnapshot, time: number, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="history-archive-list-versions" data-pagefind-weight="1">
<summary><code>listVersions</code> <span class="api-member-summary">One bounded page of version metadata, newest first.</span></summary>

```ts generated
listVersions: (options?: ListVersionsOptions) => Promise<HistoryListPage>;
```

</details>

<details class="api-member" id="history-archive-prune" data-pagefind-weight="1">
<summary><code>prune</code> <span class="api-member-summary">Remove automatic versions made at or before beforeTime (default: the age ceiling) and, oldest first, while the archive is above targetBytes.</span></summary>

```ts generated
prune: (options?: PruneOptions) => Promise<void>;
```

<p class="api-member-doc">Remove automatic versions made at or before `beforeTime` (default: the age
ceiling) and, oldest first, while the archive is above `targetBytes`.
Named versions and every record they need stay.</p>
</details>

<details class="api-member" id="history-archive-read-version" data-pagefind-weight="1">
<summary><code>readVersion</code> <span class="api-member-summary">Rebuild the document of one version.</span></summary>

```ts generated
readVersion: (id: string, signal?: AbortSignal) => Promise<WorkbookSnapshot>;
```

<p class="api-member-doc">Rebuild the document of one version. A reader lease keeps its records
alive while a concurrent prune runs; the lease is released on every exit.</p>
</details>

<details class="api-member" id="history-archive-record" data-pagefind-weight="1">
<summary><code>record</code> <span class="api-member-summary">Append one committed transaction.</span></summary>

```ts generated
record: (commit: CommittedTransaction, capture?: HistorySnapshotProvider, signal?: AbortSignal) => Promise<void>;
```

<p class="api-member-doc">Append one committed transaction. `capture` runs only when a checkpoint is
due and must return the committed document at `commit.revision`. An
automatic version is made after `automaticIntervalMs` of active time.</p>
</details>

<details class="api-member" id="history-archive-save-version" data-pagefind-weight="1">
<summary><code>saveVersion</code> <span class="api-member-summary">Name the archived head. The host flushes pending edits first, so the name covers them.</span></summary>

```ts generated
saveVersion: (name: string, authorId: string, time: number, signal?: AbortSignal) => Promise<HistoryVersion>;
```

</details>

<details class="api-member" id="history-archive-storage-usage" data-pagefind-weight="1">
<summary><code>storageUsage</code> <span class="api-member-summary">Retained bytes and counts, read from the manifest without fetching any payload.</span></summary>

```ts generated
storageUsage: (signal?: AbortSignal) => Promise<HistoryStorageUsage>;
```

</details>

<details class="api-member" id="history-archive-open" data-pagefind-weight="1">
<summary><code>open</code> <span class="api-member-summary">Open an archive by reading its manifest only; no workbook is loaded.</span></summary>

```ts generated
static open: (options: HistoryArchiveOptions, signal?: AbortSignal) => Promise<HistoryArchive>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class HistoryArchive {
  constructor(
    options: HistoryArchiveOptions,
    limits: Readonly<HistoryLimits>,
    manifest: HistoryManifest,
  );
  deleteVersion: (id: string, signal?: AbortSignal) => Promise<void>;
  initialize: (
    snapshot: WorkbookSnapshot,
    time: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  listVersions: (options?: ListVersionsOptions) => Promise<HistoryListPage>;
  prune: (options?: PruneOptions) => Promise<void>;
  readVersion: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<WorkbookSnapshot>;
  record: (
    commit: CommittedTransaction,
    capture?: HistorySnapshotProvider,
    signal?: AbortSignal,
  ) => Promise<void>;
  saveVersion: (
    name: string,
    authorId: string,
    time: number,
    signal?: AbortSignal,
  ) => Promise<HistoryVersion>;
  storageUsage: (signal?: AbortSignal) => Promise<HistoryStorageUsage>;
  static open: (
    options: HistoryArchiveOptions,
    signal?: AbortSignal,
  ) => Promise<HistoryArchive>;
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

<p class="api-consumers-label">Public exports naming <code>HistoryArchive</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
