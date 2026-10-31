---
title: "FormulaSyntaxError | @sheetwrite/wasm"
description: "FormulaSyntaxError class in @sheetwrite/wasm: The first syntax error of a formula, as the engine's parser finds it."
---
<!-- api-export:@sheetwrite/wasm|.|FormulaSyntaxError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

The first syntax error of a formula, as the engine's parser finds it.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/pkg/sheetwrite_wasm.d.ts#L459"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L459</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="formula-syntax-error-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="formula-syntax-error-from" data-pagefind-weight="1">
<summary><code>from</code> <span class="api-member-summary">The UTF-16 offset where the marked text starts.</span></summary>

```ts generated
from: number;
```

</details>

<details class="api-member" id="formula-syntax-error-incomplete" data-pagefind-weight="1">
<summary><code>incomplete</code> <span class="api-member-summary">The text ends before the formula is complete: a value, a ) or a closing quote is missing at the end.</span></summary>

```ts generated
incomplete: boolean;
```

<p class="api-member-doc">The text ends before the formula is complete: a value, a `)` or a
closing quote is missing at the end. Typing on usually completes it.</p>
</details>

<details class="api-member" id="formula-syntax-error-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
message: string;
```

</details>

<details class="api-member" id="formula-syntax-error-to" data-pagefind-weight="1">
<summary><code>to</code> <span class="api-member-summary">The UTF-16 offset where the marked text ends.</span></summary>

```ts generated
to: number
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class FormulaSyntaxError {
  free: () => void;
  from: number;
  incomplete: boolean;
  message: string;
  to: number;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>FormulaSyntaxError</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/check-formula-syntax/"><code>checkFormulaSyntax</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/check-formula-syntax/"><code>checkFormulaSyntax</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
