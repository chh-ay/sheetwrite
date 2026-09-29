---
title: "StoreMemoryBreakdown | @sheetwrite/core"
description: "Decoded, fail-closed retained-memory ownership report from the WASM store."
---
<!-- api-export:@sheetwrite/core|.|StoreMemoryBreakdown -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Decoded, fail-closed retained-memory ownership report from the WASM store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/resource-accounting.ts#L58"><code>packages/core/src/resource-accounting.ts#L58</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#store-memory-breakdown-protocol-version"><code>protocolVersion</code></a>
<a href="#store-memory-breakdown-hash-table-estimate-version"><code>hashTableEstimateVersion</code></a>
<a href="#store-memory-breakdown-owners"><code>owners</code></a>
<a href="#store-memory-breakdown-logical-live-bytes"><code>logicalLiveBytes</code></a>
<a href="#store-memory-breakdown-allocated-capacity-bytes"><code>allocatedCapacityBytes</code></a>
<a href="#store-memory-breakdown-wasm-committed-bytes"><code>wasmCommittedBytes</code></a>
<a href="#store-memory-breakdown-allocator-margin-bytes"><code>allocatorMarginBytes</code></a>
<a href="#store-memory-breakdown-unaccounted-bytes"><code>unaccountedBytes</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>8</span>

<div class="api-member-list">

<details class="api-member" id="store-memory-breakdown-protocol-version" data-pagefind-weight="1">
<summary><code>protocolVersion</code></summary>

```ts generated
readonly protocolVersion: typeof STORE_MEMORY_PROTOCOL_VERSION;
```

</details>

<details class="api-member" id="store-memory-breakdown-hash-table-estimate-version" data-pagefind-weight="1">
<summary><code>hashTableEstimateVersion</code></summary>

```ts generated
readonly hashTableEstimateVersion: typeof STORE_MEMORY_HASH_ESTIMATE_VERSION;
```

</details>

<details class="api-member" id="store-memory-breakdown-owners" data-pagefind-weight="1">
<summary><code>owners</code></summary>

```ts generated
readonly owners: readonly ResourceOwnerBytes[];
```

</details>

<details class="api-member" id="store-memory-breakdown-logical-live-bytes" data-pagefind-weight="1">
<summary><code>logicalLiveBytes</code></summary>

```ts generated
readonly logicalLiveBytes: number;
```

</details>

<details class="api-member" id="store-memory-breakdown-allocated-capacity-bytes" data-pagefind-weight="1">
<summary><code>allocatedCapacityBytes</code></summary>

```ts generated
readonly allocatedCapacityBytes: number;
```

</details>

<details class="api-member" id="store-memory-breakdown-wasm-committed-bytes" data-pagefind-weight="1">
<summary><code>wasmCommittedBytes</code> <span class="api-member-summary">Linear-memory pages are a runtime observation and are never summed into live payload.</span></summary>

```ts generated
readonly wasmCommittedBytes: number | null;
```

</details>

<details class="api-member" id="store-memory-breakdown-allocator-margin-bytes" data-pagefind-weight="1">
<summary><code>allocatorMarginBytes</code> <span class="api-member-summary">Allocator internals are intentionally not fabricated from sizeofval.</span></summary>

```ts generated
readonly allocatorMarginBytes: number | null;
```

<p class="api-member-doc">Allocator internals are intentionally not fabricated from `size_of_val`.</p>
</details>

<details class="api-member" id="store-memory-breakdown-unaccounted-bytes" data-pagefind-weight="1">
<summary><code>unaccountedBytes</code></summary>

```ts generated
readonly unaccountedBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface StoreMemoryBreakdown {
  readonly protocolVersion: typeof STORE_MEMORY_PROTOCOL_VERSION;
  readonly hashTableEstimateVersion: typeof STORE_MEMORY_HASH_ESTIMATE_VERSION;
  readonly owners: readonly ResourceOwnerBytes[];
  readonly logicalLiveBytes: number;
  readonly allocatedCapacityBytes: number;
  readonly wasmCommittedBytes: number | null;
  readonly allocatorMarginBytes: number | null;
  readonly unaccountedBytes: number;
}
```

</details>

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

<p class="api-consumers-label">Public exports naming <code>StoreMemoryBreakdown</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-runtime-resource-snapshot/"><code>createRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/decode-store-memory-stats/"><code>decodeStoreMemoryStats</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/empty-store-memory-stats/"><code>emptyStoreMemoryStats</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/runtime-resource-snapshot/"><code>RuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
