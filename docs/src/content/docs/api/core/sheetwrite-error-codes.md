---
title: "SHEETWRITE_ERROR_CODES | @sheetwrite/core"
description: "Stable public failure codes."
---
<!-- api-export:@sheetwrite/core|.|SHEETWRITE_ERROR_CODES -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="variable">variable</span></div>

Stable public failure codes. Messages are diagnostic and are not API contracts.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/errors.ts#L2</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="const SHEETWRITE_ERROR_CODES: readonly [&#10;  &quot;initialization-failed&quot;,&#10;  &quot;initialization-required&quot;,&#10;  &quot;datasource-request-failed&quot;,&#10;  &quot;renderer-fallback&quot;,&#10;  &quot;export-failed&quot;,&#10;  &quot;xlsx-import-failed&quot;,&#10;  &quot;optional-backend-unavailable&quot;,&#10;  &quot;delimited-text-resource-limit&quot;,&#10;  &quot;delimited-text-invalid-limit&quot;,&#10;  &quot;xlsx-resource-limit&quot;,&#10;  &quot;resource-limit&quot;,&#10;  &quot;invalid-snapshot&quot;,&#10;  &quot;aborted&quot;,&#10;  &quot;not-found&quot;,&#10;  &quot;commit-rejected&quot;,&#10;  &quot;unavailable&quot;,&#10;  &quot;blocked&quot;,&#10;  &quot;quota&quot;,&#10;  &quot;unsupported-schema&quot;,&#10;  &quot;transaction&quot;,&#10;  &quot;conflict&quot;,&#10;  &quot;limit&quot;,&#10;  &quot;invalid-limits&quot;,&#10;  &quot;invalid-version&quot;,&#10;  &quot;invalid-id&quot;,&#10;  &quot;invalid-operations&quot;,&#10;  &quot;operation-limit&quot;,&#10;  &quot;payload-limit&quot;,&#10;  &quot;response-id-mismatch&quot;,&#10;  &quot;future-distance-limit&quot;,&#10;  &quot;buffer-count-limit&quot;,&#10;  &quot;buffer-operation-limit&quot;,&#10;  &quot;buffer-byte-limit&quot;,&#10;  &quot;pending-count-limit&quot;,&#10;  &quot;pending-operation-limit&quot;,&#10;  &quot;pending-byte-limit&quot;,&#10;  &quot;late-echo&quot;,&#10;  &quot;remote-operations-rejected&quot;,&#10;  &quot;pending-capacity&quot;,&#10;  &quot;presence-failed&quot;,&#10;  &quot;revision-failed&quot;,&#10;  &quot;comment-failed&quot;,&#10;  &quot;sync-failed&quot;,&#10;  &quot;sync-storage-failed&quot;,&#10;  &quot;incomplete-data&quot;,&#10;  &quot;xlsx-invalid-options&quot;,&#10;  &quot;unsafe-hyperlink&quot;,&#10;]" data-pagefind-ignore>Copy</button>

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
