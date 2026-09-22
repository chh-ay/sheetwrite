---
title: "ContextMenuItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback row in the right-click menu."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Built-in, separator, or custom callback row in the right-click menu.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L252</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#context-menu-item-id"><code>id</code></a>
<a href="#context-menu-item-action"><code>action</code></a>
<a href="#context-menu-item-on-click"><code>onClick</code></a>
<a href="#context-menu-item-label"><code>label</code></a>
<a href="#context-menu-item-shortcut"><code>shortcut</code></a>
<a href="#context-menu-item-visible"><code>visible</code></a>
<a href="#context-menu-item-disabled"><code>disabled</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="context-menu-item-id" data-pagefind-weight="1" open>
<summary><code>id</code> <span class="api-member-summary">Stable host identifier, exposed as data-context-menu-item.</span></summary>

<button class="api-copy" type="button" data-copy-code="id?: string;" data-pagefind-ignore>Copy</button>

```ts generated
id?: string;
```

</details>

<details class="api-member" id="context-menu-item-action" data-pagefind-weight="1" open>
<summary><code>action</code> <span class="api-member-summary">Built-in action to bind (or &quot;separator&quot;).</span></summary>

<button class="api-copy" type="button" data-copy-code="action?: ContextMenuActionName;" data-pagefind-ignore>Copy</button>

```ts generated
action?: ContextMenuActionName;
```

<p class="api-member-doc">Built-in action to bind (or &quot;separator&quot;). Omit when supplying `onClick`.</p>
</details>

<details class="api-member" id="context-menu-item-on-click" data-pagefind-weight="1" open>
<summary><code>onClick</code> <span class="api-member-summary">Custom click handler; receives the grid and the right-clicked cell (null if none).</span></summary>

<button class="api-copy" type="button" data-copy-code="onClick?: (grid: Grid, cell: CellAddress | null) =&gt; void;" data-pagefind-ignore>Copy</button>

```ts generated
onClick?: (grid: Grid, cell: CellAddress | null) => void;
```

</details>

<details class="api-member" id="context-menu-item-label" data-pagefind-weight="1" open>
<summary><code>label</code> <span class="api-member-summary">Menu row text. Defaults per action.</span></summary>

<button class="api-copy" type="button" data-copy-code="label?: string;" data-pagefind-ignore>Copy</button>

```ts generated
label?: string;
```

</details>

<details class="api-member" id="context-menu-item-shortcut" data-pagefind-weight="1" open>
<summary><code>shortcut</code> <span class="api-member-summary">Optional shortcut hint rendered beside the label.</span></summary>

<button class="api-copy" type="button" data-copy-code="shortcut?: string;" data-pagefind-ignore>Copy</button>

```ts generated
shortcut?: string;
```

</details>

<details class="api-member" id="context-menu-item-visible" data-pagefind-weight="1" open>
<summary><code>visible</code> <span class="api-member-summary">Static or request-aware visibility.</span></summary>

<button class="api-copy" type="button" data-copy-code="visible?: boolean | ((context: ContextMenuContext) =&gt; boolean);" data-pagefind-ignore>Copy</button>

```ts generated
visible?: boolean | ((context: ContextMenuContext) => boolean);
```

<p class="api-member-doc">Static or request-aware visibility. Hidden separators are normalized.</p>
</details>

<details class="api-member" id="context-menu-item-disabled" data-pagefind-weight="1" open>
<summary><code>disabled</code> <span class="api-member-summary">Static or context-aware disabled state.</span></summary>

<button class="api-copy" type="button" data-copy-code="disabled?: boolean | ((context: ContextMenuContext) =&gt; boolean);" data-pagefind-ignore>Copy</button>

```ts generated
disabled?: boolean | ((context: ContextMenuContext) => boolean);
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface ContextMenuItem {&#10;  id?: string;&#10;  action?: ContextMenuActionName;&#10;  onClick?: (grid: Grid, cell: CellAddress | null) =&gt; void;&#10;  label?: string;&#10;  shortcut?: string;&#10;  visible?: boolean | ((context: ContextMenuContext) =&gt; boolean);&#10;  disabled?: boolean | ((context: ContextMenuContext) =&gt; boolean);&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface ContextMenuItem {
  id?: string;
  action?: ContextMenuActionName;
  onClick?: (grid: Grid, cell: CellAddress | null) => void;
  label?: string;
  shortcut?: string;
  visible?: boolean | ((context: ContextMenuContext) => boolean);
  disabled?: boolean | ((context: ContextMenuContext) => boolean);
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

<p class="api-consumers-label">Public exports naming <code>ContextMenuItem</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/context-menu-items/"><code>ContextMenuItems</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
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
