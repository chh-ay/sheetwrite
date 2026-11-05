---
title: "SavedQuerySource | @sheetwrite/core"
description: "SavedQuerySource type in @sheetwrite/core: Where a saved query reads its data."
---
<!-- api-export:@sheetwrite/core|.|SavedQuerySource -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Where a saved query reads its data. The host's fetch callback resolves
`sourceId` to bytes or batches and applies any credentials itself. A
`locator` is a public, credential-free address such as an `https` URL;
it never holds tokens, signed parameters or passwords.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/types/query.ts#L87"><code>packages/core/src/types/query.ts#L87</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  readonly kind: "csv";
  readonly sourceId: string;
  readonly locator?: string;
  readonly columns: readonly QueryColumnSpec[];
  readonly delimiter?: number;
  readonly headers?: boolean;
  readonly emptyIsNull?: boolean;
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "json";
  readonly sourceId: string;
  readonly locator?: string;
  readonly columns: readonly QueryColumnSpec[];
  readonly path?: readonly string[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  readonly kind: "host";
  readonly sourceId: string;
  readonly columns: readonly QueryColumnSpec[];
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type SavedQuerySource =
  | {
      readonly kind: "csv";
      readonly sourceId: string;
      readonly locator?: string;
      readonly columns: readonly QueryColumnSpec[];
      readonly delimiter?: number;
      readonly headers?: boolean;
      readonly emptyIsNull?: boolean;
    }
  | {
      readonly kind: "json";
      readonly sourceId: string;
      readonly locator?: string;
      readonly columns: readonly QueryColumnSpec[];
      readonly path?: readonly string[];
    }
  | {
      readonly kind: "host";
      readonly sourceId: string;
      readonly columns: readonly QueryColumnSpec[];
    };
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

<p class="api-consumers-label">Public exports naming <code>SavedQuerySource</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/saved-query/"><code>SavedQuery</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/queries/query-fetch-request/"><code>QueryFetchRequest</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
