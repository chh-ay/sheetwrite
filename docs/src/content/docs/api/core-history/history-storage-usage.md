---
title: "HistoryStorageUsage | @sheetwrite/core/history"
description: "HistoryStorageUsage interface in @sheetwrite/core/history: Retained storage of one document, including headers and index entries."
---
<!-- api-export:@sheetwrite/core|./history|HistoryStorageUsage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Retained storage of one document, including headers and index entries.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L87"><code>packages/core/src/version-history/types.ts#L87</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="history-storage-usage-encoded-bytes" data-pagefind-weight="1">
<summary><code>encodedBytes</code></summary>

```ts generated
encodedBytes: number;
```

</details>

<details class="api-member" id="history-storage-usage-record-count" data-pagefind-weight="1">
<summary><code>recordCount</code></summary>

```ts generated
recordCount: number;
```

</details>

<details class="api-member" id="history-storage-usage-version-count" data-pagefind-weight="1">
<summary><code>versionCount</code></summary>

```ts generated
versionCount: number;
```

</details>

<details class="api-member" id="history-storage-usage-named-version-count" data-pagefind-weight="1">
<summary><code>namedVersionCount</code></summary>

```ts generated
namedVersionCount: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryStorageUsage {
  encodedBytes: number;
  recordCount: number;
  versionCount: number;
  namedVersionCount: number;
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

<p class="api-consumers-label">Public exports naming <code>HistoryStorageUsage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
