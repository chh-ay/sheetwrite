---
title: "ConditionalFormatPredicate | @sheetwrite/core"
description: "Predicate used to decide whether a conditional format applies."
---
<!-- api-export:@sheetwrite/core|.|ConditionalFormatPredicate -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Predicate used to decide whether a conditional format applies.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L68</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;greaterThan&quot;; value: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "greaterThan"; value: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;lessThan&quot;; value: number }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "lessThan"; value: number }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;equal&quot;; value: CellScalar }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "equal"; value: CellScalar }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;contains&quot;; text: string; matchCase?: boolean }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "contains"; text: string; matchCase?: boolean }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;formula&quot;; source: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "formula"; source: string }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type ConditionalFormatPredicate =&#10;  | {&#10;      kind: &quot;greaterThan&quot;;&#10;      value: number;&#10;    }&#10;  | {&#10;      kind: &quot;lessThan&quot;;&#10;      value: number;&#10;    }&#10;  | {&#10;      kind: &quot;equal&quot;;&#10;      value: CellScalar;&#10;    }&#10;  | {&#10;      kind: &quot;contains&quot;;&#10;      text: string;&#10;      matchCase?: boolean;&#10;    }&#10;  | {&#10;      kind: &quot;formula&quot;;&#10;      source: string;&#10;    };" data-pagefind-ignore>Copy</button>

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
