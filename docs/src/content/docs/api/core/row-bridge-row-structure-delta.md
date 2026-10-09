---
title: "RowBridgeRowStructureDelta | @sheetwrite/core"
description: "Stable row identity effects for insert, delete, and move operations."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeRowStructureDelta -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Stable row identity effects for insert, delete, and move operations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/row-bridge.ts#L106"><code>packages/core/src/row-bridge.ts#L106</code></a></dd></div>
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

<details class="api-member" id="row-bridge-row-structure-delta-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: "row-structure";
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-action" data-pagefind-weight="1">
<summary><code>action</code></summary>

```ts generated
readonly action: "insert" | "delete" | "move";
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-at" data-pagefind-weight="1">
<summary><code>at</code></summary>

```ts generated
readonly at: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-count" data-pagefind-weight="1">
<summary><code>count</code></summary>

```ts generated
readonly count: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from?: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to?: number;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-inserted" data-pagefind-weight="1">
<summary><code>inserted</code></summary>

```ts generated
readonly inserted: readonly (Id | null)[];
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-removed" data-pagefind-weight="1">
<summary><code>removed</code></summary>

```ts generated
readonly removed: readonly (Id | null)[];
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-transaction" data-pagefind-weight="1">
<summary><code>transaction</code></summary>

```ts generated
readonly transaction: RowBridgeTransaction;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-transaction-id" data-pagefind-weight="1">
<summary><code>transactionId</code></summary>

```ts generated
readonly transactionId: string;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: OperationSource;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: unknown;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: unknown;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: DocumentOp;
```

</details>

<details class="api-member" id="row-bridge-row-structure-delta-row-ids" data-pagefind-weight="1">
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
