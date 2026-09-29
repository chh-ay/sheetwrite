---
title: "SimpleSheetwriteOptions | @sheetwrite/core/adapter"
description: "Framework-neutral simple columns, rows, sizing, and grid options."
---
<!-- api-export:@sheetwrite/core|./adapter|SimpleSheetwriteOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Framework-neutral simple columns, rows, sizing, and grid options.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/adapter.ts#L244"><code>packages/core/src/adapter.ts#L244</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="simple-sheetwrite-options-columns" data-pagefind-weight="1">
<summary><code>columns</code></summary>

```ts generated
columns: readonly SimpleColumn<Row>[];
```

</details>

<details class="api-member" id="simple-sheetwrite-options-default-rows" data-pagefind-weight="1">
<summary><code>defaultRows</code></summary>

```ts generated
defaultRows: readonly Row[];
```

</details>

<details class="api-member" id="simple-sheetwrite-options-sheet-name" data-pagefind-weight="1">
<summary><code>sheetName</code></summary>

```ts generated
sheetName?: string;
```

</details>

<details class="api-member" id="simple-sheetwrite-options-get-row-id" data-pagefind-weight="1">
<summary><code>getRowId</code> <span class="api-member-summary">Opt-in stable data-row identity extractor.</span></summary>

```ts generated
getRowId?: (row: Row, index: number) => Id;
```

</details>

<details class="api-member" id="simple-sheetwrite-options-create-row-id" data-pagefind-weight="1">
<summary><code>createRowId</code> <span class="api-member-summary">Optional identity factory for rows inserted by the Grid.</span></summary>

```ts generated
createRowId?: RowBridgeOptions<Row, Id>["createRowId"];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SimpleSheetwriteOptions<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> {
  columns: readonly SimpleColumn<Row>[];
  defaultRows: readonly Row[];
  sheetName?: string;
  getRowId?: (row: Row, index: number) => Id;
  createRowId?: RowBridgeOptions<Row, Id>["createRowId"];
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

<p class="api-consumers-label">Public exports naming <code>SimpleSheetwriteOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/create-simple-grid-input/"><code>createSimpleGridInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/create-simple-row-bridge/"><code>createSimpleRowBridge</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
