---
title: "QueryFetchRequest | @sheetwrite/queries"
description: "QueryFetchRequest interface in @sheetwrite/queries: What the host must load for one saved query."
---
<!-- api-export:@sheetwrite/queries|.|QueryFetchRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

What the host must load for one saved query. It never carries credentials.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/session.ts#L30"><code>packages/queries/src/session.ts#L30</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="query-fetch-request-query-id" data-pagefind-weight="1">
<summary><code>queryId</code></summary>

```ts generated
readonly queryId: string;
```

</details>

<details class="api-member" id="query-fetch-request-source-id" data-pagefind-weight="1">
<summary><code>sourceId</code> <span class="api-member-summary">Host-defined source identity; the host maps it to its own credentials and policy.</span></summary>

```ts generated
readonly sourceId: string;
```

</details>

<details class="api-member" id="query-fetch-request-kind" data-pagefind-weight="1">
<summary><code>kind</code></summary>

```ts generated
readonly kind: SavedQuerySource["kind"];
```

</details>

<details class="api-member" id="query-fetch-request-locator" data-pagefind-weight="1">
<summary><code>locator</code> <span class="api-member-summary">Public, credential-free locator from the saved definition, if any.</span></summary>

```ts generated
readonly locator?: string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryFetchRequest {
  readonly queryId: string;
  readonly sourceId: string;
  readonly kind: SavedQuerySource["kind"];
  readonly locator?: string;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryFetchRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/query-fetch-source/"><code>QueryFetchSource</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
