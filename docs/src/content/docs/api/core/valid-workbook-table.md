---
title: "validWorkbookTable | @sheetwrite/core"
description: "Validate one canonical table against sheet bounds and workbook-global identities."
---
<!-- api-export:@sheetwrite/core|.|validWorkbookTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Validate one canonical table against sheet bounds and workbook-global identities.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/workbook-table.ts#L133"><code>packages/core/src/workbook-table.ts#L133</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function validWorkbookTable(
  table: WorkbookTable,
  sheet: Sheet,
  existing: readonly WorkbookTable[],
  limits?: Readonly<WorkbookTableResourceLimits>,
): boolean
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

<p class="api-consumers-label">Public exports naming <code>validWorkbookTable</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
