---
title: "GridConfig | @sheetwrite/core"
description: "Toolbar / feature configuration."
---
<!-- api-export:@sheetwrite/core|.|GridConfig -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Toolbar / feature configuration. When `config` is set the built-in toolbar is
shown; control flags default to `true` except the opt-in `export` flag.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Package</dt><dd><code>@sheetwrite/core</code></dd></div>
<div><dt>Source</dt><dd><code>packages/core/src/types/grid.ts#L278</code></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#grid-config-toolbar"><code>toolbar</code></a>
<a href="#grid-config-bold"><code>bold</code></a>
<a href="#grid-config-italic"><code>italic</code></a>
<a href="#grid-config-align"><code>align</code></a>
<a href="#grid-config-text-color"><code>textColor</code></a>
<a href="#grid-config-fill-color"><code>fillColor</code></a>
<a href="#grid-config-border"><code>border</code></a>
<a href="#grid-config-clear-format"><code>clearFormat</code></a>
<a href="#grid-config-merge"><code>merge</code></a>
<a href="#grid-config-sort"><code>sort</code></a>
<a href="#grid-config-export"><code>export</code></a>
<a href="#grid-config-icons"><code>icons</code></a>
<a href="#grid-config-context-menu"><code>contextMenu</code></a>
<a href="#grid-config-undo"><code>undo</code></a>
<a href="#grid-config-find"><code>find</code></a>
<a href="#grid-config-tabs"><code>tabs</code></a>
<a href="#grid-config-keyboard"><code>keyboard</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>17</span>

<div class="api-member-list">

<details class="api-member" id="grid-config-toolbar" data-pagefind-weight="1" open>
<summary><code>toolbar</code> <span class="api-member-summary">Show the built-in toolbar (true), hide it (false), or supply a custom item list.</span></summary>

<button class="api-copy" type="button" data-copy-code="toolbar?: boolean | ToolbarItem[];" data-pagefind-ignore>Copy</button>

```ts generated
toolbar?: boolean | ToolbarItem[];
```

</details>

<details class="api-member" id="grid-config-bold" data-pagefind-weight="1" open>
<summary><code>bold</code> <span class="api-member-summary">Show the bold control in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="bold?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
bold?: boolean;
```

</details>

<details class="api-member" id="grid-config-italic" data-pagefind-weight="1" open>
<summary><code>italic</code> <span class="api-member-summary">Show the italic control in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="italic?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
italic?: boolean;
```

</details>

