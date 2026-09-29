---
title: "WorkbookTableResourceLimits | @sheetwrite/core"
description: "Resource ceilings for canonical workbook-table metadata and identifiers."
---
<!-- api-export:@sheetwrite/core|.|WorkbookTableResourceLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Resource ceilings for canonical workbook-table metadata and identifiers.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/workbook-table.ts#L11"><code>packages/core/src/workbook-table.ts#L11</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="workbook-table-resource-limits-max-tables" data-pagefind-weight="1">
<summary><code>maxTables</code></summary>

```ts generated
maxTables: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-columns-per-table" data-pagefind-weight="1">
<summary><code>maxColumnsPerTable</code></summary>

```ts generated
maxColumnsPerTable: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-name-length" data-pagefind-weight="1">
<summary><code>maxNameLength</code></summary>

```ts generated
maxNameLength: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-id-length" data-pagefind-weight="1">
<summary><code>maxIdLength</code></summary>

```ts generated
maxIdLength: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-style-name-length" data-pagefind-weight="1">
<summary><code>maxStyleNameLength</code></summary>

```ts generated
maxStyleNameLength: number;
```

</details>

<details class="api-member" id="workbook-table-resource-limits-max-unsupported-features-per-table" data-pagefind-weight="1">
<summary><code>maxUnsupportedFeaturesPerTable</code></summary>

```ts generated
maxUnsupportedFeaturesPerTable: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface WorkbookTableResourceLimits {
  maxTables: number;
  maxColumnsPerTable: number;
  maxNameLength: number;
  maxIdLength: number;
  maxStyleNameLength: number;
  maxUnsupportedFeaturesPerTable: number;
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

<p class="api-consumers-label">Public exports naming <code>WorkbookTableResourceLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/assert-workbook-tables/"><code>assertWorkbookTables</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/default-workbook-table-resource-limits/"><code>DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/valid-workbook-table/"><code>validWorkbookTable</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
