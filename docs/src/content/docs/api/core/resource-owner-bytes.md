---
title: "ResourceOwnerBytes | @sheetwrite/core"
description: "Retained logical payload and allocated capacity attributed to one exclusive owner."
---
<!-- api-export:@sheetwrite/core|.|ResourceOwnerBytes -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Retained logical payload and allocated capacity attributed to one exclusive owner.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/store.ts#L21"><code>packages/core/src/types/store.ts#L21</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>5</span>

<div class="api-member-list">

<details class="api-member" id="resource-owner-bytes-owner" data-pagefind-weight="1">
<summary><code>owner</code></summary>

```ts generated
readonly owner: string;
```

</details>

<details class="api-member" id="resource-owner-bytes-logical-bytes" data-pagefind-weight="1">
<summary><code>logicalBytes</code> <span class="api-member-summary">Bytes containing live logical payload.</span></summary>

```ts generated
readonly logicalBytes: number;
```

<p class="api-member-doc">Bytes containing live logical payload. Never includes runtime observations.</p>
</details>

<details class="api-member" id="resource-owner-bytes-allocated-bytes" data-pagefind-weight="1">
<summary><code>allocatedBytes</code> <span class="api-member-summary">Container capacity owned exclusively by this owner.</span></summary>

```ts generated
readonly allocatedBytes: number;
```

</details>

<details class="api-member" id="resource-owner-bytes-entries" data-pagefind-weight="1">
<summary><code>entries</code></summary>

```ts generated
readonly entries: number;
```

</details>

<details class="api-member" id="resource-owner-bytes-measurement" data-pagefind-weight="1">
<summary><code>measurement</code></summary>

```ts generated
readonly measurement: | "exact-capacity" | "hash-capacity-v1" | "typed-array-byte-length" | "utf16-upper-bound" | "entry-count-only";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface ResourceOwnerBytes {
  readonly owner: string;
  readonly logicalBytes: number;
  readonly allocatedBytes: number;
  readonly entries: number;
  readonly measurement:
    | "exact-capacity"
    | "hash-capacity-v1"
    | "typed-array-byte-length"
    | "utf16-upper-bound"
    | "entry-count-only";
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

<p class="api-consumers-label">Public exports naming <code>ResourceOwnerBytes</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/create-runtime-resource-snapshot/"><code>createRuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/runtime-resource-snapshot/"><code>RuntimeResourceSnapshot</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store-memory-breakdown/"><code>StoreMemoryBreakdown</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
