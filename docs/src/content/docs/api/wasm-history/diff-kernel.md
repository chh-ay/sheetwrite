---
title: "DiffKernel | @sheetwrite/wasm/history"
description: "DiffKernel class in @sheetwrite/wasm/history: Diff state for one comparison."
---
<!-- api-export:@sheetwrite/wasm|./history|DiffKernel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/wasm-history/">@sheetwrite/wasm/history</a><span class="api-status" data-kind="class">class</span></div>

Diff state for one comparison. JavaScript creates one per request and
frees it when the request ends.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/wasm/pkg-history/sheetwrite_history.d.ts#L8"><code>packages/wasm/pkg-history/sheetwrite_history.d.ts#L8</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#diff-kernel-constructor"><code>constructor</code></a>
<a href="#diff-kernel-add-sheet"><code>addSheet</code></a>
<a href="#diff-kernel-cell-authors"><code>cellAuthors</code></a>
<a href="#diff-kernel-clear-page"><code>clearPage</code></a>
<a href="#diff-kernel-col-segments"><code>colSegments</code></a>
<a href="#diff-kernel-compare"><code>compare</code></a>
<a href="#diff-kernel-free"><code>free</code></a>
<a href="#diff-kernel-insert-cols"><code>insertCols</code></a>
<a href="#diff-kernel-insert-rows"><code>insertRows</code></a>
<a href="#diff-kernel-load-after"><code>loadAfter</code></a>
<a href="#diff-kernel-load-before"><code>loadBefore</code></a>
<a href="#diff-kernel-move-cols"><code>moveCols</code></a>
<a href="#diff-kernel-move-rows"><code>moveRows</code></a>
<a href="#diff-kernel-page-authors"><code>pageAuthors</code></a>
<a href="#diff-kernel-page-before-cols"><code>pageBeforeCols</code></a>
<a href="#diff-kernel-page-before-rows"><code>pageBeforeRows</code></a>
<a href="#diff-kernel-page-cols"><code>pageCols</code></a>
<a href="#diff-kernel-page-flags"><code>pageFlags</code></a>
<a href="#diff-kernel-page-length"><code>pageLength</code></a>
<a href="#diff-kernel-page-rows"><code>pageRows</code></a>
<a href="#diff-kernel-page-sheets"><code>pageSheets</code></a>
<a href="#diff-kernel-remove-cols"><code>removeCols</code></a>
<a href="#diff-kernel-remove-rows"><code>removeRows</code></a>
<a href="#diff-kernel-remove-sheet"><code>removeSheet</code></a>
<a href="#diff-kernel-row-segments"><code>rowSegments</code></a>
<a href="#diff-kernel-set-styles"><code>setStyles</code></a>
<a href="#diff-kernel-touch"><code>touch</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>27</span>

<div class="api-member-list">

<details class="api-member" id="diff-kernel-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(limit: number);
```

</details>

<details class="api-member" id="diff-kernel-add-sheet" data-pagefind-weight="1">
<summary><code>addSheet</code> <span class="api-member-summary">Track a sheet with rows by cols cells.</span></summary>

```ts generated
addSheet: (rows: number, cols: number, earlier: boolean) => number;
```

<p class="api-member-doc">Track a sheet with `rows` by `cols` cells. A sheet of the earlier
version starts with every line at its earlier position; a sheet added
later has no earlier lines. Returns the sheet's slot.</p>
</details>

<details class="api-member" id="diff-kernel-cell-authors" data-pagefind-weight="1">
<summary><code>cellAuthors</code> <span class="api-member-summary">Everyone who wrote a cell of the later version, in the order of their first write.</span></summary>

```ts generated
cellAuthors: (slot: number, row: number, col: number) => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-clear-page" data-pagefind-weight="1">
<summary><code>clearPage</code></summary>

```ts generated
clearPage: () => void;
```

</details>

<details class="api-member" id="diff-kernel-col-segments" data-pagefind-weight="1">
<summary><code>colSegments</code> <span class="api-member-summary">[start, length, earlier start] per column segment.</span></summary>

