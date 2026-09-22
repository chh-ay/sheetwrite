---
title: "BoundaryOperationStats | @sheetwrite/core"
description: "Fixed-cardinality boundary crossing counters for one operation."
---
<!-- api-export:@sheetwrite/core|.|BoundaryOperationStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Fixed-cardinality boundary crossing counters for one operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L72</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#boundary-operation-stats-operation"><code>operation</code></a>
<a href="#boundary-operation-stats-ffi-calls"><code>ffiCalls</code></a>
<a href="#boundary-operation-stats-js-to-wasm-bytes"><code>jsToWasmBytes</code></a>
<a href="#boundary-operation-stats-wasm-to-js-bytes"><code>wasmToJsBytes</code></a>
<a href="#boundary-operation-stats-largest-transfer-bytes"><code>largestTransferBytes</code></a>
<a href="#boundary-operation-stats-bulk-calls"><code>bulkCalls</code></a>
<a href="#boundary-operation-stats-scalar-calls"><code>scalarCalls</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="boundary-operation-stats-operation" data-pagefind-weight="1" open>
<summary><code>operation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly operation: RuntimeResourceOperation;" data-pagefind-ignore>Copy</button>

```ts generated
readonly operation: RuntimeResourceOperation;
```

</details>

<details class="api-member" id="boundary-operation-stats-ffi-calls" data-pagefind-weight="1" open>
<summary><code>ffiCalls</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly ffiCalls: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly ffiCalls: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-js-to-wasm-bytes" data-pagefind-weight="1" open>
<summary><code>jsToWasmBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly jsToWasmBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly jsToWasmBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-wasm-to-js-bytes" data-pagefind-weight="1" open>
<summary><code>wasmToJsBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly wasmToJsBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly wasmToJsBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-largest-transfer-bytes" data-pagefind-weight="1" open>
<summary><code>largestTransferBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly largestTransferBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly largestTransferBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-bulk-calls" data-pagefind-weight="1" open>
<summary><code>bulkCalls</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly bulkCalls: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly bulkCalls: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-scalar-calls" data-pagefind-weight="1" open>
<summary><code>scalarCalls</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly scalarCalls: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly scalarCalls: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface BoundaryOperationStats {&#10;  readonly operation: RuntimeResourceOperation;&#10;  readonly ffiCalls: number;&#10;  readonly jsToWasmBytes: number;&#10;  readonly wasmToJsBytes: number;&#10;  readonly largestTransferBytes: number;&#10;  readonly bulkCalls: number;&#10;  readonly scalarCalls: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface BoundaryOperationStats {
  readonly operation: RuntimeResourceOperation;
  readonly ffiCalls: number;
  readonly jsToWasmBytes: number;
  readonly wasmToJsBytes: number;
  readonly largestTransferBytes: number;
  readonly bulkCalls: number;
  readonly scalarCalls: number;
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

<p class="api-consumers-label">Public exports naming <code>BoundaryOperationStats</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-runtime-resource-snapshot/"><code>createRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/runtime-resource-snapshot/"><code>RuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
