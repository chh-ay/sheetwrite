---
title: "DataValidationComparison | @sheetwrite/core"
description: "Native comparison semantics for numeric, date-serial, and text-length validation."
---
<!-- api-export:@sheetwrite/core|.|DataValidationComparison -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Native comparison semantics for numeric, date-serial, and text-length validation.
Interval operands are inclusive; `notBetween` accepts values outside that interval.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L139</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  operator: &quot;between&quot; | &quot;notBetween&quot;;&#10;  min: number;&#10;  max: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  operator: "between" | "notBetween";
  min: number;
  max: number;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  operator:&#10;    | &quot;equal&quot;&#10;    | &quot;notEqual&quot;&#10;    | &quot;greaterThan&quot;&#10;    | &quot;lessThan&quot;&#10;    | &quot;greaterThanOrEqual&quot;&#10;    | &quot;lessThanOrEqual&quot;;&#10;  value: number;&#10;}" data-pagefind-ignore>Copy</button>

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

<button class="api-copy" type="button" data-copy-code="export type DataValidationComparison =&#10;  | {&#10;      operator: &quot;between&quot; | &quot;notBetween&quot;;&#10;      min: number;&#10;      max: number;&#10;    }&#10;  | {&#10;      operator:&#10;        | &quot;equal&quot;&#10;        | &quot;notEqual&quot;&#10;        | &quot;greaterThan&quot;&#10;        | &quot;lessThan&quot;&#10;        | &quot;greaterThanOrEqual&quot;&#10;        | &quot;lessThanOrEqual&quot;;&#10;      value: number;&#10;    };" data-pagefind-ignore>Copy</button>

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

<script>
(() => {
  if (window.__sheetwriteApiCopy !== undefined) return;
  window.__sheetwriteApiCopy = true;
  const selectCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  };
  const copy = (button) => {
    const text = button.dataset.copyCode ?? "";
    const confirm = () => {
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy"; }, 1400);
    };
    if (navigator.clipboard === undefined) {
      if (selectCopy(text)) confirm();
      return;
    }
    navigator.clipboard.writeText(text).then(confirm, () => {
      if (selectCopy(text)) confirm();
    });
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    const button = target instanceof Element ? target.closest(".api-copy") : null;
    if (button !== null) copy(button);
  });
})();
</script>
