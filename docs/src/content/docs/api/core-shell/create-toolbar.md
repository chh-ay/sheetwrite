---
title: "createToolbar | @sheetwrite/core/shell"
description: "Mount a toolbar bound to grid.actions (custom items receive the grid)."
---
<!-- api-export:@sheetwrite/core|./shell|createToolbar -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

Mount a toolbar bound to `grid.actions` (custom items receive the grid).
Mouse clicks never steal grid focus; keyboard users get local
Left/Right/Home/End movement across the controls while the toolbar has
focus. Returns the mounted piece with an idempotent `destroy`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/toolbar-factory.ts#L27"><code>packages/core/src/shell/toolbar-factory.ts#L27</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createToolbar(
  host: HTMLElement,
  grid: Grid,
  options?: ToolbarOptions,
): ShellPiece
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>createToolbar</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
