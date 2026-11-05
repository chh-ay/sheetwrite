---
title: "HistoryCommit | @sheetwrite/core/history"
description: "HistoryCommit interface in @sheetwrite/core/history: One authority-confirmed transaction, never an optimistic local change."
---
<!-- api-export:@sheetwrite/core|./history|HistoryCommit -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

One authority-confirmed transaction, never an optimistic local change.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L22"><code>packages/core/src/version-history/types.ts#L22</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="history-commit-base-revision" data-pagefind-weight="1">
<summary><code>baseRevision</code></summary>

```ts generated
baseRevision: number;
```

</details>

<details class="api-member" id="history-commit-revision" data-pagefind-weight="1">
<summary><code>revision</code></summary>

```ts generated
revision: number;
```

</details>

<details class="api-member" id="history-commit-mutation-id" data-pagefind-weight="1">
<summary><code>mutationId</code></summary>

```ts generated
mutationId: string;
```

</details>

<details class="api-member" id="history-commit-author-id" data-pagefind-weight="1">
<summary><code>authorId</code></summary>

```ts generated
authorId: string;
```

</details>

<details class="api-member" id="history-commit-time" data-pagefind-weight="1">
<summary><code>time</code></summary>

```ts generated
time: number;
```

</details>

<details class="api-member" id="history-commit-operations" data-pagefind-weight="1">
<summary><code>operations</code></summary>

```ts generated
operations: readonly DocumentOp[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryCommit {
  baseRevision: number;
  revision: number;
  mutationId: string;
  authorId: string;
  time: number;
  operations: readonly DocumentOp[];
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

<p class="api-consumers-label">Public exports naming <code>HistoryCommit</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
