---
title: "formulaToXlsx | @sheetwrite/wasm"
description: "formulaToXlsx function in @sheetwrite/wasm: Write future-function, local-binding and spill spellings for OOXML formulas."
---
<!-- api-export:@sheetwrite/wasm|.|formulaToXlsx -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="function">function</span></div>

Write future-function, local-binding and spill spellings for OOXML formulas.
This is lexical: unknown future functions and incomplete formulas still
round-trip without a parse/serialize pass changing their source text.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/pkg/sheetwrite_wasm.d.ts#L617"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L617</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function formulaToXlsx(source: string): string
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>formulaToXlsx</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
