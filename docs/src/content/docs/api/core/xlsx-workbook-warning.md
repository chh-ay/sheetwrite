---
title: "XlsxWorkbookWarning | @sheetwrite/core"
description: "Structured fidelity warning emitted during XLSX conversion."
---
<!-- api-export:@sheetwrite/core|.|XlsxWorkbookWarning -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Structured fidelity warning emitted during XLSX conversion.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/export.ts#L412"><code>packages/core/src/export.ts#L412</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-workbook-warning-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: | "boolean-literal" | "rich-text" | "hyperlink" | "unsupported-cell-value" | "unsupported-feature" | "external-relationship" | "external-formula" | "format-loss" | "validation-loss" | "invalid-metadata";
```

</details>

<details class="api-member" id="xlsx-workbook-warning-message" data-pagefind-weight="1">
<summary><code>message</code></summary>

```ts generated
message: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-sheet" data-pagefind-weight="1">
<summary><code>sheet</code></summary>

```ts generated
sheet?: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-cell" data-pagefind-weight="1">
<summary><code>cell</code></summary>

```ts generated
cell?: string;
```

</details>

<details class="api-member" id="xlsx-workbook-warning-part" data-pagefind-weight="1">
<summary><code>part</code></summary>

```ts generated
part?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxWorkbookWarning {
  code:
    | "boolean-literal"
    | "rich-text"
    | "hyperlink"
    | "unsupported-cell-value"
    | "unsupported-feature"
    | "external-relationship"
    | "external-formula"
    | "format-loss"
    | "validation-loss"
    | "invalid-metadata";
  message: string;
  sheet?: string;
  cell?: string;
  part?: string;
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

<p class="api-consumers-label">Public exports naming <code>XlsxWorkbookWarning</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-workbook-options/"><code>XlsxWorkbookOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
