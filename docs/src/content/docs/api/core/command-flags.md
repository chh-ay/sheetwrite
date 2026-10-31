---
title: "CommandFlags | @sheetwrite/core"
description: "CommandFlags type in @sheetwrite/core: The GridConfig switches that choose built-in commands."
---
<!-- api-export:@sheetwrite/core|.|CommandFlags -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

The `GridConfig` switches that choose built-in commands. They apply to every
renderer of the command model: the toolbar, the full ribbon and the compact
ribbon. Each defaults to true, except `export`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/grid.ts#L353"><code>packages/core/src/types/grid.ts#L353</code></a></dd></div>
</dl>

## Declaration

<div class="api-declaration-open" data-pagefind-ignore>

```ts generated
export type CommandFlags = Pick<
  GridConfig,
  | "undo"
  | "bold"
  | "italic"
  | "align"
  | "textColor"
  | "fillColor"
  | "border"
  | "clearFormat"
  | "merge"
  | "sort"
  | "export"
>;
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

<p class="api-consumers-label">Public exports naming <code>CommandFlags</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-shell/ribbon-options/"><code>RibbonOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/toolbar-options/"><code>ToolbarOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
