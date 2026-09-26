---
title: "RowBridgeColumn | @sheetwrite/core"
description: "Semantic column key accepted by the row bridge."
---
<!-- api-export:@sheetwrite/core|.|RowBridgeColumn -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Semantic column key accepted by the row bridge.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/row-bridge.ts#L10"><code>packages/core/src/row-bridge.ts#L10</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>1</span>

<div class="api-member-list">

<details class="api-member" id="row-bridge-column-key" data-pagefind-weight="1">
<summary><code>key</code></summary>

```ts generated
readonly key: keyof Row & string;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface RowBridgeColumn<Row extends Record<string, CellScalar>> {
  readonly key: keyof Row & string;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>RowBridgeColumn</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/row-bridge-options/"><code>RowBridgeOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-adapter/row-bridge-options/"><code>RowBridgeOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
