---
title: "IndexedDbPendingCommitStorageErrorCode | @sheetwrite/core/browser"
description: "Stable category for an IndexedDB pending-storage failure."
---
<!-- api-export:@sheetwrite/core|./browser|IndexedDbPendingCommitStorageErrorCode -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-browser/">@sheetwrite/core/browser</a><span class="api-status" data-kind="type">type</span></div>

Stable category for an IndexedDB pending-storage failure.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/browser</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/indexeddb.ts#L11</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type IndexedDbPendingCommitStorageErrorCode =&#10;  | &quot;unavailable&quot;&#10;  | &quot;blocked&quot;&#10;  | &quot;aborted&quot;&#10;  | &quot;quota&quot;&#10;  | &quot;unsupported-schema&quot;&#10;  | &quot;transaction&quot;&#10;  | &quot;conflict&quot;&#10;  | &quot;limit&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
export type IndexedDbPendingCommitStorageErrorCode =
  | "unavailable"
  | "blocked"
  | "aborted"
  | "quota"
  | "unsupported-schema"
  | "transaction"
  | "conflict"
  | "limit";
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

<p class="api-consumers-label">Public exports naming <code>IndexedDbPendingCommitStorageErrorCode</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-browser/indexed-db-pending-commit-storage-error/"><code>IndexedDbPendingCommitStorageError</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
