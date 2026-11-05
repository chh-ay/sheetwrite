---
title: "GridReadyEvent | @sheetwrite/vue"
description: "GridReadyEvent interface in @sheetwrite/vue: Source summary unavailable; docs:check rejects this omission."
---
<!-- api-export:@sheetwrite/vue|.|GridReadyEvent -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/vue/">@sheetwrite/vue</a><span class="api-status" data-kind="interface">interface</span></div>

Source summary unavailable; docs:check rejects this omission.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/dist/adapter.d.ts#L30"><code>packages/core/dist/adapter.d.ts#L30</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>3</span>

<div class="api-member-list">

<details class="api-member" id="grid-ready-event-grid" data-pagefind-weight="1">
<summary><code>grid</code></summary>

```ts generated
grid: Grid;
```

</details>

<details class="api-member" id="grid-ready-event-generation" data-pagefind-weight="1">
<summary><code>generation</code></summary>

```ts generated
generation: number;
```

</details>

<details class="api-member" id="grid-ready-event-reason" data-pagefind-weight="1">
<summary><code>reason</code></summary>

```ts generated
reason: GridReadyReason;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface GridReadyEvent {
  grid: Grid;
  generation: number;
  reason: GridReadyReason;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/vue</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>GridReadyEvent</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-adapter/grid-adapter-event-handlers/"><code>GridAdapterEventHandlers</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/svelte/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-emits/"><code>SheetwriteGridEmits</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
