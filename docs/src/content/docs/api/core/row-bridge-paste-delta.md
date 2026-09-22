---
title: "RowBridgePasteDelta | @sheetwrite/core"
description: "A paste transaction effect."
---
<!-- api-export:@sheetwrite/core|.|RowBridgePasteDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A paste transaction effect. A paste can contain multiple canonical patches.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L89</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#row-bridge-paste-delta-kind"><code>kind</code></a>
<a href="#row-bridge-paste-delta-range"><code>range</code></a>
<a href="#row-bridge-paste-delta-cells"><code>cells</code></a>
<a href="#row-bridge-paste-delta-transaction"><code>transaction</code></a>
<a href="#row-bridge-paste-delta-transaction-id"><code>transactionId</code></a>
<a href="#row-bridge-paste-delta-source"><code>source</code></a>
<a href="#row-bridge-paste-delta-previous"><code>previous</code></a>
<a href="#row-bridge-paste-delta-next"><code>next</code></a>
<a href="#row-bridge-paste-delta-operation"><code>operation</code></a>
<a href="#row-bridge-paste-delta-row-ids"><code>rowIds</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>10</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-paste-delta-kind" data-pagefind-weight="1" open>
<summary><code>kind</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly kind: &quot;paste&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly kind: "paste";
```

</details>

<details class="api-member" id="row-bridge-paste-delta-range" data-pagefind-weight="1" open>
<summary><code>range</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly range: Range | null;" data-pagefind-ignore>Copy</button>

```ts generated
readonly range: Range | null;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-cells" data-pagefind-weight="1" open>
<summary><code>cells</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly cells: readonly RowBridgeCell&lt;Id&gt;[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly cells: readonly RowBridgeCell<Id>[];
```

</details>

<details class="api-member" id="row-bridge-paste-delta-transaction" data-pagefind-weight="1" open>
<summary><code>transaction</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly transaction: RowBridgeTransaction;" data-pagefind-ignore>Copy</button>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-transaction-id" data-pagefind-weight="1" open>
<summary><code>transactionId</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly transactionId: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-source" data-pagefind-weight="1" open>
<summary><code>source</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly source: OperationSource;" data-pagefind-ignore>Copy</button>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-previous" data-pagefind-weight="1" open>
<summary><code>previous</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly previous: unknown;" data-pagefind-ignore>Copy</button>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-next" data-pagefind-weight="1" open>
<summary><code>next</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly next: unknown;" data-pagefind-ignore>Copy</button>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-operation" data-pagefind-weight="1" open>
<summary><code>operation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly operation: DocumentOp;" data-pagefind-ignore>Copy</button>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-row-ids" data-pagefind-weight="1" open>
<summary><code>rowIds</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly rowIds: readonly (Id | null)[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly rowIds: readonly (Id | null)[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface RowBridgePasteDelta&lt;Id extends RowBridgeId = RowBridgeId&gt; {&#10;  readonly kind: &quot;paste&quot;;&#10;  readonly range: Range | null;&#10;  readonly cells: readonly RowBridgeCell&lt;Id&gt;[];&#10;  readonly transaction: RowBridgeTransaction;&#10;  readonly transactionId: string;&#10;  readonly source: OperationSource;&#10;  readonly previous: unknown;&#10;  readonly next: unknown;&#10;  readonly operation: DocumentOp;&#10;  readonly rowIds: readonly (Id | null)[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgePasteDelta<Id extends RowBridgeId = RowBridgeId> {
  readonly kind: "paste";
  readonly range: Range | null;
  readonly cells: readonly RowBridgeCell<Id>[];
  readonly transaction: RowBridgeTransaction;
  readonly transactionId: string;
  readonly source: OperationSource;
  readonly previous: unknown;
  readonly next: unknown;
  readonly operation: DocumentOp;
  readonly rowIds: readonly (Id | null)[];
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

<p class="api-consumers-label">Public exports naming <code>RowBridgePasteDelta</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
