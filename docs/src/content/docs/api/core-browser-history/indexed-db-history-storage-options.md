---
title: "IndexedDbHistoryStorageOptions | @sheetwrite/core/browser/history"
description: "IndexedDbHistoryStorageOptions interface in @sheetwrite/core/browser/history: Database selection for a host-owned browser history archive."
---
<!-- api-export:@sheetwrite/core|./browser/history|IndexedDbHistoryStorageOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser-history/">@sheetwrite/core/browser/history</a><span class="api-status" data-kind="interface">interface</span></div>

Database selection for a host-owned browser history archive.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/history-indexeddb.ts#L19"><code>packages/core/src/history-indexeddb.ts#L19</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-history-storage-options-database-name" data-pagefind-weight="1">
<summary><code>databaseName</code></summary>

```ts generated
databaseName?: string;
```

</details>

<details class="api-member" id="indexed-db-history-storage-options-indexed-db" data-pagefind-weight="1">
<summary><code>indexedDB</code></summary>

```ts generated
indexedDB?: IDBFactory;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface IndexedDbHistoryStorageOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
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

<p class="api-consumers-label">Public exports naming <code>IndexedDbHistoryStorageOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-browser-history/indexed-db-history-storage/"><code>IndexedDbHistoryStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
