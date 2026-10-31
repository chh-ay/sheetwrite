---
title: "SheetwriteErrorOperation | @sheetwrite/core"
description: "SheetwriteErrorOperation type in @sheetwrite/core: Stable operation at which a consumer-visible failure can surface."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteErrorOperation -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable operation at which a consumer-visible failure can surface.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/errors.ts#L126"><code>packages/core/src/errors.ts#L126</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetwriteErrorOperation =
  | "initialize"
  | "create-grid"
  | "engine"
  | "store"
  | "transaction"
  | "render"
  | "datasource-request"
  | "renderer-worker"
  | "xlsx-import"
  | "xlsx-export"
  | "delimited-parse"
  | "delimited-import"
  | "delimited-encode"
  | "delimited-export"
  | "delimited-options"
  | "snapshot-validate"
  | "snapshot-allocate"
  | "persistence"
  | "pending-storage"
  | "synchronize"
  | "presence"
  | "revision"
  | "comment"
  | "query"
  | "row-bridge"
  | "resource-diagnostics"
  | "hyperlink-activate"
  | "keyboard-configure"
  | "chart-view"
  | "host-function";
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

<p class="api-consumers-label">Public exports naming <code>SheetwriteErrorOperation</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-error-envelope/"><code>SheetwriteErrorEnvelope</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-envelope/"><code>SheetwriteErrorEnvelope</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
