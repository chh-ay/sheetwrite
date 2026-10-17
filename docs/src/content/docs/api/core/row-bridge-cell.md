---
title: "RowBridgeCell | @sheetwrite/core"
description: "A cell effect with semantic column and host row identity."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A cell effect with semantic column and host row identity.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/row-bridge.ts#L40"><code>packages/core/src/row-bridge.ts#L40</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#row-bridge-cell-sheet"><code>sheet</code></a>
<a href="#row-bridge-cell-row"><code>row</code></a>
<a href="#row-bridge-cell-row-id"><code>rowId</code></a>
<a href="#row-bridge-cell-col"><code>col</code></a>
<a href="#row-bridge-cell-column-key"><code>columnKey</code></a>
<a href="#row-bridge-cell-previous"><code>previous</code></a>
<a href="#row-bridge-cell-next"><code>next</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-cell-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="row-bridge-cell-row" data-pagefind-weight="1">
<summary><code>row</code></summary>

```ts generated
readonly row: number;
```

</details>

<details class="api-member" id="row-bridge-cell-row-id" data-pagefind-weight="1">
<summary><code>rowId</code></summary>

```ts generated
readonly rowId: Id | null;
```

</details>

<details class="api-member" id="row-bridge-cell-col" data-pagefind-weight="1">
<summary><code>col</code></summary>

```ts generated
readonly col: number;
```

</details>

<details class="api-member" id="row-bridge-cell-column-key" data-pagefind-weight="1">
<summary><code>columnKey</code></summary>

```ts generated
readonly columnKey: string | null;
```

</details>

<details class="api-member" id="row-bridge-cell-previous" data-pagefind-weight="1">
<summary><code>previous</code></summary>

```ts generated
readonly previous: CellValue | undefined;
```

</details>

<details class="api-member" id="row-bridge-cell-next" data-pagefind-weight="1">
<summary><code>next</code></summary>

```ts generated
readonly next: CellValue | undefined;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeCell<Id extends RowBridgeId = RowBridgeId> {
  readonly sheet: SheetId;
  readonly row: number;
  readonly rowId: Id | null;
  readonly col: number;
  readonly columnKey: string | null;
  readonly previous: CellValue | undefined;
  readonly next: CellValue | undefined;
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

<p class="api-consumers-label">Public exports naming <code>RowBridgeCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-clear-delta/"><code>RowBridgeClearDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-fill-delta/"><code>RowBridgeFillDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-paste-delta/"><code>RowBridgePasteDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-range-delta/"><code>RowBridgeRangeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-clear-delta/"><code>RowBridgeClearDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-fill-delta/"><code>RowBridgeFillDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-paste-delta/"><code>RowBridgePasteDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-range-delta/"><code>RowBridgeRangeDelta</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
