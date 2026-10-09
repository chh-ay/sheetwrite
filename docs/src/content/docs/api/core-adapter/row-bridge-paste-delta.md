---
title: "RowBridgePasteDelta | @sheetwrite/core/adapter"
description: "A paste transaction effect."
---
<!-- api-export:@sheetwrite/core|./adapter|RowBridgePasteDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

A paste transaction effect. A paste can contain multiple canonical patches.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/row-bridge.ts#L92"><code>packages/core/src/row-bridge.ts#L92</code></a></dd></div>
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

<details class="api-member" id="row-bridge-paste-delta-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: "paste";
```

</details>

<details class="api-member" id="row-bridge-paste-delta-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
readonly range: Range | null;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>

```ts generated
readonly cells: readonly RowBridgeCell<Id>[];
```

</details>

<details class="api-member" id="row-bridge-paste-delta-transaction" data-pagefind-weight="1">
<summary><code>transaction</code></summary>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-paste-delta-row-ids" data-pagefind-weight="1">
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
