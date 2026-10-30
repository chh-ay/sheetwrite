---
title: "AdapterGridController | @sheetwrite/core/adapter"
description: "Owns adapter attachment and monotonically numbered Grid generations."
---
<!-- api-export:@sheetwrite/core|./adapter|AdapterGridController -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-adapter/">@sheetwrite/core/adapter</a><span class="api-status" data-kind="interface">interface</span></div>

Owns adapter attachment and monotonically numbered Grid generations.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/adapter.ts#L239"><code>packages/core/src/adapter.ts#L239</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="adapter-grid-controller-mount" data-pagefind-weight="1">
<summary><code>mount</code></summary>

```ts generated
mount(host: HTMLElement, input: AdapterGridInput<Id>): void;
```

</details>

<details class="api-member" id="adapter-grid-controller-update" data-pagefind-weight="1">
<summary><code>update</code></summary>

```ts generated
update(input: AdapterGridInput<Id>): void;
```

</details>

<details class="api-member" id="adapter-grid-controller-unmount" data-pagefind-weight="1">
<summary><code>unmount</code> <span class="api-member-summary">Idempotent; a later mount preserves generation numbering.</span></summary>

```ts generated
unmount(): void;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface AdapterGridController<Id extends RowBridgeId = RowBridgeId> {
  mount(host: HTMLElement, input: AdapterGridInput<Id>): void;
  update(input: AdapterGridInput<Id>): void;
  unmount(): void;
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

<p class="api-consumers-label">Public exports naming <code>AdapterGridController</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/create-adapter-grid-controller/"><code>createAdapterGridController</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
