---
title: "DashboardBox | @sheetwrite/core"
description: "DashboardBox interface in @sheetwrite/core: Position and size of a dashboard item in grid units."
---
<!-- api-export:@sheetwrite/core|.|DashboardBox -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Position and size of a dashboard item in grid units. The grid has 12
columns; rows grow downward. Items do not overlap.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/dashboard.ts#L11"><code>packages/core/src/types/dashboard.ts#L11</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="dashboard-box-x" data-pagefind-weight="1">
<summary><code>x</code> <span class="api-member-summary">First column, 0-based; x + w is at most 12.</span></summary>

```ts generated
x: number;
```

</details>

<details class="api-member" id="dashboard-box-y" data-pagefind-weight="1">
<summary><code>y</code> <span class="api-member-summary">First row, 0-based.</span></summary>

```ts generated
y: number;
```

</details>

<details class="api-member" id="dashboard-box-w" data-pagefind-weight="1">
<summary><code>w</code> <span class="api-member-summary">Width in columns, 1 to 12.</span></summary>

```ts generated
w: number;
```

</details>

<details class="api-member" id="dashboard-box-h" data-pagefind-weight="1">
<summary><code>h</code> <span class="api-member-summary">Height in rows, 1 to 64.</span></summary>

```ts generated
h: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DashboardBox {
  x: number;
  y: number;
  w: number;
  h: number;
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

<p class="api-consumers-label">Public exports naming <code>DashboardBox</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/dashboard-pivot-item/"><code>DashboardPivotItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/dashboard-slicer-item/"><code>DashboardSlicerItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
