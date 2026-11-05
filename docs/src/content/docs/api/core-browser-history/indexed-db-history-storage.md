---
title: "IndexedDbHistoryStorage | @sheetwrite/core/browser/history"
description: "IndexedDbHistoryStorage class in @sheetwrite/core/browser/history: Browser-only history storage with atomic publication and restart-safe reference counts."
---
<!-- api-export:@sheetwrite/core|./browser/history|IndexedDbHistoryStorage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser-history/">@sheetwrite/core/browser/history</a><span class="api-status" data-kind="class">class</span></div>

Browser-only history storage with atomic publication and restart-safe reference counts.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/history-indexeddb.ts#L156"><code>packages/core/src/history-indexeddb.ts#L156</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-history-storage-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(options?: IndexedDbHistoryStorageOptions);
```

</details>

<details class="api-member" id="indexed-db-history-storage-transact" data-pagefind-weight="1">
<summary><code>transact</code></summary>

```ts generated
transact: <T>(request: HistoryStorageRequest, action: (transaction: HistoryStorageTransaction) => Promise<T>) => Promise<T>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class IndexedDbHistoryStorage extends AtomicHistoryStorage {
  constructor(options?: IndexedDbHistoryStorageOptions);
  transact: <T>(
    request: HistoryStorageRequest,
    action: (transaction: HistoryStorageTransaction) => Promise<T>,
  ) => Promise<T>;
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

<p class="api-consumers-label">Public exports naming <code>IndexedDbHistoryStorage</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
