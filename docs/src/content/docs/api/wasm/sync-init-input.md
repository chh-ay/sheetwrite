---
title: "SyncInitInput | @sheetwrite/wasm"
description: "Sources accepted by synchronous initialization: raw module bytes or a precompiled WebAssembly.Module."
---
<!-- api-export:@sheetwrite/wasm|.|SyncInitInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="type">type</span></div>

Sources accepted by synchronous initialization: raw module bytes or a precompiled `WebAssembly.Module`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/pkg/sheetwrite_wasm.d.ts#L588"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L588</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SyncInitInput = BufferSource | WebAssembly.Module;
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

<p class="api-consumers-label">Public exports naming <code>SyncInitInput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/init-sync/"><code>initSync</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/init-sync/"><code>initSync</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
