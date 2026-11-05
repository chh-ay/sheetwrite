---
title: "TableColumnRef | @sheetwrite/core"
description: "TableColumnRef interface in @sheetwrite/core: One column of a workbook table, by stable IDs that survive renames and moves."
---
<!-- api-export:@sheetwrite/core|.|TableColumnRef -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One column of a workbook table, by stable IDs that survive renames and moves.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/data-model.ts#L7"><code>packages/core/src/types/data-model.ts#L7</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="table-column-ref-table" data-pagefind-weight="1">
<summary><code>table</code> <span class="api-member-summary">Stable WorkbookTable.id.</span></summary>

```ts generated
table: WorkbookTableId;
```

</details>

<details class="api-member" id="table-column-ref-column" data-pagefind-weight="1">
<summary><code>column</code> <span class="api-member-summary">Stable WorkbookTableColumn.id.</span></summary>

```ts generated
column: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface TableColumnRef {
  table: WorkbookTableId;
  column: string;
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

<p class="api-consumers-label">Public exports naming <code>TableColumnRef</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/dashboard-slicer-item/"><code>DashboardSlicerItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/pivot-source/"><code>PivotSource</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/table-relationship/"><code>TableRelationship</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
