---
title: "RibbonOptions | @sheetwrite/core/shell"
description: "RibbonOptions interface in @sheetwrite/core/shell: Options for createRibbon."
---
<!-- api-export:@sheetwrite/core|./shell|RibbonOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-shell/">@sheetwrite/core/shell</a><span class="api-status" data-kind="interface">interface</span></div>

Options for [`createRibbon`](/docs/api/core-shell/create-ribbon/).

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/shell/ribbon-factory.ts#L9"><code>packages/core/src/shell/ribbon-factory.ts#L9</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="ribbon-options-focus-grid" data-pagefind-weight="1">
<summary><code>focusGrid</code> <span class="api-member-summary">Return keyboard focus to the grid after a pick or Escape (default: focus host).</span></summary>

```ts generated
focusGrid?: () => void;
```

</details>

<details class="api-member" id="ribbon-options-on-height-change" data-pagefind-weight="1">
<summary><code>onHeightChange</code> <span class="api-member-summary">Called with the new height after the ribbon is minimized or expanded.</span></summary>

```ts generated
onHeightChange?: (height: number) => void;
```

</details>

<details class="api-member" id="ribbon-options-icons" data-pagefind-weight="1">
<summary><code>icons</code> <span class="api-member-summary">Replace built-in icons by glyph name, as GridConfig.icons.</span></summary>

```ts generated
icons?: IconOverrides;
```

</details>

<details class="api-member" id="ribbon-options-flags" data-pagefind-weight="1">
<summary><code>flags</code> <span class="api-member-summary">GridConfig switches that choose commands (default: all but Export).</span></summary>

```ts generated
flags?: CommandFlags;
```

</details>

<details class="api-member" id="ribbon-options-mode" data-pagefind-weight="1">
<summary><code>mode</code> <span class="api-member-summary">Initial layout (default full).</span></summary>

```ts generated
mode?: RibbonMode;
```

<p class="api-member-doc">Initial layout (default `full`). The ribbon's layout button changes it at run time.</p>
</details>

<details class="api-member" id="ribbon-options-compact-width" data-pagefind-weight="1">
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
export interface RibbonOptions {
  focusGrid?: () => void;
  onHeightChange?: (height: number) => void;
  icons?: IconOverrides;
  flags?: CommandFlags;
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

<p class="api-consumers-label">Public exports naming <code>RibbonOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-shell/create-ribbon/"><code>createRibbon</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
