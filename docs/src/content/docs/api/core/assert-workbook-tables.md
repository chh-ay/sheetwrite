---
title: "assertWorkbookTables | @sheetwrite/core"
description: "Reject an invalid or oversized live workbook before table arrays are copied to WASM."
---
<!-- api-export:@sheetwrite/core|.|assertWorkbookTables -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Reject an invalid or oversized live workbook before table arrays are copied to WASM.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/workbook-table.ts#L201"><code>packages/core/src/workbook-table.ts#L201</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function assertWorkbookTables(
  sheets: readonly Sheet[],
  limits?: Readonly<WorkbookTableResourceLimits>,
  reservedNames?: readonly string[],
): void
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

<p class="api-consumers-label">Public exports naming <code>assertWorkbookTables</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
