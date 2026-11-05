---
title: "PowerQueryCodecOptions | @sheetwrite/queries"
description: "PowerQueryCodecOptions interface in @sheetwrite/queries: Hosts can provide the compiled codec artifact, @sheetwrite/queries/power-query-wasm."
---
<!-- api-export:@sheetwrite/queries|.|PowerQueryCodecOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/queries/">@sheetwrite/queries</a><span class="api-status" data-kind="interface">interface</span></div>

Hosts can provide the compiled codec artifact, `@sheetwrite/queries/power-query-wasm`.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/queries/src/index.ts#L40"><code>packages/queries/src/index.ts#L40</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="power-query-codec-options-wasm" data-pagefind-weight="1">
<summary><code>wasm</code> <span class="api-member-summary">Compiled module or artifact bytes, as accepted by the generated bindings.</span></summary>

```ts generated
readonly wasm?: PowerQuerySyncInitInput;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PowerQueryCodecOptions {
  readonly wasm?: PowerQuerySyncInitInput;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/queries</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>PowerQueryCodecOptions</code></p>

<ul class="api-consumer-list">
<li>None.</li>
</ul>
</div>
