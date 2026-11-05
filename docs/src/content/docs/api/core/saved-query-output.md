---
title: "SavedQueryOutput | @sheetwrite/core"
description: "SavedQueryOutput interface in @sheetwrite/core: The workbook table that holds a query's last refreshed values."
---
<!-- api-export:@sheetwrite/core|.|SavedQueryOutput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

The workbook table that holds a query's last refreshed values. Its top-left
cell is `anchor`; the first row is the header row. The table cells are the
saved result, so a workbook without the query engine still reads them.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L120"><code>packages/core/src/types/query.ts#L120</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="saved-query-output-table" data-pagefind-weight="1">
<summary><code>table</code> <span class="api-member-summary">Stable WorkbookTable.id; refresh creates the table if it is absent.</span></summary>

```ts generated
readonly table: WorkbookTableId;
```

</details>

<details class="api-member" id="saved-query-output-table-name" data-pagefind-weight="1">
<summary><code>tableName</code> <span class="api-member-summary">Structured-reference name used when refresh creates the table.</span></summary>

```ts generated
readonly tableName: string;
```

</details>

<details class="api-member" id="saved-query-output-anchor" data-pagefind-weight="1">
<summary><code>anchor</code></summary>

```ts generated
readonly anchor: CellAddress;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SavedQueryOutput {
  readonly table: WorkbookTableId;
  readonly tableName: string;
  readonly anchor: CellAddress;
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
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SavedQueryOutput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/saved-query/"><code>SavedQuery</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
