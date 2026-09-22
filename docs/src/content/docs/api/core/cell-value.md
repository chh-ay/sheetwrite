---
title: "CellValue | @sheetwrite/core"
description: "A cell's persisted input: a literal, a cross-reference, or a formula."
---
<!-- api-export:@sheetwrite/core|.|CellValue -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

A cell's persisted input: a literal, a cross-reference, or a formula.
References resolve through the store's reference graph; formulas resolve in
the WASM calculation engine.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/cell.ts#L101</code></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;literal&quot;; value: CellScalar }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "literal"; value: CellScalar }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;ref&quot;; target: CellAddress }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "ref"; target: CellAddress }
```

</div>
<div class="api-variant">

<button class="api-copy" type="button" data-copy-code="{ kind: &quot;formula&quot;; src: string }" data-pagefind-ignore>Copy</button>

```ts generated
{ kind: "formula"; src: string }
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export type CellValue =&#10;  | {&#10;      kind: &quot;literal&quot;;&#10;      value: CellScalar;&#10;    }&#10;  | {&#10;      kind: &quot;ref&quot;;&#10;      target: CellAddress;&#10;    }&#10;  | {&#10;      kind: &quot;formula&quot;;&#10;      src: string;&#10;    };" data-pagefind-ignore>Copy</button>

```ts generated
export type CellValue =
  | {
      kind: "literal";
      value: CellScalar;
    }
  | {
      kind: "ref";
      target: CellAddress;
    }
  | {
      kind: "formula";
      src: string;
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

<p class="api-consumers-label">Public exports naming <code>CellValue</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/cell-change/"><code>CellChange</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/columnar-data/"><code>ColumnarData</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/data-cell/"><code>DataCell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-events/"><code>GridEvents</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/mutation-issue/"><code>MutationIssue</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/parse-cell-input/"><code>parseCellInput</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/row-bridge-cell/"><code>RowBridgeCell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/snapshot-cell/"><code>SnapshotCell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-cell/"><code>RowBridgeCell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
