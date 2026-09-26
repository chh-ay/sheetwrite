---
title: "CellBorder | @sheetwrite/core"
description: "Visual border applied to one or more sides of a cell."
---
<!-- api-export:@sheetwrite/core|.|CellBorder -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Visual border applied to one or more sides of a cell.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/cell.ts#L10"><code>packages/core/src/types/cell.ts#L10</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="cell-border-color" data-pagefind-weight="1">
<summary><code>color</code> <span class="api-member-summary">hex color, e.g. &quot;#111111&quot;</span></summary>

```ts generated
color?: string;
```

</details>

<details class="api-member" id="cell-border-width" data-pagefind-weight="1">
<summary><code>width</code></summary>

```ts generated
width?: number;
```

</details>

<details class="api-member" id="cell-border-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: "solid" | "dashed" | "dotted";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
