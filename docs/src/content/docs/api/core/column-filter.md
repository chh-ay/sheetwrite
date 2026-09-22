---
title: "ColumnFilter | @sheetwrite/core"
description: "One column's filter predicate."
---
<!-- api-export:@sheetwrite/core|.|ColumnFilter -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

One column's filter predicate. All active column filters AND together;
matching is against the cell's resolved value (text or number).

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/document.ts#L94</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;values&quot;; values: readonly CellScalar[] }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "values"; values: readonly CellScalar[] }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;contains&quot;; text: string; matchCase?: boolean }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "contains"; text: string; matchCase?: boolean }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{&#10;  kind: &quot;compare&quot;;&#10;  op: &quot;gt&quot; | &quot;gte&quot; | &quot;lt&quot; | &quot;lte&quot; | &quot;eq&quot; | &quot;neq&quot;;&#10;  value: number;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
{
  kind: "compare";
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: number;
}
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;empty&quot; }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "empty" }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;nonEmpty&quot; }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "nonEmpty" }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type ColumnFilter =&#10;  | {&#10;      kind: &quot;values&quot;;&#10;      values: readonly CellScalar[];&#10;    }&#10;  | {&#10;      kind: &quot;contains&quot;;&#10;      text: string;&#10;      matchCase?: boolean;&#10;    }&#10;  | {&#10;      kind: &quot;compare&quot;;&#10;      op: &quot;gt&quot; | &quot;gte&quot; | &quot;lt&quot; | &quot;lte&quot; | &quot;eq&quot; | &quot;neq&quot;;&#10;      value: number;&#10;    }&#10;  | {&#10;      kind: &quot;empty&quot;;&#10;    }&#10;  | {&#10;      kind: &quot;nonEmpty&quot;;&#10;    };" data-pagefind-ignore>Copy</button>

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
