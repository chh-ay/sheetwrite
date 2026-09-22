---
title: "RowBridgeRowStructureDelta | @sheetwrite/core/adapter"
description: "Stable row identity effects for insert, delete, and move operations."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeRowStructureDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Stable row identity effects for insert, delete, and move operations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core/adapter</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/row-bridge.ts#L105</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#row-bridge-row-structure-delta-kind"><code>kind</code></a>
<a href="#row-bridge-row-structure-delta-action"><code>action</code></a>
<a href="#row-bridge-row-structure-delta-sheet"><code>sheet</code></a>
<a href="#row-bridge-row-structure-delta-at"><code>at</code></a>
<a href="#row-bridge-row-structure-delta-count"><code>count</code></a>
<a href="#row-bridge-row-structure-delta-from"><code>from</code></a>
<a href="#row-bridge-row-structure-delta-to"><code>to</code></a>
<a href="#row-bridge-row-structure-delta-inserted"><code>inserted</code></a>
<a href="#row-bridge-row-structure-delta-removed"><code>removed</code></a>
<a href="#row-bridge-row-structure-delta-transaction"><code>transaction</code></a>
<a href="#row-bridge-row-structure-delta-transaction-id"><code>transactionId</code></a>
<a href="#row-bridge-row-structure-delta-source"><code>source</code></a>
<a href="#row-bridge-row-structure-delta-previous"><code>previous</code></a>
<a href="#row-bridge-row-structure-delta-next"><code>next</code></a>
<a href="#row-bridge-row-structure-delta-operation"><code>operation</code></a>
<a href="#row-bridge-row-structure-delta-row-ids"><code>rowIds</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>16</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-row-structure-delta-kind" data-pagefind-weight="1" open>
<summary><code>kind</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly kind: &quot;row-structure&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly kind: "row-structure";
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-action" data-pagefind-weight="1" open>
<summary><code>action</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly action: &quot;insert&quot; | &quot;delete&quot; | &quot;move&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
readonly action: "insert" | "delete" | "move";
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-sheet" data-pagefind-weight="1" open>
<summary><code>sheet</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly sheet: SheetId;" data-pagefind-ignore>Copy</button>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-at" data-pagefind-weight="1" open>
<summary><code>at</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly at: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly at: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-count" data-pagefind-weight="1" open>
<summary><code>count</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly count: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly count: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-from" data-pagefind-weight="1" open>
<summary><code>from</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly from?: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly from?: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-to" data-pagefind-weight="1" open>
<summary><code>to</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly to?: number;" data-pagefind-ignore>Copy</button>

```ts generated
readonly to?: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-inserted" data-pagefind-weight="1" open>
<summary><code>inserted</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly inserted: readonly (Id | null)[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly inserted: readonly (Id | null)[];
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-removed" data-pagefind-weight="1" open>
<summary><code>removed</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly removed: readonly (Id | null)[];" data-pagefind-ignore>Copy</button>

```ts generated
readonly removed: readonly (Id | null)[];
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-transaction" data-pagefind-weight="1" open>
<summary><code>transaction</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly transaction: RowBridgeTransaction;" data-pagefind-ignore>Copy</button>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-transaction-id" data-pagefind-weight="1" open>
<summary><code>transactionId</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly transactionId: string;" data-pagefind-ignore>Copy</button>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-source" data-pagefind-weight="1" open>
<summary><code>source</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly source: OperationSource;" data-pagefind-ignore>Copy</button>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-previous" data-pagefind-weight="1" open>
<summary><code>previous</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly previous: unknown;" data-pagefind-ignore>Copy</button>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-next" data-pagefind-weight="1" open>
<summary><code>next</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly next: unknown;" data-pagefind-ignore>Copy</button>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-operation" data-pagefind-weight="1" open>
<summary><code>operation</code></summary>

<button class="api-copy" type="button" data-copy-code="readonly operation: DocumentOp;" data-pagefind-ignore>Copy</button>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-row-ids" data-pagefind-weight="1" open>
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

<button class="api-copy" type="button" data-copy-code="export interface RowBridgeRowStructureDelta&lt;&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; {&#10;  readonly kind: &quot;row-structure&quot;;&#10;  readonly action: &quot;insert&quot; | &quot;delete&quot; | &quot;move&quot;;&#10;  readonly sheet: SheetId;&#10;  readonly at: number;&#10;  readonly count: number;&#10;  readonly from?: number;&#10;  readonly to?: number;&#10;  readonly inserted: readonly (Id | null)[];&#10;  readonly removed: readonly (Id | null)[];&#10;  readonly transaction: RowBridgeTransaction;&#10;  readonly transactionId: string;&#10;  readonly source: OperationSource;&#10;  readonly previous: unknown;&#10;  readonly next: unknown;&#10;  readonly operation: DocumentOp;&#10;  readonly rowIds: readonly (Id | null)[];&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface RowBridgeRowStructureDelta<
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly kind: "row-structure";
  readonly action: "insert" | "delete" | "move";
  readonly sheet: SheetId;
  readonly at: number;
  readonly count: number;
  readonly from?: number;
  readonly to?: number;
  readonly inserted: readonly (Id | null)[];
  readonly removed: readonly (Id | null)[];
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeRowStructureDelta</code></p>

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
