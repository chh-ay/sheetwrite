---
title: "HistoryArchive | @sheetwrite/core/history"
description: "HistoryArchive class in @sheetwrite/core/history: Opt-in, bounded history writer and replay module."
---
<!-- api-export:@sheetwrite/core|./history|HistoryArchive -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="class">class</span></div>

Opt-in, bounded history writer and replay module. The default grid never constructs it.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/history-archive.ts#L196"><code>packages/core/src/history-archive.ts#L196</code></a></dd></div>
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
<summary><code>deleteVersion</code> <span class="api-member-summary">Explicitly delete a marker; shared checkpoint pages remain while another owner needs them.</span></summary>

```ts generated
deleteVersion: (id: string, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="history-archive-initialize" data-pagefind-weight="1">
<summary><code>initialize</code> <span class="api-member-summary">Persist the initial content-addressed checkpoint of a fully loaded committed document.</span></summary>

```ts generated
initialize: (snapshot: WorkbookSnapshot, time: number, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="history-archive-list-versions" data-pagefind-weight="1">
<summary><code>listVersions</code> <span class="api-member-summary">Read a bounded newest-first metadata page without constructing a historical store.</span></summary>

```ts generated
listVersions: (options?: { maxEntries?: number; maxBytes?: number; cursor?: string; signal?: AbortSignal; }) => Promise<HistoryListPage>;
```

</details>

<details class="api-member" id="history-archive-prune" data-pagefind-weight="1">
<summary><code>prune</code> <span class="api-member-summary">Expire automatic markers while keeping named versions and every referenced chunk.</span></summary>

```ts generated
prune: (options?: { beforeTime?: number; targetBytes?: number; signal?: AbortSignal; }) => Promise<void>;
```

</details>

<details class="api-member" id="history-archive-read-version" data-pagefind-weight="1">
<summary><code>readVersion</code> <span class="api-member-summary">Reconstruct one committed version in isolation and dispose the replay store on every exit.</span></summary>

```ts generated
readVersion: (id: string, signal?: AbortSignal) => Promise<WorkbookSnapshot>;
```

</details>

<details class="api-member" id="history-archive-record" data-pagefind-weight="1">
<summary><code>record</code> <span class="api-member-summary">Archive one authority-confirmed transaction and checkpoint only when cadence requires it.</span></summary>

```ts generated
record: (commit: HistoryCommit, capture?: HistorySnapshotProvider, signal?: AbortSignal) => Promise<void>;
```

</details>

<details class="api-member" id="history-archive-save-version" data-pagefind-weight="1">
<summary><code>saveVersion</code> <span class="api-member-summary">Name the durable head. Optimistic local operations must be flushed by the host first.</span></summary>

```ts generated
saveVersion: (name: string, authorId: string, time: number, signal?: AbortSignal) => Promise<HistoryVersion>;
```

</details>

<details class="api-member" id="history-archive-storage-usage" data-pagefind-weight="1">
<summary><code>storageUsage</code> <span class="api-member-summary">Read aggregate retained storage without fetching payload bytes.</span></summary>

```ts generated
storageUsage: (signal?: AbortSignal) => Promise<HistoryStorageUsage>;
```

</details>

<details class="api-member" id="history-archive-open" data-pagefind-weight="1">
<summary><code>open</code> <span class="api-member-summary">Open only the durable metadata cursor; this does not hydrate a workbook.</span></summary>

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
  listVersions: (options?: {
    maxEntries?: number;
    maxBytes?: number;
    cursor?: string;
    signal?: AbortSignal;
  }) => Promise<HistoryListPage>;
  prune: (options?: {
    beforeTime?: number;
    targetBytes?: number;
    signal?: AbortSignal;
  }) => Promise<void>;
  readVersion: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<WorkbookSnapshot>;
  record: (
    commit: HistoryCommit,
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
