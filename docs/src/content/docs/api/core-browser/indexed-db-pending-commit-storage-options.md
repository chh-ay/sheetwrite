---
title: "IndexedDbPendingCommitStorageOptions | @sheetwrite/core/browser"
description: "Database and store naming options for durable pending commits."
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorageOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser/">@sheetwrite/core/browser</a><span class="api-status" data-kind="interface">interface</span></div>

Database and store naming options for durable pending commits.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/indexeddb.ts#L35"><code>packages/core/src/indexeddb.ts#L35</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="indexed-db-pending-commit-storage-options-database-name" data-pagefind-weight="1">
<summary><code>databaseName</code></summary>

```ts generated
databaseName?: string;
```

</details>

<details class="api-member" id="indexed-db-pending-commit-storage-options-store-name" data-pagefind-weight="1">
<summary><code>storeName</code></summary>

```ts generated
storeName?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface IndexedDbPendingCommitStorageOptions {
  databaseName?: string;
  storeName?: string;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>IndexedDbPendingCommitStorageOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-browser/indexed-db-pending-commit-storage/"><code>IndexedDbPendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
