---
title: "CommittedTransaction | @sheetwrite/core"
description: "CommittedTransaction interface in @sheetwrite/core: One transaction as the document authority committed it: its revisions, its author and its time."
---
<!-- api-export:@sheetwrite/core|.|CommittedTransaction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One transaction as the document authority committed it: its revisions, its
author and its time. History archives record these, never optimistic edits.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/transaction.ts#L168"><code>packages/core/src/types/transaction.ts#L168</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#committed-transaction-base-revision"><code>baseRevision</code></a>
<a href="#committed-transaction-revision"><code>revision</code></a>
<a href="#committed-transaction-mutation-id"><code>mutationId</code></a>
<a href="#committed-transaction-author-id"><code>authorId</code></a>
<a href="#committed-transaction-time"><code>time</code></a>
<a href="#committed-transaction-operations"><code>operations</code></a>
<a href="#committed-transaction-restore"><code>restore</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="committed-transaction-base-revision" data-pagefind-weight="1">
<summary><code>baseRevision</code> <span class="api-member-summary">Revision the transaction applies to.</span></summary>

```ts generated
baseRevision: number;
```

</details>

<details class="api-member" id="committed-transaction-revision" data-pagefind-weight="1">
<summary><code>revision</code> <span class="api-member-summary">Revision after the transaction; an atomic batch advances up to 16 revisions.</span></summary>

```ts generated
revision: number;
```

</details>

<details class="api-member" id="committed-transaction-mutation-id" data-pagefind-weight="1">
<summary><code>mutationId</code> <span class="api-member-summary">Stable mutation ID of the commit, at most 256 code units.</span></summary>

```ts generated
mutationId: string;
```

</details>

<details class="api-member" id="committed-transaction-author-id" data-pagefind-weight="1">
<summary><code>authorId</code> <span class="api-member-summary">Authenticated ID of the person who made the change, at most 256 code units.</span></summary>

```ts generated
authorId: string;
```

</details>

<details class="api-member" id="committed-transaction-time" data-pagefind-weight="1">
<summary><code>time</code> <span class="api-member-summary">Commit time in milliseconds since the epoch; never before the previous commit.</span></summary>

```ts generated
time: number;
```

</details>

<details class="api-member" id="committed-transaction-operations" data-pagefind-weight="1">
<summary><code>operations</code> <span class="api-member-summary">The committed document operations, in order.</span></summary>

```ts generated
operations: readonly DocumentOp[];
```

</details>

<details class="api-member" id="committed-transaction-restore" data-pagefind-weight="1">
<summary><code>restore</code> <span class="api-member-summary">Present when the transaction restores a history version.</span></summary>

```ts generated
restore?: RestoreProvenance;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CommittedTransaction {
  baseRevision: number;
  revision: number;
  mutationId: string;
  authorId: string;
  time: number;
  operations: readonly DocumentOp[];
  restore?: RestoreProvenance;
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

<p class="api-consumers-label">Public exports naming <code>CommittedTransaction</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/commit-journal/"><code>CommitJournal</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
