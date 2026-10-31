---
title: "RibbonConfig | @sheetwrite/core"
description: "RibbonConfig interface in @sheetwrite/core: Initial layout settings for the built-in or composable ribbon."
---
<!-- api-export:@sheetwrite/core|.|RibbonConfig -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Initial layout settings for the built-in or composable ribbon.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/grid.ts#L344"><code>packages/core/src/types/grid.ts#L344</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="ribbon-config-mode" data-pagefind-weight="1">
<summary><code>mode</code> <span class="api-member-summary">Initial layout (default full).</span></summary>

```ts generated
mode?: RibbonMode;
```

<p class="api-member-doc">Initial layout (default `full`). The ribbon's layout button changes it at run time.</p>
</details>

<details class="api-member" id="ribbon-config-compact-width" data-pagefind-weight="1">
<summary><code>compactWidth</code> <span class="api-member-summary">Width in CSS pixels below which auto uses compact (default 768).</span></summary>

```ts generated
compactWidth?: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RibbonConfig {
  mode?: RibbonMode;
  compactWidth?: number;
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

<p class="api-consumers-label">Public exports naming <code>RibbonConfig</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-config/"><code>GridConfig</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-shell/spreadsheet-shell-options/"><code>SpreadsheetShellOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
