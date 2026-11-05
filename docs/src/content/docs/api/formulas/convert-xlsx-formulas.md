---
title: "convertXlsxFormulas | @sheetwrite/formulas"
description: "convertXlsxFormulas function in @sheetwrite/formulas: Convert a workbook's formula sources in one JavaScript-to-WASM call."
---
<!-- api-export:@sheetwrite/formulas|.|convertXlsxFormulas -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="function">function</span></div>

Convert a workbook's formula sources in one JavaScript-to-WASM call.
The consumed input vector can release each source as its result is produced.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/formulas/pkg/sheetwrite_wasm.d.ts#L656"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L656</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function convertXlsxFormulas(
  sources: string[],
  exporting: boolean,
): string[]
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>convertXlsxFormulas</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-output/"><code>InitOutput</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
