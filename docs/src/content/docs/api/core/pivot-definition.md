---
title: "PivotDefinition | @sheetwrite/core"
description: "PivotDefinition interface in @sheetwrite/core: Serializable pivot-table definition, owned by the sheet that holds its anchor."
---
<!-- api-export:@sheetwrite/core|.|PivotDefinition -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Serializable pivot-table definition, owned by the sheet that holds its
anchor. The output starts at `anchor` and spills right and down.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/pivot.ts#L64"><code>packages/core/src/types/pivot.ts#L64</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#pivot-definition-id"><code>id</code></a>
<a href="#pivot-definition-name"><code>name</code></a>
<a href="#pivot-definition-source"><code>source</code></a>
<a href="#pivot-definition-anchor"><code>anchor</code></a>
<a href="#pivot-definition-rows"><code>rows</code></a>
<a href="#pivot-definition-columns"><code>columns</code></a>
<a href="#pivot-definition-values"><code>values</code></a>
<a href="#pivot-definition-filters"><code>filters</code></a>
<a href="#pivot-definition-sort"><code>sort</code></a>
<a href="#pivot-definition-row-totals"><code>rowTotals</code></a>
<a href="#pivot-definition-column-totals"><code>columnTotals</code></a>
<a href="#pivot-definition-subtotals"><code>subtotals</code></a>
<a href="#pivot-definition-layout"><code>layout</code></a>
<a href="#pivot-definition-saved-output"><code>savedOutput</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>14</span>

<div class="api-member-list">

<details class="api-member" id="pivot-definition-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable identity, unique in the workbook.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="pivot-definition-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">User-facing caption.</span></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="pivot-definition-source" data-pagefind-weight="1">
<summary><code>source</code> <span class="api-member-summary">Data the pivot summarizes.</span></summary>

```ts generated
source: PivotSource;
```

</details>

<details class="api-member" id="pivot-definition-anchor" data-pagefind-weight="1">
<summary><code>anchor</code> <span class="api-member-summary">Top-left output cell on the owning sheet.</span></summary>

```ts generated
anchor: { row: number; col: number };
```

<p class="api-member-doc">Top-left output cell on the owning sheet. Deleting the anchor's row or
column keeps the pivot and moves the anchor to the first surviving cell
at the deletion position.</p>
</details>

<details class="api-member" id="pivot-definition-rows" data-pagefind-weight="1">
<summary><code>rows</code> <span class="api-member-summary">Source field indices that group the output rows, outermost first.</span></summary>

```ts generated
rows: number[];
```

</details>

<details class="api-member" id="pivot-definition-columns" data-pagefind-weight="1">
<summary><code>columns</code> <span class="api-member-summary">Source field indices that group the output columns, outermost first.</span></summary>

```ts generated
columns: number[];
```

</details>

<details class="api-member" id="pivot-definition-values" data-pagefind-weight="1">
<summary><code>values</code> <span class="api-member-summary">Aggregated fields, in output order.</span></summary>

```ts generated
values: PivotValueField[];
```

</details>

<details class="api-member" id="pivot-definition-filters" data-pagefind-weight="1">
<summary><code>filters</code> <span class="api-member-summary">Keep-lists that limit which source rows contribute; at most one per field.</span></summary>

```ts generated
filters?: PivotFilter[];
```

</details>

<details class="api-member" id="pivot-definition-sort" data-pagefind-weight="1">
<summary><code>sort</code> <span class="api-member-summary">Label order of grouped fields; each key names a field that groups its axis.</span></summary>

```ts generated
sort?: PivotSort[];
```

</details>

<details class="api-member" id="pivot-definition-row-totals" data-pagefind-weight="1">
<summary><code>rowTotals</code> <span class="api-member-summary">Grand-total row at the bottom (PIVOTBY rowtotaldepth; OOXML colGrandTotals).</span></summary>

```ts generated
rowTotals?: boolean;
```

<p class="api-member-doc">Grand-total row at the bottom (PIVOTBY `row_total_depth`; OOXML
`colGrandTotals`). Default `true`.</p>
</details>

<details class="api-member" id="pivot-definition-column-totals" data-pagefind-weight="1">
<summary><code>columnTotals</code> <span class="api-member-summary">Grand-total column at the right (PIVOTBY coltotaldepth; OOXML rowGrandTotals).</span></summary>

```ts generated
columnTotals?: boolean;
```

<p class="api-member-doc">Grand-total column at the right (PIVOTBY `col_total_depth`; OOXML
`rowGrandTotals`). Default `true`.</p>
</details>

<details class="api-member" id="pivot-definition-subtotals" data-pagefind-weight="1">
<summary><code>subtotals</code> <span class="api-member-summary">Subtotal rows and columns for each outer group of a multi-field axis.</span></summary>

```ts generated
subtotals?: boolean;
```

<p class="api-member-doc">Subtotal rows and columns for each outer group of a multi-field axis. Default `true`.</p>
</details>

<details class="api-member" id="pivot-definition-layout" data-pagefind-weight="1">
<summary><code>layout</code> <span class="api-member-summary">Default &quot;compact&quot;.</span></summary>

```ts generated
layout?: PivotLayout;
```

</details>

<details class="api-member" id="pivot-definition-saved-output" data-pagefind-weight="1">
<summary><code>savedOutput</code> <span class="api-member-summary">Output cells a file saved for this pivot, row-major from anchor: for example the cells Excel rendered.</span></summary>

```ts generated
savedOutput?: { rows: number; cols: number; cells: CellScalar[] };
```

<p class="api-member-doc">Output cells a file saved for this pivot, row-major from `anchor`: for
example the cells Excel rendered. At most 1,000,000 cells, and
`cells.length` is `rows * cols`.

- The default engine computes no pivots, so it shows these values from
  the anchor. Formulas read them, and local writes into them are refused.
  A source cell, formula or spill in the rectangle shows `#SPILL!` at
  the anchor until it is cleared.
- The full engine ignores these values and recalculates the output.
- `setPivot` on the Grid or store removes them, because the saved
  values no longer match a changed definition. A row or column edit
  keeps them only when the output rectangle moves without a change;
  an edit inside the rectangle removes them.
- Snapshots, sync and XLSX export keep them on every engine.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PivotDefinition {
  id: string;
  name: string;
  source: PivotSource;
  anchor: {
    row: number;
    col: number;
  };
  rows: number[];
  columns: number[];
  values: PivotValueField[];
  filters?: PivotFilter[];
  sort?: PivotSort[];
  rowTotals?: boolean;
  columnTotals?: boolean;
  subtotals?: boolean;
  layout?: PivotLayout;
  savedOutput?: {
    rows: number;
    cols: number;
    cells: CellScalar[];
  };
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>PivotDefinition</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
