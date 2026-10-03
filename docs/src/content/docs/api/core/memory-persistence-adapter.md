---
title: "MemoryPersistenceAdapter | @sheetwrite/core"
description: "Executable database-neutral reference adapter for tests, demos, and local workflows."
---
<!-- api-export:@sheetwrite/core|.|MemoryPersistenceAdapter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Executable database-neutral reference adapter for tests, demos, and local workflows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/persistence.ts#L96"><code>packages/core/src/persistence.ts#L96</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="memory-persistence-adapter-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(...snapshots: readonly WorkbookSnapshot[]);
```

</details>

<details class="api-member" id="memory-persistence-adapter-commit" data-pagefind-weight="1">
<summary><code>commit</code></summary>

```ts generated
commit: (request: PersistenceCommitRequest) => Promise<PersistenceCommitResponse>;
```

</details>

<details class="api-member" id="memory-persistence-adapter-commit-batch" data-pagefind-weight="1">
<summary><code>commitBatch</code> <span class="api-member-summary">Validate every member version against the default sync limits, apply the members in order to one scratch store, and publish all of them only when every member applied.</span></summary>

```ts generated
commitBatch: (request: PersistenceBatchCommitRequest) => Promise<PersistenceCommitResponse>;
```

</details>

<details class="api-member" id="memory-persistence-adapter-load" data-pagefind-weight="1">
<summary><code>load</code></summary>

```ts generated
load: (documentId: string, signal?: AbortSignal) => Promise<WorkbookSnapshot>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class MemoryPersistenceAdapter implements PersistenceAdapter {
  constructor(...snapshots: readonly WorkbookSnapshot[]);
  commit: (
    request: PersistenceCommitRequest,
  ) => Promise<PersistenceCommitResponse>;
  commitBatch: (
    request: PersistenceBatchCommitRequest,
  ) => Promise<PersistenceCommitResponse>;
  load: (
    documentId: string,
    signal?: AbortSignal,
  ) => Promise<WorkbookSnapshot>;
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

<p class="api-consumers-label">Public exports naming <code>MemoryPersistenceAdapter</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
