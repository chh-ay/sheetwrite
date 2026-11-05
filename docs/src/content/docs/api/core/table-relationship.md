---
title: "TableRelationship | @sheetwrite/core"
description: "TableRelationship interface in @sheetwrite/core: One-to-many link between two workbook tables with a single key column on each side."
---
<!-- api-export:@sheetwrite/core|.|TableRelationship -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One-to-many link between two workbook tables with a single key column on
each side. Each `from` row matches at most one `to` row.

The names follow `x15:modelRelationship`: `from` is the foreign-key (many)
side and `to` is the primary-key (one) side. A relationship whose table or
column was removed stays saved, so undoing the removal restores it.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/data-model.ts#L22"><code>packages/core/src/types/data-model.ts#L22</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="table-relationship-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable identity, unique in the workbook.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="table-relationship-from" data-pagefind-weight="1">
<summary><code>from</code> <span class="api-member-summary">Many side: the foreign-key column.</span></summary>

```ts generated
from: TableColumnRef;
```

</details>

<details class="api-member" id="table-relationship-to" data-pagefind-weight="1">
<summary><code>to</code> <span class="api-member-summary">One side: the key column, whose non-blank values must be unique.</span></summary>

```ts generated
to: TableColumnRef;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface TableRelationship {
  id: string;
  from: TableColumnRef;
  to: TableColumnRef;
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

<p class="api-consumers-label">Public exports naming <code>TableRelationship</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-model/"><code>DataModel</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
