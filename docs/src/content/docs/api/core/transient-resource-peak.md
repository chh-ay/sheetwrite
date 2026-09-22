---
title: "TransientResourcePeak | @sheetwrite/core"
description: "Operation-scoped transient peak, excluded from retained owner totals."
---
<!-- api-export:@sheetwrite/core|.|TransientResourcePeak -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Operation-scoped transient peak, excluded from retained owner totals.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/resource-accounting.ts#L91</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="transient-resource-peak-owner" data-pagefind-weight="1" open>
<summary><code>owner</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly owner: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly owner: string;
```

</details>

<details class="api-member" id="transient-resource-peak-peak-bytes" data-pagefind-weight="1" open>
<summary><code>peakBytes</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly peakBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly peakBytes: number;
```

</details>

<details class="api-member" id="transient-resource-peak-allocations" data-pagefind-weight="1" open>
<summary><code>allocations</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly allocations: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly allocations: number;
```

</details>

<details class="api-member" id="transient-resource-peak-measurement" data-pagefind-weight="1" open>
<summary><code>measurement</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly measurement: &quot;instrumented-operation-peak&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly measurement: "instrumented-operation-peak";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface TransientResourcePeak {&#10;  readonly owner: string;&#10;  readonly peakBytes: number;&#10;  readonly allocations: number;&#10;  readonly measurement: &quot;instrumented-operation-peak&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface TransientResourcePeak {
  readonly owner: string;
  readonly peakBytes: number;
  readonly allocations: number;
  readonly measurement: "instrumented-operation-peak";
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

<p class="api-consumers-label">Public exports naming <code>TransientResourcePeak</code></p>

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
