---
title: "RowBridgeProjection | @sheetwrite/react"
description: "Result of projection or reconciliation."
---
<!-- api-export:@sheetwrite/react|.|RowBridgeProjection -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="interface">interface</span></div>

Result of projection or reconciliation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/row-bridge.d.ts#L130</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-projection-status" data-pagefind-weight="1" open>
<summary><code>status</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly status: RowBridgeReconciliationStatus;" data-pagefind-ignore>Copy</button>

```ts generated
readonly status: RowBridgeReconciliationStatus;
```

</details>

<details class="api-member" id="row-bridge-projection-transaction" data-pagefind-weight="1" open>
<summary><code>transaction</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly transaction: RowBridgeTransaction;" data-pagefind-ignore>Copy</button>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-projection-deltas" data-pagefind-weight="1" open>
<summary><code>deltas</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly deltas: readonly RowBridgeDelta&lt;Id&gt;[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly deltas: readonly RowBridgeDelta<Id>[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RowBridgeProjection&lt;Id extends RowBridgeId = RowBridgeId&gt; {&#10;  readonly status: RowBridgeReconciliationStatus;&#10;  readonly transaction: RowBridgeTransaction;&#10;  readonly deltas: readonly RowBridgeDelta&lt;Id&gt;[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgeProjection<Id extends RowBridgeId = RowBridgeId> {
  readonly status: RowBridgeReconciliationStatus;
  readonly transaction: RowBridgeTransaction;
  readonly deltas: readonly RowBridgeDelta<Id>[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/react</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>RowBridgeProjection</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-handler/"><code>RowBridgeHandler</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-handler/"><code>RowBridgeHandler</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/row-bridge-handler/"><code>RowBridgeHandler</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/svelte/row-bridge-handler/"><code>RowBridgeHandler</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
<li><a href="/docs/api/vue/row-bridge-handler/"><code>RowBridgeHandler</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
