---
title: "HistoryStorageRequest | @sheetwrite/core/history"
description: "HistoryStorageRequest interface in @sheetwrite/core/history: Common document identity, ceilings, and cancellation for adapter calls."
---
<!-- api-export:@sheetwrite/core|./history|HistoryStorageRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Common document identity, ceilings, and cancellation for adapter calls.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L102"><code>packages/core/src/version-history/types.ts#L102</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="history-storage-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="history-storage-request-limits" data-pagefind-weight="1">
<summary><code>limits</code></summary>

```ts generated
limits: Readonly<HistoryLimits>;
```

</details>

<details class="api-member" id="history-storage-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal?: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryStorageRequest {
  documentId: string;
  limits: Readonly<HistoryLimits>;
  signal?: AbortSignal;
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

<p class="api-consumers-label">Public exports naming <code>HistoryStorageRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-browser-history/indexed-db-history-storage/"><code>IndexedDbHistoryStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-get-request/"><code>HistoryGetRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/memory-history-storage/"><code>MemoryHistoryStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
