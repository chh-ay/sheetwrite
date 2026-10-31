---
title: "@sheetwrite/core/functions"
description: "API reference for @sheetwrite/core/functions."
---
<span class="api-status" data-status="supported">supported</span>

**Supported public entry point.** Import this entry point as `@sheetwrite/core/functions`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./dist/functions.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>8</dd></div>
</dl>

Source entry: `packages/core/src/functions.ts`

## Exported symbols

### Functions <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-functions/list-functions/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>listFunctions</code></span><span class="api-symbol-card__desc">Metadata of every function that formulas in store can call: the built-in functions of the active engine, then the host functions of store in registration order.</span></a>
<a class="api-symbol-card" href="/docs/api/core-functions/register-function/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>registerFunction</code></span><span class="api-symbol-card__desc">Registers a synchronous JavaScript function that formulas in store can call, then recalculates every formula.</span></a>
<a class="api-symbol-card" href="/docs/api/core-functions/unregister-function/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>unregisterFunction</code></span><span class="api-symbol-card__desc">Removes a host function from store.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-functions/formula-argument-metadata/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>FormulaArgumentMetadata</code></span><span class="api-symbol-card__desc">Argument documentation used by built-in and host functions.</span></a>
<a class="api-symbol-card" href="/docs/api/core-functions/formula-function-metadata/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>FormulaFunctionMetadata</code></span><span class="api-symbol-card__desc">One metadata format for built-in and host functions.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/core-functions/formula-argument/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>FormulaArgument</code></span><span class="api-symbol-card__desc">Ranges use row-major nested arrays.</span></a>
<a class="api-symbol-card" href="/docs/api/core-functions/formula-function/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>FormulaFunction</code></span><span class="api-symbol-card__desc">A synchronous host function.</span></a>
<a class="api-symbol-card" href="/docs/api/core-functions/formula-scalar/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>FormulaScalar</code></span><span class="api-symbol-card__desc">A scalar passed to or returned from a synchronous host formula function.</span></a>
</div>
