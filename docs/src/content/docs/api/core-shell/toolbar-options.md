---
title: "ToolbarOptions | @sheetwrite/core/shell"
description: "ToolbarOptions interface in @sheetwrite/core/shell: Host element and configuration used to create the built-in toolbar."
---
<!-- api-export:@sheetwrite/core|./shell|ToolbarOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Host element and configuration used to create the built-in toolbar.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/shell/toolbar-factory.ts#L9"><code>packages/core/src/shell/toolbar-factory.ts#L9</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="toolbar-options-items" data-pagefind-weight="1">
<summary><code>items</code> <span class="api-member-summary">Items to render; defaults to every command flags shows, in ribbon order.</span></summary>

```ts generated
items?: readonly ToolbarItem[];
```

</details>

<details class="api-member" id="toolbar-options-flags" data-pagefind-weight="1">
<summary><code>flags</code> <span class="api-member-summary">GridConfig switches that choose the default commands (default: all, with Export).</span></summary>

```ts generated
flags?: CommandFlags;
```

</details>

<details class="api-member" id="toolbar-options-icons" data-pagefind-weight="1">
<summary><code>icons</code> <span class="api-member-summary">Per-glyph icon overrides, exactly like GridConfig.icons.</span></summary>

```ts generated
icons?: IconOverrides;
```

</details>

<details class="api-member" id="toolbar-options-label" data-pagefind-weight="1">
<summary><code>label</code> <span class="api-member-summary">Accessible toolbar label (default &quot;Spreadsheet formatting&quot;).</span></summary>

```ts generated
label?: string;
```

</details>

<details class="api-member" id="toolbar-options-focus-grid" data-pagefind-weight="1">
<summary><code>focusGrid</code> <span class="api-member-summary">Return keyboard focus to the grid after a pick or Escape (default: focus host).</span></summary>

```ts generated
focusGrid?: () => void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ToolbarOptions {
  items?: readonly ToolbarItem[];
  flags?: CommandFlags;
  icons?: IconOverrides;
  label?: string;
  focusGrid?: () => void;
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

<p class="api-consumers-label">Public exports naming <code>ToolbarOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-shell/create-toolbar/"><code>createToolbar</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
