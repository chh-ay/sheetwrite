---
title: "HistoryListPage | @sheetwrite/core/history"
description: "HistoryListPage interface in @sheetwrite/core/history: Metadata-only response in newest-first order."
---
<!-- api-export:@sheetwrite/core|./history|HistoryListPage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Metadata-only response in newest-first order.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L134"><code>packages/core/src/version-history/types.ts#L134</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="history-list-page-versions" data-pagefind-weight="1">
<summary><code>versions</code></summary>

```ts generated
versions: readonly HistoryVersion[];
```

</details>

<details class="api-member" id="history-list-page-records" data-pagefind-weight="1">
<summary><code>records</code></summary>

```ts generated
records?: readonly HistoryRecordMetadata[];
```

</details>

<details class="api-member" id="history-list-page-cursor" data-pagefind-weight="1">
<summary><code>cursor</code></summary>

```ts generated
cursor?: string;
```

</details>

<details class="api-member" id="history-list-page-generation" data-pagefind-weight="1">
<summary><code>generation</code></summary>

```ts generated
generation: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryListPage {
  versions: readonly HistoryVersion[];
  records?: readonly HistoryRecordMetadata[];
  cursor?: string;
  generation: number;
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

<p class="api-consumers-label">Public exports naming <code>HistoryListPage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-storage-adapter/"><code>HistoryStorageAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
