---
title: "WorkbookTableXmlElement | @sheetwrite/core"
description: "Bounded OOXML table-rule metadata."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableXmlElement -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Bounded OOXML table-rule metadata. Names are unprefixed SpreadsheetML element
names, not markup; the XLSX writer escapes text and attribute values. Keeping
the rule tree avoids flattening date groups, custom filters or sort options
into Sheetwrite's independently evaluated worksheet filters.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/table.ts#L13"><code>packages/core/src/types/table.ts#L13</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-xml-element-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="workbook-table-xml-element-attributes" data-pagefind-weight="1">
<summary><code>attributes</code></summary>

```ts generated
attributes: Record<string, string>;
```

</details>

<details class="api-member" id="workbook-table-xml-element-text" data-pagefind-weight="1">
<summary><code>text</code></summary>

```ts generated
text: string;
```

</details>

<details class="api-member" id="workbook-table-xml-element-children" data-pagefind-weight="1">
<summary><code>children</code></summary>

```ts generated
children: WorkbookTableXmlElement[];
```

</details>

<details class="api-member" id="workbook-table-xml-element-differential-style" data-pagefind-weight="1">
<summary><code>differentialStyle</code> <span class="api-member-summary">Style behind a color filter/sort rule; dxfId is regenerated on export.</span></summary>

```ts generated
differentialStyle?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface WorkbookTableXmlElement {
  name: string;
  attributes: Record<string, string>;
  text: string;
  children: WorkbookTableXmlElement[];
  differentialStyle?: CellStyle;
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTableXmlElement</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/workbook-table/"><code>WorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-table-column/"><code>WorkbookTableColumn</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-table-patch/"><code>WorkbookTablePatch</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
