---
title: "parseCurrencyInput | @sheetwrite/core"
description: "Parse a currency-formatted string into a plain number, or null when the remaining text is not numeric."
---
<!-- api-export:@sheetwrite/core|.|parseCurrencyInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse a currency-formatted string into a plain number, or `null` when the
remaining text is not numeric. Strips currency symbols (`$ € £ ¥ ¤`), thousands
grouping (`,`), and whitespace, and reads accounting-style parentheses
(`(1,234.50)`) as a negative amount. Grouping/decimals follow the US locale the
renderer uses.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/cell-input.ts#L110"><code>packages/core/src/cell-input.ts#L110</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function parseCurrencyInput(raw: string): number | null
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

<p class="api-consumers-label">Public exports naming <code>parseCurrencyInput</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
