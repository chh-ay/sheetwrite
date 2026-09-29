---
title: "toTsv | @sheetwrite/core"
description: "Export a canonical data-space range as clipboard-compatible TSV (CRLF, no BOM)."
---
<!-- api-export:@sheetwrite/core|.|toTsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Export a canonical data-space range as clipboard-compatible TSV (CRLF, no
BOM). Reversed corners are normalized; active sort and filter views do not
remap the supplied row coordinates. Values are injection-hardened. The
synchronous API returns one in-memory string and fetches at most
`maxWriterWindowRows` canonical rows per packed store read.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L92"><code>packages/core/src/export.ts#L92</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function toTsv(
  range: Range,
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

<p class="api-consumers-label">Public exports naming <code>toTsv</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
