---
title: "CellBorder | @sheetwrite/core"
description: "Visual border applied to one or more sides of a cell."
---
<!-- api-export:@sheetwrite/core|.|CellBorder -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Visual border applied to one or more sides of a cell.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L10</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="cell-border-color" data-pagefind-weight="1" open>
<summary><code>color</code> <span class="api-member-summary">hex color, e.g. &quot;#111111&quot;</span></summary>

<button class="api-copy" type="button" data-copy-code="color?: string;" data-pagefind-ignore>Copy</button>

```ts generated
color?: string;
```

</details>

<details class="api-member" id="cell-border-width" data-pagefind-weight="1" open>
<summary><code>width</code></summary>

<button class="api-copy" type="button" data-copy-code="width?: number;" data-pagefind-ignore>Copy</button>

```ts generated
width?: number;
```

</details>

<details class="api-member" id="cell-border-style" data-pagefind-weight="1" open>
<summary><code>style</code></summary>

<button class="api-copy" type="button" data-copy-code="style?: &quot;solid&quot; | &quot;dashed&quot; | &quot;dotted&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
style?: "solid" | "dashed" | "dotted";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellBorder {&#10;  color?: string;&#10;  width?: number;&#10;  style?: &quot;solid&quot; | &quot;dashed&quot; | &quot;dotted&quot;;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellBorder {
  color?: string;
  width?: number;
  style?: "solid" | "dashed" | "dotted";
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

<p class="api-consumers-label">Public exports naming <code>CellBorder</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-borders/"><code>CellBorders</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
