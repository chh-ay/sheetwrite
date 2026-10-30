---
title: "createRibbon | @sheetwrite/core/shell"
description: "Mount an Excel-style ribbon (Home, Insert, Data, View) bound to grid.actions, in normal document flow."
---
<!-- api-export:@sheetwrite/core|./shell|createRibbon -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

Mount an Excel-style ribbon (Home, Insert, Data, View) bound to
`grid.actions`, in normal document flow. Groups shrink, then collapse into
dropdowns, as the host narrows. Returns the piece with an idempotent
`destroy`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/ribbon-factory.ts#L24"><code>packages/core/src/shell/ribbon-factory.ts#L24</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createRibbon(
  host: HTMLElement,
  grid: Grid,
  options?: RibbonOptions,
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

<p class="api-consumers-label">Public exports naming <code>createRibbon</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
