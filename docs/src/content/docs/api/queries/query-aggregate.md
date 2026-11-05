---
title: "QueryAggregate | @sheetwrite/queries"
description: "QueryAggregate interface in @sheetwrite/queries: Source summary unavailable; docs:check rejects this omission."
---
<!-- api-export:@sheetwrite/queries|.|QueryAggregate -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Source summary unavailable; docs:check rejects this omission.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/dist/types/query.d.ts#L29"><code>packages/core/dist/types/query.d.ts#L29</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="query-aggregate-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
readonly id: string;
```

</details>

<details class="api-member" id="query-aggregate-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="query-aggregate-op" data-pagefind-weight="1">
<summary><code>op</code></summary>

```ts generated
readonly op: "countRows" | "count" | "sum" | "average" | "min" | "max";
```

</details>

<details class="api-member" id="query-aggregate-column" data-pagefind-weight="1">
<summary><code>column</code></summary>

```ts generated
readonly column?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryAggregate {
  readonly id: string;
  readonly name: string;
  readonly op: "countRows" | "count" | "sum" | "average" | "min" | "max";
  readonly column?: string;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryAggregate</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/query-step/"><code>QueryStep</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
