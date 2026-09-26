---
title: "PagedStoreStats | @sheetwrite/core"
description: "Allocation and load statistics for one paged datasource sheet."
---
<!-- api-export:@sheetwrite/core|.|PagedStoreStats -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Allocation and load statistics for one paged datasource sheet.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/store.ts#L120"><code>packages/core/src/types/store.ts#L120</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="paged-store-stats-chunks" data-pagefind-weight="1">
<summary><code>chunks</code></summary>

```ts generated
chunks: number;
```

</details>

<details class="api-member" id="paged-store-stats-loaded-cells" data-pagefind-weight="1">
<summary><code>loadedCells</code></summary>

```ts generated
loadedCells: number;
```

</details>

<details class="api-member" id="paged-store-stats-dirty-cells" data-pagefind-weight="1">
<summary><code>dirtyCells</code></summary>

```ts generated
dirtyCells: number;
```

</details>

<details class="api-member" id="paged-store-stats-allocated-bytes" data-pagefind-weight="1">
<summary><code>allocatedBytes</code></summary>

```ts generated
allocatedBytes: number;
```

</details>

<details class="api-member" id="paged-store-stats-dirty-allocated-bytes" data-pagefind-weight="1">
<summary><code>dirtyAllocatedBytes</code> <span class="api-member-summary">Sparse local-edit overlay bytes, excluded from the clean chunk cache budget.</span></summary>

```ts generated
dirtyAllocatedBytes: number;
```

</details>

<details class="api-member" id="paged-store-stats-fully-loaded" data-pagefind-weight="1">
<summary><code>fullyLoaded</code></summary>

```ts generated
fullyLoaded: boolean;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PagedStoreStats {
  chunks: number;
  loadedCells: number;
  dirtyCells: number;
  allocatedBytes: number;
  dirtyAllocatedBytes: number;
  fullyLoaded: boolean;
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

<p class="api-consumers-label">Public exports naming <code>PagedStoreStats</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
