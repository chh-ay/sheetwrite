---
title: "XlsxSourceDependency | @sheetwrite/core"
description: "What an opaque graph reads; any change to it drops the graph on save."
---
<!-- api-export:@sheetwrite/core|.|XlsxSourceDependency -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

What an opaque graph reads; any change to it drops the graph on save.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L399"><code>packages/core/src/types/document.ts#L399</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-source-dependency-sheet-id" data-pagefind-weight="1">
<summary><code>sheetId</code></summary>

```ts generated
readonly sheetId: SheetId;
```

</details>

<details class="api-member" id="xlsx-source-dependency-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Sheet name at import; OOXML formulas inside the graph refer to sheets by name.</span></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="xlsx-source-dependency-scope" data-pagefind-weight="1">
<summary><code>scope</code> <span class="api-member-summary">layout graphs (images) only follow row/column structure; values graphs (charts, pivots) read cells.</span></summary>

```ts generated
readonly scope: "layout" | "values";
```

</details>

<details class="api-member" id="xlsx-source-dependency-digest" data-pagefind-weight="1">
<summary><code>digest</code> <span class="api-member-summary">64-bit hex fingerprint of the sheet at import, for snapshots edited outside a Store.</span></summary>

```ts generated
readonly digest: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxSourceDependency {
  readonly sheetId: SheetId;
  readonly name: string;
  readonly scope: "layout" | "values";
  readonly digest: string;
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

<p class="api-consumers-label">Public exports naming <code>XlsxSourceDependency</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-source-graph/"><code>XlsxSourceGraph</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
