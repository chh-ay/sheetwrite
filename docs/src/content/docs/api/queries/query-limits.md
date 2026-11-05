---
title: "QueryLimits | @sheetwrite/queries"
description: "QueryLimits interface in @sheetwrite/queries: Per-execution ceilings; expanding operations reject output before allocation."
---
<!-- api-export:@sheetwrite/queries|.|QueryLimits -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Per-execution ceilings; expanding operations reject output before allocation.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L12"><code>packages/queries/src/types.ts#L12</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="query-limits-max-rows" data-pagefind-weight="1">
<summary><code>maxRows</code></summary>

```ts generated
readonly maxRows: number;
```

</details>

<details class="api-member" id="query-limits-max-cells" data-pagefind-weight="1">
<summary><code>maxCells</code></summary>

```ts generated
readonly maxCells: number;
```

</details>

<details class="api-member" id="query-limits-max-source-bytes" data-pagefind-weight="1">
<summary><code>maxSourceBytes</code></summary>

```ts generated
readonly maxSourceBytes: number;
```

</details>

<details class="api-member" id="query-limits-max-output-bytes" data-pagefind-weight="1">
<summary><code>maxOutputBytes</code> <span class="api-member-summary">Conservative cell payload budget across all columns, checked before each append.</span></summary>

```ts generated
readonly maxOutputBytes: number;
```

</details>

<details class="api-member" id="query-limits-max-steps" data-pagefind-weight="1">
<summary><code>maxSteps</code></summary>

```ts generated
readonly maxSteps: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryLimits {
  readonly maxRows: number;
  readonly maxCells: number;
  readonly maxSourceBytes: number;
  readonly maxOutputBytes: number;
  readonly maxSteps: number;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryLimits</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-engine/"><code>QueryEngine</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
