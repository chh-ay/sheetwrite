---
title: "PagedStoreStats | @sheetwrite/core"
description: "Allocation and load statistics for one paged datasource sheet."
---
<!-- api-export:@sheetwrite/core|.|PagedStoreStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Allocation and load statistics for one paged datasource sheet.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L120</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="paged-store-stats-chunks" data-pagefind-weight="1" open>
<summary><code>chunks</code></summary>

<button class="api-copy" type="button" data-copy-code="chunks: number;" data-pagefind-ignore>Copy</button>

```ts generated
chunks: number;
```

</details>

<details class="api-member" id="paged-store-stats-loaded-cells" data-pagefind-weight="1" open>
<summary><code>loadedCells</code></summary>

<button class="api-copy" type="button" data-copy-code="loadedCells: number;" data-pagefind-ignore>Copy</button>

```ts generated
loadedCells: number;
```

</details>

<details class="api-member" id="paged-store-stats-dirty-cells" data-pagefind-weight="1" open>
<summary><code>dirtyCells</code></summary>

<button class="api-copy" type="button" data-copy-code="dirtyCells: number;" data-pagefind-ignore>Copy</button>

```ts generated
dirtyCells: number;
```

</details>

<details class="api-member" id="paged-store-stats-allocated-bytes" data-pagefind-weight="1" open>
<summary><code>allocatedBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="allocatedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
allocatedBytes: number;
```

</details>

<details class="api-member" id="paged-store-stats-dirty-allocated-bytes" data-pagefind-weight="1" open>
<summary><code>dirtyAllocatedBytes</code> <span class="api-member-summary">Sparse local-edit overlay bytes, excluded from the clean chunk cache budget.</span></summary>

<button class="api-copy" type="button" data-copy-code="dirtyAllocatedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
dirtyAllocatedBytes: number;
```

</details>

<details class="api-member" id="paged-store-stats-fully-loaded" data-pagefind-weight="1" open>
<summary><code>fullyLoaded</code></summary>

<button class="api-copy" type="button" data-copy-code="fullyLoaded: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
fullyLoaded: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface PagedStoreStats {&#10;  chunks: number;&#10;  loadedCells: number;&#10;  dirtyCells: number;&#10;  allocatedBytes: number;&#10;  dirtyAllocatedBytes: number;&#10;  fullyLoaded: boolean;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface PagedStoreStats {
  chunks: number;
  loadedCells: number;
  dirtyCells: number;
  allocatedBytes: number;
  dirtyAllocatedBytes: number;
  fullyLoaded: boolean;
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

<p class="api-consumers-label">Public exports naming <code>PagedStoreStats</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
