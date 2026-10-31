---
title: "SourceSnapshot | @sheetwrite/wasm"
description: "SourceSnapshot class in @sheetwrite/wasm: Compact serializable projection of persisted derived-cell sources and spill identity in one range."
---
<!-- api-export:@sheetwrite/wasm|.|SourceSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Compact serializable projection of persisted derived-cell sources and spill
identity in one range. Offsets are row-major and sorted; reference targets
are packed `[sheet_handle, row, col]` triples.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/pkg/sheetwrite_wasm.d.ts#L472"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L472</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="source-snapshot-formula-offsets" data-pagefind-weight="1">
<summary><code>formulaOffsets</code></summary>

```ts generated
formulaOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-formula-sources" data-pagefind-weight="1">
<summary><code>formulaSources</code></summary>

```ts generated
formulaSources: () => string[];
```

</details>

<details class="api-member" id="source-snapshot-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="source-snapshot-reference-offsets" data-pagefind-weight="1">
<summary><code>referenceOffsets</code></summary>

```ts generated
referenceOffsets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-reference-targets" data-pagefind-weight="1">
<summary><code>referenceTargets</code></summary>

```ts generated
referenceTargets: () => Uint32Array;
```

</details>

<details class="api-member" id="source-snapshot-spill-derived" data-pagefind-weight="1">
<summary><code>spillDerived</code></summary>

```ts generated
spillDerived: () => Uint8Array
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class SourceSnapshot {
  formulaOffsets: () => Uint32Array;
  formulaSources: () => string[];
  free: () => void;
  referenceOffsets: () => Uint32Array;
  referenceTargets: () => Uint32Array;
  spillDerived: () => Uint8Array;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/wasm</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/core</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SourceSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
