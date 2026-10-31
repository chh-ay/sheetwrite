---
title: "shiftFormulaAxis | @sheetwrite/wasm"
description: "shiftFormulaAxis function in @sheetwrite/wasm: Follow delta rows or columns inserted (positive) or deleted (negative) at at on the formula's own sheet."
---
<!-- api-export:@sheetwrite/wasm|.|shiftFormulaAxis -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="function">function</span></div>

Follow `delta` rows or columns inserted (positive) or deleted (negative)
at `at` on the formula's own sheet. A range loses its deleted rows or
columns and becomes `#REF!` only when none are left.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/pkg/sheetwrite_wasm.d.ts#L515"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L515</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function shiftFormulaAxis(
  source: string,
  columns: boolean,
  at: number,
  delta: number,
): string
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

<p class="api-consumers-label">Public exports naming <code>shiftFormulaAxis</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
