---
title: "CellEditorRect | @sheetwrite/core"
description: "Viewport-relative geometry of the cell currently owned by an editor."
---
<!-- api-export:@sheetwrite/core|.|CellEditorRect -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Viewport-relative geometry of the cell currently owned by an editor.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L66"><code>packages/core/src/types/grid.ts#L66</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-rect-x" data-pagefind-weight="1">
<summary><code>x</code></summary>

```ts generated
readonly x: number;
```

</details>

<details class="api-member" id="cell-editor-rect-y" data-pagefind-weight="1">
<summary><code>y</code></summary>

```ts generated
readonly y: number;
```

</details>

<details class="api-member" id="cell-editor-rect-width" data-pagefind-weight="1">
<summary><code>width</code></summary>

```ts generated
readonly width: number;
```

</details>

<details class="api-member" id="cell-editor-rect-height" data-pagefind-weight="1">
<summary><code>height</code></summary>

```ts generated
readonly height: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
