---
title: "SHEETWRITE_ERROR_OPERATIONS | @sheetwrite/core"
description: "SHEETWRITE_ERROR_OPERATIONS variable in @sheetwrite/core: Every SheetwriteErrorOperation, for hosts that list the operations at run time."
---
<!-- api-export:@sheetwrite/core|.|SHEETWRITE_ERROR_OPERATIONS -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="variable">variable</span></div>

Every `SheetwriteErrorOperation`, for hosts that list the operations at run
time. Sheetwrite itself does not read this array.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/errors.ts#L162"><code>packages/core/src/errors.ts#L162</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const SHEETWRITE_ERROR_OPERATIONS: readonly [
  "initialize",
  "create-grid",
  "engine",
  "store",
  "transaction",
  "render",
  "datasource-request",
  "renderer-worker",
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
  "comment",
  "query",
  "row-bridge",
  "resource-diagnostics",
  "hyperlink-activate",
  "keyboard-configure",
  "chart-view",
  "host-function",
]
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

<p class="api-consumers-label">Public exports naming <code>SHEETWRITE_ERROR_OPERATIONS</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
