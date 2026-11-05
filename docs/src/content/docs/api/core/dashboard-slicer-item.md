---
title: "DashboardSlicerItem | @sheetwrite/core"
description: "DashboardSlicerItem interface in @sheetwrite/core: A slicer: the distinct values of one table column, of which selected pass."
---
<!-- api-export:@sheetwrite/core|.|DashboardSlicerItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A slicer: the distinct values of one table column, of which `selected`
pass. Every slicer of a dashboard filters every item that reads its table
through relationships.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/dashboard.ts#L37"><code>packages/core/src/types/dashboard.ts#L37</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="dashboard-slicer-item-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable ID, unique on the dashboard.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="dashboard-slicer-item-box" data-pagefind-weight="1">
<summary><code>box</code></summary>

```ts generated
box: DashboardBox;
```

</details>

<details class="api-member" id="dashboard-slicer-item-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: "slicer";
```

</details>

<details class="api-member" id="dashboard-slicer-item-field" data-pagefind-weight="1">
<summary><code>field</code> <span class="api-member-summary">The table column whose values the slicer lists.</span></summary>

```ts generated
field: TableColumnRef;
```

</details>

<details class="api-member" id="dashboard-slicer-item-selected" data-pagefind-weight="1">
<summary><code>selected</code> <span class="api-member-summary">Values that pass; absent means every value passes.</span></summary>

```ts generated
selected?: CellScalar[];
```

</details>

<details class="api-member" id="dashboard-slicer-item-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Caption; absent shows the column name.</span></summary>

```ts generated
title?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DashboardSlicerItem {
  id: string;
  box: DashboardBox;
  kind: "slicer";
  field: TableColumnRef;
  selected?: CellScalar[];
  title?: string;
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

<p class="api-consumers-label">Public exports naming <code>DashboardSlicerItem</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/dashboard-item/"><code>DashboardItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
