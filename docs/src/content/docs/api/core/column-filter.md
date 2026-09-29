---
title: "ColumnFilter | @sheetwrite/core"
description: "One column's filter predicate."
---
<!-- api-export:@sheetwrite/core|.|ColumnFilter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

One column's filter predicate. All active column filters AND together;
matching is against the cell's resolved value (text or number).

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L94"><code>packages/core/src/types/document.ts#L94</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ kind: "values"; values: readonly CellScalar[] }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "contains"; text: string; matchCase?: boolean }
```

</div>
<div class="api-variant">

```ts generated
{
  kind: "compare";
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: number;
}
```

</div>
<div class="api-variant">

```ts generated
{ kind: "empty" }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "nonEmpty" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type ColumnFilter =
  | {
      kind: "values";
      values: readonly CellScalar[];
    }
  | {
      kind: "contains";
      text: string;
      matchCase?: boolean;
    }
  | {
      kind: "compare";
      op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
      value: number;
    }
  | {
      kind: "empty";
    }
  | {
      kind: "nonEmpty";
    };
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

<p class="api-consumers-label">Public exports naming <code>ColumnFilter</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
