---
title: "QueryEngineOptions | @sheetwrite/queries"
description: "QueryEngineOptions interface in @sheetwrite/queries: Hosts can provide the compiled artifact instead of using browser artifact loading."
---
<!-- api-export:@sheetwrite/queries|.|QueryEngineOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Hosts can provide the compiled artifact instead of using browser artifact loading.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/index.ts#L46"><code>packages/queries/src/index.ts#L46</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="query-engine-options-wasm" data-pagefind-weight="1">
<summary><code>wasm</code> <span class="api-member-summary">Compiled module or artifact bytes, as accepted by the generated bindings.</span></summary>

```ts generated
readonly wasm?: SyncInitInput;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface QueryEngineOptions {
  readonly wasm?: SyncInitInput;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>QueryEngineOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/queries/create-query-session/"><code>createQuerySession</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
<li><a href="/docs/api/queries/load-power-query-codec/"><code>loadPowerQueryCodec</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
<li><a href="/docs/api/queries/load-query-engine/"><code>loadQueryEngine</code></a><span class="api-consumer-kind">@sheetwrite/queries</span></li>
</ul>
</div>
