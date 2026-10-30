---
title: "registerFunction | @sheetwrite/core/functions"
description: "registerFunction function in @sheetwrite/core/functions: Registers a synchronous JavaScript function that formulas in store can call, then recalculates every…"
---
<!-- api-export:@sheetwrite/core|./functions|registerFunction -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-functions/">@sheetwrite/core/functions</a><span class="api-status" data-kind="function">function</span></div>

Registers a synchronous JavaScript function that formulas in `store` can
call, then recalculates every formula. Registering a name again replaces the
function. The function receives each argument as a scalar, or as row arrays
for a block of more than one cell, and returns a number, text, boolean, or
`null` for an empty result. A thrown error or any other result shows
`#VALUE!`. The function must not read calculated cells or change the store:
calls that need the engine throw a `blocked` error. Snapshots keep only
formula text, so register the function after loading.

## Examples

```ts compile
import type { Store } from "@sheetwrite/core";
import { registerFunction } from "@sheetwrite/core/functions";

function addTaxRate(store: Store) {
  registerFunction(
    store,
    {
      name: "TAXRATE",
      description: "Sales tax rate of a region.",
      arguments: [{ name: "region", types: ["text"] }],
      returnKind: "number",
    },
    (region) => (region === "EU" ? 0.2 : 0.07),
  );
}
```

## See also

- [/docs/features/formulas/custom-functions/](/docs/features/formulas/custom-functions/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/functions.ts#L70"><code>packages/core/src/functions.ts#L70</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function registerFunction(
  store: Store,
  metadata: FormulaFunctionMetadata,
  implementation: FormulaFunction,
): void
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

<p class="api-consumers-label">Public exports naming <code>registerFunction</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
