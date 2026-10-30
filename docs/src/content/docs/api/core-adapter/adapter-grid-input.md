---
title: "AdapterGridInput | @sheetwrite/core/adapter"
description: "AdapterGridInput interface in @sheetwrite/core/adapter: Committed inputs to a framework adapter lifetime."
---
<!-- api-export:@sheetwrite/core|./adapter|AdapterGridInput -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Committed inputs to a framework adapter lifetime.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/adapter.ts#L219"><code>packages/core/src/adapter.ts#L219</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="adapter-grid-input-options" data-pagefind-weight="1">
<summary><code>options</code></summary>

```ts generated
options: GridOptions;
```

</details>

<details class="api-member" id="adapter-grid-input-row-bridge" data-pagefind-weight="1">
<summary><code>rowBridge</code></summary>

```ts generated
rowBridge?: RowBridgeInstance<Id>;
```

</details>

<details class="api-member" id="adapter-grid-input-wasm-source" data-pagefind-weight="1">
<summary><code>wasmSource</code></summary>

```ts generated
wasmSource?: SheetwriteInitializationProps["wasmSource"];
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface AdapterGridInput<Id extends RowBridgeId = RowBridgeId> {
  options: GridOptions;
  rowBridge?: RowBridgeInstance<Id>;
  wasmSource?: SheetwriteInitializationProps["wasmSource"];
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>AdapterGridInput</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/adapter-grid-controller/"><code>AdapterGridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
