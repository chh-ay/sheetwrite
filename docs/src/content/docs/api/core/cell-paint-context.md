---
title: "CellPaintContext | @sheetwrite/core"
description: "Read-only cell value and screen geometry supplied to a custom renderer."
---
<!-- api-export:@sheetwrite/core|.|CellPaintContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Read-only cell value and screen geometry supplied to a custom renderer.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/render.ts#L40</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#cell-paint-context-value"><code>value</code></a>
<a href="#cell-paint-context-x"><code>x</code></a>
<a href="#cell-paint-context-y"><code>y</code></a>
<a href="#cell-paint-context-w"><code>w</code></a>
<a href="#cell-paint-context-h"><code>h</code></a>
<a href="#cell-paint-context-theme"><code>theme</code></a>
<a href="#cell-paint-context-style"><code>style</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="cell-paint-context-value" data-pagefind-weight="1" open>
<summary><code>value</code></summary>

<button class="api-copy" type="button" data-copy-code="value: CellScalar;" data-pagefind-ignore>Copy</button>

```ts generated
value: CellScalar;
```

</details>

<details class="api-member" id="cell-paint-context-x" data-pagefind-weight="1" open>
<summary><code>x</code></summary>

<button class="api-copy" type="button" data-copy-code="x: number;" data-pagefind-ignore>Copy</button>

```ts generated
x: number;
```

</details>

<details class="api-member" id="cell-paint-context-y" data-pagefind-weight="1" open>
<summary><code>y</code></summary>

<button class="api-copy" type="button" data-copy-code="y: number;" data-pagefind-ignore>Copy</button>

```ts generated
y: number;
```

</details>

<details class="api-member" id="cell-paint-context-w" data-pagefind-weight="1" open>
<summary><code>w</code></summary>

<button class="api-copy" type="button" data-copy-code="w: number;" data-pagefind-ignore>Copy</button>

```ts generated
w: number;
```

</details>

<details class="api-member" id="cell-paint-context-h" data-pagefind-weight="1" open>
<summary><code>h</code></summary>

<button class="api-copy" type="button" data-copy-code="h: number;" data-pagefind-ignore>Copy</button>

```ts generated
h: number;
```

</details>

<details class="api-member" id="cell-paint-context-theme" data-pagefind-weight="1" open>
<summary><code>theme</code></summary>

<button class="api-copy" type="button" data-copy-code="theme: Theme;" data-pagefind-ignore>Copy</button>

```ts generated
theme: Theme;
```

</details>

<details class="api-member" id="cell-paint-context-style" data-pagefind-weight="1" open>
<summary><code>style</code></summary>

<button class="api-copy" type="button" data-copy-code="style: CellStyle;" data-pagefind-ignore>Copy</button>

```ts generated
style: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellPaintContext {&#10;  value: CellScalar;&#10;  x: number;&#10;  y: number;&#10;  w: number;&#10;  h: number;&#10;  theme: Theme;&#10;  style: CellStyle;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellPaintContext {
  value: CellScalar;
  x: number;
  y: number;
  w: number;
  h: number;
  theme: Theme;
  style: CellStyle;
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

<p class="api-consumers-label">Public exports naming <code>CellPaintContext</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-renderer/"><code>CellRenderer</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
