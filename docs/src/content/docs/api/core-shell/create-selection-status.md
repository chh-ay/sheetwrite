---
title: "createSelectionStatus | @sheetwrite/core/shell"
description: "<output role=\"status\"> that follows the grid's selection."
---
<!-- api-export:@sheetwrite/core|./shell|createSelectionStatus -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

`<output role="status">` that follows the grid's selection. Text nodes only;
polite live region so screen readers announce changes without interrupting.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/selection-status.ts#L31"><code>packages/core/src/shell/selection-status.ts#L31</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createSelectionStatus(
  host: HTMLElement,
  grid: Grid,
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

<p class="api-consumers-label">Public exports naming <code>createSelectionStatus</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
