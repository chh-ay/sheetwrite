---
title: "GridReadyEvent | @sheetwrite/vue"
description: "Grid handle, generation, and reason published after adapter initialization."
---
<!-- api-export:@sheetwrite/vue|.|GridReadyEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Grid handle, generation, and reason published after adapter initialization.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/vue</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/adapter.d.ts#L34</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="grid-ready-event-grid" data-pagefind-weight="1" open>
<summary><code>grid</code> <span class="api-member-summary">Live handle just published by the adapter; replaced on the next reset generation.</span></summary>

<button class="api-copy" type="button" data-copy-code="grid: Grid;" data-pagefind-ignore>Copy</button>

```ts generated
grid: Grid;
```

</details>

<details class="api-member" id="grid-ready-event-generation" data-pagefind-weight="1" open>
<summary><code>generation</code> <span class="api-member-summary">One-based adapter generation, incremented whenever a Grid is replaced.</span></summary>

<button class="api-copy" type="button" data-copy-code="generation: number;" data-pagefind-ignore>Copy</button>

```ts generated
generation: number;
```

</details>

<details class="api-member" id="grid-ready-event-reason" data-pagefind-weight="1" open>
<summary><code>reason</code> <span class="api-member-summary">Whether readiness followed first initialization, an input reset, or a renderer reset.</span></summary>

<button class="api-copy" type="button" data-copy-code="reason: GridReadyReason;" data-pagefind-ignore>Copy</button>

```ts generated
reason: GridReadyReason;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridReadyEvent {&#10;  grid: Grid;&#10;  generation: number;&#10;  reason: GridReadyReason;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridReadyEvent {
  grid: Grid;
  generation: number;
  reason: GridReadyReason;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>GridReadyEvent</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/grid-adapter-event-handlers/"><code>GridAdapterEventHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-emits/"><code>SheetwriteGridEmits</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
