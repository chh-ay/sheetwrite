---
title: "createNameBox | @sheetwrite/core/shell"
description: "createNameBox function in @sheetwrite/core/shell: A1 jump box, like Excel's name box: shows the focused cell's reference, and on Enter selects the typed cell…"
---
<!-- api-export:@sheetwrite/core|./shell|createNameBox -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

A1 jump box, like Excel's name box: shows the focused cell's reference, and
on Enter selects the typed cell (`B7`) or range (`B2:D9`); `$` markers are
accepted. Invalid or out-of-bounds references set `aria-invalid` and make
no grid calls; Escape restores the displayed reference.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/formula-controls.ts#L33"><code>packages/core/src/shell/formula-controls.ts#L33</code></a></dd></div>
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
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
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
