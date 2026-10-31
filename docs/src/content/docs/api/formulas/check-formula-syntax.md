---
title: "checkFormulaSyntax | @sheetwrite/formulas"
description: "checkFormulaSyntax function in @sheetwrite/formulas: The first syntax error in formula text, or undefined when the engine's parser reads the whole formula."
---
<!-- api-export:@sheetwrite/formulas|.|checkFormulaSyntax -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="function">function</span></div>

The first syntax error in formula text, or `undefined` when the engine's
parser reads the whole formula. A leading `=` is optional, as for a cell.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/formulas/pkg/sheetwrite_wasm.d.ts#L579"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L579</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function checkFormulaSyntax(
  src: string,
): FormulaSyntaxError | undefined
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>checkFormulaSyntax</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
