---
title: "TransactionResourceLimits | @sheetwrite/core"
description: "Public ceilings shared by transaction producers, persistence, transport, and replay."
---
<!-- api-export:@sheetwrite/core|.|TransactionResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Public ceilings shared by transaction producers, persistence, transport,
and replay. Limits measure the submitted operation array itself, not the
logical cell area covered by compact operations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L13</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="transaction-resource-limits-max-operations" data-pagefind-weight="1" open>
<summary><code>maxOperations</code> <span class="api-member-summary">DocumentOp objects in one atomic transaction; defaults to 10,000.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxOperations: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxOperations: number;
```

</details>

<details class="api-member" id="transaction-resource-limits-max-encoded-bytes" data-pagefind-weight="1" open>
<summary><code>maxEncodedBytes</code> <span class="api-member-summary">UTF-8 bytes in the JSON-encoded DocumentOp array; defaults to 8 MiB.</span></summary>

<button class="api-copy" type="button" data-copy-code="maxEncodedBytes: number;" data-pagefind-ignore>Copy</button>

```ts generated
maxEncodedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface TransactionResourceLimits {&#10;  maxOperations: number;&#10;  maxEncodedBytes: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface TransactionResourceLimits {
  maxOperations: number;
  maxEncodedBytes: number;
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

<p class="api-consumers-label">Public exports naming <code>TransactionResourceLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/default-transaction-resource-limits/"><code>DEFAULT_TRANSACTION_RESOURCE_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/resolve-transaction-resource-limits/"><code>resolveTransactionResourceLimits</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store-options/"><code>SheetwriteStoreOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/validate-transaction-resources/"><code>validateTransactionResources</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
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
