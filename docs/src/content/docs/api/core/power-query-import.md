---
title: "PowerQueryImport | @sheetwrite/core"
description: "PowerQueryImport interface in @sheetwrite/core: Queries read from M, without outputs; the XLSX reader binds them to tables."
---
<!-- api-export:@sheetwrite/core|.|PowerQueryImport -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Queries read from M, without outputs; the XLSX reader binds them to tables.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L170"><code>packages/core/src/types/query.ts#L170</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="power-query-import-queries" data-pagefind-weight="1">
<summary><code>queries</code></summary>

```ts generated
readonly queries: readonly SavedQuery[];
```

</details>

<details class="api-member" id="power-query-import-unsupported" data-pagefind-weight="1">
<summary><code>unsupported</code></summary>

```ts generated
readonly unsupported: readonly PowerQueryUnsupported[];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PowerQueryImport {
  readonly queries: readonly SavedQuery[];
  readonly unsupported: readonly PowerQueryUnsupported[];
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

<p class="api-consumers-label">Public exports naming <code>PowerQueryImport</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/power-query-codec/"><code>PowerQueryCodec</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
