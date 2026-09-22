---
title: "TransactionApplicationOptions | @sheetwrite/core"
description: "Source and commit classification used when applying a transaction."
---
<!-- api-export:@sheetwrite/core|.|TransactionApplicationOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Source and commit classification used when applying a transaction.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/transaction.ts#L59</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="transaction-application-options-source" data-pagefind-weight="1" open>
<summary><code>source</code> <span class="api-member-summary">Distinguishes host persistence input from local user/API output.</span></summary>

<button class="api-copy" type="button" data-copy-code="source?: OperationSource;" data-pagefind-ignore>Copy</button>

```ts generated
source?: OperationSource;
```

</details>

<details class="api-member" id="transaction-application-options-commit-reason" data-pagefind-weight="1" open>
<summary><code>commitReason</code> <span class="api-member-summary">Event classification; defaults to api.</span></summary>

<button class="api-copy" type="button" data-copy-code="commitReason?: CommitReason;" data-pagefind-ignore>Copy</button>

```ts generated
commitReason?: CommitReason;
```

</details>

<details class="api-member" id="transaction-application-options-local-replay" data-pagefind-weight="1" open>
<summary><code>localReplay</code> <span class="api-member-summary">Internal durable-queue replay: bypass remote hydration while retaining remote event semantics.</span></summary>

<button class="api-copy" type="button" data-copy-code="localReplay?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
localReplay?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface TransactionApplicationOptions {&#10;  source?: OperationSource;&#10;  commitReason?: CommitReason;&#10;  localReplay?: boolean;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface TransactionApplicationOptions {
  source?: OperationSource;
  commitReason?: CommitReason;
  localReplay?: boolean;
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

<p class="api-consumers-label">Public exports naming <code>TransactionApplicationOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
