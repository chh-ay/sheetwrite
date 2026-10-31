---
title: "translateFormula | @sheetwrite/formulas"
description: "translateFormula function in @sheetwrite/formulas: Move the relative references of a copied formula by the distance from its source cell to its target cell."
---
<!-- api-export:@sheetwrite/formulas|.|translateFormula -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="function">function</span></div>

Move the relative references of a copied formula by the distance from
its source cell to its target cell. Absolute parts stay; a reference
moved off the sheet becomes `#REF!`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/formulas/pkg/sheetwrite_wasm.d.ts#L605"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L605</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function translateFormula(
  source: string,
  row_delta: number,
  col_delta: number,
): string
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>translateFormula</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
