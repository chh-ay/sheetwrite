---
title: "SavedQuery | @sheetwrite/core"
description: "SavedQuery interface in @sheetwrite/core: One saved, refreshable query."
---
<!-- api-export:@sheetwrite/core|.|SavedQuery -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One saved, refreshable query. Definitions never contain host credentials.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L129"><code>packages/core/src/types/query.ts#L129</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="saved-query-id" data-pagefind-weight="1">
<summary><code>id</code> <span class="api-member-summary">Stable identity, unique in the workbook.</span></summary>

```ts generated
readonly id: string;
```

</details>

<details class="api-member" id="saved-query-name" data-pagefind-weight="1">
<summary><code>name</code> <span class="api-member-summary">Display name, unique in the workbook when ASCII letter case is ignored.</span></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="saved-query-source" data-pagefind-weight="1">
<summary><code>source</code></summary>

```ts generated
readonly source: SavedQuerySource;
```

</details>

<details class="api-member" id="saved-query-steps" data-pagefind-weight="1">
<summary><code>steps</code></summary>

```ts generated
readonly steps: readonly QueryStep[];
```

</details>

<details class="api-member" id="saved-query-output" data-pagefind-weight="1">
<summary><code>output</code> <span class="api-member-summary">Absent for a query that only feeds other queries.</span></summary>

```ts generated
readonly output?: SavedQueryOutput;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SavedQuery {
  readonly id: string;
  readonly name: string;
  readonly source: SavedQuerySource;
  readonly steps: readonly QueryStep[];
  readonly output?: SavedQueryOutput;
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

<p class="api-consumers-label">Public exports naming <code>SavedQuery</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/document-op/"><code>DocumentOp</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook/"><code>Workbook</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/workbook-snapshot/"><code>WorkbookSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/query-session/"><code>QuerySession</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
