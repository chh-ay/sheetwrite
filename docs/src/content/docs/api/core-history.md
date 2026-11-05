---
title: "@sheetwrite/core/history"
description: "API reference for @sheetwrite/core/history."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core/history`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/history-archive.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>24</dd></div>
</dl>

Source entry: `packages/core/src/history-archive.ts`

## Exported symbols

### Classes <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/history-archive/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>HistoryArchive</code></span><span class="api-symbol-card__desc">Opt-in, bounded history writer and replay module.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-error/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>HistoryError</code></span><span class="api-symbol-card__desc">Expected archive failure; cancellation preserves the caller's abort reason.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/memory-history-storage/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>MemoryHistoryStorage</code></span><span class="api-symbol-card__desc">Bounded session storage. Transactions use copy-on-write maps, not workbook copies.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>16</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/history-archive-options/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryArchiveOptions</code></span><span class="api-symbol-card__desc">Host-controlled archive configuration.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-commit/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryCommit</code></span><span class="api-symbol-card__desc">One authority-confirmed transaction, never an optimistic local change.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-head/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryHead</code></span><span class="api-symbol-card__desc">Durable recorder cursor. It does not retain operation payloads.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-limits/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryLimits</code></span><span class="api-symbol-card__desc">Resource and retention ceilings for an opt-in history archive.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-list-page/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryListPage</code></span><span class="api-symbol-card__desc">Metadata-only response in newest-first order.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-list-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryListRequest</code></span><span class="api-symbol-card__desc">Bounded metadata-only page.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-manifest/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryManifest</code></span><span class="api-symbol-card__desc">Manifest state returned without fetching a workbook payload.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-pin-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryPinRequest</code></span><span class="api-symbol-card__desc">Acquire or release a five-minute renewable reader lease through the storage seam.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-prune-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryPruneRequest</code></span><span class="api-symbol-card__desc">Retention removes automatic markers, or one explicitly selected named marker.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-publish-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryPublishRequest</code></span><span class="api-symbol-card__desc">Atomically publish immutable records and a new head or version marker.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-record-metadata/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryRecordMetadata</code></span><span class="api-symbol-card__desc">Metadata for one immutable record; listings never return payload bytes.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-storage-adapter/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStorageAdapter</code></span><span class="api-symbol-card__desc">Atomic storage seam for local databases and host-owned history backends.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-storage-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStorageRequest</code></span><span class="api-symbol-card__desc">Common document identity, ceilings, and cancellation for adapter calls.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-storage-usage/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStorageUsage</code></span><span class="api-symbol-card__desc">Aggregate retained storage, including index and reference metadata.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-stored-record/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryStoredRecord</code></span><span class="api-symbol-card__desc">Immutable, content-addressed history payload and its dependency edges.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-version/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>HistoryVersion</code></span><span class="api-symbol-card__desc">Named or automatically created durable revision marker.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/history-error-code/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistoryErrorCode</code></span><span class="api-symbol-card__desc">Stable failure category for history validation, storage, and replay.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-get-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistoryGetRequest</code></span><span class="api-symbol-card__desc">Fetch metadata or a bounded immutable payload; leased reads renew their lease.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-put-request/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistoryPutRequest</code></span><span class="api-symbol-card__desc">A storage write either publishes one complete revision or manages a reader lease.</span></a>
<a class="api-symbol-card" href="/docs/api/core-history/history-snapshot-provider/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>HistorySnapshotProvider</code></span><span class="api-symbol-card__desc">Snapshot provider invoked only when a checkpoint is due.</span></a>
</div>

### Variables <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-history/default-history-limits/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="variable" aria-hidden="true">V</span><code>DEFAULT_HISTORY_LIMITS</code></span><span class="api-symbol-card__desc">Default byte, count, cadence, and retention bounds.</span></a>
</div>
