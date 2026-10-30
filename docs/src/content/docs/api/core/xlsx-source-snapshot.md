---
title: "XlsxSourceSnapshot | @sheetwrite/core"
description: "Bounded, frozen record of the OOXML parts Sheetwrite does not model."
---
<!-- api-export:@sheetwrite/core|.|XlsxSourceSnapshot -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Bounded, frozen record of the OOXML parts Sheetwrite does not model.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L421"><code>packages/core/src/types/document.ts#L421</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-source-snapshot-parts" data-pagefind-weight="1">
<summary><code>parts</code></summary>

```ts generated
readonly parts: readonly XlsxSourcePart[];
```

</details>

<details class="api-member" id="xlsx-source-snapshot-graphs" data-pagefind-weight="1">
<summary><code>graphs</code></summary>

```ts generated
readonly graphs: readonly XlsxSourceGraph[];
```

</details>

<details class="api-member" id="xlsx-source-snapshot-dropped" data-pagefind-weight="1">
<summary><code>dropped</code> <span class="api-member-summary">Targets of graphs dropped by committed edits; undo does not restore them.</span></summary>

```ts generated
readonly dropped?: readonly string[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxSourceSnapshot {
  readonly parts: readonly XlsxSourcePart[];
  readonly graphs: readonly XlsxSourceGraph[];
  readonly dropped?: readonly string[];
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

<p class="api-consumers-label">Public exports naming <code>XlsxSourceSnapshot</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/workbook/"><code>Workbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-snapshot/"><code>WorkbookSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
