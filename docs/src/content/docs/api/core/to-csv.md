---
title: "toCsv | @sheetwrite/core"
description: "Export the current visible CSV view (UTF-8 BOM, CRLF): visible columns and view-ordered rows surviving sort, filter, hidden-row, and group state."
---
<!-- api-export:@sheetwrite/core|.|toCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Export the current visible CSV view (UTF-8 BOM, CRLF): visible columns and
view-ordered rows surviving sort, filter, hidden-row, and group state. String
values beginning with `= + - @ \t \r` are prefixed with `'`. The synchronous
API returns one in-memory string, but fetches at most
`maxWriterWindowRows` view rows from the store per read.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L58"><code>packages/core/src/export.ts#L58</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function toCsv(
  sheet: Sheet,
  store: Store,
  options?: DelimitedTextOptions,
): string
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

<p class="api-consumers-label">Public exports naming <code>toCsv</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
