---
title: "XlsxModelCell | @sheetwrite/xlsx"
description: "Implementation-neutral cell in the first-sheet table export model."
---
<!-- api-export:@sheetwrite/xlsx|.|XlsxModelCell -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="interface">interface</span></div>

Implementation-neutral cell in the first-sheet table export model.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/xlsx/src/table-export.ts#L14"><code>packages/xlsx/src/table-export.ts#L14</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-model-cell-value" data-pagefind-weight="1">
<summary><code>value</code></summary>

```ts generated
value: CellScalar;
```

</details>

<details class="api-member" id="xlsx-model-cell-style" data-pagefind-weight="1">
<summary><code>style</code></summary>

```ts generated
style?: CellStyle;
```

</details>

<details class="api-member" id="xlsx-model-cell-number-format" data-pagefind-weight="1">
<summary><code>numberFormat</code></summary>

```ts generated
numberFormat?: string;
```

</details>

<details class="api-member" id="xlsx-model-cell-column-span" data-pagefind-weight="1">
<summary><code>columnSpan</code></summary>

```ts generated
columnSpan?: number;
```

</details>

<details class="api-member" id="xlsx-model-cell-row-span" data-pagefind-weight="1">
<summary><code>rowSpan</code></summary>

```ts generated
rowSpan?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxModelCell {
  value: CellScalar;
  style?: CellStyle;
  numberFormat?: string;
  columnSpan?: number;
  rowSpan?: number;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/xlsx</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>XlsxModelCell</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/xlsx/xlsx-model/"><code>XlsxModel</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
</ul>
</div>
