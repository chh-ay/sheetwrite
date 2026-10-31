---
title: "FormulaAnalysis | @sheetwrite/core/functions"
description: "FormulaAnalysis interface in @sheetwrite/core/functions: Everything formula help shows for one formula text and cursor offset."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaAnalysis -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

Everything formula help shows for one formula text and cursor offset.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L87"><code>packages/core/src/formula-analysis.ts#L87</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="formula-analysis-tokens" data-pagefind-weight="1">
<summary><code>tokens</code></summary>

```ts generated
readonly tokens: readonly FormulaToken[];
```

</details>

<details class="api-member" id="formula-analysis-references" data-pagefind-weight="1">
<summary><code>references</code></summary>

```ts generated
readonly references: readonly FormulaReference[];
```

</details>

<details class="api-member" id="formula-analysis-call" data-pagefind-weight="1">
<summary><code>call</code></summary>

```ts generated
readonly call: FormulaCall | null;
```

</details>

<details class="api-member" id="formula-analysis-completion" data-pagefind-weight="1">
<summary><code>completion</code></summary>

```ts generated
readonly completion: FormulaCompletion | null;
```

</details>

<details class="api-member" id="formula-analysis-diagnostics" data-pagefind-weight="1">
<summary><code>diagnostics</code></summary>

```ts generated
readonly diagnostics: readonly FormulaDiagnostic[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaAnalysis {
  readonly tokens: readonly FormulaToken[];
  readonly references: readonly FormulaReference[];
  readonly call: FormulaCall | null;
  readonly completion: FormulaCompletion | null;
  readonly diagnostics: readonly FormulaDiagnostic[];
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

<p class="api-consumers-label">Public exports naming <code>FormulaAnalysis</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/analyze-formula/"><code>analyzeFormula</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
