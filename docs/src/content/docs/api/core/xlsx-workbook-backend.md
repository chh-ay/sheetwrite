---
title: "XlsxWorkbookBackend | @sheetwrite/core"
description: "Optional backend contract for complete workbook XLSX interchange."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookBackend -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Optional backend contract for complete workbook XLSX interchange.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L418"><code>packages/core/src/export.ts#L418</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-backend-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="xlsx-workbook-backend-to-xlsx-workbook" data-pagefind-weight="1">
<summary><code>toXlsxWorkbook</code></summary>

```ts generated
toXlsxWorkbook(snapshot: WorkbookSnapshot, options?: XlsxWorkbookOptions): Promise<Uint8Array>;
```

</details>

<details class="api-member" id="xlsx-workbook-backend-from-xlsx-workbook" data-pagefind-weight="1">
<summary><code>fromXlsxWorkbook</code></summary>

```ts generated
fromXlsxWorkbook( data: ArrayBuffer | Uint8Array, options?: XlsxWorkbookOptions, ): Promise<WorkbookSnapshot>;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxWorkbookBackend {
  name: string;
  toXlsxWorkbook(
    snapshot: WorkbookSnapshot,
    options?: XlsxWorkbookOptions,
  ): Promise<Uint8Array>;
  fromXlsxWorkbook(
    data: ArrayBuffer | Uint8Array,
    options?: XlsxWorkbookOptions,
  ): Promise<WorkbookSnapshot>;
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

<p class="api-consumers-label">Public exports naming <code>XlsxWorkbookBackend</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/set-xlsx-workbook-backend/"><code>setXlsxWorkbookBackend</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/xlsx/sheetwrite-workbook-backend/"><code>sheetwriteWorkbookBackend</code></a><span class="api-consumer-kind">@sheetwrite/xlsx</span></li>
</ul>
</div>
