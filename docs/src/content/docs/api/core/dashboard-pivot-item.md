---
title: "DashboardPivotItem | @sheetwrite/core"
description: "DashboardPivotItem interface in @sheetwrite/core: A pivot of the dashboard sheet, shown in a box."
---
<!-- api-export:@sheetwrite/core|.|DashboardPivotItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A pivot of the dashboard sheet, shown in a box.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/dashboard.ts#L23"><code>packages/core/src/types/dashboard.ts#L23</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="dashboard-pivot-item-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable ID, unique on the dashboard.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="dashboard-pivot-item-box" data-pagefind-weight="1">
<summary><code>box</code></summary>

```ts generated
box: DashboardBox;
```

</details>

<details class="api-member" id="dashboard-pivot-item-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
kind: "pivot";
```

</details>

<details class="api-member" id="dashboard-pivot-item-pivot" data-pagefind-weight="1">
<summary><code>pivot</code> <span class="api-member-summary">PivotDefinition.id of a pivot on the same dashboard sheet.</span></summary>

```ts generated
pivot: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DashboardPivotItem {
  id: string;
  box: DashboardBox;
  kind: "pivot";
  pivot: string;
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

<p class="api-consumers-label">Public exports naming <code>DashboardPivotItem</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/dashboard-item/"><code>DashboardItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
