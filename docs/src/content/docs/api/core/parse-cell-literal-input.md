---
title: "parseCellLiteralInput | @sheetwrite/core"
description: "Parse imported text as a literal using the same boolean, number, date, and currency rules as parseCellInput."
---
<!-- api-export:@sheetwrite/core|.|parseCellLiteralInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse imported text as a literal using the same boolean, number, date, and
currency rules as [`parseCellInput`](/docs/api/core/parse-cell-input/). Unlike interactive entry, a leading
`=` remains inert text. Declared date columns also accept an existing finite
date serial so delimited export/import preserves numeric dates.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/cell-input.ts#L78"><code>packages/core/src/cell-input.ts#L78</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function parseCellLiteralInput(
  raw: string,
  type: CellFormat,
): CellScalar
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

<p class="api-consumers-label">Public exports naming <code>parseCellLiteralInput</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
