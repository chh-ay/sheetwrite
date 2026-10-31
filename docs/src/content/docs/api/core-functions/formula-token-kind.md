---
title: "FormulaTokenKind | @sheetwrite/core/functions"
description: "FormulaTokenKind type in @sheetwrite/core/functions: What a token is; editors use it for syntax colours."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaTokenKind -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="type">type</span></div>

What a token is; editors use it for syntax colours.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/formula-analysis.ts#L23"><code>packages/core/src/formula-analysis.ts#L23</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type FormulaTokenKind =
  | "number"
  | "string"
  | "boolean"
  | "error"
  | "function"
  | "reference"
  | "sheet"
  | "name"
  | "operator"
  | "separator"
  | "paren"
  | "invalid";
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>FormulaTokenKind</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/formula-token/"><code>FormulaToken</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
