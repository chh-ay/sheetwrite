---
title: "PowerQueryLoss | @sheetwrite/core"
description: "PowerQueryLoss interface in @sheetwrite/core: One place where exported M behaves differently from the Sheetwrite engine."
---
<!-- api-export:@sheetwrite/core|.|PowerQueryLoss -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

One place where exported M behaves differently from the Sheetwrite engine.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L141"><code>packages/core/src/types/query.ts#L141</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="power-query-loss-query" data-pagefind-weight="1">
<summary><code>query</code> <span class="api-member-summary">Saved query identity.</span></summary>

```ts generated
readonly query: string;
```

</details>

<details class="api-member" id="power-query-loss-step" data-pagefind-weight="1">
<summary><code>step</code> <span class="api-member-summary">Zero-based step, or null for the source or the query as a whole.</span></summary>

```ts generated
readonly step: number | null;
```

</details>

<details class="api-member" id="power-query-loss-code" data-pagefind-weight="1">
<summary><code>code</code> <span class="api-member-summary">Stable code, such as host-source or outer-join-order.</span></summary>

```ts generated
readonly code: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PowerQueryLoss {
  readonly query: string;
  readonly step: number | null;
  readonly code: string;
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

<p class="api-consumers-label">Public exports naming <code>PowerQueryLoss</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/power-query-export/"><code>PowerQueryExport</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
