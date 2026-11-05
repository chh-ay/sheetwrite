---
title: "QueryColumnSpec | @sheetwrite/queries"
description: "QueryColumnSpec interface in @sheetwrite/queries: Stable identity is separate from the field name used by source records."
---
<!-- api-export:@sheetwrite/queries|.|QueryColumnSpec -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Stable identity is separate from the field name used by source records.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L5"><code>packages/queries/src/types.ts#L5</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="query-column-spec-id" data-pagefind-weight="1">
<summary><code>id</code></summary>

```ts generated
readonly id: string;
```

</details>

<details class="api-member" id="query-column-spec-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
readonly name: string;
```

</details>

<details class="api-member" id="query-column-spec-type" data-pagefind-weight="1">
<summary><code>type</code></summary>

```ts generated
readonly type: QueryColumnType;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryColumnSpec {
  readonly id: string;
  readonly name: string;
  readonly type: QueryColumnType;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryColumnSpec</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-source/"><code>QuerySource</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
