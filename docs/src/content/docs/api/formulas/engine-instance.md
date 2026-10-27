---
title: "EngineInstance | @sheetwrite/formulas"
description: "Engine objects and caches owned by one independently collectible WASM instance."
---
<!-- api-export:@sheetwrite/formulas|.|EngineInstance -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="type">type</span></div>

Engine objects and caches owned by one independently collectible WASM instance.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/formulas/loader.d.ts#L38"><code>packages/formulas/loader.d.ts#L38</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type EngineInstance = Omit<typeof WasmExports, "default"> & {
  getModule(): WebAssembly.Module;
  getMemory(): WebAssembly.Memory;
  retire(): void;
  functionNames?: () => string[];
};
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>EngineInstance</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-engine/"><code>SheetwriteEngine</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/formulas/create-engine/"><code>createEngine</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/create-engine/"><code>createEngine</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
