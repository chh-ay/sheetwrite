---
title: "HistoryStorageAdapter | @sheetwrite/core/history"
description: "HistoryStorageAdapter interface in @sheetwrite/core/history: Atomic storage seam for local databases and host-owned history backends."
---
<!-- api-export:@sheetwrite/core|./history|HistoryStorageAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Atomic storage seam for local databases and host-owned history backends.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L170"><code>packages/core/src/version-history/types.ts#L170</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="history-storage-adapter-put" data-pagefind-weight="1">
<summary><code>put</code></summary>

```ts generated
put(request: HistoryPutRequest): Promise<HistoryManifest>;
```

</details>

<details class="api-member" id="history-storage-adapter-get" data-pagefind-weight="1">
<summary><code>get</code></summary>

```ts generated
get(request: HistoryGetRequest): Promise<HistoryManifest | HistoryVersion | HistoryStoredRecord>;
```

</details>

<details class="api-member" id="history-storage-adapter-list" data-pagefind-weight="1">
<summary><code>list</code></summary>

```ts generated
list(request: HistoryListRequest): Promise<HistoryListPage>;
```

</details>

<details class="api-member" id="history-storage-adapter-prune" data-pagefind-weight="1">
<summary><code>prune</code></summary>

```ts generated
prune(request: HistoryPruneRequest): Promise<HistoryManifest>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryStorageAdapter {
  put(request: HistoryPutRequest): Promise<HistoryManifest>;
  get(
    request: HistoryGetRequest,
  ): Promise<HistoryManifest | HistoryVersion | HistoryStoredRecord>;
  list(request: HistoryListRequest): Promise<HistoryListPage>;
  prune(request: HistoryPruneRequest): Promise<HistoryManifest>;
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

<p class="api-consumers-label">Public exports naming <code>HistoryStorageAdapter</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive-options/"><code>HistoryArchiveOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
