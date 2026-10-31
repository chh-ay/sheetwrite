---
title: "PivotFields | @sheetwrite/formulas"
description: "PivotFields class in @sheetwrite/formulas: The names and types of a pivot's source fields, for the field list."
---
<!-- api-export:@sheetwrite/formulas|.|PivotFields -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/formulas/">@sheetwrite/formulas</a><span class="api-status" data-kind="class">class</span></div>

The names and types of a pivot's source fields, for the field list.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/formulas/pkg/sheetwrite_wasm.d.ts#L460"><code>packages/formulas/pkg/sheetwrite_wasm.d.ts#L460</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="pivot-fields-free" data-pagefind-weight="1">
<summary><code>free</code></summary>

```ts generated
free: () => void;
```

</details>

<details class="api-member" id="pivot-fields-names" data-pagefind-weight="1">
<summary><code>names</code> <span class="api-member-summary">Field names: header text, or ColumnN for a blank header.</span></summary>

```ts generated
names: () => string[];
```

</details>

<details class="api-member" id="pivot-fields-types" data-pagefind-weight="1">
<summary><code>types</code> <span class="api-member-summary">Field types: 0 blank, 1 number, 2 text, 3 boolean, 4 mixed.</span></summary>

```ts generated
types: () => Uint8Array
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class PivotFields {
  free: () => void;
  names: () => string[];
  types: () => Uint8Array;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/formulas</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>PivotFields</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/formulas/cell-store/"><code>CellStore</code></a><span class="api-consumer-kind">@sheetwrite/formulas</span></li>
</ul>
</div>
