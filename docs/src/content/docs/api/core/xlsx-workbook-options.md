---
title: "XlsxWorkbookOptions | @sheetwrite/core"
description: "Shared options passed to every registered table and workbook XLSX backend."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Shared options passed to every registered table and workbook XLSX backend.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L407"><code>packages/core/src/export.ts#L407</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-options-signal" data-pagefind-weight="1">
<summary><code>signal</code> <span class="api-member-summary">Abort before or between bounded codec operations.</span></summary>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="xlsx-workbook-options-max-cells" data-pagefind-weight="1">
<summary><code>maxCells</code> <span class="api-member-summary">Cells accounted by the active conversion path; defaults to 1,000,000.</span></summary>

```ts generated
maxCells?: number;
```

</details>

<details class="api-member" id="xlsx-workbook-options-resource-limits" data-pagefind-weight="1">
<summary><code>resourceLimits</code> <span class="api-member-summary">Positive overrides for every XLSX resource dimension except maxCells.</span></summary>

```ts generated
resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
```

</details>

<details class="api-member" id="xlsx-workbook-options-on-warning" data-pagefind-weight="1">
<summary><code>onWarning</code></summary>

```ts generated
onWarning?: (warning: XlsxWorkbookWarning) => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxWorkbookOptions {
  signal?: AbortSignal;
  maxCells?: number;
  resourceLimits?: Partial<Omit<XlsxResourceLimits, "maxCells">>;
  onWarning?: (warning: XlsxWorkbookWarning) => void;
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

<p class="api-consumers-label">Public exports naming <code>XlsxWorkbookOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/from-xlsx-table/"><code>fromXlsxTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/from-xlsx-workbook/"><code>fromXlsxWorkbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-table/"><code>toXlsxTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/to-xlsx-workbook/"><code>toXlsxWorkbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-table-export-backend/"><code>XlsxTableExportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-table-import-backend/"><code>XlsxTableImportBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/xlsx-workbook-backend/"><code>XlsxWorkbookBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/xlsx/build-xlsx-model/"><code>buildXlsxModel</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
</ul>
</div>
