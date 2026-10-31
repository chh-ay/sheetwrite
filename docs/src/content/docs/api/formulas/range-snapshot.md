---
title: "RangeSnapshot | @sheetwrite/formulas"
description: "RangeSnapshot class in @sheetwrite/formulas: Opaque, store-local history payload for one dense rectangular cell block."
---
<!-- api-export:@sheetwrite/formulas|.|RangeSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="class">class</span></div>

Opaque, store-local history payload for one dense rectangular cell block.

The host may retain this object in undo history, but it is deliberately not
part of the serialized document protocol. A deduplicated local dictionary
owns captured text independently of the store's pool epoch.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/formulas/pkg/sheetwrite_wasm.d.ts#L481"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L481</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#range-snapshot-byte-length"><code>byteLength</code></a>
<a href="#range-snapshot-export-memory-state"><code>exportMemoryState</code></a>
<a href="#range-snapshot-formula-offsets"><code>formulaOffsets</code></a>
<a href="#range-snapshot-formula-sources"><code>formulaSources</code></a>
<a href="#range-snapshot-free"><code>free</code></a>
<a href="#range-snapshot-kinds"><code>kinds</code></a>
<a href="#range-snapshot-reference-offsets"><code>referenceOffsets</code></a>
<a href="#range-snapshot-reference-targets"><code>referenceTargets</code></a>
<a href="#range-snapshot-style-ids"><code>styleIds</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="range-snapshot-byte-length" data-pagefind-weight="1">
<summary><code>byteLength</code></summary>

```ts generated
byteLength: () => number;
```

</details>

<details class="api-member" id="range-snapshot-export-memory-state" data-pagefind-weight="1">
<summary><code>exportMemoryState</code> <span class="api-member-summary">Transfer packed scalars and the local dictionary, never JS cell patches.</span></summary>

```ts generated
exportMemoryState: (sheet: number) => Uint8Array;
```

</details>

<details class="api-member" id="range-snapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>formulaOffsets</code></summary>

```ts generated
formulaOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-formula-sources" data-pagefind-weight="1">
<summary><code>formulaSources</code></summary>

```ts generated
formulaSources: () => string[];
```

</details>

<details class="api-member" id="range-snapshot-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="range-snapshot-kinds" data-pagefind-weight="1">
<summary><code>kinds</code></summary>

```ts generated
kinds: () => Uint8Array;
```

</details>

<details class="api-member" id="range-snapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>referenceOffsets</code></summary>

```ts generated
referenceOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-reference-targets" data-pagefind-weight="1">
<summary><code>referenceTargets</code></summary>

```ts generated
referenceTargets: () => Uint32Array;
```

</details>

<details class="api-member" id="range-snapshot-style-ids" data-pagefind-weight="1">
<summary><code>styleIds</code></summary>

```ts generated
styleIds: () => Uint32Array
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class RangeSnapshot {
  byteLength: () => number;
  exportMemoryState: (sheet: number) => Uint8Array;
  formulaOffsets: () => Uint32Array;
  formulaSources: () => string[];
  free: () => void;
  kinds: () => Uint8Array;
  referenceOffsets: () => Uint32Array;
  referenceTargets: () => Uint32Array;
  styleIds: () => Uint32Array;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>RangeSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
