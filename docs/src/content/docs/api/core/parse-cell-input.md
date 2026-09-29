---
title: "parseCellInput | @sheetwrite/core"
description: "Coerce raw text input into a CellValue, following spreadsheet input-bar conventions: - blank (after trimming) clears the cell to a null literal; - text longer than one character beginning with = becomes a formula; -…"
---
<!-- api-export:@sheetwrite/core|.|parseCellInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Coerce raw text input into a [`CellValue`](/docs/api/core/cell-value/), following spreadsheet
input-bar conventions:

- blank (after trimming) clears the cell to a `null` literal;
- text longer than one character beginning with `=` becomes a formula;
- in a `number` column a finite numeric string becomes a number literal;
- in a `date` column a recognized date string ([`parseDateInput`](/docs/api/core/parse-date-input/)) becomes
  its serial-number literal;
- in a `currency` column a currency string ([`parseCurrencyInput`](/docs/api/core/parse-currency-input/)) becomes
  a plain number literal;
- anything else is stored verbatim as a text literal (the untrimmed `raw`).

Shared by the grid's inline editor and any host-built formula bar, so input
parsing is identical everywhere instead of re-derived per consumer.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/cell-input.ts#L28"><code>packages/core/src/cell-input.ts#L28</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function parseCellInput(raw: string, type: CellFormat): CellValue
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

<p class="api-consumers-label">Public exports naming <code>parseCellInput</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
