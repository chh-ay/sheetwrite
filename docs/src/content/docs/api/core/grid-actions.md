---
title: "GridActions | @sheetwrite/core"
description: "Imperative operations the toolbar and context menu bind to; also exposed as Grid.actions."
---
<!-- api-export:@sheetwrite/core|.|GridActions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Imperative operations the toolbar and context menu bind to; also exposed as `Grid.actions`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L138"><code>packages/core/src/types/grid.ts#L138</code></a></dd></div>
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
<a href="#grid-actions-set-borders"><code>setBorders</code></a>
<a href="#grid-actions-set-font-family"><code>setFontFamily</code></a>
<a href="#grid-actions-set-font-size"><code>setFontSize</code></a>
<a href="#grid-actions-step-font-size"><code>stepFontSize</code></a>
<a href="#grid-actions-set-vertical-align"><code>setVerticalAlign</code></a>
<a href="#grid-actions-toggle-wrap"><code>toggleWrap</code></a>
<a href="#grid-actions-set-number-format"><code>setNumberFormat</code></a>
<a href="#grid-actions-step-decimals"><code>stepDecimals</code></a>
<a href="#grid-actions-merge-and-center"><code>mergeAndCenter</code></a>
<a href="#grid-actions-clear-all"><code>clearAll</code></a>
<a href="#grid-actions-auto-sum"><code>autoSum</code></a>
<a href="#grid-actions-find"><code>find</code></a>
<a href="#grid-actions-freeze-panes"><code>freezePanes</code></a>
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
<a href="#grid-actions-edit-note"><code>editNote</code></a>
<a href="#grid-actions-delete-note"><code>deleteNote</code></a>
<a href="#grid-actions-undo"><code>undo</code></a>
<a href="#grid-actions-redo"><code>redo</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>49</span>

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
<summary><code>setTextColor</code> <span class="api-member-summary">Set the selection's text color; null returns it to automatic (the theme color).</span></summary>

```ts generated
setTextColor(color: string | null): void;
```

</details>

<details class="api-member" id="grid-actions-set-fill-color" data-pagefind-weight="1">
<summary><code>setFillColor</code> <span class="api-member-summary">Set the selection's fill; null removes it (Excel's &quot;No Fill&quot;).</span></summary>

```ts generated
setFillColor(color: string | null): void;
```

</details>

<details class="api-member" id="grid-actions-toggle-border" data-pagefind-weight="1">
<summary><code>toggleBorder</code></summary>

```ts generated
toggleBorder(): void;
```

</details>

<details class="api-member" id="grid-actions-set-borders" data-pagefind-weight="1">
<summary><code>setBorders</code> <span class="api-member-summary">Apply an Excel border preset to the selection.</span></summary>

```ts generated
setBorders(preset: BorderPreset): void;
```

<p class="api-member-doc">Apply an Excel border preset to the selection. Edge presets (`top`,
`bottom`, `left`, `right`, `outside`, `thickOutside`) touch only the
selection's outer cells and keep each cell's other sides.</p>
</details>

<details class="api-member" id="grid-actions-set-font-family" data-pagefind-weight="1">
<summary><code>setFontFamily</code> <span class="api-member-summary">Set the selection's font family; null returns it to the column/theme font.</span></summary>

```ts generated
setFontFamily(family: string | null): void;
```

</details>

<details class="api-member" id="grid-actions-set-font-size" data-pagefind-weight="1">
<summary><code>setFontSize</code> <span class="api-member-summary">Set the selection's font size in CSS pixels; null returns it to the default.</span></summary>

```ts generated
setFontSize(size: number | null): void;
```

</details>

<details class="api-member" id="grid-actions-step-font-size" data-pagefind-weight="1">
<summary><code>stepFontSize</code> <span class="api-member-summary">Step the focus cell's font size to the next larger (1) or smaller (-1) standard size.</span></summary>

```ts generated
stepFontSize(direction: 1 | -1): void;
```

</details>

<details class="api-member" id="grid-actions-set-vertical-align" data-pagefind-weight="1">
<summary><code>setVerticalAlign</code></summary>

```ts generated
setVerticalAlign(align: CellVerticalAlign): void;
```

</details>

<details class="api-member" id="grid-actions-toggle-wrap" data-pagefind-weight="1">
<summary><code>toggleWrap</code></summary>

```ts generated
toggleWrap(): void;
```

</details>

