---
title: "@sheetwrite/formulas"
description: "API reference for @sheetwrite/formulas."
---
<span class="api-status" data-status="internal">internal</span>

**Internal/transitive entry point; application code normally does not import it directly.** Import this entry point as `@sheetwrite/formulas`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Declaration target</dt><dd><code>./loader.d.ts</code></dd></div>
<div><dt>Exports</dt><dd>14</dd></div>
</dl>

Source entry: `packages/formulas/loader.d.ts`

## Exported symbols

### Classes <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/formulas/cell-out/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>CellOut</code></span><span class="api-symbol-card__desc">Result of a single-cell read.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/cell-snapshot/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>CellSnapshot</code></span><span class="api-symbol-card__desc">Resolved values of a sparse coordinate batch, one entry per requested cell.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/cell-store/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>CellStore</code></span><span class="api-symbol-card__desc">The workbook-wide store: every sheet, one string pool.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/distinct-column/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>DistinctColumn</code></span><span class="api-symbol-card__desc">Distinct-value scan result for one column: parallel kind/number/text arrays whose buffers are surrendered once through the take accessors.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/range-snapshot/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>RangeSnapshot</code></span><span class="api-symbol-card__desc">Opaque, store-local history payload for one dense rectangular cell block.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/source-snapshot/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>SourceSnapshot</code></span><span class="api-symbol-card__desc">Compact serializable projection of persisted derived-cell sources and spill identity in one range.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/window-view/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="class" aria-hidden="true">C</span><code>WindowView</code></span><span class="api-symbol-card__desc">A bulk window of resolved cells, row-major over nrows x ncols.</span></a>
</div>

### Functions <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/formulas/function-names/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>functionNames</code></span><span class="api-symbol-card__desc">Names accepted by the full engine, including aliases.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/init-sync/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>initSync</code></span><span class="api-symbol-card__desc">Instantiates the given module, which can either be bytes or a precompiled WebAssembly.Module.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/is-loaded/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>isLoaded</code></span><span class="api-symbol-card__desc">Whether the WASM module has finished initializing.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/load/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="function" aria-hidden="true">F</span><code>load</code></span><span class="api-symbol-card__desc">Initialize the WASM module.</span></a>
</div>

### Interfaces <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/formulas/init-output/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="interface" aria-hidden="true">I</span><code>InitOutput</code></span><span class="api-symbol-card__desc">Result of module initialization: the instantiated exports plus the shared linear memory.</span></a>
</div>

### Types <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-symbol-grid">
<a class="api-symbol-card" href="/docs/api/formulas/init-input/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>InitInput</code></span><span class="api-symbol-card__desc">Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled WebAssembly.Module.</span></a>
<a class="api-symbol-card" href="/docs/api/formulas/sync-init-input/"><span class="api-symbol-card__head"><span class="api-symbol-badge" data-kind="type" aria-hidden="true">T</span><code>SyncInitInput</code></span><span class="api-symbol-card__desc">Sources accepted by synchronous initialization: raw module bytes or a precompiled WebAssembly.Module.</span></a>
</div>
