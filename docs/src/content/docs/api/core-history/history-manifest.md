---
title: "HistoryManifest | @sheetwrite/core/history"
description: "HistoryManifest interface in @sheetwrite/core/history: Archive state, read without fetching any payload."
---
<!-- api-export:@sheetwrite/core|./history|HistoryManifest -->
<div class="api-pagehead"><a class="api-backlink" href="/docs/api/core-history/">@sheetwrite/core/history</a><span class="api-status" data-kind="interface">interface</span></div>

Archive state, read without fetching any payload.

<dl class="api-metadata" data-pagefind-ignore>
<div><dt>Source</dt><dd><a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/version-history/types.ts#L111"><code>packages/core/src/version-history/types.ts#L111</code></a></dd></div>
</dl>

## Members <span class="api-count" data-pagefind-ignore>6</span>

<div class="api-member-list">

<details class="api-member" id="history-manifest-generation" data-pagefind-weight="1">
<summary><code>generation</code> <span class="api-member-summary">Increases on each publication or prune; writers compare it to detect a concurrent writer.</span></summary>

```ts generated
generation: number;
```

</details>

<details class="api-member" id="history-manifest-head" data-pagefind-weight="1">
<summary><code>head</code></summary>

```ts generated
head?: HistoryHead;
```

</details>

<details class="api-member" id="history-manifest-encoded-bytes" data-pagefind-weight="1">
<summary><code>encodedBytes</code></summary>

```ts generated
encodedBytes: number;
```

</details>

<details class="api-member" id="history-manifest-record-count" data-pagefind-weight="1">
<summary><code>recordCount</code></summary>

```ts generated
recordCount: number;
```

</details>

<details class="api-member" id="history-manifest-version-count" data-pagefind-weight="1">
<summary><code>versionCount</code></summary>

```ts generated
versionCount: number;
```

</details>

<details class="api-member" id="history-manifest-named-version-count" data-pagefind-weight="1">
<summary><code>namedVersionCount</code></summary>

```ts generated
namedVersionCount: number;
```

</details>
</div>

## Declaration

<details class="api-declaration" data-pagefind-ignore>
<summary>View full TypeScript declaration</summary>

```ts generated
export interface HistoryManifest {
  generation: number;
  head?: HistoryHead;
  encodedBytes: number;
  recordCount: number;
  versionCount: number;
  namedVersionCount: number;
}
```

</details>

## Referenced by

<div class="api-consumers" data-pagefind-ignore>
<p class="api-consumers-label">Workspace packages depending on <code>@sheetwrite/core</code></p>

<ul class="api-consumer-list">
<li><code>@sheetwrite/bench</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/charts</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/docs-start</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/react</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/svelte</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/vue</code><span class="api-consumer-kind">dependency</span></li>
<li><code>@sheetwrite/xlsx</code><span class="api-consumer-kind">dependency</span></li>
</ul>

<p class="api-consumers-label">Public exports naming <code>HistoryManifest</code></p>

<ul class="api-consumer-list">
<li><a href="/docs/api/core-history/history-archive/"><code>HistoryArchive</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
<li><a href="/docs/api/core-history/history-storage-adapter/"><code>HistoryStorageAdapter</code></a><span class="api-consumer-kind">@sheetwrite/core</span></li>
</ul>
</div>
