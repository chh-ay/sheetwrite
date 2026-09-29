---
title: "PersistenceAdapter | @sheetwrite/core"
description: "Host load and commit contract for versioned workbook persistence."
---
<!-- api-export:@sheetwrite/core|.|PersistenceAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Host load and commit contract for versioned workbook persistence.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L123"><code>packages/core/src/types/transaction.ts#L123</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="persistence-adapter-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
```

</details>

<details class="api-member" id="persistence-adapter-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

```ts generated
commit(request: PersistenceCommitRequest): Promise<PersistenceCommitResponse>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PersistenceAdapter {
  load(documentId: string, signal?: AbortSignal): Promise<WorkbookSnapshot>;
  commit(
    request: PersistenceCommitRequest,
  ): Promise<PersistenceCommitResponse>;
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

<p class="api-consumers-label">Public exports naming <code>PersistenceAdapter</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/memory-persistence-adapter/"><code>MemoryPersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator/"><code>SyncCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
