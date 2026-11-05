---
title: "Measure | @sheetwrite/core"
description: "Measure interface in @sheetwrite/core: A model formula evaluated separately in each pivot cell's filter context."
---
<!-- api-export:@sheetwrite/core|.|Measure -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A model formula evaluated separately in each pivot cell's filter context.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/data-model.ts#L32"><code>packages/core/src/types/data-model.ts#L32</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="measure-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable identity, unique in the workbook.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="measure-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Caption, unique among measures ignoring case.</span></summary>

```ts generated
name: string;
```

</details>

<details class="api-member" id="measure-table" data-pagefind-weight="1">
<summary><code>table</code> <span class="api-member-summary">Home table, used to organize the field list.</span></summary>

```ts generated
table: WorkbookTableId;
```

</details>

<details class="api-member" id="measure-formula" data-pagefind-weight="1">
<summary><code>formula</code> <span class="api-member-summary">Formula with its leading = and qualified model-column references.</span></summary>

```ts generated
formula: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface Measure {
  id: string;
  name: string;
  table: WorkbookTableId;
  formula: string;
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

<p class="api-consumers-label">Public exports naming <code>Measure</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-model/"><code>DataModel</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
