---
title: "MountedChart | @sheetwrite/charts"
description: "Draws one chart into a box that core places and sizes."
---
<!-- api-export:@sheetwrite/charts|.|MountedChart -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/charts/">@sheetwrite/charts</a><span class="api-status" data-kind="interface">interface</span></div>

Draws one chart into a box that core places and sizes.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/dist/types/chart.d.ts#L93"><code>packages/core/dist/types/chart.d.ts#L93</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="mounted-chart-resize" data-pagefind-weight="1">
<summary><code>resize</code> <span class="api-member-summary">Core calls this after it changes the box size in CSS pixels.</span></summary>

```ts generated
resize(width: number, height: number): void;
```

</details>

<details class="api-member" id="mounted-chart-dispose" data-pagefind-weight="1">
<summary><code>dispose</code></summary>

```ts generated
dispose(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface MountedChart {
  resize(width: number, height: number): void;
  dispose(): void;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/charts</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>MountedChart</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/charts/chart-renderer/"><code>ChartRenderer</code></a><span class="api-consumer-kind">@sheetwrite/charts</span></li>
<li><a href="/docs/api/core/chart-renderer/"><code>ChartRenderer</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
