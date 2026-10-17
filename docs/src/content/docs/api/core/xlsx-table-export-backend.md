---
title: "XlsxTableExportBackend | @sheetwrite/core"
description: "Pluggable first-row-header, first-sheet table export backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxTableExportBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pluggable first-row-header, first-sheet table export backend.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L323"><code>packages/core/src/export.ts#L323</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-table-export-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-table-export-backend-to-xlsx-table" data-pagefind-weight="1">
<summary><code>toXlsxTable</code></summary>

```ts generated
toXlsxTable(workbook: Workbook, store: Store, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxTableExportBackend {
  name: string;
  toXlsxTable(
    workbook: Workbook,
    store: Store,
    options?: XlsxWorkbookOptions,
  ): Promise<Uint8Array>;
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

<p class="api-consumers-label">Public exports naming <code>XlsxTableExportBackend</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/set-xlsx-table-export-backend/"><code>setXlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/xlsx/sheetwrite-table-export-backend/"><code>sheetwriteTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
</ul>
</div>
