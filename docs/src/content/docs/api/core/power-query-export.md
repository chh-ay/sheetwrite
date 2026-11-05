---
title: "PowerQueryExport | @sheetwrite/core"
description: "PowerQueryExport interface in @sheetwrite/core: A Section1.m document and the member name each query was written under."
---
<!-- api-export:@sheetwrite/core|.|PowerQueryExport -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

A `Section1.m` document and the member name each query was written under.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L151"><code>packages/core/src/types/query.ts#L151</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="power-query-export-section" data-pagefind-weight="1">
<summary><code>section</code></summary>

```ts generated
readonly section: string;
```

</details>

<details class="api-member" id="power-query-export-members" data-pagefind-weight="1">
<summary><code>members</code> <span class="api-member-summary">Section member name for each query, in the order the queries were given.</span></summary>

```ts generated
readonly members: readonly string[];
```

</details>

<details class="api-member" id="power-query-export-losses" data-pagefind-weight="1">
<summary><code>losses</code></summary>

```ts generated
readonly losses: readonly PowerQueryLoss[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PowerQueryExport {
  readonly section: string;
  readonly members: readonly string[];
  readonly losses: readonly PowerQueryLoss[];
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

<p class="api-consumers-label">Public exports naming <code>PowerQueryExport</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/power-query-codec/"><code>PowerQueryCodec</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
