---
title: "DataValidationCondition | @sheetwrite/core"
description: "Serializable condition enforced by a data-validation rule."
---
<!-- api-export:@sheetwrite/core|.|DataValidationCondition -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Serializable condition enforced by a data-validation rule.

`min` and `max` remain inclusive legacy bounds. Use `comparison` when the
operator itself is significant; comparison and legacy bounds are mutually exclusive.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L158</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;list&quot;;&#10;  values: readonly CellScalar[];&#10;  allowCustom?: boolean;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "list";
  values: readonly CellScalar[];
  allowCustom?: boolean;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;number&quot;;&#10;  min?: number;&#10;  max?: number;&#10;  integer?: boolean;&#10;  comparison?: DataValidationComparison;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "number";
  min?: number;
  max?: number;
  integer?: boolean;
  comparison?: DataValidationComparison;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;date&quot;;&#10;  min?: number;&#10;  max?: number;&#10;  comparison?: DataValidationComparison;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "date";
  min?: number;
  max?: number;
  comparison?: DataValidationComparison;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;textLength&quot;;&#10;  min?: number;&#10;  max?: number;&#10;  comparison?: DataValidationComparison;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "textLength";
  min?: number;
  max?: number;
  comparison?: DataValidationComparison;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;checkbox&quot;;&#10;  checkedValue?: CellScalar;&#10;  uncheckedValue?: CellScalar;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "checkbox";
  checkedValue?: CellScalar;
  uncheckedValue?: CellScalar;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type DataValidationCondition =&#10;  | {&#10;      kind: &quot;list&quot;;&#10;      values: readonly CellScalar[];&#10;      allowCustom?: boolean;&#10;    }&#10;  | {&#10;      kind: &quot;number&quot;;&#10;      min?: number;&#10;      max?: number;&#10;      integer?: boolean;&#10;      comparison?: DataValidationComparison;&#10;    }&#10;  | {&#10;      kind: &quot;date&quot;;&#10;      min?: number;&#10;      max?: number;&#10;      comparison?: DataValidationComparison;&#10;    }&#10;  | {&#10;      kind: &quot;textLength&quot;;&#10;      min?: number;&#10;      max?: number;&#10;      comparison?: DataValidationComparison;&#10;    }&#10;  | {&#10;      kind: &quot;checkbox&quot;;&#10;      checkedValue?: CellScalar;&#10;      uncheckedValue?: CellScalar;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type DataValidationCondition =
  | {
      kind: "list";
      values: readonly CellScalar[];
      allowCustom?: boolean;
    }
  | {
      kind: "number";
      min?: number;
      max?: number;
      integer?: boolean;
      comparison?: DataValidationComparison;
    }
  | {
      kind: "date";
      min?: number;
      max?: number;
      comparison?: DataValidationComparison;
    }
  | {
      kind: "textLength";
      min?: number;
      max?: number;
      comparison?: DataValidationComparison;
    }
  | {
      kind: "checkbox";
      checkedValue?: CellScalar;
      uncheckedValue?: CellScalar;
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

<p class="api-consumers-label">Public exports naming <code>DataValidationCondition</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/data-validation-rule/"><code>DataValidationRule</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
