---
title: "SheetwriteInitializationProps | @sheetwrite/core/adapter"
description: "Optional explicit WASM source and initialization error callback for adapters."
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteInitializationProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Optional explicit WASM source and initialization error callback for adapters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/adapter.ts#L140</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-initialization-props-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code> <span class="api-member-summary">Explicit source passed to process-wide WASM initialization; concurrent initialization is first-source-wins.</span></summary>

<button class="api-copy" type="button" data-copy-code="wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;" data-pagefind-ignore>Copy</button>

```ts generated
wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
```

</details>

<details class="api-member" id="sheetwrite-initialization-props-on-initialization-error" data-pagefind-weight="1" open>
<summary><code>onInitializationError</code> <span class="api-member-summary">Called when WASM initialization fails while the adapter is mounted.</span></summary>

<button class="api-copy" type="button" data-copy-code="onInitializationError?: (error: SheetwriteError) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onInitializationError?: (error: SheetwriteError) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface SheetwriteInitializationProps {&#10;  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;&#10;  onInitializationError?: (error: SheetwriteError) =&gt; void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface SheetwriteInitializationProps {
  wasmSource?: BufferSource | URL | string | Request | WebAssembly.Module;
  onInitializationError?: (error: SheetwriteError) => void;
}
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>SheetwriteInitializationProps</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/vue/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
