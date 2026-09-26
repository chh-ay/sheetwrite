---
title: "parseCsv | @sheetwrite/core"
description: "Parse the fixed comma dialect: quoted delimiters/newlines, doubled quotes, bare CR, LF, or CRLF records, Unicode, trailing empty fields, and one optional leading UTF-8 BOM."
---
<!-- api-export:@sheetwrite/core|.|parseCsv -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Parse the fixed comma dialect: quoted delimiters/newlines, doubled quotes,
bare CR, LF, or CRLF records, Unicode, trailing empty fields, and one optional
leading UTF-8 BOM. The synchronous API consumes an existing in-memory string
and returns an in-memory grid; it does not claim streaming. Scanning enforces
resource ceilings before materializing the next oversized field or record.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L139"><code>packages/core/src/export.ts#L139</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function parseCsv(
  text: string,
  options?: DelimitedTextOptions,
): string[][]
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

<p class="api-consumers-label">Public exports naming <code>parseCsv</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
