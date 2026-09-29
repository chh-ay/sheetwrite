---
title: "GridActions | @sheetwrite/core"
description: "Imperative operations the toolbar and context menu bind to; also exposed as Grid.actions."
---
<!-- api-export:@sheetwrite/core|.|GridActions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Imperative operations the toolbar and context menu bind to; also exposed as `Grid.actions`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L120"><code>packages/core/src/types/grid.ts#L120</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-actions-toggle-bold"><code>toggleBold</code></a>
<a href="#grid-actions-toggle-italic"><code>toggleItalic</code></a>
<a href="#grid-actions-toggle-underline"><code>toggleUnderline</code></a>
<a href="#grid-actions-toggle-strikethrough"><code>toggleStrikethrough</code></a>
<a href="#grid-actions-set-align"><code>setAlign</code></a>
<a href="#grid-actions-set-text-color"><code>setTextColor</code></a>
<a href="#grid-actions-set-fill-color"><code>setFillColor</code></a>
<a href="#grid-actions-toggle-border"><code>toggleBorder</code></a>
<a href="#grid-actions-clear-format"><code>clearFormat</code></a>
<a href="#grid-actions-merge"><code>merge</code></a>
<a href="#grid-actions-unmerge"><code>unmerge</code></a>
<a href="#grid-actions-sort"><code>sort</code></a>
<a href="#grid-actions-insert-row-above"><code>insertRowAbove</code></a>
<a href="#grid-actions-insert-row-below"><code>insertRowBelow</code></a>
<a href="#grid-actions-delete-row"><code>deleteRow</code></a>
<a href="#grid-actions-insert-column-left"><code>insertColumnLeft</code></a>
<a href="#grid-actions-insert-column-right"><code>insertColumnRight</code></a>
<a href="#grid-actions-delete-column"><code>deleteColumn</code></a>
<a href="#grid-actions-hide-rows"><code>hideRows</code></a>
<a href="#grid-actions-show-rows"><code>showRows</code></a>
<a href="#grid-actions-auto-fit-rows"><code>autoFitRows</code></a>
<a href="#grid-actions-hide-columns"><code>hideColumns</code></a>
<a href="#grid-actions-show-columns"><code>showColumns</code></a>
<a href="#grid-actions-auto-fit-columns"><code>autoFitColumns</code></a>
<a href="#grid-actions-clear-filter"><code>clearFilter</code></a>
<a href="#grid-actions-copy"><code>copy</code></a>
<a href="#grid-actions-cut"><code>cut</code></a>
<a href="#grid-actions-paste"><code>paste</code></a>
<a href="#grid-actions-paste-values"><code>pasteValues</code></a>
<a href="#grid-actions-clear-contents"><code>clearContents</code></a>
<a href="#grid-actions-export-csv"><code>exportCsv</code></a>
<a href="#grid-actions-export-xlsx"><code>exportXlsx</code></a>
<a href="#grid-actions-undo"><code>undo</code></a>
<a href="#grid-actions-redo"><code>redo</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>34</span>

<div class="api-member-list">

<details class="api-member" id="grid-actions-toggle-bold" data-pagefind-weight="1">
<summary><code>toggleBold</code></summary>

```ts generated
toggleBold(): void;
```

</details>

<details class="api-member" id="grid-actions-toggle-italic" data-pagefind-weight="1">
<summary><code>toggleItalic</code></summary>

```ts generated
toggleItalic(): void;
```

</details>

<details class="api-member" id="grid-actions-toggle-underline" data-pagefind-weight="1">
<summary><code>toggleUnderline</code></summary>

```ts generated
toggleUnderline(): void;
```

</details>

<details class="api-member" id="grid-actions-toggle-strikethrough" data-pagefind-weight="1">
<summary><code>toggleStrikethrough</code></summary>

```ts generated
toggleStrikethrough(): void;
```

</details>

<details class="api-member" id="grid-actions-set-align" data-pagefind-weight="1">
<summary><code>setAlign</code></summary>

```ts generated
setAlign(align: CellAlign): void;
```

</details>

<details class="api-member" id="grid-actions-set-text-color" data-pagefind-weight="1">
<summary><code>setTextColor</code></summary>

```ts generated
setTextColor(color: string): void;
```

</details>

<details class="api-member" id="grid-actions-set-fill-color" data-pagefind-weight="1">
<summary><code>setFillColor</code></summary>

```ts generated
setFillColor(color: string): void;
```

</details>

<details class="api-member" id="grid-actions-toggle-border" data-pagefind-weight="1">
<summary><code>toggleBorder</code></summary>

```ts generated
toggleBorder(): void;
```

</details>

<details class="api-member" id="grid-actions-clear-format" data-pagefind-weight="1">
<summary><code>clearFormat</code></summary>

```ts generated
clearFormat(): void;
```

</details>

<details class="api-member" id="grid-actions-merge" data-pagefind-weight="1">
<summary><code>merge</code></summary>

```ts generated
merge(): void;
```

</details>

<details class="api-member" id="grid-actions-unmerge" data-pagefind-weight="1">
<summary><code>unmerge</code></summary>

```ts generated
unmerge(): void;
```

</details>

<details class="api-member" id="grid-actions-sort" data-pagefind-weight="1">
<summary><code>sort</code></summary>

```ts generated
sort(ascending: boolean): void;
```

</details>

<details class="api-member" id="grid-actions-insert-row-above" data-pagefind-weight="1">
<summary><code>insertRowAbove</code></summary>

```ts generated
insertRowAbove(): void;
```

</details>

<details class="api-member" id="grid-actions-insert-row-below" data-pagefind-weight="1">
<summary><code>insertRowBelow</code></summary>

