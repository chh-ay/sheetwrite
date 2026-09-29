---
title: "Transaction | @sheetwrite/core"
description: "Low-level Store transaction."
---
<!-- api-export:@sheetwrite/core|.|Transaction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Low-level Store transaction. `epoch` provides optional optimistic
concurrency at the storage boundary.

Calling `Store.applyTransaction` bypasses Grid read-only checks and Grid
undo/redo history. Host-driven edits should use `Grid.applyTransaction`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L27"><code>packages/core/src/types/transaction.ts#L27</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="transaction-patches" data-pagefind-weight="1">
<summary><code>patches</code> <span class="api-member-summary">Ordered document operations submitted as one store commit.</span></summary>

```ts generated
patches: DocumentOp[];
```

</details>

<details class="api-member" id="transaction-epoch" data-pagefind-weight="1">
<summary><code>epoch</code> <span class="api-member-summary">Expected current store epoch; a mismatch returns a conflict without applying patches.</span></summary>

```ts generated
epoch?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Transaction {
  patches: DocumentOp[];
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

<p class="api-consumers-label">Public exports naming <code>Transaction</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/apply-transaction-result/"><code>ApplyTransactionResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/change-event/"><code>ChangeEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-transaction-id/"><code>rowBridgeTransactionId</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-transaction-id/"><code>rowBridgeTransactionId</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
