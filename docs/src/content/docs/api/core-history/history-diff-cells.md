---
title: "HistoryDiffCells | @sheetwrite/core/history"
description: "HistoryDiffCells interface in @sheetwrite/core/history: Changed cells of one page as parallel typed columns, in sheet order and then row by row."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffCells -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Changed cells of one page as parallel typed columns, in sheet order and then
row by row. Row and column numbers are those of the later version.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L67"><code>packages/core/src/version-history/diff.ts#L67</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-diff-cells-sheet"><code>sheet</code></a>
<a href="#history-diff-cells-row"><code>row</code></a>
<a href="#history-diff-cells-col"><code>col</code></a>
<a href="#history-diff-cells-before-row"><code>beforeRow</code></a>
<a href="#history-diff-cells-before-col"><code>beforeCol</code></a>
<a href="#history-diff-cells-flags"><code>flags</code></a>
<a href="#history-diff-cells-author"><code>author</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="history-diff-cells-sheet" data-pagefind-weight="1">
<summary><code>sheet</code> <span class="api-member-summary">Index into HistoryDiffPage.sheetIds.</span></summary>

```ts generated
readonly sheet: Uint32Array;
```

</details>

<details class="api-member" id="history-diff-cells-row" data-pagefind-weight="1">
<summary><code>row</code></summary>

```ts generated
readonly row: Uint32Array;
```

</details>

<details class="api-member" id="history-diff-cells-col" data-pagefind-weight="1">
<summary><code>col</code></summary>

```ts generated
readonly col: Uint32Array;
```

</details>

<details class="api-member" id="history-diff-cells-before-row" data-pagefind-weight="1">
<summary><code>beforeRow</code> <span class="api-member-summary">Position in the earlier version, or HISTORYDIFFNONE on an added row or column.</span></summary>

```ts generated
readonly beforeRow: Uint32Array;
```

<p class="api-member-doc">Position in the earlier version, or `HISTORY_DIFF_NONE` on an added row or column.</p>
</details>

<details class="api-member" id="history-diff-cells-before-col" data-pagefind-weight="1">
<summary><code>beforeCol</code></summary>

```ts generated
readonly beforeCol: Uint32Array;
```

</details>

<details class="api-member" id="history-diff-cells-flags" data-pagefind-weight="1">
<summary><code>flags</code> <span class="api-member-summary">HistoryDiffFlag bits.</span></summary>

```ts generated
readonly flags: Uint8Array;
```

</details>

<details class="api-member" id="history-diff-cells-author" data-pagefind-weight="1">
<summary><code>author</code> <span class="api-member-summary">Index into HistoryDiffPage.authors of the last writer, or HISTORYDIFFNONE.</span></summary>

```ts generated
readonly author: Uint32Array;
```

<p class="api-member-doc">Index into `HistoryDiffPage.authors` of the last writer, or `HISTORY_DIFF_NONE`.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryDiffCells {
  readonly sheet: Uint32Array;
  readonly row: Uint32Array;
  readonly col: Uint32Array;
  readonly beforeRow: Uint32Array;
  readonly beforeCol: Uint32Array;
  readonly flags: Uint8Array;
  readonly author: Uint32Array;
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

<p class="api-consumers-label">Public exports naming <code>HistoryDiffCells</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-diff-page/"><code>HistoryDiffPage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
