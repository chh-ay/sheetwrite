---
title: "ApplyTransactionResult | @sheetwrite/core"
description: "Outcome of applying a document transaction, including conflict, rejection, and no-op states."
---
<!-- api-export:@sheetwrite/core|.|ApplyTransactionResult -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="type">type</span></div>

Outcome of applying a document transaction, including conflict, rejection, and no-op states.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L35"><code>packages/core/src/types/transaction.ts#L35</code></a></dd></div>
</dl>

## Variants <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-variant-list" data-pagefind-ignore>
<div class="api-variant">

```ts generated
{
  status: "applied";
  epoch: number;
  transaction: Transaction;
  warnings?: MutationIssue[];
  rejections?: MutationIssue[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "conflict";
  expectedEpoch: number;
  actualEpoch: number;
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "rejected";
  epoch: number;
  issues: MutationIssue[];
}
```

</div>
<div class="api-variant">

```ts generated
{
  status: "noop";
  epoch: number;
  reason: "empty" | "out-of-bounds" | "incomplete-data" | "read-only";
}
```

</div>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export type ApplyTransactionResult =
  | {
      status: "applied";
      epoch: number;
      transaction: Transaction;
      warnings?: MutationIssue[];
      rejections?: MutationIssue[];
    }
  | {
      status: "conflict";
      expectedEpoch: number;
      actualEpoch: number;
    }
  | {
      status: "rejected";
      epoch: number;
      issues: MutationIssue[];
    }
  | {
      status: "noop";
      epoch: number;
      reason: "empty" | "out-of-bounds" | "incomplete-data" | "read-only";
    };
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

<p class="api-consumers-label">Public exports naming <code>ApplyTransactionResult</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheet-lifecycle-result/"><code>SheetLifecycleResult</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/sheetwrite-store/"><code>SheetwriteStore</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core/store/"><code>Store</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/react/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/react</span></li>
<li><a href="/docs/api/svelte/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/svelte</span></li>
<li><a href="/docs/api/vue/grid/"><code>Grid</code></a><span class="api-consumer-kind">@sheetwrite/vue</span></li>
</ul>
</div>
