---
title: "RowBridgeReconciliationInput | @sheetwrite/core/adapter"
description: "Input to RowBridge.reconcile."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgeReconciliationInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Input to [`RowBridge.reconcile`](/docs/api/core-adapter/row-bridge/#row-bridge-reconcile).

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/row-bridge.ts#L177"><code>packages/core/src/row-bridge.ts#L177</code></a></dd></div>
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

<details class="api-member" id="row-bridge-reconciliation-input-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
readonly status: RowBridgeReconciliationStatus;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId?: string;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source?: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-version" data-pagefind-weight="1">
<summary><code>version</code></summary>

```ts generated
readonly version?: number;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-operations" data-pagefind-weight="1">
<summary><code>operations</code> <span class="api-member-summary">Canonical operations applied by the document engine.</span></summary>

```ts generated
readonly operations?: readonly DocumentOp[];
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-requested-operations" data-pagefind-weight="1">
<summary><code>requestedOperations</code> <span class="api-member-summary">Original host operations, used to identify a transformed acceptance.</span></summary>

```ts generated
readonly requestedOperations?: readonly DocumentOp[];
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-event" data-pagefind-weight="1">
<summary><code>event</code></summary>

```ts generated
readonly event?: ChangeEvent;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code></summary>

```ts generated
readonly commitReason?: CommitReason;
```

</details>

<details class="api-member" id="row-bridge-reconciliation-input-type" data-pagefind-weight="1">
<summary><code>_type</code></summary>

```ts generated
readonly _type?: Id;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
