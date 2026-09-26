---
title: "SimpleColumn | @sheetwrite/vue"
description: "Column definition accepted by the adapters’ simple row-object API."
---
<!-- api-export:@sheetwrite/vue|.|SimpleColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Column definition accepted by the adapters’ simple row-object API.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/dist/adapter.d.ts#L110"><code>packages/core/dist/adapter.d.ts#L110</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#simple-column-key"><code>key</code></a>
<a href="#simple-column-title"><code>title</code></a>
<a href="#simple-column-width"><code>width</code></a>
<a href="#simple-column-type"><code>type</code></a>
<a href="#simple-column-number-format"><code>numberFormat</code></a>
<a href="#simple-column-header-style"><code>headerStyle</code></a>
<a href="#simple-column-editor"><code>editor</code></a>
<a href="#simple-column-cell-style"><code>cellStyle</code></a>
<a href="#simple-column-visible"><code>visible</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="simple-column-key" data-pagefind-weight="1">
<summary><code>key</code> <span class="api-member-summary">Non-empty row-object key, unique within the column list.</span></summary>

```ts generated
key: keyof Row & string;
```

</details>

<details class="api-member" id="simple-column-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Semantic title painted in data-grid mode and written by table exports.</span></summary>

```ts generated
title: string;
```

</details>

<details class="api-member" id="simple-column-width" data-pagefind-weight="1">
<summary><code>width</code> <span class="api-member-summary">Unzoomed width in CSS pixels; defaults to 120.</span></summary>

```ts generated
width?: number;
```

</details>

<details class="api-member" id="simple-column-type" data-pagefind-weight="1">
<summary><code>type</code> <span class="api-member-summary">Input and formatting type; defaults to text.</span></summary>

```ts generated
type?: CellFormat;
```

</details>

<details class="api-member" id="simple-column-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code> <span class="api-member-summary">Excel number-format code used for number, date, or currency display.</span></summary>

```ts generated
numberFormat?: string;
```

</details>

<details class="api-member" id="simple-column-header-style" data-pagefind-weight="1">
<summary><code>headerStyle</code> <span class="api-member-summary">Style applied to the painted column header.</span></summary>

```ts generated
headerStyle?: CellStyle;
```

</details>

<details class="api-member" id="simple-column-editor" data-pagefind-weight="1">
<summary><code>editor</code> <span class="api-member-summary">Name of a custom editor registered through GridOptions.editors.</span></summary>

```ts generated
editor?: string;
```

</details>

<details class="api-member" id="simple-column-cell-style" data-pagefind-weight="1">
<summary><code>cellStyle</code> <span class="api-member-summary">Base style merged beneath cell-specific styles.</span></summary>

```ts generated
cellStyle?: CellStyle;
```

</details>

<details class="api-member" id="simple-column-visible" data-pagefind-weight="1">
<summary><code>visible</code> <span class="api-member-summary">Set to false to exclude the column from the live view and table exports.</span></summary>

```ts generated
visible?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SimpleColumn<Row extends Record<string, CellScalar>> {
  key: keyof Row & string;
  title: string;
  width?: number;
  type?: CellFormat;
  numberFormat?: string;
  headerStyle?: CellStyle;
  editor?: string;
  cellStyle?: CellStyle;
  visible?: boolean;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SimpleColumn</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/simple-sheetwrite-options/"><code>SimpleSheetwriteOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite-props/"><code>SheetwriteProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
