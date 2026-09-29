---
title: "formatNumber | @sheetwrite/core"
description: "Deterministic Excel-style number/date formatter."
---
<!-- api-export:@sheetwrite/core|.|formatNumber -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Deterministic Excel-style number/date formatter. Supports explicit locale
separators, percent/scientific notation, UTC date/time tokens, four-section
positive/negative/zero/text codes, quoted literals, and backslash escapes.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/number-format.ts#L460"><code>packages/core/src/number-format.ts#L460</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function formatNumber(
  value: number | string,
  code?: string,
  locale?: string,
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

<p class="api-consumers-label">Public exports naming <code>formatNumber</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
