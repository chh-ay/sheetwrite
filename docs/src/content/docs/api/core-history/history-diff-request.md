---
title: "HistoryDiffRequest | @sheetwrite/core/history"
description: "HistoryDiffRequest interface in @sheetwrite/core/history: One diff request between two retained versions."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

One diff request between two retained versions.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L49"><code>packages/core/src/version-history/diff.ts#L49</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="history-diff-request-from" data-pagefind-weight="1">
<summary><code>from</code> <span class="api-member-summary">The earlier version.</span></summary>

```ts generated
from: string;
```

</details>

<details class="api-member" id="history-diff-request-to" data-pagefind-weight="1">
<summary><code>to</code> <span class="api-member-summary">The later version.</span></summary>

```ts generated
to: string;
```

</details>

<details class="api-member" id="history-diff-request-cursor" data-pagefind-weight="1">
<summary><code>cursor</code> <span class="api-member-summary">The cursor of the previous page; omit for the first page.</span></summary>

```ts generated
cursor?: HistoryDiffCursor;
```

</details>

<details class="api-member" id="history-diff-request-max-entries" data-pagefind-weight="1">
<summary><code>maxEntries</code> <span class="api-member-summary">Changes per page, from 1 to 1,000; default 1,000.</span></summary>

```ts generated
maxEntries?: number;
```

</details>

<details class="api-member" id="history-diff-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="history-diff-request-kernel" data-pagefind-weight="1">
<summary><code>kernel</code> <span class="api-member-summary">Where the diff kernel WASM comes from; see @sheetwrite/wasm/history.</span></summary>

```ts generated
kernel?: BufferSource | URL | string | Request | WebAssembly.Module;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryDiffRequest {
  from: string;
  to: string;
  cursor?: HistoryDiffCursor;
  maxEntries?: number;
  signal?: AbortSignal;
  kernel?: BufferSource | URL | string | Request | WebAssembly.Module;
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

<p class="api-consumers-label">Public exports naming <code>HistoryDiffRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
