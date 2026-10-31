---
title: "SheetwriteErrorCode | @sheetwrite/core/adapter"
description: "SheetwriteErrorCode type in @sheetwrite/core/adapter: Stable discriminator for every consumer-visible Sheetwrite failure."
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteErrorCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="type">type</span></div>

Stable discriminator for every consumer-visible Sheetwrite failure. Messages
are diagnostic and are not API contracts. Each `SheetwriteError` subclass
narrows `code` to its own codes; this union is the sum of all of them, so a
host can `switch (error.code)`. The union costs no bytes at run time.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/errors.ts#L7"><code>packages/core/src/errors.ts#L7</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type SheetwriteErrorCode =
  | "initialization-failed"
  | "initialization-required"
  | "engine-failed"
  | "datasource-request-failed"
  | "renderer-fallback"
  | "export-failed"
  | "xlsx-import-failed"
  | "optional-backend-unavailable"
  | "delimited-text-resource-limit"
  | "delimited-text-invalid-limit"
  | "xlsx-resource-limit"
  | "resource-limit"
  | "invalid-snapshot"
  | "invalid-argument"
  | "aborted"
  | "not-found"
  | "commit-rejected"
  | "unavailable"
  | "blocked"
  | "quota"
  | "unsupported-schema"
  | "transaction"
  | "conflict"
  | "limit"
  | "invalid-limits"
  | "invalid-version"
  | "invalid-id"
  | "invalid-operations"
  | "operation-limit"
  | "payload-limit"
  | "response-id-mismatch"
  | "future-distance-limit"
  | "buffer-count-limit"
  | "buffer-operation-limit"
  | "buffer-byte-limit"
  | "pending-count-limit"
  | "pending-operation-limit"
  | "pending-byte-limit"
  | "late-echo"
  | "remote-operations-rejected"
  | "invalid-batch"
  | "batch-limit"
  | "pending-capacity"
  | "presence-failed"
  | "revision-failed"
  | "comment-failed"
  | "sync-failed"
  | "sync-storage-failed"
  | "incomplete-data"
  | "xlsx-invalid-options"
  | "unsafe-hyperlink"
  | "invalid-shortcut"
  | "shortcut-conflict"
  | "invalid-function";
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

<p class="api-consumers-label">Public exports naming <code>SheetwriteErrorCode</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-error-envelope/"><code>SheetwriteErrorEnvelope</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error/"><code>SheetwriteError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/sheetwrite-error-envelope/"><code>SheetwriteErrorEnvelope</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
