---
title: "RuntimeResourceSnapshot | @sheetwrite/core"
description: "Complete retained-resource and boundary snapshot for one operation phase."
---
<!-- api-export:@sheetwrite/core|.|RuntimeResourceSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Complete retained-resource and boundary snapshot for one operation phase.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L99</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#runtime-resource-snapshot-schema-version"><code>schemaVersion</code></a>
<a href="#runtime-resource-snapshot-operation"><code>operation</code></a>
<a href="#runtime-resource-snapshot-phase"><code>phase</code></a>
<a href="#runtime-resource-snapshot-wasm"><code>wasm</code></a>
<a href="#runtime-resource-snapshot-js-owners"><code>jsOwners</code></a>
<a href="#runtime-resource-snapshot-boundary"><code>boundary</code></a>
<a href="#runtime-resource-snapshot-runtime"><code>runtime</code></a>
<a href="#runtime-resource-snapshot-totals"><code>totals</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="runtime-resource-snapshot-schema-version" data-pagefind-weight="1" open>
<summary><code>schemaVersion</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;" data-pagefind-ignore>Copy</button>

```ts generated
readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-operation" data-pagefind-weight="1" open>
<summary><code>operation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly operation: RuntimeResourceOperation;" data-pagefind-ignore>Copy</button>

```ts generated
readonly operation: RuntimeResourceOperation;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-phase" data-pagefind-weight="1" open>
<summary><code>phase</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly phase: RuntimeResourcePhase;" data-pagefind-ignore>Copy</button>

```ts generated
readonly phase: RuntimeResourcePhase;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-wasm" data-pagefind-weight="1" open>
<summary><code>wasm</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly wasm: StoreMemoryBreakdown;" data-pagefind-ignore>Copy</button>

```ts generated
readonly wasm: StoreMemoryBreakdown;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-js-owners" data-pagefind-weight="1" open>
<summary><code>jsOwners</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly jsOwners: readonly ResourceOwnerBytes[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly jsOwners: readonly ResourceOwnerBytes[];
```

</details>

<details class="api-member" id="runtime-resource-snapshot-boundary" data-pagefind-weight="1" open>
<summary><code>boundary</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly boundary: readonly BoundaryOperationStats[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly boundary: readonly BoundaryOperationStats[];
```

</details>

<details class="api-member" id="runtime-resource-snapshot-runtime" data-pagefind-weight="1" open>
<summary><code>runtime</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly runtime: RuntimeMemoryObservation;" data-pagefind-ignore>Copy</button>

```ts generated
readonly runtime: RuntimeMemoryObservation;
```

</details>

<details class="api-member" id="runtime-resource-snapshot-totals" data-pagefind-weight="1" open>
<summary><code>totals</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly totals: { readonly logicalLiveBytes: number; readonly allocatedCapacityBytes: number; };" data-pagefind-ignore>Copy</button>

```ts generated
readonly totals: { readonly logicalLiveBytes: number; readonly allocatedCapacityBytes: number; };
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RuntimeResourceSnapshot {&#10;  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;&#10;  readonly operation: RuntimeResourceOperation;&#10;  readonly phase: RuntimeResourcePhase;&#10;  readonly wasm: StoreMemoryBreakdown;&#10;  readonly jsOwners: readonly ResourceOwnerBytes[];&#10;  readonly boundary: readonly BoundaryOperationStats[];&#10;  readonly runtime: RuntimeMemoryObservation;&#10;  readonly totals: {&#10;    readonly logicalLiveBytes: number;&#10;    readonly allocatedCapacityBytes: number;&#10;  };&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RuntimeResourceSnapshot {
  readonly schemaVersion: typeof RUNTIME_RESOURCE_SCHEMA_VERSION;
  readonly operation: RuntimeResourceOperation;
  readonly phase: RuntimeResourcePhase;
  readonly wasm: StoreMemoryBreakdown;
  readonly jsOwners: readonly ResourceOwnerBytes[];
  readonly boundary: readonly BoundaryOperationStats[];
  readonly runtime: RuntimeMemoryObservation;
  readonly totals: {
    readonly logicalLiveBytes: number;
    readonly allocatedCapacityBytes: number;
  };
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

<p class="api-consumers-label">Public exports naming <code>RuntimeResourceSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/assert-runtime-resource-snapshot/"><code>assertRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/create-runtime-resource-snapshot/"><code>createRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/diff-runtime-resource-phases/"><code>diffRuntimeResourcePhases</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
