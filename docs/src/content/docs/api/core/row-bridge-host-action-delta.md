---
title: "RowBridgeHostActionDelta | @sheetwrite/core"
description: "A document operation that needs a host-side action rather than row mutation."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeHostActionDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A document operation that needs a host-side action rather than row mutation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/row-bridge.ts#L139"><code>packages/core/src/row-bridge.ts#L139</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#row-bridge-host-action-delta-kind"><code>kind</code></a>
<a href="#row-bridge-host-action-delta-action"><code>action</code></a>
<a href="#row-bridge-host-action-delta-transaction"><code>transaction</code></a>
<a href="#row-bridge-host-action-delta-transaction-id"><code>transactionId</code></a>
<a href="#row-bridge-host-action-delta-source"><code>source</code></a>
<a href="#row-bridge-host-action-delta-previous"><code>previous</code></a>
<a href="#row-bridge-host-action-delta-next"><code>next</code></a>
<a href="#row-bridge-host-action-delta-operation"><code>operation</code></a>
<a href="#row-bridge-host-action-delta-row-ids"><code>rowIds</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-host-action-delta-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: "host-action";
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-action" data-pagefind-weight="1">
<summary><code>action</code></summary>

```ts generated
readonly action: | "add-sheet" | "remove-sheet" | "rename-sheet" | "move-sheet" | "set-sheet-visibility";
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-transaction" data-pagefind-weight="1">
<summary><code>transaction</code></summary>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-host-action-delta-row-ids" data-pagefind-weight="1">
<summary><code>rowIds</code></summary>

```ts generated
readonly rowIds: readonly (Id | null)[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeHostActionDelta<
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly kind: "host-action";
  readonly action:
    | "add-sheet"
    | "remove-sheet"
    | "rename-sheet"
    | "move-sheet"
    | "set-sheet-visibility";
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeHostActionDelta</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/row-bridge-delta/"><code>RowBridgeDelta</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
