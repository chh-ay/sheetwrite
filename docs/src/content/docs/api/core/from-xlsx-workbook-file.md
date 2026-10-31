---
title: "fromXlsxWorkbookFile | @sheetwrite/core"
description: "fromXlsxWorkbookFile function in @sheetwrite/core: Import a seekable File/Blob without first buffering the compressed workbook."
---
<!-- api-export:@sheetwrite/core|.|fromXlsxWorkbookFile -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Import a seekable File/Blob without first buffering the compressed workbook.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/export.ts#L732"><code>packages/core/src/export.ts#L732</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function fromXlsxWorkbookFile(
  file: Blob,
  options?: XlsxWorkbookOptions,
): Promise<WorkbookSnapshot>
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

<p class="api-consumers-label">Public exports naming <code>fromXlsxWorkbookFile</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-workbook-backend/"><code>XlsxWorkbookBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
