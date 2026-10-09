---
title: "initSync | @sheetwrite/formulas"
description: "Instantiates the given module, which can either be bytes or a precompiled WebAssembly.Module."
---
<!-- api-export:@sheetwrite/formulas|.|initSync -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="function">function</span></div>

Instantiates the given `module`, which can either be bytes or
a precompiled `WebAssembly.Module`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/formulas/pkg/sheetwrite_wasm.d.ts#L617"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L617</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function initSync(
  module:
    | {
        module: SyncInitInput;
      }
    | SyncInitInput,
): InitOutput
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>initSync</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
