---
title: "load | @sheetwrite/wasm"
description: "Initialize the WASM module."
---
<!-- api-export:@sheetwrite/wasm|.|load -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="function">function</span></div>

Initialize the WASM module. Idempotent and re-entrant: concurrent
same-source callers share one in-flight init; a concurrent different-source
call rejects; a different-source call after success warns and no-ops; a
rejected init is retryable. When `source` is omitted the loader picks the
right strategy for the runtime.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/wasm</code></dd></div>
<div><dt>Source</dt><dd><code>packages/wasm/loader.d.ts#L19</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="function load(&#10;  source?: BufferSource | URL | string | Request | WebAssembly.Module,&#10;): Promise&lt;void&gt;" data-pagefind-ignore>Copy</button>

```ts generated
function load(
  source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>load</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/comment-coordinator/"><code>CommentCoordinator</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/memory-persistence-adapter/"><code>MemoryPersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/pending-commit-storage/"><code>PendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/persistence-adapter/"><code>PersistenceAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-browser/indexed-db-pending-commit-storage/"><code>IndexedDbPendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
