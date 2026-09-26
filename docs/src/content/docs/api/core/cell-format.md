---
title: "CellFormat | @sheetwrite/core"
description: "How a column's cells are typed, parsed, and rendered: text verbatim, number via its numberFormat, date as an Excel-style serial (see date-serial.ts) rendered by a date numberFormat, and currency as a plain number…"
---
<!-- api-export:@sheetwrite/core|.|CellFormat -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

How a column's cells are typed, parsed, and rendered: `text` verbatim, `number`
via its `numberFormat`, `date` as an Excel-style serial (see `date-serial.ts`)
rendered by a date `numberFormat`, and `currency` as a plain number rendered by
a currency `numberFormat` (e.g. `$#,##0.00`).

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/cell.ts#L91"><code>packages/core/src/types/cell.ts#L91</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type CellFormat = "text" | "number" | "date" | "currency";
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>CellFormat</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-input-snapshot/"><code>CellInputSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/column/"><code>Column</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/parse-cell-input/"><code>parseCellInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/parse-cell-literal-input/"><code>parseCellLiteralInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/simple-column/"><code>SimpleColumn</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/simple-column/"><code>SimpleColumn</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/simple-column/"><code>SimpleColumn</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/simple-column/"><code>SimpleColumn</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
