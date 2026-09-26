---
title: "BoundaryOperationStats | @sheetwrite/core"
description: "Fixed-cardinality boundary crossing counters for one operation."
---
<!-- api-export:@sheetwrite/core|.|BoundaryOperationStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Fixed-cardinality boundary crossing counters for one operation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/resource-accounting.ts#L72"><code>packages/core/src/resource-accounting.ts#L72</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#boundary-operation-stats-operation"><code>operation</code></a>
<a href="#boundary-operation-stats-ffi-calls"><code>ffiCalls</code></a>
<a href="#boundary-operation-stats-js-to-wasm-bytes"><code>jsToWasmBytes</code></a>
<a href="#boundary-operation-stats-wasm-to-js-bytes"><code>wasmToJsBytes</code></a>
<a href="#boundary-operation-stats-largest-transfer-bytes"><code>largestTransferBytes</code></a>
<a href="#boundary-operation-stats-bulk-calls"><code>bulkCalls</code></a>
<a href="#boundary-operation-stats-scalar-calls"><code>scalarCalls</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="boundary-operation-stats-operation" data-pagefind-weight="1">
<summary><code>operation</code></summary>

```ts generated
readonly operation: RuntimeResourceOperation;
```

</details>

<details class="api-member" id="boundary-operation-stats-ffi-calls" data-pagefind-weight="1">
<summary><code>ffiCalls</code></summary>

```ts generated
readonly ffiCalls: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-js-to-wasm-bytes" data-pagefind-weight="1">
<summary><code>jsToWasmBytes</code></summary>

```ts generated
readonly jsToWasmBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-wasm-to-js-bytes" data-pagefind-weight="1">
<summary><code>wasmToJsBytes</code></summary>

```ts generated
readonly wasmToJsBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-largest-transfer-bytes" data-pagefind-weight="1">
<summary><code>largestTransferBytes</code></summary>

```ts generated
readonly largestTransferBytes: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-bulk-calls" data-pagefind-weight="1">
<summary><code>bulkCalls</code></summary>

```ts generated
readonly bulkCalls: number;
```

</details>

<details class="api-member" id="boundary-operation-stats-scalar-calls" data-pagefind-weight="1">
<summary><code>scalarCalls</code></summary>

```ts generated
readonly scalarCalls: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface BoundaryOperationStats {
  readonly operation: RuntimeResourceOperation;
  readonly ffiCalls: number;
  readonly jsToWasmBytes: number;
  readonly wasmToJsBytes: number;
  readonly largestTransferBytes: number;
  readonly bulkCalls: number;
  readonly scalarCalls: number;
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

<p class="api-consumers-label">Public exports naming <code>BoundaryOperationStats</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-runtime-resource-snapshot/"><code>createRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/runtime-resource-snapshot/"><code>RuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
