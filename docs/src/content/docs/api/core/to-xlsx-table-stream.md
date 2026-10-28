---
title: "toXlsxTableStream | @sheetwrite/core"
description: "toXlsxTableStream function in @sheetwrite/core: Stream table XLSX bytes without materializing the finished archive."
---
<!-- api-export:@sheetwrite/core|.|toXlsxTableStream -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Stream table XLSX bytes without materializing the finished archive.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L455"><code>packages/core/src/export.ts#L455</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function toXlsxTableStream(
  workbook: Workbook,
  store: Store,
  options?: XlsxWorkbookOptions,
): ReadableStream<Uint8Array>
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

<p class="api-consumers-label">Public exports naming <code>toXlsxTableStream</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-table-export-backend/"><code>XlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
