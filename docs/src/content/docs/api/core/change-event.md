---
title: "ChangeEvent | @sheetwrite/core"
description: "Payload of the change event; flows OUT for API submission/reconcile."
---
<!-- api-export:@sheetwrite/core|.|ChangeEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Payload of the `change` event; flows OUT for API submission/reconcile.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L160"><code>packages/core/src/types/transaction.ts#L160</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="change-event-transaction" data-pagefind-weight="1">
<summary><code>transaction</code> <span class="api-member-summary">Operations that actually committed after policy and bounds filtering.</span></summary>

```ts generated
transaction: Transaction;
```

</details>

<details class="api-member" id="change-event-changes" data-pagefind-weight="1">
<summary><code>changes</code> <span class="api-member-summary">Cell-level before/after effects; empty for commits that only change metadata.</span></summary>

```ts generated
changes: CellChange[];
```

</details>

<details class="api-member" id="change-event-commit-reason" data-pagefind-weight="1">
<summary><code>commitReason</code> <span class="api-member-summary">What produced this commit — see <a href="/docs/api/core/commit-reason/"><code>CommitReason</code></a>.</span></summary>

```ts generated
commitReason: CommitReason;
```

</details>

<details class="api-member" id="change-event-source" data-pagefind-weight="1">
<summary><code>source</code> <span class="api-member-summary">Remote input is observable but never belongs in outgoing local persistence.</span></summary>

```ts generated
source: OperationSource;
```

</details>

<details class="api-member" id="change-event-epoch" data-pagefind-weight="1">
<summary><code>epoch</code> <span class="api-member-summary">Store epoch after the commit; emitted store and grid changes include it.</span></summary>

```ts generated
epoch?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChangeEvent {
  transaction: Transaction;
  changes: CellChange[];
  commitReason: CommitReason;
  source: OperationSource;
  epoch?: number;
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

<p class="api-consumers-label">Public exports naming <code>ChangeEvent</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-events/"><code>GridEvents</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-reconciliation-input/"><code>RowBridgeReconciliationInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-adapter-event-handlers/"><code>GridAdapterEventHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller-handlers/"><code>GridControllerHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-reconciliation-input/"><code>RowBridgeReconciliationInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell-options/"><code>SpreadsheetShellOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li class="api-consumer-more">and 3 more</li>
</ul>
</div>
