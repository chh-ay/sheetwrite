---
title: "FormulaDiagnostic | @sheetwrite/core/functions"
description: "FormulaDiagnostic interface in @sheetwrite/core/functions: A problem in a formula, with the span of text it marks."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaDiagnostic -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="interface">interface</span></div>

A problem in a formula, with the span of text it marks.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-check.ts#L11"><code>packages/core/src/formula-check.ts#L11</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="formula-diagnostic-from" data-pagefind-weight="1">
<summary><code>from</code></summary>

```ts generated
readonly from: number;
```

</details>

<details class="api-member" id="formula-diagnostic-to" data-pagefind-weight="1">
<summary><code>to</code></summary>

```ts generated
readonly to: number;
```

</details>

<details class="api-member" id="formula-diagnostic-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
readonly message: string;
```

</details>

<details class="api-member" id="formula-diagnostic-incomplete" data-pagefind-weight="1">
<summary><code>incomplete</code> <span class="api-member-summary">The formula ends before it is complete (a missing ) or value at the end).</span></summary>

```ts generated
readonly incomplete: boolean;
```

<p class="api-member-doc">The formula ends before it is complete (a missing `)` or value at the end).
Editors can hold these back while the caret is at the end of the text.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface FormulaDiagnostic {
  readonly from: number;
  readonly to: number;
  readonly message: string;
  readonly incomplete: boolean;
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

<p class="api-consumers-label">Public exports naming <code>FormulaDiagnostic</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-analysis/"><code>FormulaAnalysis</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
