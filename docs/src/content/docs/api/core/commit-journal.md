---
title: "CommitJournal | @sheetwrite/core"
description: "CommitJournal interface in @sheetwrite/core: Durable record of committed transactions, written as part of the commit: when record rejects, the authority does…"
---
<!-- api-export:@sheetwrite/core|.|CommitJournal -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Durable record of committed transactions, written as part of the commit:
when `record` rejects, the authority does not publish or acknowledge the
commit. `capture` returns the committed document after the transaction and
is called only when the journal needs a checkpoint. `HistoryArchive` from
`@sheetwrite/core/history` implements this interface.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/transaction.ts#L178"><code>packages/core/src/types/transaction.ts#L178</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="commit-journal-record" data-pagefind-weight="1">
<summary><code>record</code></summary>

```ts generated
record(commit: CommittedTransaction, capture: () => WorkbookSnapshot): Promise<void>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommitJournal {
  record(
    commit: CommittedTransaction,
    capture: () => WorkbookSnapshot,
  ): Promise<void>;
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

<p class="api-consumers-label">Public exports naming <code>CommitJournal</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/memory-persistence-adapter/"><code>MemoryPersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
