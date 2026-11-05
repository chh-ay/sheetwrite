---
title: "HistoryDiffFlag | @sheetwrite/core/history"
description: "HistoryDiffFlag variable in @sheetwrite/core/history: Bits of HistoryDiffCells.flags; a change has one or more of them."
---
<!-- api-export:@sheetwrite/core|./history|HistoryDiffFlag -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="variable">variable</span></div>

Bits of `HistoryDiffCells.flags`; a change has one or more of them.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L14"><code>packages/core/src/version-history/diff.ts#L14</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const HistoryDiffFlag: Readonly<{
  value: 1;
  formula: 2;
  style: 4;
  added: 8;
  removed: 16;
}>
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>HistoryDiffFlag</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
