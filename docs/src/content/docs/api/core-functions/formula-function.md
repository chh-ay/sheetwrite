---
title: "FormulaFunction | @sheetwrite/core/functions"
description: "FormulaFunction type in @sheetwrite/core/functions: A synchronous host function."
---
<!-- api-export:@sheetwrite/core|./functions|FormulaFunction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="type">type</span></div>

A synchronous host function. Promises and other non-scalar results become `#VALUE!`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/functions/types.ts#L26"><code>packages/core/src/functions/types.ts#L26</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type FormulaFunction = (
  ...arguments_: readonly FormulaArgument[]
) => FormulaScalar;
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

<p class="api-consumers-label">Public exports naming <code>FormulaFunction</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-functions/register-function/"><code>registerFunction</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
