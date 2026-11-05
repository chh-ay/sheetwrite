---
title: "HistoryListRequest | @sheetwrite/core/history"
description: "HistoryListRequest interface in @sheetwrite/core/history: Bounded metadata-only page."
---
<!-- api-export:@sheetwrite/core|./history|HistoryListRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Bounded metadata-only page. Cursors are scoped to a manifest generation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L144"><code>packages/core/src/version-history/types.ts#L144</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-list-request-kind"><code>kind</code></a>
<a href="#history-list-request-from-revision"><code>fromRevision</code></a>
<a href="#history-list-request-to-revision"><code>toRevision</code></a>
<a href="#history-list-request-max-entries"><code>maxEntries</code></a>
<a href="#history-list-request-max-bytes"><code>maxBytes</code></a>
<a href="#history-list-request-cursor"><code>cursor</code></a>
<a href="#history-list-request-document-id"><code>documentId</code></a>
<a href="#history-list-request-limits"><code>limits</code></a>
<a href="#history-list-request-signal"><code>signal</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="history-list-request-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind?: "versions" | HistoryStoredRecord["kind"];
```

</details>

<details class="api-member" id="history-list-request-from-revision" data-pagefind-weight="1">
<summary><code>fromRevision</code></summary>

```ts generated
fromRevision?: number;
```

</details>

<details class="api-member" id="history-list-request-to-revision" data-pagefind-weight="1">
<summary><code>toRevision</code></summary>

```ts generated
toRevision?: number;
```

</details>

<details class="api-member" id="history-list-request-max-entries" data-pagefind-weight="1">
<summary><code>maxEntries</code></summary>

```ts generated
maxEntries: number;
```

</details>

<details class="api-member" id="history-list-request-max-bytes" data-pagefind-weight="1">
<summary><code>maxBytes</code></summary>

```ts generated
maxBytes: number;
```

</details>

<details class="api-member" id="history-list-request-cursor" data-pagefind-weight="1">
<summary><code>cursor</code></summary>

```ts generated
cursor?: string;
```

</details>

<details class="api-member" id="history-list-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="history-list-request-limits" data-pagefind-weight="1">
<summary><code>limits</code></summary>

```ts generated
limits: Readonly<HistoryLimits>;
```

</details>

<details class="api-member" id="history-list-request-signal" data-pagefind-weight="1">
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
export interface HistoryListRequest {
  kind?: "versions" | HistoryStoredRecord["kind"];
  fromRevision?: number;
  toRevision?: number;
  maxEntries: number;
  maxBytes: number;
  cursor?: string;
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

<p class="api-consumers-label">Public exports naming <code>HistoryListRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-storage-adapter/"><code>HistoryStorageAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
