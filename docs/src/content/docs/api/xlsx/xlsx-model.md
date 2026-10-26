---
title: "XlsxModel | @sheetwrite/xlsx"
description: "Implementation-neutral first-sheet table export model."
---
<!-- api-export:@sheetwrite/xlsx|.|XlsxModel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/xlsx/">@sheetwrite/xlsx</a><span class="api-status" data-kind="interface">interface</span></div>

Implementation-neutral first-sheet table export model.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/xlsx/src/table-export.ts#L23"><code>packages/xlsx/src/table-export.ts#L23</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-model-sheet-name" data-pagefind-weight="1">
<summary><code>sheetName</code></summary>

```ts generated
sheetName: string;
```

</details>

<details class="api-member" id="xlsx-model-column-widths" data-pagefind-weight="1">
<summary><code>columnWidths</code></summary>

```ts generated
columnWidths: number[];
```

</details>

<details class="api-member" id="xlsx-model-row-heights" data-pagefind-weight="1">
<summary><code>rowHeights</code></summary>

```ts generated
rowHeights: (number | undefined)[];
```

</details>

<details class="api-member" id="xlsx-model-rows" data-pagefind-weight="1">
<summary><code>rows</code></summary>

```ts generated
rows: (XlsxModelCell | null)[][];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxModel {
  sheetName: string;
  columnWidths: number[];
  rowHeights: (number | undefined)[];
  rows: (XlsxModelCell | null)[][];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/xlsx</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>XlsxModel</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/xlsx/build-xlsx-model/"><code>buildXlsxModel</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
</ul>
</div>
