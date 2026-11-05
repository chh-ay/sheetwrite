---
title: "HISTORY_DIFF_NONE | @sheetwrite/core/history"
description: "HISTORY_DIFF_NONE variable in @sheetwrite/core/history: Author index of a change that no write in the retained log reaches: the difference is older than the…"
---
<!-- api-export:@sheetwrite/core|./history|HISTORY_DIFF_NONE -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="variable">variable</span></div>

Author index of a change that no write in the retained log reaches: the
difference is older than the log, so its author is not known. Also the
`beforeRow` and `beforeCol` of a cell on a row or column added later.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/diff.ts#L32"><code>packages/core/src/version-history/diff.ts#L32</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const HISTORY_DIFF_NONE: 4294967295
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

<p class="api-consumers-label">Public exports naming <code>HISTORY_DIFF_NONE</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
