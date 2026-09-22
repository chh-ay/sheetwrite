---
title: "RuntimeMemoryObservation | @sheetwrite/core"
description: "Available runtime-level memory observations, kept separate from retained owner totals."
---
<!-- api-export:@sheetwrite/core|.|RuntimeMemoryObservation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Available runtime-level memory observations, kept separate from retained owner totals.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L83</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="runtime-memory-observation-used-jsheap-size" data-pagefind-weight="1" open>
<summary><code>usedJSHeapSize</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly usedJSHeapSize: number | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly usedJSHeapSize: number | null;
```

</details>

<details class="api-member" id="runtime-memory-observation-array-buffer-bytes" data-pagefind-weight="1" open>
<summary><code>arrayBufferBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly arrayBufferBytes: number | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly arrayBufferBytes: number | null;
```

</details>

<details class="api-member" id="runtime-memory-observation-external-bytes" data-pagefind-weight="1" open>
<summary><code>externalBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly externalBytes: number | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly externalBytes: number | null;
```

</details>

<details class="api-member" id="runtime-memory-observation-browser-backing-store-bytes" data-pagefind-weight="1" open>
<summary><code>browserBackingStoreBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly browserBackingStoreBytes: number | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly browserBackingStoreBytes: number | null;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RuntimeMemoryObservation {&#10;  readonly usedJSHeapSize: number | null;&#10;  readonly arrayBufferBytes: number | null;&#10;  readonly externalBytes: number | null;&#10;  readonly browserBackingStoreBytes: number | null;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RuntimeMemoryObservation {
  readonly usedJSHeapSize: number | null;
  readonly arrayBufferBytes: number | null;
  readonly externalBytes: number | null;
  readonly browserBackingStoreBytes: number | null;
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

<p class="api-consumers-label">Public exports naming <code>RuntimeMemoryObservation</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-runtime-resource-snapshot/"><code>createRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/observe-runtime-memory/"><code>observeRuntimeMemory</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/runtime-resource-snapshot/"><code>RuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
