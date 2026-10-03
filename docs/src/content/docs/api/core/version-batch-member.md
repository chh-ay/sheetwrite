---
title: "VersionBatchMember | @sheetwrite/core"
description: "Position of one server version inside an atomic multi-version batch."
---
<!-- api-export:@sheetwrite/core|.|VersionBatchMember -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Position of one server version inside an atomic multi-version batch.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/types/transaction.ts#L104"><code>packages/core/src/types/transaction.ts#L104</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>2</span>

<div class="api-member-list">

<details class="api-member" id="version-batch-member-index" data-pagefind-weight="1">
<summary><code>index</code> <span class="api-member-summary">Zero-based position of this version in the batch.</span></summary>

```ts generated
index: number;
```

</details>

<details class="api-member" id="version-batch-member-count" data-pagefind-weight="1">
<summary><code>count</code> <span class="api-member-summary">Number of consecutive versions in the batch; at least 2.</span></summary>

```ts generated
count: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface VersionBatchMember {
  index: number;
  count: number;
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

<p class="api-consumers-label">Public exports naming <code>VersionBatchMember</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/versioned-operation/"><code>VersionedOperation</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
