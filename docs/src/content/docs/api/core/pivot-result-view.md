---
title: "PivotResultView | @sheetwrite/core"
description: "Plain-JSON view of one pivot's output, for the field list and other UI."
---
<!-- api-export:@sheetwrite/core|.|PivotResultView -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Plain-JSON view of one pivot's output, for the field list and other UI.

- `ok`: the output occupies `rows` x `cols` cells from `anchor`; `cells`
  holds their values row-major. The first `headerRows` rows hold column
  labels and the first `labelCols` columns hold row labels.
- `error`: the anchor shows `error` (for example `#SPILL!` or `#REF!`)
  and `cells` is empty.
- `unavailable`: the loaded engine computes no pivots (the default
  engine) and the pivot has no saved output. The definition is still
  kept, saved and synchronized.
- `saved`: the default engine shows `savedOutput`, which a file saved;
  `cells` holds those values and `headerRows`/`labelCols` are 0.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/pivot.ts#L137"><code>packages/core/src/types/pivot.ts#L137</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#pivot-result-view-status"><code>status</code></a>
<a href="#pivot-result-view-error"><code>error</code></a>
<a href="#pivot-result-view-anchor"><code>anchor</code></a>
<a href="#pivot-result-view-rows"><code>rows</code></a>
<a href="#pivot-result-view-cols"><code>cols</code></a>
<a href="#pivot-result-view-header-rows"><code>headerRows</code></a>
<a href="#pivot-result-view-label-cols"><code>labelCols</code></a>
<a href="#pivot-result-view-cells"><code>cells</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="pivot-result-view-status" data-pagefind-weight="1">
<summary><code>status</code></summary>

```ts generated
status: "ok" | "error" | "unavailable" | "saved";
```

</details>

<details class="api-member" id="pivot-result-view-error" data-pagefind-weight="1">
<summary><code>error</code></summary>

```ts generated
error?: string;
```

</details>

<details class="api-member" id="pivot-result-view-anchor" data-pagefind-weight="1">
<summary><code>anchor</code></summary>

```ts generated
anchor: CellAddress;
```

</details>

<details class="api-member" id="pivot-result-view-rows" data-pagefind-weight="1">
<summary><code>rows</code></summary>

```ts generated
rows: number;
```

</details>

<details class="api-member" id="pivot-result-view-cols" data-pagefind-weight="1">
<summary><code>cols</code></summary>

```ts generated
cols: number;
```

</details>

<details class="api-member" id="pivot-result-view-header-rows" data-pagefind-weight="1">
<summary><code>headerRows</code></summary>

```ts generated
headerRows: number;
```

</details>

<details class="api-member" id="pivot-result-view-label-cols" data-pagefind-weight="1">
<summary><code>labelCols</code></summary>

```ts generated
labelCols: number;
```

</details>

<details class="api-member" id="pivot-result-view-cells" data-pagefind-weight="1">
<summary><code>cells</code></summary>

```ts generated
cells: CellScalar[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PivotResultView {
  status: "ok" | "error" | "unavailable" | "saved";
  error?: string;
  anchor: CellAddress;
  rows: number;
  cols: number;
  headerRows: number;
  labelCols: number;
  cells: CellScalar[];
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

<p class="api-consumers-label">Public exports naming <code>PivotResultView</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
