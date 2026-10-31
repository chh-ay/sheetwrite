---
title: "shiftA1Refs | @sheetwrite/core"
description: "shiftA1Refs function in @sheetwrite/core: Shift relative A1 references in a formula by (dRow, dCol), as a copy or fill from one cell to another does."
---
<!-- api-export:@sheetwrite/core|.|shiftA1Refs -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Shift relative A1 references in a formula by (dRow, dCol), as a copy or
fill from one cell to another does. Absolute parts ($A, A$1) stay fixed, and
a reference shifted off the sheet becomes `#REF!`. The engine owns the
reference rules, so this needs `initSheetwrite()` first.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/a1.ts#L48"><code>packages/core/src/a1.ts#L48</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function shiftA1Refs(src: string, dRow: number, dCol: number): string
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>shiftA1Refs</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
