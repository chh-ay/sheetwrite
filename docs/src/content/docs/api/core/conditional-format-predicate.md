---
title: "ConditionalFormatPredicate | @sheetwrite/core"
description: "Predicate used to decide whether a conditional format applies."
---
<!-- api-export:@sheetwrite/core|.|ConditionalFormatPredicate -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Predicate used to decide whether a conditional format applies.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/cell.ts#L68"><code>packages/core/src/types/cell.ts#L68</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{ kind: "greaterThan"; value: number }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "lessThan"; value: number }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "equal"; value: CellScalar }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "contains"; text: string; matchCase?: boolean }
```

</div>
<div class="api-variant">

```ts generated
{ kind: "formula"; source: string }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type ConditionalFormatPredicate =
  | {
      kind: "greaterThan";
      value: number;
    }
  | {
      kind: "lessThan";
      value: number;
    }
  | {
      kind: "equal";
      value: CellScalar;
    }
  | {
      kind: "contains";
      text: string;
      matchCase?: boolean;
    }
  | {
      kind: "formula";
      source: string;
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

<p class="api-consumers-label">Public exports naming <code>ConditionalFormatPredicate</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/conditional-format-rule/"><code>ConditionalFormatRule</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
