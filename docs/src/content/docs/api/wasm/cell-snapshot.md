---
title: "CellSnapshot | @sheetwrite/wasm"
description: "Resolved values of a sparse coordinate batch, one entry per requested cell."
---
<!-- api-export:@sheetwrite/wasm|.|CellSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm/">@sheetwrite/wasm</a><span class="api-status" data-kind="class">class</span></div>

Resolved values of a sparse coordinate batch, one entry per requested cell.

Every list holds one entry per cell, in the requested order. Text is stored
once: `text_index` names the cell's entry in `strings`, or `-1` when the cell
has no text, exactly like [`CellOut::string`] reports it.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/wasm/pkg/sheetwrite_wasm.d.ts#L24"><code>packages/wasm/pkg/sheetwrite_wasm.d.ts#L24</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="cell-snapshot-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="cell-snapshot-kinds" data-pagefind-weight="1">
<summary><code>kinds</code></summary>

```ts generated
kinds: Uint8Array<ArrayBufferLike>;
```

</details>

<details class="api-member" id="cell-snapshot-numbers" data-pagefind-weight="1">
<summary><code>numbers</code></summary>

```ts generated
numbers: Float64Array<ArrayBufferLike>;
```

</details>

<details class="api-member" id="cell-snapshot-strings" data-pagefind-weight="1">
<summary><code>strings</code></summary>

```ts generated
strings: string[];
```

</details>

<details class="api-member" id="cell-snapshot-styles" data-pagefind-weight="1">
<summary><code>styles</code></summary>

```ts generated
styles: Uint32Array<ArrayBufferLike>;
```

</details>

<details class="api-member" id="cell-snapshot-text-index" data-pagefind-weight="1">
<summary><code>textIndex</code> <span class="api-member-summary">Entry in [Self::strings] per cell, or -1 for a cell without text.</span></summary>

```ts generated
textIndex: Int32Array<ArrayBufferLike>
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class CellSnapshot {
  free: () => void;
  kinds: Uint8Array<ArrayBufferLike>;
  numbers: Float64Array<ArrayBufferLike>;
  strings: string[];
  styles: Uint32Array<ArrayBufferLike>;
  textIndex: Int32Array<ArrayBufferLike>;
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

<p class="api-consumers-label">Public exports naming <code>CellSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
<li><a href="/docs/api/wasm/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/wasm</span></li>
</ul>
</div>