```ts generated
insertRowBelow(): void;
```

</details>

<details class="api-member" id="grid-actions-delete-row" data-pagefind-weight="1">
<summary><code>deleteRow</code></summary>

```ts generated
deleteRow(): void;
```

</details>

<details class="api-member" id="grid-actions-insert-column-left" data-pagefind-weight="1">
<summary><code>insertColumnLeft</code></summary>

```ts generated
insertColumnLeft(): void;
```

</details>

<details class="api-member" id="grid-actions-insert-column-right" data-pagefind-weight="1">
<summary><code>insertColumnRight</code></summary>

```ts generated
insertColumnRight(): void;
```

</details>

<details class="api-member" id="grid-actions-delete-column" data-pagefind-weight="1">
<summary><code>deleteColumn</code></summary>

```ts generated
deleteColumn(): void;
```

</details>

<details class="api-member" id="grid-actions-hide-rows" data-pagefind-weight="1">
<summary><code>hideRows</code></summary>

```ts generated
hideRows(rows?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-actions-show-rows" data-pagefind-weight="1">
<summary><code>showRows</code></summary>

```ts generated
showRows(rows?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-actions-auto-fit-rows" data-pagefind-weight="1">
<summary><code>autoFitRows</code></summary>

```ts generated
autoFitRows(): void;
```

</details>

<details class="api-member" id="grid-actions-hide-columns" data-pagefind-weight="1">
<summary><code>hideColumns</code></summary>

```ts generated
hideColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-actions-show-columns" data-pagefind-weight="1">
<summary><code>showColumns</code></summary>

```ts generated
showColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-actions-auto-fit-columns" data-pagefind-weight="1">
<summary><code>autoFitColumns</code></summary>

```ts generated
autoFitColumns(cols?: readonly number[]): void;
```

</details>

<details class="api-member" id="grid-actions-clear-filter" data-pagefind-weight="1">
<summary><code>clearFilter</code></summary>

```ts generated
clearFilter(col?: number): void;
```

</details>

<details class="api-member" id="grid-actions-copy" data-pagefind-weight="1">
<summary><code>copy</code> <span class="api-member-summary">Copy the focused rectangle to the system clipboard.</span></summary>

```ts generated
copy(): Promise<ClipboardOutcome>;
```

<p class="api-member-doc">Copy the focused rectangle to the system clipboard. Never rejects.</p>
</details>

<details class="api-member" id="grid-actions-cut" data-pagefind-weight="1">
<summary><code>cut</code> <span class="api-member-summary">Copy + clear the source (after the clipboard accepted).</span></summary>

```ts generated
cut(): Promise<ClipboardOutcome>;
```

<p class="api-member-doc">Copy + clear the source (after the clipboard accepted). Never rejects.</p>
</details>

<details class="api-member" id="grid-actions-paste" data-pagefind-weight="1">
<summary><code>paste</code> <span class="api-member-summary">Paste at the focus cell. Never rejects.</span></summary>

```ts generated
paste(): Promise<ClipboardOutcome>;
```

</details>

<details class="api-member" id="grid-actions-paste-values" data-pagefind-weight="1">
<summary><code>pasteValues</code> <span class="api-member-summary">Paste keeping only resolved values — no formulas, no styles (Ctrl+Shift+V).</span></summary>

```ts generated
pasteValues(): Promise<ClipboardOutcome>;
```

<p class="api-member-doc">Paste keeping only resolved values — no formulas, no styles (Ctrl+Shift+V). Never rejects.</p>
</details>

<details class="api-member" id="grid-actions-clear-contents" data-pagefind-weight="1">
<summary><code>clearContents</code></summary>

```ts generated
clearContents(): void;
```

</details>

<details class="api-member" id="grid-actions-export-csv" data-pagefind-weight="1">
<summary><code>exportCsv</code></summary>

```ts generated
exportCsv(filename?: string): void;
```

</details>

<details class="api-member" id="grid-actions-export-xlsx" data-pagefind-weight="1">
<summary><code>exportXlsx</code></summary>

```ts generated
exportXlsx(filename?: string): void;
```

</details>

<details class="api-member" id="grid-actions-undo" data-pagefind-weight="1">
<summary><code>undo</code></summary>

```ts generated
undo(): void;
```

</details>

<details class="api-member" id="grid-actions-redo" data-pagefind-weight="1">
<summary><code>redo</code></summary>

```ts generated
redo(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridActions {
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrikethrough(): void;
  setAlign(align: CellAlign): void;
  setTextColor(color: string): void;
  setFillColor(color: string): void;
  toggleBorder(): void;
  clearFormat(): void;
  merge(): void;
  unmerge(): void;
  sort(ascending: boolean): void;
  insertRowAbove(): void;
  insertRowBelow(): void;
  deleteRow(): void;
  insertColumnLeft(): void;
  insertColumnRight(): void;
  deleteColumn(): void;
  hideRows(rows?: readonly number[]): void;
  showRows(rows?: readonly number[]): void;
  autoFitRows(): void;
  hideColumns(cols?: readonly number[]): void;
  showColumns(cols?: readonly number[]): void;
  autoFitColumns(cols?: readonly number[]): void;
  clearFilter(col?: number): void;
  copy(): Promise<ClipboardOutcome>;
  cut(): Promise<ClipboardOutcome>;
  paste(): Promise<ClipboardOutcome>;
  pasteValues(): Promise<ClipboardOutcome>;
  clearContents(): void;
  exportCsv(filename?: string): void;
  exportXlsx(filename?: string): void;
  undo(): void;
  redo(): void;
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

<p class="api-consumers-label">Public exports naming <code>GridActions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
