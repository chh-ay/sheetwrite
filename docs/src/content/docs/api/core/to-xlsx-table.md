---
title: "toXlsxTable | @sheetwrite/core"
description: "Exports a table model through the registered optional XLSX backend."
---
<!-- api-export:@sheetwrite/core|.|toXlsxTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Exports a table model through the registered optional XLSX backend.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L324"><code>packages/core/src/export.ts#L324</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function toXlsxTable(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): Promise<Uint8Array>
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

<p class="api-consumers-label">Public exports naming <code>toXlsxTable</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-table-export-backend/"><code>XlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
