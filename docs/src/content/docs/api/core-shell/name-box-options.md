---
title: "NameBoxOptions | @sheetwrite/core/shell"
description: "Host elements and callbacks used to bind a name box to a Grid."
---
<!-- api-export:@sheetwrite/core|./shell|NameBoxOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Host elements and callbacks used to bind a name box to a Grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/formula-controls.ts#L19"><code>packages/core/src/shell/formula-controls.ts#L19</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="name-box-options-focus-grid" data-pagefind-weight="1">
<summary><code>focusGrid</code> <span class="api-member-summary">Called after a successful Enter navigation so the grid regains focus.</span></summary>

```ts generated
focusGrid?: () => void;
```

</details>

<details class="api-member" id="name-box-options-label" data-pagefind-weight="1">
<summary><code>label</code> <span class="api-member-summary">Accessible label (default &quot;Cell reference&quot;).</span></summary>

```ts generated
label?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface NameBoxOptions {
  focusGrid?: () => void;
  label?: string;
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

<p class="api-consumers-label">Public exports naming <code>NameBoxOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-shell/create-name-box/"><code>createNameBox</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
