---
title: "ResourceOwnerBytes | @sheetwrite/core"
description: "Retained logical payload and allocated capacity attributed to one exclusive owner."
---
<!-- api-export:@sheetwrite/core|.|ResourceOwnerBytes -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Retained logical payload and allocated capacity attributed to one exclusive owner.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/store.ts#L21</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="resource-owner-bytes-owner" data-pagefind-weight="1" open>
<summary><code>owner</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly owner: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly owner: string;
```

</details>

<details class="api-member" id="resource-owner-bytes-logical-bytes" data-pagefind-weight="1" open>
<summary><code>logicalBytes</code> <span class="api-member-summary">Bytes containing live logical payload.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly logicalBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly logicalBytes: number;
```

<p class="api-member-doc">Bytes containing live logical payload. Never includes runtime observations.</p>
</details>

<details class="api-member" id="resource-owner-bytes-allocated-bytes" data-pagefind-weight="1" open>
<summary><code>allocatedBytes</code> <span class="api-member-summary">Container capacity owned exclusively by this owner.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly allocatedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly allocatedBytes: number;
```

</details>

<details class="api-member" id="resource-owner-bytes-entries" data-pagefind-weight="1" open>
<summary><code>entries</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly entries: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly entries: number;
```

</details>

<details class="api-member" id="resource-owner-bytes-measurement" data-pagefind-weight="1">
<summary><code>measurement</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly measurement: | &quot;exact-capacity&quot; | &quot;hash-capacity-v1&quot; | &quot;typed-array-byte-length&quot; | &quot;utf16-upper-bound&quot; | &quot;entry-count-only&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly measurement: | "exact-capacity" | "hash-capacity-v1" | "typed-array-byte-length" | "utf16-upper-bound" | "entry-count-only";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface ResourceOwnerBytes {&#10;  readonly owner: string;&#10;  readonly logicalBytes: number;&#10;  readonly allocatedBytes: number;&#10;  readonly entries: number;&#10;  readonly measurement:&#10;    | &quot;exact-capacity&quot;&#10;    | &quot;hash-capacity-v1&quot;&#10;    | &quot;typed-array-byte-length&quot;&#10;    | &quot;utf16-upper-bound&quot;&#10;    | &quot;entry-count-only&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface ResourceOwnerBytes {
  readonly owner: string;
  readonly logicalBytes: number;
  readonly allocatedBytes: number;
  readonly entries: number;
  readonly measurement:
    | "exact-capacity"
    | "hash-capacity-v1"
    | "typed-array-byte-length"
    | "utf16-upper-bound"
    | "entry-count-only";
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

<p class="api-consumers-label">Public exports naming <code>ResourceOwnerBytes</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-runtime-resource-snapshot/"><code>createRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/runtime-resource-snapshot/"><code>RuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store-memory-breakdown/"><code>StoreMemoryBreakdown</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
