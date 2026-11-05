---
title: "HistoryPruneRequest | @sheetwrite/core/history"
description: "HistoryPruneRequest interface in @sheetwrite/core/history: Retention removes automatic markers, or one explicitly selected named marker."
---
<!-- api-export:@sheetwrite/core|./history|HistoryPruneRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Retention removes automatic markers, or one explicitly selected named marker.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L178"><code>packages/core/src/version-history/types.ts#L178</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-prune-request-expected-generation"><code>expectedGeneration</code></a>
<a href="#history-prune-request-before-time"><code>beforeTime</code></a>
<a href="#history-prune-request-delete-version-id"><code>deleteVersionId</code></a>
<a href="#history-prune-request-target-bytes"><code>targetBytes</code></a>
<a href="#history-prune-request-document-id"><code>documentId</code></a>
<a href="#history-prune-request-limits"><code>limits</code></a>
<a href="#history-prune-request-signal"><code>signal</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="history-prune-request-expected-generation" data-pagefind-weight="1">
<summary><code>expectedGeneration</code></summary>

```ts generated
expectedGeneration: number;
```

</details>

<details class="api-member" id="history-prune-request-before-time" data-pagefind-weight="1">
<summary><code>beforeTime</code></summary>

```ts generated
beforeTime: number;
```

</details>

<details class="api-member" id="history-prune-request-delete-version-id" data-pagefind-weight="1">
<summary><code>deleteVersionId</code></summary>

```ts generated
deleteVersionId?: string;
```

</details>

<details class="api-member" id="history-prune-request-target-bytes" data-pagefind-weight="1">
<summary><code>targetBytes</code></summary>

```ts generated
targetBytes?: number;
```

</details>

<details class="api-member" id="history-prune-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="history-prune-request-limits" data-pagefind-weight="1">
<summary><code>limits</code></summary>

```ts generated
limits: Readonly<HistoryLimits>;
```

</details>

<details class="api-member" id="history-prune-request-signal" data-pagefind-weight="1">
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
export interface HistoryPruneRequest {
  expectedGeneration: number;
  beforeTime: number;
  deleteVersionId?: string;
  targetBytes?: number;
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
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>HistoryPruneRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-storage-adapter/"><code>HistoryStorageAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
