---
title: "QuerySource | @sheetwrite/queries"
description: "QuerySource type in @sheetwrite/queries: Host-owned UTF-8 bytes are parsed against an explicit schema, without type guessing."
---
<!-- api-export:@sheetwrite/queries|.|QuerySource -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="type">type</span></div>

Host-owned UTF-8 bytes are parsed against an explicit schema, without type guessing.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/types.ts#L32"><code>packages/queries/src/types.ts#L32</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly format: "json";
  readonly columns: readonly QueryColumnSpec[];
  readonly path?: readonly string[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly format: "csv";
  readonly columns: readonly QueryColumnSpec[];
  readonly delimiter?: number;
  readonly headers?: boolean;
  readonly emptyIsNull?: boolean;
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type QuerySource =
  | {
      readonly format: "json";
      readonly columns: readonly QueryColumnSpec[];
      readonly path?: readonly string[];
    }
  | {
      readonly format: "csv";
      readonly columns: readonly QueryColumnSpec[];
      readonly delimiter?: number;
      readonly headers?: boolean;
      readonly emptyIsNull?: boolean;
    };
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QuerySource</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-engine/"><code>QueryEngine</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
