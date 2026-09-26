---
title: "DataValidationComparison | @sheetwrite/core"
description: "Native comparison semantics for numeric, date-serial, and text-length validation."
---
<!-- api-export:@sheetwrite/core|.|DataValidationComparison -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Native comparison semantics for numeric, date-serial, and text-length validation.
Interval operands are inclusive; `notBetween` accepts values outside that interval.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L139"><code>packages/core/src/types/document.ts#L139</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  operator: "between" | "notBetween";
  min: number;
  max: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  operator:
    | "equal"
    | "notEqual"
    | "greaterThan"
    | "lessThan"
    | "greaterThanOrEqual"
    | "lessThanOrEqual";
  value: number;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type DataValidationComparison =
  | {
      operator: "between" | "notBetween";
      min: number;
      max: number;
    }
  | {
      operator:
        | "equal"
        | "notEqual"
        | "greaterThan"
        | "lessThan"
        | "greaterThanOrEqual"
        | "lessThanOrEqual";
      value: number;
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

<p class="api-consumers-label">Public exports naming <code>DataValidationComparison</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-validation-condition/"><code>DataValidationCondition</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
