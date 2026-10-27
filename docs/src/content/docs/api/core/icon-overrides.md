---
title: "IconOverrides | @sheetwrite/core"
description: "Per-glyph icon overrides, keyed by the names on the command icon sheet (ICONNAMES)."
---
<!-- api-export:@sheetwrite/core|.|IconOverrides -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Per-glyph icon overrides, keyed by the names on the command icon sheet
(`ICON_NAMES`). One override applies wherever the glyph shows: the flat
toolbar, the ribbon and ribbon menus, and the context menu. Strings render
as plain text; DOM nodes and node factories support SVG or HTML icons. To
replace every glyph at once, set the `--sheetwrite-icon-sheet` CSS property
to a sheet drawn on the layout in `@sheetwrite/core/icons.json`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L295"><code>packages/core/src/types/grid.ts#L295</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type IconOverrides = Partial<Record<IconName, ToolbarIcon>>;
```

</div>

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

<p class="api-consumers-label">Public exports naming <code>IconOverrides</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-config/"><code>GridConfig</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/ribbon-options/"><code>RibbonOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/toolbar-options/"><code>ToolbarOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
