---
title: "ContextMenuItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback row in the right-click menu."
---
<!-- api-export:@sheetwrite/core|.|ContextMenuItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Built-in, separator, or custom callback row in the right-click menu.

### Examples

```ts compile
import type { ContextMenuItem, GridConfig } from "@sheetwrite/core";

const total: ContextMenuItem = {
  id: "total",
  label: "Show total",
  onClick(grid) { window.alert(String(grid.aggregate(0, "sum"))); },
};
const config: GridConfig = { contextMenu: [total, { action: "separator" }, { action: "copy" }] };
```

### See also

- [ContextMenuItems](/docs/api/core/context-menu-items/)
- [GridConfig.contextMenu](/docs/api/core/grid-config/#grid-config-context-menu)

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L402"><code>packages/core/src/types/grid.ts#L402</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#context-menu-item-id"><code>id</code></a>
<a href="#context-menu-item-action"><code>action</code></a>
<a href="#context-menu-item-on-click"><code>onClick</code></a>
<a href="#context-menu-item-label"><code>label</code></a>
<a href="#context-menu-item-shortcut"><code>shortcut</code></a>
<a href="#context-menu-item-visible"><code>visible</code></a>
<a href="#context-menu-item-disabled"><code>disabled</code></a>
<a href="#context-menu-item-icon"><code>icon</code></a>
<a href="#context-menu-item-items"><code>items</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="context-menu-item-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable host identifier, exposed as data-context-menu-item.</span></summary>

```ts generated
id?: string;
```

</details>

<details class="api-member" id="context-menu-item-action" data-pagefind-weight="1">
<summary><code>action</code> <span class="api-member-summary">Built-in action to bind (or &quot;separator&quot;).</span></summary>

```ts generated
action?: ContextMenuActionName;
```

<p class="api-member-doc">Built-in action to bind (or &quot;separator&quot;). Omit when supplying `onClick`.</p>
</details>

<details class="api-member" id="context-menu-item-on-click" data-pagefind-weight="1">
<summary><code>onClick</code> <span class="api-member-summary">Custom click handler; receives the grid and the right-clicked cell (null if none).</span></summary>

```ts generated
onClick?: (grid: Grid, cell: CellAddress | null) => void;
```

</details>

<details class="api-member" id="context-menu-item-label" data-pagefind-weight="1">
<summary><code>label</code> <span class="api-member-summary">Menu row text. Defaults per action.</span></summary>

```ts generated
label?: string;
```

</details>

<details class="api-member" id="context-menu-item-shortcut" data-pagefind-weight="1">
<summary><code>shortcut</code> <span class="api-member-summary">A bound action name or a custom key combination.</span></summary>

```ts generated
shortcut?: KeyboardAction | KeyShortcut;
```

<p class="api-member-doc">A bound action name or a custom key combination. An explicit combination
registers `onClick` as a keyboard command; action names only reference the
existing built-in binding. Both forms display platform-aware labels.
For example, `shortcut: &quot;copy&quot;` follows the configured Copy binding, while
`shortcut: &quot;Mod+Shift+K&quot;` binds this item's `onClick` callback.
See <a href="/docs/api/core/keyboard-options/"><code>KeyboardOptions</code></a> for built-in action overrides.</p>
</details>

<details class="api-member" id="context-menu-item-visible" data-pagefind-weight="1">
<summary><code>visible</code> <span class="api-member-summary">Static or request-aware visibility.</span></summary>

```ts generated
visible?: boolean | ((context: ContextMenuContext) => boolean);
```

<p class="api-member-doc">Static or request-aware visibility. Hidden separators are normalized.</p>
</details>

<details class="api-member" id="context-menu-item-disabled" data-pagefind-weight="1">
<summary><code>disabled</code> <span class="api-member-summary">Static or context-aware disabled state.</span></summary>

```ts generated
disabled?: boolean | ((context: ContextMenuContext) => boolean);
```

</details>

<details class="api-member" id="context-menu-item-icon" data-pagefind-weight="1">
<summary><code>icon</code> <span class="api-member-summary">Glyph shown before the label.</span></summary>

```ts generated
icon?: IconName;
```

<p class="api-member-doc">Glyph shown before the label. Built-in actions have one by default; `config.icons` overrides apply.</p>
</details>

<details class="api-member" id="context-menu-item-items" data-pagefind-weight="1">
<summary><code>items</code> <span class="api-member-summary">Rows of a submenu. The row opens it on click, hover or the Right Arrow key and runs nothing itself.</span></summary>

```ts generated
items?: readonly ContextMenuItem[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ContextMenuItem {
  id?: string;
  action?: ContextMenuActionName;
  onClick?: (grid: Grid, cell: CellAddress | null) => void;
  label?: string;
  shortcut?: KeyboardAction | KeyShortcut;
  visible?: boolean | ((context: ContextMenuContext) => boolean);
  disabled?: boolean | ((context: ContextMenuContext) => boolean);
  icon?: IconName;
  items?: readonly ContextMenuItem[];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
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