<details class="api-member" id="grid-config-align" data-pagefind-weight="1" open>
<summary><code>align</code> <span class="api-member-summary">Show left, center, and right alignment controls (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="align?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
align?: boolean;
```

</details>

<details class="api-member" id="grid-config-text-color" data-pagefind-weight="1" open>
<summary><code>textColor</code> <span class="api-member-summary">Show the text-color control in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="textColor?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
textColor?: boolean;
```

</details>

<details class="api-member" id="grid-config-fill-color" data-pagefind-weight="1" open>
<summary><code>fillColor</code> <span class="api-member-summary">Show the fill-color control in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="fillColor?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
fillColor?: boolean;
```

</details>

<details class="api-member" id="grid-config-border" data-pagefind-weight="1" open>
<summary><code>border</code> <span class="api-member-summary">Show the border control in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="border?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
border?: boolean;
```

</details>

<details class="api-member" id="grid-config-clear-format" data-pagefind-weight="1" open>
<summary><code>clearFormat</code> <span class="api-member-summary">Show the clear-format control in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="clearFormat?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
clearFormat?: boolean;
```

</details>

<details class="api-member" id="grid-config-merge" data-pagefind-weight="1" open>
<summary><code>merge</code> <span class="api-member-summary">Show merge and unmerge controls in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="merge?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
merge?: boolean;
```

</details>

<details class="api-member" id="grid-config-sort" data-pagefind-weight="1" open>
<summary><code>sort</code> <span class="api-member-summary">Show ascending and descending sort controls in the default toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="sort?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
sort?: boolean;
```

</details>

<details class="api-member" id="grid-config-export" data-pagefind-weight="1" open>
<summary><code>export</code> <span class="api-member-summary">Show CSV/XLSX export controls in the default toolbar (default false).</span></summary>

<button class="api-copy" type="button" data-copy-code="export?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
export?: boolean;
```

</details>

<details class="api-member" id="grid-config-icons" data-pagefind-weight="1" open>
<summary><code>icons</code> <span class="api-member-summary">Override built-in toolbar icons by action name.</span></summary>

<button class="api-copy" type="button" data-copy-code="icons?: Partial&lt;Record&lt;ToolbarActionName, ToolbarIcon&gt;&gt;;" data-pagefind-ignore>Copy</button>

```ts generated
icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
```

<p class="api-member-doc">Override built-in toolbar icons by action name. Strings render as plain text; DOM nodes/factories support SVG/HTML icons.</p>
</details>

<details class="api-member" id="grid-config-context-menu" data-pagefind-weight="1" open>
<summary><code>contextMenu</code> <span class="api-member-summary">Built-in menu, disabled menu, static rows, or a request-aware row factory.</span></summary>

<button class="api-copy" type="button" data-copy-code="contextMenu?: boolean | ContextMenuItems;" data-pagefind-ignore>Copy</button>

```ts generated
contextMenu?: boolean | ContextMenuItems;
```

</details>

<details class="api-member" id="grid-config-undo" data-pagefind-weight="1" open>
<summary><code>undo</code> <span class="api-member-summary">Show undo/redo controls in the built-in toolbar (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="undo?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
undo?: boolean;
```

</details>

<details class="api-member" id="grid-config-find" data-pagefind-weight="1" open>
<summary><code>find</code> <span class="api-member-summary">Built-in Ctrl+F find widget: enabled (true, default) or disabled (false).</span></summary>

<button class="api-copy" type="button" data-copy-code="find?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
find?: boolean;
```

</details>

<details class="api-member" id="grid-config-tabs" data-pagefind-weight="1" open>
<summary><code>tabs</code> <span class="api-member-summary">Bottom sheet-tab bar for multi-sheet workbooks (default true).</span></summary>

<button class="api-copy" type="button" data-copy-code="tabs?: boolean;" data-pagefind-ignore>Copy</button>

```ts generated
tabs?: boolean;
```

</details>

<details class="api-member" id="grid-config-keyboard" data-pagefind-weight="1" open>
<summary><code>keyboard</code> <span class="api-member-summary">Built-in keyboard handling.</span></summary>

<button class="api-copy" type="button" data-copy-code="keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) =&gt; boolean);" data-pagefind-ignore>Copy</button>

```ts generated
keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) => boolean);
```

<p class="api-member-doc">Built-in keyboard handling. `true` (default) keeps the stock Sheets-style
bindings (navigation, type-to-edit, clipboard, undo/redo, find). `false`
disables ALL of them — the host owns key events and drives `grid.actions`,
selection, editing, and search primitives itself. A function is consulted
first and consumes the event by returning `true`; returning `false` falls
through to the stock bindings.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

<button class="api-copy" type="button" data-copy-code="export interface GridConfig {&#10;  toolbar?: boolean | ToolbarItem[];&#10;  bold?: boolean;&#10;  italic?: boolean;&#10;  align?: boolean;&#10;  textColor?: boolean;&#10;  fillColor?: boolean;&#10;  border?: boolean;&#10;  clearFormat?: boolean;&#10;  merge?: boolean;&#10;  sort?: boolean;&#10;  export?: boolean;&#10;  icons?: Partial&lt;Record&lt;ToolbarActionName, ToolbarIcon&gt;&gt;;&#10;  contextMenu?: boolean | ContextMenuItems;&#10;  undo?: boolean;&#10;  find?: boolean;&#10;  tabs?: boolean;&#10;  keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) =&gt; boolean);&#10;}" data-pagefind-ignore>Copy</button>

```ts generated
export interface GridConfig {
  toolbar?: boolean | ToolbarItem[];
  bold?: boolean;
  italic?: boolean;
  align?: boolean;
  textColor?: boolean;
  fillColor?: boolean;
  border?: boolean;
  clearFormat?: boolean;
  merge?: boolean;
  sort?: boolean;
  export?: boolean;
  icons?: Partial<Record<ToolbarActionName, ToolbarIcon>>;
  contextMenu?: boolean | ContextMenuItems;
  undo?: boolean;
  find?: boolean;
  tabs?: boolean;
  keyboard?: boolean | ((e: KeyboardEvent, grid: Grid) => boolean);
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

<p class="api-consumers-label">Public exports naming <code>GridConfig</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/grid-controller/"><code>GridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell/"><code>SpreadsheetShell</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
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
