---
title: "SyncInitInput | @sheetwrite/formulas"
description: "Sources accepted by synchronous initialization: raw module bytes or a precompiled WebAssembly.Module."
---
<!-- api-export:@sheetwrite/formulas|.|SyncInitInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="type">type</span></div>

Sources accepted by synchronous initialization: raw module bytes or a precompiled `WebAssembly.Module`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/formulas/pkg/sheetwrite_wasm.d.ts#L607"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L607</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SyncInitInput = BufferSource | WebAssembly.Module;
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SyncInitInput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-sync/"><code>initSync</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-sync/"><code>initSync</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
