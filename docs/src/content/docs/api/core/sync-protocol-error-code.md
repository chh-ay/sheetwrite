---
title: "SyncProtocolErrorCode | @sheetwrite/core"
description: "Stable category identifying which synchronization protocol bound was violated."
---
<!-- api-export:@sheetwrite/core|.|SyncProtocolErrorCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Stable category identifying which synchronization protocol bound was violated.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/sync.ts#L160</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type SyncProtocolErrorCode =&#10;  | &quot;invalid-limits&quot;&#10;  | &quot;invalid-version&quot;&#10;  | &quot;invalid-id&quot;&#10;  | &quot;invalid-operations&quot;&#10;  | &quot;operation-limit&quot;&#10;  | &quot;payload-limit&quot;&#10;  | &quot;response-id-mismatch&quot;&#10;  | &quot;future-distance-limit&quot;&#10;  | &quot;buffer-count-limit&quot;&#10;  | &quot;buffer-operation-limit&quot;&#10;  | &quot;buffer-byte-limit&quot;&#10;  | &quot;pending-count-limit&quot;&#10;  | &quot;pending-operation-limit&quot;&#10;  | &quot;pending-byte-limit&quot;&#10;  | &quot;late-echo&quot;&#10;  | &quot;remote-operations-rejected&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
export type SyncProtocolErrorCode =
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
  | "remote-operations-rejected";
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

<p class="api-consumers-label">Public exports naming <code>SyncProtocolErrorCode</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-protocol-error/"><code>SyncProtocolError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
