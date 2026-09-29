---
title: "PendingCommitLoadOptions | @sheetwrite/core"
description: "Mandatory bounds for one durable pending-commit restore."
---
<!-- api-export:@sheetwrite/core|.|PendingCommitLoadOptions -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Mandatory bounds for one durable pending-commit restore.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/sync.ts#L30"><code>packages/core/src/sync.ts#L30</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="pending-commit-load-options-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal?: AbortSignal;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-records" data-pagefind-weight="1">
<summary><code>maxRecords</code> <span class="api-member-summary">Maximum records returned for one document queue.</span></summary>

```ts generated
maxRecords: number;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-operations" data-pagefind-weight="1">
<summary><code>maxOperations</code> <span class="api-member-summary">Maximum aggregate operation count returned for one document queue.</span></summary>

```ts generated
maxOperations: number;
```

</details>

<details class="api-member" id="pending-commit-load-options-max-bytes" data-pagefind-weight="1">
<summary><code>maxBytes</code> <span class="api-member-summary">Maximum aggregate UTF-8 bytes of the JSON-encoded operation arrays.</span></summary>

```ts generated
maxBytes: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface PendingCommitLoadOptions {
  signal?: AbortSignal;
  maxRecords: number;
  maxOperations: number;
  maxBytes: number;
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

<p class="api-consumers-label">Public exports naming <code>PendingCommitLoadOptions</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/pending-commit-storage/"><code>PendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-browser/indexed-db-pending-commit-storage/"><code>IndexedDbPendingCommitStorage</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
