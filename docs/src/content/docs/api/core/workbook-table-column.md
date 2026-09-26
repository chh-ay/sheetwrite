---
title: "WorkbookTableColumn | @sheetwrite/core"
description: "Stable identity and display metadata for one ordered table column."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Stable identity and display metadata for one ordered table column.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/table.ts#L7"><code>packages/core/src/types/table.ts#L7</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-column-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="workbook-table-column-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Case-insensitively unique within the table.</span></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="workbook-table-column-totals-row-label" data-pagefind-weight="1">
<summary><code>totalsRowLabel</code> <span class="api-member-summary">Optional text written in the totals row.</span></summary>

```ts generated
totalsRowLabel?: string;
```

<p class="api-member-doc">Optional text written in the totals row. Formula cells remain authoritative cell sources.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface WorkbookTableColumn {
  id: string;
  name: string;
  totalsRowLabel?: string;
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTableColumn</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/workbook-table/"><code>WorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-table-patch/"><code>WorkbookTablePatch</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
