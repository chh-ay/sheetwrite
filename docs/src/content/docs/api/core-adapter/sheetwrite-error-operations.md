---
title: "SHEETWRITE_ERROR_OPERATIONS | @sheetwrite/core/adapter"
description: "Stable operations at which a consumer-visible failure can surface."
---
<!-- api-export:@sheetwrite/core|./adapter|SHEETWRITE_ERROR_OPERATIONS -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="variable">variable</span></div>

Stable operations at which a consumer-visible failure can surface.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/errors.ts#L58"><code>packages/core/src/errors.ts#L58</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const SHEETWRITE_ERROR_OPERATIONS: readonly [
  "initialize",
  "create-grid",
  "datasource-request",
  "renderer-worker",
  "export-xlsx",
  "xlsx-import",
  "xlsx-export",
  "delimited-parse",
  "delimited-import",
  "delimited-encode",
  "delimited-export",
  "delimited-options",
  "snapshot-validate",
  "snapshot-allocate",
  "persistence",
  "pending-storage",
  "synchronize",
  "presence",
  "revision",
  "comments",
  "query",
  "hyperlink-activate",
]
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

<p class="api-consumers-label">Public exports naming <code>SHEETWRITE_ERROR_OPERATIONS</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error-operation/"><code>SheetwriteErrorOperation</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-operation/"><code>SheetwriteErrorOperation</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
