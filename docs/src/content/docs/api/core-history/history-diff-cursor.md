---
title: "HistoryDiffCursor | @sheetwrite/core/history"
description: "HistoryDiffCursor interface in @sheetwrite/core/history: Where the next page of a diff starts."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffCursor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Where the next page of a diff starts. Pass it back unchanged.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L41"><code>packages/core/src/version-history/diff.ts#L41</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="history-diff-cursor-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: number;
```

</details>

<details class="api-member" id="history-diff-cursor-row" data-pagefind-weight="1">
<summary><code>row</code></summary>

```ts generated
readonly row: number;
```

</details>

<details class="api-member" id="history-diff-cursor-piece" data-pagefind-weight="1">
<summary><code>piece</code></summary>

```ts generated
readonly piece: number;
```

</details>

<details class="api-member" id="history-diff-cursor-cell" data-pagefind-weight="1">
<summary><code>cell</code></summary>

```ts generated
readonly cell: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryDiffCursor {
  readonly sheet: number;
  readonly row: number;
  readonly piece: number;
  readonly cell: number;
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

<p class="api-consumers-label">Public exports naming <code>HistoryDiffCursor</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-diff-page/"><code>HistoryDiffPage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-diff-request/"><code>HistoryDiffRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
