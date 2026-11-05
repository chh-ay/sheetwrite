---
title: "HistoryPublishRequest | @sheetwrite/core/history"
description: "HistoryPublishRequest interface in @sheetwrite/core/history: Atomically publish immutable records and a new head or version marker."
---
<!-- api-export:@sheetwrite/core|./history|HistoryPublishRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Atomically publish immutable records and a new head or version marker.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L125"><code>packages/core/src/version-history/types.ts#L125</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-publish-request-kind"><code>kind</code></a>
<a href="#history-publish-request-expected-generation"><code>expectedGeneration</code></a>
<a href="#history-publish-request-records"><code>records</code></a>
<a href="#history-publish-request-head"><code>head</code></a>
<a href="#history-publish-request-version"><code>version</code></a>
<a href="#history-publish-request-document-id"><code>documentId</code></a>
<a href="#history-publish-request-limits"><code>limits</code></a>
<a href="#history-publish-request-signal"><code>signal</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="history-publish-request-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: "publish";
```

</details>

<details class="api-member" id="history-publish-request-expected-generation" data-pagefind-weight="1">
<summary><code>expectedGeneration</code></summary>

```ts generated
expectedGeneration: number;
```

</details>

<details class="api-member" id="history-publish-request-records" data-pagefind-weight="1">
<summary><code>records</code></summary>

```ts generated
records: readonly HistoryStoredRecord[];
```

</details>

<details class="api-member" id="history-publish-request-head" data-pagefind-weight="1">
<summary><code>head</code></summary>

```ts generated
head?: HistoryHead;
```

</details>

<details class="api-member" id="history-publish-request-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
version?: HistoryVersion;
```

</details>

<details class="api-member" id="history-publish-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="history-publish-request-limits" data-pagefind-weight="1">
<summary><code>limits</code></summary>

```ts generated
limits: Readonly<HistoryLimits>;
```

</details>

<details class="api-member" id="history-publish-request-signal" data-pagefind-weight="1">
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
export interface HistoryPublishRequest {
  kind: "publish";
  expectedGeneration: number;
  records: readonly HistoryStoredRecord[];
  head?: HistoryHead;
  version?: HistoryVersion;
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

<p class="api-consumers-label">Public exports naming <code>HistoryPublishRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-put-request/"><code>HistoryPutRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
