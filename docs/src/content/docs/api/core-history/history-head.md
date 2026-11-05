---
title: "HistoryHead | @sheetwrite/core/history"
description: "HistoryHead interface in @sheetwrite/core/history: Durable recorder cursor. It does not retain operation payloads."
---
<!-- api-export:@sheetwrite/core|./history|HistoryHead -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Durable recorder cursor. It does not retain operation payloads.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L55"><code>packages/core/src/version-history/types.ts#L55</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-head-revision"><code>revision</code></a>
<a href="#history-head-checkpoint"><code>checkpoint</code></a>
<a href="#history-head-tail"><code>tail</code></a>
<a href="#history-head-time"><code>time</code></a>
<a href="#history-head-active-ms"><code>activeMs</code></a>
<a href="#history-head-automatic-at"><code>automaticAt</code></a>
<a href="#history-head-checkpoint-at"><code>checkpointAt</code></a>
<a href="#history-head-checkpoint-transactions"><code>checkpointTransactions</code></a>
<a href="#history-head-checkpoint-log-bytes"><code>checkpointLogBytes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="history-head-revision" data-pagefind-weight="1">
<summary><code>revision</code></summary>

```ts generated
revision: number;
```

</details>

<details class="api-member" id="history-head-checkpoint" data-pagefind-weight="1">
<summary><code>checkpoint</code></summary>

```ts generated
checkpoint: string;
```

</details>

<details class="api-member" id="history-head-tail" data-pagefind-weight="1">
<summary><code>tail</code></summary>

```ts generated
tail: readonly string[];
```

</details>

<details class="api-member" id="history-head-time" data-pagefind-weight="1">
<summary><code>time</code></summary>

```ts generated
time: number;
```

</details>

<details class="api-member" id="history-head-active-ms" data-pagefind-weight="1">
<summary><code>activeMs</code></summary>

```ts generated
activeMs: number;
```

</details>

<details class="api-member" id="history-head-automatic-at" data-pagefind-weight="1">
<summary><code>automaticAt</code></summary>

```ts generated
automaticAt: number;
```

</details>

<details class="api-member" id="history-head-checkpoint-at" data-pagefind-weight="1">
<summary><code>checkpointAt</code></summary>

```ts generated
checkpointAt: number;
```

</details>

<details class="api-member" id="history-head-checkpoint-transactions" data-pagefind-weight="1">
<summary><code>checkpointTransactions</code></summary>

```ts generated
checkpointTransactions: number;
```

</details>

<details class="api-member" id="history-head-checkpoint-log-bytes" data-pagefind-weight="1">
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
export interface HistoryHead {
  revision: number;
  checkpoint: string;
  tail: readonly string[];
  time: number;
  activeMs: number;
  automaticAt: number;
  checkpointAt: number;
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

<p class="api-consumers-label">Public exports naming <code>HistoryHead</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-manifest/"><code>HistoryManifest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-publish-request/"><code>HistoryPublishRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
