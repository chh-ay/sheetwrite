---
title: "HistoryLimits | @sheetwrite/core/history"
description: "HistoryLimits interface in @sheetwrite/core/history: Resource and retention ceilings for an opt-in history archive."
---
<!-- api-export:@sheetwrite/core|./history|HistoryLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Resource and retention ceilings for an opt-in history archive.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L4"><code>packages/core/src/version-history/types.ts#L4</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-limits-max-snapshot-bytes"><code>maxSnapshotBytes</code></a>
<a href="#history-limits-max-segment-bytes"><code>maxSegmentBytes</code></a>
<a href="#history-limits-max-transaction-bytes"><code>maxTransactionBytes</code></a>
<a href="#history-limits-max-storage-bytes"><code>maxStorageBytes</code></a>
<a href="#history-limits-max-working-bytes"><code>maxWorkingBytes</code></a>
<a href="#history-limits-max-named-versions"><code>maxNamedVersions</code></a>
<a href="#history-limits-max-versions"><code>maxVersions</code></a>
<a href="#history-limits-max-page-entries"><code>maxPageEntries</code></a>
<a href="#history-limits-max-page-bytes"><code>maxPageBytes</code></a>
<a href="#history-limits-max-age-ms"><code>maxAgeMs</code></a>
<a href="#history-limits-automatic-interval-ms"><code>automaticIntervalMs</code></a>
<a href="#history-limits-checkpoint-interval-ms"><code>checkpointIntervalMs</code></a>
<a href="#history-limits-checkpoint-transactions"><code>checkpointTransactions</code></a>
<a href="#history-limits-checkpoint-log-bytes"><code>checkpointLogBytes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>14</span>

<div class="api-member-list">

<details class="api-member" id="history-limits-max-snapshot-bytes" data-pagefind-weight="1">
<summary><code>maxSnapshotBytes</code></summary>

```ts generated
maxSnapshotBytes: number;
```

</details>

<details class="api-member" id="history-limits-max-segment-bytes" data-pagefind-weight="1">
<summary><code>maxSegmentBytes</code></summary>

```ts generated
maxSegmentBytes: number;
```

</details>

<details class="api-member" id="history-limits-max-transaction-bytes" data-pagefind-weight="1">
<summary><code>maxTransactionBytes</code></summary>

```ts generated
maxTransactionBytes: number;
```

</details>

<details class="api-member" id="history-limits-max-storage-bytes" data-pagefind-weight="1">
<summary><code>maxStorageBytes</code></summary>

```ts generated
maxStorageBytes: number;
```

</details>

<details class="api-member" id="history-limits-max-working-bytes" data-pagefind-weight="1">
<summary><code>maxWorkingBytes</code></summary>

```ts generated
maxWorkingBytes: number;
```

</details>

<details class="api-member" id="history-limits-max-named-versions" data-pagefind-weight="1">
<summary><code>maxNamedVersions</code></summary>

```ts generated
maxNamedVersions: number;
```

</details>

<details class="api-member" id="history-limits-max-versions" data-pagefind-weight="1">
<summary><code>maxVersions</code></summary>

```ts generated
maxVersions: number;
```

</details>

<details class="api-member" id="history-limits-max-page-entries" data-pagefind-weight="1">
<summary><code>maxPageEntries</code></summary>

```ts generated
maxPageEntries: number;
```

</details>

<details class="api-member" id="history-limits-max-page-bytes" data-pagefind-weight="1">
<summary><code>maxPageBytes</code></summary>

```ts generated
maxPageBytes: number;
```

</details>

<details class="api-member" id="history-limits-max-age-ms" data-pagefind-weight="1">
<summary><code>maxAgeMs</code></summary>

```ts generated
maxAgeMs: number;
```

</details>

<details class="api-member" id="history-limits-automatic-interval-ms" data-pagefind-weight="1">
<summary><code>automaticIntervalMs</code></summary>

```ts generated
automaticIntervalMs: number;
```

</details>

<details class="api-member" id="history-limits-checkpoint-interval-ms" data-pagefind-weight="1">
<summary><code>checkpointIntervalMs</code></summary>

```ts generated
checkpointIntervalMs: number;
```

</details>

<details class="api-member" id="history-limits-checkpoint-transactions" data-pagefind-weight="1">
<summary><code>checkpointTransactions</code></summary>

```ts generated
checkpointTransactions: number;
```

</details>

<details class="api-member" id="history-limits-checkpoint-log-bytes" data-pagefind-weight="1">
<summary><code>checkpointLogBytes</code></summary>

```ts generated
checkpointLogBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryLimits {
  maxSnapshotBytes: number;
  maxSegmentBytes: number;
  maxTransactionBytes: number;
  maxStorageBytes: number;
  maxWorkingBytes: number;
  maxNamedVersions: number;
  maxVersions: number;
  maxPageEntries: number;
  maxPageBytes: number;
  maxAgeMs: number;
  automaticIntervalMs: number;
  checkpointIntervalMs: number;
  checkpointTransactions: number;
  checkpointLogBytes: number;
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

<p class="api-consumers-label">Public exports naming <code>HistoryLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/default-history-limits/"><code>DEFAULT_HISTORY_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-archive-options/"><code>HistoryArchiveOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-list-request/"><code>HistoryListRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-pin-request/"><code>HistoryPinRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-prune-request/"><code>HistoryPruneRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-publish-request/"><code>HistoryPublishRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-storage-request/"><code>HistoryStorageRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
