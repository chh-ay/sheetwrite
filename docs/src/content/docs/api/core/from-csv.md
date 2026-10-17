---
title: "fromCsv | @sheetwrite/core"
description: "Parse CSV into ColumnarData."
---
<!-- api-export:@sheetwrite/core|.|fromCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse CSV into `ColumnarData`. The first record is consumed as a positional
header. Input fields project onto declared visible columns; hidden declared
columns are initialized to `null`, matching the visible-column CSV export.
Extra fields are ignored and missing fields become `null`. The returned
columnar table is fully materialized in memory.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L151"><code>packages/core/src/export.ts#L151</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function fromCsv(
  text: string,
  columns: readonly Column[],
  options?: DelimitedTextOptions,
): ColumnarData
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

<p class="api-consumers-label">Public exports naming <code>fromCsv</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
