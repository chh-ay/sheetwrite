---
title: "createGridController | @sheetwrite/core/adapter"
description: "Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters (and any plain host) share a single, drift-free implementation instead of each re-deriving the same create → subscribe → teardown behavior."
---
<!-- api-export:@sheetwrite/core|./adapter|createGridController -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="function">function</span></div>

Create a grid and wire its lifecycle once, so the React/Vue/Svelte adapters
(and any plain host) share a single, drift-free implementation instead of
each re-deriving the same create → subscribe → teardown behavior.

`initSheetwrite()` MUST already have been awaited; [`createGrid`](/docs/api/core/create-grid/) throws
otherwise.

### Live handlers
`handlers` is held **by reference**, not copied. Every event reads the
object's *current* fields (`handlers.onGridChange?.(…)`), so a host may swap
callbacks without rebuilding the grid. Framework adapters must mutate the
shared object only from their commit lifecycle; mutating it during render can
expose callbacks from work that never commits.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/grid-controller.ts#L108"><code>packages/core/src/grid-controller.ts#L108</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createGridController<Id extends RowBridgeId = RowBridgeId>(
  host: HTMLElement,
  options: GridOptions,
  handlers: GridControllerHandlers<Id>,
  rowBridge?: RowBridge<Id>,
): GridController
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

<p class="api-consumers-label">Public exports naming <code>createGridController</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
