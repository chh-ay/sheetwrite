---
title: "DataModel | @sheetwrite/core"
description: "DataModel interface in @sheetwrite/core: The workbook's data model."
---
<!-- api-export:@sheetwrite/core|.|DataModel -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

The workbook's data model. Every workbook table is a model table.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/data-model.ts#L32"><code>packages/core/src/types/data-model.ts#L32</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="data-model-relationships" data-pagefind-weight="1">
<summary><code>relationships</code> <span class="api-member-summary">Relationships; at most one joins a pair of tables, and they form no cycle.</span></summary>

```ts generated
relationships: TableRelationship[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataModel {
  relationships: TableRelationship[];
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
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>DataModel</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/workbook/"><code>Workbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-snapshot/"><code>WorkbookSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
