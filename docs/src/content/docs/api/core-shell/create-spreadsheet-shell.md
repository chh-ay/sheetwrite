---
title: "createSpreadsheetShell | @sheetwrite/core/shell"
description: "Mount a complete spreadsheet shell into host: toolbar row, formula row (name box + formula bar), the grid, and a bottom row with sheet tabs and a selection status."
---
<!-- api-export:@sheetwrite/core|./shell|createSpreadsheetShell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="function">function</span></div>

Mount a complete spreadsheet shell into `host`: toolbar row, formula row
(name box + formula bar), the grid, and a bottom row with sheet tabs and a
selection status. The host must have a real size; the shell fills it. Returns
the shell handle; `destroy` tears down every piece, the grid, and the shell
DOM, and is safe to call twice.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/spreadsheet-shell.ts#L60"><code>packages/core/src/shell/spreadsheet-shell.ts#L60</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function createSpreadsheetShell(
  host: HTMLElement,
  options: SpreadsheetShellOptions,
): SpreadsheetShell
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

<p class="api-consumers-label">Public exports naming <code>createSpreadsheetShell</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
