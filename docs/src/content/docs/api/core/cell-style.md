---
title: "CellStyle | @sheetwrite/core"
description: "Serializable formatting applied to a cell or used as a column default."
---
<!-- api-export:@sheetwrite/core|.|CellStyle -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable formatting applied to a cell or used as a column default.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/cell.ts#L27"><code>packages/core/src/types/cell.ts#L27</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#cell-style-bold"><code>bold</code></a>
<a href="#cell-style-italic"><code>italic</code></a>
<a href="#cell-style-underline"><code>underline</code></a>
<a href="#cell-style-strikethrough"><code>strikethrough</code></a>
<a href="#cell-style-font-size"><code>fontSize</code></a>
<a href="#cell-style-color"><code>color</code></a>
<a href="#cell-style-background-color"><code>backgroundColor</code></a>
<a href="#cell-style-align"><code>align</code></a>
<a href="#cell-style-wrap"><code>wrap</code></a>
<a href="#cell-style-border"><code>border</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>10</span>

<div class="api-member-list">

<details class="api-member" id="cell-style-bold" data-pagefind-weight="1">
<summary><code>bold</code> <span class="api-member-summary">Uses the bold variant of the theme font.</span></summary>

```ts generated
bold?: boolean;
```

</details>

<details class="api-member" id="cell-style-italic" data-pagefind-weight="1">
<summary><code>italic</code> <span class="api-member-summary">Uses the italic variant of the theme font.</span></summary>

```ts generated
italic?: boolean;
```

</details>

<details class="api-member" id="cell-style-underline" data-pagefind-weight="1">
<summary><code>underline</code> <span class="api-member-summary">Draws a line beneath each rendered text run.</span></summary>

```ts generated
underline?: boolean;
```

</details>

<details class="api-member" id="cell-style-strikethrough" data-pagefind-weight="1">
<summary><code>strikethrough</code> <span class="api-member-summary">Draws a line through each rendered text run.</span></summary>

```ts generated
strikethrough?: boolean;
```

</details>

<details class="api-member" id="cell-style-font-size" data-pagefind-weight="1">
<summary><code>fontSize</code> <span class="api-member-summary">Font size in unzoomed CSS pixels; zoom is applied during painting.</span></summary>

```ts generated
fontSize?: number;
```

</details>

<details class="api-member" id="cell-style-color" data-pagefind-weight="1">
<summary><code>color</code> <span class="api-member-summary">hex color, e.g. &quot;#111111&quot;</span></summary>

```ts generated
color?: string;
```

</details>

<details class="api-member" id="cell-style-background-color" data-pagefind-weight="1">
<summary><code>backgroundColor</code> <span class="api-member-summary">hex color, e.g. &quot;#ffffff&quot;</span></summary>

```ts generated
backgroundColor?: string;
```

</details>

<details class="api-member" id="cell-style-align" data-pagefind-weight="1">
<summary><code>align</code> <span class="api-member-summary">Horizontal placement of cell text within its column.</span></summary>

```ts generated
align?: CellAlign;
```

</details>

<details class="api-member" id="cell-style-wrap" data-pagefind-weight="1">
<summary><code>wrap</code> <span class="api-member-summary">Wraps text within the cell width; row auto-fit accounts for the resulting line count.</span></summary>

```ts generated
wrap?: boolean;
```

</details>

<details class="api-member" id="cell-style-border" data-pagefind-weight="1">
<summary><code>border</code> <span class="api-member-summary">Border overrides for the cell's individual sides.</span></summary>

```ts generated
border?: CellBorders;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  align?: CellAlign;
  wrap?: boolean;
  border?: CellBorders;
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

<p class="api-consumers-label">Public exports naming <code>CellStyle</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-change/"><code>CellChange</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/cell-hyperlink/"><code>CellHyperlink</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/cell-paint-context/"><code>CellPaintContext</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/column/"><code>Column</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/conditional-format-rule/"><code>ConditionalFormatRule</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/data-cell/"><code>DataCell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/packed-cell-block/"><code>PackedCellBlock</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/resolved-cell/"><code>ResolvedCell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sanitize-hyperlink-style/"><code>sanitizeHyperlinkStyle</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-cell/"><code>SnapshotCell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 9 more</li>
</ul>
</div>
