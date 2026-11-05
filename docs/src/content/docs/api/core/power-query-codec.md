---
title: "PowerQueryCodec | @sheetwrite/core"
description: "PowerQueryCodec interface in @sheetwrite/core: Translates saved queries to and from Power Query M."
---
<!-- api-export:@sheetwrite/core|.|PowerQueryCodec -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Translates saved queries to and from Power Query M. Import reads text only:
it never evaluates M or fetches a source. `@sheetwrite/queries` provides one.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L179"><code>packages/core/src/types/query.ts#L179</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="power-query-codec-encode" data-pagefind-weight="1">
<summary><code>encode</code></summary>

```ts generated
encode(queries: readonly SavedQuery[]): PowerQueryExport;
```

</details>

<details class="api-member" id="power-query-codec-decode" data-pagefind-weight="1">
<summary><code>decode</code> <span class="api-member-summary">Throws when the text is not a section Section1; document.</span></summary>

```ts generated
decode(section: string): PowerQueryImport;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PowerQueryCodec {
  encode(queries: readonly SavedQuery[]): PowerQueryExport;
  decode(section: string): PowerQueryImport;
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

<p class="api-consumers-label">Public exports naming <code>PowerQueryCodec</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/xlsx-workbook-options/"><code>XlsxWorkbookOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/load-power-query-codec/"><code>loadPowerQueryCodec</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
