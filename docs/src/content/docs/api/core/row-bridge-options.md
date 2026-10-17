---
title: "RowBridgeOptions | @sheetwrite/core"
description: "Options for the framework-neutral, opt-in row bridge."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Options for the framework-neutral, opt-in row bridge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/row-bridge.ts#L24"><code>packages/core/src/row-bridge.ts#L24</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-options-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
readonly columns: readonly RowBridgeColumn<Row>[];
```

</details>

<details class="api-member" id="row-bridge-options-default-rows" data-pagefind-weight="1">
<summary><code>defaultRows</code></summary>

```ts generated
readonly defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="row-bridge-options-get-row-id" data-pagefind-weight="1">
<summary><code>getRowId</code></summary>

```ts generated
readonly getRowId: (row: Row, index: number) => Id;
```

</details>

<details class="api-member" id="row-bridge-options-sheet" data-pagefind-weight="1">
<summary><code>sheet</code> <span class="api-member-summary">Sheet identity used by the simple data-first adapter.</span></summary>

```ts generated
readonly sheet?: SheetId;
```

<p class="api-member-doc">Sheet identity used by the simple data-first adapter. Defaults to `sheet1`.</p>
</details>

<details class="api-member" id="row-bridge-options-create-row-id" data-pagefind-weight="1">
<summary><code>createRowId</code> <span class="api-member-summary">Optional identity factory for rows created by an addRows operation.</span></summary>

```ts generated
readonly createRowId?: (context: RowBridgeInsertContext) => Id;
```

</details>

<details class="api-member" id="row-bridge-options-max-recent-transactions" data-pagefind-weight="1">
<summary><code>maxRecentTransactions</code> <span class="api-member-summary">Maximum entries in each recent identity window; defaults to 8,192.</span></summary>

```ts generated
readonly maxRecentTransactions?: number;
```

<p class="api-member-doc">Maximum entries in each recent identity window; defaults to 8,192. Must be a positive safe integer.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeOptions<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> {
  readonly columns: readonly RowBridgeColumn<Row>[];
  readonly defaultRows: readonly Row[];
  readonly getRowId: (row: Row, index: number) => Id;
  readonly sheet?: SheetId;
  readonly createRowId?: (context: RowBridgeInsertContext) => Id;
  readonly maxRecentTransactions?: number;
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-row-bridge/"><code>createRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-row-bridge/"><code>createRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/simple-sheetwrite-options/"><code>SimpleSheetwriteOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/row-bridge/"><code>RowBridge</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
