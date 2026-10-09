---
title: "SyncVersionGapRequest | @sheetwrite/core"
description: "Contiguous-version recovery request produced when remote input skips ahead."
---
<!-- api-export:@sheetwrite/core|.|SyncVersionGapRequest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core/">@sheetwrite/core</a><span class="api-status" data-kind="interface">interface</span></div>

Contiguous-version recovery request produced when remote input skips ahead.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/main/packages/core/src/sync.ts#L104"><code>packages/core/src/sync.ts#L104</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>4</span>

<div class="api-member-list">

<details class="api-member" id="sync-version-gap-request-document-id" data-pagefind-weight="1">
<summary><code>documentId</code></summary>

```ts generated
documentId: string;
```

</details>

<details class="api-member" id="sync-version-gap-request-expected-version" data-pagefind-weight="1">
<summary><code>expectedVersion</code></summary>

```ts generated
expectedVersion: number;
```

</details>

<details class="api-member" id="sync-version-gap-request-received-version" data-pagefind-weight="1">
<summary><code>receivedVersion</code></summary>

```ts generated
receivedVersion: number;
```

</details>

<details class="api-member" id="sync-version-gap-request-signal" data-pagefind-weight="1">
<summary><code>signal</code></summary>

```ts generated
signal: AbortSignal;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface SyncVersionGapRequest {
  documentId: string;
  expectedVersion: number;
  receivedVersion: number;
  signal: AbortSignal;
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

<p class="api-consumers-label">Public exports naming <code>SyncVersionGapRequest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core/sync-coordinator-options/"><code>SyncCoordinatorOptions</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
