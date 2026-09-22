---
title: "ToolbarActionName | @sheetwrite/core"
description: "Built-in action names accepted by custom toolbar items."
---
<!-- api-export:@sheetwrite/core|.|ToolbarActionName -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Built-in action names accepted by custom toolbar items.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L162</code></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

<button class="api-copy" type="button" data-copy-code="export type ToolbarActionName =&#10;  | &quot;bold&quot;&#10;  | &quot;italic&quot;&#10;  | &quot;underline&quot;&#10;  | &quot;strikethrough&quot;&#10;  | &quot;alignLeft&quot;&#10;  | &quot;alignCenter&quot;&#10;  | &quot;alignRight&quot;&#10;  | &quot;textColor&quot;&#10;  | &quot;fillColor&quot;&#10;  | &quot;border&quot;&#10;  | &quot;clearFormat&quot;&#10;  | &quot;merge&quot;&#10;  | &quot;unmerge&quot;&#10;  | &quot;sortAsc&quot;&#10;  | &quot;sortDesc&quot;&#10;  | &quot;exportCsv&quot;&#10;  | &quot;exportXlsx&quot;&#10;  | &quot;undo&quot;&#10;  | &quot;redo&quot;&#10;  | &quot;separator&quot;;" data-pagefind-ignore>Copy</button>

```ts generated
export type ToolbarActionName =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "textColor"
  | "fillColor"
  | "border"
  | "clearFormat"
  | "merge"
  | "unmerge"
  | "sortAsc"
  | "sortDesc"
  | "exportCsv"
  | "exportXlsx"
  | "undo"
  | "redo"
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

<p class="api-consumers-label">Public exports naming <code>ToolbarActionName</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-command-name/"><code>GridCommandName</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-config/"><code>GridConfig</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/toolbar-item/"><code>ToolbarItem</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/toolbar-options/"><code>ToolbarOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid-command-name/"><code>GridCommandName</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid-command-name/"><code>GridCommandName</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid-command-name/"><code>GridCommandName</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
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
