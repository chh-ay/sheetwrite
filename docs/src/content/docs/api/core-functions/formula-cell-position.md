---
title: "FormulaCellPosition | @sheetwrite/core/functions"
description: "FormulaCellPosition interface in @sheetwrite/core/functions: A 0-based cell position."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaCellPosition -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

A 0-based cell position.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L37"><code>packages/core/src/formula-analysis.ts#L37</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="formula-cell-position-row" data-pagefind-weight="1">
<summary><code>row</code></summary>

```ts generated
readonly row: number;
```

</details>

<details class="api-member" id="formula-cell-position-col" data-pagefind-weight="1">
<summary><code>col</code></summary>

```ts generated
readonly col: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaCellPosition {
  readonly row: number;
  readonly col: number;
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

<p class="api-consumers-label">Public exports naming <code>FormulaCellPosition</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-reference/"><code>FormulaReference</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
