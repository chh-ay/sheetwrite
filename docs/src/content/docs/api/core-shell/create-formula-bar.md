---
title: "createFormulaBar | @sheetwrite/core/shell"
description: "Detached formula bar: mirrors the focused cell's editable text (exact formula source, else literal text) and commits on Enter through the grid's undoable transaction path, targeting the data address captured with the…"
---
<!-- api-export:@sheetwrite/core|./shell|createFormulaBar -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

Detached formula bar: mirrors the focused cell's editable text (exact
formula source, else literal text) and commits on Enter through the grid's
undoable transaction path, targeting the data address captured with the
draft — correct even under an active sort/filter view. A focused, dirty
draft is never overwritten by selection/change events; Escape restores the
last stable text.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/formula-controls.ts#L136"><code>packages/core/src/shell/formula-controls.ts#L136</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createFormulaBar(
  host: HTMLElement,
  grid: Grid,
  options?: FormulaBarOptions,
): FormulaBarPiece
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

<p class="api-consumers-label">Public exports naming <code>createFormulaBar</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
