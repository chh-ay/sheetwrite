---
title: "isCellFontFamily | @sheetwrite/core"
description: "Whether value is a valid cell fontFamily: 1-128 letters, digits, spaces, ., or -, starting with a letter or digit and not ending in a space."
---
<!-- api-export:@sheetwrite/core|.|isCellFontFamily -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Whether `value` is a valid cell `fontFamily`: 1-128 letters, digits,
spaces, `.`, `_` or `-`, starting with a letter or digit and not ending in a
space. The same rule guards snapshots, hyperlinks, clipboard and XLSX import.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/cell-style-fields.ts#L19"><code>packages/core/src/cell-style-fields.ts#L19</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function isCellFontFamily(value: string): boolean
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

<p class="api-consumers-label">Public exports naming <code>isCellFontFamily</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
