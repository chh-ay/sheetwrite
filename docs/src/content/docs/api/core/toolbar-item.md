---
title: "ToolbarItem | @sheetwrite/core"
description: "Built-in, separator, or custom callback item in the grid toolbar."
---
<!-- api-export:@sheetwrite/core|.|ToolbarItem -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Built-in, separator, or custom callback item in the grid toolbar.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L202"><code>packages/core/src/types/grid.ts#L202</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="toolbar-item-action" data-pagefind-weight="1">
<summary><code>action</code> <span class="api-member-summary">Built-in action to bind (or &quot;separator&quot;).</span></summary>

```ts generated
action?: ToolbarActionName;
```

<p class="api-member-doc">Built-in action to bind (or &quot;separator&quot;). Omit when supplying `onClick`.</p>
</details>

<details class="api-member" id="toolbar-item-on-click" data-pagefind-weight="1">
<summary><code>onClick</code> <span class="api-member-summary">Custom click handler; receives the grid handle.</span></summary>

```ts generated
onClick?: (grid: Grid) => void;
```

<p class="api-member-doc">Custom click handler; receives the grid handle. Overrides `action`.</p>
</details>

<details class="api-member" id="toolbar-item-icon" data-pagefind-weight="1">
<summary><code>icon</code> <span class="api-member-summary">Button icon/content. Strings render as plain text; pass a DOM Node or a factory returning one for SVG/HTML icons without using innerHTML.</span></summary>

```ts generated
icon?: ToolbarIcon;
```

</details>

<details class="api-member" id="toolbar-item-title" data-pagefind-weight="1">
<summary><code>title</code> <span class="api-member-summary">Accessible tooltip.</span></summary>

```ts generated
title?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

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
