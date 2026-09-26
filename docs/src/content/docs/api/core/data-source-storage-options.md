---
title: "DataSourceStorageOptions | @sheetwrite/core"
description: "Dense or allocation-lazy paged storage policy for datasource cells."
---
<!-- api-export:@sheetwrite/core|.|DataSourceStorageOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Dense or allocation-lazy paged storage policy for datasource cells.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/data.ts#L73"><code>packages/core/src/types/data.ts#L73</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="data-source-storage-options-mode" data-pagefind-weight="1">
<summary><code>mode</code> <span class="api-member-alias"><a href="/docs/api/core/snapshot-storage-mode/"><code>SnapshotStorageMode</code></a></span> <span class="api-member-summary">Storage engine. Dense is the default.</span></summary>

```ts generated
mode?: SnapshotStorageMode;
```

</details>

<details class="api-member" id="data-source-storage-options-chunk-rows" data-pagefind-weight="1">
<summary><code>chunkRows</code> <span class="api-member-summary">Paged row chunk size; defaults to 4,096 and is normalized to a power of two.</span></summary>

```ts generated
chunkRows?: number;
```

</details>

<details class="api-member" id="data-source-storage-options-cache-bytes" data-pagefind-weight="1">
<summary><code>cacheBytes</code> <span class="api-member-summary">Per-sheet clean-chunk cache budget; defaults to 32 MiB.</span></summary>

```ts generated
cacheBytes?: number;
```

<p class="api-member-doc">Per-sheet clean-chunk cache budget; defaults to 32 MiB. Sparse local edits are accounted separately; dirty and visible chunks may exceed it.</p>
</details>

<details class="api-member" id="data-source-storage-options-dirty-cell-limit" data-pagefind-weight="1">
<summary><code>dirtyCellLimit</code> <span class="api-member-summary">Maximum sparse local edits retained outside the clean page cache.</span></summary>

```ts generated
dirtyCellLimit?: number;
```

<p class="api-member-doc">Maximum sparse local edits retained outside the clean page cache. Defaults to 1,000,000.</p>
</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface DataSourceStorageOptions {
  mode?: "dense" | "paged";
  chunkRows?: number;
  cacheBytes?: number;
  dirtyCellLimit?: number;
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

<p class="api-consumers-label">Public exports naming <code>DataSourceStorageOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid-options/"><code>GridOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/vue/sheetwrite-grid-props/"><code>SheetwriteGridProps</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