<details class="api-member" id="grid-actions-set-number-format" data-pagefind-weight="1">
<summary><code>setNumberFormat</code> <span class="api-member-summary">Set the selection's number format; null returns it to the column's format.</span></summary>

```ts generated
setNumberFormat(code: string | null): void;
```

</details>

<details class="api-member" id="grid-actions-step-decimals" data-pagefind-weight="1">
<summary><code>stepDecimals</code> <span class="api-member-summary">Show one more (1) or one fewer (-1) decimal place than the focus cell does.</span></summary>

```ts generated
stepDecimals(direction: 1 | -1): void;
```

</details>

<details class="api-member" id="grid-actions-merge-and-center" data-pagefind-weight="1">
<summary><code>mergeAndCenter</code> <span class="api-member-summary">Merge the selection and center its text, as one undoable step.</span></summary>

```ts generated
mergeAndCenter(): void;
```

</details>

<details class="api-member" id="grid-actions-clear-all" data-pagefind-weight="1">
<summary><code>clearAll</code> <span class="api-member-summary">Clear the selection's contents and formatting, as one undoable step.</span></summary>

```ts generated
clearAll(): void;
```

</details>

<details class="api-member" id="grid-actions-auto-sum" data-pagefind-weight="1">
<summary><code>autoSum</code> <span class="api-member-summary">Put =SUM(...) in the focus cell over the contiguous numbers directly above it, or to its left when there are none above.</span></summary>

```ts generated
autoSum(): void;
```

</details>

<details class="api-member" id="grid-actions-find" data-pagefind-weight="1">
<summary><code>find</code> <span class="api-member-summary">Open the built-in find bar when it is enabled.</span></summary>

```ts generated
find(): void;
```

</details>

<details class="api-member" id="grid-actions-freeze-panes" data-pagefind-weight="1">
<summary><code>freezePanes</code> <span class="api-member-summary">Freeze rows above and columns left of the focus cell in view coordinates.</span></summary>

```ts generated
freezePanes(): void;
```

<p class="api-member-doc">Freeze rows above and columns left of the focus cell in view coordinates.
Does nothing without a selection; focusing A1 unfreezes both axes.</p>
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
<summary><code>exportCsv</code> <span class="api-member-summary">Download the active sheet as CSV.</span></summary>

```ts generated
exportCsv(filename?: string): void;
```

<p class="api-member-doc">Download the active sheet as CSV. Never throws; a failure emits `export-error`.</p>
</details>

<details class="api-member" id="grid-actions-export-xlsx" data-pagefind-weight="1">
<summary><code>exportXlsx</code> <span class="api-member-summary">Download the active sheet as XLSX.</span></summary>

```ts generated
exportXlsx(filename?: string): Promise<void>;
```

<p class="api-member-doc">Download the active sheet as XLSX. Resolves when the download starts and never
rejects; a failure emits `export-error`.</p>
</details>

<details class="api-member" id="grid-actions-edit-note" data-pagefind-weight="1">
<summary><code>editNote</code> <span class="api-member-summary">Open the note editor on the focus cell, with its note or empty for a new one.</span></summary>

```ts generated
editNote(): void;
```

<p class="api-member-doc">Open the note editor on the focus cell, with its note or empty for a new
one. Ctrl or Cmd+Enter and leaving the editor save; Escape cancels. Does
nothing on a read-only grid.</p>
</details>

<details class="api-member" id="grid-actions-delete-note" data-pagefind-weight="1">
<summary><code>deleteNote</code> <span class="api-member-summary">Remove the focus cell's note as one undoable step.</span></summary>

```ts generated
deleteNote(): void;
```

<p class="api-member-doc">Remove the focus cell's note as one undoable step. Does nothing when it has
none. Does nothing on a read-only grid.</p>
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
  setTextColor(color: string | null): void;
  setFillColor(color: string | null): void;
  toggleBorder(): void;
  setBorders(preset: BorderPreset): void;
  setFontFamily(family: string | null): void;
  setFontSize(size: number | null): void;
  stepFontSize(direction: 1 | -1): void;
  setVerticalAlign(align: CellVerticalAlign): void;
  toggleWrap(): void;
  setNumberFormat(code: string | null): void;
  stepDecimals(direction: 1 | -1): void;
  mergeAndCenter(): void;
  clearAll(): void;
  autoSum(): void;
  find(): void;
  freezePanes(): void;
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
  exportXlsx(filename?: string): Promise<void>;
  editNote(): void;
  deleteNote(): void;
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
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
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
