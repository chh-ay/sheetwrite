---
title: "HistoryDiffSheet | @sheetwrite/core/history"
description: "HistoryDiffSheet interface in @sheetwrite/core/history: A sheet that was added, removed, or changed outside its cell values."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffSheet -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

A sheet that was added, removed, or changed outside its cell values.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L99"><code>packages/core/src/version-history/diff.ts#L99</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="history-diff-sheet-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet: SheetId;
```

</details>

<details class="api-member" id="history-diff-sheet-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Name in the later version, or in the earlier one for a removed sheet.</span></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="history-diff-sheet-change" data-pagefind-weight="1">
<summary><code>change</code></summary>

```ts generated
change: "added" | "removed" | "changed";
```

</details>

<details class="api-member" id="history-diff-sheet-fields" data-pagefind-weight="1">
<summary><code>fields</code> <span class="api-member-summary">For changed: the sheet fields that differ, such as name, rowCount or merges.</span></summary>

```ts generated
fields: readonly string[];
```

</details>

<details class="api-member" id="history-diff-sheet-author" data-pagefind-weight="1">
<summary><code>author</code> <span class="api-member-summary">Last writer of a structural or sheet setting change, or HISTORYDIFFNONE.</span></summary>

```ts generated
author: number;
```

<p class="api-member-doc">Last writer of a structural or sheet setting change, or `HISTORY_DIFF_NONE`.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryDiffSheet {
  sheet: SheetId;
  name: string;
  change: "added" | "removed" | "changed";
  fields: readonly string[];
  author: number;
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

<p class="api-consumers-label">Public exports naming <code>HistoryDiffSheet</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-diff-page/"><code>HistoryDiffPage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
