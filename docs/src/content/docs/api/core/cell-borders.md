---
title: "CellBorders | @sheetwrite/core"
description: "Per-side borders; all applies to any side not given its own border."
---
<!-- api-export:@sheetwrite/core|.|CellBorders -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Per-side borders; `all` applies to any side not given its own border.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/cell.ts#L18"><code>packages/core/src/types/cell.ts#L18</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-borders-all" data-pagefind-weight="1">
<summary><code>all</code></summary>

```ts generated
all?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-top" data-pagefind-weight="1">
<summary><code>top</code></summary>

```ts generated
top?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-right" data-pagefind-weight="1">
<summary><code>right</code></summary>

```ts generated
right?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-bottom" data-pagefind-weight="1">
<summary><code>bottom</code></summary>

```ts generated
bottom?: CellBorder;
```

</details>

<details class="api-member" id="cell-borders-left" data-pagefind-weight="1">
<summary><code>left</code></summary>

```ts generated
left?: CellBorder;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellBorders {
  all?: CellBorder;
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>CellBorders</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-style/"><code>CellStyle</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
