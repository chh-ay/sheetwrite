---
title: "WorkbookTableStyle | @sheetwrite/core"
description: "Bounded native subset of ECMA-376 table style information."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableStyle -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Bounded native subset of ECMA-376 table style information.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/table.ts#L16"><code>packages/core/src/types/table.ts#L16</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-style-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name?: string;
```

</details>

<details class="api-member" id="workbook-table-style-show-first-column" data-pagefind-weight="1">
<summary><code>showFirstColumn</code></summary>

```ts generated
showFirstColumn?: boolean;
```

</details>

<details class="api-member" id="workbook-table-style-show-last-column" data-pagefind-weight="1">
<summary><code>showLastColumn</code></summary>

```ts generated
showLastColumn?: boolean;
```

</details>

<details class="api-member" id="workbook-table-style-show-row-stripes" data-pagefind-weight="1">
<summary><code>showRowStripes</code></summary>

```ts generated
showRowStripes?: boolean;
```

</details>

<details class="api-member" id="workbook-table-style-show-column-stripes" data-pagefind-weight="1">
<summary><code>showColumnStripes</code></summary>

```ts generated
showColumnStripes?: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface WorkbookTableStyle {
  name?: string;
  showFirstColumn?: boolean;
  showLastColumn?: boolean;
  showRowStripes?: boolean;
  showColumnStripes?: boolean;
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTableStyle</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/workbook-table/"><code>WorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-table-patch/"><code>WorkbookTablePatch</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
