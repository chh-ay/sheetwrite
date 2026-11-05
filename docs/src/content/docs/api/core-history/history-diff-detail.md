---
title: "HistoryDiffDetail | @sheetwrite/core/history"
description: "HistoryDiffDetail interface in @sheetwrite/core/history: Before and after of one changed cell of the page."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffDetail -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Before and after of one changed cell of the page.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L90"><code>packages/core/src/version-history/diff.ts#L90</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="history-diff-detail-before" data-pagefind-weight="1">
<summary><code>before</code> <span class="api-member-summary">null on a row or column that the earlier version did not have.</span></summary>

```ts generated
before: HistoryDiffCell | null;
```

</details>

<details class="api-member" id="history-diff-detail-after" data-pagefind-weight="1">
<summary><code>after</code></summary>

```ts generated
after: HistoryDiffCell;
```

</details>

<details class="api-member" id="history-diff-detail-writers" data-pagefind-weight="1">
<summary><code>writers</code> <span class="api-member-summary">Everyone who wrote the cell between the versions, as authors indexes, first writer first.</span></summary>

```ts generated
writers: readonly number[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryDiffDetail {
  before: HistoryDiffCell | null;
  after: HistoryDiffCell;
  writers: readonly number[];
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

<p class="api-consumers-label">Public exports naming <code>HistoryDiffDetail</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-diff-page/"><code>HistoryDiffPage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
