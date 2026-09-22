---
title: "SheetwriteProps | @sheetwrite/react"
description: "Simple framework adapter props for columns and default row objects."
---
<!-- api-export:@sheetwrite/react|.|SheetwriteProps -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/react/">@sheetwrite/react</a><span class="api-status" data-kind="type">type</span></div>

Simple framework adapter props for columns and default row objects.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/react</code></dd></div>
<div><dt>Source</dt><dd><code>packages/react/src/index.tsx#L396</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type SheetwriteProps&lt;&#10;  Row extends Record&lt;string, CellScalar&gt;,&#10;  Id extends RowBridgeId = RowBridgeId,&#10;&gt; = Omit&lt;&#10;  SheetwriteGridProps&lt;Id&gt;,&#10;  &quot;workbook&quot; | &quot;data&quot; | &quot;datasource&quot; | &quot;height&quot; | &quot;fill&quot; | &quot;rowBridge&quot;&#10;&gt; &amp;&#10;  GridSizeProps &amp; {&#10;    columns: readonly SimpleColumn&lt;Row&gt;[];&#10;    defaultRows: readonly Row[];&#10;    sheetName?: string;&#10;    getRowId?: (row: Row, index: number) =&gt; Id;&#10;    createRowId?: Parameters&lt;&#10;      typeof createSimpleRowBridge&lt;Row, Id&gt;&#10;    &gt;[0][&quot;createRowId&quot;];&#10;  };" data-pagefind-ignore>Copy</button>

```ts generated
export type SheetwriteProps<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> = Omit<
  SheetwriteGridProps<Id>,
  "workbook" | "data" | "datasource" | "height" | "fill" | "rowBridge"
> &
  GridSizeProps & {
    columns: readonly SimpleColumn<Row>[];
    defaultRows: readonly Row[];
    sheetName?: string;
    getRowId?: (row: Row, index: number) => Id;
    createRowId?: Parameters<
      typeof createSimpleRowBridge<Row, Id>
    >[0]["createRowId"];
  };
```

</div>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/react</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>SheetwriteProps</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/react/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite/"><code>Sheetwrite</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
