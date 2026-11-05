---
title: "QueryError | @sheetwrite/queries"
description: "QueryError class in @sheetwrite/queries: Fatal source or plan failure; cell-level errors stay in the returned column lanes."
---
<!-- api-export:@sheetwrite/queries|.|QueryError -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="class">class</span></div>

Fatal source or plan failure; cell-level errors stay in the returned column lanes.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/errors.ts#L8"><code>packages/queries/src/errors.ts#L8</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="query-error-constructor" data-pagefind-weight="1">
<summary><code>constructor</code></summary>

```ts generated
constructor(diagnostic: QueryDiagnostic);
```

</details>

<details class="api-member" id="query-error-code" data-pagefind-weight="1">
<summary><code>code</code></summary>

```ts generated
code: "invalid-argument" | "resource-limit";
```

</details>

<details class="api-member" id="query-error-diagnostic" data-pagefind-weight="1">
<summary><code>diagnostic</code></summary>

```ts generated
diagnostic: QueryDiagnostic;
```

</details>

<details class="api-member" id="query-error-name" data-pagefind-weight="1">
<summary><code>name</code></summary>

```ts generated
name: "QueryError"
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
class QueryError extends SheetwriteError {
  constructor(diagnostic: QueryDiagnostic);
  code: "invalid-argument" | "resource-limit";
  diagnostic: QueryDiagnostic;
  name: "QueryError";
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryError</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
