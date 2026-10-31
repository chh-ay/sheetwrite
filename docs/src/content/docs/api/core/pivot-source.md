---
title: "PivotSource | @sheetwrite/core"
description: "PivotSource type in @sheetwrite/core: Data a pivot summarizes. - A range source includes its header row: the first range row names the fields, and field i is…"
---
<!-- api-export:@sheetwrite/core|.|PivotSource -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Data a pivot summarizes.

- A range source includes its header row: the first range row names the
  fields, and field `i` is the column `range.start.col + i`.
- A table source names a workbook table by its stable `WorkbookTable.id`.
  Field `i` is table column `i`; header and totals rows are excluded.

When the source disappears (its sheet, its table, or every source row or
column is deleted), core sets `invalid: true` and keeps the reference
unchanged. The engine then shows `#REF!` at the anchor.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/pivot.ts#L30"><code>packages/core/src/types/pivot.ts#L30</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ range: Range; invalid?: true }
```

</div>
<div class="api-variant">

```ts generated
{ table: WorkbookTableId; invalid?: true }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type PivotSource =
  | {
      range: Range;
      invalid?: true;
    }
  | {
      table: WorkbookTableId;
      invalid?: true;
    };
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>PivotSource</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pivot-definition/"><code>PivotDefinition</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
