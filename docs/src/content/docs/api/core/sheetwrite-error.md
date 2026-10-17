---
title: "SheetwriteError | @sheetwrite/core"
description: "Canonical envelope for thrown and callback-delivered Sheetwrite failures."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="class">class</span></div>

Canonical envelope for thrown and callback-delivered Sheetwrite failures.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/errors.ts#L282"><code>packages/core/src/errors.ts#L282</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-error-constructor"><code>constructor</code></a>
<a href="#sheetwrite-error-code"><code>code</code></a>
<a href="#sheetwrite-error-context"><code>context</code></a>
<a href="#sheetwrite-error-name"><code>name</code></a>
<a href="#sheetwrite-error-operation"><code>operation</code></a>
<a href="#sheetwrite-error-retryable"><code>retryable</code></a>
<a href="#sheetwrite-error-to-json"><code>toJSON</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(code: SheetwriteErrorCode, operation: SheetwriteErrorOperation, message: string, options?: SheetwriteErrorOptions);
```

</details>

<details class="api-member" id="sheetwrite-error-code" data-pagefind-weight="1">
<summary><code>code</code> <span class="api-member-alias"><a href="/docs/api/core/sheetwrite-error-code/"><code>SheetwriteErrorCode</code></a></span></summary>

```ts generated
code: SheetwriteErrorCode;
```

</details>

<details class="api-member" id="sheetwrite-error-context" data-pagefind-weight="1">
<summary><code>context</code></summary>

```ts generated
context?: Readonly<Record<string, SheetwriteErrorContextValue>> | undefined;
```

</details>

<details class="api-member" id="sheetwrite-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="sheetwrite-error-operation" data-pagefind-weight="1">
<summary><code>operation</code> <span class="api-member-alias"><a href="/docs/api/core/sheetwrite-error-operation/"><code>SheetwriteErrorOperation</code></a></span></summary>

```ts generated
operation: SheetwriteErrorOperation;
```

</details>

<details class="api-member" id="sheetwrite-error-retryable" data-pagefind-weight="1">
<summary><code>retryable</code></summary>

```ts generated
retryable?: boolean | undefined;
```

</details>

<details class="api-member" id="sheetwrite-error-to-json" data-pagefind-weight="1">
<summary><code>toJSON</code></summary>

```ts generated
toJSON: () => SheetwriteErrorEnvelope
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SheetwriteError extends Error implements SheetwriteErrorEnvelope {
  constructor(
    code: SheetwriteErrorCode,
    operation: SheetwriteErrorOperation,
    message: string,
    options?: SheetwriteErrorOptions,
  );
  code:
    | "aborted"
    | "batch-limit"
    | "blocked"
    | "buffer-byte-limit"
    | "buffer-count-limit"
    | "buffer-operation-limit"
    | "comment-failed"
    | "commit-rejected"
    | "conflict"
    | "datasource-request-failed"
    | "delimited-text-invalid-limit"
    | "delimited-text-resource-limit"
    | "export-failed"
    | "future-distance-limit"
    | "incomplete-data"
    | "initialization-failed"
    | "initialization-required"
    | "invalid-batch"
    | "invalid-id"
    | "invalid-limits"
    | "invalid-operations"
    | "invalid-snapshot"
    | "invalid-version"
    | "late-echo"
    | "limit"
    | "not-found"
    | "operation-limit"
    | "optional-backend-unavailable"
    | "payload-limit"
    | "pending-byte-limit"
    | "pending-capacity"
    | "pending-count-limit"
    | "pending-operation-limit"
    | "presence-failed"
    | "quota"
    | "remote-operations-rejected"
    | "renderer-fallback"
    | "resource-limit"
    | "response-id-mismatch"
    | "revision-failed"
    | "sync-failed"
    | "sync-storage-failed"
    | "transaction"
    | "unavailable"
    | "unsafe-hyperlink"
    | "unsupported-schema"
    | "xlsx-import-failed"
    | "xlsx-invalid-options"
    | "xlsx-resource-limit";
  context?: Readonly<Record<string, SheetwriteErrorContextValue>> | undefined;
  name: string;
  operation:
    | "comments"
    | "create-grid"
    | "datasource-request"
    | "delimited-encode"
    | "delimited-export"
    | "delimited-import"
    | "delimited-options"
    | "delimited-parse"
    | "export-xlsx"
    | "hyperlink-activate"
    | "initialize"
    | "pending-storage"
    | "persistence"
    | "presence"
    | "query"
    | "renderer-worker"
    | "revision"
    | "snapshot-allocate"
    | "snapshot-validate"
    | "synchronize"
    | "xlsx-export"
    | "xlsx-import";
  retryable?: boolean | undefined;
  toJSON: () => SheetwriteErrorEnvelope;
}
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>SheetwriteError</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-coordinator-event/"><code>CommentCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/delimited-text-options-error/"><code>DelimitedTextOptionsError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/delimited-text-resource-error/"><code>DelimitedTextResourceError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-events/"><code>GridEvents</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/incomplete-data-error/"><code>IncompleteDataError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/persistence-error/"><code>PersistenceError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/presence-coordinator-event/"><code>PresenceCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/revision-coordinator-event/"><code>RevisionCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-resource-error/"><code>SnapshotResourceError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-validation-error/"><code>SnapshotValidationError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-coordinator-event/"><code>SyncCoordinatorEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sync-pending-capacity-error/"><code>SyncPendingCapacityError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li class="api-consumer-more">and 8 more</li>
</ul>
</div>
