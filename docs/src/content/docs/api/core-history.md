---
title: "@sheetwrite/core/history"
description: "API reference for @sheetwrite/core/history."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core/history`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/history-archive.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>35</dd></div>
</dl>

Source entry: `packages/core/src/history-archive.ts`

## Exported symbols

### Classes <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/history-archive/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>HistoryArchive</code></span><span class="api-symbol-card__desc">Opt-in archive of named and automatic versions for one document.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-error/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>HistoryError</code></span><span class="api-symbol-card__desc">Expected archive failure; cancellation preserves the caller's abort reason.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/memory-history-storage/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>MemoryHistoryStorage</code></span><span class="api-symbol-card__desc">In-memory history for one page session and for tests.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>23</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/history-archive-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryArchiveOptions</code></span><span class="api-symbol-card__desc">Host-controlled archive configuration.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-cell/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryDiffCell</code></span><span class="api-symbol-card__desc">Source and style of one cell in one version.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-cells/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryDiffCells</code></span><span class="api-symbol-card__desc">Changed cells of one page as parallel typed columns, in sheet order and then row by row.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-cursor/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryDiffCursor</code></span><span class="api-symbol-card__desc">Where the next page of a diff starts.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-detail/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryDiffDetail</code></span><span class="api-symbol-card__desc">Before and after of one changed cell of the page.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-page/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryDiffPage</code></span><span class="api-symbol-card__desc">One bounded page of the difference between two versions.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryDiffRequest</code></span><span class="api-symbol-card__desc">One diff request between two retained versions.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-sheet/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryDiffSheet</code></span><span class="api-symbol-card__desc">A sheet that was added, removed, or changed outside its cell values.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-head/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryHead</code></span><span class="api-symbol-card__desc">Durable recorder cursor: the newest checkpoint, the log tail since it, and cadence counters.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-limits/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryLimits</code></span><span class="api-symbol-card__desc">Resource and retention ceilings for an opt-in history archive.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-list-page/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryListPage</code></span><span class="api-symbol-card__desc">Metadata-only response in newest-first order.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-list-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryListRequest</code></span><span class="api-symbol-card__desc">Bounded metadata-only page.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-manifest/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryManifest</code></span><span class="api-symbol-card__desc">Archive state, read without fetching any payload.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-pin-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryPinRequest</code></span><span class="api-symbol-card__desc">Acquire or release a five-minute renewable reader lease through the storage seam.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-prune-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryPruneRequest</code></span><span class="api-symbol-card__desc">Retention removes automatic markers, or one explicitly selected named marker.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-publish-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryPublishRequest</code></span><span class="api-symbol-card__desc">Atomically publish immutable records and a new head or version marker.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-record-metadata/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryRecordMetadata</code></span><span class="api-symbol-card__desc">Metadata for one immutable record; listings never return payload bytes.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-restore-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryRestoreOptions</code></span><span class="api-symbol-card__desc">Options for HistoryArchive.restoreVersion.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-storage-adapter/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStorageAdapter</code></span><span class="api-symbol-card__desc">Atomic storage seam for local databases and host-owned history backends.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-storage-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStorageRequest</code></span><span class="api-symbol-card__desc">Common document identity, ceilings, and cancellation for adapter calls.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-storage-usage/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStorageUsage</code></span><span class="api-symbol-card__desc">Retained storage of one document, including headers and index entries.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-stored-record/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStoredRecord</code></span><span class="api-symbol-card__desc">Immutable, content-addressed history payload and the records it refers to.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-version/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryVersion</code></span><span class="api-symbol-card__desc">A durable marker at one archived revision.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/history-error-code/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistoryErrorCode</code></span><span class="api-symbol-card__desc">Stable failure category for history validation, storage, and replay.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-get-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistoryGetRequest</code></span><span class="api-symbol-card__desc">Fetch metadata or a bounded immutable payload; leased reads renew their lease.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-put-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistoryPutRequest</code></span><span class="api-symbol-card__desc">A storage write either publishes one complete revision or manages a reader lease.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-restore-scope/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistoryRestoreScope</code></span><span class="api-symbol-card__desc">What a restore covers.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-snapshot-provider/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistorySnapshotProvider</code></span><span class="api-symbol-card__desc">Snapshot provider invoked only when a checkpoint is due.</span></a>
</div>

### Variables <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/default-history-limits/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>DEFAULT_HISTORY_LIMITS</code></span><span class="api-symbol-card__desc">Default byte, count, cadence, and retention bounds (decision recorded in #228).</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-none/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>HISTORY_DIFF_NONE</code></span><span class="api-symbol-card__desc">Author index of a change that no write in the retained log reaches: the difference is older than the log, so its author is not known.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-diff-flag/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>HistoryDiffFlag</code></span><span class="api-symbol-card__desc">Bits of HistoryDiffCells.flags; a change has one or more of them.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/max-history-diff-entries/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>MAX_HISTORY_DIFF_ENTRIES</code></span><span class="api-symbol-card__desc">Largest page a diff returns.</span></a>
</div>
