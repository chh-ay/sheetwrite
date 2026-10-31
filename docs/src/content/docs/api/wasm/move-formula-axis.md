---
title: "moveFormulaAxis | @sheetwrite/wasm"
description: "moveFormulaAxis function in @sheetwrite/wasm: Follow count rows or columns moved from from to to on the formula's own sheet; to is the first index of the…"
---
<!-- api-export:@sheetwrite/wasm|.|moveFormulaAxis -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="function">function</span></div>

Follow `count` rows or columns moved from `from` to `to` on the formula's
own sheet; `to` is the first index of the moved block after the move.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/pkg/sheetwrite_wasm.d.ts#L508"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L508</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function moveFormulaAxis(
  source: string,
  columns: boolean,
  from: number,
  count: number,
  to: number,
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

<p class="api-consumers-label">Public exports naming <code>moveFormulaAxis</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