```ts generated
colSegments: (slot: number) => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-compare" data-pagefind-weight="1">
<summary><code>compare</code> <span class="api-member-summary">Compare a rows by cols piece of the loaded later window, at (piecerow, piececol) inside it, with the loaded earlier cells (or with nothing when earlier is false).</span></summary>

```ts generated
compare: (slot: number, earlier: boolean, piece_row: number, piece_col: number, rows: number, cols: number, row0: number, col0: number, before_row0: number, before_col0: number, from: number) => number;
```

<p class="api-member-doc">Compare a `rows` by `cols` piece of the loaded later window, at
`(piece_row, piece_col)` inside it, with the loaded earlier cells (or
with nothing when `earlier` is false). Cells are taken row by row from
ordinal `from`. `row0`, `col0` and `before_row0`, `before_col0` are
the sheet coordinates of the piece in each version. Returns the ordinal
of the next cell to compare: `rows * cols` when the piece is done, less
when the page filled up first.</p>
</details>

<details class="api-member" id="diff-kernel-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="diff-kernel-insert-cols" data-pagefind-weight="1">
<summary><code>insertCols</code></summary>

```ts generated
insertCols: (slot: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="diff-kernel-insert-rows" data-pagefind-weight="1">
<summary><code>insertRows</code></summary>

```ts generated
insertRows: (slot: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="diff-kernel-load-after" data-pagefind-weight="1">
<summary><code>loadAfter</code> <span class="api-member-summary">Decode one window of the later version.</span></summary>

```ts generated
loadAfter: (bytes: Uint8Array | number[]) => boolean;
```

<p class="api-member-doc">Decode one window of the later version. Returns `false` for bytes that
are not an engine range transfer.</p>
</details>

<details class="api-member" id="diff-kernel-load-before" data-pagefind-weight="1">
<summary><code>loadBefore</code> <span class="api-member-summary">Decode the earlier cells of the next piece.</span></summary>

```ts generated
loadBefore: (bytes: Uint8Array | number[]) => boolean;
```

<p class="api-member-doc">Decode the earlier cells of the next piece. Returns `false` for bytes
that are not an engine range transfer.</p>
</details>

<details class="api-member" id="diff-kernel-move-cols" data-pagefind-weight="1">
<summary><code>moveCols</code></summary>

```ts generated
moveCols: (slot: number, from: number, count: number, to: number) => void;
```

</details>

<details class="api-member" id="diff-kernel-move-rows" data-pagefind-weight="1">
<summary><code>moveRows</code></summary>

```ts generated
moveRows: (slot: number, from: number, count: number, to: number) => void;
```

</details>

<details class="api-member" id="diff-kernel-page-authors" data-pagefind-weight="1">
<summary><code>pageAuthors</code></summary>

```ts generated
pageAuthors: () => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-page-before-cols" data-pagefind-weight="1">
<summary><code>pageBeforeCols</code></summary>

```ts generated
pageBeforeCols: () => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-page-before-rows" data-pagefind-weight="1">
<summary><code>pageBeforeRows</code></summary>

```ts generated
pageBeforeRows: () => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-page-cols" data-pagefind-weight="1">
<summary><code>pageCols</code></summary>

```ts generated
pageCols: () => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-page-flags" data-pagefind-weight="1">
<summary><code>pageFlags</code></summary>

```ts generated
pageFlags: () => Uint8Array;
```

</details>

<details class="api-member" id="diff-kernel-page-length" data-pagefind-weight="1">
<summary><code>pageLength</code> <span class="api-member-summary">Changes written since the last clearPage.</span></summary>

```ts generated
pageLength: () => number;
```

</details>

<details class="api-member" id="diff-kernel-page-rows" data-pagefind-weight="1">
<summary><code>pageRows</code></summary>

```ts generated
pageRows: () => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-page-sheets" data-pagefind-weight="1">
<summary><code>pageSheets</code></summary>

```ts generated
pageSheets: () => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-remove-cols" data-pagefind-weight="1">
<summary><code>removeCols</code></summary>

```ts generated
removeCols: (slot: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="diff-kernel-remove-rows" data-pagefind-weight="1">
<summary><code>removeRows</code></summary>

```ts generated
removeRows: (slot: number, at: number, count: number) => void;
```

</details>

<details class="api-member" id="diff-kernel-remove-sheet" data-pagefind-weight="1">
<summary><code>removeSheet</code> <span class="api-member-summary">Stop tracking a removed sheet.</span></summary>

```ts generated
removeSheet: (slot: number) => void;
```

</details>

<details class="api-member" id="diff-kernel-row-segments" data-pagefind-weight="1">
<summary><code>rowSegments</code> <span class="api-member-summary">[start, length, earlier start] per row segment; the earlier start is 0xFFFFFFFF for inserted rows.</span></summary>

```ts generated
rowSegments: (slot: number) => Uint32Array;
```

</details>

<details class="api-member" id="diff-kernel-set-styles" data-pagefind-weight="1">
<summary><code>setStyles</code> <span class="api-member-summary">Content IDs for the style IDs of each version's store.</span></summary>

```ts generated
setStyles: (before: Uint32Array | number[], after: Uint32Array | number[]) => void;
```

</details>

<details class="api-member" id="diff-kernel-touch" data-pagefind-weight="1">
<summary><code>touch</code> <span class="api-member-summary">Record that author wrote rows r0..=r1 and columns c0..=c1.</span></summary>

```ts generated
touch: (slot: number, r0: number, c0: number, r1: number, c1: number, author: number) => void
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class DiffKernel {
  constructor(limit: number);
  addSheet: (rows: number, cols: number, earlier: boolean) => number;
  cellAuthors: (slot: number, row: number, col: number) => Uint32Array;
  clearPage: () => void;
  colSegments: (slot: number) => Uint32Array;
  compare: (
    slot: number,
    earlier: boolean,
    piece_row: number,
    piece_col: number,
    rows: number,
    cols: number,
    row0: number,
    col0: number,
    before_row0: number,
    before_col0: number,
    from: number,
  ) => number;
  free: () => void;
  insertCols: (slot: number, at: number, count: number) => void;
  insertRows: (slot: number, at: number, count: number) => void;
  loadAfter: (bytes: Uint8Array | number[]) => boolean;
  loadBefore: (bytes: Uint8Array | number[]) => boolean;
  moveCols: (slot: number, from: number, count: number, to: number) => void;
  moveRows: (slot: number, from: number, count: number, to: number) => void;
  pageAuthors: () => Uint32Array;
  pageBeforeCols: () => Uint32Array;
  pageBeforeRows: () => Uint32Array;
  pageCols: () => Uint32Array;
  pageFlags: () => Uint8Array;
  pageLength: () => number;
  pageRows: () => Uint32Array;
  pageSheets: () => Uint32Array;
  removeCols: (slot: number, at: number, count: number) => void;
  removeRows: (slot: number, at: number, count: number) => void;
  removeSheet: (slot: number) => void;
  rowSegments: (slot: number) => Uint32Array;
  setStyles: (
    before: Uint32Array | number[],
    after: Uint32Array | number[],
  ) => void;
  touch: (
    slot: number,
    r0: number,
    c0: number,
    r1: number,
    c1: number,
    author: number,
  ) => void;
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

<p class="api-consumers-label">Public exports naming <code>DiffKernel</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
