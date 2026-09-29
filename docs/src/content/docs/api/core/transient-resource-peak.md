---
title: "TransientResourcePeak | @sheetwrite/core"
description: "Operation-scoped transient peak, excluded from retained owner totals."
---
<!-- api-export:@sheetwrite/core|.|TransientResourcePeak -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Operation-scoped transient peak, excluded from retained owner totals.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/resource-accounting.ts#L91"><code>packages/core/src/resource-accounting.ts#L91</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="transient-resource-peak-owner" data-pagefind-weight="1">
<summary><code>owner</code></summary>

```ts generated
readonly owner: string;
```

</details>

<details class="api-member" id="transient-resource-peak-peak-bytes" data-pagefind-weight="1">
<summary><code>peakBytes</code></summary>

```ts generated
readonly peakBytes: number;
```

</details>

<details class="api-member" id="transient-resource-peak-allocations" data-pagefind-weight="1">
<summary><code>allocations</code></summary>

```ts generated
readonly allocations: number;
```

</details>

<details class="api-member" id="transient-resource-peak-measurement" data-pagefind-weight="1">
<summary><code>measurement</code></summary>

```ts generated
readonly measurement: "instrumented-operation-peak";
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface TransientResourcePeak {
  readonly owner: string;
  readonly peakBytes: number;
  readonly allocations: number;
  readonly measurement: "instrumented-operation-peak";
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

<p class="api-consumers-label">Public exports naming <code>TransientResourcePeak</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
