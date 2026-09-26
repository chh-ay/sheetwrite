---
title: "createNameBox | @sheetwrite/core/shell"
description: "A1 jump box: shows the focused cell's reference and navigates on Enter."
---
<!-- api-export:@sheetwrite/core|./shell|createNameBox -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

A1 jump box: shows the focused cell's reference and navigates on Enter.
Invalid or out-of-bounds references set `aria-invalid` and make no grid
calls; Escape restores the displayed reference.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/formula-controls.ts#L31"><code>packages/core/src/shell/formula-controls.ts#L31</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createNameBox(
  host: HTMLElement,
  grid: Grid,
  options?: NameBoxOptions,
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

<p class="api-consumers-label">Public exports naming <code>createNameBox</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
