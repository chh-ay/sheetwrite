---
title: "FormulaCompletion | @sheetwrite/core/functions"
description: "FormulaCompletion interface in @sheetwrite/core/functions: Functions whose names start with the name at the cursor, and the span to replace."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaCompletion -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

Functions whose names start with the name at the cursor, and the span to replace.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L80"><code>packages/core/src/formula-analysis.ts#L80</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="formula-completion-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from: number;
```

</details>

<details class="api-member" id="formula-completion-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to: number;
```

</details>

<details class="api-member" id="formula-completion-matches" data-pagefind-weight="1">
<summary><code>matches</code></summary>

```ts generated
readonly matches: readonly FormulaFunctionMetadata[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaCompletion {
  readonly from: number;
  readonly to: number;
  readonly matches: readonly FormulaFunctionMetadata[];
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

<p class="api-consumers-label">Public exports naming <code>FormulaCompletion</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-analysis/"><code>FormulaAnalysis</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
