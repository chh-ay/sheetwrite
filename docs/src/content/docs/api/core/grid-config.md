---
title: "GridConfig | @sheetwrite/core"
description: "Toolbar / feature configuration."
---
<!-- api-export:@sheetwrite/core|.|GridConfig -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Toolbar / feature configuration. When `config` is set the built-in toolbar is
shown; control flags default to `true` except the opt-in `export` flag.

### Examples

```ts compile
import type { GridConfig } from "@sheetwrite/core";

const config: GridConfig = {
  toolbar: true,
  contextMenu: [{ action: "copy" }, { action: "paste" }],
  keyboard(event, grid) {
    if (event.altKey && event.key === "b") {
      grid.actions.toggleBold();
      return true;
    }
    return false;
  },
};
```

### See also

- [Grid.setConfig](/docs/api/core/grid/#grid-set-config)
- [ContextMenuItem](/docs/api/core/context-menu-item/)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L457"><code>packages/core/src/types/grid.ts#L457</code></a></dd></div>
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
<a href="#grid-config-ribbon"><code>ribbon</code></a>
<a href="#grid-config-icons"><code>icons</code></a>
<a href="#grid-config-context-menu"><code>contextMenu</code></a>
<a href="#grid-config-undo"><code>undo</code></a>
<a href="#grid-config-find"><code>find</code></a>
<a href="#grid-config-tabs"><code>tabs</code></a>
<a href="#grid-config-keyboard"><code>keyboard</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>18</span>

<div class="api-member-list">

<details class="api-member" id="grid-config-toolbar" data-pagefind-weight="1">
<summary><code>toolbar</code> <span class="api-member-summary">Show the built-in toolbar (true), hide it (false), or supply a custom item list.</span></summary>

```ts generated
toolbar?: boolean | ToolbarItem[];
```

</details>

<details class="api-member" id="grid-config-bold" data-pagefind-weight="1">
<summary><code>bold</code> <span class="api-member-summary">Show the bold control in the default toolbar (default true).</span></summary>

```ts generated
bold?: boolean;
```

</details>

<details class="api-member" id="grid-config-italic" data-pagefind-weight="1">
<summary><code>italic</code> <span class="api-member-summary">Show the italic control in the default toolbar (default true).</span></summary>

```ts generated
italic?: boolean;
```

</details>

<details class="api-member" id="grid-config-align" data-pagefind-weight="1">
<summary><code>align</code> <span class="api-member-summary">Show left, center, and right alignment controls (default true).</span></summary>

```ts generated
align?: boolean;
```

</details>

<details class="api-member" id="grid-config-text-color" data-pagefind-weight="1">
<summary><code>textColor</code> <span class="api-member-summary">Show the text-color control in the default toolbar (default true).</span></summary>

```ts generated
textColor?: boolean;
```

</details>

<details class="api-member" id="grid-config-fill-color" data-pagefind-weight="1">
<summary><code>fillColor</code> <span class="api-member-summary">Show the fill-color control in the default toolbar (default true).</span></summary>

```ts generated
fillColor?: boolean;
```

</details>

<details class="api-member" id="grid-config-border" data-pagefind-weight="1">
<summary><code>border</code> <span class="api-member-summary">Show the border control in the default toolbar (default true).</span></summary>

```ts generated
border?: boolean;
```

</details>

<details class="api-member" id="grid-config-clear-format" data-pagefind-weight="1">
<summary><code>clearFormat</code> <span class="api-member-summary">Show the clear-format control in the default toolbar (default true).</span></summary>

```ts generated
clearFormat?: boolean;
```

</details>

<details class="api-member" id="grid-config-merge" data-pagefind-weight="1">
<summary><code>merge</code> <span class="api-member-summary">Show merge and unmerge controls in the default toolbar (default true).</span></summary>

```ts generated
merge?: boolean;
```

</details>

<details class="api-member" id="grid-config-sort" data-pagefind-weight="1">
<summary><code>sort</code> <span class="api-member-summary">Show ascending and descending sort controls in the default toolbar (default true).</span></summary>

```ts generated
sort?: boolean;
```

</details>

<details class="api-member" id="grid-config-export" data-pagefind-weight="1">
<summary><code>export</code> <span class="api-member-summary">Show CSV/XLSX export controls in the default toolbar (default false).</span></summary>

```ts generated
export?: boolean;
```

</details>

<details class="api-member" id="grid-config-ribbon" data-pagefind-weight="1">
<summary><code>ribbon</code> <span class="api-member-summary">Replace the built-in toolbar with an Excel-style ribbon (Home, Insert, Data and View tabs) that narrows its groups as the grid gets narrower.</span></summary>

```ts generated
ribbon?: boolean;
```

<p class="api-member-doc">Replace the built-in toolbar with an Excel-style ribbon (Home, Insert,
Data and View tabs) that narrows its groups as the grid gets narrower.
A custom `toolbar` item list still renders the flat toolbar instead.</p>
</details>

<details class="api-member" id="grid-config-icons" data-pagefind-weight="1">
<summary><code>icons</code> <span class="api-member-summary">Replace built-in command icons by glyph name, in the toolbar, ribbon, ribbon menus and context menu.</span></summary>

```ts generated
icons?: IconOverrides;
```

<p class="api-member-doc">Replace built-in command icons by glyph name, in the toolbar, ribbon, ribbon menus and context menu. See <a href="/docs/api/core/icon-overrides/"><code>IconOverrides</code></a>.</p>
</details>

<details class="api-member" id="grid-config-context-menu" data-pagefind-weight="1">
<summary><code>contextMenu</code> <span class="api-member-summary">Built-in menu, disabled menu, static rows, or a request-aware row factory.</span></summary>

```ts generated
contextMenu?: boolean | ContextMenuItems;
```

</details>

<details class="api-member" id="grid-config-undo" data-pagefind-weight="1">
<summary><code>undo</code> <span class="api-member-summary">Show undo/redo controls in the built-in toolbar (default true).</span></summary>

```ts generated
undo?: boolean;
```

</details>

<details class="api-member" id="grid-config-find" data-pagefind-weight="1">
<summary><code>find</code> <span class="api-member-summary">Built-in Ctrl+F find widget: enabled (true, default) or disabled (false).</span></summary>

```ts generated
find?: boolean;
```

</details>

<details class="api-member" id="grid-config-tabs" data-pagefind-weight="1">
<summary><code>tabs</code> <span class="api-member-summary">Bottom sheet-tab bar for multi-sheet workbooks (default true).</span></summary>

```ts generated
tabs?: boolean;
```

</details>

<details class="api-member" id="grid-config-keyboard" data-pagefind-weight="1">
<summary><code>keyboard</code> <span class="api-member-summary">Built-in keyboard handling.</span></summary>

```ts generated
keyboard?: boolean | KeyboardOptions | ((e: KeyboardEvent, grid: Grid) => boolean);
```

<p class="api-member-doc">Built-in keyboard handling. `true` (default) keeps the stock Sheets-style
bindings. An object replaces individual action bindings; omitted actions
keep their defaults, and `null` disables an action's keys.
For example: `{ bindings: { copy: { key: &quot;c&quot;, mod: true, shift: true } } }`.
Menu hints and toolbar titles use these same bindings. `false` disables
all built-in keys. A function intercepts each keydown before the defaults;
return true to consume it, false to let the built-in handler continue.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
  ribbon?: boolean;
  icons?: IconOverrides;
  contextMenu?: boolean | ContextMenuItems;
  undo?: boolean;
  find?: boolean;
  tabs?: boolean;
  keyboard?:
    boolean | KeyboardOptions | ((e: KeyboardEvent, grid: Grid) => boolean);
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
