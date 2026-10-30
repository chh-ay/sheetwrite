---
title: "createGrid | @sheetwrite/core"
description: "Creates and mounts an imperative Grid in the supplied host element."
---
<!-- api-export:@sheetwrite/core|.|createGrid -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Creates and mounts an imperative Grid in the supplied host element.

### Examples

```ts compile
import { createGrid, initSheetwrite } from "@sheetwrite/core";

await initSheetwrite();
const host = document.createElement("div");
host.style.height = "400px";
document.body.append(host);
const grid = createGrid(host, {
  workbook: {
    activeSheet: "sales",
    sheets: [{ id: "sales", name: "Sales", rowCount: 2,
      columns: [{ key: "amount", header: "Amount", type: "number", width: 120 }] }],
  },
  data: { rowCount: 2, columns: { amount: [12, 18] } },
});
grid.scrollToCell({ sheet: "sales", row: 1, col: 0 });
// Call when the host view is removed.
grid.destroy();
```

### See also

- [Grid](/docs/api/core/grid/)
- [GridOptions](/docs/api/core/grid-options/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/grid.ts#L421"><code>packages/core/src/grid.ts#L421</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createGrid(host: HTMLElement, opts: GridOptions): Grid
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>createGrid</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
