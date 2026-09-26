---
title: "CellHyperlink | @sheetwrite/core"
description: "Bounded serializable hyperlink metadata applied to one cell or range."
---
<!-- api-export:@sheetwrite/core|.|CellHyperlink -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Bounded serializable hyperlink metadata applied to one cell or range.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/cell.ts#L56"><code>packages/core/src/types/cell.ts#L56</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="cell-hyperlink-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable identity used by operations, history, and collaboration rebase.</span></summary>

```ts generated
id: string;
```

</details>

<details class="api-member" id="cell-hyperlink-range" data-pagefind-weight="1">
<summary><code>range</code></summary>

```ts generated
range: Range;
```

</details>

<details class="api-member" id="cell-hyperlink-target" data-pagefind-weight="1">
<summary><code>target</code></summary>

```ts generated
target: HyperlinkTarget;
```

</details>

<details class="api-member" id="cell-hyperlink-display" data-pagefind-weight="1">
<summary><code>display</code> <span class="api-member-summary">Optional accessible/OOXML display label; cell values remain authoritative.</span></summary>

```ts generated
display?: string;
```

</details>

<details class="api-member" id="cell-hyperlink-style" data-pagefind-weight="1">
<summary><code>style</code> <span class="api-member-summary">Optional override merged over the deterministic blue/underline link style.</span></summary>

```ts generated
style?: CellStyle;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface CellHyperlink {
  id: string;
  range: Range;
  target: HyperlinkTarget;
  display?: string;
  style?: CellStyle;
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

<p class="api-consumers-label">Public exports naming <code>CellHyperlink</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/hyperlink-at/"><code>hyperlinkAt</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/is-valid-cell-hyperlink/"><code>isValidCellHyperlink</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sanitize-cell-hyperlink/"><code>sanitizeCellHyperlink</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet/"><code>Sheet</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-snapshot/"><code>SheetSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
