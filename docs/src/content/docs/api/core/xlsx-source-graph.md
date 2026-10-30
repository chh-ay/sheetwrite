---
title: "XlsxSourceGraph | @sheetwrite/core"
description: "XlsxSourceGraph interface in @sheetwrite/core: One relationship from the package, workbook, or a sheet to a retained part graph."
---
<!-- api-export:@sheetwrite/core|.|XlsxSourceGraph -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One relationship from the package, workbook, or a sheet to a retained part graph.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/document.ts#L425"><code>packages/core/src/types/document.ts#L425</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#xlsx-source-graph-owner"><code>owner</code></a>
<a href="#xlsx-source-graph-sheet-id"><code>sheetId</code></a>
<a href="#xlsx-source-graph-type"><code>type</code></a>
<a href="#xlsx-source-graph-target"><code>target</code></a>
<a href="#xlsx-source-graph-cache-id"><code>cacheId</code></a>
<a href="#xlsx-source-graph-parts"><code>parts</code></a>
<a href="#xlsx-source-graph-dependencies"><code>dependencies</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>7</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-source-graph-owner" data-pagefind-weight="1">
<summary><code>owner</code></summary>

```ts generated
readonly owner: "root" | "workbook" | "sheet";
```

</details>

<details class="api-member" id="xlsx-source-graph-sheet-id" data-pagefind-weight="1">
<summary><code>sheetId</code></summary>

```ts generated
readonly sheetId?: SheetId;
```

</details>

<details class="api-member" id="xlsx-source-graph-type" data-pagefind-weight="1">
<summary><code>type</code> <span class="api-member-summary">OPC relationship type URI.</span></summary>

```ts generated
readonly type: string;
```

</details>

<details class="api-member" id="xlsx-source-graph-target" data-pagefind-weight="1">
<summary><code>target</code> <span class="api-member-summary">Relationship target part.</span></summary>

```ts generated
readonly target: string;
```

</details>

<details class="api-member" id="xlsx-source-graph-cache-id" data-pagefind-weight="1">
<summary><code>cacheId</code> <span class="api-member-summary">Pivot cache id written into &lt;pivotCaches&gt;.</span></summary>

```ts generated
readonly cacheId?: string;
```

</details>

<details class="api-member" id="xlsx-source-graph-parts" data-pagefind-weight="1">
<summary><code>parts</code> <span class="api-member-summary">Every retained part reached from target, including .rels parts.</span></summary>

```ts generated
readonly parts: readonly string[];
```

</details>

<details class="api-member" id="xlsx-source-graph-dependencies" data-pagefind-weight="1">
<summary><code>dependencies</code></summary>

```ts generated
readonly dependencies: readonly XlsxSourceDependency[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxSourceGraph {
  readonly owner: "root" | "workbook" | "sheet";
  readonly sheetId?: SheetId;
  readonly type: string;
  readonly target: string;
  readonly cacheId?: string;
  readonly parts: readonly string[];
  readonly dependencies: readonly XlsxSourceDependency[];
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

<p class="api-consumers-label">Public exports naming <code>XlsxSourceGraph</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-source-snapshot/"><code>XlsxSourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
