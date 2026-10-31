---
title: "FormulaToken | @sheetwrite/core/functions"
description: "FormulaToken interface in @sheetwrite/core/functions: One token of a formula. from and to are UTF-16 offsets into the text."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaToken -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

One token of a formula. `from` and `to` are UTF-16 offsets into the text.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L38"><code>packages/core/src/formula-analysis.ts#L38</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="formula-token-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: FormulaTokenKind;
```

</details>

<details class="api-member" id="formula-token-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from: number;
```

</details>

<details class="api-member" id="formula-token-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaToken {
  readonly kind: FormulaTokenKind;
  readonly from: number;
  readonly to: number;
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

<p class="api-consumers-label">Public exports naming <code>FormulaToken</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-analysis/"><code>FormulaAnalysis</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
