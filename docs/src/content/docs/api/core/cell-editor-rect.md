---
title: "CellEditorRect | @sheetwrite/core"
description: "Viewport-relative geometry of the cell currently owned by an editor."
---
<!-- api-export:@sheetwrite/core|.|CellEditorRect -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Viewport-relative geometry of the cell currently owned by an editor.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L66</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-rect-x" data-pagefind-weight="1" open>
<summary><code>x</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly x: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly x: number;
```

</details>

<details class="api-member" id="cell-editor-rect-y" data-pagefind-weight="1" open>
<summary><code>y</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly y: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly y: number;
```

</details>

<details class="api-member" id="cell-editor-rect-width" data-pagefind-weight="1" open>
<summary><code>width</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly width: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly width: number;
```

</details>

<details class="api-member" id="cell-editor-rect-height" data-pagefind-weight="1" open>
<summary><code>height</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly height: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly height: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellEditorRect {&#10;  readonly x: number;&#10;  readonly y: number;&#10;  readonly width: number;&#10;  readonly height: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellEditorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
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

<p class="api-consumers-label">Public exports naming <code>CellEditorRect</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/cell-editor-instance/"><code>CellEditorInstance</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
