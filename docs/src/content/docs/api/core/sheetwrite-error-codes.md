---
title: "SHEETWRITE_ERROR_CODES | @sheetwrite/core"
description: "Stable public failure codes."
---
<!-- api-export:@sheetwrite/core|.|SHEETWRITE_ERROR_CODES -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="variable">variable</span></div>

Stable public failure codes. Messages are diagnostic and are not API contracts.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/errors.ts#L2"><code>packages/core/src/errors.ts#L2</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
const SHEETWRITE_ERROR_CODES: readonly [
  "initialization-failed",
  "initialization-required",
  "datasource-request-failed",
  "renderer-fallback",
  "export-failed",
  "xlsx-import-failed",
  "optional-backend-unavailable",
  "delimited-text-resource-limit",
  "delimited-text-invalid-limit",
  "xlsx-resource-limit",
  "resource-limit",
  "invalid-snapshot",
  "aborted",
  "not-found",
  "commit-rejected",
  "unavailable",
  "blocked",
  "quota",
  "unsupported-schema",
  "transaction",
  "conflict",
  "limit",
  "invalid-limits",
  "invalid-version",
  "invalid-id",
  "invalid-operations",
  "operation-limit",
  "payload-limit",
  "response-id-mismatch",
  "future-distance-limit",
  "buffer-count-limit",
  "buffer-operation-limit",
  "buffer-byte-limit",
  "pending-count-limit",
  "pending-operation-limit",
  "pending-byte-limit",
  "late-echo",
  "remote-operations-rejected",
  "pending-capacity",
  "presence-failed",
  "revision-failed",
  "comment-failed",
  "sync-failed",
  "sync-storage-failed",
  "incomplete-data",
  "xlsx-invalid-options",
  "unsafe-hyperlink",
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

<p class="api-consumers-label">Public exports naming <code>SHEETWRITE_ERROR_CODES</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error-code/"><code>SheetwriteErrorCode</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-code/"><code>SheetwriteErrorCode</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
