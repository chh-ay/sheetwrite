---
title: "XlsxUnsupportedQuery | @sheetwrite/core"
description: "XlsxUnsupportedQuery interface in @sheetwrite/core: A kept Power Query member and why the query engine cannot run it."
---
<!-- api-export:@sheetwrite/core|.|XlsxUnsupportedQuery -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A kept Power Query member and why the query engine cannot run it.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/document.ts#L495"><code>packages/core/src/types/document.ts#L495</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="xlsx-unsupported-query-member" data-pagefind-weight="1">
<summary><code>member</code> <span class="api-member-summary">Section member name, at most 1,024 characters.</span></summary>

```ts generated
readonly member: string;
```

</details>

<details class="api-member" id="xlsx-unsupported-query-reason" data-pagefind-weight="1">
<summary><code>reason</code> <span class="api-member-summary">The codec's reason code, at most 64 characters.</span></summary>

```ts generated
readonly reason: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface XlsxUnsupportedQuery {
  readonly member: string;
  readonly reason: string;
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
<li><code>@sheetwrite/queries</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>XlsxUnsupportedQuery</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-source-graph/"><code>XlsxSourceGraph</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
