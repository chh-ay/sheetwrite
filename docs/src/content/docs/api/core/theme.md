---
title: "Theme | @sheetwrite/core"
description: "Resolved canvas colors, typography, and geometry used for painting."
---
<!-- api-export:@sheetwrite/core|.|Theme -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resolved canvas colors, typography, and geometry used for painting.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/render.ts#L8</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#theme-font"><code>font</code></a>
<a href="#theme-bg"><code>bg</code></a>
<a href="#theme-fg"><code>fg</code></a>
<a href="#theme-grid-line"><code>gridLine</code></a>
<a href="#theme-header-bg"><code>headerBg</code></a>
<a href="#theme-header-fg"><code>headerFg</code></a>
<a href="#theme-selection"><code>selection</code></a>
<a href="#theme-selection-border"><code>selectionBorder</code></a>
<a href="#theme-row-height"><code>rowHeight</code></a>
<a href="#theme-header-height"><code>headerHeight</code></a>
<a href="#theme-row-header-width"><code>rowHeaderWidth</code></a>
<a href="#theme-search-match"><code>searchMatch</code></a>
<a href="#theme-search-active-match"><code>searchActiveMatch</code></a>
<a href="#theme-highlight"><code>highlight</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>14</span>

<div class="api-member-list">

<details class="api-member" id="theme-font" data-pagefind-weight="1" open>
<summary><code>font</code> <span class="api-member-summary">Canvas font shorthand used for unstyled cells.</span></summary>

<button class="api-copy" type="button" data-copy-code="font: string;" data-pagefind-ignore>Copy</button>

```ts generated
font: string;
```

</details>

<details class="api-member" id="theme-bg" data-pagefind-weight="1" open>
<summary><code>bg</code> <span class="api-member-summary">CSS color painted behind body cells.</span></summary>

<button class="api-copy" type="button" data-copy-code="bg: string;" data-pagefind-ignore>Copy</button>

```ts generated
bg: string;
```

</details>

<details class="api-member" id="theme-fg" data-pagefind-weight="1" open>
<summary><code>fg</code> <span class="api-member-summary">CSS color used for unstyled cell text.</span></summary>

<button class="api-copy" type="button" data-copy-code="fg: string;" data-pagefind-ignore>Copy</button>

```ts generated
fg: string;
```

</details>

<details class="api-member" id="theme-grid-line" data-pagefind-weight="1" open>
<summary><code>gridLine</code> <span class="api-member-summary">CSS color used for cell grid lines.</span></summary>

<button class="api-copy" type="button" data-copy-code="gridLine: string;" data-pagefind-ignore>Copy</button>

```ts generated
gridLine: string;
```

</details>

<details class="api-member" id="theme-header-bg" data-pagefind-weight="1" open>
<summary><code>headerBg</code> <span class="api-member-summary">CSS color painted behind column and row headers.</span></summary>

<button class="api-copy" type="button" data-copy-code="headerBg: string;" data-pagefind-ignore>Copy</button>

```ts generated
headerBg: string;
```

</details>

<details class="api-member" id="theme-header-fg" data-pagefind-weight="1" open>
<summary><code>headerFg</code> <span class="api-member-summary">CSS color used for column letters and row numbers.</span></summary>

<button class="api-copy" type="button" data-copy-code="headerFg: string;" data-pagefind-ignore>Copy</button>

```ts generated
headerFg: string;
```

</details>

<details class="api-member" id="theme-selection" data-pagefind-weight="1" open>
<summary><code>selection</code> <span class="api-member-summary">CSS color painted over the selected region.</span></summary>

<button class="api-copy" type="button" data-copy-code="selection: string;" data-pagefind-ignore>Copy</button>

```ts generated
selection: string;
```

</details>

<details class="api-member" id="theme-selection-border" data-pagefind-weight="1" open>
<summary><code>selectionBorder</code> <span class="api-member-summary">CSS color used for the active selection outline.</span></summary>

<button class="api-copy" type="button" data-copy-code="selectionBorder: string;" data-pagefind-ignore>Copy</button>

```ts generated
selectionBorder: string;
```

</details>

<details class="api-member" id="theme-row-height" data-pagefind-weight="1" open>
<summary><code>rowHeight</code> <span class="api-member-summary">Default data-row height in unzoomed CSS pixels.</span></summary>

<button class="api-copy" type="button" data-copy-code="rowHeight: number;" data-pagefind-ignore>Copy</button>

```ts generated
rowHeight: number;
```

</details>

<details class="api-member" id="theme-header-height" data-pagefind-weight="1" open>
<summary><code>headerHeight</code> <span class="api-member-summary">Column-header height in unzoomed CSS pixels.</span></summary>

<button class="api-copy" type="button" data-copy-code="headerHeight: number;" data-pagefind-ignore>Copy</button>

```ts generated
headerHeight: number;
```

</details>

<details class="api-member" id="theme-row-header-width" data-pagefind-weight="1" open>
<summary><code>rowHeaderWidth</code> <span class="api-member-summary">Width of the left row-number gutter (0 hides it).</span></summary>

<button class="api-copy" type="button" data-copy-code="rowHeaderWidth: number;" data-pagefind-ignore>Copy</button>

```ts generated
rowHeaderWidth: number;
```

</details>

<details class="api-member" id="theme-search-match" data-pagefind-weight="1" open>
<summary><code>searchMatch</code> <span class="api-member-summary">Fill behind a search match.</span></summary>

<button class="api-copy" type="button" data-copy-code="searchMatch: string;" data-pagefind-ignore>Copy</button>

```ts generated
searchMatch: string;
```

</details>

<details class="api-member" id="theme-search-active-match" data-pagefind-weight="1" open>
<summary><code>searchActiveMatch</code> <span class="api-member-summary">Fill/outline for the active (current) search match.</span></summary>

<button class="api-copy" type="button" data-copy-code="searchActiveMatch: string;" data-pagefind-ignore>Copy</button>

```ts generated
searchActiveMatch: string;
```

</details>

<details class="api-member" id="theme-highlight" data-pagefind-weight="1" open>
<summary><code>highlight</code> <span class="api-member-summary">Fill for cells highlighted via Grid.highlightCells.</span></summary>

<button class="api-copy" type="button" data-copy-code="highlight: string;" data-pagefind-ignore>Copy</button>

```ts generated
highlight: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface Theme {&#10;  font: string;&#10;  bg: string;&#10;  fg: string;&#10;  gridLine: string;&#10;  headerBg: string;&#10;  headerFg: string;&#10;  selection: string;&#10;  selectionBorder: string;&#10;  rowHeight: number;&#10;  headerHeight: number;&#10;  rowHeaderWidth: number;&#10;  searchMatch: string;&#10;  searchActiveMatch: string;&#10;  highlight: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface Theme {
  font: string;
  bg: string;
  fg: string;
  gridLine: string;
  headerBg: string;
  headerFg: string;
  selection: string;
  selectionBorder: string;
  rowHeight: number;
  headerHeight: number;
  rowHeaderWidth: number;
  searchMatch: string;
  searchActiveMatch: string;
  highlight: string;
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

<p class="api-consumers-label">Public exports naming <code>Theme</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-paint-context/"><code>CellPaintContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/default-theme/"><code>DEFAULT_THEME</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/resolve-theme-from-css/"><code>resolveThemeFromCss</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller/"><code>GridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell/"><code>SpreadsheetShell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
