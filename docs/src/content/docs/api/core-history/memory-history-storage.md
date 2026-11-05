---
title: "MemoryHistoryStorage | @sheetwrite/core/history"
description: "MemoryHistoryStorage class in @sheetwrite/core/history: Bounded session storage. Transactions use copy-on-write maps, not workbook copies."
---
<!-- api-export:@sheetwrite/core|./history|MemoryHistoryStorage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="class">class</span></div>

Bounded session storage. Transactions use copy-on-write maps, not workbook copies.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/storage.ts#L519"><code>packages/core/src/version-history/storage.ts#L519</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="memory-history-storage-transact" data-pagefind-weight="1">
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
class MemoryHistoryStorage extends AtomicHistoryStorage {
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

<p class="api-consumers-label">Public exports naming <code>MemoryHistoryStorage</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
