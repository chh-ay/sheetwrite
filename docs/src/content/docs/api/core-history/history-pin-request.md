---
title: "HistoryPinRequest | @sheetwrite/core/history"
description: "HistoryPinRequest interface in @sheetwrite/core/history: Acquire or release a five-minute renewable reader lease through the storage seam."
---
<!-- api-export:@sheetwrite/core|./history|HistoryPinRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Acquire or release a five-minute renewable reader lease through the storage seam.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L134"><code>packages/core/src/version-history/types.ts#L134</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="history-pin-request-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: "pin" | "release";
```

</details>

<details class="api-member" id="history-pin-request-token" data-pagefind-weight="1">
<summary><code>token</code></summary>

```ts generated
token: string;
```

</details>

<details class="api-member" id="history-pin-request-version-id" data-pagefind-weight="1">
<summary><code>versionId</code></summary>

```ts generated
versionId: string;
```

</details>

<details class="api-member" id="history-pin-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="history-pin-request-limits" data-pagefind-weight="1">
<summary><code>limits</code></summary>

```ts generated
limits: Readonly<HistoryLimits>;
```

</details>

<details class="api-member" id="history-pin-request-signal" data-pagefind-weight="1">
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
export interface HistoryPinRequest {
  kind: "pin" | "release";
  token: string;
  versionId: string;
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

<p class="api-consumers-label">Public exports naming <code>HistoryPinRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-put-request/"><code>HistoryPutRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
