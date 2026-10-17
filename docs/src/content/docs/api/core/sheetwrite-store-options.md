---
title: "SheetwriteStoreOptions | @sheetwrite/core"
description: "Storage layout plus snapshot and transaction resource ceilings for one store."
---
<!-- api-export:@sheetwrite/core|.|SheetwriteStoreOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Storage layout plus snapshot and transaction resource ceilings for one store.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/store.ts#L71"><code>packages/core/src/store.ts#L71</code></a></dd></div>
</dl>

<nav class="api-member-index" aria-label="Member index" data-pagefind-ignore>
<a href="#sheetwrite-store-options-snapshot-resource-limits"><code>snapshotResourceLimits</code></a>
<a href="#sheetwrite-store-options-transaction-resource-limits"><code>transactionResourceLimits</code></a>
<a href="#sheetwrite-store-options-storage"><code>storage</code></a>
<a href="#sheetwrite-store-options-chunk-rows"><code>chunkRows</code></a>
<a href="#sheetwrite-store-options-cache-bytes"><code>cacheBytes</code></a>
<a href="#sheetwrite-store-options-dirty-cell-limit"><code>dirtyCellLimit</code></a>
<a href="#sheetwrite-store-options-reference-simulation-limit"><code>referenceSimulationLimit</code></a>
<a href="#sheetwrite-store-options-protection-resolver"><code>protectionResolver</code></a>
<a href="#sheetwrite-store-options-mutation-policy"><code>mutationPolicy</code></a>
</nav>

## Members <span class="api-count" data-pagefind-ignore>9</span>

<div class="api-member-list">

<details class="api-member" id="sheetwrite-store-options-snapshot-resource-limits" data-pagefind-weight="1">
<summary><code>snapshotResourceLimits</code> <span class="api-member-summary">Overrides canonical snapshot/workbook allocation ceilings before construction.</span></summary>

```ts generated
snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
```

</details>

<details class="api-member" id="sheetwrite-store-options-transaction-resource-limits" data-pagefind-weight="1">
<summary><code>transactionResourceLimits</code> <span class="api-member-summary">Overrides inclusive operation-count and encoded-byte ceilings for every transaction.</span></summary>

```ts generated
transactionResourceLimits?: Partial<TransactionResourceLimits>;
```

</details>

<details class="api-member" id="sheetwrite-store-options-storage" data-pagefind-weight="1">
<summary><code>storage</code> <span class="api-member-alias"><a href="/docs/api/core/snapshot-storage-mode/"><code>SnapshotStorageMode</code></a></span> <span class="api-member-summary">Storage engine; defaults to eager dense allocation.</span></summary>

```ts generated
storage?: SnapshotStorageMode;
```

</details>

<details class="api-member" id="sheetwrite-store-options-chunk-rows" data-pagefind-weight="1">
<summary><code>chunkRows</code> <span class="api-member-summary">Paged row chunk size; defaults to 4,096 and is normalized to a power of two.</span></summary>

```ts generated
chunkRows?: number;
```

</details>

<details class="api-member" id="sheetwrite-store-options-cache-bytes" data-pagefind-weight="1">
<summary><code>cacheBytes</code> <span class="api-member-summary">Per-sheet clean-chunk budget; defaults to 32 MiB.</span></summary>

```ts generated
cacheBytes?: number;
```

<p class="api-member-doc">Per-sheet clean-chunk budget; defaults to 32 MiB. Dirty and pinned chunks may exceed it.</p>
</details>

<details class="api-member" id="sheetwrite-store-options-dirty-cell-limit" data-pagefind-weight="1">
<summary><code>dirtyCellLimit</code> <span class="api-member-summary">Maximum sparse local edits retained outside the clean page cache.</span></summary>

```ts generated
dirtyCellLimit?: number;
```

<p class="api-member-doc">Maximum sparse local edits retained outside the clean page cache. Defaults to 1,000,000 cells; further edits reject atomically.</p>
</details>

<details class="api-member" id="sheetwrite-store-options-reference-simulation-limit" data-pagefind-weight="1">
<summary><code>referenceSimulationLimit</code> <span class="api-member-summary">Maximum clean references retained for exact multi-operation remove-sheet simulation.</span></summary>

```ts generated
referenceSimulationLimit?: number;
```

</details>

<details class="api-member" id="sheetwrite-store-options-protection-resolver" data-pagefind-weight="1">
<summary><code>protectionResolver</code></summary>

```ts generated
protectionResolver?: ProtectionResolver;
```

</details>

<details class="api-member" id="sheetwrite-store-options-mutation-policy" data-pagefind-weight="1">
<summary><code>mutationPolicy</code></summary>

```ts generated
mutationPolicy?: MutationPolicyMode;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SheetwriteStoreOptions {
  snapshotResourceLimits?: Partial<SnapshotResourceLimits>;
  transactionResourceLimits?: Partial<TransactionResourceLimits>;
  storage?: "dense" | "paged";
  chunkRows?: number;
  cacheBytes?: number;
  dirtyCellLimit?: number;
  referenceSimulationLimit?: number;
  protectionResolver?: ProtectionResolver;
  mutationPolicy?: MutationPolicyMode;
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

<p class="api-consumers-label">Public exports naming <code>SheetwriteStoreOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
