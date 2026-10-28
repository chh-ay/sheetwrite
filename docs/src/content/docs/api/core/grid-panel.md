---
title: "GridPanel | @sheetwrite/core"
description: "One side panel that Grid.openPanel shows on the grid's right edge."
---
<!-- api-export:@sheetwrite/core|.|GridPanel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One side panel that `Grid.openPanel` shows on the grid's right edge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L67"><code>packages/core/src/types/grid.ts#L67</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="grid-panel-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Text in the panel header; it also names the panel for assistive technology.</span></summary>

```ts generated
title: string;
```

</details>

<details class="api-member" id="grid-panel-render" data-pagefind-weight="1">
<summary><code>render</code> <span class="api-member-summary">Fill body, then return a function that releases what render set up.</span></summary>

```ts generated
render(body: HTMLElement): () => void;
```

</details>

<details class="api-member" id="grid-panel-focus" data-pagefind-weight="1">
<summary><code>focus</code> <span class="api-member-summary">Move keyboard focus into the panel when it opens.</span></summary>

```ts generated
focus?: boolean;
```

<p class="api-member-doc">Move keyboard focus into the panel when it opens. Default `true`. Use
`false` for a panel that opens on cell selection, so arrow keys keep moving
the cell cursor.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridPanel {
  title: string;
  render(body: HTMLElement): () => void;
  focus?: boolean;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>GridPanel</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
