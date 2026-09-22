---
title: "CellRenderer | @sheetwrite/core"
description: "Custom cell renderer hooks for the main-thread canvas or retained DOM overlay."
---
<!-- api-export:@sheetwrite/core|.|CellRenderer -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Custom cell renderer hooks for the main-thread canvas or retained DOM overlay.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/render.ts#L51</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="cell-renderer-canvas" data-pagefind-weight="1" open>
<summary><code>canvas</code></summary>

<button class="api-copy" type="button" data-copy-code="canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;" data-pagefind-ignore>Copy</button>

```ts generated
canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
```

</details>

<details class="api-member" id="cell-renderer-dom" data-pagefind-weight="1" open>
<summary><code>dom</code> <span class="api-member-summary">Creates a fresh, detached element uniquely owned by one retained DOM cell.</span></summary>

<button class="api-copy" type="button" data-copy-code="dom?(c: CellPaintContext): HTMLElement;" data-pagefind-ignore>Copy</button>

```ts generated
dom?(c: CellPaintContext): HTMLElement;
```

</details>

<details class="api-member" id="cell-renderer-update" data-pagefind-weight="1" open>
<summary><code>update</code> <span class="api-member-summary">Updates a retained element after its value, style, theme, or geometry changes.</span></summary>

<button class="api-copy" type="button" data-copy-code="update?(element: HTMLElement, c: CellPaintContext): void;" data-pagefind-ignore>Copy</button>

```ts generated
update?(element: HTMLElement, c: CellPaintContext): void;
```

</details>

<details class="api-member" id="cell-renderer-destroy" data-pagefind-weight="1" open>
<summary><code>destroy</code> <span class="api-member-summary">Runs immediately before a retained element is removed or replaced.</span></summary>

<button class="api-copy" type="button" data-copy-code="destroy?(element: HTMLElement): void;" data-pagefind-ignore>Copy</button>

```ts generated
destroy?(element: HTMLElement): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellRenderer {&#10;  canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;&#10;  dom?(c: CellPaintContext): HTMLElement;&#10;  update?(element: HTMLElement, c: CellPaintContext): void;&#10;  destroy?(element: HTMLElement): void;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellRenderer {
  canvas?(ctx: CanvasRenderingContext2D, c: CellPaintContext): void;
  dom?(c: CellPaintContext): HTMLElement;
  update?(element: HTMLElement, c: CellPaintContext): void;
  destroy?(element: HTMLElement): void;
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

<p class="api-consumers-label">Public exports naming <code>CellRenderer</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
