---
title: "ContextMenuActionName | @sheetwrite/core"
description: "Built-in action names accepted by custom context-menu rows."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuActionName -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Built-in action names accepted by custom context-menu rows.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L217</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type ContextMenuActionName =&#10;  | &quot;cut&quot;&#10;  | &quot;copy&quot;&#10;  | &quot;paste&quot;&#10;  | &quot;clearContents&quot;&#10;  | &quot;merge&quot;&#10;  | &quot;unmerge&quot;&#10;  | &quot;insertRowAbove&quot;&#10;  | &quot;insertRowBelow&quot;&#10;  | &quot;deleteRow&quot;&#10;  | &quot;insertColumnLeft&quot;&#10;  | &quot;insertColumnRight&quot;&#10;  | &quot;deleteColumn&quot;&#10;  | &quot;hideRow&quot;&#10;  | &quot;showAllRows&quot;&#10;  | &quot;autoFitRow&quot;&#10;  | &quot;hideColumn&quot;&#10;  | &quot;showAllColumns&quot;&#10;  | &quot;autoFitColumn&quot;&#10;  | &quot;clearFilter&quot;&#10;  | &quot;exportCsv&quot;&#10;  | &quot;exportXlsx&quot;&#10;  | &quot;separator&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
export type ContextMenuActionName =
  | "cut"
  | "copy"
  | "paste"
  | "clearContents"
  | "merge"
  | "unmerge"
  | "insertRowAbove"
  | "insertRowBelow"
  | "deleteRow"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "deleteColumn"
  | "hideRow"
  | "showAllRows"
  | "autoFitRow"
  | "hideColumn"
  | "showAllColumns"
  | "autoFitColumn"
  | "clearFilter"
  | "exportCsv"
  | "exportXlsx"
  | "separator";
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>ContextMenuActionName</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/context-menu-item/"><code>ContextMenuItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
