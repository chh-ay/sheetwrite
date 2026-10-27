---
title: "ChartRef | @sheetwrite/charts"
description: "Stable identity of one chart: the sheet that owns it and its ID on that sheet."
---
<!-- api-export:@sheetwrite/charts|.|ChartRef -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="interface">interface</span></div>

Stable identity of one chart: the sheet that owns it and its ID on that sheet.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/dist/charts-live.d.ts#L10"><code>packages/core/dist/charts-live.d.ts#L10</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="chart-ref-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: SheetId;
```

</details>

<details class="api-member" id="chart-ref-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
readonly id: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartRef {
  readonly sheet: SheetId;
  readonly id: string;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>ChartRef</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/chart-change-event/"><code>ChartChangeEvent</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/charts/chart-view-cache/"><code>ChartViewCache</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-change-event/"><code>ChartChangeEvent</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/chart-view-provider/"><code>ChartViewProvider</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
