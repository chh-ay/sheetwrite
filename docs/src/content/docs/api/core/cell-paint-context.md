---
title: "CellPaintContext | @sheetwrite/core"
description: "Read-only cell value and screen geometry supplied to a custom renderer."
---
<!-- api-export:@sheetwrite/core|.|CellPaintContext -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Read-only cell value and screen geometry supplied to a custom renderer.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/render.ts#L40"><code>packages/core/src/types/render.ts#L40</code></a></dd></div>
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

<details class="api-member" id="cell-paint-context-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: CellScalar;
```

</details>

<details class="api-member" id="cell-paint-context-x" data-pagefind-weight="1">
<summary><code>x</code></summary>

```ts generated
x: number;
```

</details>

<details class="api-member" id="cell-paint-context-y" data-pagefind-weight="1">
<summary><code>y</code></summary>

```ts generated
y: number;
```

</details>

<details class="api-member" id="cell-paint-context-w" data-pagefind-weight="1">
<summary><code>w</code></summary>

```ts generated
w: number;
```

</details>

<details class="api-member" id="cell-paint-context-h" data-pagefind-weight="1">
<summary><code>h</code></summary>

```ts generated
h: number;
```

</details>

<details class="api-member" id="cell-paint-context-theme" data-pagefind-weight="1">
<summary><code>theme</code></summary>

```ts generated
theme: Theme;
```

</details>

<details class="api-member" id="cell-paint-context-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
