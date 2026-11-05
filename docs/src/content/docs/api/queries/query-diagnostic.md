---
title: "QueryDiagnostic | @sheetwrite/queries"
description: "QueryDiagnostic interface in @sheetwrite/queries: A stable failure code and optional coordinates, without source values or credentials."
---
<!-- api-export:@sheetwrite/queries|.|QueryDiagnostic -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

A stable failure code and optional coordinates, without source values or credentials.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L24"><code>packages/queries/src/types.ts#L24</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="query-diagnostic-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
readonly code: string;
```

</details>

<details class="api-member" id="query-diagnostic-step" data-pagefind-weight="1">
<summary><code>step</code></summary>

```ts generated
readonly step: number | null;
```

</details>

<details class="api-member" id="query-diagnostic-column" data-pagefind-weight="1">
<summary><code>column</code></summary>

```ts generated
readonly column: string | null;
```

</details>

<details class="api-member" id="query-diagnostic-row" data-pagefind-weight="1">
<summary><code>row</code></summary>

```ts generated
readonly row: number | null;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryDiagnostic {
  readonly code: string;
  readonly step: number | null;
  readonly column: string | null;
  readonly row: number | null;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryDiagnostic</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-definition-result/"><code>QueryDefinitionResult</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
<li><a href="/docs/api/queries/query-error/"><code>QueryError</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
<li><a href="/docs/api/queries/query-refresh-result/"><code>QueryRefreshResult</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
