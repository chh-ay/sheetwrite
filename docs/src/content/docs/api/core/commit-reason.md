---
title: "CommitReason | @sheetwrite/core"
description: "The gesture/operation that produced a committed transaction."
---
<!-- api-export:@sheetwrite/core|.|CommitReason -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

The gesture/operation that produced a committed transaction. Consumers
switching on reasons MUST keep a default branch — the union grows with new
mutation features.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L207</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type CommitReason =&#10;  | &quot;edit-blur&quot;&#10;  | &quot;edit-enter&quot;&#10;  | &quot;edit-tab&quot;&#10;  | &quot;edit-programmatic&quot;&#10;  | &quot;paste&quot;&#10;  | &quot;cut&quot;&#10;  | &quot;clear&quot;&#10;  | &quot;fill&quot;&#10;  | &quot;structure&quot;&#10;  | &quot;style&quot;&#10;  | &quot;replace&quot;&#10;  | &quot;undo&quot;&#10;  | &quot;redo&quot;&#10;  | &quot;api&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
export type CommitReason =
  | "edit-blur"
  | "edit-enter"
  | "edit-tab"
  | "edit-programmatic"
  | "paste"
  | "cut"
  | "clear"
  | "fill"
  | "structure"
  | "style"
  | "replace"
  | "undo"
  | "redo"
  | "api";
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

<p class="api-consumers-label">Public exports naming <code>CommitReason</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/change-event/"><code>ChangeEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/protection-request/"><code>ProtectionRequest</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/remote-operation-options/"><code>RemoteOperationOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-reconciliation-input/"><code>RowBridgeReconciliationInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-transaction/"><code>RowBridgeTransaction</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/transaction-application-options/"><code>TransactionApplicationOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-reconciliation-input/"><code>RowBridgeReconciliationInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-transaction/"><code>RowBridgeTransaction</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
