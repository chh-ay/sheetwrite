---
title: "fromXlsxTable | @sheetwrite/core"
description: "Parse the first sheet of .xlsx bytes into ColumnarData."
---
<!-- api-export:@sheetwrite/core|.|fromXlsxTable -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse the first sheet of `.xlsx` bytes into `ColumnarData`. The first parsed
row is treated as the header and its cell text becomes each column's key.
Numbers stay numbers, date cells use the date-serial convention, strings are
verbatim, and empty cells become `null`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L369"><code>packages/core/src/export.ts#L369</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function fromXlsxTable(
  data: ArrayBuffer | Uint8Array,
  options?: XlsxWorkbookOptions,
): Promise<ColumnarData>
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

<p class="api-consumers-label">Public exports naming <code>fromXlsxTable</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-table-import-backend/"><code>XlsxTableImportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
