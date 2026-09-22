---
title: "ContextMenuContext | @sheetwrite/core"
description: "Cell and viewport coordinates resolved for one bundled context-menu opening."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Cell and viewport coordinates resolved for one bundled context-menu opening.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L242</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="context-menu-context-cell" data-pagefind-weight="1" open>
<summary><code>cell</code> <span class="api-member-summary">Right-clicked cell, or null when the pointer is outside the cell body.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly cell: CellAddress | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly cell: CellAddress | null;
```

</details>

<details class="api-member" id="context-menu-context-client-x" data-pagefind-weight="1" open>
<summary><code>clientX</code> <span class="api-member-summary">Viewport-relative browser pointer coordinate.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly clientX: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly clientX: number;
```

</details>

<details class="api-member" id="context-menu-context-client-y" data-pagefind-weight="1" open>
<summary><code>clientY</code> <span class="api-member-summary">Viewport-relative browser pointer coordinate.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly clientY: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly clientY: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface ContextMenuContext {&#10;  readonly cell: CellAddress | null;&#10;  readonly clientX: number;&#10;  readonly clientY: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface ContextMenuContext {
  readonly cell: CellAddress | null;
  readonly clientX: number;
  readonly clientY: number;
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

<p class="api-consumers-label">Public exports naming <code>ContextMenuContext</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/context-menu-item/"><code>ContextMenuItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/context-menu-items/"><code>ContextMenuItems</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
