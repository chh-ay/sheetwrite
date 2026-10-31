---
title: "toCsvStream | @sheetwrite/core"
description: "toCsvStream function in @sheetwrite/core: Export UTF-8 CSV on demand, retaining only one store window and one byte chunk."
---
<!-- api-export:@sheetwrite/core|.|toCsvStream -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Export UTF-8 CSV on demand, retaining only one store window and one byte chunk.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/export.ts#L103"><code>packages/core/src/export.ts#L103</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function toCsvStream(
  sheet: Sheet,
  store: Store,
  options?: DelimitedTextOptions,
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

<p class="api-consumers-label">Public exports naming <code>toCsvStream</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
