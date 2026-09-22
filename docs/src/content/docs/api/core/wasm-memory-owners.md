---
title: "WASM_MEMORY_OWNERS | @sheetwrite/core"
description: "Stable ordered owner list encoded by the WASM store-memory protocol."
---
<!-- api-export:@sheetwrite/core|.|WASM_MEMORY_OWNERS -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="variable">variable</span></div>

Stable ordered owner list encoded by the WASM store-memory protocol.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L13</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="const WASM_MEMORY_OWNERS: readonly [&#10;  &quot;wasm.dense.kinds&quot;,&#10;  &quot;wasm.dense.payloads&quot;,&#10;  &quot;wasm.dense.styles&quot;,&#10;  &quot;wasm.paged.kinds&quot;,&#10;  &quot;wasm.paged.payloads&quot;,&#10;  &quot;wasm.paged.styles&quot;,&#10;  &quot;wasm.paged.loaded-bitmaps&quot;,&#10;  &quot;wasm.paged.dirty-bitmaps&quot;,&#10;  &quot;wasm.paged.indexes&quot;,&#10;  &quot;wasm.string-pool.utf8&quot;,&#10;  &quot;wasm.string-pool.spans&quot;,&#10;  &quot;wasm.string-index&quot;,&#10;  &quot;wasm.formulas&quot;,&#10;  &quot;wasm.dependency-nodes&quot;,&#10;  &quot;wasm.dependency-edges&quot;,&#10;  &quot;wasm.sheet-indexes-metadata&quot;,&#10;  &quot;wasm.spill-ranges&quot;,&#10;  &quot;wasm.spill-owners&quot;,&#10;  &quot;wasm.spill-blockers&quot;,&#10;]" data-pagefind-ignore>Copy</button>

```ts generated
const WASM_MEMORY_OWNERS: readonly [
  "wasm.dense.kinds",
  "wasm.dense.payloads",
  "wasm.dense.styles",
  "wasm.paged.kinds",
  "wasm.paged.payloads",
  "wasm.paged.styles",
  "wasm.paged.loaded-bitmaps",
  "wasm.paged.dirty-bitmaps",
  "wasm.paged.indexes",
  "wasm.string-pool.utf8",
  "wasm.string-pool.spans",
  "wasm.string-index",
  "wasm.formulas",
  "wasm.dependency-nodes",
  "wasm.dependency-edges",
  "wasm.sheet-indexes-metadata",
  "wasm.spill-ranges",
  "wasm.spill-owners",
  "wasm.spill-blockers",
]
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>WASM_MEMORY_OWNERS</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/wasm-memory-owner/"><code>WasmMemoryOwner</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
