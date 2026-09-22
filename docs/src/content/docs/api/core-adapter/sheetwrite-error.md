---
title: "SheetwriteError | @sheetwrite/core/adapter"
description: "Canonical envelope for thrown and callback-delivered Sheetwrite failures."
---
<!-- api-export:@sheetwrite/core|./adapter|SheetwriteError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="class">class</span></div>

Canonical envelope for thrown and callback-delivered Sheetwrite failures.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L280</code></dd></div>
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

<button class="api-copy" type="button" data-copy-code="constructor(code: SheetwriteErrorCode, operation: SheetwriteErrorOperation, message: string, options?: SheetwriteErrorOptions);" data-pagefind-ignore>Copy</button>

```ts generated
constructor(code: SheetwriteErrorCode, operation: SheetwriteErrorOperation, message: string, options?: SheetwriteErrorOptions);
```

</details>

<details class="api-member" id="sheetwrite-error-code" data-pagefind-weight="1">
<summary><code>code</code> <span class="api-member-alias"><a href="/docs/api/core-adapter/sheetwrite-error-code/"><code>SheetwriteErrorCode</code></a></span></summary>

<button class="api-copy" type="button" data-copy-code="code: SheetwriteErrorCode;" data-pagefind-ignore>Copy</button>

```ts generated
code: SheetwriteErrorCode;
```

</details>

<details class="api-member" id="sheetwrite-error-context" data-pagefind-weight="1" open>
<summary><code>context</code></summary>

<button class="api-copy" type="button" data-copy-code="context?: Readonly&lt;Record&lt;string, SheetwriteErrorContextValue&gt;&gt; | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
context?: Readonly<Record<string, SheetwriteErrorContextValue>> | undefined;
```

</details>

<details class="api-member" id="sheetwrite-error-name" data-pagefind-weight="1" open>
<summary><code>name</code></summary>

<button class="api-copy" type="button" data-copy-code="name: string;" data-pagefind-ignore>Copy</button>

```ts generated
name: string;
```

</details>

<details class="api-member" id="sheetwrite-error-operation" data-pagefind-weight="1">
<summary><code>operation</code> <span class="api-member-alias"><a href="/docs/api/core-adapter/sheetwrite-error-operation/"><code>SheetwriteErrorOperation</code></a></span></summary>

<button class="api-copy" type="button" data-copy-code="operation: SheetwriteErrorOperation;" data-pagefind-ignore>Copy</button>

```ts generated
operation: SheetwriteErrorOperation;
```

</details>

<details class="api-member" id="sheetwrite-error-retryable" data-pagefind-weight="1" open>
<summary><code>retryable</code></summary>

<button class="api-copy" type="button" data-copy-code="retryable?: boolean | undefined;" data-pagefind-ignore>Copy</button>

```ts generated
retryable?: boolean | undefined;
```

</details>

<details class="api-member" id="sheetwrite-error-to-json" data-pagefind-weight="1" open>
<summary><code>toJSON</code></summary>

<button class="api-copy" type="button" data-copy-code="toJSON: () =&gt; SheetwriteErrorEnvelope" data-pagefind-ignore>Copy</button>

```ts generated
toJSON: () => SheetwriteErrorEnvelope
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="class SheetwriteError extends Error implements SheetwriteErrorEnvelope {&#10;  constructor(&#10;    code: SheetwriteErrorCode,&#10;    operation: SheetwriteErrorOperation,&#10;    message: string,&#10;    options?: SheetwriteErrorOptions,&#10;  );&#10;  code:&#10;    | &quot;aborted&quot;&#10;    | &quot;blocked&quot;&#10;    | &quot;buffer-byte-limit&quot;&#10;    | &quot;buffer-count-limit&quot;&#10;    | &quot;buffer-operation-limit&quot;&#10;    | &quot;comment-failed&quot;&#10;    | &quot;commit-rejected&quot;&#10;    | &quot;conflict&quot;&#10;    | &quot;datasource-request-failed&quot;&#10;    | &quot;delimited-text-invalid-limit&quot;&#10;    | &quot;delimited-text-resource-limit&quot;&#10;    | &quot;export-failed&quot;&#10;    | &quot;future-distance-limit&quot;&#10;    | &quot;incomplete-data&quot;&#10;    | &quot;initialization-failed&quot;&#10;    | &quot;initialization-required&quot;&#10;    | &quot;invalid-id&quot;&#10;    | &quot;invalid-limits&quot;&#10;    | &quot;invalid-operations&quot;&#10;    | &quot;invalid-snapshot&quot;&#10;    | &quot;invalid-version&quot;&#10;    | &quot;late-echo&quot;&#10;    | &quot;limit&quot;&#10;    | &quot;not-found&quot;&#10;    | &quot;operation-limit&quot;&#10;    | &quot;optional-backend-unavailable&quot;&#10;    | &quot;payload-limit&quot;&#10;    | &quot;pending-byte-limit&quot;&#10;    | &quot;pending-capacity&quot;&#10;    | &quot;pending-count-limit&quot;&#10;    | &quot;pending-operation-limit&quot;&#10;    | &quot;presence-failed&quot;&#10;    | &quot;quota&quot;&#10;    | &quot;remote-operations-rejected&quot;&#10;    | &quot;renderer-fallback&quot;&#10;    | &quot;resource-limit&quot;&#10;    | &quot;response-id-mismatch&quot;&#10;    | &quot;revision-failed&quot;&#10;    | &quot;sync-failed&quot;&#10;    | &quot;sync-storage-failed&quot;&#10;    | &quot;transaction&quot;&#10;    | &quot;unavailable&quot;&#10;    | &quot;unsafe-hyperlink&quot;&#10;    | &quot;unsupported-schema&quot;&#10;    | &quot;xlsx-import-failed&quot;&#10;    | &quot;xlsx-invalid-options&quot;&#10;    | &quot;xlsx-resource-limit&quot;;&#10;  context?: Readonly&lt;Record&lt;string, SheetwriteErrorContextValue&gt;&gt; | undefined;&#10;  name: string;&#10;  operation:&#10;    | &quot;comments&quot;&#10;    | &quot;create-grid&quot;&#10;    | &quot;datasource-request&quot;&#10;    | &quot;delimited-encode&quot;&#10;    | &quot;delimited-export&quot;&#10;    | &quot;delimited-import&quot;&#10;    | &quot;delimited-options&quot;&#10;    | &quot;delimited-parse&quot;&#10;    | &quot;export-xlsx&quot;&#10;    | &quot;hyperlink-activate&quot;&#10;    | &quot;initialize&quot;&#10;    | &quot;pending-storage&quot;&#10;    | &quot;persistence&quot;&#10;    | &quot;presence&quot;&#10;    | &quot;query&quot;&#10;    | &quot;renderer-worker&quot;&#10;    | &quot;revision&quot;&#10;    | &quot;snapshot-allocate&quot;&#10;    | &quot;snapshot-validate&quot;&#10;    | &quot;synchronize&quot;&#10;    | &quot;xlsx-export&quot;&#10;    | &quot;xlsx-import&quot;;&#10;  retryable?: boolean | undefined;&#10;  toJSON: () =&gt; SheetwriteErrorEnvelope;&#10;}" data-pagefind-ignore>Copy</button>

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

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
