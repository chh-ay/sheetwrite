---
title: "loadHistoryKernel | @sheetwrite/wasm/history"
description: "loadHistoryKernel function in @sheetwrite/wasm/history: Instantiate the history-only diff kernel once."
---
<!-- api-export:@sheetwrite/wasm|./history|loadHistoryKernel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm-history/">@sheetwrite/wasm/history</a><span class="api-status" data-kind="function">function</span></div>

Instantiate the history-only diff kernel once. It is a separate WASM module
with no formula engine; `@sheetwrite/core/history` loads it the first time a
diff runs. `source` overrides where the WASM comes from, for example a URL
that a bundler emitted for `@sheetwrite/wasm/history/wasm`. A failed load
can be retried.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/history.d.ts#L10"><code>packages/wasm/history.d.ts#L10</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function loadHistoryKernel(
  source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void>
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>loadHistoryKernel</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
