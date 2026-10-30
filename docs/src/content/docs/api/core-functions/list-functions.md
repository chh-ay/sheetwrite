---
title: "listFunctions | @sheetwrite/core/functions"
description: "listFunctions function in @sheetwrite/core/functions: Metadata of every function that formulas in store can call: the built-in functions of the active engine…"
---
<!-- api-export:@sheetwrite/core|./functions|listFunctions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="function">function</span></div>

Metadata of every function that formulas in `store` can call: the built-in
functions of the active engine, then the host functions of `store` in
registration order. Formula help reads this one list. The built-in table
loads on the first call, so the result is a promise.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/functions.ts#L109"><code>packages/core/src/functions.ts#L109</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function listFunctions(
  store: Store,
): Promise<readonly FormulaFunctionMetadata[]>
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

<p class="api-consumers-label">Public exports naming <code>listFunctions</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
