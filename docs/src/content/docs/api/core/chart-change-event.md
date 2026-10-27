---
title: "ChartChangeEvent | @sheetwrite/core"
description: "Charts whose ChartView may differ after one store commit."
---
<!-- api-export:@sheetwrite/core|.|ChartChangeEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Charts whose `ChartView` may differ after one store commit. Emitted at most
once per commit, only when `charts` is not empty; each chart appears once.
A chart that no longer exists resolves to `null`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/chart.ts#L78"><code>packages/core/src/types/chart.ts#L78</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="chart-change-event-epoch" data-pagefind-weight="1">
<summary><code>epoch</code> <span class="api-member-summary">Store epoch after the commit.</span></summary>

```ts generated
readonly epoch: number | undefined;
```

<p class="api-member-doc">Store epoch after the commit. `undefined` when the store sent its change
event without an epoch, which a custom `Store` can do.</p>
</details>

<details class="api-member" id="chart-change-event-charts" data-pagefind-weight="1">
<summary><code>charts</code> <span class="api-member-summary">Charts to resolve again, in commit order of the edits that touched them.</span></summary>

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

<p class="api-consumers-label">Public exports naming <code>ChartChangeEvent</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/chart-change-listener/"><code>ChartChangeListener</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
