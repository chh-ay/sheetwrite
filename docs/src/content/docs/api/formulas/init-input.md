---
title: "InitInput | @sheetwrite/formulas"
description: "Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled WebAssembly.Module."
---
<!-- api-export:@sheetwrite/formulas|.|InitInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="type">type</span></div>

Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled `WebAssembly.Module`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/formulas/pkg/sheetwrite_wasm.d.ts#L463"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L463</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type InitInput =
  RequestInfo | URL | Response | BufferSource | WebAssembly.Module;
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>InitInput</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
