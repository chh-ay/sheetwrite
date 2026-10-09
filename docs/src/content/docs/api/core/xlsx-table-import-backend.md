---
title: "XlsxTableImportBackend | @sheetwrite/core"
description: "Pluggable table import backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxTableImportBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Pluggable table import backend. Parses raw `.xlsx` bytes into the same
`ColumnarData` shape `fromCsv` returns, so host ingestion code can stay
format-agnostic.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L372"><code>packages/core/src/export.ts#L372</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-table-import-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-table-import-backend-from-xlsx-table" data-pagefind-weight="1">
<summary><code>fromXlsxTable</code></summary>

```ts generated
fromXlsxTable( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise<ColumnarData>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxTableImportBackend {
  name: string;
  fromXlsxTable(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<ColumnarData>;
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

<p class="api-consumers-label">Public exports naming <code>XlsxTableImportBackend</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/set-xlsx-table-import-backend/"><code>setXlsxTableImportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/xlsx/sheetwrite-table-import-backend/"><code>sheetwriteTableImportBackend</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
</ul>
</div>
