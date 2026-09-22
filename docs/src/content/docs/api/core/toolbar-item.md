---
title: "ToolbarItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback item in the grid toolbar."
---
<!-- api-export:@sheetwrite/core|.|ToolbarItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Built-in, separator, or custom callback item in the grid toolbar.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L202</code></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="toolbar-item-action" data-pagefind-weight="1" open>
<summary><code>action</code> <span class="api-member-summary">Built-in action to bind (or &quot;separator&quot;).</span></summary>

<button class="api-copy" type="button" data-copy-code="action?: ToolbarActionName;" data-pagefind-ignore>Copy</button>

```ts generated
action?: ToolbarActionName;
```

<p class="api-member-doc">Built-in action to bind (or &quot;separator&quot;). Omit when supplying `onClick`.</p>
</details>

<details class="api-member" id="toolbar-item-on-click" data-pagefind-weight="1" open>
<summary><code>onClick</code> <span class="api-member-summary">Custom click handler; receives the grid handle.</span></summary>

<button class="api-copy" type="button" data-copy-code="onClick?: (grid: Grid) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onClick?: (grid: Grid) => void;
```

<p class="api-member-doc">Custom click handler; receives the grid handle. Overrides `action`.</p>
</details>

<details class="api-member" id="toolbar-item-icon" data-pagefind-weight="1" open>
<summary><code>icon</code> <span class="api-member-summary">Button icon/content. Strings render as plain text; pass a DOM Node or a factory returning one for SVG/HTML icons without using innerHTML.</span></summary>

<button class="api-copy" type="button" data-copy-code="icon?: ToolbarIcon;" data-pagefind-ignore>Copy</button>

```ts generated
icon?: ToolbarIcon;
```

</details>

<details class="api-member" id="toolbar-item-title" data-pagefind-weight="1" open>
<summary><code>title</code> <span class="api-member-summary">Accessible tooltip.</span></summary>

<button class="api-copy" type="button" data-copy-code="title?: string;" data-pagefind-ignore>Copy</button>

```ts generated
title?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface ToolbarItem {&#10;  action?: ToolbarActionName;&#10;  onClick?: (grid: Grid) =&gt; void;&#10;  icon?: ToolbarIcon;&#10;  title?: string;&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface ToolbarItem {
  action?: ToolbarActionName;
  onClick?: (grid: Grid) => void;
  icon?: ToolbarIcon;
  title?: string;
}
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

<p class="api-consumers-label">Public exports naming <code>ToolbarItem</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-config/"><code>GridConfig</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell-options/"><code>SpreadsheetShellOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/toolbar-options/"><code>ToolbarOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
