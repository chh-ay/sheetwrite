---
title: "Theme | @sheetwrite/core"
description: "Resolved canvas colors, typography, and geometry used for painting."
---
<!-- api-export:@sheetwrite/core|.|Theme -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resolved canvas colors, typography, and geometry used for painting.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/render.ts#L8"><code>packages/core/src/types/render.ts#L8</code></a></dd></div>
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

<details class="api-member" id="theme-font" data-pagefind-weight="1">
<summary><code>font</code> <span class="api-member-summary">Canvas font shorthand used for unstyled cells.</span></summary>

```ts generated
font: string;
```

</details>

<details class="api-member" id="theme-bg" data-pagefind-weight="1">
<summary><code>bg</code> <span class="api-member-summary">CSS color painted behind body cells.</span></summary>

```ts generated
bg: string;
```

</details>

<details class="api-member" id="theme-fg" data-pagefind-weight="1">
<summary><code>fg</code> <span class="api-member-summary">CSS color used for unstyled cell text.</span></summary>

```ts generated
fg: string;
```

</details>

<details class="api-member" id="theme-grid-line" data-pagefind-weight="1">
<summary><code>gridLine</code> <span class="api-member-summary">CSS color used for cell grid lines.</span></summary>

```ts generated
gridLine: string;
```

</details>

<details class="api-member" id="theme-header-bg" data-pagefind-weight="1">
<summary><code>headerBg</code> <span class="api-member-summary">CSS color painted behind column and row headers.</span></summary>

```ts generated
headerBg: string;
```

</details>

<details class="api-member" id="theme-header-fg" data-pagefind-weight="1">
<summary><code>headerFg</code> <span class="api-member-summary">CSS color used for column letters and row numbers.</span></summary>

```ts generated
headerFg: string;
```

</details>

<details class="api-member" id="theme-selection" data-pagefind-weight="1">
<summary><code>selection</code> <span class="api-member-summary">CSS color painted over the selected region.</span></summary>

```ts generated
selection: string;
```

</details>

<details class="api-member" id="theme-selection-border" data-pagefind-weight="1">
<summary><code>selectionBorder</code> <span class="api-member-summary">CSS color used for the active selection outline.</span></summary>

```ts generated
selectionBorder: string;
```

</details>

<details class="api-member" id="theme-row-height" data-pagefind-weight="1">
<summary><code>rowHeight</code> <span class="api-member-summary">Default data-row height in unzoomed CSS pixels.</span></summary>

```ts generated
rowHeight: number;
```

</details>

<details class="api-member" id="theme-header-height" data-pagefind-weight="1">
<summary><code>headerHeight</code> <span class="api-member-summary">Column-header height in unzoomed CSS pixels.</span></summary>

```ts generated
headerHeight: number;
```

</details>

<details class="api-member" id="theme-row-header-width" data-pagefind-weight="1">
<summary><code>rowHeaderWidth</code> <span class="api-member-summary">Width of the left row-number gutter (0 hides it).</span></summary>

```ts generated
rowHeaderWidth: number;
```

</details>

<details class="api-member" id="theme-search-match" data-pagefind-weight="1">
<summary><code>searchMatch</code> <span class="api-member-summary">Fill behind a search match.</span></summary>

```ts generated
searchMatch: string;
```

</details>

<details class="api-member" id="theme-search-active-match" data-pagefind-weight="1">
<summary><code>searchActiveMatch</code> <span class="api-member-summary">Fill/outline for the active (current) search match.</span></summary>

```ts generated
searchActiveMatch: string;
```

</details>

<details class="api-member" id="theme-highlight" data-pagefind-weight="1">
<summary><code>highlight</code> <span class="api-member-summary">Fill for cells highlighted via Grid.highlightCells.</span></summary>

```ts generated
highlight: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
<li><a href="/docs/api/core/grid-events/"><code>GridEvents</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/resolve-theme-from-css/"><code>resolveThemeFromCss</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller/"><code>GridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell/"><code>SpreadsheetShell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li class="api-consumer-more">and 1 more</li>
</ul>
</div>
