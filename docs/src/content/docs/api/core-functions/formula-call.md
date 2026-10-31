---
title: "FormulaCall | @sheetwrite/core/functions"
description: "FormulaCall interface in @sheetwrite/core/functions: The innermost function call around the cursor."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaCall -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

The innermost function call around the cursor. `argumentIndex` is 0-based;
`argument` is its metadata, and is undefined when the call has more
arguments than the function takes or the function is unknown.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L62"><code>packages/core/src/formula-analysis.ts#L62</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="formula-call-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="formula-call-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from: number;
```

</details>

<details class="api-member" id="formula-call-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to: number;
```

</details>

<details class="api-member" id="formula-call-argument-index" data-pagefind-weight="1">
<summary><code>argumentIndex</code></summary>

```ts generated
readonly argumentIndex: number;
```

</details>

<details class="api-member" id="formula-call-function" data-pagefind-weight="1">
<summary><code>function</code></summary>

```ts generated
readonly function: FormulaFunctionMetadata | undefined;
```

</details>

<details class="api-member" id="formula-call-argument" data-pagefind-weight="1">
<summary><code>argument</code></summary>

```ts generated
readonly argument: FormulaArgumentMetadata | undefined;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaCall {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly argumentIndex: number;
  readonly function: FormulaFunctionMetadata | undefined;
  readonly argument: FormulaArgumentMetadata | undefined;
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

<p class="api-consumers-label">Public exports naming <code>FormulaCall</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-analysis/"><code>FormulaAnalysis</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
