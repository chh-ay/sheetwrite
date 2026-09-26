---
title: "LegacyRowPage | @sheetwrite/core"
description: "Row-only page shape accepted by the full-width compatibility adapter."
---
<!-- api-export:@sheetwrite/core|.|LegacyRowPage -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Row-only page shape accepted by the full-width compatibility adapter.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/legacy-full-width-datasource.ts#L4"><code>packages/core/src/legacy-full-width-datasource.ts#L4</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="legacy-row-page-start" data-pagefind-weight="1">
<summary><code>start</code></summary>

```ts generated
readonly start: number;
```

</details>

<details class="api-member" id="legacy-row-page-rows" data-pagefind-weight="1">
<summary><code>rows</code></summary>

```ts generated
readonly rows: readonly RowData[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface LegacyRowPage {
  readonly start: number;
  readonly rows: readonly RowData[];
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

<p class="api-consumers-label">Public exports naming <code>LegacyRowPage</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/legacy-row-loader/"><code>LegacyRowLoader</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
