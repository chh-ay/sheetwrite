---
title: "ChartChangeEvent | @sheetwrite/charts"
description: "ChartChangeEvent interface in @sheetwrite/charts: Source summary unavailable; docs:check rejects this omission."
---
<!-- api-export:@sheetwrite/charts|.|ChartChangeEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="interface">interface</span></div>

Source summary unavailable; docs:check rejects this omission.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/dist/types/chart.d.ts#L48"><code>packages/core/dist/types/chart.d.ts#L48</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="chart-change-event-epoch" data-pagefind-weight="1">
<summary><code>epoch</code></summary>

```ts generated
readonly epoch: number | undefined;
```

</details>

<details class="api-member" id="chart-change-event-charts" data-pagefind-weight="1">
<summary><code>charts</code></summary>

```ts generated
readonly charts: readonly ChartRef[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartChangeEvent {
  readonly epoch: number | undefined;
  readonly charts: readonly ChartRef[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>ChartChangeEvent</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/chart-change-listener/"><code>ChartChangeListener</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
