---
title: "HistoryDiffPage | @sheetwrite/core/history"
description: "HistoryDiffPage interface in @sheetwrite/core/history: One bounded page of the difference between two versions."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffPage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

One bounded page of the difference between two versions.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L111"><code>packages/core/src/version-history/diff.ts#L111</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#history-diff-page-sheets"><code>sheets</code></a>
<a href="#history-diff-page-workbook"><code>workbook</code></a>
<a href="#history-diff-page-sheet-ids"><code>sheetIds</code></a>
<a href="#history-diff-page-authors"><code>authors</code></a>
<a href="#history-diff-page-cells"><code>cells</code></a>
<a href="#history-diff-page-details"><code>details</code></a>
<a href="#history-diff-page-log-complete"><code>logComplete</code></a>
<a href="#history-diff-page-cursor"><code>cursor</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="history-diff-page-sheets" data-pagefind-weight="1">
<summary><code>sheets</code> <span class="api-member-summary">Sheets added, removed or changed outside their cells; the same on every page.</span></summary>

```ts generated
sheets: readonly HistoryDiffSheet[];
```

</details>

<details class="api-member" id="history-diff-page-workbook" data-pagefind-weight="1">
<summary><code>workbook</code> <span class="api-member-summary">Workbook fields that differ, such as namedRanges or calculation.</span></summary>

```ts generated
workbook: readonly string[];
```

</details>

<details class="api-member" id="history-diff-page-sheet-ids" data-pagefind-weight="1">
<summary><code>sheetIds</code> <span class="api-member-summary">Sheet IDs that cells.sheet indexes.</span></summary>

```ts generated
sheetIds: readonly SheetId[];
```

</details>

<details class="api-member" id="history-diff-page-authors" data-pagefind-weight="1">
<summary><code>authors</code> <span class="api-member-summary">Author IDs that the author and writers indexes name.</span></summary>

```ts generated
authors: readonly string[];
```

</details>

<details class="api-member" id="history-diff-page-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>

```ts generated
cells: HistoryDiffCells;
```

</details>

<details class="api-member" id="history-diff-page-details" data-pagefind-weight="1">
<summary><code>details</code> <span class="api-member-summary">Before and after of each changed cell, in cells order.</span></summary>

```ts generated
details: readonly HistoryDiffDetail[];
```

</details>

<details class="api-member" id="history-diff-page-log-complete" data-pagefind-weight="1">
<summary><code>logComplete</code> <span class="api-member-summary">false when part of the log between the versions is no longer retained: rows and columns are then compared by position before the retained part, and changes there have no known author.</span></summary>

```ts generated
logComplete: boolean;
```

</details>

<details class="api-member" id="history-diff-page-cursor" data-pagefind-weight="1">
<summary><code>cursor</code> <span class="api-member-summary">Present when more changes follow; pass it to the next request.</span></summary>

```ts generated
cursor?: HistoryDiffCursor;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryDiffPage {
  sheets: readonly HistoryDiffSheet[];
  workbook: readonly string[];
  sheetIds: readonly SheetId[];
  authors: readonly string[];
  cells: HistoryDiffCells;
  details: readonly HistoryDiffDetail[];
  logComplete: boolean;
  cursor?: HistoryDiffCursor;
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

<p class="api-consumers-label">Public exports naming <code>HistoryDiffPage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
