---
title: "sanitizeCellStyle | @sheetwrite/core"
description: "sanitizeCellStyle function in @sheetwrite/core: A plain, bounded copy of an untrusted cell style, or null when value is not a plain object of known style…"
---
<!-- api-export:@sheetwrite/core|.|sanitizeCellStyle -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

A plain, bounded copy of an untrusted cell style, or null when `value` is
not a plain object of known style fields or any field breaks its rule. The
same rule guards hyperlinks, table styles and pasted cells.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/cell-style-fields.ts#L129"><code>packages/core/src/cell-style-fields.ts#L129</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function sanitizeCellStyle(value: unknown): CellStyle | null
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

<p class="api-consumers-label">Public exports naming <code>sanitizeCellStyle</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
