---
title: "ChartAnchor | @sheetwrite/core"
description: "ChartAnchor interface in @sheetwrite/core: Position in worksheet coordinates; dimensions and offsets use CSS pixels."
---
<!-- api-export:@sheetwrite/core|.|ChartAnchor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Position in worksheet coordinates; dimensions and offsets use CSS pixels.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/chart.ts#L10"><code>packages/core/src/types/chart.ts#L10</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="chart-anchor-row" data-pagefind-weight="1">
<summary><code>row</code> <span class="api-member-summary">0-based row of the cell that holds the top-left corner.</span></summary>

```ts generated
row: number;
```

</details>

<details class="api-member" id="chart-anchor-col" data-pagefind-weight="1">
<summary><code>col</code> <span class="api-member-summary">0-based column of the cell that holds the top-left corner.</span></summary>

```ts generated
col: number;
```

</details>

<details class="api-member" id="chart-anchor-offset-x" data-pagefind-weight="1">
<summary><code>offsetX</code></summary>

```ts generated
offsetX: number;
```

</details>

<details class="api-member" id="chart-anchor-offset-y" data-pagefind-weight="1">
<summary><code>offsetY</code></summary>

```ts generated
offsetY: number;
```

</details>

<details class="api-member" id="chart-anchor-width" data-pagefind-weight="1">
<summary><code>width</code></summary>

```ts generated
width: number;
```

</details>

<details class="api-member" id="chart-anchor-height" data-pagefind-weight="1">
<summary><code>height</code></summary>

```ts generated
height: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ChartAnchor {
  row: number;
  col: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
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

<p class="api-consumers-label">Public exports naming <code>ChartAnchor</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/chart-definition/"><code>ChartDefinition</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-definition/"><code>ChartDefinition</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
