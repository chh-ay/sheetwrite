---
title: "CellEditor | @sheetwrite/svelte"
description: "Framework-neutral named editor definition registered through GridOptions.editors."
---
<!-- api-export:@sheetwrite/svelte|.|CellEditor -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/svelte/">@sheetwrite/svelte</a><span class="api-status" data-kind="interface">interface</span></div>

Framework-neutral named editor definition registered through GridOptions.editors.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/svelte</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/dist/types/grid.d.ts#L44</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="cell-editor-mount" data-pagefind-weight="1" open>
<summary><code>mount</code></summary>

<button class="api-copy" type="button" data-copy-code="mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;" data-pagefind-ignore>Copy</button>

```ts generated
mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface CellEditor {&#10;  mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface CellEditor {
  mount(host: HTMLElement, context: CellEditorContext): CellEditorInstance;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/svelte</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>CellEditor</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
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
