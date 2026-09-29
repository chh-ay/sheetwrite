---
title: "decodeStoreMemoryStats | @sheetwrite/core"
description: "Decode the flat Rust protocol and fail closed on version/order/total drift."
---
<!-- api-export:@sheetwrite/core|.|decodeStoreMemoryStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="function">function</span></div>

Decode the flat Rust protocol and fail closed on version/order/total drift.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/resource-accounting.ts#L242"><code>packages/core/src/resource-accounting.ts#L242</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
function decodeStoreMemoryStats(
  encoded: ArrayLike<number>,
  wasmCommittedBytes: number | null,
): StoreMemoryBreakdown
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>decodeStoreMemoryStats</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
