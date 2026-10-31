---
title: "FormulaReference | @sheetwrite/core/functions"
description: "FormulaReference interface in @sheetwrite/core/functions: A cell, range, whole-column or whole-row reference."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaReference -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

A cell, range, whole-column or whole-row reference. `sheet` is the sheet
name as written, without quotes, or null for the formula's own sheet. Equal
references share one `colorIndex`, so an editor gives each distinct
reference one colour in the text and on the grid.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L48"><code>packages/core/src/formula-analysis.ts#L48</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="formula-reference-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from: number;
```

</details>

<details class="api-member" id="formula-reference-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to: number;
```

</details>

<details class="api-member" id="formula-reference-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
readonly sheet: string | null;
```

</details>

<details class="api-member" id="formula-reference-start" data-pagefind-weight="1">
<summary><code>start</code></summary>

```ts generated
readonly start: FormulaCellPosition;
```

</details>

<details class="api-member" id="formula-reference-end" data-pagefind-weight="1">
<summary><code>end</code></summary>

```ts generated
readonly end: FormulaCellPosition;
```

</details>

<details class="api-member" id="formula-reference-color-index" data-pagefind-weight="1">
<summary><code>colorIndex</code></summary>

```ts generated
readonly colorIndex: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaReference {
  readonly from: number;
  readonly to: number;
  readonly sheet: string | null;
  readonly start: FormulaCellPosition;
  readonly end: FormulaCellPosition;
  readonly colorIndex: number;
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

<p class="api-consumers-label">Public exports naming <code>FormulaReference</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-analysis/"><code>FormulaAnalysis</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
