---
title: "RowBridgeReconciliationInput | @sheetwrite/core"
description: "Input to RowBridge.reconcile."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeReconciliationInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Input to [`RowBridge.reconcile`](/docs/api/core/row-bridge/#row-bridge-reconcile).

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L176</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#row-bridge-reconciliation-input-status"><code>status</code></a>
<a href="#row-bridge-reconciliation-input-transaction-id"><code>transactionId</code></a>
<a href="#row-bridge-reconciliation-input-source"><code>source</code></a>
<a href="#row-bridge-reconciliation-input-version"><code>version</code></a>
<a href="#row-bridge-reconciliation-input-operations"><code>operations</code></a>
<a href="#row-bridge-reconciliation-input-requested-operations"><code>requestedOperations</code></a>
<a href="#row-bridge-reconciliation-input-event"><code>event</code></a>
<a href="#row-bridge-reconciliation-input-commit-reason"><code>commitReason</code></a>
<a href="#row-bridge-reconciliation-input-type"><code>_type</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-reconciliation-input-status" data-pagefind-weight="1" open>
<summary><code>status</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly status: RowBridgeReconciliationStatus;" data-pagefind-ignore>Copy</button>

```ts generated
readonly status: RowBridgeReconciliationStatus;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-transaction-id" data-pagefind-weight="1" open>
<summary><code>transactionId</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly transactionId?: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly transactionId?: string;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-source" data-pagefind-weight="1" open>
<summary><code>source</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly source?: OperationSource;" data-pagefind-ignore>Copy</button>

```ts generated
readonly source?: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-version" data-pagefind-weight="1" open>
<summary><code>version</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly version?: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly version?: number;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-operations" data-pagefind-weight="1" open>
<summary><code>operations</code> <span class="api-member-summary">Canonical operations applied by the document engine.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly operations?: readonly DocumentOp[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly operations?: readonly DocumentOp[];
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-requested-operations" data-pagefind-weight="1" open>
<summary><code>requestedOperations</code> <span class="api-member-summary">Original host operations, used to identify a transformed acceptance.</span></summary>

<button class="api-copy" type="button" data-copy-code="readonly requestedOperations?: readonly DocumentOp[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly requestedOperations?: readonly DocumentOp[];
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-event" data-pagefind-weight="1" open>
<summary><code>event</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly event?: ChangeEvent;" data-pagefind-ignore>Copy</button>

```ts generated
readonly event?: ChangeEvent;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-commit-reason" data-pagefind-weight="1" open>
<summary><code>commitReason</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly commitReason?: CommitReason;" data-pagefind-ignore>Copy</button>

```ts generated
readonly commitReason?: CommitReason;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-type" data-pagefind-weight="1" open>
<summary><code>_type</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly _type?: Id;" data-pagefind-ignore>Copy</button>

```ts generated
readonly _type?: Id;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RowBridgeReconciliationInput&lt;&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; {&#10;  readonly status: RowBridgeReconciliationStatus;&#10;  readonly transactionId?: string;&#10;  readonly source?: OperationSource;&#10;  readonly version?: number;&#10;  readonly operations?: readonly DocumentOp[];&#10;  readonly requestedOperations?: readonly DocumentOp[];&#10;  readonly event?: ChangeEvent;&#10;  readonly commitReason?: CommitReason;&#10;  readonly _type?: Id;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgeReconciliationInput<
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly status: RowBridgeReconciliationStatus;
  readonly transactionId?: string;
  readonly source?: OperationSource;
  readonly version?: number;
  readonly operations?: readonly DocumentOp[];
  readonly requestedOperations?: readonly DocumentOp[];
  readonly event?: ChangeEvent;
  readonly commitReason?: CommitReason;
  readonly _type?: Id;
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeReconciliationInput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
